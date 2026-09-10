'use client';

import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ClipboardList, Loader2, Receipt, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { CONTRACT_PAGE_ACCENTS, CONTRACT_PAGE_SURFACE } from '@/lib/contractPageSurface';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { useTheme } from '@/context/ThemeContext';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { compareOsSeNatural } from '@/lib/formatOsSePasta';
import {
  formatExtratoFluxoAxisValue,
  formatExtratoFluxoCurrency,
} from '@/app/ponto/financeiro/analise-extrato/extratoFluxoDiario';

export type ContratoFaturamentoChartBilling = {
  issueDate: string;
  serviceOrder?: string | null;
  invoiceNumber?: string | null;
  grossValue: number;
};

export type ContratoFaturamentoFluxoPoint = {
  monthKey: string;
  label: string;
  gastos: number;
  faturamento: number;
  producao: number;
  diferenca: number;
};

const CHART_PALETTE = [
  '#15803d',
  '#1d4ed8',
  '#c2410c',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#be185d',
  '#0369a1',
  '#4d7c0f',
  '#334155',
];

const LINE_COLORS = {
  gastos: '#dc2626',
  faturamento: '#16a34a',
  producao: '#d97706',
  diferenca: '#2563eb',
};

const PIE_SLICE_LIMIT = 8;

const MESES_LABEL = [
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

const MES_SELECT_OPTIONS = labeledToSelectOptions(
  MESES_LABEL.map((label, index) => ({ value: String(index + 1), label }))
);

type ChartItem = {
  key: string;
  label: string;
  value: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function billingYearMonth(issueDate: string): { y: number; m: number } | null {
  const raw = String(issueDate || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]) };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { y: parsed.getFullYear(), m: parsed.getMonth() + 1 };
}

function useChartTheme() {
  const { isDark } = useTheme();
  const tipColor = isDark ? '#f3f4f6' : '#111827';
  return {
    pieStroke: isDark ? '#1f2937' : '#ffffff',
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    tipStyle: {
      background: isDark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
      border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`,
      borderRadius: 10,
      color: tipColor,
      fontSize: 12,
    } as React.CSSProperties,
    tipLabelStyle: { color: tipColor, marginBottom: 4 } as React.CSSProperties,
    tipItemStyle: { color: tipColor } as React.CSSProperties,
  };
}

function aggregateByKey(
  billings: ContratoFaturamentoChartBilling[],
  getKey: (row: ContratoFaturamentoChartBilling) => { key: string; label: string },
  compareLabels?: (a: string, b: string) => number
): ChartItem[] {
  const map = new Map<string, ChartItem>();
  for (const row of billings) {
    const gross = Number(row.grossValue) || 0;
    if (gross <= 0) continue;
    const { key, label } = getKey(row);
    const current = map.get(key);
    if (current) {
      current.value += gross;
    } else {
      map.set(key, { key, label, value: gross });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;
    return compareLabels ? compareLabels(a.label, b.label) : a.label.localeCompare(b.label, 'pt-BR');
  });
}

function toPieSlices(items: ChartItem[]): ChartItem[] {
  if (items.length <= PIE_SLICE_LIMIT) return items;
  const head = items.slice(0, PIE_SLICE_LIMIT - 1);
  const rest = items.slice(PIE_SLICE_LIMIT - 1);
  const outrosValue = rest.reduce((sum, item) => sum + item.value, 0);
  if (outrosValue <= 0) return head;
  return [...head, { key: '__outros__', label: `Outros (${rest.length})`, value: outrosValue }];
}

function osGroup(row: ContratoFaturamentoChartBilling): { key: string; label: string } {
  const label = (row.serviceOrder || '').trim();
  if (!label) return { key: '__sem-os__', label: 'Sem OS / SE' };
  return { key: label.toLowerCase(), label };
}

function nfGroup(row: ContratoFaturamentoChartBilling): { key: string; label: string } {
  const label = (row.invoiceNumber || '').trim();
  if (!label) return { key: '__sem-nf__', label: 'Sem NF' };
  return { key: label.toLowerCase(), label };
}

function fluxoSeriesLabel(key: string): string {
  if (key === 'gastos') return 'Gastos';
  if (key === 'faturamento') return 'Faturamento';
  if (key === 'producao') return 'Produção';
  return 'Faturamento − Gastos';
}

function FaturamentoDonutCard({
  title,
  subtitle,
  icon: Icon,
  iconWrapClass,
  iconClass,
  items,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconWrapClass: string;
  iconClass: string;
  items: ChartItem[];
  emptyHint: string;
}) {
  const theme = useChartTheme();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const pieItems = useMemo(() => toPieSlices(items), [items]);
  const slices = pieItems.map((item, index) => ({
    ...item,
    color: CHART_PALETTE[index % CHART_PALETTE.length],
  }));
  const legendColorByKey = new Map(slices.map((slice) => [slice.key, slice.color]));
  const outrosColor = slices.find((slice) => slice.key === '__outros__')?.color ?? '#64748b';

  return (
    <Card className={`${cadastroListClasses.card} ${CONTRACT_PAGE_SURFACE}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${CONTRACT_PAGE_ACCENTS.sky}`} />
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}>
            <Icon className={`h-5 w-5 ${iconClass}`} aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        {total <= 0 ? (
          <CadastroListEmpty icon={Icon} title="Sem faturamento no período" hint={emptyHint} />
        ) : (
          <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto h-[210px] w-[210px] shrink-0 sm:mx-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={96}
                    paddingAngle={1.5}
                    stroke={theme.pieStroke}
                    strokeWidth={3}
                    cornerRadius={3}
                    animationDuration={650}
                  >
                    {slices.map((slice) => (
                      <Cell key={slice.key} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    labelStyle={theme.tipLabelStyle}
                    itemStyle={theme.tipItemStyle}
                    formatter={(value: number, name: string) => [formatCurrency(Number(value) || 0), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="px-4 text-center text-sm font-bold leading-tight tabular-nums text-gray-900 dark:text-gray-100">
                  {formatCurrency(total)}
                </span>
                <span className="mt-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Total
                </span>
              </div>
            </div>
            <ul className="max-h-64 min-w-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {items.map((item) => {
                const pct = total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0;
                const color = legendColorByKey.get(item.key) ?? outrosColor;
                return (
                  <li key={item.key} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100" title={item.label}>
                        {item.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                        {pct.toLocaleString('pt-BR')}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FluxoLinhaCard({
  series,
  periodLabel,
  loading,
}: {
  series: ContratoFaturamentoFluxoPoint[];
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
    <Card className={`${cadastroListClasses.card} ${CONTRACT_PAGE_SURFACE}`}>
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${CONTRACT_PAGE_ACCENTS.teal}`} />
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 ring-1 ring-teal-200/80 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/20">
            <TrendingUp className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Gasto, faturamento, produção e diferença
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Evolução mensal · {periodLabel} · valores do Controle Geral
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2
              className="h-6 w-6 animate-spin text-teal-600 dark:text-teal-400"
              aria-label="Carregando gráfico de evolução"
            />
          </div>
        ) : !hasValue ? (
          <CadastroListEmpty
            icon={TrendingUp}
            title="Sem movimento no período"
            hint="A linha usa o gasto, o faturamento e a produção mensais do Controle Geral."
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
                  formatter={(value: number, name: string) => [
                    formatExtratoFluxoCurrency(Number(value) || 0),
                    fluxoSeriesLabel(name),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => fluxoSeriesLabel(String(value))} />
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

export function ContratoFaturamentoCharts({
  billings,
  year,
  monthlySeries,
  fluxoPeriodLabel,
  loading = false,
  loadingFluxo = false,
}: {
  billings: ContratoFaturamentoChartBilling[];
  year: number;
  monthlySeries: ContratoFaturamentoFluxoPoint[];
  fluxoPeriodLabel: string;
  loading?: boolean;
  loadingFluxo?: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const monthLabel = MESES_LABEL[selectedMonth - 1] ?? String(selectedMonth);

  const monthBillings = useMemo(
    () =>
      billings.filter((row) => {
        const ym = billingYearMonth(row.issueDate);
        return ym != null && ym.y === year && ym.m === selectedMonth;
      }),
    [billings, year, selectedMonth]
  );

  const osItems = useMemo(
    () => aggregateByKey(monthBillings, osGroup, compareOsSeNatural),
    [monthBillings]
  );
  const nfItems = useMemo(() => aggregateByKey(monthBillings, nfGroup), [monthBillings]);
  const lancamentos = monthBillings.length;
  const subtitleBase =
    lancamentos === 1
      ? `1 lançamento · ${monthLabel}/${year}`
      : `${lancamentos} lançamentos · ${monthLabel}/${year}`;

  return (
    <div className="space-y-4">
      <FluxoLinhaCard series={monthlySeries} periodLabel={fluxoPeriodLabel} loading={loadingFluxo} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
          Faturamento do mês
        </p>
        <StringSingleSelectDropdown
          value={String(selectedMonth)}
          onChange={(value) => {
            const next = Number(value);
            if (next >= 1 && next <= 12) setSelectedMonth(next);
          }}
          options={MES_SELECT_OPTIONS}
          allowEmpty={false}
          disableSearch
          menuAlign="end"
          matchTriggerWidth
          menuMinWidth={168}
          className="min-w-[10.5rem] sm:w-[12rem]"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {['os', 'nf'].map((key) => (
            <Card key={key} className={`${cadastroListClasses.card} ${CONTRACT_PAGE_SURFACE}`}>
              <CardContent className="flex items-center justify-center py-16">
                <Loader2
                  className="h-6 w-6 animate-spin text-green-600 dark:text-green-400"
                  aria-label="Carregando gráficos de faturamento"
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <FaturamentoDonutCard
            title="Faturamento por OS"
            subtitle={`${subtitleBase} · valor bruto`}
            icon={ClipboardList}
            iconWrapClass="bg-sky-100 text-sky-700 ring-1 ring-sky-200/80 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/20"
            iconClass=""
            items={osItems}
            emptyHint="Os valores vêm dos lançamentos do quadrante de Faturamento no mês selecionado."
          />
          <FaturamentoDonutCard
            title="Faturamento por nota fiscal"
            subtitle={`${subtitleBase} · valor bruto`}
            icon={Receipt}
            iconWrapClass="bg-green-100 text-green-700 ring-1 ring-green-200/80 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/20"
            iconClass=""
            items={nfItems}
            emptyHint="Os valores vêm dos lançamentos do quadrante de Faturamento no mês selecionado."
          />
        </div>
      )}
    </div>
  );
}
