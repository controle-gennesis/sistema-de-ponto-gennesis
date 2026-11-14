'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Seleção de células numéricas da tabela da aba Orçamento, com o resumo (soma, média e quantidade) num balão,
 * como na memória de cálculo:
 *  - clique seleciona a célula;
 *  - arrastar seleciona um bloco;
 *  - Shift+clique vai da última célula clicada até a nova;
 *  - Ctrl/⌘+clique soma outra região à seleção.
 * Funciona direto no HTML da tabela (colunas marcadas com `data-orc-col`), sem mexer na renderização das linhas.
 */

type TipoColuna = 'moeda' | 'numero' | 'pct';
const COLUNAS_NUMERICAS: Record<string, TipoColuna> = {
  qtd: 'numero',
  mo: 'moeda',
  mat: 'moeda',
  pu: 'moeda',
  puBdi: 'moeda',
  subMo: 'moeda',
  subMat: 'moeda',
  total: 'moeda',
  totalDesc: 'moeda',
  totalBdi: 'moeda',
  peso: 'pct',
};

type Faixa = { linhaA: HTMLTableRowElement; linhaB: HTMLTableRowElement; colA: string; colB: string };

const COR = '#dc2626';

/** "R$ 1.234,50", "− 12,00", "12,5%" ou "1.000" → número; texto sem número → null. */
function lerNumero(bruto: string): number | null {
  let t = bruto.replace(/R\$|%|\s| /g, '').replace(/[−–—]/g, '-');
  if (!t || t === '-') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function valorDaCelula(td: HTMLTableCellElement): number | null {
  const campo = td.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
  return lerNumero(campo ? campo.value : (td.textContent ?? ''));
}

const fmt = (v: number, min = 2, max = 4) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

function formatarResumo(v: number, tipos: Set<TipoColuna>): string {
  if (tipos.size === 1) {
    const t = [...tipos][0]!;
    if (t === 'moeda') return `R$ ${fmt(v, 2, 2)}`;
    if (t === 'pct') return `${fmt(v, 2, 2)}%`;
  }
  return fmt(v, 2, 4);
}

export function OrcamentoSelecaoSoma({ rootRef }: { rootRef: React.RefObject<HTMLElement | null> }) {
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const faixasRef = useRef<Faixa[]>([]);
  faixasRef.current = faixas;
  const ancoraRef = useRef<{ linha: HTMLTableRowElement; col: string } | null>(null);
  const arrastandoRef = useRef(false);
  /** Camada com os contornos vermelhos (dentro da área que rola, para acompanhar as células). */
  const camadaRef = useRef<HTMLDivElement | null>(null);
  const [resumo, setResumo] = useState<{ soma: number; media: number; qtd: number; tipos: Set<TipoColuna> } | null>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  const colunasVisiveis = useCallback((root: HTMLElement): string[] => {
    const out: string[] = [];
    root.querySelectorAll('thead th[data-orc-col]').forEach((th) => {
      const el = th as HTMLElement;
      if (el.getBoundingClientRect().width < 1) return;
      out.push(el.dataset.orcCol ?? '');
    });
    return out;
  }, []);

  /** Células (já existentes na tela) cobertas pelas faixas, com a posição de cada uma dentro do seu bloco. */
  const celulasDasFaixas = useCallback(
    (root: HTMLElement) => {
      const linhas = Array.from(root.querySelectorAll('tbody > tr')) as HTMLTableRowElement[];
      const cols = colunasVisiveis(root);
      const out: Array<{ td: HTMLTableCellElement; col: string; faixa: number }> = [];
      faixasRef.current.forEach((f, fi) => {
        const ia = linhas.indexOf(f.linhaA);
        const ib = linhas.indexOf(f.linhaB);
        const ca = cols.indexOf(f.colA);
        const cb = cols.indexOf(f.colB);
        if (ia < 0 || ib < 0 || ca < 0 || cb < 0) return;
        const [l1, l2] = ia <= ib ? [ia, ib] : [ib, ia];
        const [c1, c2] = ca <= cb ? [ca, cb] : [cb, ca];
        for (let li = l1; li <= l2; li++) {
          for (let ci = c1; ci <= c2; ci++) {
            const col = cols[ci]!;
            if (!(col in COLUNAS_NUMERICAS)) continue;
            const td = linhas[li]!.querySelector(`:scope > td[data-orc-col="${col}"]`) as HTMLTableCellElement | null;
            if (!td) continue;
            out.push({ td, col, faixa: fi });
          }
        }
      });
      return out;
    },
    [colunasVisiveis],
  );

  /** Desenha o contorno da seleção e recalcula o resumo e a posição do balão. */
  const atualizar = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const cels = celulasDasFaixas(root);

    // Contorno: uma caixa por faixa, desenhada por cima das linhas da tabela (as divisórias das células não a cortam).
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    let camada = camadaRef.current;
    if (!camada || !camada.isConnected) {
      camada = document.createElement('div');
      camada.setAttribute('data-orc-soma-camada', '');
      camada.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:6;';
      root.appendChild(camada);
      camadaRef.current = camada;
    }
    const rootRect = root.getBoundingClientRect();
    const caixas = new Map<number, { l: number; t: number; r: number; b: number }>();
    for (const { td, faixa } of cels) {
      const r = td.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cx = caixas.get(faixa) ?? { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
      cx.l = Math.min(cx.l, r.left);
      cx.t = Math.min(cx.t, r.top);
      cx.r = Math.max(cx.r, r.right);
      cx.b = Math.max(cx.b, r.bottom);
      caixas.set(faixa, cx);
    }
    const lista = [...caixas.values()];
    while (camada.children.length > lista.length) camada.lastElementChild?.remove();
    while (camada.children.length < lista.length) {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;box-sizing:border-box;border:2px solid ${COR};`;
      camada.appendChild(el);
    }
    lista.forEach((cx, i) => {
      const el = camada!.children[i] as HTMLElement;
      // Alinha aos pixels do dispositivo (bordas fracionárias deixavam a lateral direita 1px para dentro).
      const dpr = window.devicePixelRatio || 1;
      const px = (n: number) => Math.round(n * dpr) / dpr;
      const left = px(cx.l - rootRect.left - root.clientLeft + root.scrollLeft);
      const top = px(cx.t - rootRect.top - root.clientTop + root.scrollTop);
      const w = px(cx.r - rootRect.left - root.clientLeft + root.scrollLeft) - left;
      const h = px(cx.b - rootRect.top - root.clientTop + root.scrollTop) - top;
      if (el.style.left !== `${left}px`) el.style.left = `${left}px`;
      if (el.style.top !== `${top}px`) el.style.top = `${top}px`;
      if (el.style.width !== `${w}px`) el.style.width = `${w}px`;
      if (el.style.height !== `${h}px`) el.style.height = `${h}px`;
    });

    // Resumo: soma, média e quantidade de células com número (sem repetir células de faixas que se cruzam).
    let soma = 0;
    let qtd = 0;
    const tipos = new Set<TipoColuna>();
    let direita = -Infinity;
    let baixo = -Infinity;
    const vistos = new Set<HTMLElement>();
    for (const { td, col } of cels) {
      if (vistos.has(td)) continue;
      vistos.add(td);
      const v = valorDaCelula(td);
      if (v === null) continue;
      soma += v;
      qtd += 1;
      tipos.add(COLUNAS_NUMERICAS[col]!);
      const r = td.getBoundingClientRect();
      if (r.width >= 1 && r.height >= 1) {
        direita = Math.max(direita, r.right);
        baixo = Math.max(baixo, r.bottom);
      }
    }
    if (qtd === 0) {
      setResumo(null);
      setPos(null);
      return;
    }
    setResumo((prev) =>
      prev && prev.soma === soma && prev.qtd === qtd && prev.tipos.size === tipos.size ? prev : { soma, media: soma / qtd, qtd, tipos },
    );
    if (Number.isFinite(direita)) {
      const next = { right: Math.min(direita, window.innerWidth - 8), top: Math.min(baixo + 6, window.innerHeight - 64) };
      setPos((prev) => (prev && prev.right === next.right && prev.top === next.top ? prev : next));
    } else {
      setPos(null);
    }
  }, [rootRef, celulasDasFaixas]);

  // Reaplica o destaque quando a seleção muda e sempre que a tabela é redesenhada, rola ou muda de tamanho.
  useEffect(() => {
    atualizar();
  }, [faixas, atualizar]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    const agendar = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        mo.disconnect();
        atualizar();
        mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
      });
    };
    const mo = new MutationObserver(agendar);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('scroll', agendar, true);
    window.addEventListener('resize', agendar);
    return () => {
      mo.disconnect();
      window.removeEventListener('scroll', agendar, true);
      window.removeEventListener('resize', agendar);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [rootRef, atualizar]);

  // Cliques e arraste.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const celulaDe = (alvo: EventTarget | null) => {
      const td = (alvo as HTMLElement | null)?.closest?.('td[data-orc-col]') as HTMLTableCellElement | null;
      if (!td || !root.contains(td)) return null;
      const col = td.dataset.orcCol ?? '';
      const linha = td.parentElement as HTMLTableRowElement | null;
      if (!linha || linha.parentElement?.tagName !== 'TBODY') return null;
      return col in COLUNAS_NUMERICAS ? { td, col, linha } : null;
    };

    const limpar = () => {
      ancoraRef.current = null;
      setFaixas([]);
    };

    const aoPressionar = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const alvo = e.target as HTMLElement;
      // Botões, caixas de seleção e links seguem com o comportamento normal.
      if (alvo.closest('button, a, [role="button"], input[type="checkbox"], select')) return;
      const cel = celulaDe(alvo);
      if (!cel) {
        if (faixasRef.current.length) limpar();
        return;
      }
      const campo = alvo.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
      // Campo só para leitura (célula ainda não aberta para edição) não conta como "estar digitando".
      const emCampo = !!campo && !campo.readOnly;
      const modificador = e.shiftKey || e.ctrlKey || e.metaKey;
      // Com Shift/Ctrl o clique é da seleção (não do texto do campo).
      if (modificador && campo) e.preventDefault();

      const unica: Faixa = { linhaA: cel.linha, linhaB: cel.linha, colA: cel.col, colB: cel.col };
      if (e.shiftKey && ancoraRef.current) {
        const a = ancoraRef.current;
        setFaixas((prev) => [...prev.slice(0, Math.max(0, prev.length - 1)), { linhaA: a.linha, linhaB: cel.linha, colA: a.col, colB: cel.col }]);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        ancoraRef.current = { linha: cel.linha, col: cel.col };
        setFaixas((prev) => [...prev, unica]);
        return;
      }
      ancoraRef.current = { linha: cel.linha, col: cel.col };
      setFaixas([unica]);
      if (!emCampo) {
        arrastandoRef.current = true;
        root.style.userSelect = 'none';
      }
    };

    const aoMover = (e: MouseEvent) => {
      if (!arrastandoRef.current || !ancoraRef.current) return;
      const cel = celulaDe(document.elementFromPoint(e.clientX, e.clientY));
      if (!cel) return;
      const a = ancoraRef.current;
      setFaixas((prev) => {
        const ult = prev[prev.length - 1];
        if (ult && ult.linhaB === cel.linha && ult.colB === cel.col && ult.linhaA === a.linha && ult.colA === a.col) return prev;
        return [...prev.slice(0, Math.max(0, prev.length - 1)), { linhaA: a.linha, linhaB: cel.linha, colA: a.col, colB: cel.col }];
      });
    };

    const aoSoltar = () => {
      if (!arrastandoRef.current) return;
      arrastandoRef.current = false;
      root.style.userSelect = '';
    };

    // Clicar fora da tabela (e fora do balão) limpa a seleção.
    const aoPressionarFora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (root.contains(alvo) || alvo.closest('[data-orc-soma-balao]')) return;
      if (faixasRef.current.length) limpar();
    };
    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && faixasRef.current.length) limpar();
    };

    root.addEventListener('mousedown', aoPressionar);
    document.addEventListener('mousemove', aoMover);
    document.addEventListener('mouseup', aoSoltar);
    document.addEventListener('mousedown', aoPressionarFora);
    document.addEventListener('keydown', aoTecla);
    return () => {
      root.removeEventListener('mousedown', aoPressionar);
      document.removeEventListener('mousemove', aoMover);
      document.removeEventListener('mouseup', aoSoltar);
      document.removeEventListener('mousedown', aoPressionarFora);
      document.removeEventListener('keydown', aoTecla);
      root.style.userSelect = '';
      camadaRef.current?.remove();
      camadaRef.current = null;
    };
  }, [rootRef]);

  if (!resumo || !pos || typeof document === 'undefined') return null;
  return createPortal(
    <div className="pointer-events-none fixed z-[80] -translate-x-full" style={{ left: pos.right, top: pos.top }} role="status">
      <div
        data-orc-soma-balao
        className="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs tabular-nums text-gray-600 shadow-lg dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
      >
        <span>
          Soma:{' '}
          <strong className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatarResumo(resumo.soma, resumo.tipos)}</strong>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>
          Média:{' '}
          <strong className="font-semibold text-gray-800 dark:text-gray-200">{formatarResumo(resumo.media, resumo.tipos)}</strong>
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>
          Células: <strong className="font-semibold text-gray-800 dark:text-gray-200">{resumo.qtd}</strong>
        </span>
      </div>
    </div>,
    document.body,
  );
}
