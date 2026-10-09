'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  CalendarRange,
  Download,
  Loader2
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
import {
  TimelineEtapaEditor,
  TimelineZoomControls,
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
  /** Tela cheia: a grade rola por dentro e as ações ficam na barra de baixo. */
  telaFixa?: boolean;
};

const thCls =
  '!h-auto !min-h-0 px-3 py-2.5 text-center text-[11px] font-semibold text-[var(--orc-header-fg,#4b5563)] uppercase tracking-wide border-l border-gray-300 dark:border-gray-600 first:border-l-0';
const tdCls =
  'h-[2.75rem] px-2 py-0 text-sm leading-none text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-600 align-middle';
const tdServicoColCls =
  'min-h-[2.75rem] w-[22rem] max-w-[22rem] min-w-0 px-3 py-2.5 text-sm border-l-0 align-middle';
const thServicoColCls =
  '!h-auto !min-h-0 w-[22rem] max-w-[22rem] min-w-0 px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--orc-header-fg,#4b5563)] uppercase tracking-wide border-l-0';
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
    <div className="min-w-0 whitespace-normal break-words text-left text-sm font-normal leading-snug text-gray-900 dark:text-gray-100">
      {nome}
    </div>
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
  modo
}: {
  resolvido: CronogramaItemData;
  status: ReturnType<typeof calcularStatusCronograma>;
  readOnly: boolean;
  ariaPrefix: string;
  onPatch: (patch: Partial<CronogramaItemData>) => void;
  modo: 'plan' | 'real';
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
            ? `${Math.round(resolvido.percentualExecutado)}%`
            : '0%'}
        </span>
      </td>
      <td className={`${tdCls} w-[7rem] text-center`}>
        <span
          className={`${statusSpanCls(status)}${observacao ? ' cursor-help' : ''}`}
          title={observacao || undefined}
        >
          {CRONOGRAMA_STATUS_LABEL[status]}
        </span>
      </td>
    </>
  );
}

function gradeDiasTimeline(totalDias: number, diaPx: number): string {
  return `repeat(${totalDias}, ${diaPx}px)`;
}

function CelulaLinhaTimeline({
  row,
  timelineRange,
  largura,
  diaPx,
  modo,
  onEdit
}: {
  row: CronogramaTimelineLinha | undefined;
  timelineRange: CronogramaTimelineRange | null;
  largura: number;
  diaPx: number;
  modo: 'plan' | 'real';
  onEdit: (row: CronogramaTimelineLinha, e: React.MouseEvent) => void;
}) {
  const tdClsTimeline = 'relative h-px border-l border-gray-200 p-0 align-middle dark:border-gray-600';
  const tdStyle = { width: largura || undefined, minWidth: largura || undefined, maxWidth: largura || undefined };
  if (!timelineRange || largura <= 0 || diaPx <= 0) {
    return <td className={tdClsTimeline} style={tdStyle} />;
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
  const pct = Math.min(100, Math.max(0, Math.round(linha?.dados.percentualExecutado ?? 0)));
  const desvio = linha ? calcularDesvioTimeline(linha.dados) : null;
  const mostrarBarraPlan = modo === 'plan' && Boolean(barPlan && barPlan.widthPx > 0);
  const mostrarBarraReal = modo === 'real' && Boolean(barReal && barReal.widthPx > 0);

  return (
    <td className={tdClsTimeline} style={tdStyle}>
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
            <div className="h-full rounded-sm border border-dashed border-gray-400/70 bg-gray-400/[0.06] dark:border-gray-500/60 dark:bg-gray-500/10" />
          </button>
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
            } top-1 bottom-1`}
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
              {pct > 0 ? (
                <span className="pointer-events-none absolute left-1 top-1/2 z-[1] -translate-y-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums leading-none text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.85)]">
                  {pct}%
                </span>
              ) : null}
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
  telaFixa = false
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
    () => calcularTimelineRange(linhas, cronograma),
    [linhas, cronograma]
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

  const timelineLayout = useMemo(() => {
    if (!timelineRange || timelineRange.colunas.length === 0) return null;
    const rootPx =
      typeof document !== 'undefined'
        ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        : 16;
    const colunasFixasPx = 57.5 * rootPx;
    const disponivel = larguraViewport > colunasFixasPx + 48 ? larguraViewport - colunasFixasPx : 0;
    const largura = Math.max(timelineRange.larguraTotalPx, Math.floor(disponivel));
    return { largura, diaPx: largura / timelineRange.colunas.length };
  }, [timelineRange, larguraViewport]);

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

  const renderTimeline = (key: string) => (
    <CelulaLinhaTimeline
      row={timelinePorKey.get(key)}
      timelineRange={timelineRange}
      largura={timelineLayout?.largura ?? 0}
      diaPx={timelineLayout?.diaPx ?? 0}
      modo={modoFolha}
      onEdit={abrirEditorEtapa}
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

  return (
    <>
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
              className={`table-fixed border-separate border-spacing-0 ${gradeTableCls}`}
              style={
                timelineLayout
                  ? { width: `calc(57.5rem + ${timelineLayout.largura}px)` }
                  : { width: '100%' }
              }
            >
              <colgroup>
                <col className="w-[22rem]" />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
                <col className="w-[4rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[7rem]" />
                <col style={timelineLayout ? { width: timelineLayout.largura } : undefined} />
              </colgroup>
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr className={gradeTableRowTrCls}>
                  <th className={`${gradeThStickyCls} ${thServicoColCls}`}>Serviço</th>
                  <th className={`${gradeThStickyCls} ${thDateColCls}`}>Início</th>
                  <th className={`${gradeThStickyCls} ${thDateColCls}`}>Fim</th>
                  <th className={`${gradeThStickyCls} ${thDiasColCls}`}>Dias</th>
                  <th className={`${gradeThStickyCls} ${thPctColCls}`}>Executado</th>
                  <th className={`${gradeThStickyCls} ${thStatusColCls}`}>Status</th>
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
                              className="whitespace-nowrap border-l border-gray-200/70 py-1 text-center text-[10px] font-semibold uppercase text-gray-500 first:border-l-0 dark:border-gray-700/70 dark:text-gray-400"
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
                {linhas.flatMap((linha) => {
                  const comps = listarComposicoesCronogramaLinha(linha);
                  const resolvido = resolverDadosCronogramaServicoParaLinha(cronograma, linha);
                  const status = calcularStatusCronograma(resolvido);
                  const usaHierarquia = cronogramaUsaHierarquiaSubtitulos(linha);
                  const subtitulosVisiveis = listarSubtitulosVisiveisCronograma(linha);
                  const servicoComFilhas = comps.length > 0;

                  const linhaServico = (
                    <tr
                      key={linha.servicoKey}
                      className={`bg-white dark:bg-gray-900/80 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                    >
                      <td className={`${tdServicoColCls} text-left pl-4`}>
                        <div className="flex h-full min-h-0 min-w-0 items-center gap-1">
                          <span
                            className="block min-w-0 flex-1 whitespace-normal break-words text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100"
                            title={linha.servicoNome}
                          >
                            {linha.servicoNome}
                          </span>
                        </div>
                      </td>
                      <CelulasEtapaCronograma
                        resolvido={resolvido}
                        status={status}
                        readOnly={servicoComFilhas}
                        ariaPrefix={linha.servicoNome}
                        modo={modoFolha}
                        onPatch={(patch) => patchServico(linha.servicoKey, patch)}
                      />
                      {renderTimeline(linha.servicoKey)}
                    </tr>
                  );

                  const renderComposicao = (
                    blocoKey: string,
                    comp: CronogramaComposicaoRef,
                    indentLevel: 0 | 1 | 2
                  ) => {
                    const dados = resolverDadosCronogramaComposicao(cronograma, blocoKey, comp);
                    const compStatus = calcularStatusCronograma(dados);
                    return (
                      <tr
                        key={`${linha.servicoKey}-${blocoKey}-${comp.chave}`}
                        className="bg-gray-50/80 dark:bg-gray-800/40 border-b border-gray-200/60 dark:border-gray-700/80"
                      >
                        <td className={`${tdServicoColCls} text-left ${paddingServicoColCls(indentLevel)}`}>
                          <ComposicaoResumoNomeCell nome={comp.descricao} />
                        </td>
                        <CelulasEtapaCronograma
                          resolvido={dados}
                          status={compStatus}
                          readOnly={false}
                          ariaPrefix={comp.descricao}
                          modo={modoFolha}
                          onPatch={(patch) => patchComposicaoEtapa(blocoKey, comp.chave, patch)}
                        />
                        {renderTimeline(`${linha.servicoKey}::${blocoKey}::${comp.chave}`)}
                      </tr>
                    );
                  };

                  if (!usaHierarquia) {
                    if (comps.length === 0) return [linhaServico];
                    return [
                      linhaServico,
                      ...comps.map(({ blocoKey, comp }) => renderComposicao(blocoKey, comp, 1))
                    ];
                  }

                  const rows: React.ReactElement[] = [linhaServico];
                  const visiveis = new Set(subtitulosVisiveis.map((st) => st.blocoKey));
                  for (const item of comps) {
                    if (!visiveis.has(item.blocoKey)) {
                      rows.push(renderComposicao(item.blocoKey, item.comp, 1));
                    }
                  }

                  for (const st of subtitulosVisiveis) {
                    const blocoResolvido = agregarDadosComposicoes(
                      cronograma,
                      st.composicoes.map((comp) => ({ blocoKey: st.blocoKey, comp }))
                    );
                    const blocoStatus = calcularStatusCronograma(blocoResolvido);
                    rows.push(
                      <tr
                        key={`${st.blocoKey}::cabecalho`}
                        className="border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900"
                      >
                        <td className={`${tdServicoColCls} text-left pl-6`}>
                          <span
                            className="block min-w-0 whitespace-normal break-words text-xs font-semibold uppercase leading-snug tracking-wide text-gray-800 dark:text-gray-200"
                            title={st.subtituloNome}
                          >
                            {st.subtituloNome}
                          </span>
                        </td>
                        <CelulasEtapaCronograma
                          resolvido={blocoResolvido}
                          status={blocoStatus}
                          readOnly={st.composicoes.length > 0}
                          ariaPrefix={st.subtituloNome}
                          modo={modoFolha}
                          onPatch={() => {}}
                        />
                        {renderTimeline(`${st.blocoKey}::cabecalho`)}
                      </tr>
                    );
                    for (const comp of st.composicoes) {
                      rows.push(renderComposicao(st.blocoKey, comp, 2));
                    }
                  }

                  return rows;
                })}
              </tbody>
            </table>
            {hojeMarcador && timelineLayout ? (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500"
                style={{
                  left: `calc(57.5rem + ${(hojeMarcador.leftPct / 100) * timelineLayout.largura}px)`
                }}
                aria-hidden
              />
            ) : null}
            </div>
          </div>
        )}
      {editorTarget && abaCronograma !== 'graficos' ? (
        <TimelineEtapaEditor
          target={{
            ...editorTarget,
            row: linhasTimeline.find((r) => r.key === editorTarget.row.key) ?? editorTarget.row
          }}
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
    </>
  );
}
