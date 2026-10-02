'use client';

import React, { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import {
  ROTULO_COLUNA_MEDICAO_OPCOES,
  type CampoFormulaMedicao,
  type DimensoesItem,
  type LinhaMedicao,
  type TipoUnidadeFormula
} from './orcamentoMedicaoTypes';
import { calcA, calcV, calcularQuantidadeLinha, linhasMedicaoEfetivas } from './orcamentoMedicaoCalc';
import {
  gradeTableCls,
  gradeTableRowTrCls,
  inputGradeCls,
  selectGradeHeaderMemorialCls
} from './orcamentoGradeCellClasses';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';

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
  addLinhaCabecalhoSecaoMedicao: (itemKey: string, inserirAposIdx?: number) => void;
  removeLinhaMedicao: (itemKey: string, idx: number) => void;
  estiloTitulo?: React.CSSProperties;
  /** Bloqueia edição (orçamento/memorial travados). */
  readOnly?: boolean;
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
  'sticky z-[19] bg-slate-50 dark:bg-slate-800/95 !shadow-none';
const thFirst =
  `${MEMORIAL_ROW_H} px-3 sm:px-3.5 py-0 text-left text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/85 border-b border-r border-gray-200 dark:border-gray-600 ${colDesc}`;
const thRest =
  `${MEMORIAL_ROW_H} px-2 sm:px-3 py-0 text-center text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/85 border-b border-r border-gray-200 dark:border-gray-600 ${colMed}`;
/** Só no thead da grade de colunas (não reutilizar em linhas de seção do tbody). */
const thFirstSticky = `${memorialThStickySecondBase} ${thFirst}`;
const thRestSticky = `${memorialThStickySecondBase} ${thRest}`;
const tdFirst =
  `${MEMORIAL_ROW_H} px-3 sm:px-3.5 py-0 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRest =
  `${MEMORIAL_ROW_H} px-2 sm:px-3 py-0 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
/** Corpo da tabela: sem padding no td para o input cobrir a célula inteira (borda de foco = borda da célula). */
const tdFirstBody =
  `${MEMORIAL_ROW_H} p-0 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRestBody =
  `${MEMORIAL_ROW_H} p-0 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalc =
  `${MEMORIAL_ROW_H} px-2 sm:px-3 py-0 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalcBody =
  `${MEMORIAL_ROW_H} p-0 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const inputCls = `${inputGradeCls} !min-h-0 !h-full !py-0`;
/** Texto editável com a mesma leitura visual do &lt;th&gt; da coluna Descrição (memória). */
const inputThDescricaoCls =
  'box-border h-full min-h-0 w-full min-w-0 border-0 rounded-none bg-transparent px-3 py-0 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700 shadow-none outline-none ring-0 transition-[background-color,box-shadow] placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-slate-500 sm:px-3.5 focus:z-[1] focus:bg-red-50/90 dark:focus:bg-red-950/35 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60';

const MEMORIAL_COMMIT_MS = 180;

/** Tokens clicáveis na fórmula (=C*L) — mesma linha da memória. */
type FormulaPickToken = 'C' | 'L' | 'H' | 'N' | '%' | 'A' | 'V';

type FormulaRowCtx = {
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number;
  A: number;
  V: number;
};

function formatMedicaoNumero(n: number, casasMin = 0, casasMax = 4): string {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: casasMin,
    maximumFractionDigits: casasMax,
  });
}

function substituirRefsFormulaLinha(expr: string, ctx: FormulaRowCtx): string {
  return expr.replace(/%|\b([CLHNAV])\b/gi, match => {
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

function parseMedicaoBlurNumber(raw: string, rowCtx?: FormulaRowCtx): number | null {
  const text = String(raw ?? '').trim();
  if (text.startsWith('=')) {
    let s = text.slice(1).trim().replace(/,/g, '.');
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
  return null;
}

const FORMULA_PICK_CELL_CLS =
  'ring-2 ring-inset ring-sky-400/70 dark:ring-sky-400/50 cursor-cell';

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

  return (
    <input
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      autoComplete="off"
      className={resolvedClassName}
      value={local}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const next = e.target.value;
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
        flushCommit(localRef.current);
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
  addLinhaCabecalhoSecaoMedicao,
  removeLinhaMedicao,
  estiloTitulo,
  readOnly = false,
}: Props) {
  const tipo = tipoUnidade;
  const linhasEfetivas = linhasMedicaoEfetivas(dim);

  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const [focusedCalcKey, setFocusedCalcKey] = useState<string | null>(null);
  const calcCommitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const calcInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const calcCommittersRef = useRef<Record<string, (n: number, formulaRaw: string) => void>>({});
  const calcRowCtxRef = useRef<Record<string, FormulaRowCtx>>({});
  const calcSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

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
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
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
      const text = String(raw ?? '');
      const n = parseMedicaoBlurNumber(text, rowCtx ?? calcRowCtxRef.current[draftKey]);
      startTransition(() => onCommit(n ?? 0, text));
      setFocusedCalcKey((k) => (k === draftKey ? null : k));
      setDraftCalc((p) => {
        if (!(draftKey in p)) return p;
        const next = { ...p };
        delete next[draftKey];
        return next;
      });
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
      setDraftCalc((p) => ({ ...p, [draftKey]: raw }));
      calcCommittersRef.current[draftKey] = onCommit;
      if (rowCtx) calcRowCtxRef.current[draftKey] = rowCtx;
      const n = parseMedicaoBlurNumber(raw, rowCtx ?? calcRowCtxRef.current[draftKey]);
      if (n === null && String(raw ?? '').trim() !== '') return;
      const timers = calcCommitTimersRef.current;
      if (timers[draftKey]) clearTimeout(timers[draftKey]);
      timers[draftKey] = setTimeout(() => {
        delete timers[draftKey];
        startTransition(() => onCommit(n ?? 0, raw));
      }, MEMORIAL_COMMIT_MS);
    },
    []
  );

  const valorExibicaoCalc = (draftKey: string, formula: string | undefined, valorFormatado: string) => {
    if (draftKey in draftCalc) return draftCalc[draftKey];
    if (focusedCalcKey === draftKey && formula) return formula;
    return valorFormatado;
  };

  const focarCalc = (draftKey: string, formula: string | undefined, valorFormatado: string) => {
    setFocusedCalcKey(draftKey);
    if (!(draftKey in draftCalc)) {
      setDraftCalc((p) => ({ ...p, [draftKey]: formula || valorFormatado }));
    }
  };

  /** Enter confirma a célula (como planilha) e evita submit/navegação do formulário pai. */
  const handleCalcKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.blur();
  };

  const inserirTokenFormula = useCallback(
    (token: FormulaPickToken) => {
      if (!formulaMode) return;
      const { draftKey, campo } = formulaMode;
      const selfToken = tokenDoCampoMedicao(campo);
      if (selfToken && selfToken === token) return;

      const input = calcInputRefs.current[draftKey];
      const current =
        draftCalc[draftKey] != null
          ? draftCalc[draftKey]!
          : String(input?.value ?? '=').startsWith('=')
            ? String(input?.value ?? '=')
            : '=';
      const start = input?.selectionStart ?? calcSelectionRef.current.start ?? current.length;
      const end = input?.selectionEnd ?? calcSelectionRef.current.end ?? start;
      const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
      const onCommit = calcCommittersRef.current[draftKey];
      const rowCtx = calcRowCtxRef.current[draftKey];
      setDraftCalc((p) => ({ ...p, [draftKey]: next }));
      if (onCommit) {
        const n = parseMedicaoBlurNumber(next, rowCtx);
        if (n !== null || String(next).trim() === '' || String(next).trim() === '=') {
          const timers = calcCommitTimersRef.current;
          if (timers[draftKey]) clearTimeout(timers[draftKey]);
          timers[draftKey] = setTimeout(() => {
            delete timers[draftKey];
            if (n !== null) startTransition(() => onCommit(n, next));
          }, MEMORIAL_COMMIT_MS);
        }
      }
      requestAnimationFrame(() => {
        const el = calcInputRefs.current[draftKey];
        if (!el) return;
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
        calcSelectionRef.current = { start: pos, end: pos };
      });
    },
    [formulaMode, draftCalc]
  );

  const onPickFormulaCell = useCallback(
    (e: React.MouseEvent, idx: number, campo: string, token: FormulaPickToken) => {
      if (!formulaMode || formulaMode.idx !== idx) return false;
      const selfToken = tokenDoCampoMedicao(formulaMode.campo);
      if (selfToken && selfToken === token) return false;
      if (formulaMode.campo === campo) return false;
      e.preventDefault();
      e.stopPropagation();
      inserirTokenFormula(token);
      return true;
    },
    [formulaMode, inserirTokenFormula]
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
  const [obsLocalDraft, setObsLocalDraft] = useState(dim.observacao ?? '');
  const tituloItemRowRef = useRef<HTMLTableRowElement | null>(null);
  const [tituloItemRowH, setTituloItemRowH] = useState(44);

  useEffect(() => {
    setObsLocalDraft(dim.observacao ?? '');
  }, [dim.observacao, rowKey]);

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
    return Boolean(target.closest('input, textarea, select, button, a, [role="combobox"]'));
  };

  const posicaoMenuLinha = (e: React.MouseEvent, altura = 156) => {
    const mw = 220;
    let left = e.clientX;
    let top = e.clientY;
    left = Math.min(left, window.innerWidth - mw - 8);
    top = Math.min(top, window.innerHeight - altura - 8);
    return { left, top };
  };

  const abrirMenuCtxMedicao = (e: React.MouseEvent, idx: number) => {
    if (e.type === 'click' && eventoSobreCampoEditavel(e.target)) return;
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
          disabled={!updateObservacaoMedicao}
          placeholder="Observação..."
          ariaLabel="Observação do item"
          title="Observação"
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

  type ColCabecalho = 'C' | 'L' | 'H' | 'N' | 'pct';

  const renderRotuloSelect = (
    col: ColCabecalho,
    titleCell: string | undefined,
    as: 'th' | 'td',
    stickyThead = false
  ) => {
    const padraoPorCampo: Record<ColCabecalho, string> = {
      C: 'C',
      L: 'L',
      H: 'H',
      N: 'N',
      pct: '%'
    };
    const salvo = col === 'pct' ? dim.rotulosColunas?.pct : dim.rotulosColunas?.[col];
    const normalizarLegado = (v: string | undefined) => {
      if (v === undefined) return undefined;
      if (v === '') return col === 'pct' ? '%' : 'N';
      return v;
    };
    const salvoNorm = normalizarLegado(salvo);
    const valorAtual = salvoNorm === undefined ? padraoPorCampo[col] : salvoNorm;
    const opcoes = [...ROTULO_COLUNA_MEDICAO_OPCOES] as string[];
    const lista = Array.from(
      new Set(valorAtual !== '' && !opcoes.includes(valorAtual) ? [valorAtual, ...opcoes] : opcoes)
    );
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
    const Tag = as;
    const cellCls = stickyThead ? thRestSticky : thRest;
    return (
      <Tag
        className={`${cellCls} !p-0 align-middle`}
        title={titleCell}
        style={stickyThead ? stickyHeaderTopStyle : undefined}
      >
        <label className="flex h-full min-h-0 items-stretch justify-center">
          <span className="sr-only">
            Coluna {col === 'pct' ? '%' : col}, rótulo {valorAtual}
          </span>
          <StringSingleSelectDropdown
            className="h-full w-full"
            triggerClassName={`${selectGradeHeaderMemorialCls} !min-h-0 !h-full !py-0`}
            hideChevron
            value={valorAtual}
            disabled={!updateRotuloColunaMedicao}
            onChange={(value) => updateRotuloColunaMedicao?.(col, value)}
            options={lista}
            allowEmpty={false}
          />
        </label>
      </Tag>
    );
  };

  /** Uma linha de cabeçalho das colunas de medição (dentro de &lt;thead&gt;). */
  const renderHeaderRow = (ln0: LinhaMedicao) => {
    const podeEditarC0 = ehCargaEntulho && !!ln0.editavelC;
    const podeEditarL0 = ehCargaEntulho && !!ln0.editavelL;
    const podeEditarH0 = ehCargaEntulho && !!ln0.editavelH;
    const bloquearN0 = ehCargaEntulho;

    return (
      <tr className={gradeTableRowTrCls}>
        <th className={`${thFirstSticky} !p-0 align-middle`} style={stickyHeaderTopStyle}>
          <MemorialCampoLocal
            committedValue={dim.rotulosColunas?.descricao ?? 'DESCRIÇÃO: '}
            onCommit={(raw) => updateRotuloColunaMedicao?.('descricao', raw)}
            disabled={!updateRotuloColunaMedicao}
            className={inputThDescricaoCls}
            ariaLabel="Rótulo da coluna Descrição"
          />
        </th>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'th', true)}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'th', true)}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'th', true)}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'th',
          true
        )}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'th', true)}
        <th className={thRestSticky} style={stickyHeaderTopStyle}>
          A
        </th>
        <th className={thRestSticky} style={stickyHeaderTopStyle}>
          V
        </th>
        <th className={thRestSticky} style={stickyHeaderTopStyle}>
          Subtotal
        </th>
      </tr>
    );
  };

  const renderLinhaCabecalhoSecao = (ln: LinhaMedicao, idx: number, ln0Ref: LinhaMedicao) => {
    const podeEditarC0 = ehCargaEntulho && !!ln0Ref.editavelC;
    const podeEditarL0 = ehCargaEntulho && !!ln0Ref.editavelL;
    const podeEditarH0 = ehCargaEntulho && !!ln0Ref.editavelH;
    const bloquearN0 = ehCargaEntulho;
    return (
      <tr
        key={idx}
        className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}
        onClick={ehCargaEntulho ? undefined : e => abrirMenuCtxMedicao(e, idx)}
        onContextMenu={ehCargaEntulho ? undefined : e => abrirMenuCtxMedicao(e, idx)}
      >
        <td className={`${thFirst} !p-0 align-middle`}>
          <MemorialCampoLocal
            committedValue={ln.descricao ?? 'DESCRIÇÃO: '}
            onCommit={(raw) => updateLinhaMedicao(rowKey, idx, 'descricao', raw)}
            className={inputThDescricaoCls}
            ariaLabel="Descrição da linha de cabeçalho de seção"
          />
        </td>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'td')}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'td'
        )}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'td')}
        <td className={thRest}>A</td>
        <td className={thRest}>V</td>
        <td className={thRest}>Subtotal</td>
      </tr>
    );
  };

  const renderRow = (ln: LinhaMedicao, idx: number) => {
    const ln0Ref = linhasEfetivas.find(l => !l.cabecalhoSecao) ?? linhasEfetivas[0];
    if (ln.cabecalhoSecao) {
      return renderLinhaCabecalhoSecao(ln, idx, ln0Ref);
    }
    const valorA = calcA(ln);
    const valorV = calcV(ln, tipo);
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
      A: valorA,
      V: valorV
    };
    const formulaPickAtivo = formulaMode?.idx === idx;
    const pickCls = (campo: string, token: FormulaPickToken) => {
      if (!formulaPickAtivo) return '';
      const selfToken = tokenDoCampoMedicao(formulaMode!.campo);
      if (formulaMode!.campo === campo || selfToken === token) return '';
      return FORMULA_PICK_CELL_CLS;
    };

    const renderDim = (campo: 'C' | 'L' | 'H' | 'N') => {
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const num =
        campo === 'C' ? ln.C : campo === 'L' ? ln.L : campo === 'H' ? ln.H : ln.N;
      const formatado = (num || 0) === 0 ? '' : formatMedicaoNumero(num);
      const formula = ln.formulas?.[campo];
      const onCommit = (n: number, formulaRaw: string) => {
        if (campo === 'N') updateLinhaMedicao(rowKey, idx, 'N', Math.max(0, n), { formulaRaw });
        else updateLinhaMedicao(rowKey, idx, campo, n, { formulaRaw });
      };
      const bound = bindCalcInput(draftKey, onCommit, rowCtx);
      const highlight = pickCls(campo, campo);
      return (
        <td
          className={`${tdRestBody} text-center ${highlight}`}
          onMouseDown={e => {
            if (onPickFormulaCell(e, idx, campo, campo)) return;
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder={campo === 'N' ? '1' : '0'}
            value={valorExibicaoCalc(draftKey, formula, formatado)}
            onFocus={() => focarCalc(draftKey, formula, formatado)}
            onChange={e => handleCalcChange(draftKey, e.target.value, onCommit, rowCtx)}
            onKeyDown={handleCalcKeyDown}
            onBlur={e =>
              handleCalcBlur(draftKey, draftCalc[draftKey] ?? e.target.value, onCommit, rowCtx)
            }
            className={`${inputCls} text-center`}
            title={formula ? `Fórmula: ${formula}` : undefined}
            ref={bound.ref}
            onSelect={bound.onSelect}
            onKeyUp={bound.onKeyUp}
            onClick={bound.onClick}
          />
        </td>
      );
    };

    const renderCelulaAV = (campo: 'A' | 'V' | 'subtotal', calculado: number, title: string) => {
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const persistCampo: CampoFormulaMedicao =
        campo === 'subtotal' ? 'subtotalManual' : 'valorManual';
      const temManual =
        campo === 'subtotal'
          ? ln.subtotalManual != null && Number.isFinite(ln.subtotalManual)
          : ln.valorManual != null && Number.isFinite(ln.valorManual);
      const valorManualExibir = campo === 'subtotal' ? ln.subtotalManual : ln.valorManual;
      const exibir = temManual
        ? formatMedicaoNumero(Number(valorManualExibir), 2, 4)
        : calculado === 0
          ? ''
          : formatMedicaoNumero(calculado, 2, 4);
      const formula = ln.formulas?.[persistCampo];
      const persistir = (n: number, formulaRaw: string) => {
        const raw = String(formulaRaw ?? '').trim();
        /** Apagou o override → volta o valor automático (C×L / A×H / subtotal). */
        if (raw === '' || raw === '=') {
          updateLinhaMedicao(rowKey, idx, persistCampo, '', { formulaRaw: '' });
          return;
        }
        updateLinhaMedicao(rowKey, idx, persistCampo, n, { formulaRaw });
      };
      const bound = bindCalcInput(draftKey, persistir, rowCtx);
      const pickToken: FormulaPickToken | null = campo === 'A' || campo === 'V' ? campo : null;
      const highlight = pickToken ? pickCls(campo, pickToken) : '';
      return (
        <td
          className={`${tdCalcBody} ${highlight}`}
          title={formula ? `${title} · ${formula}` : title}
          onMouseDown={e => {
            if (pickToken && onPickFormulaCell(e, idx, campo, pickToken)) return;
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={valorExibicaoCalc(draftKey, formula, exibir)}
            onFocus={() => focarCalc(draftKey, formula, exibir)}
            onChange={e => handleCalcChange(draftKey, e.target.value, persistir, rowCtx)}
            onKeyDown={handleCalcKeyDown}
            onBlur={e =>
              handleCalcBlur(draftKey, draftCalc[draftKey] ?? e.target.value, persistir, rowCtx)
            }
            className={`${inputCls} text-center`}
            ref={bound.ref}
            onSelect={bound.onSelect}
            onKeyUp={bound.onKeyUp}
            onClick={bound.onClick}
          />
        </td>
      );
    };

    const empolDraftKey = `${rowKey}|${idx}|empol`;
    const empolFormatado =
      empolVal === 0 ? '0' : empolVal === 1 ? '1' : formatMedicaoNumero(empolVal);
    const empolFormula = ln.formulas?.empolamento;
    const empolOnCommit = (n: number, formulaRaw: string) =>
      updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n), { formulaRaw });
    const empolBound = bindCalcInput(empolDraftKey, empolOnCommit, rowCtx);
    const empolHighlight = pickCls('empol', '%');

    return (
      <tr
        key={idx}
        className={`transition-colors hover:[&>td]:bg-slate-50/95 dark:hover:[&>td]:bg-slate-800/35 ${gradeTableRowTrCls}`}
        onClick={e => abrirMenuCtxMedicao(e, idx)}
        onContextMenu={e => abrirMenuCtxMedicao(e, idx)}
      >
        <td className={tdFirstBody}>
          <MemorialCampoLocal
            committedValue={ln.descricao || ''}
            onCommit={(raw) => updateLinhaMedicao(rowKey, idx, 'descricao', raw)}
            placeholder="Ex: COBERTURA DAS CALDEIRAS"
            className={`${inputCls} !px-3 text-left sm:!px-3.5`}
          />
        </td>
        {renderDim('C')}
        {renderDim('L')}
        {renderDim('H')}
        <td
          className={`${tdRestBody} text-center ${empolHighlight}`}
          onMouseDown={e => {
            if (onPickFormulaCell(e, idx, 'empol', '%')) return;
          }}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="1"
            value={valorExibicaoCalc(empolDraftKey, empolFormula, empolFormatado)}
            onFocus={() => focarCalc(empolDraftKey, empolFormula, empolFormatado)}
            onChange={e => handleCalcChange(empolDraftKey, e.target.value, empolOnCommit, rowCtx)}
            onKeyDown={handleCalcKeyDown}
            onBlur={e =>
              handleCalcBlur(
                empolDraftKey,
                draftCalc[empolDraftKey] ?? e.target.value,
                empolOnCommit,
                rowCtx
              )
            }
            className={`${inputCls} text-center`}
            title={empolFormula ? `Fórmula: ${empolFormula}` : undefined}
            ref={empolBound.ref}
            onSelect={empolBound.onSelect}
            onKeyUp={empolBound.onKeyUp}
            onClick={empolBound.onClick}
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
          addLinhaMedicao(rowKey, menuCtxMedicao.idx);
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
          addLinhaCabecalhoSecaoMedicao(rowKey, menuCtxMedicao.idx);
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
          removeLinhaMedicao(rowKey, menuCtxMedicao.idx);
          setMenuCtxMedicao(null);
        }}
      >
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
        Excluir linha
      </button>
    </ActionMenuOverlay>
  ) : null;

  const renderLinhaTotalMedicao = () => {
    const linhas = (linhasEfetivas ?? []).filter(ln => !ln.cabecalhoSecao);
    const fmt = (n: number) =>
      n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    const totalA = linhas.reduce((s, ln) => s + calcA(ln), 0);
    const totalV = linhas.reduce((s, ln) => s + calcV(ln, tipo), 0);
    const totalSub = linhas.reduce((s, ln) => s + calcularQuantidadeLinha(ln, tipo), 0);
    const mostraA = true;
    const mostraV = true;
    const celulaTot = (mostrar: boolean, valor: number, title: string) =>
      mostrar ? (
        <td className={tdCalc} title={title}>
          {fmt(valor)}
        </td>
      ) : (
        celulaVazia()
      );
    return (
      <tr className={gradeTableRowTrCls}>
        <td className={tdFirst}>
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
            Total
          </span>
        </td>
        {celulaVazia()}
        {celulaVazia()}
        {celulaVazia()}
        {celulaVazia()}
        {celulaVazia()}
        {celulaTot(mostraA, totalA, 'Área total (m²)')}
        {celulaTot(mostraV, totalV, 'Volume total (m³)')}
        <td className={tdCalc} title="Quantidade total">
          {fmt(totalSub)}
        </td>
      </tr>
    );
  };

  /** Evita borda “dupla” grossa: o contêiner já tem borda; última linha/coluna não repetem border-b/border-r. */
  const gradeTabelaMemorialBordaCls =
    '[&_tbody_tr:last-child_td]:!border-b-0 [&_td:last-child]:!border-r-0 [&_thead_th:last-child]:!border-r-0 [&_thead_tr:first-child>th:first-child]:rounded-tl-[calc(0.5rem-1px)] [&_thead_tr:first-child>th:last-child]:rounded-tr-[calc(0.5rem-1px)]';

  const tabelaEnvoltorio = (children: React.ReactNode) => (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="overflow-x-auto">
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
      </div>
    </div>
  );


  const painelShell = (body: React.ReactNode) => (
    <>
      <div
        className={`space-y-3${readOnly ? ' select-none' : ''}`}
        {...(readOnly ? ({ inert: '' } as React.HTMLAttributes<HTMLDivElement>) : {})}
        aria-disabled={readOnly || undefined}
      >
        {body}
      </div>
      {readOnly ? null : portalMenuCtxMedicao}
    </>
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
                    onClick={() => addLinhaMedicao(rowKey)}
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
