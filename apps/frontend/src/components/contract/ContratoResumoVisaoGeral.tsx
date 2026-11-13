'use client';

import React from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, PiggyBank, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { useTheme } from '@/context/ThemeContext';

export type ContratoVisaoGeral = {
  /** Valor do contrato + aditivos. */
  valorContratual: number;
  /** Total faturado (todos os anos). */
  faturado: number;
  /** Soma das OS emitidas (empenhado). */
  empenhado: number;
  /** OS concluídas e total de OS ativas. */
  osFinalizadas: number;
  osAtivas: number;
  /** Ano do gráfico e série mensal (12 meses). */
  ano: number;
  meses: Array<{
    label: string;
    faturado: number;
    /** Meta do mês (0 = sem meta definida). */
    meta: number;
    /** Previsão ainda não faturada (só no mês corrente). */
    previsao: number;
    /** Mês já encerrado ou em andamento (meses futuros ficam sem barra). */
    decorrido: boolean;
  }>;
};

/** Valor completo, com centavos: R$ 15.000.000,00. */
const brlCompleto = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const MESES_POR_EXTENSO = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

/** Valores grandes de forma curta: R$ 14,2 mi · R$ 633,6 mil. */
function compactBrl(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

/** Mesma escala curta dos outros gráficos do Resumo (K / M). */
function compactAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export type VisaoGeralIndicador = {
  label: string;
  count: string;
  subtitle?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
};

/** Os cinco indicadores, para o cartão padrão de indicadores do sistema (FilterStatCard). */
export function visaoGeralKpis(d: ContratoVisaoGeral): VisaoGeralIndicador[] {
  const faturadoPct = d.valorContratual > 0 ? (d.faturado / d.valorContratual) * 100 : 0;
  const saldoFaturamento = Math.max(0, d.empenhado - d.faturado);
  const aEmpenhar = Math.max(0, d.valorContratual - d.empenhado);
  const osPct = d.osAtivas > 0 ? (d.osFinalizadas / d.osAtivas) * 100 : 0;
  return [
    {
      label: 'Faturado',
      count: brlCompleto(d.faturado),
      subtitle: `${pct(faturadoPct)} do contrato`,
      icon: Receipt,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconColor: 'text-green-600 dark:text-green-400',
    },
    {
      label: 'Saldo de faturamento',
      count: brlCompleto(saldoFaturamento),
      subtitle: `de ${brlCompleto(d.empenhado)} empenhados`,
      icon: Wallet,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'A empenhar',
      count: brlCompleto(aEmpenhar),
      subtitle: `${pct(d.valorContratual > 0 ? (aEmpenhar / d.valorContratual) * 100 : 0)} do contrato sem empenho`,
      icon: PiggyBank,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
    {
      label: 'OS finalizadas',
      count: String(d.osFinalizadas),
      subtitle: `de ${d.osAtivas} ativas · ${pct(osPct)}`,
      icon: CheckCircle2,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];
}

/** Gráfico "Faturamento por mês x meta", no cartão padrão do Resumo. */
export function ContratoResumoGraficoMeta({ data }: { data: ContratoVisaoGeral }) {
  const { isDark } = useTheme();
  const { ano, meses } = data;

  const decorridos = meses.filter((m) => m.decorrido && m.meta > 0);
  const batidos = decorridos.filter((m) => m.faturado >= m.meta).length;
  const metaMedia = decorridos.length ? decorridos.reduce((t, m) => t + m.meta, 0) / decorridos.length : 0;
  const mesPrevisao = meses.find((m) => m.previsao > 0);

  // Mesmas cores dos outros gráficos do Resumo.
  const chartTick = isDark ? '#9ca3af' : '#6b7280';
  const chartGrid = isDark ? '#374151' : '#e5e7eb';
  const labelFill = isDark ? '#f3f4f6' : '#374151';
  const azul = '#60a5fa';
  const amarelo = '#f59e0b';

  const chartData = meses.map((m) => ({
    mes: m.label,
    faturado: m.decorrido ? m.faturado : null,
    previsao: m.previsao > 0 ? m.previsao : null,
    meta: m.meta > 0 ? m.meta : null,
  }));

  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">Faturamento por Mês x Meta</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Notas emitidas em cada mês de {ano}
          {metaMedia > 0 ? (
            <>
              {' '}contra a meta mensal de <strong className="text-gray-800 dark:text-gray-100">{compactBrl(metaMedia)}</strong>
              . A meta foi batida em <strong className="text-gray-800 dark:text-gray-100">{batidos}</strong> de{' '}
              <strong className="text-gray-800 dark:text-gray-100">{decorridos.length}</strong> meses.
            </>
          ) : (
            '.'
          )}
        </p>
        {mesPrevisao ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {mesPrevisao.label} em amarelo: previsão de faturamento do mês, de{' '}
            <strong className="text-gray-800 dark:text-gray-100">{compactBrl(mesPrevisao.previsao)}</strong> (ainda não
            faturado).
          </p>
        ) : null}
          </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: azul }} /> Faturado
              </span>
              {metaMedia > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: chartTick }} /> Meta mensal
                </span>
              ) : null}
              {mesPrevisao ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: amarelo }} /> Previsão
                </span>
              ) : null}
            </div>

        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        <div className="h-[260px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 22, right: 10, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 6" stroke={chartGrid} vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: chartTick, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={44}
                tick={{ fontSize: 10, fill: chartTick }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => compactAxis(Number(v))}
              />
              <Tooltip
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  background: '#ffffff',
                  color: '#111827',
                  fontSize: 12,
                }}
                // No balão o mês aparece por extenso (Março, não Mar).
                labelFormatter={(rotulo) => {
                  const idx = meses.findIndex((m) => m.label === rotulo);
                  return idx >= 0 ? MESES_POR_EXTENSO[idx] : rotulo;
                }}
                formatter={(value, name) => [
                  brl(Number(value) || 0),
                  name === 'faturado' ? 'Faturado' : name === 'previsao' ? 'Previsão' : 'Meta',
                ]}
              />
              <Bar dataKey="faturado" stackId="fat" fill={azul} radius={[6, 6, 0, 0]} maxBarSize={44}>
                <LabelList
                  dataKey="faturado"
                  position="top"
                  offset={6}
                  fill={labelFill}
                  fontSize={11}
                  fontWeight={600}
                  formatter={(v) => (Number(v) > 0 ? compactAxis(Number(v)) : '')}
                />
              </Bar>
              <Bar dataKey="previsao" stackId="fat" fill={amarelo} radius={[6, 6, 0, 0]} maxBarSize={44} />
              <Line
                dataKey="meta"
                type="monotone"
                stroke={chartTick}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
