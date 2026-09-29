'use client';

import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { useTheme } from '@/context/ThemeContext';
import {
  formatExtratoFluxoAxisValue,
  formatExtratoFluxoCurrency,
} from '@/app/ponto/financeiro/analise-extrato/extratoFluxoDiario';

export type ContratoControleGeralFluxoPoint = {
  monthKey: string;
  label: string;
  gastos: number;
  faturamento: number;
  producao: number;
  diferenca: number;
};

const LINE_COLORS = {
  gastos: '#dc2626',
  faturamento: '#16a34a',
  producao: '#d97706',
  diferenca: '#2563eb',
};

function fluxoSeriesLabel(key: string): string {
  if (key === 'gastos') return 'Gastos';
  if (key === 'faturamento') return 'Faturamento';
  if (key === 'producao') return 'Produção';
  return 'Faturamento - Gastos';
}

function useChartTheme() {
  const { isDark } = useTheme();
  const tipColor = isDark ? '#f3f4f6' : '#111827';
  return {
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    tipStyle: {
      background: isDark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.98)',
      border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`,
      borderRadius: 10,
      color: tipColor,
      fontSize: 12,
    } as React.CSSProperties,
    tipLabelStyle: { color: tipColor, marginBottom: 4 } as React.CSSProperties,
    tipItemStyle: { color: tipColor } as React.CSSProperties,
  };
}

export function ContratoControleGeralFluxoChart({
  series,
  periodLabel: _periodLabel,
  loading = false,
}: {
  series: ContratoControleGeralFluxoPoint[];
  periodLabel: string;
  loading?: boolean;
}) {
  const theme = useChartTheme();
  const hasValue = series.some(
    (point) =>
      point.gastos !== 0 ||
      point.faturamento !== 0 ||
      point.producao !== 0 ||
      point.diferenca !== 0
  );

  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30 sm:p-3">
            <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Evolução mensal
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Indicadores mensais do contrato
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-6 w-6 animate-spin text-indigo-600 dark:text-indigo-400"
              aria-label="Carregando gráfico de evolução"
            />
          </div>
        ) : !hasValue ? (
          <CadastroListEmpty
            icon={BarChart3}
            title="Sem movimento no período"
            hint="Os indicadores mensais do contrato aparecem aqui quando houver valores."
          />
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: theme.chartTick }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: theme.chartTick }}
                  tickFormatter={formatExtratoFluxoAxisValue}
                  width={52}
                />
                <Tooltip
                  contentStyle={theme.tipStyle}
                  labelStyle={theme.tipLabelStyle}
                  itemStyle={theme.tipItemStyle}
                  formatter={(value, name) => [
                    formatExtratoFluxoCurrency(Number(value) || 0),
                    fluxoSeriesLabel(String(name ?? '')),
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => fluxoSeriesLabel(String(value))}
                />
                <Line
                  type="monotone"
                  dataKey="gastos"
                  name="gastos"
                  stroke={LINE_COLORS.gastos}
                  strokeWidth={2}
                  dot={series.length <= 24}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="faturamento"
                  name="faturamento"
                  stroke={LINE_COLORS.faturamento}
                  strokeWidth={2}
                  dot={series.length <= 24}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="producao"
                  name="producao"
                  stroke={LINE_COLORS.producao}
                  strokeWidth={2}
                  dot={series.length <= 24}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="diferenca"
                  name="diferenca"
                  stroke={LINE_COLORS.diferenca}
                  strokeWidth={2}
                  dot={series.length <= 24}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
