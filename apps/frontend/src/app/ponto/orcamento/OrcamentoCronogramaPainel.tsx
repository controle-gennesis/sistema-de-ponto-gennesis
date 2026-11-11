'use client';

import React, { createContext, useContext, useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  CalendarRange,
  Download,
  FileText,
  Loader2,
  Palette
} from 'lucide-react';
import { estimarPrazosCronograma, gerarSubServicosCronograma } from './orcamentoCronogramaApi';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import {
  calcularDesvioTimeline,
  calcularMarcadorHojeTimeline,
  calcularResumoCronograma,
  calcularTimelineRange,
  calcularTimelineRangeVisivel,
  distribuirValorPorSemanasCronograma,
  isoDiaCronograma,
  listarDiasPrazoCronograma,
  repartirUsoPorDiasCronograma,
  TIMELINE_LARGURA_DIA_MIN_PX,
  distribuirPrazoGeralCronograma,
  montarPayloadEstimativaPrazoCronograma,
  formatDesvioDiasCurto,
  formatDesvioDiasLabel,
  montarLinhasTimeline,
  posicaoBarraTimelinePx,
  type CronogramaTimelineLinha,
  type CronogramaTimelineRange,
  type CronogramaTimelineZoom
} from './orcamentoCronogramaCalc';
import { CronogramaGraficosPainel } from './orcamentoCronogramaGraficos';
import type { DimensoesItem } from './orcamentoMedicaoTypes';
import {
  areaExibidaLinha,
  calcularQuantidadeLinha,
  linhasMedicaoEfetivas,
  volumeExibidoLinha
} from './orcamentoMedicaoCalc';
import {
  TimelineEtapaEditor,
  TimelineZoomControls,
  parseQuantidadeUsada,
  formatQtdEditor,
  type TimelineEtapaEditorTarget
} from './orcamentoCronogramaTimelineUi';
import {
  CRONOGRAMA_STATUS_CLASS,
  CRONOGRAMA_STATUS_LABEL,
  agregarDadosComposicoes,
  agruparSubServicosPorBloco,
  calcularStatusCronograma,
  listarComposicoesCronogramaLinha,
  criarSubServicoManual,
  cronogramaUsaHierarquiaSubtitulos,
  diasEntre,
  filtrarSubServicosOperacionaisCronograma,
  formatDataBr,
  etapaCronogramaEhSintetica,
  listarEtapasCronogramaBloco,
  listarSubServicos,
  listarSubtitulosVisiveisCronograma,
  novoSubServicoId,
  ordenarSubServicosSequenciaObra,
  parseDataIso,
  itemKeyComposicaoCronograma,
  resolverDadosCronogramaBloco,
  resolverDadosCronogramaComposicao,
  resolverDadosCronogramaServicoParaLinha,
  resolverDadosCronogramaSubServico,
  type CronogramaComposicaoRef,
  type CronogramaItemData,
  type CronogramaLinhaServico,
  type CronogramaLinhaSubtitulo,
  type CronogramaPersist,
  type CronogramaSubServico
} from './orcamentoCronogramaTypes';
import {
  gradeHideVerticalScrollbarCls,
  gradeTableCls,
  gradeTableViewportCls,
  gradeTableRowTrCls,
  gradeThStickyCls,
  tdGradeDateCls
} from './orcamentoGradeCellClasses';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

type Props = {
  linhas: CronogramaLinhaServico[];
  cronograma: CronogramaPersist;
  onChange: (next: CronogramaPersist) => void;
  centroCustoId?: string | null;
  orcamentoId?: string | null;
  /** Datas do orçamento (meta.dataAbertura / dataEnvio). */
  dataInicioObra?: string;
  dataFimObra?: string;
  /** Persiste a data de fim da obra (meta.dataEnvio) quando informada na modal. */
  onDataFimObraChange?: (dataFimIso: string) => void;
  onExport?: () => void;
  onExportPdf?: () => void;
  /** Tela cheia: a grade rola por dentro e as ações ficam na barra de baixo. */
  telaFixa?: boolean;
  /** Aparência editável (Características do orçamento → Cronograma); sem isto vale o visual padrão. */
  estilosAparencia?: {
    servico?: React.CSSProperties;
    subtitulo?: React.CSSProperties;
    /** Cor das composições nas linhas ímpares. */
    composicao?: React.CSSProperties;
    /** Segunda cor das listras (composições pares). */
    composicaoAlt?: React.CSSProperties;
    classeCustom: string;
    fonte?: string;
    /** Bordas visíveis entre linhas e colunas. */
    linhasGrade?: boolean;
    /** Esconde as linhas de título dos serviços que têm composições. */
    ocultarServicos?: boolean;
  };
  onEditarAparencia?: () => void;
  /** Memorial de cálculo de cada composição (chave `bloco|composição`), só para consulta. */
  dimensoesPorItem?: Record<string, DimensoesItem>;
};

/** Devolve o memorial da composição de uma linha do cronograma (ou nada, se ela não tem). */
const MemorialCronogramaCtx = createContext<((linha: CronogramaTimelineLinha) => DimensoesItem | undefined) | null>(
  null
);

type OrigemMemorial = 'C' | 'L' | 'H' | 'N' | 'A' | 'V' | 'Q';

/** Cor de cada coluna do memorial: o número inserido na fórmula leva a cor de onde veio. */
/** Mesma tipografia no campo e no espelho colorido, para o texto não deslocar. */
const FONTE_FORMULA: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 400,
  lineHeight: '14px',
  letterSpacing: 'normal',
  fontVariantNumeric: 'tabular-nums'
};

const COR_ORIGEM: Record<OrigemMemorial, { chip: string; hover: string; anel: string; fundo: string }> = {
  C: {
    chip: 'text-blue-700 dark:text-blue-300',
    fundo: 'bg-blue-100 dark:bg-blue-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#2563eb] dark:shadow-[inset_0_0_0_2px_#60a5fa]',
    hover: 'hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-500/15 dark:hover:text-blue-300'
  },
  L: {
    chip: 'text-emerald-700 dark:text-emerald-300',
    fundo: 'bg-emerald-100 dark:bg-emerald-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#059669] dark:shadow-[inset_0_0_0_2px_#34d399]',
    hover: 'hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300'
  },
  H: {
    chip: 'text-amber-700 dark:text-amber-300',
    fundo: 'bg-amber-100 dark:bg-amber-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#d97706] dark:shadow-[inset_0_0_0_2px_#fbbf24]',
    hover: 'hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/15 dark:hover:text-amber-300'
  },
  N: {
    chip: 'text-violet-700 dark:text-violet-300',
    fundo: 'bg-violet-100 dark:bg-violet-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#7c3aed] dark:shadow-[inset_0_0_0_2px_#a78bfa]',
    hover: 'hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/15 dark:hover:text-violet-300'
  },
  A: {
    chip: 'text-cyan-700 dark:text-cyan-300',
    fundo: 'bg-cyan-100 dark:bg-cyan-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#0891b2] dark:shadow-[inset_0_0_0_2px_#22d3ee]',
    hover: 'hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-500/15 dark:hover:text-cyan-300'
  },
  V: {
    chip: 'text-pink-700 dark:text-pink-300',
    fundo: 'bg-pink-100 dark:bg-pink-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#db2777] dark:shadow-[inset_0_0_0_2px_#f472b6]',
    hover: 'hover:bg-pink-50 hover:text-pink-700 dark:hover:bg-pink-500/15 dark:hover:text-pink-300'
  },
  Q: {
    chip: 'text-red-700 dark:text-red-300',
    fundo: 'bg-red-100 dark:bg-red-500/20',
    anel: 'shadow-[inset_0_0_0_2px_#dc2626] dark:shadow-[inset_0_0_0_2px_#f87171]',
    hover: 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400'
  }
};

/** Separa a fórmula salva das origens (`=2*7.5||7.5@L`). */
function lerFormulaPlanejada(salvo: string | undefined): { formula: string; origens: string[] } {
  if (!salvo) return { formula: '', origens: [] };
  const [formula, resto] = salvo.split('||');
  return { formula: formula ?? '', origens: resto ? resto.split(';').filter(Boolean) : [] };
}

/** Quebra a fórmula em pedaços; cada número que veio do memorial recebe a coluna de origem. */
function pedacosFormula(texto: string, origens: string[]): Array<{ t: string; col?: OrigemMemorial }> {
  const pool = [...origens];
  return texto
    .split(/(\d+(?:\.\d{3})*,\d+|\d+(?:\.\d+)?)/)
    .filter((t) => t !== '')
    .map((t) => {
      if (/^\d/.test(t)) {
        const i = pool.findIndex((o) => o.split('@')[0] === t);
        if (i >= 0) {
          const col = pool[i]!.split('@')[1] as OrigemMemorial;
          pool.splice(i, 1);
          return { t, col };
        }
      }
      return { t };
    });
}

const fmtMemorial = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—';

/** Balão de consulta (somente leitura) com as linhas do memorial: C, L, H, N, A, V e subtotal. */
function MemorialConsultaPopover({
  dim,
  ancora,
  titulo,
  onPick,
  marcados
}: {
  dim: DimensoesItem;
  ancora: DOMRect;
  titulo: string;
  /** Clique num valor: leva o número para a fórmula da célula (com a coluna de onde veio). */
  onPick: (n: number, col: OrigemMemorial) => void;
  /** Valores já usados na fórmula (`número@coluna`): a célula correspondente ganha borda na cor da coluna. */
  marcados: Set<string>;
}) {
  const linhas = linhasMedicaoEfetivas(dim);
  const rot = dim.rotulosColunas ?? {};
  const LARG = 720;
  const esquerda = Math.max(8, Math.min(ancora.left, window.innerWidth - LARG - 8));
  const abaixo = ancora.bottom + 6;
  const altMax = 380;
  const cabeEmbaixo = abaixo + Math.min(altMax, 110 + linhas.length * 40) < window.innerHeight;
  const estilo: React.CSSProperties = {
    left: esquerda,
    width: LARG,
    maxHeight: altMax,
    ...(cabeEmbaixo ? { top: abaixo } : { bottom: window.innerHeight - ancora.top + 6 })
  };
  const th = 'border-r last:border-r-0 border-gray-200 dark:border-gray-700 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400';
  const td = 'border-r last:border-r-0 border-gray-200 dark:border-gray-700 p-0 text-center text-xs tabular-nums';
  const valorBtn = (n: number, col: OrigemMemorial, forte = false) => (
    <button
      type="button"
      onClick={() => onPick(n, col)}
      title="Clique para usar este valor na fórmula"
      className={`block h-full w-full rounded-none px-1.5 py-3 tabular-nums text-gray-800 transition-colors dark:text-gray-100 ${COR_ORIGEM[col].hover} ${forte ? 'font-semibold' : ''} ${
        marcados.has(`${fmtMemorial(n)}@${col}`) ? `${COR_ORIGEM[col].anel} ${COR_ORIGEM[col].fundo} ${COR_ORIGEM[col].chip} font-semibold` : ''
      }`}
    >
      {fmtMemorial(n)}
    </button>
  );
  const total = linhas.reduce((t, ln) => t + calcularQuantidadeLinha(ln, dim.tipoUnidade), 0);
  return createPortal(
    <div
      className="fixed z-[300] flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      style={estilo}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="shrink-0 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Memorial de cálculo
        </p>
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</p>
      </div>
      {linhas.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
          Esta composição não tem memorial de cálculo.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col style={{ width: '25%' }} />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                <th className={`${th} !pl-4 !text-left`}>{(rot.descricao ?? '').replace(/:\s*$/, '') || 'Descrição'}</th>
                <th className={th}>{rot.C || 'C'}</th>
                <th className={th}>{rot.L || 'L'}</th>
                <th className={th}>{rot.H || 'H'}</th>
                <th className={th}>{rot.N || 'N'}</th>
                <th className={th}>A</th>
                <th className={th}>V</th>
                <th className={th}>Qtd</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((ln, i) =>
                ln.cabecalhoSecao ? (
                  <tr key={i} className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                    <td colSpan={8} className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {ln.descricao}
                    </td>
                  </tr>
                ) : (
                  <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="truncate border-r border-gray-200 dark:border-gray-700 py-2 pl-4 pr-2 text-left text-xs text-gray-800 dark:text-gray-100">
                      {ln.descricao || '—'}
                    </td>
                    <td className={td}>{valorBtn(ln.C, 'C')}</td>
                    <td className={td}>{valorBtn(ln.L, 'L')}</td>
                    <td className={td}>{valorBtn(ln.H, 'H')}</td>
                    <td className={td}>{valorBtn(ln.N, 'N')}</td>
                    <td className={td}>{valorBtn(areaExibidaLinha(ln), 'A')}</td>
                    <td className={td}>{valorBtn(volumeExibidoLinha(ln, dim.tipoUnidade), 'V')}</td>
                    <td className={td}>{valorBtn(calcularQuantidadeLinha(ln, dim.tipoUnidade), 'Q', true)}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
        <span>Total</span>
        <button
          type="button"
          onClick={() => onPick(total, 'Q')}
          title="Clique para usar este valor na fórmula"
          className="rounded-md px-2 py-1 tabular-nums transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        >
          {fmtMemorial(total)}
        </button>
      </div>
    </div>,
    document.body
  );
}

const thCls =
  '!h-auto !min-h-0 px-3 py-2.5 text-center text-[11px] font-semibold text-[var(--orc-header-fg,#4b5563)] uppercase tracking-wide border-l border-gray-300 dark:border-gray-600 first:border-l-0';
const tdCls =
  'h-[2.75rem] px-2 py-0 text-sm leading-none text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-600 align-middle';
/** Item 6.5 + Serviço 22 + Unidade 5.5 + Quantidade 7 + Custo 11 + Início 9 + Fim 9 + Dias 4 + Executado 6.5 + Status 7. */
const COLUNAS_FIXAS_REM = 87.5;
/** A coluna Status só aparece na aba Real (no Planejado ela confunde: mede a execução, não o plano). */
const COLUNA_STATUS_REM = 7;
const tdItemColCls =
  'min-h-[2.75rem] w-[6.5rem] max-w-[6.5rem] min-w-0 px-2 py-2.5 text-center text-xs font-medium tabular-nums border-l-0 align-middle whitespace-normal break-words text-gray-700 dark:text-gray-300';
const thItemColCls =
  '!h-auto !min-h-0 w-[6.5rem] max-w-[6.5rem] min-w-0 px-2 py-2.5 text-center text-[11px] font-semibold text-[var(--orc-header-fg,#4b5563)] uppercase tracking-wide border-l-0';
const tdServicoColCls =
  'min-h-[2.75rem] w-[22rem] max-w-[22rem] min-w-0 px-3 py-2.5 text-sm border-l border-gray-200 dark:border-gray-600 align-middle';
const thServicoColCls =
  '!h-auto !min-h-0 w-[22rem] max-w-[22rem] min-w-0 px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--orc-header-fg,#4b5563)] uppercase tracking-wide border-l border-gray-300 dark:border-gray-600';
const stickyItemThCls = 'left-0 z-30';
const stickyServicoThCls =
  'left-[6.5rem] z-30 border-r border-gray-300 dark:border-gray-600';
const stickyItemTdCls = 'sticky left-0 z-10';
const stickyServicoTdCls =
  'sticky left-[6.5rem] z-10 border-r border-gray-200 dark:border-gray-600';
const stickyUnidadeThCls = 'left-[28.5rem] z-30';
const stickyQtdThCls = 'left-[34rem] z-30 border-r border-gray-300 dark:border-gray-600';
const stickyUnidadeTdCls = 'sticky left-[28.5rem] z-10';
const stickyQtdTdCls = 'sticky left-[34rem] z-10 border-r border-gray-200 dark:border-gray-600';
const thUnidadeColCls = `${thCls} w-[5.5rem] !border-l-0 px-2`;
const thQtdColCls = `${thCls} w-[7rem] px-2`;
const thCustoColCls = `${thCls} !border-l-0 w-[11rem] whitespace-normal leading-tight`;
const tdUnidadeColCls = `${tdCls} w-[5.5rem] !border-l-0 px-2 text-center`;
const tdQtdColCls = `${tdCls} w-[7rem] px-2 text-center tabular-nums`;
const tdCustoColCls = `${tdCls} !border-l-0 w-[11rem] px-2 tabular-nums`;
const thDateColCls = `${thCls} w-[9rem]`;
const thDiasColCls = `${thCls} w-[4rem]`;
const thStatusColCls = `${thCls} w-[7rem]`;
const tdPctColCls = `${tdCls} text-center w-[6.5rem] px-1 whitespace-nowrap`;
const thPctColCls = `${thCls} w-[6.5rem] px-1 whitespace-nowrap`;
const statusBarCls = (status: keyof typeof CRONOGRAMA_STATUS_CLASS) =>
  status === 'concluido'
    ? 'bg-green-500'
    : status === 'atrasado'
      ? 'bg-red-500'
      : status === 'em_andamento'
        ? 'bg-sky-500'
        : 'bg-gray-400 dark:bg-gray-500';
const statusSpanCls = (status: keyof typeof CRONOGRAMA_STATUS_CLASS) =>
  `inline-flex items-center text-sm font-semibold ${CRONOGRAMA_STATUS_CLASS[status]}`;
const actionBtnCls =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';
const iconBtnCls =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 dark:focus-visible:ring-offset-gray-900';


function deltaRolagemPx(e: WheelEvent): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) return e.deltaY * window.innerHeight;
  return e.deltaY;
}

/** A grade só rola na horizontal. O giro vertical vai para a página. */
function encaminharRolagemVertical(el: HTMLElement, e: WheelEvent) {
  if (e.ctrlKey) return;
  const dy = deltaRolagemPx(e);
  if (dy === 0 || Math.abs(dy) <= Math.abs(e.deltaX)) return;
  const cabeNaVertical = el.scrollHeight <= el.clientHeight + 1;
  const noTopo = el.scrollTop <= 0 && dy < 0;
  const noFim = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && dy > 0;
  if (!cabeNaVertical && !noTopo && !noFim) return;
  let pai: HTMLElement | null = el.parentElement;
  while (pai) {
    const oy = getComputedStyle(pai).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && pai.scrollHeight > pai.clientHeight + 1) {
      pai.scrollTop += dy;
      e.preventDefault();
      return;
    }
    pai = pai.parentElement;
  }
}

function paddingServicoColCls(indentLevel: 0 | 1 | 2 = 0): string {
  if (indentLevel >= 2) return 'pl-9';
  if (indentLevel === 1) return 'pl-6';
  return 'pl-4';
}

function ComposicaoResumoNomeCell({ nome }: { nome: string }) {
  return (
    <div className="min-w-0 whitespace-normal break-words text-left text-sm font-normal uppercase leading-snug text-gray-900 dark:text-gray-100">
      {nome}
    </div>
  );
}

function formatQtdCronograma(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function formatMoedaCronograma(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function somaCustoComposicoes(comps: Array<{ comp: CronogramaComposicaoRef }>): number {
  return comps.reduce((acc, item) => acc + (item.comp.valorTotal ?? 0), 0);
}

function CelulasQtdCusto({
  unidade,
  quantidade,
  custo,
  destaque = false,
  fixoBgCls = '',
  fixoStyle
}: {
  unidade?: string;
  quantidade?: number | null;
  custo?: number | null;
  destaque?: boolean;
  /** Fundo da linha: as colunas fixas precisam de fundo próprio para cobrir a linha do tempo ao rolar. */
  fixoBgCls?: string;
  fixoStyle?: React.CSSProperties;
}) {
  const peso = destaque ? 'font-semibold' : '';
  return (
    <>
      <td
        style={fixoStyle}
        className={`${tdUnidadeColCls} ${stickyUnidadeTdCls} ${fixoBgCls} ${peso}`}
      >
        {unidade?.trim() || '—'}
      </td>
      <td style={fixoStyle} className={`${tdQtdColCls} ${stickyQtdTdCls} ${fixoBgCls} ${peso}`}>
        {quantidade != null && Number.isFinite(quantidade) ? formatQtdCronograma(quantidade) : '—'}
      </td>
      <td className={`${tdCustoColCls} ${peso}`}>
        {custo != null && Number.isFinite(custo) ? (
          <div className="flex w-full items-baseline justify-between gap-1.5">
            <span className="shrink-0 opacity-80">R$</span>
            <span className="shrink-0 whitespace-nowrap text-right">{formatMoedaCronograma(custo)}</span>
          </div>
        ) : (
          '—'
        )}
      </td>
    </>
  );
}

function DataCronogramaSomenteLeitura({ value }: { value: string | undefined }) {
  const texto = formatDataBr(value);
  return (
    <span
      className="flex h-full w-full items-center justify-center px-1 text-center text-sm font-semibold tabular-nums leading-none text-gray-900 dark:text-gray-100"
      title={texto !== '—' ? texto : undefined}
    >
      {texto}
    </span>
  );
}

function CelulasEtapaCronograma({
  resolvido,
  status,
  readOnly,
  ariaPrefix,
  onPatch,
  modo,
  corStatusPropria = true
}: {
  resolvido: CronogramaItemData;
  status: ReturnType<typeof calcularStatusCronograma>;
  readOnly: boolean;
  ariaPrefix: string;
  onPatch: (patch: Partial<CronogramaItemData>) => void;
  modo: 'plan' | 'real';
  /** false: o status herda a cor da linha (ex.: serviço em fundo vermelho com letra branca). */
  corStatusPropria?: boolean;
}) {
  const observacao = resolvido.observacao?.trim() || '';
  const inicio = modo === 'real' ? resolvido.dataInicioReal : resolvido.dataInicio;
  const fim = modo === 'real' ? resolvido.dataFimReal : resolvido.dataFim;

  const celulaData = (
    value: string | undefined,
    onChange: (v: string) => void,
    ariaLabel: string
  ) => (
    <td className={`${tdGradeDateCls} text-center`}>
      {readOnly ? (
        <DataCronogramaSomenteLeitura value={value} />
      ) : (
        <DatePickerField
          size="table"
          appearance="inline"
          hideIcon
          textAlign="center"
          className="!h-[2.75rem] !py-0 !leading-none"
          value={value ?? ''}
          onChange={onChange}
          placeholder="dd/mm/aaaa"
          aria-label={ariaLabel}
        />
      )}
    </td>
  );

  return (
    <>
      {celulaData(
        inicio,
        (v) => onPatch(modo === 'real' ? { dataInicioReal: v } : { dataInicio: v }),
        `Início — ${ariaPrefix}`
      )}
      {celulaData(
        fim,
        (v) => onPatch(modo === 'real' ? { dataFimReal: v } : { dataFim: v }),
        `Fim — ${ariaPrefix}`
      )}
      <td
        className={`${tdCls} w-[4rem] text-center tabular-nums text-xs ${
          readOnly ? 'text-gray-500 dark:text-gray-400' : ''
        }`}
      >
        {diasEntre(inicio, fim) ?? '—'}
      </td>
      <td className={tdPctColCls}>
        <span className="block w-full text-center text-sm tabular-nums text-gray-900 dark:text-gray-100">
          {resolvido.percentualExecutado != null && Number.isFinite(resolvido.percentualExecutado)
            ? `${resolvido.percentualExecutado.toLocaleString('pt-BR', {
                maximumFractionDigits: 2
              })}%`
            : '0%'}
        </span>
      </td>
      {modo === 'real' ? (
        <td className={`${tdCls} w-[7rem] text-center`}>
          <span
            data-cor-propria={corStatusPropria ? true : undefined}
            className={`${statusSpanCls(status)}${observacao ? ' cursor-help' : ''}`}
            title={observacao || undefined}
          >
            {CRONOGRAMA_STATUS_LABEL[status]}
          </span>
        </td>
      ) : null}
    </>
  );
}

function gradeDiasTimeline(totalDias: number, diaPx: number): string {
  return `repeat(${totalDias}, ${diaPx}px)`;
}

function CelulaQtdPlanejadaDia({
  linha,
  iso,
  qtd,
  formulaSalva,
  orcada,
  custo,
  onQtdDia
}: {
  linha: CronogramaTimelineLinha;
  iso: string;
  qtd: number | undefined;
  formulaSalva?: string;
  orcada: number;
  custo: number;
  onQtdDia: (row: CronogramaTimelineLinha, iso: string, qtd: number | null, formula?: string | null) => void;
}) {
  const tem = qtd != null && qtd > 0;
  const memorialDe = useContext(MemorialCronogramaCtx);
  const dimMemorial = memorialDe?.(linha);
  const inputRef = useRef<HTMLInputElement>(null);
  const espelhoRef = useRef<HTMLDivElement>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [origens, setOrigens] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [ancora, setAncora] = useState<DOMRect | null>(null);
  const salva = useMemo(() => lerFormulaPlanejada(formulaSalva), [formulaSalva]);

  // Na edição aparece a fórmula (se houver); fora dela, só o valor.
  const iniciarEdicao = (inicial?: string) => {
    if (inicial != null) {
      setTexto(inicial);
      setOrigens([]);
    } else if (salva.formula) {
      setTexto(salva.formula);
      setOrigens(salva.origens);
    } else {
      setTexto(tem ? formatQtdEditor(qtd as number) : '');
      setOrigens([]);
    }
    setEditando(true);
  };
  useEffect(() => {
    if (!editando) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const fim = el.value.length;
    el.setSelectionRange(fim, fim);
    setCursor(fim);
    setAncora(el.getBoundingClientRect());
  }, [editando]);

  // Grava ao apertar Enter ou sair da célula; enquanto digita, % e valor não mudam.
  const confirmar = () => {
    setEditando(false);
    setAncora(null);
    const bruto = texto.trim();
    if (bruto === '') {
      if (tem) onQtdDia(linha, iso, null, null);
      return;
    }
    const n = parseQuantidadeUsada(bruto);
    if (n == null) return;
    const ehFormula = bruto.startsWith('=');
    const usadas = ehFormula
      ? origens.filter((o) => pedacosFormula(bruto, [o]).some((p) => p.col))
      : [];
    const novaFormula = ehFormula ? bruto + (usadas.length ? '||' + usadas.join(';') : '') : null;
    if (n !== (qtd ?? 0) || (novaFormula ?? '') !== (formulaSalva ?? '')) {
      onQtdDia(linha, iso, n, novaFormula);
    }
  };
  // Valor clicado no memorial entra na fórmula (vira "=" + número se ainda não era fórmula).
  const inserirDoMemorial = (n: number, col: OrigemMemorial) => {
    const num = fmtMemorial(n);
    // Se a fórmula já termina num número, o valor clicado troca esse número em vez de grudar nele.
    const fim = /(\d+(?:\.\d{3})*,\d+|\d+(?:\.\d+)?)\s*$/.exec(texto);
    const semFim = fim ? texto.slice(0, fim.index) : texto;
    const base = semFim.trim().startsWith('=') ? semFim : '=' + semFim.trim();
    setTexto(base + num);
    setCursor((base + num).length);
    setOrigens((o) => {
      const restantes = fim ? o.filter((x, i, arr) => !(x.split('@')[0] === fim[1] && arr.indexOf(x) === i)) : o;
      return [...restantes, `${num}@${col}`];
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const pedacosAtuais = pedacosFormula(texto, origens);
  const temOrigem = pedacosAtuais.some((pc) => pc.col);
  const marcados = new Set(pedacosAtuais.filter((pc) => pc.col).map((pc) => `${pc.t}@${pc.col}`));
  const qtdVal = qtd ?? 0;
  const temVal = qtdVal > 0;
  const razao = orcada > 0 ? qtdVal / orcada : 0;
  return (
    <div className="grid h-full min-w-0 grid-rows-3 border-l border-gray-300 first:border-l-0 dark:border-gray-600">
      <div
        className={`flex min-h-6 items-center justify-center border-b border-gray-200 px-0.5 text-[10px] dark:border-gray-700 font-semibold tabular-nums ${
          temVal ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {`${Math.min(100, razao * 100).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}%`}
      </div>
      {editando ? (
        <div className="relative z-[3] min-h-6 min-w-0 overflow-hidden bg-gray-50 shadow-[inset_0_0_0_2px_#dc2626] dark:bg-gray-800 dark:shadow-[inset_0_0_0_2px_#f87171]">
          {/* Espelho colorido: só existe quando há números vindos do memorial; senão o próprio campo mostra o texto. */}
          <input
            ref={inputRef}
            type="text"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onScroll={(e) => {
              if (espelhoRef.current) espelhoRef.current.style.transform = `translateX(${-e.currentTarget.scrollLeft}px)`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTexto(salva.formula || (tem ? formatQtdEditor(qtd as number) : ''));
                setEditando(false);
                setAncora(null);
              }
            }}
            onBlur={confirmar}
            style={{
              ...FONTE_FORMULA,
              outline: 'none',
              boxShadow: 'none',
              ...(temOrigem ? { color: 'transparent', WebkitTextFillColor: 'transparent', caretColor: 'transparent' } : {})
            }}
            aria-label={`Quantidade planejada — ${linha.label} — ${formatDataBr(iso)}`}
            className="absolute inset-0 box-border h-full w-full min-w-0 rounded-none border-0 border-transparent bg-transparent px-1 py-0 text-left text-gray-900 caret-gray-900 dark:text-gray-100 !outline-none !shadow-none !ring-0 focus-visible:!outline-none dark:caret-gray-100"
          />
          {temOrigem ? (
          <div
            ref={espelhoRef}
            aria-hidden
            style={FONTE_FORMULA}
            className="pointer-events-none absolute inset-0 z-10 flex min-w-full items-center overflow-hidden whitespace-pre bg-gray-50 px-1 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
          >
            {(() => {
              const nos: React.ReactNode[] = [];
              let pos = 0;
              let caretPosto = false;
              const caret = (k: string) => (
                <span key={k} className="inline-block h-3 w-px animate-pulse bg-gray-900 align-middle dark:bg-gray-100" />
              );
              pedacosAtuais.forEach((pc, i) => {
                const cls = pc.col ? COR_ORIGEM[pc.col].chip : undefined;
                const fim = pos + pc.t.length;
                if (!caretPosto && cursor >= pos && cursor <= fim) {
                  const corte = cursor - pos;
                  nos.push(
                    <span key={`a${i}`} className={cls}>
                      {pc.t.slice(0, corte)}
                    </span>,
                    caret(`c${i}`),
                    <span key={`b${i}`} className={cls}>
                      {pc.t.slice(corte)}
                    </span>
                  );
                  caretPosto = true;
                } else {
                  nos.push(
                    <span key={i} className={cls}>
                      {pc.t}
                    </span>
                  );
                }
                pos = fim;
              });
              if (!caretPosto) nos.push(caret('cfim'));
              return nos;
            })()}
          </div>
          ) : null}
        </div>
      ) : (
        <div
          tabIndex={0}
          role="button"
          title={salva.formula ? `${salva.formula} — dê dois cliques para editar` : 'Dê dois cliques para editar'}
          aria-label={`Quantidade planejada — ${linha.label} — ${formatDataBr(iso)}`}
          onDoubleClick={() => iniciarEdicao()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'F2') {
              e.preventDefault();
              iniciarEdicao();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              if (tem) onQtdDia(linha, iso, null, null);
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              iniciarEdicao(e.key);
            }
          }}
          className="relative flex min-h-6 cursor-default select-none items-center justify-center bg-white px-0.5 text-[11px] leading-none tabular-nums text-gray-900 outline-none focus:z-[3] focus:bg-gray-50 focus:shadow-[inset_0_0_0_2px_#dc2626] dark:focus:shadow-[inset_0_0_0_2px_#f87171] dark:bg-gray-900 dark:text-gray-100 dark:focus:bg-gray-800"
        >
          {tem ? formatQtdEditor(qtd as number) : ''}
        </div>
      )}
      <div
        className={`flex min-h-6 items-center justify-center border-t border-gray-200 px-0.5 text-[10px] font-semibold tabular-nums dark:border-gray-700 ${
          temVal ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        {(razao * custo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </div>
      {editando && ancora && dimMemorial ? (
        <MemorialConsultaPopover
          dim={dimMemorial}
          ancora={ancora}
          titulo={`${linha.item ?? ''} ${linha.label}`.trim()}
          onPick={inserirDoMemorial}
          marcados={marcados}
        />
      ) : null}
    </div>
  );
}

function CelulaLinhaTimeline({
  row,
  timelineRange,
  largura,
  diaPx,
  modo,
  onEdit,
  bgCls = '',
  bgStyle,
  onQtdDia
}: {
  bgCls?: string;
  bgStyle?: React.CSSProperties;
  row: CronogramaTimelineLinha | undefined;
  timelineRange: CronogramaTimelineRange | null;
  largura: number;
  diaPx: number;
  modo: 'plan' | 'real';
  onEdit: (row: CronogramaTimelineLinha, e: React.MouseEvent) => void;
  /** Grava a quantidade planejada de um dia (aba Planejado); `null` apaga. */
  onQtdDia?: (row: CronogramaTimelineLinha, iso: string, qtd: number | null, formula?: string | null) => void;
}) {
  const tdClsTimeline = 'relative h-px border-l border-gray-200 p-0 align-middle dark:border-gray-600';
  const tdStyle = {
    ...bgStyle,
    width: largura || undefined,
    minWidth: largura || undefined,
    maxWidth: largura || undefined
  };
  if (!timelineRange || largura <= 0 || diaPx <= 0) {
    return <td className={`${tdClsTimeline} ${bgCls}`} style={tdStyle} />;
  }

  const linha = row && !row.isCabecalhoServico && !row.isCabecalhoSubtitulo ? row : null;
  const status = linha ? calcularStatusCronograma(linha.dados) : 'pendente';
  const iniPlan = linha ? parseDataIso(linha.dados.dataInicio) : null;
  const fimPlan = linha ? parseDataIso(linha.dados.dataFim) : null;
  const iniReal = linha ? parseDataIso(linha.dados.dataInicioReal) : null;
  const fimReal = linha ? parseDataIso(linha.dados.dataFimReal) : null;
  const barPlan =
    linha?.showBar && iniPlan && fimPlan
      ? posicaoBarraTimelinePx(timelineRange.inicio, timelineRange.fim, iniPlan, fimPlan, diaPx)
      : null;
  const barReal =
    linha?.showBar && iniReal && fimReal
      ? posicaoBarraTimelinePx(timelineRange.inicio, timelineRange.fim, iniReal, fimReal, diaPx)
      : null;
  if (modo === 'plan' && linha && linha.editavel && onQtdDia) {
    const orcada = linha.quantidade ?? 0;
    const custo = linha.valorTotal ?? 0;
    const planejadas = linha.dados.quantidadesPlanejadasPorDia ?? {};
    // Quando a soma planejada fecha 100% da quantidade orçada, os dias seguintes ficam vazios.
    let fechouEm = -1;
    if (orcada > 0) {
      let acumulado = 0;
      for (let i = 0; i < timelineRange.colunas.length; i += 1) {
        acumulado += planejadas[isoDiaCronograma(timelineRange.colunas[i].data)] ?? 0;
        if (acumulado >= orcada - 1e-9) {
          fechouEm = i;
          break;
        }
      }
    }
    return (
      <td className={`${tdClsTimeline} ${bgCls}`} style={tdStyle}>
        <div style={{ height: 72 }} aria-hidden />
        <div
          className="absolute inset-0 grid"
          style={{ width: largura, gridTemplateColumns: gradeDiasTimeline(timelineRange.colunas.length, diaPx) }}
        >
          {timelineRange.colunas.map((col, indiceCol) => {
            const iso = isoDiaCronograma(col.data);
            if (fechouEm >= 0 && indiceCol > fechouEm && !(planejadas[iso] > 0)) {
              return (
                <div
                  key={`${linha.key}-${col.key}`}
                  className="h-full min-w-0 border-l border-gray-300 first:border-l-0 dark:border-gray-600"
                />
              );
            }
            return (
              <CelulaQtdPlanejadaDia
                key={`${linha.key}-${col.key}`}
                linha={linha}
                iso={iso}
                qtd={planejadas[iso]}
                formulaSalva={linha.dados.formulasPlanejadasPorDia?.[iso]}
                orcada={orcada}
                custo={custo}
                onQtdDia={onQtdDia}
              />
            );
          })}
        </div>
      </td>
    );
  }

  const pct = Math.min(100, Math.max(0, Math.round(linha?.dados.percentualExecutado ?? 0)));
  const desvio = linha ? calcularDesvioTimeline(linha.dados) : null;
  const mostrarBarraPlan = modo === 'plan' && Boolean(barPlan && barPlan.widthPx > 0);
  const mostrarBarraReal = modo === 'real' && Boolean(barReal && barReal.widthPx > 0);
  /** Na aba Real, o planejado aparece como referência: contorno tracejado que abraça a barra real (ou barra tracejada se ainda não há real). */
  const mostrarPlanejadoNoReal = modo === 'real' && Boolean(barPlan && barPlan.widthPx > 0);
  const iniValor = modo === 'real' ? iniReal : iniPlan;
  const fimValor = modo === 'real' ? fimReal : fimPlan;
  const qtdOrcada = linha?.quantidade ?? 0;
  const mapaDias = linha?.dados.quantidadesPorDia;
  const temMapa = Boolean(mapaDias && Object.keys(mapaDias).length > 0);
  const qtdUsada = linha?.dados.quantidadeExecutada;
  const temUsoLegado = !temMapa && qtdUsada != null && Number.isFinite(qtdUsada) && qtdOrcada > 0;
  const custoLinha = linha?.valorTotal ?? 0;
  const diasDoMapa =
    temMapa && iniValor && fimValor && qtdOrcada > 0
      ? listarDiasPrazoCronograma(iniValor, fimValor).flatMap((data) => {
          const qtdDia = mapaDias?.[isoDiaCronograma(data)] ?? 0;
          if (!(qtdDia > 0)) return [];
          const razao = qtdDia / qtdOrcada;
          return [
            {
              data,
              quantidade: qtdDia,
              valor: razao * custoLinha,
              percentual: Math.min(100, Math.max(0, razao * 100))
            }
          ];
        })
      : [];
  const temUso = diasDoMapa.length > 0 || temUsoLegado;
  const razaoUso = temUsoLegado ? (qtdUsada ?? 0) / qtdOrcada : null;
  const valorUsado = razaoUso != null ? razaoUso * custoLinha : null;
  const pctUsado = razaoUso != null ? Math.min(100, Math.max(0, razaoUso * 100)) : null;
  const valorBarra = valorUsado != null && valorUsado > 0 ? valorUsado : custoLinha;
  const diasUso = temUsoLegado && iniValor && fimValor
    ? repartirUsoPorDiasCronograma(iniValor, fimValor, qtdUsada ?? 0, valorUsado ?? 0, pctUsado ?? 0)
    : diasDoMapa;
  const fatiasDia = diasUso.flatMap((dia) => {
    const pos = posicaoBarraTimelinePx(timelineRange.inicio, timelineRange.fim, dia.data, dia.data, diaPx);
    if (!pos || pos.widthPx <= 0) return [];
    return [{ ...dia, leftPx: pos.leftPx + pos.widthPx / 2 }];
  });
  const fatiasValor =
    !temUso && linha && iniValor && fimValor && valorBarra > 0
      ? distribuirValorPorSemanasCronograma(
          timelineRange.inicio,
          timelineRange.fim,
          iniValor,
          fimValor,
          valorBarra,
          diaPx
        )
      : [];
  const rotulosBarra = temUso
    ? fatiasDia.map((fatia) => ({
        leftPx: fatia.leftPx,
        percentual: fatia.percentual,
        valor: fatia.valor
      }))
    : fatiasValor.map((fatia) => ({
        leftPx: fatia.leftPx + fatia.widthPx / 2,
        percentual: fatia.percentual,
        valor: fatia.valor
      }));

  return (
    <td className={`${tdClsTimeline} ${bgCls}`} style={tdStyle}>
      <div className="absolute inset-0" style={{ width: largura }}>
        <div
          className="absolute inset-0 grid"
          style={{ width: largura, gridTemplateColumns: gradeDiasTimeline(timelineRange.colunas.length, diaPx) }}
        >
          {timelineRange.colunas.map((col) => (
            <div
              key={`${row?.key ?? 'vazio'}-${col.key}`}
              className="h-full border-l border-gray-100 first:border-l-0 dark:border-gray-800"
            />
          ))}
        </div>
        {mostrarBarraPlan && barPlan && linha ? (
          <button
            type="button"
            disabled={!linha.editavel}
            onClick={(e) => onEdit(linha, e)}
            className={`absolute top-1 bottom-1 overflow-visible rounded-sm ${
              linha.editavel
                ? 'cursor-pointer transition-[filter] duration-150 hover:brightness-110'
                : 'pointer-events-none'
            }`}
            style={{ left: barPlan.leftPx, width: barPlan.widthPx }}
            title={`Planejado: ${formatDataBr(linha.dados.dataInicio)} → ${formatDataBr(linha.dados.dataFim)}${
              desvio?.temDesvio ? ` · ${formatDesvioDiasLabel(desvio.desvioFimDias) ?? ''}` : ''
            }`}
          >
            <div className="h-full rounded-sm border border-dashed border-gray-400/70 dark:border-gray-500/60" />
          </button>
        ) : null}
        {mostrarPlanejadoNoReal && barPlan && linha ? (
          <div
            className={`pointer-events-none absolute z-[1] rounded-sm border border-dashed border-gray-500/70 dark:border-gray-400/60 ${
              'top-1 bottom-1'
            }`}
            style={{ left: barPlan.leftPx, width: barPlan.widthPx }}
            title={`Planejado: ${formatDataBr(linha.dados.dataInicio)} → ${formatDataBr(linha.dados.dataFim)}`}
          />
        ) : null}
        {mostrarBarraReal && barReal && linha ? (
          <button
            type="button"
            disabled={!linha.editavel}
            onClick={(e) => onEdit(linha, e)}
            className={`absolute z-[2] rounded overflow-visible text-left transition-[filter] duration-150 ${
              linha.editavel
                ? 'cursor-pointer hover:brightness-110 dark:hover:brightness-125'
                : 'pointer-events-none'
            } ${mostrarPlanejadoNoReal ? 'top-2 bottom-2' : 'top-1 bottom-1'}`}
            style={{ left: barReal.leftPx, width: barReal.widthPx }}
            title={`Real: ${formatDataBr(linha.dados.dataInicioReal)} → ${formatDataBr(linha.dados.dataFimReal)} · ${pct}%${
              desvio?.temDesvio ? ` · desvio fim: ${formatDesvioDiasLabel(desvio.desvioFimDias) ?? '—'}` : ''
            }`}
          >
            <div className="relative h-full overflow-visible rounded-sm ring-1 ring-inset ring-gray-900/10 dark:ring-white/10">
              <div className={`absolute inset-0 rounded-sm ${statusBarCls(status)} opacity-20 dark:opacity-25`} />
              <div
                className={`absolute inset-y-0 left-0 rounded-sm ${statusBarCls(status)}`}
                style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : undefined }}
              />
            </div>
          </button>
        ) : linha?.editavel && (modo === 'plan' ? !mostrarBarraPlan : !mostrarBarraReal) ? (
          <button
            type="button"
            onClick={(e) => onEdit(linha, e)}
            className="absolute inset-0 z-[1] cursor-pointer opacity-0"
            title="Clique para definir datas e progresso"
            aria-label={`Editar etapa — ${linha.label}`}
          />
        ) : null}
        {rotulosBarra.map((fatia, indice) => {
          const alternar = temUso && rotulosBarra.length > 1 && diaPx < 72 && indice % 2 === 1;
          return (
          <div
            key={`${linha?.key ?? 'valor'}-rot-${indice}`}
            className={`pointer-events-none absolute z-[4] flex w-max max-w-[5.5rem] -translate-x-1/2 flex-col items-center justify-center px-0.5 text-center leading-none ${
              alternar ? 'bottom-0.5' : 'top-1/2 -translate-y-1/2'
            }`}
            style={{ left: fatia.leftPx }}
          >
            <span className="max-w-full truncate text-[10px] font-semibold tabular-nums text-red-600 dark:text-red-400">
              {fatia.percentual.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}%
            </span>
            <span className="mt-0.5 max-w-full truncate text-[9px] font-semibold tabular-nums text-gray-800 dark:text-gray-100">
              {fatia.valor.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })}
            </span>
          </div>
          );
        })}
      </div>
    </td>
  );
}

export function OrcamentoCronogramaPainel({
  linhas,
  cronograma,
  onChange,
  centroCustoId,
  orcamentoId,
  dataInicioObra = '',
  dataFimObra = '',
  onDataFimObraChange,
  onExport,
  onExportPdf,
  telaFixa = false,
  estilosAparencia,
  onEditarAparencia,
  dimensoesPorItem
}: Props) {
  const [timelineZoom, setTimelineZoom] = useState<CronogramaTimelineZoom>('obra');
  const [timelinePanOffset, setTimelinePanOffset] = useState(0);
  const [editorTarget, setEditorTarget] = useState<TimelineEtapaEditorTarget | null>(null);
  const [gerandoServicoKey, setGerandoServicoKey] = useState<string | null>(null);
  const [gerandoBlocoKey, setGerandoBlocoKey] = useState<string | null>(null);
  const [distribuindoPrazo, setDistribuindoPrazo] = useState(false);
  const [abaCronograma, setAbaCronograma] = useState<'planejado' | 'real' | 'graficos'>('planejado');
  const [showDataFimModal, setShowDataFimModal] = useState(false);
  const [draftDataFim, setDraftDataFim] = useState('');
  const cronogramaRef = useRef(cronograma);
  const gradeScrollRef = useRef<HTMLDivElement>(null);
  const [larguraViewport, setLarguraViewport] = useState(0);
  cronogramaRef.current = cronograma;

  const [barraPronta, setBarraPronta] = useState(false);
  useEffect(() => {
    setBarraPronta(true);
  }, []);

  useEffect(() => {
    if (telaFixa) return;
    const el = gradeScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => encaminharRolagemVertical(el, e);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [telaFixa]);

  const resumo = useMemo(() => calcularResumoCronograma(linhas, cronograma), [linhas, cronograma]);

  const linhasTimeline = useMemo(() => montarLinhasTimeline(linhas, cronograma), [linhas, cronograma]);
  const timelinePorKey = useMemo(() => {
    const map = new Map<string, CronogramaTimelineLinha>();
    for (const row of linhasTimeline) map.set(row.key, row);
    return map;
  }, [linhasTimeline]);

  const timelineRangeObra = useMemo(
    () => calcularTimelineRange(linhas, cronograma, dataInicioObra),
    [linhas, cronograma, dataInicioObra]
  );

  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const timelineRange = useMemo(
    () =>
      timelineRangeObra
        ? calcularTimelineRangeVisivel(timelineRangeObra, timelineZoom, agora, timelinePanOffset)
        : null,
    [timelineRangeObra, timelineZoom, agora, timelinePanOffset]
  );

  const hojeMarcador = useMemo(
    () =>
      timelineRange
        ? calcularMarcadorHojeTimeline(timelineRange.inicio, timelineRange.fim, agora)
        : null,
    [timelineRange, agora]
  );

  useEffect(() => {
    const el = gradeScrollRef.current;
    if (!el) return;
    const medir = () => setLarguraViewport(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [timelineRange, telaFixa]);

  const colunasFixasRem =
    abaCronograma === 'real' ? COLUNAS_FIXAS_REM : COLUNAS_FIXAS_REM - COLUNA_STATUS_REM;

  const timelineLayout = useMemo(() => {
    if (!timelineRange || timelineRange.colunas.length === 0) return null;
    const rootPx =
      typeof document !== 'undefined'
        ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        : 16;
    const colunasFixasPx = colunasFixasRem * rootPx;
    const disponivel = larguraViewport > colunasFixasPx + 48 ? larguraViewport - colunasFixasPx : 0;
    const larguraMinima = timelineRange.colunas.length * TIMELINE_LARGURA_DIA_MIN_PX;
    const largura = Math.max(timelineRange.larguraTotalPx, larguraMinima, Math.floor(disponivel));
    return { largura, diaPx: largura / timelineRange.colunas.length };
  }, [timelineRange, larguraViewport, colunasFixasRem]);

  const patchServico = (servicoKey: string, patch: Partial<CronogramaItemData>) => {
    const prev = cronograma.porServico[servicoKey] ?? {};
    onChange({
      ...cronograma,
      porServico: {
        ...cronograma.porServico,
        [servicoKey]: { ...prev, ...patch }
      }
    });
  };

  const patchComposicaoEtapa = (
    blocoKey: string,
    composicaoChave: string,
    patch: Partial<CronogramaItemData>
  ) => {
    const itemKey = `${blocoKey}|${composicaoChave}`;
    const prev = cronograma.porItem?.[itemKey] ?? {};
    onChange({
      ...cronograma,
      porItem: {
        ...(cronograma.porItem ?? {}),
        [itemKey]: { ...prev, ...patch }
      }
    });
  };

  const applySubServicos = (servicoKey: string, lista: CronogramaSubServico[]) => {
    const next: CronogramaPersist = {
      ...cronogramaRef.current,
      subServicosPorServico: {
        ...cronogramaRef.current.subServicosPorServico,
        [servicoKey]: lista
      }
    };
    cronogramaRef.current = next;
    onChange(next);
  };

  const setSubServicos = applySubServicos;

  const patchSubServico = (
    servicoKey: string,
    subId: string,
    patch: Partial<CronogramaSubServico>
  ) => {
    const lista = listarSubServicos(cronograma, servicoKey).map((s) =>
      s.id === subId ? { ...s, ...patch } : s
    );
    setSubServicos(servicoKey, lista);
  };

  const adicionarSubServico = (servicoKey: string, subtituloBlocoKey?: string) => {
    const novo = criarSubServicoManual();
    const sub: CronogramaSubServico = subtituloBlocoKey
      ? { ...novo, subtituloBlocoKey }
      : novo;
    const lista = [...listarSubServicos(cronograma, servicoKey)];
    if (subtituloBlocoKey) {
      let insertAt = lista.length;
      for (let i = lista.length - 1; i >= 0; i--) {
        if (lista[i].subtituloBlocoKey === subtituloBlocoKey) {
          insertAt = i + 1;
          break;
        }
      }
      lista.splice(insertAt, 0, sub);
    } else {
      lista.push(sub);
    }
    setSubServicos(servicoKey, lista);
  };

  const removerSubServico = (servicoKey: string, subId: string) => {
    const lista = listarSubServicos(cronograma, servicoKey).filter((s) => s.id !== subId);
    setSubServicos(servicoKey, lista);
  };

  const distribuirPrazoGeral = async (dataFimOverride?: string) => {
    const fim = (dataFimOverride || dataFimObra || '').trim();
    if (!dataInicioObra || !fim || distribuindoPrazo) return;
    setDistribuindoPrazo(true);
    try {
      let pesosPorEtapa: Record<string, number> | undefined;
      let origem: 'ia' | 'heuristica' | 'valor' = 'valor';

      if (centroCustoId && orcamentoId) {
        const etapas = montarPayloadEstimativaPrazoCronograma(linhas, cronograma);
        if (etapas.length > 0) {
          const result = await estimarPrazosCronograma(centroCustoId, orcamentoId, {
            dataInicioObra,
            dataFimObra: fim,
            etapas
          });
          pesosPorEtapa = {};
          for (const e of result.etapas) {
            if (e.etapaKey && e.diasEstimados > 0) {
              pesosPorEtapa[e.etapaKey] = e.diasEstimados;
            }
          }
          origem = result.origem;
        }
      }

      const next = distribuirPrazoGeralCronograma(
        linhas,
        cronograma,
        dataInicioObra,
        fim,
        pesosPorEtapa
      );
      if (!next) return;
      onChange(next);
      if (origem === 'ia') {
        toast.success('Prazos distribuídos com estimativa de IA por etapa.');
      } else if (origem === 'heuristica') {
        toast.success('Prazos distribuídos com estimativa por quantidade e tipo de serviço.');
      }
    } catch (err) {
      const next = distribuirPrazoGeralCronograma(linhas, cronograma, dataInicioObra, fim);
      if (!next) return;
      onChange(next);
      if (isAxiosError(err) && err.code === 'ECONNABORTED') {
        toast.error('A estimativa demorou demais — prazos distribuídos pelo valor.');
      } else if (isAxiosError(err) && !err.response) {
        toast.error('Falha na conexão com o servidor — prazos distribuídos pelo valor.');
      } else {
        toast.error('Não foi possível estimar com IA — prazos distribuídos pelo valor.');
      }
    } finally {
      setDistribuindoPrazo(false);
    }
  };

  const abrirDistribuirPrazo = () => {
    if (distribuindoPrazo) return;
    if (!dataInicioObra) {
      toast.error('Defina a data de início da obra nos Dados do orçamento.');
      return;
    }
    if (!dataFimObra) {
      setDraftDataFim('');
      setShowDataFimModal(true);
      return;
    }
    void distribuirPrazoGeral();
  };

  const confirmarDataFimEDistribuir = () => {
    const fim = draftDataFim.trim();
    if (!fim) {
      toast.error('Informe a data de fim da obra.');
      return;
    }
    if (dataInicioObra && fim < dataInicioObra) {
      toast.error('A data de fim deve ser posterior à data de início.');
      return;
    }
    onDataFimObraChange?.(fim);
    setShowDataFimModal(false);
    void distribuirPrazoGeral(fim);
  };

  const patchEtapaDados = (row: CronogramaTimelineLinha, patch: Partial<CronogramaItemData>) => {
    if (row.subId) {
      patchSubServico(row.servicoKey, row.subId, patch);
      return;
    }
    if (row.composicaoChave && row.blocoKey) {
      patchComposicaoEtapa(row.blocoKey, row.composicaoChave, patch);
      return;
    }
    patchServico(row.servicoKey, patch);
  };

  const patchQtdPlanejadaDia = (
    row: CronogramaTimelineLinha,
    iso: string,
    qtd: number | null,
    formula?: string | null
  ) => {
    const mapa: Record<string, number> = { ...(row.dados.quantidadesPlanejadasPorDia ?? {}) };
    const formulas: Record<string, string> = { ...(row.dados.formulasPlanejadasPorDia ?? {}) };
    if (qtd == null || qtd === 0) {
      delete mapa[iso];
      delete formulas[iso];
    } else {
      mapa[iso] = qtd;
      if (formula) formulas[iso] = formula;
      else delete formulas[iso];
    }
    patchEtapaDados(row, {
      quantidadesPlanejadasPorDia: Object.keys(mapa).length > 0 ? mapa : undefined,
      formulasPlanejadasPorDia: Object.keys(formulas).length > 0 ? formulas : undefined
    });
  };

  const abrirEditorEtapa = (row: CronogramaTimelineLinha, e: React.MouseEvent) => {
    if (!row.editavel || row.isCabecalhoServico || row.isCabecalhoSubtitulo) return;
    e.stopPropagation();
    setEditorTarget({ row, anchorEl: e.currentTarget as HTMLElement });
  };

  const gerarSubServicosBloco = async (
    linha: CronogramaLinhaServico,
    st: CronogramaLinhaSubtitulo
  ): Promise<CronogramaSubServico[]> => {
    const cfg = cronogramaRef.current.config;
    const result = await gerarSubServicosCronograma(centroCustoId!, orcamentoId!, {
      servicoId: linha.servicoKey,
      servicoNome: linha.servicoNome,
      subtituloNome: st.subtituloNome,
      dataInicioObra: dataInicioObra || cfg?.dataInicioObra,
      dataFimObra: dataFimObra || cfg?.dataFimObra,
      composicoes: st.composicoes
    });
    return result.subServicos.map((s) => ({
      id: novoSubServicoId(),
      nome: s.nome,
      origem: 'ia' as const,
      composicaoChave: s.composicaoChave,
      subtituloBlocoKey: st.blocoKey
    }));
  };

  const gerarTodosSubServicos = async (
    linha: CronogramaLinhaServico
  ): Promise<CronogramaSubServico[]> => {
    const cfg = cronogramaRef.current.config;
    const subtitulosVisiveis = listarSubtitulosVisiveisCronograma(linha);

    if (subtitulosVisiveis.length > 0) {
      const todos: CronogramaSubServico[] = [];
      for (const st of subtitulosVisiveis) {
        todos.push(...(await gerarSubServicosBloco(linha, st)));
      }
      return todos;
    }

    const result = await gerarSubServicosCronograma(centroCustoId!, orcamentoId!, {
      servicoId: linha.servicoKey,
      servicoNome: linha.servicoNome,
      dataInicioObra: dataInicioObra || cfg?.dataInicioObra,
      dataFimObra: dataFimObra || cfg?.dataFimObra,
      composicoes: linha.composicoes
    });
    return result.subServicos.map((s) => ({
      id: novoSubServicoId(),
      nome: s.nome,
      origem: 'ia' as const,
      composicaoChave: s.composicaoChave
    }));
  };

  const gerarSubServicosParaLinha = async (linha: CronogramaLinhaServico): Promise<boolean> => {
    if (!centroCustoId || !orcamentoId) return false;
    if (listarSubServicos(cronogramaRef.current, linha.servicoKey).length > 0) return false;

    setGerandoServicoKey(linha.servicoKey);
    try {
      const novos = await gerarTodosSubServicos(linha);
      applySubServicos(linha.servicoKey, novos);
      return true;
    } catch {
      return false;
    } finally {
      setGerandoServicoKey((k) => (k === linha.servicoKey ? null : k));
    }
  };

  const regerarSubServicosBloco = async (
    linha: CronogramaLinhaServico,
    st: CronogramaLinhaSubtitulo
  ) => {
    if (!centroCustoId || !orcamentoId) return;
    setGerandoBlocoKey(st.blocoKey);
    try {
      const novosBloco = await gerarSubServicosBloco(linha, st);
      const atuais = listarSubServicos(cronogramaRef.current, linha.servicoKey);
      const porBloco = agruparSubServicosPorBloco(linha, atuais);
      const mantidos: CronogramaSubServico[] = [];
      for (const [blocoKey, subsBloco] of Array.from(porBloco.entries())) {
        if (blocoKey !== st.blocoKey) mantidos.push(...subsBloco);
      }
      applySubServicos(linha.servicoKey, [...mantidos, ...novosBloco]);
    } catch {
      /* mantém etapas atuais */
    } finally {
      setGerandoBlocoKey((k) => (k === st.blocoKey ? null : k));
    }
  };

  if (linhas.length === 0) {
    return null;
  }

  const modoFolha: 'plan' | 'real' = abaCronograma === 'real' ? 'real' : 'plan';

  const renderTimeline = (key: string, bgCls = '', bgStyle?: React.CSSProperties) => (
    <CelulaLinhaTimeline
      row={timelinePorKey.get(key)}
      timelineRange={timelineRange}
      largura={timelineLayout?.largura ?? 0}
      diaPx={timelineLayout?.diaPx ?? 0}
      modo={modoFolha}
      onEdit={abrirEditorEtapa}
      onQtdDia={patchQtdPlanejadaDia}
      bgCls={bgCls}
      bgStyle={bgStyle}
    />
  );

  const botoesAcao = (
    <>
      <button
        type="button"
        onClick={abrirDistribuirPrazo}
        disabled={distribuindoPrazo}
        className={iconBtnCls}
        title="Estima a duração de cada etapa (IA quando disponível) e distribui o prazo da obra em sequência"
        aria-label={distribuindoPrazo ? 'Estimando prazos…' : 'Distribuir prazo'}
      >
        {distribuindoPrazo ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Calendar className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </button>
      {onExport ? (
        <button
          type="button"
          onClick={onExport}
          className={iconBtnCls}
          title="Exportar cronograma (.xlsx)"
          aria-label="Exportar cronograma"
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}
      {onExportPdf ? (
        <button
          type="button"
          onClick={onExportPdf}
          className={iconBtnCls}
          title="Exportar cronograma (.pdf)"
          aria-label="Exportar cronograma em PDF"
        >
          <FileText className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}
      {onEditarAparencia ? (
        <button
          type="button"
          onClick={onEditarAparencia}
          className={iconBtnCls}
          title="Editar cores do cronograma"
          aria-label="Editar cores do cronograma"
        >
          <Palette className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : null}
      {abaCronograma !== 'graficos' ? (
      <TimelineZoomControls
            zoom={timelineZoom}
            panOffset={timelinePanOffset}
            onZoomChange={(z) => {
              setTimelineZoom(z);
              setTimelinePanOffset(0);
            }}
            onPanChange={(d) => setTimelinePanOffset((p) => p + d)}
          />
      ) : null}
    </>
  );

  const abasCronograma = (
    <SegmentedControl
      aria-label="Abas do cronograma"
      value={abaCronograma}
      onChange={setAbaCronograma}
      className="h-auto max-w-full flex-nowrap overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800"
      pillClassName="rounded-lg bg-red-600 shadow-sm top-1 bottom-1"
      buttonClassName="px-2.5 py-1.5 text-xs sm:px-3.5 sm:text-sm"
      activeButtonClassName="font-semibold text-white"
      inactiveButtonClassName="font-semibold text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
      options={[
        { value: 'planejado', label: 'Planejado' },
        { value: 'real', label: 'Real' },
        { value: 'graficos', label: 'Gráficos' }
      ]}
    />
  );

  const memorialDaLinha = useMemo(
    () => (linha: CronogramaTimelineLinha) =>
      linha.blocoKey && linha.composicaoChave
        ? dimensoesPorItem?.[itemKeyComposicaoCronograma(linha.blocoKey, linha.composicaoChave)]
        : undefined,
    [dimensoesPorItem]
  );

  return (
    <MemorialCronogramaCtx.Provider value={memorialDaLinha}>
    <div className={telaFixa ? 'flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3' : 'w-full min-w-0 space-y-4'}>
      {!telaFixa ? (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center space-x-3">
          <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
            <CalendarRange className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cronograma</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Prazos e andamento da obra
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {abasCronograma}
          {botoesAcao}
        </div>
      </div>
      ) : null}

      {!telaFixa ? (
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40 sm:px-4">
        <div className="min-w-0 space-y-1">
          {dataInicioObra || dataFimObra ? (
            <p className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
              {formatDataBr(dataInicioObra) || '—'}
              <span className="mx-1.5 text-gray-400 dark:text-gray-500" aria-hidden>
                →
              </span>
              {formatDataBr(dataFimObra) || '—'}
            </p>
          ) : null}
          {resumo.etapasSemDatasReais > 0 ? (
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300/90">
              {resumo.etapasSemDatasReais} etapa(s) sem datas reais — preencha na planilha para ver a execução na linha do tempo.
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Resumo considera {resumo.totalEtapas} etapa(s) (subserviços quando existirem).
            </p>
          )}
        </div>
      </div>
      ) : null}


        {abaCronograma === 'graficos' ? (
          <div
            className={
              telaFixa
                ? gradeTableViewportCls
                : 'w-full min-w-0 overflow-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
            }
          >
            <CronogramaGraficosPainel
              linhas={linhas}
              cronograma={cronograma}
              dataInicioObra={dataInicioObra}
              dataFimObra={dataFimObra}
              hoje={agora}
            />
          </div>
        ) : (
        <div
            ref={gradeScrollRef}
            data-orc-table-viewport
            className={
              telaFixa
                ? gradeTableViewportCls
                : `w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 ${gradeHideVerticalScrollbarCls}`
            }
          >
            <div className="relative w-max">
            <table
              className={`table-fixed border-separate border-spacing-0 ${gradeTableCls} ${
                estilosAparencia?.linhasGrade
                  ? '[&_tbody_td]:border-b [&_tbody_td]:border-b-gray-300 [&_tbody_td]:border-l-gray-300 dark:[&_tbody_td]:border-b-gray-600 dark:[&_tbody_td]:border-l-gray-600'
                  : ''
              }`}
              style={{
                ...(timelineLayout
                  ? { width: `calc(${colunasFixasRem}rem + ${timelineLayout.largura}px)` }
                  : { width: '100%' }),
                fontFamily: estilosAparencia?.fonte,
              }}
            >
              <colgroup>
                <col className="w-[6.5rem]" />
                <col className="w-[22rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[7rem]" />
                <col className="w-[11rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
                <col className="w-[4rem]" />
                <col className="w-[6.5rem]" />
                {modoFolha === 'real' ? <col className="w-[7rem]" /> : null}
                <col style={timelineLayout ? { width: timelineLayout.largura } : undefined} />
              </colgroup>
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr className={gradeTableRowTrCls}>
                  <th className={`${gradeThStickyCls} ${stickyItemThCls} ${thItemColCls}`}>Item</th>
                  <th className={`${gradeThStickyCls} ${stickyServicoThCls} ${thServicoColCls}`}>Serviço</th>
                  <th className={`${gradeThStickyCls} ${stickyUnidadeThCls} ${thUnidadeColCls}`}>Unidade</th>
                  <th className={`${gradeThStickyCls} ${stickyQtdThCls} ${thQtdColCls}`}>Quantidade</th>
                  <th className={`${gradeThStickyCls} ${thCustoColCls}`}>Custo c/ BDI e desconto</th>
                  <th className={`${gradeThStickyCls} ${thDateColCls}`}>Início</th>
                  <th className={`${gradeThStickyCls} ${thDateColCls}`}>Fim</th>
                  <th className={`${gradeThStickyCls} ${thDiasColCls}`}>Dias</th>
                  <th className={`${gradeThStickyCls} ${thPctColCls}`}>Executado</th>
                  {modoFolha === 'real' ? (
                    <th className={`${gradeThStickyCls} ${thStatusColCls}`}>Status</th>
                  ) : null}
                  <th
                    className={`${gradeThStickyCls} border-l border-gray-300 p-0 align-bottom dark:border-gray-600`}
                    style={
                      timelineLayout
                        ? {
                            width: timelineLayout.largura,
                            minWidth: timelineLayout.largura,
                            maxWidth: timelineLayout.largura
                          }
                        : undefined
                    }
                  >
                    {timelineRange && timelineLayout ? (
                      <div className="flex flex-col" style={{ width: timelineLayout.largura }}>
                        <div
                          className="grid border-b border-gray-200/70 dark:border-gray-700/70"
                          style={{
                            width: timelineLayout.largura,
                            gridTemplateColumns: gradeDiasTimeline(timelineRange.colunas.length, timelineLayout.diaPx)
                          }}
                        >
                          {timelineRange.meses.map((mes) => (
                            <div
                              key={mes.key}
                              className="overflow-hidden text-ellipsis whitespace-nowrap border-l border-gray-200/70 px-1 py-1 text-center text-[10px] font-semibold uppercase text-gray-500 first:border-l-0 dark:border-gray-700/70 dark:text-gray-400"
                              style={{ gridColumn: `span ${mes.span}` }}
                            >
                              {mes.label}
                            </div>
                          ))}
                        </div>
                        <div
                          className="grid"
                          style={{
                            width: timelineLayout.largura,
                            gridTemplateColumns: gradeDiasTimeline(timelineRange.colunas.length, timelineLayout.diaPx)
                          }}
                        >
                          {timelineRange.colunas.map((col) => {
                            const isHoje = hojeMarcador?.colIndex === col.index;
                            return (
                              <div
                                key={col.key}
                                className={`overflow-hidden border-l py-1 text-center text-[10px] font-semibold tabular-nums first:border-l-0 ${
                                  isHoje
                                    ? 'bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                                    : 'border-gray-200/70 text-gray-600 dark:border-gray-700/70 dark:text-gray-300'
                                }`}
                              >
                                {col.label}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                {(() => {
                /** Intercalação contínua entre todos os serviços (não recomeça a cada serviço). */
                let seqListra = 0;
                return linhas.flatMap((linha, servicoIdx) => {
                  const comps = listarComposicoesCronogramaLinha(linha);
                  const resolvido = resolverDadosCronogramaServicoParaLinha(cronograma, linha);
                  const status = calcularStatusCronograma(resolvido);
                  const usaHierarquia = cronogramaUsaHierarquiaSubtitulos(linha);
                  const subtitulosVisiveis = listarSubtitulosVisiveisCronograma(linha);
                  const servicoComFilhas = comps.length > 0;
                  const ocultarTituloServico = estilosAparencia?.ocultarServicos === true && servicoComFilhas;
                  const itemServico = String(servicoIdx + 1);
                  // Numeração igual à do orçamento: serviço (1) › subtítulo (1.1) › composição (1.1.1).
                  // Sem subtítulos, as composições ficam direto sob o serviço (1.1, 1.2...).
                  const blocosLinha = linha.subtitulos ?? [];
                  const seqPorBloco = new Map<string, number>();
                  const proximoRotulo = (blocoKey: string) => {
                    const n = (seqPorBloco.get(blocoKey) ?? 0) + 1;
                    seqPorBloco.set(blocoKey, n);
                    const idx = blocosLinha.findIndex((b) => b.blocoKey === blocoKey);
                    return idx >= 0 ? `${itemServico}.${idx + 1}.${n}` : `${itemServico}.${n}`;
                  };

                  const linhaServico = (
                    <tr
                      key={linha.servicoKey}
                      className={`${
                        estilosAparencia?.servico
                          ? estilosAparencia.classeCustom
                          : 'bg-sky-100 dark:bg-sky-950'
                      } border-b border-sky-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                      style={estilosAparencia?.servico}
                    >
                      <td
                        style={estilosAparencia?.servico}
                        className={`${tdItemColCls} ${stickyItemTdCls} ${
                          estilosAparencia?.servico ? '' : 'bg-sky-100 dark:bg-sky-950'
                        } !text-sm font-semibold text-gray-900 dark:text-gray-100`}
                      >
                        {itemServico}
                      </td>
                      <td
                        style={estilosAparencia?.servico}
                        className={`${tdServicoColCls} ${stickyServicoTdCls} ${
                          estilosAparencia?.servico ? '' : 'bg-sky-100 dark:bg-sky-950'
                        } text-left pl-4`}
                      >
                        <div className="flex h-full min-h-0 min-w-0 items-center gap-1">
                          <span
                            className="block min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100"
                            title={linha.servicoNome}
                          >
                            {linha.servicoNome}
                          </span>
                        </div>
                      </td>
                      <CelulasQtdCusto
                        custo={somaCustoComposicoes(comps)}
                        destaque
                        fixoStyle={estilosAparencia?.servico}
                        fixoBgCls={estilosAparencia?.servico ? '' : 'bg-sky-100 dark:bg-sky-950'}
                      />
                      <CelulasEtapaCronograma
                        resolvido={resolvido}
                        status={status}
                        readOnly={servicoComFilhas}
                        ariaPrefix={linha.servicoNome}
                        modo={modoFolha}
                        corStatusPropria={!estilosAparencia?.servico}
                        onPatch={(patch) => patchServico(linha.servicoKey, patch)}
                      />
                      {renderTimeline(
                        linha.servicoKey,
                        estilosAparencia?.servico ? '' : 'bg-sky-100 dark:bg-sky-950',
                        estilosAparencia?.servico
                      )}
                    </tr>
                  );

                  const renderComposicao = (
                    blocoKey: string,
                    comp: CronogramaComposicaoRef,
                    indentLevel: 0 | 1 | 2,
                    rotuloItem: string
                  ) => {
                    const dados = resolverDadosCronogramaComposicao(cronograma, blocoKey, comp);
                    const compStatus = calcularStatusCronograma(dados);
                    const listraClara = seqListra % 2 === 0;
                    seqListra += 1;
                    const estiloListra = estilosAparencia
                      ? listraClara
                        ? estilosAparencia.composicao
                        : estilosAparencia.composicaoAlt
                      : undefined;
                    const bgListraTr = estiloListra
                      ? estilosAparencia!.classeCustom
                      : listraClara
                        ? 'bg-white dark:bg-gray-900'
                        : 'bg-slate-100 dark:bg-gray-800';
                    const bgListraTd = estiloListra
                      ? ''
                      : listraClara
                        ? 'bg-white dark:bg-gray-900'
                        : 'bg-slate-100 dark:bg-gray-800';
                    return (
                      <tr
                        key={`${linha.servicoKey}-${blocoKey}-${comp.chave}`}
                        className={`${bgListraTr} border-b border-gray-200/60 dark:border-gray-700/80`}
                        style={estiloListra}
                      >
                        <td style={estiloListra} className={`${tdItemColCls} ${stickyItemTdCls} ${bgListraTd}`}>{rotuloItem}</td>
                        <td style={estiloListra} className={`${tdServicoColCls} ${stickyServicoTdCls} ${bgListraTd} text-left ${paddingServicoColCls(indentLevel)}`}>
                          <ComposicaoResumoNomeCell nome={comp.descricao} />
                        </td>
                        <CelulasQtdCusto
                          unidade={comp.unidade}
                          quantidade={comp.quantidade}
                          custo={comp.valorTotal}
                          fixoStyle={estiloListra}
                          fixoBgCls={bgListraTd}
                        />
                        <CelulasEtapaCronograma
                          resolvido={dados}
                          status={compStatus}
                          readOnly={false}
                          ariaPrefix={comp.descricao}
                          modo={modoFolha}
                          onPatch={(patch) => patchComposicaoEtapa(blocoKey, comp.chave, patch)}
                        />
                        {renderTimeline(`${linha.servicoKey}::${blocoKey}::${comp.chave}`, bgListraTd, estiloListra)}
                      </tr>
                    );
                  };

                  if (!usaHierarquia) {
                    if (comps.length === 0) return [linhaServico];
                    return [
                      ...(ocultarTituloServico ? [] : [linhaServico]),
                      ...comps.map(({ blocoKey, comp }) =>
                        renderComposicao(blocoKey, comp, 1, proximoRotulo(blocoKey))
                      )
                    ];
                  }

                  const rows: React.ReactElement[] = ocultarTituloServico ? [] : [linhaServico];
                  const visiveis = new Set(subtitulosVisiveis.map((st) => st.blocoKey));
                  for (const item of comps) {
                    if (!visiveis.has(item.blocoKey)) {
                      rows.push(
                        renderComposicao(item.blocoKey, item.comp, 1, proximoRotulo(item.blocoKey))
                      );
                    }
                  }

                  subtitulosVisiveis.forEach((st) => {
                    const blocoResolvido = agregarDadosComposicoes(
                      cronograma,
                      st.composicoes.map((comp) => ({ blocoKey: st.blocoKey, comp }))
                    );
                    const blocoStatus = calcularStatusCronograma(blocoResolvido);
                    rows.push(
                      <tr
                        key={`${st.blocoKey}::cabecalho`}
                        className={`border-b border-gray-200/90 dark:border-gray-800 ${
                          estilosAparencia?.subtitulo ? estilosAparencia.classeCustom : 'bg-slate-200/90 dark:bg-gray-900'
                        }`}
                        style={estilosAparencia?.subtitulo}
                      >
                        <td
                          style={estilosAparencia?.subtitulo}
                          className={`${tdItemColCls} ${stickyItemTdCls} ${
                            estilosAparencia?.subtitulo ? '' : 'bg-slate-200 dark:bg-gray-900'
                          } text-xs font-semibold text-gray-800 dark:text-gray-200`}
                        >
                          {(() => {
                            const idxSub = blocosLinha.findIndex((b) => b.blocoKey === st.blocoKey);
                            return idxSub >= 0 ? `${itemServico}.${idxSub + 1}` : '';
                          })()}
                        </td>
                        <td
                          style={estilosAparencia?.subtitulo}
                          className={`${tdServicoColCls} ${stickyServicoTdCls} ${
                            estilosAparencia?.subtitulo ? '' : 'bg-slate-200 dark:bg-gray-900'
                          } text-left pl-6`}
                        >
                          <span
                            className="block min-w-0 whitespace-normal break-words text-xs font-semibold uppercase leading-snug tracking-wide text-gray-800 dark:text-gray-200"
                            title={st.subtituloNome}
                          >
                            {st.subtituloNome}
                          </span>
                        </td>
                        <CelulasQtdCusto
                          custo={st.composicoes.reduce((acc, comp) => acc + (comp.valorTotal ?? 0), 0)}
                          destaque
                          fixoStyle={estilosAparencia?.subtitulo}
                          fixoBgCls={estilosAparencia?.subtitulo ? '' : 'bg-slate-200 dark:bg-gray-900'}
                        />
                        <CelulasEtapaCronograma
                          resolvido={blocoResolvido}
                          status={blocoStatus}
                          readOnly={st.composicoes.length > 0}
                          ariaPrefix={st.subtituloNome}
                          modo={modoFolha}
                          onPatch={() => {}}
                        />
                        {renderTimeline(
                          `${st.blocoKey}::cabecalho`,
                          estilosAparencia?.subtitulo ? '' : 'bg-slate-200 dark:bg-gray-900',
                          estilosAparencia?.subtitulo
                        )}
                      </tr>
                    );
                    st.composicoes.forEach((comp) => {
                      rows.push(
                        renderComposicao(st.blocoKey, comp, 2, proximoRotulo(st.blocoKey))
                      );
                    });
                  });

                  return rows;
                });
                })()}
              </tbody>
            </table>
            {hojeMarcador && timelineLayout ? (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-[1] w-px bg-red-500"
                style={{
                  left: `calc(${colunasFixasRem}rem + ${(hojeMarcador.leftPct / 100) * timelineLayout.largura}px)`
                }}
                aria-hidden
              />
            ) : null}
            </div>
          </div>
        )}
      {editorTarget && abaCronograma !== 'graficos' ? (
        <TimelineEtapaEditor
          key={editorTarget.row.key}
          target={{
            ...editorTarget,
            row: linhasTimeline.find((r) => r.key === editorTarget.row.key) ?? editorTarget.row
          }}
          modo={modoFolha}
          onClose={() => setEditorTarget(null)}
          onPatchDados={patchEtapaDados}
        />
      ) : null}
    </div>
    {telaFixa && barraPronta
      ? createPortal(
          <div
            className="fixed bottom-0 right-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 left-0 lg:left-[var(--orc-footer-left,5rem)]"
            role="toolbar"
            aria-label="Ações do cronograma"
          >
            <div className="flex items-center gap-3 overflow-x-auto p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="min-w-0 flex-1">
                {dataInicioObra || dataFimObra ? (
                  <p className="truncate text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {formatDataBr(dataInicioObra) || '—'}
                    <span className="mx-1.5 text-gray-400 dark:text-gray-500" aria-hidden>
                      →
                    </span>
                    {formatDataBr(dataFimObra) || '—'}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 justify-center">{abasCronograma}</div>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{botoesAcao}</div>
            </div>
          </div>,
          document.body
        )
      : null}

      <Modal
        isOpen={showDataFimModal}
        onClose={() => setShowDataFimModal(false)}
        title="Data de fim da obra"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Informe a data de fim para distribuir o prazo das etapas
            {dataInicioObra ? (
              <>
                {' '}
                (início em <strong className="font-semibold text-gray-900 dark:text-gray-100">{formatDataBr(dataInicioObra)}</strong>)
              </>
            ) : null}
            .
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Data de fim
            </label>
            <DatePickerField
              value={draftDataFim}
              onChange={setDraftDataFim}
              placeholder="dd/mm/aaaa"
              aria-label="Data de fim da obra"
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowDataFimModal(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarDataFimEDistribuir}
              disabled={!draftDataFim.trim() || distribuindoPrazo}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:pointer-events-none disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Distribuir prazo
            </button>
          </div>
        </div>
      </Modal>
    </MemorialCronogramaCtx.Provider>
  );
}
