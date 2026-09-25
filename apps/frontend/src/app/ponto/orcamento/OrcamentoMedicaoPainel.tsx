'use client';

import React, { memo, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
import {
  ROTULO_COLUNA_MEDICAO_OPCOES,
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
  updateLinhaMedicao: (itemKey: string, idx: number, campo: keyof LinhaMedicao, valor: number | string) => void;
  updateRotuloColunaMedicao?: (
    campo: 'descricao' | 'C' | 'L' | 'H' | 'N' | 'pct',
    rotulo: string
  ) => void;
  addLinhaMedicao: (itemKey: string, inserirAposIdx?: number) => void;
  addLinhaCabecalhoSecaoMedicao: (itemKey: string, inserirAposIdx?: number) => void;
  removeLinhaMedicao: (itemKey: string, idx: number) => void;
  estiloTitulo?: React.CSSProperties;
};

/**
 * Larguras da grade: a1ª linha do thead é um único th com colSpan cheio, então o navegador
 * ignora w-* nas células seguintes e iguala as colunas. `<colgroup>` define a grade de fato.
 */
const COLS_MEDIC_PCT = { desc: 44, med: 7 } as const;

const colDesc = 'min-w-[18rem] sm:min-w-[22rem]';
const colMed = 'min-w-[2.75rem] max-w-[4.25rem]';

const thFirst =
  `px-3 sm:px-3.5 py-2.5 text-left text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/85 border-b border-r border-gray-200 dark:border-gray-600 ${colDesc}`;
const thRest =
  `px-2 sm:px-3 py-2.5 text-center text-[11px] font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide bg-slate-50 dark:bg-slate-800/85 border-b border-r border-gray-200 dark:border-gray-600 ${colMed}`;
const tdFirst =
  `px-3 sm:px-3.5 py-2.5 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRest =
  `px-2 sm:px-3 py-2.5 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
/** Corpo da tabela: sem padding no td para o input cobrir a célula inteira (borda de foco = borda da célula). */
const tdFirstBody =
  `p-0 align-middle text-left border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colDesc}`;
const tdRestBody =
  `p-0 align-middle border-b border-r border-gray-200 bg-white text-center dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalc =
  `px-2 sm:px-3 py-2.5 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const tdCalcBody =
  `p-0 text-center tabular-nums text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900 ${colMed}`;
const inputCls = inputGradeCls;
/** Texto editável com a mesma leitura visual do &lt;th&gt; da coluna Descrição (memória). */
const inputThDescricaoCls =
  'box-border min-h-[2.75rem] w-full min-w-0 border-0 rounded-none bg-transparent px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700 shadow-none outline-none ring-0 transition-[background-color,box-shadow] placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-slate-500 sm:px-3.5 focus:z-[1] focus:bg-red-50/90 dark:focus:bg-red-950/35 focus:ring-1 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60';

const MEMORIAL_COMMIT_MS = 180;

function parseMedicaoBlurNumber(raw: string): number | null {
  const text = String(raw ?? '').trim();
  if (text.startsWith('=')) {
    const s = text.slice(1).trim().replace(/,/g, '.');
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

const MemorialCampoLocal = memo(function MemorialCampoLocal({
  committedValue,
  onCommit,
  className,
  placeholder,
  title,
  inputMode,
  ariaLabel,
  disabled,
}: {
  committedValue: string;
  onCommit: (raw: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(committedValue);
  const focusedRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!focusedRef.current) setLocal(committedValue);
  }, [committedValue]);

  return (
    <input
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      autoComplete="off"
      className={className}
      value={local}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        focusedRef.current = false;
        onCommitRef.current(local);
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
  addLinhaMedicao,
  addLinhaCabecalhoSecaoMedicao,
  removeLinhaMedicao,
  estiloTitulo
}: Props) {
  const tipo = tipoUnidade;
  const linhasEfetivas = linhasMedicaoEfetivas(dim);

  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const calcCommitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleCalcBlur = useCallback((draftKey: string, raw: string, onCommit: (n: number) => void) => {
    const pending = calcCommitTimersRef.current[draftKey];
    if (pending) {
      clearTimeout(pending);
      delete calcCommitTimersRef.current[draftKey];
    }
    const n = parseMedicaoBlurNumber(raw);
    startTransition(() => onCommit(n ?? 0));
    setDraftCalc((p) => {
      if (!(draftKey in p)) return p;
      const next = { ...p };
      delete next[draftKey];
      return next;
    });
  }, []);

  const handleCalcChange = useCallback((draftKey: string, raw: string, onCommit: (n: number) => void) => {
    setDraftCalc((p) => ({ ...p, [draftKey]: raw }));
    const n = parseMedicaoBlurNumber(raw);
    if (n === null && String(raw ?? '').trim() !== '') return;
    const timers = calcCommitTimersRef.current;
    if (timers[draftKey]) clearTimeout(timers[draftKey]);
    timers[draftKey] = setTimeout(() => {
      delete timers[draftKey];
      startTransition(() => onCommit(n ?? 0));
    }, MEMORIAL_COMMIT_MS);
  }, []);

  useEffect(
    () => () => {
      Object.values(calcCommitTimersRef.current).forEach(clearTimeout);
    },
    []
  );

  const [menuCtxMedicao, setMenuCtxMedicao] = useState<{ left: number; top: number; idx: number } | null>(null);

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
      className={`${estiloTitulo ? '[&_*]:!text-inherit' : 'bg-red-600 dark:bg-red-950/90'} ${gradeTableRowTrCls}${onAbrirMenu ? ' cursor-pointer' : ''}`}
      style={estiloTitulo}
      onClick={onAbrirMenu}
      onContextMenu={onAbrirMenu}
    >
      <th
        colSpan={colCount}
        className={`border-b px-3 py-2.5 text-left align-middle font-normal sm:px-3.5 ${
          estiloTitulo
            ? 'border-black/10 bg-transparent dark:border-white/10'
            : 'border-red-700/70 bg-red-600 dark:border-red-900 dark:bg-red-950/90'
        }`}
        style={estiloTitulo}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-x-3">
          <p className={`min-w-0 flex-1 text-left text-sm font-bold leading-snug ${estiloTitulo ? '' : 'text-white'}`}>
            <span
              className={`mr-2 inline font-bold tabular-nums ${estiloTitulo ? '' : 'text-white'}`}
              aria-label={`Item ${itemRotulo || '—'}`}
            >
              {itemRotulo || '—'}
            </span>
            <span className={estiloTitulo ? '' : 'text-white'}>{itemDescricao}</span>
          </p>
          <div
            className={`flex shrink-0 items-center justify-center self-start border-t pt-2 text-center sm:self-center sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3 ${colMed} ${
              estiloTitulo ? 'border-black/20' : 'border-white/25'
            }`}
            title="Unidade de medida"
          >
            <span className={`text-[11px] font-bold uppercase tracking-wide ${estiloTitulo ? '' : 'text-white'}`}>
              {unidadeMedida.trim() || '—'}
            </span>
          </div>
        </div>
      </th>
    </tr>
  );

  type ColCabecalho = 'C' | 'L' | 'H' | 'N' | 'pct';

  const renderRotuloSelect = (
    col: ColCabecalho,
    titleCell: string | undefined,
    as: 'th' | 'td'
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
    return (
      <Tag className={`${thRest} !p-0 align-middle`} title={titleCell}>
        <label className="flex min-h-[2.75rem] items-stretch justify-center">
          <span className="sr-only">
            Coluna {col === 'pct' ? '%' : col}, rótulo {valorAtual}
          </span>
          <StringSingleSelectDropdown
            className="h-full w-full"
            triggerClassName={selectGradeHeaderMemorialCls}
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
        <th className={`${thFirst} !p-0 align-middle`}>
          <MemorialCampoLocal
            committedValue={dim.rotulosColunas?.descricao ?? 'DESCRIÇÃO: '}
            onCommit={(raw) => updateRotuloColunaMedicao?.('descricao', raw)}
            disabled={!updateRotuloColunaMedicao}
            className={inputThDescricaoCls}
            ariaLabel="Rótulo da coluna Descrição"
          />
        </th>
        {renderRotuloSelect('C', ehCargaEntulho && !podeEditarC0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect('L', ehCargaEntulho && !podeEditarL0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect('H', ehCargaEntulho && !podeEditarH0 ? 'Origem demolição' : undefined, 'th')}
        {renderRotuloSelect(
          'pct',
          ehCargaEntulho ? 'Fator de empolamento — editável nesta linha' : 'Fator de empolamento / perdas',
          'th'
        )}
        {renderRotuloSelect('N', bloquearN0 ? 'Origem demolição' : undefined, 'th')}
        <th className={thRest}>A</th>
        <th className={thRest}>V</th>
        <th className={thRest}>Subtotal</th>
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
    const renderDim = (campo: 'C' | 'L' | 'H' | 'N') => {
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const raw =
        campo === 'C'
          ? draftCalc[draftKey] ?? ((ln.C || 0) === 0 ? '' : String(ln.C))
          : campo === 'L'
            ? draftCalc[draftKey] ?? ((ln.L || 0) === 0 ? '' : String(ln.L))
            : campo === 'H'
              ? draftCalc[draftKey] ?? ((ln.H || 0) === 0 ? '' : String(ln.H))
              : draftCalc[draftKey] ?? ((ln.N || 0) === 0 ? '' : String(ln.N));
      const onCommit = (n: number) => {
        if (campo === 'N') updateLinhaMedicao(rowKey, idx, 'N', Math.max(0, n));
        else updateLinhaMedicao(rowKey, idx, campo, n);
      };
      return (
        <td className={`${tdRestBody} text-center`}>
          <input
            type="text"
            inputMode="decimal"
            placeholder={campo === 'N' ? '1' : '0'}
            value={raw}
            onChange={e => handleCalcChange(draftKey, e.target.value, onCommit)}
            onBlur={e => handleCalcBlur(draftKey, draftCalc[draftKey] ?? e.target.value, onCommit)}
            className={`${inputCls} text-center`}
          />
        </td>
      );
    };

    const renderCelulaAV = (campo: 'A' | 'V' | 'subtotal', calculado: number, title: string) => {
      const draftKey = `${rowKey}|${idx}|${campo}`;
      const persistCampo = campo === 'subtotal' ? 'subtotalManual' : 'valorManual';
      const temManual =
        campo === 'subtotal'
          ? ln.subtotalManual != null && Number.isFinite(ln.subtotalManual)
          : ln.valorManual != null && Number.isFinite(ln.valorManual);
      const valorManualExibir = campo === 'subtotal' ? ln.subtotalManual : ln.valorManual;
      const exibir = temManual ? String(valorManualExibir) : calculado === 0 ? '' : String(calculado);
      const persistir = (n: number, raw: string) => {
        if (campo === 'subtotal' && String(raw ?? '').trim() === '') {
          updateLinhaMedicao(rowKey, idx, 'subtotalManual', '');
          return;
        }
        updateLinhaMedicao(rowKey, idx, persistCampo, n);
      };
      return (
        <td className={tdCalcBody} title={title}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={draftCalc[draftKey] ?? exibir}
            onChange={e => handleCalcChange(draftKey, e.target.value, n => persistir(n, e.target.value))}
            onBlur={e =>
              handleCalcBlur(draftKey, draftCalc[draftKey] ?? e.target.value, n =>
                persistir(n, draftCalc[draftKey] ?? e.target.value)
              )
            }
            className={`${inputCls} text-center`}
          />
        </td>
      );
    };

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
        <td className={`${tdRestBody} text-center`}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="1"
            value={draftCalc[`${rowKey}|${idx}|empol`] ?? (empolVal === 0 ? '0' : empolVal === 1 ? '1' : String(empolVal))}
            onChange={e =>
              handleCalcChange(`${rowKey}|${idx}|empol`, e.target.value, n =>
                updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n))
              )
            }
            onBlur={e =>
              handleCalcBlur(`${rowKey}|${idx}|empol`, draftCalc[`${rowKey}|${idx}|empol`] ?? e.target.value, n =>
                updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n))
              )
            }
            className={`${inputCls} text-center`}
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
    '[&_tbody_tr:last-child_td]:!border-b-0 [&_td:last-child]:!border-r-0 [&_thead_th:last-child]:!border-r-0';

  const tabelaEnvoltorio = (children: React.ReactNode) => (
    <div className="table-scroll rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <table
        className={`w-full min-w-[56rem] table-fixed border-collapse text-sm ${gradeTableCls} ${gradeTabelaMemorialBordaCls}`}
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
  );


  if (!linhasEfetivas?.length) {
    const colEmpty = contarColunasGrade();
    if (ehCargaEntulho) {
      return (
        <>
        <div className="space-y-3">
          {tabelaEnvoltorio(
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
          )}
        </div>
        {portalMenuCtxMedicao}
        </>
      );
    }
    return (
      <>
      <div className="space-y-3">
        {tabelaEnvoltorio(
          <>
            <thead>
              {renderCabecalhoServico(colEmpty)}
              {renderHeaderRow(lnFallback)}
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
                  <button
                    type="button"
                    onClick={() => addLinhaMedicao(rowKey)}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                  >
                    <Plus className="h-4 w-4" />
                    Iniciar medições
                  </button>
                </td>
              </tr>
            </tbody>
          </>
        )}
      </div>
      {portalMenuCtxMedicao}
      </>
    );
  }

  if (!ehCargaEntulho) {
    const lnHeaderRef = linhasEfetivas.find(l => !l.cabecalhoSecao) ?? linhasEfetivas[0];
    const colCount = contarColunasGrade();
    return (
      <>
      <div className="space-y-3">
        {tabelaEnvoltorio(
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
        )}
      </div>
      {portalMenuCtxMedicao}
      </>
    );
  }

  /** Carga de entulho: uma tabela contínua (sem sub-blocos nem faixa duplicada por composição). */
  const lnHeaderCarga = linhasEfetivas.find(l => !l.cabecalhoSecao) ?? linhasEfetivas[0];
  const colCountCarga = contarColunasGrade();
  return (
    <>
      <div className="space-y-3">
        {tabelaEnvoltorio(
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
        )}
      </div>
      {portalMenuCtxMedicao}
    </>
  );
});
