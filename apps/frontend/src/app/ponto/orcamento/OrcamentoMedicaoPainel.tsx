'use client';

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, ListPlus, Plus, Trash2 } from 'lucide-react';
import {
  type CampoFormulaMedicao,
  type DimensoesItem,
  type LinhaMedicao,
  type TipoUnidadeFormula
} from './orcamentoMedicaoTypes';
import { areaExibidaLinha, calcularQuantidadeLinha, linhasMedicaoEfetivas, volumeExibidoLinha } from './orcamentoMedicaoCalc';
import type { CampoExplicacaoMedicao } from './orcamentoMedicaoCalc';
import {
  gradeTableCls,
  gradeTableRowTrCls,
  inputGradeCls
} from './orcamentoGradeCellClasses';
import { currencyDigitsToFormatted } from '@/lib/fichaDemandaApproval';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';

/** Painel de medições (C, L, H, %, N, A, V) — aba Memorial de cálculo (layout em tabela, padrão das demais abas). */
type Props = {
  rowKey: string;
  tipoUnidade: TipoUnidadeFormula;
  /** Número do item na ordem do orçamento (ex.: 1.2.3), como na planilha analítica. */
  itemRotulo: string;
  itemDescricao: string;
  /** Unidade da composição (cadastro) ou derivada do tipo de medição. */
  unidadeMedida: string;
  /** Quantidade efetiva no orçamento (UN) — inclui regras como caçamba 4 m³ derivada da carga. */
  quantidadeUn?: number;
  /** Caçamba 4 m³: quantidade vem da carga de entulho; não editar aqui. */
  quantidadeUnReadOnly?: boolean;
  onQuantidadeUnChange?: (n: number) => void;
  /**
   * Itens "un" no orçamento com `usarMemoriaCalculo`: em vez do campo único de quantidade,
   * mostra uma lista de quantidades por local (soma simples, sem fórmula C×L×H).
   */
  modoContagemLista?: boolean;
  onAddLinhaContagem?: (inserirAposIdx?: number) => void;
  onUpdateLinhaContagem?: (idx: number, campo: 'descricao' | 'quantidade', valor: string | number) => void;
  onRemoveLinhaContagem?: (idx: number) => void;
  dim: DimensoesItem;
  ehCargaEntulho: boolean;
  updateLinhaMedicao: (
    itemKey: string,
    idx: number,
    campo: keyof LinhaMedicao,
    valor: number | string,
    opts?: { formulaRaw?: string }
  ) => void;
  updateRotuloColunaMedicao?: (
    campo: 'descricao' | 'C' | 'L' | 'H' | 'N' | 'pct',
    rotulo: string
  ) => void;
  updateObservacaoMedicao?: (texto: string) => void;
  addLinhaMedicao: (itemKey: string, inserirAposIdx?: number) => void;
  /** Insere várias linhas de uma vez (a colagem cria as que não existem abaixo). `aposIdx` -1 insere no início. */
  inserirLinhasMedicao: (itemKey: string, aposIdx: number, quantidade: number) => void;
  addLinhaCabecalhoSecaoMedicao: (
    itemKey: string,
    inserirAposIdx?: number,
    descricao?: string | string[]
  ) => void;
  removeLinhaMedicao: (itemKey: string, idx: number) => void;
  estiloTitulo?: React.CSSProperties;
  /** Bloqueia edição (orçamento/memorial travados). */
  readOnly?: boolean;
  /**
   * Dentro do quadrante do serviço: remove borda/raio externos para não ficar
   * card-dentro-de-card.
   */
  embedded?: boolean;
  /** Outras memórias que podem entrar como linha desta composição. */
  memoriasDisponiveis?: { key: string; rotulo: string; descricao: string; unidade?: string }[];
  onMemoriasIncluidasChange?: (chaves: string[]) => void;
  /**
   * Resolve `{rótulo!linha!coluna}` de outra composição (linha 1-based na memória dela).
   * Colunas: C, L, H, N, %, A, V, SUB.
   */
  resolverFormulaExterna?: (rotulo: string, linha: number, campo: string) => number | null;
  /** Volta a memória deste item para um snapshot (Ctrl+Z / Ctrl+Y). */
  restaurarDimensoes?: (dim: DimensoesItem) => void;
};

/**
 * Larguras da grade: a 1ª linha do thead (item) ocupa a coluna Descrição + colSpan no restante;
 * `<colgroup>` define a grade de fato (w-* nas células sozinho não segura o layout).
 */
const COLS_MEDIC_PCT = { desc: 44, med: 7 } as const;

const colDesc = 'min-w-[18rem] sm:min-w-[22rem]';
const colMed = 'min-w-[2.75rem] max-w-[4.25rem]';

/** Altura fixa igual em rótulos, dados e total (a faixa do item pode crescer com o texto). */
const MEMORIAL_ROW_H = 'h-[2.75rem] max-h-[2.75rem] box-border';
const MEMORIAL_TITLE_ROW_MIN_H = 'min-h-[2.75rem] box-border';
/** Sticky da 2ª linha do thead — `top` vem da altura real da faixa do item. */
const memorialThStickySecondBase =
  'sticky z-[19] bg-[var(--orc-header-bg,#f9fafb)] text-[var(--orc-header-fg,#4b5563)] !shadow-none';
const thFirst =
  `${MEMORIAL_ROW_H} px-3 sm:px-3.5 py-0 text-left text-[11px] font-bold uppercase tracking-wide bg-[var(--orc-header-bg,#f9fafb)] text-[var(--orc-header-fg,#4b5563)] border-b border-r border-gray-200 dark:border-gray-600 ${colDesc}`;
const thRest =
  `${MEMORIAL_ROW_H} px-2 sm:px-3 py-0 text-center text-[11px] font-bold uppercase tracking-wide bg-[var(--orc-header-bg,#f9fafb)] text-[var(--orc-header-fg,#4b5563)] border-b border-r border-gray-200 dark:border-gray-600 ${colMed}`;
/** Só no thead da grade de colunas (não reutilizar em linhas de seção do tbody). */
const thFirstSticky = `${memorialThStickySecondBase} ${thFirst}`;
const thRestSticky = `${memorialThStickySecondBase} ${thRest}`;
const tdFirst =
  `${MEMORIAL_ROW_H} px-3 sm:px-3.5 py-0 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRest =
  `${MEMORIAL_ROW_H} px-2 sm:px-3 py-0 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
/** Corpo da tabela: sem padding no td para o input cobrir a célula inteira (borda de foco = borda da célula). */
const tdFirstBody =
  `${MEMORIAL_ROW_H} relative p-0 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRestBody =
  `${MEMORIAL_ROW_H} relative p-0 align-middle border-b border-r border-gray-200 bg-white text-center focus-within:z-[4] dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalc =
  `${MEMORIAL_ROW_H} px-2 sm:px-3 py-0 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalcBody =
  `${MEMORIAL_ROW_H} relative p-0 text-center tabular-nums text-sm font-bold text-gray-900 focus-within:z-[4] dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const inputCls = `${inputGradeCls} !min-h-0 !h-full !py-0 focus:!bg-transparent dark:focus:!bg-transparent`;
/** O foco global zera o box-shadow do input; a borda vermelha fica no contêiner. */
const caixaFocoDescricaoCls =
  'relative h-full w-full focus-within:z-[3] focus-within:shadow-[inset_0_0_0_2px_#dc2626] dark:focus-within:shadow-[inset_0_0_0_2px_#f87171]';
/** Texto editável com a mesma leitura visual do &lt;th&gt; da coluna Descrição (memória). */
const inputThDescricaoCls =
  'box-border h-full min-h-0 w-full min-w-0 border-0 rounded-none bg-transparent px-3 py-0 text-left text-[11px] font-bold uppercase tracking-wide text-[var(--orc-header-fg,#4b5563)] shadow-none outline-none ring-0 placeholder:text-gray-400 dark:placeholder:text-slate-500 sm:px-3.5 focus:z-[1] focus:bg-transparent focus:shadow-none focus:outline-none focus:ring-0 dark:focus:bg-transparent disabled:cursor-not-allowed disabled:opacity-60';
const inputThRotuloCls =
  'box-border h-full min-h-0 w-full min-w-0 border-0 rounded-none bg-transparent px-1 py-0 text-center text-[11px] font-bold tracking-wide text-[var(--orc-header-fg,#374151)] shadow-none outline-none ring-0 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:z-[1] focus:bg-transparent focus:shadow-none focus:outline-none focus:ring-0 dark:focus:bg-transparent disabled:cursor-not-allowed disabled:opacity-60';
const rotuloFixoCls =
  'flex h-full w-full cursor-cell select-none items-center justify-center px-1 text-[11px] font-bold uppercase tracking-wide text-[var(--orc-header-fg,#4b5563)] outline-none';

const MEMORIAL_COMMIT_MS = 180;

/** Tokens clicáveis na fórmula. Na mesma linha: C, L, H, N, %, A, V, SUB. */
type FormulaPickToken = 'C' | 'L' | 'H' | 'N' | '%' | 'A' | 'V' | 'SUB';

type FormulaRowCtx = {
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number;
  A: number;
  V: number;
  SUB: number;
};

type FormulaPickSession = {
  itemKey: string;
  idx: number;
  campo: string;
  /** Texto atual da fórmula, para marcar só as células já escolhidas. */
  formula: string;
  insert: (token: string) => void;
};

type FormulaPickApi = {
  session: FormulaPickSession | null;
  setSession: (session: FormulaPickSession | null) => void;
  setFormula: (itemKey: string, formula: string) => void;
  clearIf: (itemKey: string) => void;
};

const MemorialFormulaPickContext = React.createContext<FormulaPickApi | null>(null);

/** Uma sessão de fórmula compartilhada por todas as memórias da aba. */
export function MemorialFormulaPickProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<FormulaPickSession | null>(null);
  const setSession = useCallback((next: FormulaPickSession | null) => {
    setSessionState(next);
  }, []);
  const setFormula = useCallback((itemKey: string, formula: string) => {
    setSessionState(cur => {
      if (!cur || cur.itemKey !== itemKey || cur.formula === formula) return cur;
      return { ...cur, formula };
    });
  }, []);
  const clearIf = useCallback((itemKey: string) => {
    setSessionState(cur => (cur?.itemKey === itemKey ? null : cur));
  }, []);
  const value = useMemo(
    () => ({ session, setSession, setFormula, clearIf }),
    [session, setSession, setFormula, clearIf]
  );
  return (
    <MemorialFormulaPickContext.Provider value={value}>
      <style>{`html.medicao-selecionando, html.medicao-selecionando * { user-select: none !important; cursor: cell !important; }
@keyframes medicao-tracejado-corre { to { stroke-dashoffset: -10; } }
.medicao-tracejado-corre { animation: medicao-tracejado-corre 0.45s linear infinite; }
@media (prefers-reduced-motion: reduce) { .medicao-tracejado-corre { animation: none; } }`}</style>
      {children}
    </MemorialFormulaPickContext.Provider>
  );
}

function useMemorialFormulaPick() {
  return React.useContext(MemorialFormulaPickContext);
}

/** Colunas da grade na ordem da tela: descrição, C, L, H, %, N, A, V, subtotal. */
const COLUNAS_MEDICAO = ['descricao', 'C', 'L', 'H', 'empol', 'N', 'A', 'V', 'subtotal'] as const;
type ColunaMedicao = (typeof COLUNAS_MEDICAO)[number];

type FaixaMedicao = { idxIni: number; idxFim: number; colIni: number; colFim: number };

type TipoLinhaCopiaMedicao = 'rotulos' | 'secao' | 'dados';

type CopiaCelulaMedicao = {
  rowKey: string;
  rotulo: string;
  faixa: FaixaMedicao;
  /** Posição da primeira linha entre as linhas de dados (a mesma numeração das referências). */
  linhaDados: number;
  /** Linhas × colunas, na ordem da faixa (rótulos, seção ou dados). */
  celulas: string[][];
  /** Uma entrada por linha de `celulas`. */
  tiposLinha?: TipoLinhaCopiaMedicao[];
  texto: string;
};

/** Linha dos rótulos das colunas (DESCRIÇÃO, C, L, H…). Não é uma linha de medição. */
const LINHA_ROTULOS = -1;

function normalizarFaixa(a: { idx: number; col: number }, b: { idx: number; col: number }): FaixaMedicao {
  return {
    idxIni: Math.min(a.idx, b.idx),
    idxFim: Math.max(a.idx, b.idx),
    colIni: Math.min(a.col, b.col),
    colFim: Math.max(a.col, b.col),
  };
}

function faixaContem(f: FaixaMedicao | null | undefined, idx: number, col: number) {
  return !!f && idx >= f.idxIni && idx <= f.idxFim && col >= f.colIni && col <= f.colFim;
}

/** A área de transferência do Windows troca \n por \r\n e pode acrescentar uma quebra no fim. */
function mesmoTextoCopiado(colado: string, copiado: string) {
  const norm = (s: string) => s.replace(/\r/g, '').replace(/\n+$/, '');
  return norm(colado) === norm(copiado);
}

/** Texto colado de planilha: linhas por quebra, colunas por tab. */
function blocoDoTexto(texto: string): string[][] {
  const linhas = String(texto ?? '').replace(/\r/g, '').split('\n');
  if (linhas.length > 1 && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas.map(l => l.split('\t'));
}

/** Fundo da seleção, célula por célula. O contorno vai num traço só, para o tracejado não quebrar na divisa. */
function MarcaSelecaoCelula() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-red-500/10 dark:bg-red-400/15" />
  );
}

type CaixaContorno = { left: number; top: number; width: number; height: number };

/** Cantos da faixa. O cabeçalho sticky entra sempre que a seleção o inclui. */
function celulasCantoFaixa(raiz: HTMLElement, faixa: FaixaMedicao): HTMLElement[] {
  const { idxIni, idxFim, colIni, colFim } = faixa;
  const linhas = idxIni === idxFim ? [idxIni] : [idxIni, idxFim];
  const cols = colIni === colFim ? [colIni] : [colIni, colFim];
  const els: HTMLElement[] = [];
  for (const idx of linhas) {
    const tr = raiz.querySelector<HTMLElement>(`[data-linha-medicao="${idx}"]`);
    if (!tr) continue;
    for (const col of cols) {
      const el = tr.querySelector<HTMLElement>(`[data-col-medicao="${col}"]`);
      if (el) els.push(el);
    }
  }
  return els;
}

/** Caixa no conteúdo da tabela. Assim o traço rola com as células, sem perseguir o scroll. */
function caixaDaFaixa(raiz: HTMLElement, faixa: FaixaMedicao): CaixaContorno | null {
  const els = celulasCantoFaixa(raiz, faixa);
  if (!els.length) return null;
  const port = raiz.getBoundingClientRect();
  const sl = raiz.scrollLeft;
  const st = raiz.scrollTop;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let achou = false;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const bl = el.clientLeft;
    const bt = el.clientTop;
    const br = Math.max(0, el.offsetWidth - el.clientWidth - bl);
    const bb = Math.max(0, el.offsetHeight - el.clientHeight - bt);
    achou = true;
    left = Math.min(left, r.left - port.left + sl + bl);
    top = Math.min(top, r.top - port.top + st + bt);
    right = Math.max(right, r.right - port.left + sl - br);
    bottom = Math.max(bottom, r.bottom - port.top + st - bb);
  }
  if (!achou) return null;
  const width = right - left;
  const height = bottom - top;
  if (width < 4 || height < 4) return null;
  return { left, top, width, height };
}

/**
 * Retângulo contínuo em volta da faixa, dentro da tabela (z acima do cabeçalho sticky).
 * Fica no fluxo do scroll: o navegador move o traço junto com as células.
 */
function ContornoFaixa({
  faixa,
  tipo,
  raizRef,
}: {
  faixa: FaixaMedicao;
  tipo: 'selecao' | 'copia';
  raizRef: React.RefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rectRef = useRef<SVGRectElement | null>(null);
  const faixaRef = useRef(faixa);
  faixaRef.current = faixa;
  const { idxIni, idxFim, colIni, colFim } = faixa;
  const tracejado = tipo === 'copia';
  const traco = 2;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const rect = rectRef.current;
    const raiz = raizRef.current;
    if (!svg || !rect || !raiz) return;

    const aplicar = () => {
      const box = caixaDaFaixa(raiz, faixaRef.current);
      if (!box) {
        svg.style.visibility = 'hidden';
        return;
      }
      svg.style.visibility = 'visible';
      svg.style.left = `${box.left}px`;
      svg.style.top = `${box.top}px`;
      svg.style.width = `${box.width}px`;
      svg.style.height = `${box.height}px`;
      rect.setAttribute('width', String(Math.max(0, box.width - traco)));
      rect.setAttribute('height', String(Math.max(0, box.height - traco)));
    };

    aplicar();
    const obs = new ResizeObserver(aplicar);
    obs.observe(raiz);
    window.addEventListener('resize', aplicar);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', aplicar);
    };
  }, [colFim, colIni, idxFim, idxIni, raizRef, traco]);

  return (
    <svg
      ref={svgRef}
      aria-hidden
      className="pointer-events-none absolute z-[32] overflow-visible text-red-600 dark:text-red-400"
    >
      <rect
        ref={rectRef}
        x={traco / 2}
        y={traco / 2}
        fill="none"
        stroke="currentColor"
        strokeWidth={traco}
        strokeDasharray={tracejado ? '6 4' : undefined}
        className={tracejado ? 'medicao-tracejado-corre' : undefined}
        strokeLinejoin="miter"
      />
    </svg>
  );
}

let copiaCelulaMedicao: CopiaCelulaMedicao | null = null;
const ouvintesCopiaMedicao = new Set<() => void>();

function definirCopiaCelulaMedicao(next: CopiaCelulaMedicao | null) {
  copiaCelulaMedicao = next;
  ouvintesCopiaMedicao.forEach(fn => fn());
}

function useCopiaCelulaMedicao() {
  return React.useSyncExternalStore(
    fn => {
      ouvintesCopiaMedicao.add(fn);
      return () => {
        ouvintesCopiaMedicao.delete(fn);
      };
    },
    () => copiaCelulaMedicao,
    () => null
  );
}

/** Referências da mesma composição andam junto com a linha, como no Excel. A linha T não muda. */
function deslocarFormulaLinhas(formula: string, rotulo: string, delta: number): string {
  if (!delta || !formula.trimStart().startsWith('=')) return formula;
  const rot = rotulo.trim();
  return formula.replace(
    /\{([^{}!]+)!(\d+|T)!(SUB|C|L|H|N|%|A|V)\}/gi,
    (bruto, r: string, lin: string, col: string) => {
      if (r.trim() !== rot || /^t$/i.test(lin)) return bruto;
      return `{${r}!${Math.max(1, Number(lin) + delta)}!${col}}`;
    }
  );
}

/** Exibição fixa com duas casas, no mesmo formato dos valores do orçamento (0,00). */
function formatMedicaoCentavos(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Campo vazio mostra o placeholder. Só escreve o número quando há valor. */
function formatMedicaoCampo(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '';
  return formatMedicaoCentavos(n);
}

/** Digitar 158 vira 1,58. Fórmula (=…) permanece como foi escrita. */
function mascaraMedicaoCentavos(raw: string): string {
  const text = String(raw ?? '');
  if (text.trimStart().startsWith('=')) return text;
  return currencyDigitsToFormatted(text);
}

function substituirRefsFormulaLinha(expr: string, ctx: FormulaRowCtx): string {
  const comSub = expr.replace(/\bSUB\b/gi, String(Number(ctx.SUB) || 0));
  return comSub.replace(/%|\b([CLHNAV])\b/gi, match => {
    if (match === '%') return String(Number(ctx.empolamento) || 0);
    const m = match.toUpperCase();
    if (m === 'C') return String(Number(ctx.C) || 0);
    if (m === 'L') return String(Number(ctx.L) || 0);
    if (m === 'H') return String(Number(ctx.H) || 0);
    if (m === 'N') return String(Number(ctx.N) || 0);
    if (m === 'A') return String(Number(ctx.A) || 0);
    if (m === 'V') return String(Number(ctx.V) || 0);
    return match;
  });
}

function substituirRefsFormulaExternas(
  expr: string,
  resolve: (rotulo: string, linha: number, campo: string) => number | null
): { expr: string; ok: boolean } {
  let ok = true;
  const next = expr.replace(
    /\{([^{}!]+)!(\d+|T)!(SUB|C|L|H|N|%|A|V)\}/gi,
    (_match, rotulo: string, linha: string, campo: string) => {
      const col = campo.toUpperCase() === '%' ? '%' : campo.toUpperCase();
      const linhaNum = /^t$/i.test(linha) ? 0 : Number(linha);
      const n = resolve(String(rotulo).trim(), linhaNum, col);
      if (n == null || !Number.isFinite(n)) {
        ok = false;
        return '0';
      }
      return String(n);
    }
  );
  return { expr: next, ok };
}

function parseMedicaoBlurNumber(
  raw: string,
  rowCtx?: FormulaRowCtx,
  resolverExterna?: (rotulo: string, linha: number, campo: string) => number | null
): number | null {
  const text = String(raw ?? '').trim();
  if (text.startsWith('=')) {
    let s = text.slice(1).trim().replace(/,/g, '.');
    if (resolverExterna && s.includes('{')) {
      const externo = substituirRefsFormulaExternas(s, resolverExterna);
      if (!externo.ok) return null;
      s = externo.expr;
    }
    if (rowCtx) s = substituirRefsFormulaLinha(s, rowCtx);
    if (!s || !/^[\d\s+\-*/.()]+$/.test(s)) return null;
    try {
      const result = new Function(`return (${s})`)();
      return typeof result === 'number' && isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }
  const t = text.replace(/^=/, '').trim();
  if (!t) return null;
  if (t.includes(',')) {
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const n = Number(t.replace(/\./g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDraftKeyMedicao(draftKey: string): { idx: number; campo: string } | null {
  const parts = draftKey.split('|');
  if (parts.length < 2) return null;
  const campo = parts[parts.length - 1]!;
  const idx = Number(parts[parts.length - 2]);
  if (!Number.isFinite(idx)) return null;
  return { idx, campo };
}

function tokenDoCampoMedicao(campo: string): FormulaPickToken | null {
  if (campo === 'C' || campo === 'L' || campo === 'H' || campo === 'N') return campo;
  if (campo === 'empol') return '%';
  if (campo === 'A' || campo === 'V') return campo;
  if (campo === 'subtotal') return 'SUB';
  return null;
}

const COR_FATOR_EXPLICACAO: Record<CampoExplicacaoMedicao, { celula: string; texto: string }> = {
  C: {
    celula: '!bg-sky-100 ring-2 ring-inset ring-sky-500 dark:!bg-sky-950/80 dark:ring-sky-400',
    texto: '!text-sky-800 dark:!text-sky-200',
  },
  L: {
    celula: '!bg-emerald-100 ring-2 ring-inset ring-emerald-500 dark:!bg-emerald-950/80 dark:ring-emerald-400',
    texto: '!text-emerald-800 dark:!text-emerald-200',
  },
  H: {
    celula: '!bg-amber-100 ring-2 ring-inset ring-amber-500 dark:!bg-amber-950/80 dark:ring-amber-400',
    texto: '!text-amber-800 dark:!text-amber-200',
  },
  N: {
    celula: '!bg-violet-100 ring-2 ring-inset ring-violet-500 dark:!bg-violet-950/80 dark:ring-violet-400',
    texto: '!text-violet-800 dark:!text-violet-200',
  },
};

const PALETA_FORMULA: { celula: string; texto: string }[] = [
  COR_FATOR_EXPLICACAO.C,
  COR_FATOR_EXPLICACAO.L,
  COR_FATOR_EXPLICACAO.H,
  COR_FATOR_EXPLICACAO.N,
  {
    celula: '!bg-rose-100 ring-2 ring-inset ring-rose-500 dark:!bg-rose-950/80 dark:ring-rose-400',
    texto: '!text-rose-800 dark:!text-rose-200',
  },
  {
    celula: '!bg-cyan-100 ring-2 ring-inset ring-cyan-500 dark:!bg-cyan-950/80 dark:ring-cyan-400',
    texto: '!text-cyan-800 dark:!text-cyan-200',
  },
  {
    celula: '!bg-orange-100 ring-2 ring-inset ring-orange-500 dark:!bg-orange-950/80 dark:ring-orange-400',
    texto: '!text-orange-800 dark:!text-orange-200',
  },
  {
    celula: '!bg-fuchsia-100 ring-2 ring-inset ring-fuchsia-500 dark:!bg-fuchsia-950/80 dark:ring-fuchsia-400',
    texto: '!text-fuchsia-800 dark:!text-fuchsia-200',
  },
];

const COR_FIXA_TOKEN: Record<string, number> = { C: 0, L: 1, H: 2, N: 3 };

type SegmentoFormulaVisivel = {
  texto: string;
  classe: string;
  /** Índice inclusivo no texto da fórmula guardada. */
  iniFormula: number;
  /** Índice exclusivo no texto da fórmula guardada. */
  fimFormula: number;
};

type FormulaMapEdicao = {
  segmentos: SegmentoFormulaVisivel[];
  formula: string;
};

const formulaMapPorInput = new WeakMap<HTMLInputElement, { current: FormulaMapEdicao | null }>();

function mapaFormulaDoInput(el: HTMLInputElement | null): FormulaMapEdicao | null {
  if (!el) return null;
  return formulaMapPorInput.get(el)?.current ?? null;
}

/** Caret no texto que aparece na tela → posição na fórmula (token inteiro vira uma borda). */
function posVisivelParaFormula(segmentos: SegmentoFormulaVisivel[], pos: number): number {
  let vis = 0;
  for (const seg of segmentos) {
    const len = seg.texto.length;
    const atomico = len !== seg.fimFormula - seg.iniFormula;
    if (pos <= vis + len) {
      const local = pos - vis;
      if (!atomico) return seg.iniFormula + local;
      if (local <= 0) return seg.iniFormula;
      if (local >= len) return seg.fimFormula;
      return local * 2 < len ? seg.iniFormula : seg.fimFormula;
    }
    vis += len;
  }
  const ultimo = segmentos[segmentos.length - 1];
  return ultimo ? ultimo.fimFormula : pos;
}

function posFormulaParaVisivel(segmentos: SegmentoFormulaVisivel[], pos: number): number {
  let vis = 0;
  for (const seg of segmentos) {
    if (pos <= seg.iniFormula) return vis;
    if (pos < seg.fimFormula) {
      const span = seg.fimFormula - seg.iniFormula;
      if (seg.texto.length === span) return vis + (pos - seg.iniFormula);
      return vis + seg.texto.length;
    }
    vis += seg.texto.length;
  }
  return vis;
}

function posVisivelExato(segmentos: SegmentoFormulaVisivel[], pos: number): number {
  let vis = 0;
  for (const seg of segmentos) {
    const len = seg.texto.length;
    if (pos <= vis + len) {
      const local = pos - vis;
      const span = seg.fimFormula - seg.iniFormula;
      if (len === span) return seg.iniFormula + local;
      if (local <= 0) return seg.iniFormula;
      return seg.fimFormula;
    }
    vis += len;
  }
  const ultimo = segmentos[segmentos.length - 1];
  return ultimo ? ultimo.fimFormula : pos;
}

/** Edição no texto colorido volta para a fórmula, sem partir uma referência no meio. */
function aplicarEdicaoVisivel(
  formula: string,
  segmentos: SegmentoFormulaVisivel[],
  antes: string,
  depois: string,
): string {
  if (antes === depois) return formula;
  if (!segmentos.length) return depois;
  let i = 0;
  const minLen = Math.min(antes.length, depois.length);
  while (i < minLen && antes[i] === depois[i]) i += 1;
  let suf = 0;
  while (
    suf < antes.length - i &&
    suf < depois.length - i &&
    antes[antes.length - 1 - suf] === depois[depois.length - 1 - suf]
  ) {
    suf += 1;
  }
  let iniVis = i;
  let fimVis = antes.length - suf;
  let vis = 0;
  for (const seg of segmentos) {
    const v0 = vis;
    const v1 = vis + seg.texto.length;
    vis = v1;
    const atomico = seg.texto.length !== seg.fimFormula - seg.iniFormula;
    if (!atomico) continue;
    const caretNaBorda = iniVis === fimVis && (iniVis === v0 || iniVis === v1);
    if (!caretNaBorda && iniVis < v1 && fimVis > v0) {
      iniVis = Math.min(iniVis, v0);
      fimVis = Math.max(fimVis, v1);
    }
  }
  const sufAntes = antes.length - fimVis;
  const meio = depois.slice(iniVis, Math.max(iniVis, depois.length - sufAntes));
  const iniF = posVisivelExato(segmentos, iniVis);
  const fimF = posVisivelExato(segmentos, fimVis);
  return formula.slice(0, iniF) + meio + formula.slice(fimF);
}

function chaveTokenLocal(token: string): string {
  const tok = token.toUpperCase() === '%' ? '%' : token.toUpperCase();
  return `L:${tok}`;
}

function chaveTokenExterno(rotulo: string, linha: string, campo: string): string {
  const lin = /^t$/i.test(linha) ? 'T' : String(Number(linha));
  const col = campo.toUpperCase() === '%' ? '%' : campo.toUpperCase();
  return `E:${rotulo.trim()}!${lin}!${col}`;
}

const RE_TOKEN_FORMULA =
  /\{([^{}!]+)!(\d+|T)!(SUB|C|L|H|N|%|A|V)\}|\bSUB\b|%|\b[CLHNAV]\b/gi;

function mapaCoresFormula(formula: string): Map<string, number> {
  const map = new Map<string, number>();
  const usadas = new Set<number>();
  const demais: string[] = [];
  const re = new RegExp(RE_TOKEN_FORMULA.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(formula))) {
    const bruto = match[0];
    const chave = bruto.startsWith('{')
      ? chaveTokenExterno(match[1]!, match[2]!, match[3]!)
      : chaveTokenLocal(bruto);
    if (map.has(chave) || demais.includes(chave)) continue;
    const tok = bruto.startsWith('{') ? '' : bruto.toUpperCase() === '%' ? '%' : bruto.toUpperCase();
    if (tok && tok in COR_FIXA_TOKEN) {
      const idxCor = COR_FIXA_TOKEN[tok]!;
      map.set(chave, idxCor);
      usadas.add(idxCor);
    } else {
      demais.push(chave);
    }
  }
  let cursor = 0;
  for (const chave of demais) {
    while (usadas.has(cursor) && cursor < PALETA_FORMULA.length - 1) cursor += 1;
    map.set(chave, cursor);
    usadas.add(cursor);
    cursor += 1;
  }
  return map;
}

function classeCelulaFormula(formula: string, chave: string): string {
  const idxCor = mapaCoresFormula(formula).get(chave);
  if (idxCor == null) return '';
  return PALETA_FORMULA[idxCor]?.celula ?? '';
}

function valorTokenLocal(ctx: FormulaRowCtx, token: string): number | null {
  const tok = token.toUpperCase() === '%' ? '%' : token.toUpperCase();
  if (tok === 'C') return ctx.C;
  if (tok === 'L') return ctx.L;
  if (tok === 'H') return ctx.H;
  if (tok === 'N') return ctx.N;
  if (tok === '%') return ctx.empolamento;
  if (tok === 'A') return ctx.A;
  if (tok === 'V') return ctx.V;
  if (tok === 'SUB') return ctx.SUB;
  return null;
}

function segmentosFormulaVisivel(
  formula: string,
  rowCtx: FormulaRowCtx | undefined,
  resolver?: (rotulo: string, linha: number, campo: string) => number | null
): SegmentoFormulaVisivel[] {
  const mapa = mapaCoresFormula(formula);
  const re = new RegExp(RE_TOKEN_FORMULA.source, 'gi');
  const out: SegmentoFormulaVisivel[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(formula))) {
    if (match.index > last) {
      out.push({
        texto: formula.slice(last, match.index),
        classe: 'text-gray-900 dark:text-gray-100',
        iniFormula: last,
        fimFormula: match.index,
      });
    }
    const bruto = match[0];
    const externo = bruto.startsWith('{');
    const chave = externo
      ? chaveTokenExterno(match[1]!, match[2]!, match[3]!)
      : chaveTokenLocal(bruto);
    const cor = PALETA_FORMULA[mapa.get(chave) ?? 0];
    let texto = bruto;
    if (externo && resolver) {
      const linhaNum = /^t$/i.test(match[2]!) ? 0 : Number(match[2]);
      const col = match[3]!.toUpperCase() === '%' ? '%' : match[3]!.toUpperCase();
      const n = resolver(match[1]!.trim(), linhaNum, col);
      if (n != null && Number.isFinite(n)) texto = formatMedicaoCentavos(n);
    } else if (rowCtx) {
      const n = valorTokenLocal(rowCtx, bruto);
      if (n != null && Number.isFinite(n)) texto = formatMedicaoCentavos(n);
    }
    out.push({
      texto,
      classe: cor?.texto ?? '',
      iniFormula: match.index,
      fimFormula: match.index + bruto.length,
    });
    last = match.index + bruto.length;
  }
  if (last < formula.length) {
    out.push({
      texto: formula.slice(last),
      classe: 'text-gray-900 dark:text-gray-100',
      iniFormula: last,
      fimFormula: formula.length,
    });
  }
  return out;
}

function DicaFormulaCompleta({
  ancora,
  segmentos,
  texto,
}: {
  ancora: HTMLElement;
  segmentos: SegmentoFormulaVisivel[] | null;
  texto: string;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const colocar = () => {
      const rect = ancora.getBoundingClientRect();
      const largura = caixaRef.current?.offsetWidth ?? 0;
      const margem = 8;
      let left = rect.left + rect.width / 2 - largura / 2;
      if (largura > 0) {
        left = Math.max(margem, Math.min(left, window.innerWidth - margem - largura));
      } else {
        left = rect.left;
      }
      setPos({ left, top: rect.top - 6 });
    };
    colocar();
    window.addEventListener('scroll', colocar, true);
    window.addEventListener('resize', colocar);
    return () => {
      window.removeEventListener('scroll', colocar, true);
      window.removeEventListener('resize', colocar);
    };
  }, [ancora, texto]);

  return createPortal(
    <div
      ref={caixaRef}
      className="pointer-events-none fixed z-[80] max-w-[min(36rem,calc(100vw-1rem))] -translate-y-full"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      <div className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-left text-sm font-bold tabular-nums text-gray-900 shadow-lg dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100">
        <span className="whitespace-pre-wrap break-all">
          {segmentos && segmentos.length > 0
            ? segmentos.map((parte, i) => (
                <span key={i} className={parte.classe}>
                  {parte.texto}
                </span>
              ))
            : texto}
        </span>
      </div>
    </div>,
    document.body
  );
}

function pxAtePosicao(el: HTMLInputElement, pos: number) {
  const estilo = window.getComputedStyle(el);
  const probe = document.createElement('span');
  probe.textContent = el.value.slice(0, Math.max(0, pos));
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'pre';
  probe.style.font = estilo.font;
  probe.style.letterSpacing = estilo.letterSpacing;
  document.body.appendChild(probe);
  const largura = probe.getBoundingClientRect().width;
  probe.remove();
  return largura;
}

/** Mantém o cursor dentro da área visível quando a fórmula é mais larga que a célula. */
function rolarInputAteCaret(el: HTMLInputElement) {
  const pos = el.selectionStart ?? el.value.length;
  const x = pxAtePosicao(el, pos);
  const estilo = window.getComputedStyle(el);
  const padL = parseFloat(estilo.paddingLeft) || 0;
  const padR = parseFloat(estilo.paddingRight) || 0;
  const visivel = Math.max(0, el.clientWidth - padL - padR);
  const margem = 10;
  let scroll = el.scrollLeft;
  if (x > scroll + visivel - margem) scroll = x - visivel + margem;
  if (x < scroll + margem) scroll = Math.max(0, x - margem);
  if (Math.abs(el.scrollLeft - scroll) > 0.5) el.scrollLeft = scroll;
  return el.scrollLeft;
}

let alcaMedicaoArrastando = false;

const CURSOR_MAIS = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><path fill='black' stroke='white' stroke-width='1.2' d='M9 1.5h2v6h6v2h-6v6H9v-6H3v-2h6z'/></svg>`
)}") 10 10, crosshair`;

function linhaMedicaoNoPonto(tabela: HTMLElement | null, y: number): HTMLElement | null {
  if (!tabela) return null;
  const linhas = tabela.querySelectorAll<HTMLElement>('[data-linha-medicao]');
  for (const linha of linhas) {
    const rect = linha.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) return linha;
  }
  return null;
}

function AlcaArrastarFormula({
  ancoraRef,
  onArrastarAbaixo,
  onTerminou,
  copiarLinha = false,
}: {
  ancoraRef: React.RefObject<HTMLDivElement | null>;
  onArrastarAbaixo: (ateIdx: number) => void;
  onTerminou?: () => void;
  /** A prévia marca a linha de destino inteira (cópia do cabeçalho). */
  copiarLinha?: boolean;
}) {
  const [canto, setCanto] = useState<{ left: number; top: number } | null>(null);
  const [faixa, setFaixa] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const limparArrastoRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => limparArrastoRef.current?.();
  }, []);

  const posicionar = useCallback(() => {
    const el = ancoraRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCanto({ left: rect.right, top: rect.bottom });
  }, [ancoraRef]);

  useLayoutEffect(() => {
    posicionar();
    window.addEventListener('scroll', posicionar, true);
    window.addEventListener('resize', posicionar);
    return () => {
      window.removeEventListener('scroll', posicionar, true);
      window.removeEventListener('resize', posicionar);
    };
  }, [posicionar]);

  const iniciar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    alcaMedicaoArrastando = true;
    setArrastando(true);
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* o ponteiro segue pelos listeners da janela */
    }
    document.documentElement.classList.add('medicao-arraste-formula');
    const origem = ancoraRef.current?.getBoundingClientRect();
    const tabela = ancoraRef.current?.closest('table') ?? null;

    const atualizarFaixa = (y: number) => {
      const ancora = ancoraRef.current;
      const celula = ancora?.getBoundingClientRect();
      const origemFaixa = copiarLinha ? ancora?.closest('tr')?.getBoundingClientRect() ?? celula : origem;
      if (!origemFaixa) return;
      const linha = linhaMedicaoNoPonto(tabela, y);
      if (!linha) {
        setFaixa(null);
        return;
      }
      const rect = linha.getBoundingClientRect();
      if (copiarLinha) {
        setFaixa({ left: origemFaixa.left, top: rect.top, width: origemFaixa.width, height: rect.height });
        return;
      }
      const topo = Math.min(origemFaixa.top, rect.top);
      const base = Math.max(origemFaixa.bottom, rect.bottom);
      setFaixa({ left: origemFaixa.left, top: topo, width: origemFaixa.width, height: base - topo });
    };

    const mover = (ev: PointerEvent) => {
      atualizarFaixa(ev.clientY);
    };
    const encerrar = (ev: Event | null) => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', encerrar);
      window.removeEventListener('pointercancel', encerrar);
      limparArrastoRef.current = null;
      document.documentElement.classList.remove('medicao-arraste-formula');
      setFaixa(null);
      setArrastando(false);
      const ponto = ev instanceof PointerEvent ? ev : null;
      const linha = ponto ? linhaMedicaoNoPonto(tabela, ponto.clientY) : null;
      const ate = Number(linha?.getAttribute('data-linha-medicao'));
      window.setTimeout(() => {
        alcaMedicaoArrastando = false;
      }, 0);
      if (ponto && Number.isFinite(ate)) onArrastarAbaixo(ate);
      if (ponto) onTerminou?.();
    };
    limparArrastoRef.current = () => encerrar(null);
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', encerrar);
    window.addEventListener('pointercancel', encerrar);
  };

  if (!canto || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {arrastando ? (
        <style>{`html.medicao-arraste-formula, html.medicao-arraste-formula * { cursor: ${CURSOR_MAIS} !important; }`}</style>
      ) : null}
      {faixa ? (
        <div
          className="pointer-events-none fixed z-[75] border-2 border-red-600 bg-red-500/10 dark:border-red-400"
          style={{ left: faixa.left, top: faixa.top, width: faixa.width, height: faixa.height }}
        />
      ) : null}
      <div
        role="button"
        data-alca-medicao=""
        aria-label={copiarLinha ? 'Arrastar para copiar a linha' : 'Arrastar fórmula para as células de baixo'}
        title={copiarLinha ? 'Arrastar para copiar a linha' : 'Arrastar para copiar a fórmula'}
        onPointerDown={iniciar}
        className="fixed z-[76] h-[18px] w-[18px] touch-none"
        style={{ left: canto.left - 9, top: canto.top - 9, cursor: CURSOR_MAIS }}
      >
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-white bg-red-600 shadow-sm dark:border-gray-900 dark:bg-red-400" />
      </div>
    </>,
    document.body
  );
}

/** Célula de cabeçalho: borda vermelha no clique e alça para copiar a linha inteira. */
function CelulaCabecalho({
  as: Tag,
  col,
  className,
  style,
  title,
  marca,
  alca,
  readOnly,
  onCopiarLinha,
  children,
}: {
  as: 'th' | 'td';
  col: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  marca?: React.ReactNode;
  alca?: boolean;
  readOnly?: boolean;
  onCopiarLinha?: (ateIdx: number) => void;
  children: React.ReactNode;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState(false);
  const mostrarAlca = !readOnly && !!onCopiarLinha && (foco || !!alca);
  const jaPosicionada = className?.includes('sticky');
  return (
    <Tag
      data-col-medicao={col}
      className={`${jaPosicionada ? 'focus-within:z-[22]' : 'relative focus-within:z-[4]'} !p-0 align-middle ${className ?? ''}`}
      style={style}
      title={title}
      onFocusCapture={() => setFoco(true)}
      onBlurCapture={e => {
        if (alcaMedicaoArrastando) return;
        const prox = e.relatedTarget;
        if (prox instanceof Node && e.currentTarget.contains(prox)) return;
        setFoco(false);
      }}
    >
      {marca}
      <div ref={caixaRef} className={caixaFocoDescricaoCls}>
        {children}
      </div>
      {mostrarAlca ? (
        <AlcaArrastarFormula
          ancoraRef={caixaRef}
          copiarLinha
          onArrastarAbaixo={onCopiarLinha}
          onTerminou={() => {
            requestAnimationFrame(() => {
              const el = caixaRef.current?.querySelector('input, [tabindex]') as HTMLElement | null;
              el?.focus({ preventScroll: true });
            });
          }}
        />
      ) : null}
    </Tag>
  );
}

function teclaHistoricoEdicao(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) return 'undo';
  if (k === 'y' || (k === 'z' && e.shiftKey)) return 'redo';
  return null;
}

function clonarDimensoesMemorial(dim: DimensoesItem): DimensoesItem {
  return JSON.parse(JSON.stringify(dim)) as DimensoesItem;
}

/** Qual painel da memória estava em uso — Ctrl+Z fora do campo (foco no body) volta nele. */
let memorialPainelUndoAtivo: string | null = null;

type GestoEdicaoMemorial = {
  aoFocar: () => void;
  aoEditar: () => void;
  aoSair: () => void;
  suspenderCommitRef: React.MutableRefObject<boolean>;
};

const GestoEdicaoMemorialCtx = React.createContext<GestoEdicaoMemorial | null>(null);

function CampoNumeroFormula({
  value,
  segmentos,
  className,
  inputRef,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  onSelect,
  onClick,
  onArrastarAbaixo,
  editando = true,
  onSubstituir,
  onCopiar,
  onColar,
  onDesfazer,
  onRefazer,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  segmentos: SegmentoFormulaVisivel[] | null;
  inputRef?: (el: HTMLInputElement | null) => void;
  onArrastarAbaixo?: (ateIdx: number) => void;
  /** Sem edição aberta, a célula só fica selecionada: sem cursor, e digitar troca o conteúdo. */
  editando?: boolean;
  onSubstituir?: (texto: string) => void;
  onCopiar?: () => string;
  onColar?: (texto: string) => void;
  onDesfazer?: () => boolean;
  onRefazer?: () => boolean;
}) {
  const formula = String(value ?? '');
  const colorido = Boolean(segmentos && segmentos.length > 0 && formula.trimStart().startsWith('='));
  const textoVisivel = colorido ? segmentos!.map(s => s.texto).join('') : formula;
  const mapHolder = React.useRef<FormulaMapEdicao | null>(null);
  mapHolder.current = colorido ? { segmentos: segmentos!, formula } : null;
  const inputElRef = useRef<HTMLInputElement | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const copiaPendenteRef = useRef<string | null>(null);
  const [focado, setFocado] = useState(false);
  const [estoura, setEstoura] = useState(false);
  const [rolagem, setRolagem] = useState(0);
  const estouraRef = useRef(false);

  const aoMudar = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!onChange) return;
    if (!colorido || !segmentos) {
      onChange(e);
      return;
    }
    const formulaNova = aplicarEdicaoVisivel(formula, segmentos, textoVisivel, e.target.value);
    onChange({
      ...e,
      target: { ...e.target, value: formulaNova },
      currentTarget: { ...e.currentTarget, value: formulaNova },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  useLayoutEffect(() => {
    const el = inputElRef.current;
    if (!el || !focado) {
      setEstoura(false);
      return;
    }
    const texto = el.value;
    if (!texto.trim().startsWith('=')) {
      setEstoura(false);
      return;
    }
    const estilo = window.getComputedStyle(el);
    const probe = document.createElement('span');
    probe.textContent = texto;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.style.font = estilo.font;
    probe.style.letterSpacing = estilo.letterSpacing;
    document.body.appendChild(probe);
    const largura = probe.getBoundingClientRect().width;
    probe.remove();
    const folga =
      (parseFloat(estilo.paddingLeft) || 0) + (parseFloat(estilo.paddingRight) || 0);
    const naoCabe = largura > el.clientWidth - folga + 1;
    estouraRef.current = naoCabe;
    setEstoura(naoCabe);
    if (!naoCabe) setRolagem(0);
  }, [focado, textoVisivel]);

  /** O texto colorido segue a rolagem real do campo; o navegador é quem mantém o cursor à vista. */
  const acompanharCursor = (el: HTMLInputElement) => {
    requestAnimationFrame(() => {
      if (!estouraRef.current && el.scrollLeft !== 0) el.scrollLeft = 0;
      setRolagem(el.scrollLeft);
    });
  };

  useLayoutEffect(() => {
    const el = inputElRef.current;
    if (!el || !focado) return;
    if (estoura) rolarInputAteCaret(el);
    else if (el.scrollLeft !== 0) el.scrollLeft = 0;
    setRolagem(el.scrollLeft);
  }, [focado, estoura, textoVisivel]);

  return (
    <div
      ref={caixaRef}
      className="relative h-full w-full overflow-visible focus-within:z-[3] focus-within:shadow-[inset_0_0_0_2px_#dc2626] dark:focus-within:shadow-[inset_0_0_0_2px_#f87171]"
    >
      {colorido ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-0 box-border !flex !items-center overflow-hidden whitespace-pre ${className ?? ''} !bg-transparent !shadow-none !ring-0 ${
            estoura ? '!justify-start !text-left' : ''
          }`}
        >
          <span
            className={`whitespace-pre ${estoura ? 'w-max' : 'block w-full min-w-0'}`}
            style={estoura ? { transform: `translateX(-${rolagem}px)` } : undefined}
          >
            {segmentos!.map((parte, i) => (
              <span key={i} className={parte.classe}>
                {parte.texto}
              </span>
            ))}
          </span>
        </div>
      ) : null}
      <input
        {...rest}
        ref={el => {
          inputElRef.current = el;
          if (el) formulaMapPorInput.set(el, mapHolder);
          inputRef?.(el);
        }}
        value={textoVisivel}
        onChange={e => {
          aoMudar(e);
          acompanharCursor(e.currentTarget);
        }}
        onScroll={e => setRolagem(e.currentTarget.scrollLeft)}
        onKeyDown={e => {
          const historico = teclaHistoricoEdicao(e);
          if (historico === 'undo' && onDesfazer?.()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (historico === 'redo' && onRefazer?.()) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          const atalho = e.ctrlKey || e.metaKey;
          if (!editando && !e.altKey) {
            if (atalho && e.key.toLowerCase() === 'c' && onCopiar) {
              copiaPendenteRef.current = onCopiar();
              void navigator.clipboard?.writeText(copiaPendenteRef.current).catch(() => {});
              return;
            }
            if (!atalho && onSubstituir && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) {
              e.preventDefault();
              onSubstituir(e.key.length === 1 ? e.key : '');
              requestAnimationFrame(() => {
                const el = inputElRef.current;
                if (!el) return;
                const fim = el.value.length;
                el.setSelectionRange(fim, fim);
              });
              return;
            }
          }
          onKeyDown?.(e);
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
            acompanharCursor(e.currentTarget);
          }
        }}
        onKeyUp={e => {
          onKeyUp?.(e);
          acompanharCursor(e.currentTarget);
        }}
        onSelect={e => {
          onSelect?.(e);
          acompanharCursor(e.currentTarget);
        }}
        onClick={e => {
          onClick?.(e);
          acompanharCursor(e.currentTarget);
        }}
        onCopy={e => {
          const texto = copiaPendenteRef.current;
          copiaPendenteRef.current = null;
          if (editando || texto == null) return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', texto);
        }}
        onPaste={e => {
          if (editando || !onColar) return;
          e.preventDefault();
          onColar(e.clipboardData.getData('text/plain'));
        }}
        onFocus={e => {
          setFocado(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          if (alcaMedicaoArrastando) return;
          setFocado(false);
          setRolagem(0);
          onBlur?.(e);
        }}
        className={`${className ?? ''} relative z-[1] bg-transparent ${estoura ? '!text-left' : ''} ${
          colorido
            ? '!text-transparent caret-gray-900 selection:bg-sky-400/40 selection:text-transparent dark:caret-gray-100 [&::selection]:[-webkit-text-fill-color:transparent]'
            : ''
        } ${editando ? '' : '!caret-transparent cursor-cell selection:bg-transparent'}`}
      />
      {focado && onArrastarAbaixo ? (
        <AlcaArrastarFormula
          ancoraRef={caixaRef}
          onArrastarAbaixo={onArrastarAbaixo}
          onTerminou={() => {
            requestAnimationFrame(() => inputElRef.current?.focus({ preventScroll: true }));
          }}
        />
      ) : null}
      {focado && estoura && inputElRef.current
        ? (
            <DicaFormulaCompleta
              ancora={inputElRef.current}
              segmentos={colorido ? segmentos : null}
              texto={textoVisivel}
            />
          )
        : null}
    </div>
  );
}

/** `{1.1.2!3!A}` ou `{1.1.2!T!SUB}` — T é a linha de total da composição. */
function formulaReferenciaCelula(
  formula: string,
  rotulo: string,
  linha: number | 'T',
  token: string
): boolean {
  const rot = rotulo.trim();
  const alvo = token.toUpperCase() === '%' ? '%' : token.toUpperCase();
  const re = /\{([^{}!]+)!(\d+|T)!(SUB|C|L|H|N|%|A|V)\}/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(formula))) {
    const rotRef = match[1]!.trim();
    const linRef = /^t$/i.test(match[2]!) ? 'T' : Number(match[2]);
    const col = match[3]!.toUpperCase() === '%' ? '%' : match[3]!.toUpperCase();
    if (rotRef === rot && linRef === linha && col === alvo) return true;
  }
  return false;
}

/** Atalho da própria linha (C, A, SUB), ignorando referências entre chaves. */
function formulaUsaTokenCurto(formula: string, token: string): boolean {
  const semExternos = formula.replace(/\{[^{}]*\}/g, ' ');
  if (token === '%') return semExternos.includes('%');
  if (token.toUpperCase() === 'SUB') return /\bSUB\b/i.test(semExternos);
  return new RegExp(`\\b${token}\\b`, 'i').test(semExternos);
}

const MemorialCampoLocal = memo(function MemorialCampoLocal({
  committedValue,
  onCommit,
  className,
  placeholder,
  title,
  inputMode,
  ariaLabel,
  disabled,
  commitOnChange = true,
  onLocalChange,
  onKeyDown,
  onPaste,
  inputRef,
}: {
  committedValue: string;
  onCommit: (raw: string) => void;
  className?: string | ((localValue: string) => string);
  placeholder?: string;
  title?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  ariaLabel?: string;
  disabled?: boolean;
  commitOnChange?: boolean;
  onLocalChange?: (localValue: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  inputRef?: (el: HTMLInputElement | null) => void;
}) {
  const [local, setLocal] = useState(committedValue);
  const focusedRef = useRef(false);
  const localRef = useRef(local);
  localRef.current = local;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onLocalChangeRef = useRef(onLocalChange);
  onLocalChangeRef.current = onLocalChange;
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTxtRef = useRef<string[]>([]);
  const redoTxtRef = useRef<string[]>([]);
  const aplicandoTxtRef = useRef(false);
  const gesto = React.useContext(GestoEdicaoMemorialCtx);

  useEffect(() => {
    if (!focusedRef.current) setLocal(committedValue);
  }, [committedValue]);

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    []
  );

  const flushCommit = (value: string) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    onCommitRef.current(value);
  };

  const resolvedClassName = typeof className === 'function' ? className(local) : className;

  const aplicarTextoLocal = (valor: string) => {
    aplicandoTxtRef.current = true;
    localRef.current = valor;
    setLocal(valor);
    onLocalChangeRef.current?.(valor);
    if (commitOnChange) {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        onCommitRef.current(valor);
      }, MEMORIAL_COMMIT_MS);
    }
    aplicandoTxtRef.current = false;
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      autoComplete="off"
      className={resolvedClassName}
      value={local}
      onKeyDown={e => {
        const historico = teclaHistoricoEdicao(e);
        if (historico === 'undo' && undoTxtRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const atual = localRef.current;
          const prev = undoTxtRef.current.pop()!;
          redoTxtRef.current.push(atual);
          aplicarTextoLocal(prev);
          requestAnimationFrame(() => {
            const fim = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(fim, fim);
          });
          return;
        }
        if (historico === 'redo' && redoTxtRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const atual = localRef.current;
          const next = redoTxtRef.current.pop()!;
          undoTxtRef.current.push(atual);
          aplicarTextoLocal(next);
          requestAnimationFrame(() => {
            const fim = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(fim, fim);
          });
          return;
        }
        onKeyDown?.(e);
      }}
      onPaste={onPaste}
      onFocus={() => {
        focusedRef.current = true;
        undoTxtRef.current = [];
        redoTxtRef.current = [];
        gesto?.aoFocar();
      }}
      onChange={(e) => {
        const next = e.target.value;
        if (!aplicandoTxtRef.current && next !== localRef.current) {
          undoTxtRef.current.push(localRef.current);
          if (undoTxtRef.current.length > 120) undoTxtRef.current.shift();
          redoTxtRef.current = [];
          gesto?.aoEditar();
        }
        localRef.current = next;
        setLocal(next);
        onLocalChangeRef.current?.(next);
        if (!commitOnChange) return;
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          onCommitRef.current(next);
        }, MEMORIAL_COMMIT_MS);
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (gesto?.suspenderCommitRef.current) return;
        flushCommit(localRef.current);
        undoTxtRef.current = [];
        redoTxtRef.current = [];
        gesto?.aoSair();
      }}
    />
  );
});

export const OrcamentoMedicaoPainel = memo(function OrcamentoMedicaoPainel({
  rowKey,
  tipoUnidade,
  itemRotulo,
  itemDescricao,
  unidadeMedida,
  dim,
  ehCargaEntulho,
  updateLinhaMedicao,
  updateRotuloColunaMedicao,
  updateObservacaoMedicao,
  addLinhaMedicao,
  inserirLinhasMedicao,
  addLinhaCabecalhoSecaoMedicao,
  removeLinhaMedicao,
  estiloTitulo,
  readOnly = false,
  embedded = false,
  memoriasDisponiveis = [],
  onMemoriasIncluidasChange,
  resolverFormulaExterna,
  restaurarDimensoes,
}: Props) {
  const tipo = tipoUnidade;
  const linhasEfetivas = linhasMedicaoEfetivas(dim);
  const [modalMemoriasAberto, setModalMemoriasAberto] = useState(false);

  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const draftCalcRef = useRef<Record<string, string>>({});
  const [focusedCalcKey, setFocusedCalcKey] = useState<string | null>(null);
  const calcCommitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const calcInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const calcCommittersRef = useRef<Record<string, (n: number, formulaRaw: string) => void>>({});
  const calcRowCtxRef = useRef<Record<string, FormulaRowCtx>>({});
  const calcSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const descInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const resolverFormulaRef = useRef(resolverFormulaExterna);
  resolverFormulaRef.current = resolverFormulaExterna;
  const pickApi = useMemorialFormulaPick();
  const pickApiRef = useRef(pickApi);
  pickApiRef.current = pickApi;

  const dimRef = useRef(dim);
  dimRef.current = dim;
  const restaurarDimRef = useRef(restaurarDimensoes);
  restaurarDimRef.current = restaurarDimensoes;
  const suspenderCommitRef = useRef(false);
  const restaurandoRef = useRef(false);
  const undoDimRef = useRef<DimensoesItem[]>([]);
  const redoDimRef = useRef<DimensoesItem[]>([]);
  const gestoRef = useRef<{ antes: DimensoesItem; sujo: boolean } | null>(null);
  const abrirQuandoDimAtualizarRef = useRef(false);
  const historicoTextoRef = useRef<{ key: string; undo: string[]; redo: string[] } | null>(null);
  const aplicandoHistoricoRef = useRef(false);
  const textoCelulaRef = useRef<(draftKey: string) => string>(() => '');
  const desfazerRef = useRef<() => boolean>(() => false);
  const refazerRef = useRef<() => boolean>(() => false);
  const desfazerTextoRef = useRef<() => boolean>(() => false);
  const refazerTextoRef = useRef<() => boolean>(() => false);
  const comUndoRef = useRef<(fn: () => void) => void>(() => {});

  const aoEditarGesto = () => {
    if (readOnly || restaurandoRef.current) return;
    memorialPainelUndoAtivo = rowKey;
    if (!gestoRef.current) {
      if (abrirQuandoDimAtualizarRef.current) return;
      gestoRef.current = { antes: clonarDimensoesMemorial(dimRef.current), sujo: true };
      return;
    }
    gestoRef.current.sujo = true;
  };

  const abrirGesto = () => {
    if (readOnly || restaurandoRef.current) return;
    memorialPainelUndoAtivo = rowKey;
    if (gestoRef.current) return;
    if (abrirQuandoDimAtualizarRef.current) return;
    gestoRef.current = { antes: clonarDimensoesMemorial(dimRef.current), sujo: false };
  };

  const fecharGesto = () => {
    if (restaurandoRef.current) {
      gestoRef.current = null;
      historicoTextoRef.current = null;
      return;
    }
    const g = gestoRef.current;
    if (!g) return;
    gestoRef.current = null;
    historicoTextoRef.current = null;
    if (!g.sujo) return;
    undoDimRef.current.push(g.antes);
    if (undoDimRef.current.length > 60) undoDimRef.current.shift();
    redoDimRef.current = [];
    abrirQuandoDimAtualizarRef.current = true;
  };

  const comUndo = (fn: () => void) => {
    if (readOnly || restaurandoRef.current) {
      fn();
      return;
    }
    memorialPainelUndoAtivo = rowKey;
    historicoTextoRef.current = null;
    if (gestoRef.current?.sujo) {
      undoDimRef.current.push(gestoRef.current.antes);
    }
    gestoRef.current = null;
    const antes = clonarDimensoesMemorial(dimRef.current);
    const topo = undoDimRef.current[undoDimRef.current.length - 1];
    const topoIgual = topo != null && JSON.stringify(topo) === JSON.stringify(antes);
    fn();
    if (!topoIgual) undoDimRef.current.push(antes);
    if (undoDimRef.current.length > 60) {
      undoDimRef.current.splice(0, undoDimRef.current.length - 60);
    }
    redoDimRef.current = [];
  };
  comUndoRef.current = comUndo;

  const anotarTextoCalc = (draftKey: string, anterior: string, proximo: string) => {
    if (aplicandoHistoricoRef.current || anterior === proximo) return;
    const h = historicoTextoRef.current;
    if (!h || h.key !== draftKey) {
      historicoTextoRef.current = { key: draftKey, undo: [anterior], redo: [] };
    } else {
      h.undo.push(anterior);
      if (h.undo.length > 120) h.undo.shift();
      h.redo = [];
    }
    aoEditarGesto();
  };

  const gestoEdicao: GestoEdicaoMemorial = {
    aoFocar: abrirGesto,
    aoEditar: aoEditarGesto,
    aoSair: fecharGesto,
    suspenderCommitRef,
  };

  const formulaMode = useMemo(() => {
    if (!focusedCalcKey) return null;
    const draft = draftCalc[focusedCalcKey];
    const text = draft != null ? draft : '';
    if (!String(text).trimStart().startsWith('=')) return null;
    const parsed = parseDraftKeyMedicao(focusedCalcKey);
    if (!parsed) return null;
    return { draftKey: focusedCalcKey, idx: parsed.idx, campo: parsed.campo };
  }, [focusedCalcKey, draftCalc]);

  const syncCalcSelection = (el: HTMLInputElement | null) => {
    if (!el) return;
    const map = mapaFormulaDoInput(el);
    let start = el.selectionStart ?? el.value.length;
    let end = el.selectionEnd ?? start;
    if (map?.segmentos.length) {
      start = posVisivelParaFormula(map.segmentos, start);
      end = posVisivelParaFormula(map.segmentos, end);
    }
    calcSelectionRef.current = { start, end };
  };

  const handleCalcBlur = useCallback(
    (
      draftKey: string,
      raw: string,
      onCommit: (n: number, formulaRaw: string) => void,
      rowCtx?: FormulaRowCtx
    ) => {
      const pending = calcCommitTimersRef.current[draftKey];
      if (pending) {
        clearTimeout(pending);
        delete calcCommitTimersRef.current[draftKey];
      }
      const text = mascaraMedicaoCentavos(String(raw ?? ''));
      const n = parseMedicaoBlurNumber(
        text,
        rowCtx ?? calcRowCtxRef.current[draftKey],
        resolverFormulaRef.current
      );
      onCommit(n ?? 0, text);
      setFocusedCalcKey((k) => (k === draftKey ? null : k));
      if (draftKey in draftCalcRef.current) {
        const next = { ...draftCalcRef.current };
        delete next[draftKey];
        draftCalcRef.current = next;
        setDraftCalc(next);
      }
    },
    []
  );

  const handleCalcChange = useCallback(
    (
      draftKey: string,
      raw: string,
      onCommit: (n: number, formulaRaw: string) => void,
      rowCtx?: FormulaRowCtx
    ) => {
      if (readOnly) return;
      const text = mascaraMedicaoCentavos(String(raw ?? ''));
      const anterior =
        draftKey in draftCalcRef.current
          ? draftCalcRef.current[draftKey]!
          : textoCelulaRef.current(draftKey);
      anotarTextoCalc(draftKey, anterior, text);
      const nextDraft = { ...draftCalcRef.current, [draftKey]: text };
      draftCalcRef.current = nextDraft;
      setDraftCalc(nextDraft);
      calcCommittersRef.current[draftKey] = onCommit;
      if (rowCtx) calcRowCtxRef.current[draftKey] = rowCtx;
      const timers = calcCommitTimersRef.current;
      if (timers[draftKey]) clearTimeout(timers[draftKey]);
      timers[draftKey] = setTimeout(() => {
        delete timers[draftKey];
        const atual = draftCalcRef.current[draftKey];
        if (atual == null) return;
        const n = parseMedicaoBlurNumber(
          atual,
          rowCtx ?? calcRowCtxRef.current[draftKey],
          resolverFormulaRef.current
        );
        if (n === null && atual.trim() !== '') return;
        onCommit(n ?? 0, atual);
      }, MEMORIAL_COMMIT_MS);
    },
    [readOnly]
  );

  const valorExibicaoCalc = (draftKey: string, _formula: string | undefined, valorFormatado: string) => {
    if (draftKey in draftCalc) return draftCalc[draftKey];
    return valorFormatado;
  };

  const focarCalc = (draftKey: string) => {
    abrirGesto();
    setFocusedCalcKey((k) => (k === draftKey ? k : draftKey));
  };

  const entrarNoCalculo = (draftKey: string, formula: string | undefined, valorFormatado: string) => {
    if (readOnly) return;
    const salva = String(formula ?? '').trim();
    const texto = salva.startsWith('=') ? salva : (draftCalcRef.current[draftKey] ?? valorFormatado);
    setFocusedCalcKey(draftKey);
    const nextDraft = { ...draftCalcRef.current, [draftKey]: texto };
    draftCalcRef.current = nextDraft;
    setDraftCalc(nextDraft);
    window.setTimeout(() => {
      const el = calcInputRefs.current[draftKey];
      if (!el) return;
      el.focus();
      const fim = el.value.length;
      el.setSelectionRange(fim, fim);
    }, 0);
  };

  const sairCalc = (
    draftKey: string,
    onCommit: (n: number, formulaRaw: string) => void,
    rowCtx: FormulaRowCtx | undefined
  ) => {
    const atual = draftCalcRef.current[draftKey];
    if (atual == null) {
      setFocusedCalcKey((k) => (k === draftKey ? null : k));
      fecharGesto();
      return;
    }
    handleCalcBlur(draftKey, atual, onCommit, rowCtx);
    fecharGesto();
  };

  const copiaCelula = useCopiaCelulaMedicao();
  const [selecao, setSelecao] = useState<FaixaMedicao | null>(null);
  const tabelaWrapRef = useRef<HTMLDivElement | null>(null);
  const tabelaScrollRef = useRef<HTMLDivElement | null>(null);

  const linhaDadosDe = (i: number) =>
    linhasEfetivas.slice(0, i + 1).filter(l => !l.cabecalhoSecao).length;

  const linhasDadosDaFaixa = (f: FaixaMedicao) => {
    const out: number[] = [];
    for (let i = f.idxIni; i <= f.idxFim && i < linhasEfetivas.length; i += 1) {
      if (linhasEfetivas[i] && !linhasEfetivas[i]!.cabecalhoSecao) out.push(i);
    }
    return out;
  };

  /** Rótulos, linhas de seção e dados — o que a borda e a cópia enxergam. */
  const linhasVisiveisDaFaixa = (f: FaixaMedicao) => {
    const out: number[] = [];
    if (f.idxIni <= LINHA_ROTULOS && f.idxFim >= LINHA_ROTULOS) out.push(LINHA_ROTULOS);
    for (let i = Math.max(0, f.idxIni); i <= f.idxFim && i < linhasEfetivas.length; i += 1) out.push(i);
    return out;
  };

  const faixaVisivel = (f: FaixaMedicao | null | undefined): FaixaMedicao | null => {
    if (!f) return null;
    const linhas = linhasVisiveisDaFaixa(f);
    if (!linhas.length) return null;
    return { ...f, idxIni: linhas[0]!, idxFim: linhas[linhas.length - 1]! };
  };

  const textoCabecalho = (linhaIdx: number, col: ColunaMedicao): string => {
    if (col === 'descricao') {
      if (linhaIdx < 0) return dim.rotulosColunas?.descricao ?? 'DESCRIÇÃO: ';
      return linhasEfetivas[linhaIdx]?.descricao ?? 'DESCRIÇÃO: ';
    }
    if (col === 'C' || col === 'L' || col === 'H' || col === 'N') return dim.rotulosColunas?.[col]?.trim() || col;
    if (col === 'empol') return dim.rotulosColunas?.pct?.trim() || '%';
    if (col === 'A') return 'A';
    if (col === 'V') return 'V';
    return 'Subtotal';
  };

  const textoCelulaMedicao = (ln: LinhaMedicao, col: ColunaMedicao): string => {
    const f = ln.formulas;
    const comFormula = (formula: string | undefined, n: number) => {
      const s = String(formula ?? '').trim();
      return s.startsWith('=') ? s : formatMedicaoCampo(n);
    };
    if (col === 'descricao') return ln.descricao ?? '';
    if (col === 'C' || col === 'L' || col === 'H' || col === 'N') return comFormula(f?.[col], ln[col] || 0);
    if (col === 'empol') return comFormula(f?.empolamento, Number(ln.empolamento) || 0);
    if (col === 'A') return comFormula(f?.aManual ?? f?.valorManual, areaExibidaLinha(ln));
    if (col === 'V') return comFormula(f?.vManual ?? f?.valorManual, volumeExibidoLinha(ln, tipo));
    return comFormula(f?.subtotalManual, calcularQuantidadeLinha(ln, tipo));
  };

  textoCelulaRef.current = (draftKey: string) => {
    const parsed = parseDraftKeyMedicao(draftKey);
    if (!parsed) return '';
    const ln = linhasEfetivas[parsed.idx];
    if (!ln) return '';
    const campo = parsed.campo;
    if (
      campo === 'descricao' ||
      campo === 'C' ||
      campo === 'L' ||
      campo === 'H' ||
      campo === 'N' ||
      campo === 'empol' ||
      campo === 'A' ||
      campo === 'V' ||
      campo === 'subtotal'
    ) {
      return textoCelulaMedicao(ln, campo);
    }
    return '';
  };

  const aplicarTextoCalc = (draftKey: string, texto: string) => {
    const onCommit = calcCommittersRef.current[draftKey];
    const rowCtx = calcRowCtxRef.current[draftKey];
    aplicandoHistoricoRef.current = true;
    try {
      if (onCommit) handleCalcChange(draftKey, texto, onCommit, rowCtx);
      else {
        const nextDraft = { ...draftCalcRef.current, [draftKey]: texto };
        draftCalcRef.current = nextDraft;
        setDraftCalc(nextDraft);
      }
    } finally {
      aplicandoHistoricoRef.current = false;
    }
    requestAnimationFrame(() => {
      const el = calcInputRefs.current[draftKey];
      if (!el) return;
      el.focus();
      const fim = el.value.length;
      try {
        el.setSelectionRange(fim, fim);
      } catch {
        /* campo sem seleção */
      }
    });
  };

  const desfazerTexto = () => {
    const h = historicoTextoRef.current;
    if (!h || h.undo.length === 0) return false;
    const el = calcInputRefs.current[h.key];
    if (!el || document.activeElement !== el) return false;
    const atual = draftCalcRef.current[h.key] ?? textoCelulaRef.current(h.key);
    const prev = h.undo.pop()!;
    h.redo.push(atual);
    aplicarTextoCalc(h.key, prev);
    return true;
  };

  const refazerTexto = () => {
    const h = historicoTextoRef.current;
    if (!h || h.redo.length === 0) return false;
    const el = calcInputRefs.current[h.key];
    if (!el || document.activeElement !== el) return false;
    const atual = draftCalcRef.current[h.key] ?? textoCelulaRef.current(h.key);
    const next = h.redo.pop()!;
    h.undo.push(atual);
    aplicarTextoCalc(h.key, next);
    return true;
  };

  const limparRascunhoCalc = () => {
    Object.values(calcCommitTimersRef.current).forEach(clearTimeout);
    calcCommitTimersRef.current = {};
    draftCalcRef.current = {};
    setDraftCalc({});
    setFocusedCalcKey(null);
    historicoTextoRef.current = null;
  };

  const aplicarRestauracao = (proximo: DimensoesItem) => {
    restaurandoRef.current = true;
    suspenderCommitRef.current = true;
    gestoRef.current = null;
    abrirQuandoDimAtualizarRef.current = false;
    limparRascunhoCalc();
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && tabelaWrapRef.current?.contains(ae)) ae.blur();
    restaurarDimRef.current?.(clonarDimensoesMemorial(proximo));
    suspenderCommitRef.current = false;
    restaurandoRef.current = false;
  };

  const desfazerMemorial = () => {
    if (readOnly) return false;
    if (desfazerTexto()) return true;
    const gesto = gestoRef.current;
    if (gesto?.sujo) {
      const atual = clonarDimensoesMemorial(dimRef.current);
      const dimDiferente = JSON.stringify(gesto.antes) !== JSON.stringify(atual);
      const draftDiferente = Object.entries(draftCalcRef.current).some(
        ([k, v]) => v !== textoCelulaRef.current(k)
      );
      if (dimDiferente || draftDiferente) {
        gestoRef.current = null;
        redoDimRef.current.push(atual);
        aplicarRestauracao(gesto.antes);
        return true;
      }
    }
    const antes = undoDimRef.current.pop();
    if (!antes) return false;
    redoDimRef.current.push(clonarDimensoesMemorial(dimRef.current));
    aplicarRestauracao(antes);
    return true;
  };

  const refazerMemorial = () => {
    if (readOnly) return false;
    if (refazerTexto()) return true;
    if (gestoRef.current?.sujo) return false;
    const depois = redoDimRef.current.pop();
    if (!depois) return false;
    undoDimRef.current.push(clonarDimensoesMemorial(dimRef.current));
    aplicarRestauracao(depois);
    return true;
  };

  desfazerRef.current = desfazerMemorial;
  refazerRef.current = refazerMemorial;
  desfazerTextoRef.current = desfazerTexto;
  refazerTextoRef.current = refazerTexto;

  const copiarFaixa = (f: FaixaMedicao) => {
    const linhas = linhasVisiveisDaFaixa(f);
    if (!linhas.length) return '';
    const tiposLinha: TipoLinhaCopiaMedicao[] = [];
    const celulas = linhas.map(i => {
      const linha: string[] = [];
      if (i < 0) {
        tiposLinha.push('rotulos');
        for (let c = f.colIni; c <= f.colFim; c += 1) linha.push(textoCabecalho(i, COLUNAS_MEDICAO[c]!));
        return linha;
      }
      const ln = linhasEfetivas[i]!;
      if (ln.cabecalhoSecao) {
        tiposLinha.push('secao');
        for (let c = f.colIni; c <= f.colFim; c += 1) linha.push(textoCabecalho(i, COLUNAS_MEDICAO[c]!));
        return linha;
      }
      tiposLinha.push('dados');
      for (let c = f.colIni; c <= f.colFim; c += 1) linha.push(textoCelulaMedicao(ln, COLUNAS_MEDICAO[c]!));
      return linha;
    });
    const texto = celulas.map(l => l.join('\t')).join('\n');
    const primeiraDados = linhas.find(i => i >= 0 && !linhasEfetivas[i]?.cabecalhoSecao);
    definirCopiaCelulaMedicao({
      rowKey,
      rotulo: itemRotulo,
      faixa: f,
      linhaDados: primeiraDados == null ? 1 : linhaDadosDe(primeiraDados),
      celulas,
      tiposLinha,
      texto,
    });
    return texto;
  };

  /** Grava uma célula e devolve a linha já atualizada, para as próximas colunas usarem os valores novos. */
  const gravarCelulaMedicao = (i: number, col: ColunaMedicao, bruto: string, local: LinhaMedicao): LinhaMedicao => {
    if (col === 'descricao') {
      updateLinhaMedicao(rowKey, i, 'descricao', bruto);
      return { ...local, descricao: bruto };
    }
    const valor = String(bruto ?? '').trim();
    const vazio = valor === '' || valor === '=';
    const n = vazio ? 0 : parseMedicaoBlurNumber(valor, contextoLinhaMedicao(local), resolverFormulaRef.current);
    if (n === null) return local;
    const opts = { formulaRaw: vazio ? '' : valor };
    if (col === 'C' || col === 'L' || col === 'H' || col === 'N') {
      const v = col === 'N' ? Math.max(0, n) : n;
      updateLinhaMedicao(rowKey, i, col, v, opts);
      return { ...local, [col]: v };
    }
    if (col === 'empol') {
      const v = Math.max(0, n);
      updateLinhaMedicao(rowKey, i, 'empolamento', v, opts);
      return { ...local, empolamento: v };
    }
    const campoLinha: keyof LinhaMedicao =
      col === 'subtotal' ? 'subtotalManual' : col === 'A' ? 'aManual' : 'vManual';
    updateLinhaMedicao(rowKey, i, campoLinha, vazio ? '' : n, opts);
    return { ...local, [campoLinha]: vazio ? undefined : n };
  };

  const gravarRotulo = (col: ColunaMedicao | undefined, bruto: string) => {
    if (!col || !updateRotuloColunaMedicao) return;
    const texto = bruto.trim();
    if (col === 'descricao') updateRotuloColunaMedicao('descricao', texto || 'DESCRIÇÃO: ');
    else if (col === 'C' || col === 'L' || col === 'H' || col === 'N') updateRotuloColunaMedicao(col, texto || col);
    else if (col === 'empol') updateRotuloColunaMedicao('pct', texto || '%');
  };

  const descricaoCopiada = (row: string[], colIni: number) => {
    const off = -colIni;
    if (off >= 0 && off < row.length) return row[off]?.trim() || 'DESCRIÇÃO: ';
    return 'DESCRIÇÃO: ';
  };

  /** Cola rótulos no cabeçalho, ou insere uma linha de cabeçalho sem mexer nas medidas. */
  const colarCabecalhos = (destIdx: number, destCol: number, bloco: string[][]) => {
    if (destIdx < 0) {
      bloco[0]?.forEach((texto, c) => gravarRotulo(COLUNAS_MEDICAO[destCol + c], texto));
      const extras = bloco.slice(1).map(row => descricaoCopiada(row, destCol));
      if (extras.length) addLinhaCabecalhoSecaoMedicao(rowKey, -1, extras);
      setSelecao({
        idxIni: LINHA_ROTULOS,
        idxFim: LINHA_ROTULOS,
        colIni: destCol,
        colFim: Math.min(COLUNAS_MEDICAO.length - 1, destCol + (bloco[0]?.length ?? 1) - 1),
      });
      return;
    }
    const alvo = linhasEfetivas[destIdx];
    if (alvo?.cabecalhoSecao) {
      bloco.forEach((row, r) => {
        const i = destIdx + r;
        const ln = linhasEfetivas[i];
        if (!ln?.cabecalhoSecao) return;
        const offDesc = -destCol;
        if (offDesc >= 0 && offDesc < row.length) updateLinhaMedicao(rowKey, i, 'descricao', row[offDesc] ?? '');
        row.forEach((texto, c) => {
          const col = COLUNAS_MEDICAO[destCol + c];
          if (col && col !== 'descricao') gravarRotulo(col, texto);
        });
      });
      return;
    }
    if (destCol !== 0) return;
    const descricoes = bloco.map(row => descricaoCopiada(row, destCol));
    addLinhaCabecalhoSecaoMedicao(rowKey, destIdx - 1, descricoes);
    setSelecao({
      idxIni: destIdx,
      idxFim: destIdx + descricoes.length - 1,
      colIni: 0,
      colFim: COLUNAS_MEDICAO.length - 1,
    });
  };

  /** Aplica o texto de uma célula na linha, inclusive fórmula, sem gravar no pai. */
  const aplicarCelulaNaLinha = (local: LinhaMedicao, col: ColunaMedicao, bruto: string): LinhaMedicao => {
    if (col === 'descricao') return { ...local, descricao: bruto };
    const valor = String(bruto ?? '').trim();
    const vazio = valor === '' || valor === '=';
    const n = vazio ? 0 : parseMedicaoBlurNumber(valor, contextoLinhaMedicao(local), resolverFormulaRef.current);
    if (n === null) return local;
    const formulaRaw = vazio ? '' : valor;
    const next: LinhaMedicao = { ...local, formulas: local.formulas ? { ...local.formulas } : undefined };
    const setFormula = (campo: CampoFormulaMedicao) => {
      const formulas = { ...(next.formulas ?? {}) };
      if (formulaRaw.startsWith('=')) formulas[campo] = formulaRaw;
      else delete formulas[campo];
      next.formulas = Object.keys(formulas).length > 0 ? formulas : undefined;
    };
    if (col === 'C' || col === 'L' || col === 'H' || col === 'N') {
      next[col] = col === 'N' ? Math.max(0, n) : n;
      setFormula(col);
      return next;
    }
    if (col === 'empol') {
      next.empolamento = Math.max(0, n);
      setFormula('empolamento');
      return next;
    }
    const campo = col === 'subtotal' ? 'subtotalManual' : col === 'A' ? 'aManual' : 'vManual';
    if (vazio) delete next[campo];
    else next[campo] = n;
    setFormula(campo);
    return next;
  };

  /**
   * Cola um bloco que mistura cabeçalho (rótulos ou linha de seção) e medidas.
   * O cabeçalho entra na mesma posição, em vez de ser descartado.
   */
  const colarBlocoComCabecalho = (
    destIdx: number,
    destCol: number,
    bloco: string[][],
    tipos: TipoLinhaCopiaMedicao[],
    origem: CopiaCelulaMedicao | null
  ) => {
    const dimBase = clonarDimensoesMemorial(dim);
    const linhas: LinhaMedicao[] = (dimBase.linhas ?? []).map(ln => ({
      ...ln,
      formulas: ln.formulas ? { ...ln.formulas } : undefined,
    }));
    const rotulos = { ...(dimBase.rotulosColunas ?? {}) };
    let cursor = destIdx < 0 ? 0 : destIdx;
    const marcados: number[] = [];
    let colFim = destCol;
    let dadosEscritos = 0;

    const aplicarRotulo = (col: ColunaMedicao | undefined, bruto: string) => {
      if (!col) return;
      const texto = String(bruto ?? '').trim();
      if (col === 'descricao') rotulos.descricao = texto || 'DESCRIÇÃO: ';
      else if (col === 'C' || col === 'L' || col === 'H' || col === 'N') rotulos[col] = texto || col;
      else if (col === 'empol') rotulos.pct = texto || '%';
    };

    for (let r = 0; r < bloco.length; r += 1) {
      const tipo = tipos[r] ?? 'dados';
      const row = bloco[r] ?? [];
      if (tipo === 'rotulos') {
        row.forEach((texto, c) => {
          const col = COLUNAS_MEDICAO[destCol + c];
          if (!col) return;
          colFim = Math.max(colFim, destCol + c);
          aplicarRotulo(col, texto);
        });
        if (destIdx < 0) {
          marcados.push(LINHA_ROTULOS);
          continue;
        }
      }
      if (tipo === 'secao' || (tipo === 'rotulos' && destIdx >= 0)) {
        const offDesc = -destCol;
        const descInformada = offDesc >= 0 && offDesc < row.length;
        const desc = descInformada
          ? row[offDesc]?.trim() || 'DESCRIÇÃO: '
          : linhas[cursor]?.cabecalhoSecao
            ? (linhas[cursor]?.descricao ?? 'DESCRIÇÃO: ')
            : 'DESCRIÇÃO: ';
        if (linhas[cursor]?.cabecalhoSecao) {
          linhas[cursor] = { ...linhas[cursor]!, descricao: desc };
        } else {
          linhas.splice(cursor, 0, {
            cabecalhoSecao: true,
            descricao: desc,
            C: 0,
            L: 0,
            H: 0,
            N: 0,
            empolamento: 0,
          });
        }
        row.forEach((texto, c) => {
          const col = COLUNAS_MEDICAO[destCol + c];
          if (!col || col === 'descricao') return;
          colFim = Math.max(colFim, destCol + c);
          aplicarRotulo(col, texto);
        });
        marcados.push(cursor);
        cursor += 1;
        continue;
      }
      while (cursor < linhas.length && linhas[cursor]?.cabecalhoSecao) cursor += 1;
      if (cursor >= linhas.length) {
        linhas.push({ descricao: '', C: 0, L: 0, H: 0, N: 0, empolamento: 0 });
      }
      let local = { ...linhas[cursor]! };
      const numDados = linhas.slice(0, cursor + 1).filter(l => !l.cabecalhoSecao).length;
      const delta =
        origem && origem.rowKey === rowKey ? numDados - (origem.linhaDados + dadosEscritos) : 0;
      row.forEach((texto, c) => {
        const col = COLUNAS_MEDICAO[destCol + c];
        if (!col) return;
        colFim = Math.max(colFim, destCol + c);
        const t = delta ? deslocarFormulaLinhas(texto, itemRotulo, delta) : texto;
        local = aplicarCelulaNaLinha(local, col, t);
      });
      linhas[cursor] = local;
      marcados.push(cursor);
      dadosEscritos += 1;
      cursor += 1;
    }

    restaurarDimRef.current?.({
      ...dimBase,
      linhas,
      rotulosColunas: rotulos,
    });

    const idxs = marcados.filter(i => i >= 0);
    if (destIdx < 0 && tipos.includes('rotulos')) {
      setSelecao({
        idxIni: LINHA_ROTULOS,
        idxFim: idxs.length ? idxs[idxs.length - 1]! : LINHA_ROTULOS,
        colIni: destCol,
        colFim,
      });
      return;
    }
    if (!idxs.length) return;
    setSelecao({ idxIni: idxs[0]!, idxFim: idxs[idxs.length - 1]!, colIni: destCol, colFim });
  };

  const colarBloco = (destIdx: number, destCol: number, bloco: string[][], origem: CopiaCelulaMedicao | null) => {
    if (readOnly || !bloco.length) return;
    const tipos = origem?.tiposLinha;
    if (tipos && tipos.length === bloco.length && tipos.some(t => t !== 'dados')) {
      colarBlocoComCabecalho(destIdx, destCol, bloco, tipos, origem);
      return;
    }
    const inicio = Math.max(0, destIdx);
    const destinos: number[] = [];
    for (let i = inicio; i < linhasEfetivas.length && destinos.length < bloco.length; i += 1) {
      if (!linhasEfetivas[i]!.cabecalhoSecao) destinos.push(i);
    }
    const faltam = bloco.length - destinos.length;
    /** Última linha já existente que recebe o bloco; as novas entram logo abaixo dela. */
    const aposIdx = destinos.length > 0
      ? destinos[destinos.length - 1]!
      : (inicio < linhasEfetivas.length ? inicio : linhasEfetivas.length - 1);
    if (faltam > 0) {
      inserirLinhasMedicao(rowKey, aposIdx, faltam);
      for (let k = 0; k < faltam; k += 1) destinos.push(aposIdx + 1 + k);
    }
    if (!destinos.length) return;
    const mesmaMemoria = origem?.rowKey === rowKey;
    const dadosAteAncora = aposIdx >= 0 && aposIdx < linhasEfetivas.length ? linhaDadosDe(aposIdx) : 0;
    const numeroLinhaDados = (i: number) =>
      faltam > 0 && i > aposIdx ? dadosAteAncora + (i - aposIdx) : linhaDadosDe(i);
    let colFim = destCol;
    destinos.forEach((i, r) => {
      const linhaLocal = i < linhasEfetivas.length ? linhasEfetivas[i]! : { descricao: '', C: 0, L: 0, H: 0, N: 0, empolamento: 0 };
      let local = linhaLocal;
      const delta = mesmaMemoria ? numeroLinhaDados(i) - (origem!.linhaDados + r) : 0;
      bloco[r]!.forEach((texto, c) => {
        const col = COLUNAS_MEDICAO[destCol + c];
        if (!col) return;
        colFim = Math.max(colFim, destCol + c);
        const t = delta ? deslocarFormulaLinhas(texto, itemRotulo, delta) : texto;
        local = gravarCelulaMedicao(i, col, t, local);
      });
    });
    if (destinos.length > 1 || colFim > destCol) {
      setSelecao({ idxIni: destinos[0]!, idxFim: destinos[destinos.length - 1]!, colIni: destCol, colFim });
    }
  };

  const colarTexto = (idx: number, col: number, textoColado: string) => {
    const copia = copiaCelulaMedicao;
    const texto = String(textoColado ?? '');
    const bloco =
      copia && (texto.trim() === '' || mesmoTextoCopiado(texto, copia.texto))
        ? copia.celulas
        : texto
          ? blocoDoTexto(texto)
          : null;
    if (!bloco?.length) return;
    comUndo(() => colarBloco(idx, col, bloco, copia && bloco === copia.celulas ? copia : null));
  };

  const copiarCelula = (idx: number, col: ColunaMedicao) =>
    copiarFaixa({ idxIni: idx, idxFim: idx, colIni: COLUNAS_MEDICAO.indexOf(col), colFim: COLUNAS_MEDICAO.indexOf(col) });

  const colarCelula = (idx: number, col: ColunaMedicao, texto: string) =>
    colarTexto(idx, COLUNAS_MEDICAO.indexOf(col), texto);

  const celulaDoAlvo = (alvo: Element | null) => {
    const td = alvo?.closest('[data-col-medicao]');
    const tr = td?.closest('[data-linha-medicao]');
    if (!td || !tr || !tabelaWrapRef.current?.contains(tr)) return null;
    const idx = Number(tr.getAttribute('data-linha-medicao'));
    const col = Number(td.getAttribute('data-col-medicao'));
    return Number.isFinite(idx) && Number.isFinite(col) ? { idx, col } : null;
  };

  const iniciarSelecaoFaixa = (e: React.MouseEvent) => {
    memorialPainelUndoAtivo = rowKey;
    if (e.button !== 0 || readOnly || pickApiRef.current?.session) return;
    const ini = celulaDoAlvo(e.target as Element);
    setSelecao(null);
    if (!ini) return;
    let arrastou = false;
    const mover = (ev: MouseEvent) => {
      const atual = celulaDoAlvo(document.elementFromPoint(ev.clientX, ev.clientY));
      if (!atual) return;
      if (!arrastou && atual.idx === ini.idx && atual.col === ini.col) return;
      if (!arrastou) {
        arrastou = true;
        document.documentElement.classList.add('medicao-selecionando');
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      window.getSelection()?.removeAllRanges();
      setSelecao(normalizarFaixa(ini, atual));
    };
    const soltar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      document.documentElement.classList.remove('medicao-selecionando');
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  };

  const selecaoRef = useRef<FaixaMedicao | null>(null);
  selecaoRef.current = selecao;
  const acoesFaixaRef = useRef({ copiarFaixa, colarTexto, gravarCelulaMedicao, linhasDadosDaFaixa });
  acoesFaixaRef.current = { copiarFaixa, colarTexto, gravarCelulaMedicao, linhasDadosDaFaixa };

  useEffect(() => {
    if (!selecao) return;
    const editando = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
    };
    const teclas = (ev: KeyboardEvent) => {
      const f = selecaoRef.current;
      if (!f || editando()) return;
      const acoes = acoesFaixaRef.current;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') {
        const texto = acoes.copiarFaixa(f);
        void navigator.clipboard?.writeText(texto).catch(() => {});
      } else if (ev.key === 'Escape') {
        setSelecao(null);
        definirCopiaCelulaMedicao(null);
      } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !readOnly) {
        ev.preventDefault();
        comUndoRef.current(() => {
          for (const i of acoes.linhasDadosDaFaixa(f)) {
            let local = linhasEfetivas[i]!;
            for (let c = f.colIni; c <= f.colFim; c += 1) {
              local = acoes.gravarCelulaMedicao(i, COLUNAS_MEDICAO[c]!, '', local);
            }
          }
        });
      }
    };
    const copiar = (ev: ClipboardEvent) => {
      const f = selecaoRef.current;
      if (!f || editando() || !ev.clipboardData) return;
      ev.preventDefault();
      ev.clipboardData.setData('text/plain', acoesFaixaRef.current.copiarFaixa(f));
    };
    const colar = (ev: ClipboardEvent) => {
      const f = selecaoRef.current;
      if (!f || editando()) return;
      ev.preventDefault();
      acoesFaixaRef.current.colarTexto(f.idxIni, f.colIni, ev.clipboardData?.getData('text/plain') ?? '');
    };
    const fora = (ev: MouseEvent) => {
      const alvo = ev.target;
      if (alvo instanceof Element && alvo.closest('[data-alca-medicao]')) return;
      if (!tabelaWrapRef.current?.contains(alvo as Node)) setSelecao(null);
    };
    document.addEventListener('keydown', teclas);
    document.addEventListener('copy', copiar);
    document.addEventListener('paste', colar);
    document.addEventListener('mousedown', fora, true);
    return () => {
      document.removeEventListener('keydown', teclas);
      document.removeEventListener('copy', copiar);
      document.removeEventListener('paste', colar);
      document.removeEventListener('mousedown', fora, true);
    };
  }, [selecao, readOnly, linhasEfetivas]);

  useEffect(() => {
    undoDimRef.current = [];
    redoDimRef.current = [];
    gestoRef.current = null;
    historicoTextoRef.current = null;
    abrirQuandoDimAtualizarRef.current = false;
  }, [rowKey]);

  useEffect(() => {
    if (!abrirQuandoDimAtualizarRef.current) return;
    abrirQuandoDimAtualizarRef.current = false;
    const ae = document.activeElement;
    const dentro = ae instanceof Node && !!tabelaWrapRef.current?.contains(ae);
    if (dentro && !gestoRef.current && !readOnly) {
      gestoRef.current = { antes: clonarDimensoesMemorial(dim), sujo: false };
    }
  }, [dim, readOnly]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || readOnly) return;
      const historico = teclaHistoricoEdicao(ev);
      if (!historico) return;
      const alvo = ev.target;
      const dentro = alvo instanceof Node && !!tabelaWrapRef.current?.contains(alvo);
      const campo =
        alvo instanceof Element &&
        alvo.closest('input, textarea, select, [contenteditable="true"]');
      if (campo && !dentro) return;
      if (!dentro && memorialPainelUndoAtivo !== rowKey) return;
      const ok = historico === 'undo' ? desfazerRef.current() : refazerRef.current();
      if (!ok) return;
      ev.preventDefault();
      ev.stopPropagation();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (memorialPainelUndoAtivo === rowKey) memorialPainelUndoAtivo = null;
    };
  }, [readOnly, rowKey]);

  const selecaoVisivel = faixaVisivel(selecao);
  const copiaVisivel = copiaCelula?.rowKey === rowKey ? faixaVisivel(copiaCelula.faixa) : null;

  const alcaCabecalho = (linha: number, col: number) =>
    !readOnly && !!selecao && selecao.idxIni === linha && selecao.idxFim === linha && selecao.colFim === col;

  const marcasCelula = (idx: number, col: ColunaMedicao) => {
    const c = COLUNAS_MEDICAO.indexOf(col);
    if (!selecaoVisivel || !faixaContem(selecaoVisivel, idx, c)) return null;
    return <MarcaSelecaoCelula />;
  };

  const colarNaDescricao = (idx: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const texto = e.clipboardData.getData('text/plain');
    const copia = copiaCelulaMedicao;
    const ehBloco =
      /[\t\n]/.test(texto.replace(/\r?\n$/, '')) ||
      (copia != null &&
        mesmoTextoCopiado(texto, copia.texto) &&
        (copia.celulas.length > 1 || (copia.celulas[0]?.length ?? 0) > 1));
    if (!ehBloco) return;
    e.preventDefault();
    e.currentTarget.blur();
    colarTexto(idx, 0, texto);
  };

  const textoFonteCelula = (draftKey: string, formula: string | undefined, valorFormatado: string) => {
    if (draftKey in draftCalc) return draftCalc[draftKey]!;
    const salva = String(formula ?? '').trim();
    return salva.startsWith('=') ? salva : valorFormatado;
  };

  /** Enter confirma a célula e desce para a mesma coluna na linha de baixo. */
  const focarCampoAbaixo = (idx: number, campo: 'descricao' | string) => {
    let prox = idx + 1;
    if (campo !== 'descricao') {
      while (prox < linhasEfetivas.length && linhasEfetivas[prox]?.cabecalhoSecao) prox += 1;
    }
    if (prox >= linhasEfetivas.length) return;
    window.setTimeout(() => {
      if (campo === 'descricao') descInputRefs.current[prox]?.focus();
      else calcInputRefs.current[`${rowKey}|${prox}|${campo}`]?.focus();
    }, 0);
  };

  const handleCalcKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (copiaCelulaMedicao) definirCopiaCelulaMedicao(null);
      e.currentTarget.blur();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    const parsed = focusedCalcKey ? parseDraftKeyMedicao(focusedCalcKey) : null;
    e.currentTarget.blur();
    if (!parsed) return;
    focarCampoAbaixo(parsed.idx, parsed.campo);
  };

  const handleDescricaoKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape' && copiaCelulaMedicao) definirCopiaCelulaMedicao(null);
    e.currentTarget.blur();
    if (e.key === 'Enter') focarCampoAbaixo(idx, 'descricao');
  };

  const inserirTokenFormula = useCallback(
    (token: string) => {
      if (!formulaMode) return;
      const { draftKey, campo } = formulaMode;
      const selfToken = tokenDoCampoMedicao(campo);
      if (!token.startsWith('{') && selfToken && selfToken === token) return;

      const input = calcInputRefs.current[draftKey];
      const map = mapaFormulaDoInput(input);
      const current =
        draftCalcRef.current[draftKey] != null
          ? draftCalcRef.current[draftKey]!
          : map?.formula
            ? map.formula
            : String(input?.value ?? '=').startsWith('=')
              ? String(input?.value ?? '=')
              : '=';
      const startVis = input?.selectionStart ?? null;
      const endVis = input?.selectionEnd ?? null;
      let start =
        map?.segmentos.length && startVis != null
          ? posVisivelParaFormula(map.segmentos, startVis)
          : startVis ?? calcSelectionRef.current.start ?? current.length;
      let end =
        map?.segmentos.length && endVis != null
          ? posVisivelParaFormula(map.segmentos, endVis)
          : endVis ?? calcSelectionRef.current.end ?? start;
      if (start === end) {
        const antes = current.slice(0, start);
        const espacos = antes.match(/\s*$/)?.[0].length ?? 0;
        const nucleo = antes.slice(0, antes.length - espacos);
        const terminaOperador = nucleo === '' || /[+\-*/(^]$/.test(nucleo) || nucleo.endsWith('=');
        const ref = nucleo.match(
          /(\{[^{}!]+!(?:\d+|T)!(?:SUB|C|L|H|N|%|A|V)\}|%|\bSUB\b|\b[CLHNAV]\b)$/i
        );
        if (!terminaOperador && ref?.[1]) {
          start = nucleo.length - ref[1].length;
          end = antes.length;
        }
      }
      const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
      anotarTextoCalc(draftKey, current, next);
      const onCommit = calcCommittersRef.current[draftKey];
      const rowCtx = calcRowCtxRef.current[draftKey];
      const nextDraft = { ...draftCalcRef.current, [draftKey]: next };
      draftCalcRef.current = nextDraft;
      setDraftCalc(nextDraft);
      if (onCommit) {
        const timers = calcCommitTimersRef.current;
        if (timers[draftKey]) clearTimeout(timers[draftKey]);
        timers[draftKey] = setTimeout(() => {
          delete timers[draftKey];
          const atual = draftCalcRef.current[draftKey];
          if (atual == null) return;
          const n = parseMedicaoBlurNumber(atual, rowCtx, resolverFormulaRef.current);
          if (n !== null) onCommit(n, atual);
        }, MEMORIAL_COMMIT_MS);
      }
      requestAnimationFrame(() => {
        const el = calcInputRefs.current[draftKey];
        if (!el) return;
        el.focus();
        const posFormula = start + token.length;
        const mapaNovo = mapaFormulaDoInput(el);
        const pos = mapaNovo?.segmentos.length
          ? posFormulaParaVisivel(mapaNovo.segmentos, posFormula)
          : posFormula;
        el.setSelectionRange(pos, pos);
        calcSelectionRef.current = { start: posFormula, end: posFormula };
      });
    },
    [formulaMode, draftCalc]
  );

  const insertTokenRef = useRef<(token: string) => void>(() => {});
  insertTokenRef.current = (token: string) => {
    inserirTokenFormula(token);
  };

  const formulaSessionKey = formulaMode
    ? `${rowKey}|${formulaMode.idx}|${formulaMode.campo}`
    : '';

  const formulaAtual = formulaMode ? (draftCalc[formulaMode.draftKey] ?? '') : '';

  useEffect(() => {
    const api = pickApiRef.current;
    if (!api) return;
    if (!formulaMode) {
      api.clearIf(rowKey);
      return;
    }
    api.setSession({
      itemKey: rowKey,
      idx: formulaMode.idx,
      campo: formulaMode.campo,
      formula: formulaAtual,
      insert: token => insertTokenRef.current(token),
    });
    return () => {
      pickApiRef.current?.clearIf(rowKey);
    };
    // formulaMode entra só pela chave da célula; o insert vive no ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulaSessionKey, rowKey]);

  useEffect(() => {
    if (!formulaSessionKey) return;
    pickApiRef.current?.setFormula(rowKey, formulaAtual);
  }, [formulaSessionKey, formulaAtual, rowKey]);

  const onPickFormulaCell = useCallback(
    (e: React.MouseEvent, idx: number | 'T', campo: string, token: FormulaPickToken) => {
      const session = pickApiRef.current?.session ?? null;
      if (session) {
        if (idx !== 'T' && session.itemKey === rowKey && session.idx === idx && session.campo === campo) {
          return false;
        }
        e.preventDefault();
        e.stopPropagation();
        const mesmaLinha = idx !== 'T' && session.itemKey === rowKey && session.idx === idx;
        const linhaDados =
          idx === 'T'
            ? 'T'
            : linhasEfetivas.slice(0, idx + 1).filter(ln => !ln.cabecalhoSecao).length;
        const texto = mesmaLinha ? token : `{${itemRotulo.trim()}!${linhaDados}!${token}}`;
        session.insert(texto);
        return true;
      }
      if (idx === 'T' || !formulaMode || formulaMode.idx !== idx) return false;
      const selfToken = tokenDoCampoMedicao(formulaMode.campo);
      if (selfToken && selfToken === token) return false;
      if (formulaMode.campo === campo) return false;
      e.preventDefault();
      e.stopPropagation();
      inserirTokenFormula(token);
      return true;
    },
    [formulaMode, inserirTokenFormula, itemRotulo, linhasEfetivas, rowKey]
  );

  const bindCalcInput = (
    draftKey: string,
    onCommit: (n: number, formulaRaw: string) => void,
    rowCtx: FormulaRowCtx
  ) => {
    calcCommittersRef.current[draftKey] = onCommit;
    calcRowCtxRef.current[draftKey] = rowCtx;
    return {
      ref: (el: HTMLInputElement | null) => {
        calcInputRefs.current[draftKey] = el;
      },
      onSelect: (e: React.SyntheticEvent<HTMLInputElement>) => syncCalcSelection(e.currentTarget),
      onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => syncCalcSelection(e.currentTarget),
      onClick: (e: React.MouseEvent<HTMLInputElement>) => syncCalcSelection(e.currentTarget),
    };
  };

  useEffect(
    () => () => {
      Object.values(calcCommitTimersRef.current).forEach(clearTimeout);
    },
    []
  );

  const [menuCtxMedicao, setMenuCtxMedicao] = useState<{ left: number; top: number; idx: number } | null>(null);
  const [somaTotalVisivel, setSomaTotalVisivel] = useState(false);
  const [obsLocalDraft, setObsLocalDraft] = useState(dim.observacao ?? '');
  const tituloItemRowRef = useRef<HTMLTableRowElement | null>(null);
  const [tituloItemRowH, setTituloItemRowH] = useState(44);

  useEffect(() => {
    setObsLocalDraft(dim.observacao ?? '');
  }, [dim.observacao, rowKey]);

  useEffect(() => {
    setSomaTotalVisivel(false);
  }, [rowKey]);

  useEffect(() => {
    if (!somaTotalVisivel) return;
    const sair = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSomaTotalVisivel(false);
    };
    const fora = (ev: MouseEvent) => {
      const alvo = ev.target as Node | null;
      if (alvo && tabelaWrapRef.current?.contains(alvo)) return;
      setSomaTotalVisivel(false);
    };
    document.addEventListener('keydown', sair);
    document.addEventListener('mousedown', fora, true);
    return () => {
      document.removeEventListener('keydown', sair);
      document.removeEventListener('mousedown', fora, true);
    };
  }, [somaTotalVisivel]);

  const observacaoPreenchida = obsLocalDraft.trim().length > 0;

  useLayoutEffect(() => {
    const el = tituloItemRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setTituloItemRowH(h);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [itemDescricao, itemRotulo, unidadeMedida, dim.observacao]);

  const stickyHeaderTopStyle = { top: tituloItemRowH } as const;

  useEffect(() => {
    if (!readOnly) return;
    setMenuCtxMedicao(null);
    const ae = typeof document !== 'undefined' ? document.activeElement : null;
    if (ae instanceof HTMLElement) ae.blur();
  }, [readOnly]);

  useEffect(() => {
    if (!menuCtxMedicao) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuCtxMedicao(null);
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      window.addEventListener('click', fechar);
    }, 0);
    function fechar() {
      setMenuCtxMedicao(null);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      window.removeEventListener('click', fechar);
    };
  }, [menuCtxMedicao]);

  const eventoSobreCampoEditavel = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, button, a, [role="combobox"], [data-col-medicao]'));
  };

  const posicaoMenuLinha = (e: React.MouseEvent, altura = 156) => {
    const mw = 220;
    let left = e.clientX;
    let top = e.clientY;
    left = Math.min(left, window.innerWidth - mw - 8);
    top = Math.min(top, window.innerHeight - altura - 8);
    return { left, top };
  };

  const pressaoLinhaRef = useRef<{ x: number; y: number; campo: boolean } | null>(null);

  const marcarPressaoLinha = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    pressaoLinhaRef.current = {
      x: e.clientX,
      y: e.clientY,
      campo: eventoSobreCampoEditavel(e.target),
    };
  };

  const abrirMenuCtxMedicao = (e: React.MouseEvent, idx: number) => {
    if (readOnly) return;
    if (e.type === 'click') {
      const pressao = pressaoLinhaRef.current;
      pressaoLinhaRef.current = null;
      if (alcaMedicaoArrastando) return;
      if (eventoSobreCampoEditavel(e.target) || pressao?.campo) return;
      if (pressao && (Math.abs(e.clientX - pressao.x) > 4 || Math.abs(e.clientY - pressao.y) > 4)) return;
    }
    e.preventDefault();
    e.stopPropagation();
    setMenuCtxMedicao({ ...posicaoMenuLinha(e), idx });
  };

  /** Descrição + C + L + H + N + % + A + V + Subtotal. */
  const contarColunasGrade = () => 9;

  const celulaVazia = (title?: string) => (
    <td className={`${tdRest} text-center`} title={title}>
      <span className="text-sm text-gray-300 dark:text-gray-600 select-none" aria-hidden>
        —
      </span>
    </td>
  );

  const lnFallback: LinhaMedicao = { C: 0, L: 0, H: 0, N: 0, empolamento: 0 };

  const renderCabecalhoServico = (colCount: number, onAbrirMenu?: (e: React.MouseEvent) => void) => (
    <tr
      ref={tituloItemRowRef}
      className={`${gradeTableRowTrCls}${onAbrirMenu ? ' cursor-pointer' : ''}`}
      onClick={onAbrirMenu}
      onContextMenu={onAbrirMenu}
    >
      {/* Descrição: nº do item (colorido) | texto — até a coluna C */}
      <th
        className={`sticky top-0 z-30 ${MEMORIAL_TITLE_ROW_MIN_H} !p-0 align-middle text-sm font-bold !border-x-0 !border-t-0 !border-b !border-r !border-gray-200 dark:!border-gray-600 !bg-white dark:!bg-gray-900 !shadow-none ${colDesc}`}
      >
        <div className="flex h-full min-h-[2.75rem] w-full items-stretch">
          <div
            className={`flex shrink-0 items-center justify-center px-2.5 font-bold tabular-nums sm:min-w-[3.5rem] sm:px-3 ${
              estiloTitulo ? '' : 'bg-red-600 text-white dark:bg-red-950/90'
            }`}
            style={estiloTitulo}
            aria-label={`Item ${itemRotulo || '—'}`}
          >
            {itemRotulo || '—'}
          </div>
          <div className="flex min-w-0 flex-1 items-center border-l border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-900 sm:px-3.5">
            <p className="min-w-0 flex-1 whitespace-normal break-words text-left text-sm font-bold leading-relaxed text-gray-900 dark:text-gray-100">
              {itemDescricao}
            </p>
            {onMemoriasIncluidasChange && !ehCargaEntulho && !readOnly ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalMemoriasAberto(true);
                }}
                className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-gray-500 shadow-none outline-none ring-0 transition-colors hover:text-red-600 focus:outline-none focus:ring-0 dark:text-gray-400 dark:hover:text-red-400"
                title="Incluir memória"
                aria-label="Incluir memória"
              >
                <ListPlus className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </th>
      {/* Unidade alinhada à coluna C (Comprimento) */}
      <th
        className={`sticky top-0 z-30 ${MEMORIAL_TITLE_ROW_MIN_H} px-2 py-0 text-center align-middle sm:px-3 !border-t-0 !border-b !border-r !border-gray-200 bg-white dark:!border-gray-600 dark:bg-gray-900 !shadow-none ${colMed}`}
        title="Unidade de medida"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide leading-none text-gray-700 dark:text-gray-200">
          {unidadeMedida.trim() || '—'}
        </span>
      </th>
      <th
        colSpan={Math.max(1, colCount - 2)}
        className={`sticky top-0 z-30 ${MEMORIAL_TITLE_ROW_MIN_H} relative !p-0 align-stretch !border-x-0 !border-t-0 !border-b !border-gray-200 dark:!border-gray-600 !shadow-none transition-colors ${
          observacaoPreenchida
            ? '!bg-amber-100 dark:!bg-yellow-500/25'
            : '!bg-white dark:!bg-gray-900'
        }`}
        onClick={e => e.stopPropagation()}
        onContextMenu={e => e.stopPropagation()}
      >
        <MemorialCampoLocal
          committedValue={dim.observacao ?? ''}
          onCommit={raw => updateObservacaoMedicao?.(raw)}
          onLocalChange={setObsLocalDraft}
          disabled={readOnly || !updateObservacaoMedicao}
          placeholder="Observação..."
          ariaLabel="Observação do item"
          title={readOnly ? 'Memória travada — não é possível editar' : 'Observação'}
          className={localValue =>
            `absolute inset-0 box-border h-full w-full min-w-0 border-0 bg-transparent px-2.5 py-2 text-left text-xs font-medium leading-snug shadow-none outline-none ring-0 transition-colors placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:placeholder:text-slate-500 sm:px-3 ${
              localValue.trim()
                ? 'text-amber-950 dark:text-yellow-50'
                : 'text-gray-800 dark:text-gray-100'
            }`
          }
        />
      </th>
    </tr>
  );

  /** Arrastar a alça do cabeçalho insere uma cópia da linha, sem gravar o rótulo nas medidas. */
  const copiarLinhaCabecalhoArrastando = (idxOrigem: number, ateIdx: number) => {
    if (readOnly || !Number.isFinite(ateIdx) || ateIdx < 0 || ateIdx === idxOrigem) return;
    const descricao =
      idxOrigem < 0
        ? (dim.rotulosColunas?.descricao ?? 'DESCRIÇÃO: ')
        : (linhasEfetivas[idxOrigem]?.descricao ?? 'DESCRIÇÃO: ');
    comUndo(() => {
      addLinhaCabecalhoSecaoMedicao(rowKey, ateIdx - 1, descricao);
      setSelecao({
        idxIni: ateIdx,
        idxFim: ateIdx,
        colIni: 0,
        colFim: COLUNAS_MEDICAO.length - 1,
      });
    });
  };

  type ColCabecalho = 'C' | 'L' | 'H' | 'N' | 'pct';

  const renderRotuloFixo = (texto: string, col: ColunaMedicao, as: 'th' | 'td', linha: number, sticky: boolean) => (
    <CelulaCabecalho
      as={as}
      col={COLUNAS_MEDICAO.indexOf(col)}
      className={sticky ? thRestSticky : thRest}
      style={sticky ? stickyHeaderTopStyle : undefined}
      marca={marcasCelula(linha, col)}
      alca={alcaCabecalho(linha, COLUNAS_MEDICAO.indexOf(col))}
      readOnly={readOnly}
      onCopiarLinha={ate => copiarLinhaCabecalhoArrastando(linha, ate)}
    >
      <div tabIndex={readOnly ? -1 : 0} className={rotuloFixoCls}>
        {texto}
      </div>
    </CelulaCabecalho>
  );

  const renderRotuloSelect = (
    col: ColCabecalho,
    titleCell: string | undefined,
    as: 'th' | 'td',
    linha: number,
    stickyThead = false
  ) => {
    const padraoPorCampo: Record<ColCabecalho, string> = {
      C: 'C',
      L: 'L',
      H: 'H',
      N: 'N',
      pct: '%'
    };
    const salvo = (col === 'pct' ? dim.rotulosColunas?.pct : dim.rotulosColunas?.[col])?.trim();
    const valorAtual = salvo || padraoPorCampo[col];
    const ariaDim =
      col === 'C'
        ? 'comprimento'
        : col === 'L'
          ? 'largura'
          : col === 'H'
            ? 'altura'
            : col === 'N'
              ? 'fator N'
              : 'empolamento ou fator %';
    const coluna = (col === 'pct' ? 'empol' : col) as ColunaMedicao;
    const indice = COLUNAS_MEDICAO.indexOf(coluna);
    return (
      <CelulaCabecalho
        as={as}
        col={indice}
        className={stickyThead ? thRestSticky : thRest}
        style={stickyThead ? stickyHeaderTopStyle : undefined}
        title={titleCell}
        marca={marcasCelula(linha, coluna)}
        alca={alcaCabecalho(linha, indice)}
        readOnly={readOnly}
        onCopiarLinha={ate => copiarLinhaCabecalhoArrastando(linha, ate)}
      >
        <MemorialCampoLocal
          committedValue={valorAtual}
          onCommit={(raw) => {
            const texto = raw.trim();
            updateRotuloColunaMedicao?.(col, texto || padraoPorCampo[col]);
          }}
          disabled={readOnly || !updateRotuloColunaMedicao}
          className={inputThRotuloCls}
          placeholder={padraoPorCampo[col]}
          ariaLabel={`Rótulo da coluna de ${ariaDim}`}
          title={titleCell || `Rótulo da coluna de ${ariaDim}`}
        />
      </CelulaCabecalho>
    );
  };

  /** Uma linha de cabeçalho das colunas de medição (dentro de &lt;thead&gt;). */
  const renderHeaderRow = (ln0: LinhaMedicao) => {
    const podeEditarC0 = ehCargaEntulho && !!ln0.editavelC;
    const podeEditarL0 = ehCargaEntulho && !!ln0.editavelL;
    const podeEditarH0 = ehCargaEntulho && !!ln0.editavelH;
    const bloquearN0 = ehCargaEntulho;

    return (
      <tr className={gradeTableRowTrCls} data-linha-medicao={LINHA_ROTULOS}>
        <CelulaCabecalho
          as="th"
          col={0}
          className={thFirstSticky}
          style={stickyHeaderTopStyle}
          marca={marcasCelula(LINHA_ROTULOS, 'descricao')}
          alca={alcaCabecalho(LINHA_ROTULOS, 0)}
          readOnly={readOnly}
          onCopiarLinha={ate => copiarLinhaCabecalhoArrastando(LINHA_ROTULOS, ate)}
        >
          <MemorialCampoLocal
            committedValue={dim.rotulosColunas?.descricao ?? 'DESCRIÇÃO: '}
            onCommit={(raw) => updateRotuloColunaMedicao?.('descricao', raw)}
            disabled={readOnly || !updateRotuloColunaMedicao}
            className={inputThDescricaoCls}
            ariaLabel="Rótulo da coluna Descrição"
          />
        </CelulaCabecalho>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'th', LINHA_ROTULOS, true)}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'th', LINHA_ROTULOS, true)}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'th', LINHA_ROTULOS, true)}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'th',
          LINHA_ROTULOS,
          true
        )}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'th', LINHA_ROTULOS, true)}
        {renderRotuloFixo('A', 'A', 'th', LINHA_ROTULOS, true)}
        {renderRotuloFixo('V', 'V', 'th', LINHA_ROTULOS, true)}
        {renderRotuloFixo('Subtotal', 'subtotal', 'th', LINHA_ROTULOS, true)}
      </tr>
    );
  };

  const contextoLinhaMedicao = (linha: LinhaMedicao): FormulaRowCtx => {
    const empolVal =
      linha.empolamento ??
      ((linha as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (linha as unknown as { percPerda: number }).percPerda / 100
        : 0);
    return {
      C: linha.C || 0,
      L: linha.L || 0,
      H: linha.H || 0,
      N: linha.N || 0,
      empolamento: Number(empolVal) || 0,
      A: areaExibidaLinha(linha),
      V: volumeExibidoLinha(linha, tipo),
      SUB: calcularQuantidadeLinha(linha, tipo),
    };
  };

  const copiarFormulaParaBaixo = (
    idxOrigem: number,
    campo: ColunaMedicao,
    textoOrigem: string,
    ateIdx: number
  ) => {
    if (readOnly || !Number.isFinite(ateIdx) || ateIdx === idxOrigem) return;
    comUndo(() => {
      const texto = String(textoOrigem ?? '').trim();
      const inicio = Math.max(0, Math.min(idxOrigem, ateIdx));
      const fim = Math.min(linhasEfetivas.length - 1, Math.max(idxOrigem, ateIdx));
      for (let i = inicio; i <= fim; i += 1) {
        if (i === idxOrigem) continue;
        const linha = linhasEfetivas[i];
        if (!linha || linha.cabecalhoSecao) continue;
        const textoLinha = deslocarFormulaLinhas(texto, itemRotulo, linhaDadosDe(i) - linhaDadosDe(idxOrigem));
        gravarCelulaMedicao(i, campo, textoLinha, linha);
      }
    });
  };

  const renderLinhaCabecalhoSecao = (ln: LinhaMedicao, idx: number, ln0Ref: LinhaMedicao) => {
    const podeEditarC0 = ehCargaEntulho && !!ln0Ref.editavelC;
    const podeEditarL0 = ehCargaEntulho && !!ln0Ref.editavelL;
    const podeEditarH0 = ehCargaEntulho && !!ln0Ref.editavelH;
    const bloquearN0 = ehCargaEntulho;
    return (
      <tr
        key={idx}
        data-linha-medicao={idx}
        className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}
        onMouseDown={ehCargaEntulho ? undefined : marcarPressaoLinha}
        onClick={ehCargaEntulho ? undefined : e => abrirMenuCtxMedicao(e, idx)}
        onContextMenu={ehCargaEntulho ? undefined : e => abrirMenuCtxMedicao(e, idx)}
      >
        <CelulaCabecalho
          as="td"
          col={0}
          className={thFirst}
          marca={marcasCelula(idx, 'descricao')}
          alca={alcaCabecalho(idx, 0)}
          readOnly={readOnly}
          onCopiarLinha={ate => copiarLinhaCabecalhoArrastando(idx, ate)}
        >
          <MemorialCampoLocal
            committedValue={ln.descricao ?? 'DESCRIÇÃO: '}
            onCommit={(raw) => updateLinhaMedicao(rowKey, idx, 'descricao', raw)}
            disabled={readOnly}
            className={inputThDescricaoCls}
            ariaLabel="Descrição da linha de cabeçalho de seção"
            inputRef={el => {
              descInputRefs.current[idx] = el;
            }}
            onKeyDown={handleDescricaoKeyDown(idx)}
          />
        </CelulaCabecalho>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'td', idx)}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'td', idx)}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'td', idx)}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'td',
          idx
        )}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'td', idx)}
        {renderRotuloFixo('A', 'A', 'td', idx, false)}
        {renderRotuloFixo('V', 'V', 'td', idx, false)}
        {renderRotuloFixo('Subtotal', 'subtotal', 'td', idx, false)}
      </tr>
    );
  };

  const partesSoma = somaTotalVisivel
    ? linhasEfetivas.flatMap((ln, idx) => {
        if (ln.cabecalhoSecao) return [];
        const valor = calcularQuantidadeLinha(ln, tipo);
        if (!valor) return [];
        return [{ idx, valor }];
      }).map((parte, i) => ({ ...parte, cor: i % PALETA_FORMULA.length }))
    : [];
  const corSomaPorIdx = new Map(partesSoma.map(parte => [parte.idx, parte.cor]));

  const renderRow = (ln: LinhaMedicao, idx: number) => {
    const ln0Ref = linhasEfetivas.find(l => !l.cabecalhoSecao) ?? linhasEfetivas[0];
    if (ln.cabecalhoSecao) {
      return renderLinhaCabecalhoSecao(ln, idx, ln0Ref);
    }
    const linhaVinculada = Boolean(ln.origemMemoriaKey);
    const valorA = areaExibidaLinha(ln);
    const valorV = volumeExibidoLinha(ln, tipo);
    const valorSubtotal = calcularQuantidadeLinha(ln, tipo);
    const empolVal =
      ln.empolamento ??
      ((ln as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100
        : 0);
    const rowCtx: FormulaRowCtx = {
      C: ln.C || 0,
      L: ln.L || 0,
      H: ln.H || 0,
      N: ln.N || 0,
      empolamento: Number(empolVal) || 0,
      A: areaExibidaLinha(ln),
      V: volumeExibidoLinha(ln, tipo),
      SUB: valorSubtotal
    };
    const linhaDados = linhasEfetivas
      .slice(0, idx + 1)
      .filter(l => !l.cabecalhoSecao).length;
    const formulaSessao = pickApi?.session ?? null;
    const destacaCelula = (campo: string, token: FormulaPickToken) => {
      if (somaTotalVisivel && ln.formulas?.subtotalManual && formulaUsaTokenCurto(ln.formulas.subtotalManual, token)) {
        return classeCelulaFormula(ln.formulas.subtotalManual, chaveTokenLocal(token));
      }
      if (!formulaSessao?.formula) return '';
      if (
        formulaSessao.itemKey === rowKey &&
        formulaSessao.idx === idx &&
        formulaSessao.campo === campo
      ) {
        return '';
      }
      if (formulaReferenciaCelula(formulaSessao.formula, itemRotulo, linhaDados, token)) {
        return classeCelulaFormula(
          formulaSessao.formula,
          chaveTokenExterno(itemRotulo, String(linhaDados), token)
        );
      }
      if (
        formulaSessao.itemKey === rowKey &&
        formulaSessao.idx === idx &&
        formulaUsaTokenCurto(formulaSessao.formula, token)
      ) {
        return classeCelulaFormula(formulaSessao.formula, chaveTokenLocal(token));
      }
      return '';
    };

    const segmentosDaCelula = (campoCelula: string, valor: string) => {
      if (!String(valor).trimStart().startsWith('=')) return null;
      const editandoAqui =
        formulaMode != null && formulaMode.idx === idx && formulaMode.campo === campoCelula;
      const sessaoAqui =
        formulaSessao != null &&
        formulaSessao.itemKey === rowKey &&
        formulaSessao.idx === idx &&
        formulaSessao.campo === campoCelula;
      const explicandoTotal = somaTotalVisivel && campoCelula === 'subtotal';
      if (!editandoAqui && !sessaoAqui && !explicandoTotal) return null;
      return segmentosFormulaVisivel(valor, rowCtx, resolverFormulaExterna);
    };

    const renderDim = (campo: 'C' | 'L' | 'H' | 'N') => {
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const num =
        campo === 'C' ? ln.C : campo === 'L' ? ln.L : campo === 'H' ? ln.H : ln.N;
      const formatado = formatMedicaoCampo(num || 0);
      const formula = ln.formulas?.[campo];
      const onCommit = (n: number, formulaRaw: string) => {
        if (campo === 'N') updateLinhaMedicao(rowKey, idx, 'N', Math.max(0, n), { formulaRaw });
        else updateLinhaMedicao(rowKey, idx, campo, n, { formulaRaw });
      };
      const bound = bindCalcInput(draftKey, onCommit, rowCtx);
      const highlight = destacaCelula(campo, campo);
      return (
        <td
          className={`${tdRestBody} text-center ${highlight}`}
          data-col-medicao={COLUNAS_MEDICAO.indexOf(campo)}
          onMouseDownCapture={e => {
            if (readOnly) return;
            if (onPickFormulaCell(e, idx, campo, campo)) return;
          }}
        >
          {marcasCelula(idx, campo)}
          <CampoNumeroFormula
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valorExibicaoCalc(draftKey, formula, formatado)}
            segmentos={segmentosDaCelula(campo, valorExibicaoCalc(draftKey, formula, formatado))}
            disabled={readOnly}
            onFocus={() => {
              if (readOnly) return;
              focarCalc(draftKey);
            }}
            onDoubleClick={() => entrarNoCalculo(draftKey, formula, formatado)}
            onChange={e => {
              if (readOnly) return;
              handleCalcChange(draftKey, e.target.value, onCommit, rowCtx);
            }}
            onKeyDown={handleCalcKeyDown}
            onBlur={() => sairCalc(draftKey, onCommit, rowCtx)}
            editando={draftKey in draftCalc}
            onSubstituir={texto => handleCalcChange(draftKey, texto, onCommit, rowCtx)}
            onCopiar={() => copiarCelula(idx, campo)}
            onColar={texto => colarCelula(idx, campo, texto)}
            onDesfazer={() => desfazerTextoRef.current()}
            onRefazer={() => refazerTextoRef.current()}
            className={`${inputCls} text-center`}
            title={
              linhaVinculada
                ? 'Vem da memória de origem. Apague para voltar ao automático.'
                : formula
                  ? `Fórmula: ${formula}`
                  : undefined
            }
            inputRef={bound.ref}
            onSelect={bound.onSelect}
            onKeyUp={bound.onKeyUp}
            onClick={bound.onClick}
            onArrastarAbaixo={ateIdx =>
              copiarFormulaParaBaixo(idx, campo, textoFonteCelula(draftKey, formula, formatado), ateIdx)
            }
          />
        </td>
      );
    };

    const renderCelulaAV = (campo: 'A' | 'V' | 'subtotal', calculado: number, title: string) => {
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const persistCampo: CampoFormulaMedicao =
        campo === 'subtotal' ? 'subtotalManual' : campo === 'A' ? 'aManual' : 'vManual';
      const persistCampoLinha: keyof LinhaMedicao = persistCampo;
      const temA = ln.aManual != null && Number.isFinite(ln.aManual);
      const temV = ln.vManual != null && Number.isFinite(ln.vManual);
      const temValor = ln.valorManual != null && Number.isFinite(ln.valorManual);
      const temManual =
        campo === 'subtotal'
          ? ln.subtotalManual != null && Number.isFinite(ln.subtotalManual)
          : campo === 'A'
            ? temA || temValor
            : temV || temValor;
      const valorManualExibir =
        campo === 'subtotal'
          ? ln.subtotalManual
          : campo === 'A'
            ? temA
              ? ln.aManual
              : ln.valorManual
            : temV
              ? ln.vManual
              : ln.valorManual;
      const exibir = temManual
        ? formatMedicaoCampo(Number(valorManualExibir) || 0)
        : formatMedicaoCampo(calculado || 0);
      const formula =
        ln.formulas?.[persistCampo] ??
        (campo === 'subtotal' ? undefined : ln.formulas?.valorManual);
      const explicandoFormula =
        somaTotalVisivel &&
        campo === 'subtotal' &&
        String(formula ?? '').trimStart().startsWith('=');
      const textoCampo = explicandoFormula
        ? String(formula)
        : valorExibicaoCalc(draftKey, formula, exibir);
      const persistir = (n: number, formulaRaw: string) => {
        const raw = String(formulaRaw ?? '').trim();
        if (raw === '' || raw === '=') {
          updateLinhaMedicao(rowKey, idx, persistCampoLinha, '', { formulaRaw: '' });
          return;
        }
        updateLinhaMedicao(rowKey, idx, persistCampoLinha, n, { formulaRaw });
      };
      const bound = bindCalcInput(draftKey, persistir, rowCtx);
      const pickToken: FormulaPickToken | null =
        campo === 'A' || campo === 'V' ? campo : campo === 'subtotal' ? 'SUB' : null;
      const highlight = pickToken ? destacaCelula(campo, pickToken) : '';
      const corSoma = campo === 'subtotal' ? corSomaPorIdx.get(idx) : undefined;
      return (
        <td
          className={`${tdCalcBody} ${highlight} ${corSoma != null ? PALETA_FORMULA[corSoma]!.celula : ''}`}
          title={
            linhaVinculada
              ? 'Vem da memória de origem. Apague para voltar ao automático.'
              : formula
                ? `${title} · ${formula}`
                : title
          }
          data-col-medicao={COLUNAS_MEDICAO.indexOf(campo)}
          onMouseDownCapture={e => {
            if (readOnly) return;
            if (pickToken && onPickFormulaCell(e, idx, campo, pickToken)) return;
          }}
        >
          {marcasCelula(idx, campo)}
          <CampoNumeroFormula
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={textoCampo}
            segmentos={segmentosDaCelula(campo, textoCampo)}
            disabled={readOnly}
            onFocus={() => {
              if (readOnly) return;
              focarCalc(draftKey);
            }}
            onDoubleClick={() => entrarNoCalculo(draftKey, formula, exibir)}
            onChange={e => {
              if (readOnly) return;
              handleCalcChange(draftKey, e.target.value, persistir, rowCtx);
            }}
            onKeyDown={handleCalcKeyDown}
            onBlur={() => sairCalc(draftKey, persistir, rowCtx)}
            editando={draftKey in draftCalc}
            onSubstituir={texto => handleCalcChange(draftKey, texto, persistir, rowCtx)}
            onCopiar={() => copiarCelula(idx, campo)}
            onColar={texto => colarCelula(idx, campo, texto)}
            onDesfazer={() => desfazerTextoRef.current()}
            onRefazer={() => refazerTextoRef.current()}
            className={`${inputCls} text-center`}
            inputRef={bound.ref}
            onSelect={bound.onSelect}
            onKeyUp={bound.onKeyUp}
            onClick={bound.onClick}
            onArrastarAbaixo={ateIdx =>
              copiarFormulaParaBaixo(idx, campo, textoFonteCelula(draftKey, formula, textoCampo), ateIdx)
            }
          />
        </td>
      );
    };

    const empolDraftKey = `${rowKey}|${idx}|empol`;
    const empolFormatado = formatMedicaoCampo(Number(empolVal) || 0);
    const empolFormula = ln.formulas?.empolamento;
    const empolOnCommit = (n: number, formulaRaw: string) =>
      updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n), { formulaRaw });
    const empolBound = bindCalcInput(empolDraftKey, empolOnCommit, rowCtx);
    const empolHighlight = destacaCelula('empol', '%');

    return (
      <tr
        key={idx}
        data-linha-medicao={idx}
        className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}
        onMouseDown={marcarPressaoLinha}
        onClick={e => abrirMenuCtxMedicao(e, idx)}
        onContextMenu={e => abrirMenuCtxMedicao(e, idx)}
      >
        <td className={tdFirstBody} data-col-medicao={0}>
          {marcasCelula(idx, 'descricao')}
          <div className={caixaFocoDescricaoCls}>
            <MemorialCampoLocal
              committedValue={ln.descricao || ''}
              onCommit={(raw) => updateLinhaMedicao(rowKey, idx, 'descricao', raw)}
              disabled={readOnly}
              title={linhaVinculada ? 'Vem da memória de origem. Apague para voltar ao automático.' : undefined}
              placeholder="Ex: COBERTURA DAS CALDEIRAS"
              className={`${inputCls} !px-3 text-left sm:!px-3.5`}
              inputRef={el => {
                descInputRefs.current[idx] = el;
              }}
              onKeyDown={handleDescricaoKeyDown(idx)}
              onPaste={colarNaDescricao(idx)}
            />
          </div>
        </td>
        {renderDim('C')}
        {renderDim('L')}
        {renderDim('H')}
        <td
          className={`${tdRestBody} text-center ${empolHighlight}`}
          data-col-medicao={COLUNAS_MEDICAO.indexOf('empol')}
          onMouseDownCapture={e => {
            if (readOnly) return;
            if (onPickFormulaCell(e, idx, 'empol', '%')) return;
          }}
        >
          {marcasCelula(idx, 'empol')}
          <CampoNumeroFormula
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={valorExibicaoCalc(empolDraftKey, empolFormula, empolFormatado)}
            segmentos={segmentosDaCelula('empol', valorExibicaoCalc(empolDraftKey, empolFormula, empolFormatado))}
            disabled={readOnly}
            onFocus={() => {
              if (readOnly) return;
              focarCalc(empolDraftKey);
            }}
            onDoubleClick={() => entrarNoCalculo(empolDraftKey, empolFormula, empolFormatado)}
            onChange={e => {
              if (readOnly) return;
              handleCalcChange(empolDraftKey, e.target.value, empolOnCommit, rowCtx);
            }}
            onKeyDown={handleCalcKeyDown}
            onBlur={() => sairCalc(empolDraftKey, empolOnCommit, rowCtx)}
            editando={empolDraftKey in draftCalc}
            onSubstituir={texto => handleCalcChange(empolDraftKey, texto, empolOnCommit, rowCtx)}
            onCopiar={() => copiarCelula(idx, 'empol')}
            onColar={texto => colarCelula(idx, 'empol', texto)}
            onDesfazer={() => desfazerTextoRef.current()}
            onRefazer={() => refazerTextoRef.current()}
            className={`${inputCls} text-center`}
            title={
              linhaVinculada
                ? 'Vem da memória de origem. Apague para voltar ao automático.'
                : empolFormula
                  ? `Fórmula: ${empolFormula}`
                  : undefined
            }
            inputRef={empolBound.ref}
            onSelect={empolBound.onSelect}
            onKeyUp={empolBound.onKeyUp}
            onClick={empolBound.onClick}
            onArrastarAbaixo={ateIdx =>
              copiarFormulaParaBaixo(
                idx,
                'empol',
                textoFonteCelula(empolDraftKey, empolFormula, empolFormatado),
                ateIdx
              )
            }
          />
        </td>
        {renderDim('N')}
        {renderCelulaAV('A', valorA, 'Área (m²)')}
        {renderCelulaAV('V', valorV, 'Volume (m³)')}
        {renderCelulaAV('subtotal', valorSubtotal, 'Quantidade da linha')}
      </tr>
    );
  };

  const portalMenuCtxMedicao = menuCtxMedicao ? (
    <ActionMenuOverlay
      open
      onClose={() => setMenuCtxMedicao(null)}
      top={menuCtxMedicao.top}
      left={menuCtxMedicao.left}
      panelClassName="min-w-[12rem] py-1"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
        onClick={() => {
          comUndo(() => addLinhaMedicao(rowKey, menuCtxMedicao.idx));
          setMenuCtxMedicao(null);
        }}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        Adicionar linha abaixo
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
        onClick={() => {
          comUndo(() => addLinhaCabecalhoSecaoMedicao(rowKey, menuCtxMedicao.idx));
          setMenuCtxMedicao(null);
        }}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden />
        Adicionar linha de cabeçalho abaixo
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
        onClick={() => {
          comUndo(() => removeLinhaMedicao(rowKey, menuCtxMedicao.idx));
          setMenuCtxMedicao(null);
        }}
      >
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        Excluir linha
      </button>
    </ActionMenuOverlay>
  ) : null;

  const totalCelulaRef = useRef<HTMLTableCellElement | null>(null);

  const renderLinhaTotalMedicao = () => {
    const linhas = (linhasEfetivas ?? []).filter(ln => !ln.cabecalhoSecao);
    const totalSub = linhas.reduce((s, ln) => s + calcularQuantidadeLinha(ln, tipo), 0);
    const marcaSub = (() => {
      const formula = pickApi?.session?.formula;
      if (!formula || !formulaReferenciaCelula(formula, itemRotulo, 'T', 'SUB')) return '';
      return classeCelulaFormula(formula, chaveTokenExterno(itemRotulo, 'T', 'SUB'));
    })();
    const podeEscolherSub = Boolean(pickApi?.session) && !marcaSub;
    const corItemClasse = estiloTitulo ? '' : 'bg-red-600 text-white dark:bg-red-950/90';
    const textoSoma = partesSoma.length
      ? `=${partesSoma.map(parte => formatMedicaoCentavos(parte.valor)).join('+')}`
      : '';
    let cursorSoma = 1;
    const segmentosSoma: SegmentoFormulaVisivel[] = textoSoma
      ? [
          {
            texto: '=',
            classe: 'text-gray-900 dark:text-gray-100',
            iniFormula: 0,
            fimFormula: 1,
          },
          ...partesSoma.flatMap((parte, i) => {
            const pedacos: SegmentoFormulaVisivel[] = [];
            if (i > 0) {
              pedacos.push({
                texto: '+',
                classe: 'text-gray-900 dark:text-gray-100',
                iniFormula: cursorSoma,
                fimFormula: cursorSoma + 1,
              });
              cursorSoma += 1;
            }
            const numero = formatMedicaoCentavos(parte.valor);
            pedacos.push({
              texto: numero,
              classe: PALETA_FORMULA[parte.cor]!.texto,
              iniFormula: cursorSoma,
              fimFormula: cursorSoma + numero.length,
            });
            cursorSoma += numero.length;
            return pedacos;
          }),
        ]
      : [];
    return (
      <tr className={gradeTableRowTrCls}>
        <td colSpan={8} className={`${tdFirst} !border-r-0`}>
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
            Total
          </span>
        </td>
        <td
          ref={totalCelulaRef}
          className={`${tdCalc} relative !border-l border-gray-200 outline-none dark:border-gray-600 ${
            marcaSub || corItemClasse
          } ${podeEscolherSub || !readOnly ? 'cursor-pointer' : ''} ${
            somaTotalVisivel ? 'ring-2 ring-inset ring-red-950 dark:ring-red-400' : ''
          }`}
          style={marcaSub ? undefined : estiloTitulo}
          title="Duplo clique para ver os subtotais que entram nesta soma"
          onMouseDownCapture={e => {
            if (readOnly) return;
            onPickFormulaCell(e, 'T', 'subtotal', 'SUB');
          }}
          onDoubleClick={e => {
            e.preventDefault();
            e.stopPropagation();
            if (pickApiRef.current?.session) return;
            setSomaTotalVisivel(v => !v);
          }}
        >
          {formatMedicaoCentavos(totalSub)}
          {somaTotalVisivel && totalCelulaRef.current && textoSoma ? (
            <DicaFormulaCompleta
              ancora={totalCelulaRef.current}
              segmentos={segmentosSoma}
              texto={textoSoma}
            />
          ) : null}
        </td>
      </tr>
    );
  };

  /** Evita borda “dupla” grossa: o contêiner já tem borda; última linha/coluna não repetem border-b/border-r. */
  const gradeTabelaMemorialBordaCls = embedded
    ? // Sem border-b na última linha: o próximo painel embedded já traz border-t (senão a separação fica grossa).
      '[&_tbody_tr:last-child_td]:!border-b-0 [&_td:last-child]:!border-r-0 [&_thead_th:last-child]:!border-r-0'
    : '[&_tbody_tr:last-child_td]:!border-b-0 [&_td:last-child]:!border-r-0 [&_thead_th:last-child]:!border-r-0 [&_thead_tr:first-child>th:first-child]:rounded-tl-[calc(0.5rem-1px)] [&_thead_tr:first-child>th:last-child]:rounded-tr-[calc(0.5rem-1px)]';

  const tabelaEnvoltorio = (children: React.ReactNode) => (
    <div
      ref={tabelaWrapRef}
      onMouseDown={iniciarSelecaoFaixa}
      className={
        embedded
          ? 'overflow-hidden bg-white dark:bg-gray-900'
          : 'overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
      }
    >
      <div ref={tabelaScrollRef} className="relative overflow-x-auto">
      <table
        className={`w-full min-w-[56rem] table-fixed border-separate border-spacing-0 text-sm ${gradeTableCls} ${gradeTabelaMemorialBordaCls}`}
      >
        <colgroup>
          <col style={{ width: `${COLS_MEDIC_PCT.desc}%` }} />
          {Array.from({ length: 8 }, (_, i) => (
            <col key={i} style={{ width: `${COLS_MEDIC_PCT.med}%` }} />
          ))}
        </colgroup>
        {children}
      </table>
      {selecaoVisivel ? (
        <ContornoFaixa faixa={selecaoVisivel} tipo="selecao" raizRef={tabelaScrollRef} />
      ) : null}
      {copiaVisivel ? (
        <ContornoFaixa faixa={copiaVisivel} tipo="copia" raizRef={tabelaScrollRef} />
      ) : null}
      </div>
    </div>
  );


  const painelShell = (body: React.ReactNode) => (
    <GestoEdicaoMemorialCtx.Provider value={gestoEdicao}>
    <>
      <div
        className={`space-y-3${readOnly ? ' pointer-events-none select-none' : ''}`}
        aria-disabled={readOnly || undefined}
        data-memorial-locked={readOnly ? 'true' : undefined}
      >
        {body}
      </div>
      {readOnly ? null : portalMenuCtxMedicao}
      {modalMemoriasAberto && onMemoriasIncluidasChange ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalMemoriasAberto(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`incluir-memoria-${rowKey}`}
            className="relative mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
          >
            <h3
              id={`incluir-memoria-${rowKey}`}
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Incluir memória de cálculo
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Cada composição marcada entra como uma linha. Entra só o total do memorial dela: em C se for metro, na área se for m² e no volume se for m³.
            </p>
            <div className="mt-4">
              <MultiSelectSearchDropdown
                menuInline
                listMaxHeight={280}
                placeholder="Selecione as memórias"
                searchPlaceholder="Buscar composição..."
                emptyOptionsMessage="Nenhuma outra memória neste orçamento."
                options={memoriasDisponiveis.map((m) => ({
                  value: m.key,
                  label: `${m.rotulo} - ${m.descricao || 'Sem descrição'}`,
                  description: m.unidade,
                  searchText: `${m.rotulo} ${m.descricao} ${m.unidade ?? ''}`,
                }))}
                selected={linhasEfetivas
                  .map((ln) => ln.origemMemoriaKey)
                  .filter((k): k is string => Boolean(k))}
                onChange={onMemoriasIncluidasChange}
              />
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setModalMemoriasAberto(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </AppModalOverlay>
      ) : null}
    </>
    </GestoEdicaoMemorialCtx.Provider>
  );

  if (!linhasEfetivas?.length) {
    const colEmpty = contarColunasGrade();
    if (ehCargaEntulho) {
      return painelShell(
        tabelaEnvoltorio(
          <>
            <thead>{renderCabecalhoServico(colEmpty)}</thead>
            <tbody>
              <tr className={gradeTableRowTrCls}>
                <td
                  colSpan={colEmpty}
                  className="border-b border-gray-200 bg-slate-50/60 px-6 py-8 text-center dark:border-gray-600 dark:bg-gray-900/50"
                >
                  <div className="flex justify-center">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      <Info className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                  </div>
                  <p className="mx-auto mt-3 max-w-lg text-sm font-medium leading-relaxed text-gray-800 dark:text-gray-200">
                    A carga manual de entulho não é medida aqui: o volume vem dos demais serviços do mesmo bloco
                    (demolições, remoções, escavações etc.).
                  </p>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    Inclua primeiro, na aba <span className="font-medium text-gray-800 dark:text-gray-200">Orçamento</span>, as
                    composições que geram entulho e preencha as medições delas. As linhas desta carga aparecem
                    automaticamente quando houver volume calculado.
                  </p>
                </td>
              </tr>
            </tbody>
          </>
        )
      );
    }
    return painelShell(
      tabelaEnvoltorio(
        <>
          <thead>
            {renderCabecalhoServico(colEmpty)}
          </thead>
          <tbody>
            <tr className={gradeTableRowTrCls}>
              <td
                colSpan={colEmpty}
                className="border-b border-gray-200 bg-slate-50/40 px-6 py-10 text-center dark:border-gray-600 dark:bg-gray-900/40"
              >
                <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  Nenhuma linha de medição. Inicie o cadastro das medidas conforme o tipo de serviço.
                </p>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => comUndo(() => addLinhaMedicao(rowKey))}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                  >
                    <Plus className="h-4 w-4" />
                    Iniciar medições
                  </button>
                ) : null}
              </td>
            </tr>
          </tbody>
        </>
      )
    );
  }

  if (!ehCargaEntulho) {
    const lnHeaderRef = linhasEfetivas.find(l => !l.cabecalhoSecao) ?? linhasEfetivas[0];
    const colCount = contarColunasGrade();
    return painelShell(
      tabelaEnvoltorio(
        <>
          <thead>
            {renderCabecalhoServico(colCount)}
            {renderHeaderRow(lnHeaderRef)}
          </thead>
          <tbody>
            {linhasEfetivas.map((ln, idx) => renderRow(ln, idx))}
            {renderLinhaTotalMedicao()}
          </tbody>
        </>
      )
    );
  }

  /** Carga de entulho: uma tabela contínua (sem sub-blocos nem faixa duplicada por composição). */
  const lnHeaderCarga = linhasEfetivas.find(l => !l.cabecalhoSecao) ?? linhasEfetivas[0];
  const colCountCarga = contarColunasGrade();
  return painelShell(
    tabelaEnvoltorio(
      <>
        <thead>
          {renderCabecalhoServico(colCountCarga)}
          {renderHeaderRow(lnHeaderCarga)}
        </thead>
        <tbody>
          {linhasEfetivas.map((ln, idx) => renderRow(ln, idx))}
          {renderLinhaTotalMedicao()}
        </tbody>
      </>
    )
  );
});
