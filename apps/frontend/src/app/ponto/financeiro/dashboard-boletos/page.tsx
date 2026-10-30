'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CalendarRange,
  CircleCheck,
  Calculator,
  Clock,
  CreditCard,
  ReceiptText,
  Filter,
  FilterX,
  ListFilter,
  Truck,
  UserCog,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Loading } from '@/components/ui/Loading';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { useTheme } from '@/context/ThemeContext';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';

type Bucket = {
  key: string;
  label: string;
  count: number;
  value: number;
  pago: number;
  aVencer: number;
  vencido: number;
};

type Dashboard = {
  totals: Record<'all' | 'PAGO' | 'A_VENCER' | 'VENCIDO', { count: number; value: number }>;
  next30: { count: number; value: number };
  byPolo: Bucket[];
  byManager: Bucket[];
  byCostCenter: Bucket[];
  bySupplier: Bucket[];
  byMonth: Bucket[];
  byPaymentType: Bucket[];
  byCondition: Bucket[];
  byMonthPolo: Array<{ key: string; polos: Record<string, { value: number; count: number }> }>;
};

type Filters = { polo: string; costCenter: string; manager: string; dueFrom: string; dueTo: string };
const EMPTY_FILTERS: Filters = { polo: '', costCenter: '', manager: '', dueFrom: '', dueTo: '' };

const CHART_PALETTE = ['#b91c1c', '#0f766e', '#1e40af', '#c2410c', '#0891b2', '#a16207', '#be185d', '#334155'];
const STATUS_COLORS = { pago: '#059669', aVencer: '#d97706', vencido: '#dc2626' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return brl(v);
};
const monthLabel = (key: string) => {
  if (key === 'sem-data') return 'Sem data';
  const [y, m] = key.split('-');
  return `${MESES[Number(m) - 1] ?? m}/${y.slice(2)}`;
};
const truncate = (v: string, max = 22) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

function useChartTheme() {
  const { isDark } = useTheme();
  const tipColor = isDark ? '#f3f4f6' : '#111827';
  return {
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartLabel: isDark ? '#e5e7eb' : '#374151',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
    pieStroke: isDark ? '#1f2937' : '#ffffff',
    barCursor: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.16)',
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

function SectionTitle({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className={cadastroListClasses.cardHeaderIconRow}>
      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
        <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">{title}</h2>
        {subtitle ? <p className="truncate text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function ChartCard({
  icon,
  title,
  subtitle,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col ${className || ''}`}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <SectionTitle icon={icon} title={title} subtitle={subtitle} />
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>{children}</CardContent>
    </Card>
  );
}

function ChartEmpty({ icon }: { icon: LucideIcon }) {
  return <CadastroListEmpty icon={icon} hint="Ajuste os filtros para ver os dados" title="Sem dados no filtro atual" />;
}

/** Barras horizontais de valor total (ranking). */
function RankBarChart({ data, icon, color }: { data: Bucket[]; icon: LucideIcon; color?: string }) {
  const theme = useChartTheme();
  if (!data.length) return <ChartEmpty icon={icon} />;
  const max = Math.max(...data.map((d) => d.value), 1);
  const height = Math.max(220, data.length * 38 + 16);
  const longest = Math.max(...data.map((d) => d.label.length), 1);
  const yAxisWidth = Math.min(168, Math.max(68, Math.round(longest * 6.4)));
  const rightMargin = Math.min(108, Math.max(60, Math.round(brlCompact(max).length * 7)));
  const labelMax = Math.max(10, Math.floor(yAxisWidth / 6.2));
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: rightMargin, bottom: 2, left: 0 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} horizontal={false} />
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="label"
            width={yAxisWidth}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            tick={{ fill: theme.chartTick, fontSize: 11 }}
            tickFormatter={(v: string) => truncate(v, labelMax)}
          />
          <Tooltip
            contentStyle={theme.tipStyle}
            labelStyle={theme.tipLabelStyle}
            itemStyle={theme.tipItemStyle}
            cursor={{ fill: theme.barCursor }}
            formatter={(value, _n, item) => [`${brl(Number(value ?? 0))} · ${(item.payload as Bucket).count} boletos`, 'Total']}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} animationDuration={650}>
            {data.map((d, i) => (
              <Cell key={d.key} fill={color ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
            <LabelList dataKey="value" position="right" offset={8} fill={theme.chartLabel} fontSize={11} formatter={(v) => brlCompact(Number(v ?? 0))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({ data, icon }: { data: Bucket[]; icon: LucideIcon }) {
  const theme = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || total <= 0) return <ChartEmpty icon={icon} />;
  const slices = data.map((d, i) => ({ ...d, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  return (
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
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={theme.tipStyle}
              labelStyle={theme.tipLabelStyle}
              itemStyle={theme.tipItemStyle}
              formatter={(value, name) => [brl(Number(value ?? 0)), name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold leading-none tabular-nums text-gray-900 dark:text-gray-100">{brlCompact(total)}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {slices.slice(0, 7).map((s) => {
          const pct = Math.round((s.value / total) * 1000) / 10;
          return (
            <li key={s.key} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-100" title={s.label}>
                {s.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-700 dark:text-gray-200">{brlCompact(s.value)}</span>
              <span className="w-12 shrink-0 text-right tabular-nums text-gray-500 dark:text-gray-400">{pct.toLocaleString('pt-BR')}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Colunas empilhadas por mês de vencimento: pago / à vencer / vencido. */
function MonthlyChart({ data }: { data: Bucket[] }) {
  const theme = useChartTheme();
  if (!data.length) return <ChartEmpty icon={CalendarRange} />;
  const rows = data.map((d) => ({ ...d, mes: monthLabel(d.key) }));
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: theme.chartTick, fontSize: 11 }} interval={0} angle={rows.length > 14 ? -45 : 0} textAnchor={rows.length > 14 ? 'end' : 'middle'} height={rows.length > 14 ? 48 : 28} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.chartTick, fontSize: 11 }} tickFormatter={(v) => brlCompact(Number(v))} />
          <Tooltip
            contentStyle={theme.tipStyle}
            labelStyle={theme.tipLabelStyle}
            itemStyle={theme.tipItemStyle}
            cursor={{ fill: theme.barCursor }}
            formatter={(value, name) => [brl(Number(value ?? 0)), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="pago" name="Pago" stackId="s" fill={STATUS_COLORS.pago} animationDuration={650} />
          <Bar dataKey="aVencer" name="À vencer" stackId="s" fill={STATUS_COLORS.aVencer} animationDuration={650} />
          <Bar dataKey="vencido" name="Vencido" stackId="s" fill={STATUS_COLORS.vencido} radius={[4, 4, 0, 0]} animationDuration={650} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaymentTypeBlock({ data }: { data: Bucket[] }) {
  const theme = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  if (!totalCount) return <ChartEmpty icon={CreditCard} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: theme.chartTick, fontSize: 10 }} interval={0} tickFormatter={(v: string) => truncate(v, 14)} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.chartTick, fontSize: 11 }} tickFormatter={(v) => brlCompact(Number(v))} />
            <Tooltip contentStyle={theme.tipStyle} labelStyle={theme.tipLabelStyle} itemStyle={theme.tipItemStyle} cursor={{ fill: theme.barCursor }} formatter={(value) => [brl(Number(value ?? 0)), 'Valor']} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} animationDuration={650}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
              <LabelList dataKey="value" position="top" fill={theme.chartLabel} fontSize={11} formatter={(v) => (Number(v) > 0 ? brlCompact(Number(v)) : '')} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="table-scroll">
        <table className={cadastroListClasses.table}>
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th className="px-2 py-3 text-left font-medium">Tipo de pagamento</th>
              <th className="px-2 py-3 text-center font-medium">Qtd.</th>
              <th className="px-2 py-3 text-right font-medium">Valor</th>
              <th className="px-2 py-3 text-right font-medium">% do total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
            {data.map((d) => (
              <tr key={d.key} className="text-xs text-gray-900 dark:text-gray-100">
                <td className="px-2 py-3 font-medium">{d.label}</td>
                <td className="px-2 py-3 text-center tabular-nums">{d.count.toLocaleString('pt-BR')}</td>
                <td className="px-2 py-3 text-right tabular-nums">{brl(d.value)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{total > 0 ? (Math.round((d.value / total) * 1000) / 10).toLocaleString('pt-BR') : '0'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConditionBlock({ data, total }: { data: Bucket[]; total: number }) {
  const theme = useChartTheme();
  if (!data.length) return <ChartEmpty icon={ReceiptText} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: theme.chartTick, fontSize: 10 }} interval={0} tickFormatter={(v: string) => truncate(v, 12)} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.chartTick, fontSize: 11 }} tickFormatter={(v) => brlCompact(Number(v))} />
            <Tooltip contentStyle={theme.tipStyle} labelStyle={theme.tipLabelStyle} itemStyle={theme.tipItemStyle} cursor={{ fill: theme.barCursor }} formatter={(value) => [brl(Number(value ?? 0)), 'Valor']} />
            <Bar dataKey="value" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={650}>
              <LabelList dataKey="value" position="top" fill={theme.chartLabel} fontSize={10} formatter={(v) => brlCompact(Number(v ?? 0))} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="table-scroll">
        <table className={cadastroListClasses.table}>
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <th className="px-2 py-3 text-left font-medium">Condição</th>
              <th className="px-2 py-3 text-center font-medium">Qtd.</th>
              <th className="px-2 py-3 text-right font-medium">Valor</th>
              <th className="px-2 py-3 text-right font-medium">% do total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
            {data.map((d) => (
              <tr key={d.key} className="text-xs text-gray-900 dark:text-gray-100">
                <td className="px-2 py-3 font-medium">{d.label}</td>
                <td className="px-2 py-3 text-center tabular-nums">{d.count.toLocaleString('pt-BR')}</td>
                <td className="px-2 py-3 text-right tabular-nums">{brl(d.value)}</td>
                <td className="px-2 py-3 text-right tabular-nums">{total > 0 ? (Math.round((d.value / total) * 1000) / 10).toLocaleString('pt-BR') : '0'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Resumo mensal por polo (aba 05 da planilha) com % do período. */
function MonthlySummaryTable({ rows, polos }: { rows: Dashboard['byMonthPolo']; polos: string[] }) {
  if (!rows.length) return <ChartEmpty icon={CalendarRange} />;
  const line = (r: Dashboard['byMonthPolo'][number]) => ({
    value: polos.reduce((s, p) => s + (r.polos[p]?.value ?? 0), 0),
    count: polos.reduce((s, p) => s + (r.polos[p]?.count ?? 0), 0),
  });
  const totalValue = rows.reduce((s, r) => s + line(r).value, 0);
  const totalCount = rows.reduce((s, r) => s + line(r).count, 0);
  const th = 'px-2 py-3 text-right font-medium';
  const td = 'px-2 py-3 text-right tabular-nums';
  const pct = (v: number) => (totalValue > 0 ? (Math.round((v / totalValue) * 1000) / 10).toLocaleString('pt-BR') : '0');
  return (
    <div className="table-scroll">
      <table className={cadastroListClasses.table}>
        <thead className="border-b border-gray-200 dark:border-gray-700">
          <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="px-2 py-3 text-left font-medium">Mês</th>
            {polos.map((p) => (
              <th key={p} className={th}>{p} (R$)</th>
            ))}
            <th className={th}>Total (R$)</th>
            {polos.map((p) => (
              <th key={`q-${p}`} className={th}>Qtd {p}</th>
            ))}
            <th className={th}>Qtd total</th>
            <th className={th}>% do período</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
          {rows.map((r) => {
            const l = line(r);
            return (
              <tr key={r.key} className="text-xs text-gray-900 dark:text-gray-100">
                <td className="px-2 py-3 font-medium">{monthLabel(r.key)}</td>
                {polos.map((p) => (
                  <td key={p} className={td}>{brl(r.polos[p]?.value ?? 0)}</td>
                ))}
                <td className={`${td} font-semibold`}>{brl(l.value)}</td>
                {polos.map((p) => (
                  <td key={`q-${p}`} className={td}>{(r.polos[p]?.count ?? 0).toLocaleString('pt-BR')}</td>
                ))}
                <td className={`${td} font-semibold`}>{l.count.toLocaleString('pt-BR')}</td>
                <td className={td}>{pct(l.value)}%</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-gray-300 dark:border-gray-600">
          <tr className="text-xs font-bold text-gray-900 dark:text-gray-100">
            <td className="px-2 py-3">Total</td>
            {polos.map((p) => (
              <td key={p} className={td}>{brl(rows.reduce((s, r) => s + (r.polos[p]?.value ?? 0), 0))}</td>
            ))}
            <td className={td}>{brl(totalValue)}</td>
            {polos.map((p) => (
              <td key={`q-${p}`} className={td}>{rows.reduce((s, r) => s + (r.polos[p]?.count ?? 0), 0).toLocaleString('pt-BR')}</td>
            ))}
            <td className={td}>{totalCount.toLocaleString('pt-BR')}</td>
            <td className={td}>100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Lista completa de centros de custo com total, quantidade e % do período. */
function CostCenterTable({ data, total }: { data: Bucket[]; total: number }) {
  if (!data.length) return <ChartEmpty icon={Wallet} />;
  return (
    <div className="table-scroll max-h-[420px] overflow-y-auto">
      <table className={cadastroListClasses.table}>
        <thead className="sticky top-0 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="px-2 py-3 text-left font-medium">Centro de custo</th>
            <th className="px-2 py-3 text-center font-medium">Qtd.</th>
            <th className="px-2 py-3 text-right font-medium">Total (R$)</th>
            <th className="px-2 py-3 text-right font-medium">% do período</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
          {data.map((d) => (
            <tr key={d.key} className="text-xs text-gray-900 dark:text-gray-100">
              <td className="px-2 py-3 font-medium">{d.label}</td>
              <td className="px-2 py-3 text-center tabular-nums">{d.count.toLocaleString('pt-BR')}</td>
              <td className="px-2 py-3 text-right tabular-nums">{brl(d.value)}</td>
              <td className="px-2 py-3 text-right tabular-nums">{total > 0 ? (Math.round((d.value / total) * 1000) / 10).toLocaleString('pt-BR') : '0'}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterField({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
    </div>
  );
}

function DashboardBoletosPage() {
  const handleLogout = useLogout();
  const user = authService.getUser();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const params = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Partial<Filters>,
    [filters],
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: ['boleto-control-dashboard', params],
    queryFn: async () => (await api.get('/boleto-control/dashboard', { params })).data?.data as Dashboard,
    enabled: !!user,
    placeholderData: (prev) => prev,
  });

  const { data: options } = useQuery({
    queryKey: ['boleto-control-options'],
    queryFn: async () =>
      (await api.get('/boleto-control/options')).data?.data as { polos: string[]; costCenters: string[]; managers: string[] },
    enabled: !!user,
    staleTime: 60_000,
  });

  const filtersActive = Object.values(filters).some((v) => v !== '');
  const setFilter = (k: keyof Filters) => (v: string) => setFilters((p) => ({ ...p, [k]: v }));

  if (!user) {
    return (
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <Loading message="Carregando..." fullScreen size="lg" />
      </MainLayout>
    );
  }

  const t = data?.totals;
  const kpis = [
    { key: 'all', label: 'Total em boletos', count: t?.all.count ?? 0, value: t?.all.value ?? 0, Icon: Wallet, bg: 'bg-blue-100 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-300' },
    { key: 'pago', label: 'Pagos', count: t?.PAGO.count ?? 0, value: t?.PAGO.value ?? 0, Icon: CircleCheck, bg: 'bg-emerald-100 dark:bg-emerald-900/30', color: 'text-emerald-600 dark:text-emerald-300' },
    { key: 'avencer', label: 'À vencer', count: t?.A_VENCER.count ?? 0, value: t?.A_VENCER.value ?? 0, Icon: Clock, bg: 'bg-amber-100 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-300' },
    { key: 'vencido', label: 'Vencidos', count: t?.VENCIDO.count ?? 0, value: t?.VENCIDO.value ?? 0, Icon: AlertTriangle, bg: 'bg-red-100 dark:bg-red-900/30', color: 'text-red-600 dark:text-red-300' },
    { key: 'media', label: 'Valor médio por boleto', count: 0, value: t && t.all.count ? t.all.value / t.all.count : 0, Icon: Calculator, bg: 'bg-teal-100 dark:bg-teal-900/30', color: 'text-teal-600 dark:text-teal-300' },
    { key: 'next30', label: 'Vencem em 30 dias', count: data?.next30.count ?? 0, value: data?.next30.value ?? 0, Icon: CalendarClock, bg: 'bg-purple-100 dark:bg-purple-900/30', color: 'text-purple-600 dark:text-purple-300' },
  ];

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
        <ListPageHeader
          title="Dashboard de Boletos"
          description="Indicadores de pagos, à vencer e vencidos por polo, gestor, centro de custo e mês de vencimento"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <FilterStatCard
              key={k.key}
              label={k.label}
              count={k.key === 'media' ? brl(k.value) : `${k.count.toLocaleString('pt-BR')} boletos`}
              subtitle={k.key === 'media' ? 'média por boleto' : brl(k.value)}
              icon={k.Icon}
              iconBg={k.bg}
              iconColor={k.color}
              loading={isLoading}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className={cadastroListClasses.filterIconButtonWrap}>
            <button
              type="button"
              onClick={() => setShowFilters((p) => !p)}
              className={`${cadastroListClasses.filterIconButton} transition-colors ${
                showFilters || filtersActive
                  ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                  : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
              }`}
              aria-expanded={showFilters}
              aria-label="Abrir filtros"
              title={filtersActive ? 'Filtros ativos' : 'Filtros'}
            >
              <Filter className="h-4 w-4" />
              {filtersActive ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" /> : null}
            </button>
          </div>
        </div>

        {showFilters ? (
          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <SectionTitle icon={ListFilter} title="Filtros" subtitle="Recorte os indicadores por polo, centro de custo, gestor e período de vencimento" />
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <FilterX className="h-4 w-4 shrink-0" />
                    <span>Limpar filtros</span>
                  </button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <FilterField label="Polo">
                  <StringSingleSelectDropdown value={filters.polo} onChange={setFilter('polo')} options={options?.polos ?? []} placeholder="Todos" emptyOptionLabel="Todos" matchTriggerWidth />
                </FilterField>
                <FilterField label="Centro de custo">
                  <StringSingleSelectDropdown value={filters.costCenter} onChange={setFilter('costCenter')} options={options?.costCenters ?? []} placeholder="Todos" emptyOptionLabel="Todos" matchTriggerWidth />
                </FilterField>
                <FilterField label="Gestor">
                  <StringSingleSelectDropdown value={filters.manager} onChange={setFilter('manager')} options={options?.managers ?? []} placeholder="Todos" emptyOptionLabel="Todos" matchTriggerWidth />
                </FilterField>
                <FilterField label="Vencimento de">
                  <DatePickerField value={filters.dueFrom} onChange={setFilter('dueFrom')} placeholder="dd/mm/aaaa" aria-label="Vencimento a partir de" />
                </FilterField>
                <FilterField label="Vencimento até">
                  <DatePickerField value={filters.dueTo} onChange={setFilter('dueTo')} placeholder="dd/mm/aaaa" aria-label="Vencimento até" />
                </FilterField>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <Loading message="Carregando indicadores..." size="lg" />
        ) : isError || !data ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-gray-700 dark:text-gray-300">Não foi possível carregar os indicadores.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard icon={CalendarRange} title="Valor por mês de vencimento" subtitle="Pago, à vencer e vencido" className="lg:col-span-2">
              <MonthlyChart data={data.byMonth} />
            </ChartCard>

            <ChartCard icon={CalendarRange} title="Resumo mensal por polo" subtitle="Valor e quantidade por mês de vencimento" className="lg:col-span-2">
              <MonthlySummaryTable rows={data.byMonthPolo ?? []} polos={data.byPolo.map((p) => p.label)} />
            </ChartCard>

            <ChartCard icon={CreditCard} title="Total por tipo de pagamento" subtitle="Classificado pela condição de pagamento" className="lg:col-span-2">
              <PaymentTypeBlock data={data.byPaymentType ?? []} />
            </ChartCard>

            <ChartCard icon={ReceiptText} title="Principais condições de pagamento" subtitle="8 maiores por valor" className="lg:col-span-2">
              <ConditionBlock data={data.byCondition ?? []} total={data.totals.all.value} />
            </ChartCard>

            <ChartCard icon={Banknote} title="Valor por polo" subtitle="Distribuição do valor total">
              <DonutChart data={data.byPolo} icon={Banknote} />
            </ChartCard>

            <ChartCard icon={UserCog} title="Valor por gestor" subtitle="Centros de custo agrupados pelo gestor do contrato">
              <RankBarChart data={data.byManager} icon={UserCog} />
            </ChartCard>

            <ChartCard icon={Wallet} title="Valor por centro de custo" subtitle="10 maiores">
              <RankBarChart data={data.byCostCenter.slice(0, 10)} icon={Wallet} color="#1e40af" />
            </ChartCard>

            <ChartCard icon={Truck} title="Valor por fornecedor" subtitle="10 maiores">
              <RankBarChart data={data.bySupplier.slice(0, 10)} icon={Truck} color="#0f766e" />
            </ChartCard>

            <ChartCard icon={Wallet} title="Todos os centros de custo" subtitle="Total no período, com % do período" className="lg:col-span-2">
              <CostCenterTable data={data.byCostCenter} total={data.totals.all.value} />
            </ChartCard>
          </div>
        )}
      </PageStack>
    </MainLayout>
  );
}

export default function DashboardBoletosRoute() {
  return (
    <ProtectedRoute route="/ponto/financeiro/dashboard-boletos">
      <DashboardBoletosPage />
    </ProtectedRoute>
  );
}
