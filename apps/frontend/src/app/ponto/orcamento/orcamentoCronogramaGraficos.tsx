'use client';

import React, { useMemo } from 'react';
import { CronogramaCurvaSPanel } from './orcamentoCronogramaCurvaS';
import {
  calcularTimelineRange,
  montarLinhasTimeline,
  posicaoBarraTimeline,
  type CronogramaTimelineLinha,
  type CronogramaTimelineRange
} from './orcamentoCronogramaCalc';
import {
  CRONOGRAMA_STATUS_CLASS,
  calcularStatusCronograma,
  formatDataBr,
  parseDataIso,
  type CronogramaLinhaServico,
  type CronogramaPersist
} from './orcamentoCronogramaTypes';

type Props = {
  linhas: CronogramaLinhaServico[];
  cronograma: CronogramaPersist;
  dataInicioObra?: string;
  dataFimObra?: string;
  hoje?: Date;
};

function corBarra(status: ReturnType<typeof calcularStatusCronograma>) {
  if (status === 'concluido') return 'bg-green-500';
  if (status === 'atrasado') return 'bg-red-500';
  if (status === 'em_andamento') return 'bg-sky-500';
  return 'bg-gray-400 dark:bg-gray-500';
}

function GanttCronograma({
  titulo,
  descricao,
  rows,
  range,
  modo,
  hojeLeftPct
}: {
  titulo: string;
  descricao: string;
  rows: CronogramaTimelineLinha[];
  range: CronogramaTimelineRange;
  modo: 'plan' | 'real';
  hojeLeftPct: number | null;
}) {
  const diasCols = `repeat(${range.colunas.length}, minmax(0, 1fr))`;

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{descricao}</p>
      </div>
      <div className="sticky top-0 z-10 flex border-b border-gray-200 bg-[var(--orc-header-bg,#f9fafb)] dark:border-gray-700">
        <div className="w-64 shrink-0 border-r border-gray-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Serviço
        </div>
        <div className="min-w-0 flex-1">
          <div className="grid" style={{ gridTemplateColumns: diasCols }}>
            {range.meses.map((mes) => (
              <div
                key={mes.key}
                className="truncate border-l border-gray-200 px-1 py-2 text-center text-[10px] font-semibold uppercase text-gray-500 first:border-l-0 dark:border-gray-700 dark:text-gray-400"
                style={{ gridColumn: `span ${mes.span}` }}
              >
                {mes.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        {rows.map((row) => {
          const ini = parseDataIso(modo === 'plan' ? row.dados.dataInicio : row.dados.dataInicioReal);
          const fim = parseDataIso(modo === 'plan' ? row.dados.dataFim : row.dados.dataFimReal);
          const barra =
            !row.isCabecalhoServico && !row.isCabecalhoSubtitulo && ini && fim
              ? posicaoBarraTimeline(range.inicio, range.fim, ini, fim)
              : null;
          const status = calcularStatusCronograma(row.dados);
          const pct = Math.min(100, Math.max(0, Math.round(row.dados.percentualExecutado ?? 0)));
          const indent = row.indentLevel === 2 ? 'pl-8' : row.indentLevel === 1 ? 'pl-5' : 'pl-3';

          return (
            <div
              key={`${modo}-${row.key}`}
              className={`flex min-h-[2.25rem] border-b border-gray-100 dark:border-gray-800 ${
                row.isCabecalhoServico
                  ? 'bg-gray-50 dark:bg-gray-800/50'
                  : row.isCabecalhoSubtitulo
                    ? 'bg-slate-50 dark:bg-gray-900'
                    : ''
              }`}
            >
              <div
                className={`flex w-64 shrink-0 items-center border-r border-gray-100 pr-2 dark:border-gray-800 ${indent}`}
                title={row.label}
              >
                <span
                  className={`min-w-0 truncate text-xs leading-snug ${
                    row.isCabecalhoServico
                      ? 'font-semibold text-gray-900 dark:text-gray-100'
                      : row.isCabecalhoSubtitulo
                        ? 'text-[11px] font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300'
                        : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {row.label}
                </span>
              </div>
              <div className="relative min-w-0 flex-1">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: diasCols }}>
                  {range.colunas.map((col) => (
                    <div
                      key={col.key}
                      className="border-l border-gray-100 first:border-l-0 dark:border-gray-800/80"
                    />
                  ))}
                </div>
                {hojeLeftPct != null ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-red-500"
                    style={{ left: `${hojeLeftPct}%` }}
                    aria-hidden
                  />
                ) : null}
                {barra && barra.widthPct > 0 ? (
                  <div
                    className={`absolute top-1.5 bottom-1.5 z-[1] overflow-hidden rounded-sm ${
                      modo === 'plan'
                        ? 'border border-dashed border-gray-400/80 bg-gray-400/10 dark:border-gray-500'
                        : ''
                    }`}
                    style={{
                      left: `calc(${barra.leftPct}% + 2px)`,
                      width: `calc(${Math.max(barra.widthPct, 0.6)}% - 4px)`
                    }}
                    title={
                      modo === 'plan'
                        ? `Planejado: ${formatDataBr(row.dados.dataInicio)} → ${formatDataBr(row.dados.dataFim)}`
                        : `Real: ${formatDataBr(row.dados.dataInicioReal)} → ${formatDataBr(row.dados.dataFimReal)} · ${pct}%`
                    }
                  >
                    {modo === 'real' ? (
                      <div className="relative h-full">
                        <div className={`absolute inset-0 rounded-sm opacity-25 ${corBarra(status)}`} />
                        <div
                          className={`absolute inset-y-0 left-0 rounded-sm ${corBarra(status)}`}
                          style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : undefined }}
                        />
                        <span className={`pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold ${CRONOGRAMA_STATUS_CLASS[status]}`}>
                          {pct}%
                        </span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CronogramaGraficosPainel({
  linhas,
  cronograma,
  dataInicioObra,
  dataFimObra,
  hoje = new Date()
}: Props) {
  const range = useMemo(() => calcularTimelineRange(linhas, cronograma), [linhas, cronograma]);
  const rows = useMemo(() => montarLinhasTimeline(linhas, cronograma), [linhas, cronograma]);
  const hojeLeftPct = useMemo(() => {
    if (!range) return null;
    const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0, 0);
    if (dia < range.inicio || dia > range.fim) return null;
    const total = Math.max(1, range.colunas.length);
    const idx = range.colunas.findIndex(
      (col) =>
        col.data.getFullYear() === dia.getFullYear() &&
        col.data.getMonth() === dia.getMonth() &&
        col.data.getDate() === dia.getDate()
    );
    if (idx < 0) return null;
    return ((idx + 0.5) / total) * 100;
  }, [range, hoje]);

  return (
    <div className="space-y-6 p-4">
      <section>
        <CronogramaCurvaSPanel
          linhas={linhas}
          cronograma={cronograma}
          dataInicioObra={dataInicioObra}
          dataFimObra={dataFimObra}
          hoje={hoje}
          inModal
        />
      </section>
      {range ? (
        <>
          <GanttCronograma
            titulo="Cronograma planejamento"
            descricao="Barras pelo início e fim planejados de cada composição."
            rows={rows}
            range={range}
            modo="plan"
            hojeLeftPct={hojeLeftPct}
          />
          <GanttCronograma
            titulo="Cronograma real"
            descricao="Barras pelo início e fim reais. A faixa colorida mostra o executado."
            rows={rows}
            range={range}
            modo="real"
            hojeLeftPct={hojeLeftPct}
          />
        </>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Defina as datas das etapas para ver o cronograma de planejamento e o real.
        </p>
      )}
    </div>
  );
}
