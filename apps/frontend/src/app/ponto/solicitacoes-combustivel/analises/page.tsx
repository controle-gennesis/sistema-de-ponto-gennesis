'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Car,
  Droplets,
  Filter,
  Fuel,
  Gauge,
  Loader2,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';

type FuelRefuelRequest = {
  id: string;
  displayNumber: number;
  requestedAt: string;
  refuelDate: string;
  driverName: string;
  vehiclePlate: string;
  vehicleType?: 'PRIVATE' | 'COMPANY' | null;
  status: string;
  litersRefueled?: string | number | null;
  pricePerLiter?: string | number | null;
  refuelReportedAt?: string | null;
  costCenter?: string | null;
  requester: { id: string; name: string; email: string };
  contract?: {
    id: string;
    name: string;
    number: string;
  } | null;
};

const CHART_PALETTE = [
  '#2563eb',
  '#0f766e',
  '#c2410c',
  '#7c3aed',
  '#b45309',
  '#be185d',
  '#0369a1',
  '#4d7c0f',
  '#dc2626',
  '#334155',
];

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function totalValue(
  liters: string | number | null | undefined,
  price: string | number | null | undefined,
): number | null {
  const l = toNum(liters);
  const p = toNum(price);
  if (l == null || p == null) return null;
  return l * p;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1)} mi`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1)} mil`;
  }
  return formatCurrency(value);
}

function formatLiters(value: number) {
  return `${new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  }).format(value)} L`;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function resolveRowDate(row: FuelRefuelRequest): Date | null {
  const dateRaw = row.refuelReportedAt || row.refuelDate || row.requestedAt;
  if (!dateRaw) return null;
  try {
    const dte = typeof dateRaw === 'string' ? parseISO(dateRaw) : new Date(dateRaw);
    return Number.isNaN(dte.getTime()) ? null : dte;
  } catch {
    return null;
  }
}

function resolveRowYmd(row: FuelRefuelRequest): string | null {
  const dte = resolveRowDate(row);
  if (!dte) return null;
  const y = dte.getFullYear();
  const m = String(dte.getMonth() + 1).padStart(2, '0');
  const d = String(dte.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortContractName(row: FuelRefuelRequest): string {
  const raw = row.contract?.name?.trim() || row.costCenter?.trim() || row.contract?.number?.trim() || 'Sem contrato';
  const numberPrefix = raw.match(/^(\d+\/\d+)\s*[—–-]\s*(.+)$/);
  if (numberPrefix?.[2]) return numberPrefix[2].trim();
  const codePrefix = raw.match(/^([\d.]+)\s*[—–-]\s*(.+)$/);
  if (codePrefix?.[2]) return codePrefix[2].trim();
  return raw.length > 28 ? `${raw.slice(0, 26)}…` : raw;
}

function useChartTheme() {
  const { isDark } = useTheme();
  return {
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    pieStroke: isDark ? '#1f2937' : '#ffffff',
    tipStyle: {
      background: isDark ? 'rgba(31,41,55,0.96)' : 'rgba(255,255,255,0.96)',
      border: `1px solid ${isDark ? '#4b5563' : '#e5e7eb'}`,
      borderRadius: 10,
      color: isDark ? '#f3f4f6' : '#111827',
      fontSize: 12,
    } as React.CSSProperties,
  };
}

function ChartCard({
  title,
  subtitle,
  Icon,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`${cadastroListClasses.card} ${className ?? ''}`.trim()}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
            <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
              {title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>{children}</CardContent>
    </Card>
  );
}

function RankList({
  rows,
  formatValue,
}: {
  rows: Array<{ key: string; label: string; value: number; meta?: string }>;
  formatValue: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const widthPct = Math.min(100, Math.max(6, Math.round((row.value / max) * 100)));
        const color = CHART_PALETTE[i % CHART_PALETTE.length];
        return (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-200">
                <span className="mr-1.5 text-xs font-semibold text-gray-400">{i + 1}.</span>
                {row.label}
              </span>
              <span className="shrink-0 tabular-nums text-gray-700 dark:text-gray-300">
                {formatValue(row.value)}
                {row.meta ? (
                  <span className="ml-1.5 text-xs text-gray-400">{row.meta}</span>
                ) : null}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/60">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildInsights(rows: FuelRefuelRequest[]) {
  const completed = rows.filter((r) => r.status === 'COMPLETED');
  const withSpend = completed
    .map((r) => {
      const liters = toNum(r.litersRefueled);
      const price = toNum(r.pricePerLiter);
      const total = totalValue(r.litersRefueled, r.pricePerLiter);
      if (liters == null || price == null || total == null) return null;
      return { row: r, liters, price, total };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const totalSpend = withSpend.reduce((s, x) => s + x.total, 0);
  const totalLiters = withSpend.reduce((s, x) => s + x.liters, 0);
  const avgPrice =
    withSpend.length > 0
      ? withSpend.reduce((s, x) => s + x.price, 0) / withSpend.length
      : 0;
  const weightedAvgPrice = totalLiters > 0 ? totalSpend / totalLiters : 0;

  const byContract = new Map<string, { label: string; spend: number; liters: number; count: number }>();
  const byRequester = new Map<string, { label: string; spend: number; count: number }>();
  const byDriver = new Map<string, { label: string; spend: number; count: number }>();
  const byPlate = new Map<string, { label: string; spend: number; liters: number; count: number }>();
  const byVehicleType = { COMPANY: 0, PRIVATE: 0, OTHER: 0 };
  const byMonth = new Map<string, { label: string; spend: number; liters: number; count: number; priceSum: number }>();

  for (const item of withSpend) {
    const { row, liters, price, total } = item;

    const cKey = row.contract?.id || row.costCenter || 'none';
    const cLabel = shortContractName(row);
    const c = byContract.get(cKey) ?? { label: cLabel, spend: 0, liters: 0, count: 0 };
    c.spend += total;
    c.liters += liters;
    c.count += 1;
    byContract.set(cKey, c);

    const rKey = row.requester?.id || row.requester?.email || row.requester?.name || 'unknown';
    const r = byRequester.get(rKey) ?? {
      label: row.requester?.name?.trim() || 'Sem nome',
      spend: 0,
      count: 0,
    };
    r.spend += total;
    r.count += 1;
    byRequester.set(rKey, r);

    const dKey = row.driverName?.trim() || 'Sem condutor';
    const d = byDriver.get(dKey) ?? { label: dKey, spend: 0, count: 0 };
    d.spend += total;
    d.count += 1;
    byDriver.set(dKey, d);

    const pKey = row.vehiclePlate?.trim().toUpperCase() || 'SEM PLACA';
    const p = byPlate.get(pKey) ?? { label: pKey, spend: 0, liters: 0, count: 0 };
    p.spend += total;
    p.liters += liters;
    p.count += 1;
    byPlate.set(pKey, p);

    if (row.vehicleType === 'COMPANY') byVehicleType.COMPANY += total;
    else if (row.vehicleType === 'PRIVATE') byVehicleType.PRIVATE += total;
    else byVehicleType.OTHER += total;

    const dateRaw = row.refuelReportedAt || row.refuelDate || row.requestedAt;
    try {
      const dte = typeof dateRaw === 'string' ? parseISO(dateRaw) : new Date(dateRaw);
      if (!Number.isNaN(dte.getTime())) {
        const monthStart = startOfMonth(dte);
        const mKey = format(monthStart, 'yyyy-MM');
        const mLabel = format(monthStart, "MMM/yy", { locale: ptBR });
        const m = byMonth.get(mKey) ?? {
          label: mLabel,
          spend: 0,
          liters: 0,
          count: 0,
          priceSum: 0,
        };
        m.spend += total;
        m.liters += liters;
        m.count += 1;
        m.priceSum += price;
        byMonth.set(mKey, m);
      }
    } catch {
      // ignore bad dates
    }
  }

  const topContracts = [...byContract.entries()]
    .map(([key, v]) => ({ key, label: v.label, value: v.spend, meta: `${v.count}×` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const contractBars = topContracts.map((c) => ({
    name: c.label.length > 18 ? `${c.label.slice(0, 16)}…` : c.label,
    fullName: c.label,
    gasto: Math.round(c.value * 100) / 100,
  }));

  const topRequesters = [...byRequester.values()]
    .map((v, i) => ({ key: `${v.label}-${i}`, label: v.label, value: v.spend, meta: `${v.count}×` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const topDrivers = [...byDriver.values()]
    .map((v, i) => ({ key: `${v.label}-${i}`, label: v.label, value: v.spend, meta: `${v.count}×` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const topPlates = [...byPlate.values()]
    .map((v) => ({
      key: v.label,
      label: v.label,
      value: v.spend,
      meta: formatLiters(v.liters),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const vehiclePie = [
    { name: 'Frota', value: Math.round(byVehicleType.COMPANY * 100) / 100 },
    { name: 'Particular', value: Math.round(byVehicleType.PRIVATE * 100) / 100 },
    { name: 'Não informado', value: Math.round(byVehicleType.OTHER * 100) / 100 },
  ].filter((x) => x.value > 0);

  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([, v]) => ({
      label: v.label,
      gasto: Math.round(v.spend * 100) / 100,
      litros: Math.round(v.liters * 10) / 10,
      precoMedio: v.count > 0 ? Math.round((v.priceSum / v.count) * 1000) / 1000 : 0,
      abastecimentos: v.count,
    }));

  const avgTicket = withSpend.length > 0 ? totalSpend / withSpend.length : 0;

  return {
    completedCount: completed.length,
    reportedCount: withSpend.length,
    totalSpend,
    totalLiters,
    avgPrice,
    weightedAvgPrice,
    avgTicket,
    topContracts,
    contractBars,
    topRequesters,
    topDrivers,
    topPlates,
    vehiclePie,
    monthly,
  };
}

function AnalisesCombustivelContent() {
  const theme = useChartTheme();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['fuel-refuel-requests-analytics'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests');
      return (res.data?.data || []) as FuelRefuelRequest[];
    },
    staleTime: 30_000,
  });

  const filteredRows = useMemo(() => {
    if (!dateFrom && !dateTo) return rows;
    return rows.filter((row) => {
      const ymd = resolveRowYmd(row);
      if (!ymd) return false;
      if (dateFrom && ymd < dateFrom) return false;
      if (dateTo && ymd > dateTo) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo]);

  const insights = useMemo(() => buildInsights(filteredRows), [filteredRows]);
  const hasPeriodFilter = Boolean(dateFrom || dateTo);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const periodFilterBar = (
    <div className="flex justify-center">
      <div className={cadastroListClasses.filterIconButtonWrap}>
        <button
          type="button"
          onClick={() => setIsFiltersModalOpen(true)}
          className={`${cadastroListClasses.filterIconButton} transition-colors ${
            hasPeriodFilter
              ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
          }`}
          aria-label="Abrir filtros"
          title={hasPeriodFilter ? 'Filtros ativos' : 'Filtros'}
        >
          <Filter className="h-4 w-4" />
          {hasPeriodFilter ? (
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
          ) : null}
        </button>
      </div>
    </div>
  );

  const filtersModal = (
    <Modal
      isOpen={isFiltersModalOpen}
      onClose={() => setIsFiltersModalOpen(false)}
      title="Filtros"
      size="md"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              De
            </span>
            <DatePickerField
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="dd/mm/aaaa"
              noFocusRing
              className="w-full"
              aria-label="Período inicial"
            />
          </div>
          <div className="min-w-0">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Até
            </span>
            <DatePickerField
              value={dateTo}
              onChange={setDateTo}
              placeholder="dd/mm/aaaa"
              noFocusRing
              className="w-full"
              aria-label="Período final"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() => setIsFiltersModalOpen(false)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Aplicar
          </button>
        </div>
      </div>
    </Modal>
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {periodFilterBar}
        {filtersModal}
        <div className="py-16 text-center">
          <p className="text-gray-600 dark:text-gray-400">Não foi possível carregar os dados.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (insights.reportedCount === 0) {
    return (
      <div className="space-y-6">
        {periodFilterBar}
        {filtersModal}
        <CadastroListEmpty
          icon={Fuel}
          title={hasPeriodFilter ? 'Sem abastecimentos neste período' : 'Ainda sem abastecimentos concluídos'}
          hint={
            hasPeriodFilter
              ? 'Tente ajustar o período selecionado.'
              : 'Quando houver relatórios com litros e preço por litro, os gráficos aparecem aqui.'
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {periodFilterBar}
      {filtersModal}
      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <FilterStatCard
          icon={Wallet}
          label="Gasto total"
          count={formatCurrency(insights.totalSpend)}
          subtitle={`${insights.reportedCount} abastecimentos com valor`}
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <FilterStatCard
          icon={Droplets}
          label="Litros abastecidos"
          count={formatLiters(insights.totalLiters)}
          subtitle={`Ticket médio ${formatCurrency(insights.avgTicket)}`}
          iconBg="bg-sky-100 dark:bg-sky-900/30"
          iconColor="text-sky-600 dark:text-sky-400"
        />
        <FilterStatCard
          icon={Gauge}
          label="Preço médio / L"
          count={formatPrice(insights.weightedAvgPrice)}
          subtitle={`Média simples ${formatPrice(insights.avgPrice)}`}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <FilterStatCard
          icon={Fuel}
          label="Concluídas"
          count={insights.completedCount}
          subtitle="Solicitações finalizadas"
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Gasto por contrato"
          subtitle="Quais contratos mais consomem orçamento de combustível."
          Icon={Wallet}
        >
          {insights.contractBars.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Sem dados de contrato.</p>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={insights.contractBars}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={theme.chartGrid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: theme.chartTick, fontSize: 11 }}
                    tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: theme.chartTick, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ''
                    }
                  />
                  <Bar dataKey="gasto" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {insights.contractBars.map((_, i) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Evolução mensal de gastos"
          subtitle="Quanto foi gasto e quantos litros por mês."
          Icon={TrendingUp}
        >
          {insights.monthly.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Sem série mensal ainda.</p>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={insights.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fuelSpendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={theme.chartGrid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: theme.chartTick, fontSize: 11 }} />
                  <YAxis
                    yAxisId="spend"
                    tick={{ fill: theme.chartTick, fontSize: 11 }}
                    tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                    width={64}
                  />
                  <YAxis
                    yAxisId="liters"
                    orientation="right"
                    tick={{ fill: theme.chartTick, fontSize: 11 }}
                    tickFormatter={(v) => `${v}L`}
                    width={48}
                  />
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    formatter={(value: number, name: string) => {
                      if (name === 'gasto') return [formatCurrency(value), 'Gasto'];
                      if (name === 'litros') return [formatLiters(value), 'Litros'];
                      return [value, name];
                    }}
                  />
                  <Legend />
                  <Area
                    yAxisId="spend"
                    type="monotone"
                    dataKey="gasto"
                    name="gasto"
                    stroke="#2563eb"
                    fill="url(#fuelSpendGrad)"
                    strokeWidth={2.5}
                  />
                  <Line
                    yAxisId="liters"
                    type="monotone"
                    dataKey="litros"
                    name="litros"
                    stroke="#0f766e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Preço médio do litro"
          subtitle="Variação do R$/L ao longo dos meses (média dos abastecimentos)."
          Icon={Gauge}
        >
          {insights.monthly.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Sem histórico de preço.</p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={insights.monthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={theme.chartGrid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: theme.chartTick, fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: theme.chartTick, fontSize: 11 }}
                    tickFormatter={(v) => `R$ ${Number(v).toFixed(2)}`}
                    domain={['auto', 'auto']}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    formatter={(value: number) => [formatPrice(value), 'Preço médio/L']}
                  />
                  <Line
                    type="monotone"
                    dataKey="precoMedio"
                    stroke="#c2410c"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#c2410c' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Frota × particular"
          subtitle="Distribuição do gasto por tipo de veículo."
          Icon={Car}
        >
          {insights.vehiclePie.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Sem dados de tipo de veículo.</p>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insights.vehiclePie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                    stroke={theme.pieStroke}
                    strokeWidth={2}
                  >
                    {insights.vehiclePie.map((_, i) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={theme.tipStyle}
                    formatter={(value: number) => [formatCurrency(value), 'Gasto']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Quem mais gasta"
          subtitle="Top solicitantes por valor total."
          Icon={Users}
        >
          <RankList rows={insights.topRequesters} formatValue={formatCurrency} />
        </ChartCard>
        <ChartCard
          title="Condutores com maior gasto"
          subtitle="Ranking por nome do condutor no pedido."
          Icon={Users}
        >
          <RankList rows={insights.topDrivers} formatValue={formatCurrency} />
        </ChartCard>
        <ChartCard
          title="Veículos que mais consomem"
          subtitle="Top placas por gasto e litros."
          Icon={Car}
        >
          <RankList rows={insights.topPlates} formatValue={formatCurrency} />
        </ChartCard>
      </div>
    </div>
  );
}

export default function AnalisesCombustivelPage() {
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth/login';
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/solicitacoes-combustivel">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/solicitacoes-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Análises de Abastecimento
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Gastos por contrato, quem mais consome, preço médio do litro e tendências dos
              abastecimentos concluídos.
            </p>
          </div>

          <AnalisesCombustivelContent />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
