'use client';

import { useState } from 'react';
import { Divide } from 'lucide-react';
import {
  isoDiaCronograma,
  repartirUsoPorDiasCronograma,
  type CronogramaDesvioTimeline,
  type CronogramaTimelineLinha,
  type CronogramaTimelineZoom
} from './orcamentoCronogramaCalc';
import {
  calcularStatusCronograma,
  parseDataIso,
  type CronogramaItemData
} from './orcamentoCronogramaTypes';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { avaliarFormulaMedicao } from './orcamentoMedicaoCalc';

export const TIMELINE_ROW_HEIGHT_PX = 40;

const editorLabelCls =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const editorInputCls = `${FORM_FIELD_INPUT_CLS} h-10 shadow-none`;
const editorTextareaCls = `${FORM_FIELD_TEXTAREA_CLS} shadow-none`;

function parseQuantidadeUsada(raw: string): number | null {
  // Fórmula estilo Excel (=10+5, =ARRED(7/3;2)): mesmo avaliador da memória de cálculo.
  if (raw.trim().startsWith('=')) {
    const n = avaliarFormulaMedicao(raw);
    return n != null && Number.isFinite(n) && n >= 0 ? n : null;
  }
  const limpo = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!limpo) return null;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function formatQtdEditor(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function usoDaComposicao(qtdUsada: number, qtdOrcada: number, custo: number) {
  if (!(qtdOrcada > 0)) return { percentual: 0, valorUsado: 0 };
  const razao = qtdUsada / qtdOrcada;
  // Soma dos dias que fecha a quantidade orçada (a menos de ruído de ponto flutuante) vale exatamente 100%.
  const fechou = Math.abs(razao - 1) < 1e-9;
  return {
    percentual: fechou ? 100 : Math.min(100, Math.max(0, razao * 100)),
    valorUsado: razao * custo
  };
}

export type TimelineEtapaEditorTarget = {
  row: CronogramaTimelineLinha;
  anchorEl: HTMLElement;
};

type TimelineEtapaEditorProps = {
  target: TimelineEtapaEditorTarget;
  modo: 'plan' | 'real';
  onClose: () => void;
  onPatchDados: (row: CronogramaTimelineLinha, patch: Partial<CronogramaItemData>) => void;
};

export function TimelineEtapaEditor({
  target,
  modo,
  onClose,
  onPatchDados
}: TimelineEtapaEditorProps) {
  const { row } = target;
  const status = calcularStatusCronograma(row.dados);
  const datasReais = modo === 'real';
  const qtdOrcada = row.quantidade ?? 0;
  const custo = row.valorTotal ?? 0;
  const medeQuantidade = qtdOrcada > 0;
  const [textosDia, setTextosDia] = useState<Record<string, string>>({});
  const formulasSalvas = row.dados.formulasQuantidadePorDia;
  const inicioPrazo = parseDataIso(datasReais ? row.dados.dataInicioReal : row.dados.dataInicio);
  const fimPrazo = parseDataIso(datasReais ? row.dados.dataFimReal : row.dados.dataFim);
  const mapaSalvo = row.dados.quantidadesPorDia;
  const temMapa = Boolean(mapaSalvo && Object.keys(mapaSalvo).length > 0);
  const diasPrazo =
    inicioPrazo && fimPrazo ? repartirUsoPorDiasCronograma(inicioPrazo, fimPrazo, 0, 0, 0) : [];
  const legadoPorDia =
    !temMapa && row.dados.quantidadeExecutada != null && inicioPrazo && fimPrazo
      ? repartirUsoPorDiasCronograma(inicioPrazo, fimPrazo, row.dados.quantidadeExecutada, 0, 0)
      : [];
  const qtdInicialDia = (iso: string) => {
    if (temMapa) return mapaSalvo?.[iso];
    return legadoPorDia.find((fatia) => isoDiaCronograma(fatia.data) === iso)?.quantidade;
  };
  const textoDoDia = (iso: string) => {
    if (Object.prototype.hasOwnProperty.call(textosDia, iso)) return textosDia[iso];
    const inicial = qtdInicialDia(iso);
    return inicial != null && inicial > 0 ? formatQtdEditor(inicial) : '';
  };
  const aplicarQuantidadeDia = (iso: string, raw: string) => {
    setTextosDia((prev) => ({ ...prev, [iso]: raw }));
    if (raw.trim() !== '' && parseQuantidadeUsada(raw) == null) return;
    const mapa: Record<string, number> = { ...(mapaSalvo ?? {}) };
    const formulas: Record<string, string> = { ...(formulasSalvas ?? {}) };
    if (!temMapa) {
      for (const fatia of legadoPorDia) {
        if (fatia.quantidade > 0) mapa[isoDiaCronograma(fatia.data)] = fatia.quantidade;
      }
    }
    const n = raw.trim() === '' ? null : parseQuantidadeUsada(raw);
    if (n == null || n === 0) delete mapa[iso];
    else mapa[iso] = n;
    if (raw.trim().startsWith('=') && n != null) formulas[iso] = raw.trim();
    else delete formulas[iso];
    const soma = Object.values(mapa).reduce((acc, qtd) => acc + qtd, 0);
    const calc = soma > 0 ? usoDaComposicao(soma, qtdOrcada, custo) : null;
    onPatchDados(row, {
      quantidadesPorDia: Object.keys(mapa).length > 0 ? mapa : undefined,
      formulasQuantidadePorDia: Object.keys(formulas).length > 0 ? formulas : undefined,
      quantidadeExecutada: soma > 0 ? soma : undefined,
      percentualExecutado: calc ? calc.percentual : undefined
    });
  };

  /** Reparte a quantidade orçada igualmente pelos dias do prazo; a sobra de arredondamento vai para o último dia. */
  const dividirIgualmente = () => {
    const n = diasPrazo.length;
    if (n === 0 || !(qtdOrcada > 0)) return;
    if (temMapa && !window.confirm('Substituir as quantidades já lançadas pela divisão igual entre os dias?')) {
      return;
    }
    const fator = 10 ** 4;
    const porDia = Math.floor((qtdOrcada / n) * fator) / fator;
    const mapa: Record<string, number> = {};
    let acumulado = 0;
    diasPrazo.forEach((dia, i) => {
      const qtd = i === n - 1 ? Math.round((qtdOrcada - acumulado) * fator) / fator : porDia;
      acumulado += qtd;
      if (qtd > 0) mapa[isoDiaCronograma(dia.data)] = qtd;
    });
    const soma = Object.values(mapa).reduce((acc, qtd) => acc + qtd, 0);
    setTextosDia({});
    onPatchDados(row, {
      quantidadesPorDia: Object.keys(mapa).length > 0 ? mapa : undefined,
      formulasQuantidadePorDia: undefined,
      quantidadeExecutada: soma > 0 ? soma : undefined,
      percentualExecutado: soma > 0 ? usoDaComposicao(soma, qtdOrcada, custo).percentual : undefined
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={row.item || row.label}
      panelClassName="!transform-none"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 items-start gap-4">
          <label className="block min-w-0">
            <span className={editorLabelCls}>Início</span>
            <DatePickerField
              value={(datasReais ? row.dados.dataInicioReal : row.dados.dataInicio) ?? ''}
              onChange={(v) =>
                onPatchDados(row, datasReais ? { dataInicioReal: v } : { dataInicio: v })
              }
              placeholder="dd/mm/aaaa"
              className="shadow-none"
              aria-label={`${datasReais ? 'Início real' : 'Início planejado'} — ${row.label}`}
            />
          </label>
          <label className="block min-w-0">
            <span className={editorLabelCls}>Fim</span>
            <DatePickerField
              value={(datasReais ? row.dados.dataFimReal : row.dados.dataFim) ?? ''}
              onChange={(v) =>
                onPatchDados(row, datasReais ? { dataFimReal: v } : { dataFim: v })
              }
              placeholder="dd/mm/aaaa"
              className="shadow-none"
              aria-label={`${datasReais ? 'Fim real' : 'Fim planejado'} — ${row.label}`}
            />
          </label>
        </div>
        {medeQuantidade ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Orçada: {formatQtdEditor(qtdOrcada)}
                {row.unidade ? ` ${row.unidade}` : ''}
              </p>
              {diasPrazo.length > 1 ? (
                <button
                  type="button"
                  onClick={dividirIgualmente}
                  title="Reparte a quantidade e o valor igualmente por todos os dias do prazo"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                >
                  <Divide className="h-3.5 w-3.5" aria-hidden />
                  Dividir igualmente
                </button>
              ) : null}
            </div>
            {diasPrazo.map((dia) => {
              const iso = isoDiaCronograma(dia.data);
              const texto = textoDoDia(iso);
              const qtdDia = parseQuantidadeUsada(texto);
              const usoDia = qtdDia != null ? usoDaComposicao(qtdDia, qtdOrcada, custo) : null;
              return (
                <div key={iso} className="space-y-2">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {dia.data.toLocaleDateString('pt-BR')}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block min-w-0">
                      <span className={editorLabelCls}>Quantidade</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={texto}
                        onChange={(e) => aplicarQuantidadeDia(iso, e.target.value)}
                        onFocus={() => {
                          const f = formulasSalvas?.[iso];
                          if (f && !Object.prototype.hasOwnProperty.call(textosDia, iso)) {
                            setTextosDia((prev) => ({ ...prev, [iso]: f }));
                          }
                        }}
                        onBlur={() => {
                          // Sai da edição: mostra o resultado (a fórmula continua salva); fórmula inválida volta ao último valor.
                          setTextosDia((prev) => {
                            const { [iso]: _descartado, ...resto } = prev;
                            return resto;
                          });
                        }}
                        placeholder="0 ou =10+5"
                        className={editorInputCls}
                        aria-label={`Quantidade em ${dia.data.toLocaleDateString('pt-BR')} — ${row.label}`}
                      />
                    </label>
                    <div className="min-w-0">
                      <p className={editorLabelCls}>Valor usado</p>
                      <div className={`${editorInputCls} flex items-center tabular-nums`}>
                        {usoDia
                          ? usoDia.valorUsado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className={editorLabelCls}>Executado</p>
                      <div className={`${editorInputCls} flex items-center tabular-nums`}>
                        {usoDia
                          ? `${usoDia.percentual.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}%`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <label className="block">
          <span className={editorLabelCls}>
            Observação {status === 'atrasado' ? '(motivo do atraso)' : ''}
          </span>
          <textarea
            value={row.dados.observacao ?? ''}
            onChange={(e) => onPatchDados(row, { observacao: e.target.value })}
            rows={3}
            placeholder={status === 'atrasado' ? 'Ex.: chuva, falta de material…' : 'Comentário da etapa…'}
            className={editorTextareaCls}
          />
        </label>
      </div>
    </Modal>
  );
}

export function TimelineZoomControls({
  zoom,
  panOffset,
  onZoomChange,
  onPanChange
}: {
  zoom: CronogramaTimelineZoom;
  panOffset: number;
  onZoomChange: (z: CronogramaTimelineZoom) => void;
  onPanChange: (delta: number) => void;
}) {
  return (
    <div className="inline-flex h-10 items-center gap-1">
      <SegmentedControl
        aria-label="Zoom da linha do tempo"
        value={zoom}
        onChange={onZoomChange}
        className="h-auto max-w-full flex-nowrap overflow-x-auto rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-700 dark:bg-gray-800"
        pillClassName="rounded-lg bg-red-600 shadow-sm top-1 bottom-1"
        buttonClassName="px-2.5 py-1.5 text-xs sm:px-3.5 sm:text-sm"
        activeButtonClassName="font-semibold text-white"
        inactiveButtonClassName="font-semibold text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'mes', label: 'Mês' },
          { value: 'obra', label: 'Obra' },
        ]}
      />
      {zoom !== 'obra' ? (
        <>
          <span className="mx-0.5 h-5 w-px bg-gray-300 dark:bg-gray-600" aria-hidden />
          <button
            type="button"
            onClick={() => onPanChange(-1)}
            className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
            title={zoom === 'semana' ? 'Semana anterior' : 'Mês anterior'}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onPanChange(1)}
            className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-gray-700 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
            title={zoom === 'semana' ? 'Próxima semana' : 'Próximo mês'}
          >
            →
          </button>
          {panOffset !== 0 ? (
            <button
              type="button"
              onClick={() => onPanChange(-panOffset)}
              className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-gray-600 hover:bg-white dark:text-gray-400 dark:hover:bg-gray-700"
              title="Voltar ao período atual"
            >
              Hoje
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type BarraPos = { leftPct: number; widthPct: number };

export function TimelineDesvioVisual({
  barPlan,
  barReal,
  desvio,
  rowHeightPx = TIMELINE_ROW_HEIGHT_PX
}: {
  barPlan: BarraPos;
  barReal: BarraPos;
  desvio: CronogramaDesvioTimeline;
  rowHeightPx?: number;
}) {
  if (!desvio.temDesvio) return null;

  const planLeft = barPlan.leftPct;
  const planRight = barPlan.leftPct + barPlan.widthPct;
  const realLeft = barReal.leftPct;
  const realRight = barReal.leftPct + barReal.widthPct;
  const yTrilho = rowHeightPx * 0.72;
  const yFaixa = rowHeightPx - 5;

  const fimAtraso = (desvio.desvioFimDias ?? 0) > 0;
  const iniAtraso = (desvio.desvioInicioDias ?? 0) > 0;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1]"
      viewBox={`0 0 100 ${rowHeightPx}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {desvio.desvioFimDias !== null && desvio.desvioFimDias !== 0 && Math.abs(planRight - realRight) > 0.15 ? (
        <>
          <rect
            x={Math.min(planRight, realRight)}
            y={yFaixa - 2}
            width={Math.abs(realRight - planRight)}
            height={3.5}
            rx={0.8}
            className={fimAtraso ? 'fill-red-500/35 dark:fill-red-400/40' : 'fill-green-500/35 dark:fill-green-400/40'}
          />
          <line
            x1={planRight}
            y1={yTrilho}
            x2={realRight}
            y2={yTrilho}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.25}
            className={fimAtraso ? 'stroke-red-500/75 dark:stroke-red-400/85' : 'stroke-green-500/75 dark:stroke-green-400/85'}
          />
        </>
      ) : null}
      {desvio.desvioInicioDias !== null &&
      desvio.desvioInicioDias !== 0 &&
      Math.abs(planLeft - realLeft) > 0.15 ? (
        <>
          <rect
            x={Math.min(planLeft, realLeft)}
            y={yFaixa - 2}
            width={Math.abs(realLeft - planLeft)}
            height={3.5}
            rx={0.8}
            className={iniAtraso ? 'fill-amber-500/30 dark:fill-amber-400/35' : 'fill-green-500/30 dark:fill-green-400/35'}
          />
          <line
            x1={planLeft}
            y1={yTrilho - 4}
            x2={realLeft}
            y2={yTrilho - 4}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.25}
            className={iniAtraso ? 'stroke-amber-500/70 dark:stroke-amber-400/80' : 'stroke-green-500/70 dark:stroke-green-400/80'}
          />
        </>
      ) : null}
    </svg>
  );
}
