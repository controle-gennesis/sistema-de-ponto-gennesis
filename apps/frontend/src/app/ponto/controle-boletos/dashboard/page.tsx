'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
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
  Gauge,
  ReceiptText,
  FileSpreadsheet,
  FileText,
  Filter,
  FilterX,
  Loader2,
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
import toast from 'react-hot-toast';
import { exportDashboardExcel, exportDashboardPdf, type ExportFilterLine } from '@/lib/boletoDashboardExport';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import {
  BAR_STAGGER_MS,
  CountUpLabel,
  type ChartLabelProps,
  FadeInTopLabel,
  growingBarShape,
  growingColumnShape,
  rowInStyle,
  useAnimatedNumber,
} from '@/lib/chartAnimation';

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

type Filters = { polo: string; costCenter: string; manager: string; status: string; dueFrom: string; dueTo: string };
const EMPTY_FILTERS: Filters = { polo: '', costCenter: '', manager: '', status: '', dueFrom: '', dueTo: '' };

/** Situação do boleto (valor enviado ao servidor + rótulo na tela). */
const STATUS_OPTIONS = [
  { value: 'PAGO', label: 'Pago' },
  { value: 'A_VENCER', label: 'À vencer' },
  { value: 'VENCIDO', label: 'Vencido' },
];

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

/** Tooltip clara (fundo branco), igual à dos gráficos da página de contrato. */
function ChartLightTooltip({
  active,
  label,
  rows,
}: {
  active?: boolean;
  label?: React.ReactNode;
  rows: Array<{ key: string; name: string; value: string; color: string }>;
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="min-w-[168px] rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-gray-900 shadow-lg">
      <p className="mb-2 text-xs font-medium text-gray-500">{label}</p>
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-2 text-xs text-gray-500">
            <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
            {row.name}
          </span>
          <span className="text-xs font-semibold tabular-nums text-gray-900">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Degradês das barras (um por cor), como nos gráficos de contrato. */
function BarGradients({ idPrefix, colors, horizontal = false }: { idPrefix: string; colors: string[]; horizontal?: boolean }) {
  return (
    <defs>
      {colors.map((c, i) => (
        <linearGradient key={`${c}-${i}`} id={`${idPrefix}-${i}`} x1="0" y1="0" x2={horizontal ? 1 : 0} y2={horizontal ? 0 : 1}>
          <stop offset="0%" stopColor={c} stopOpacity={horizontal ? 0.6 : 0.95} />
          <stop offset="100%" stopColor={c} stopOpacity={horizontal ? 1 : 0.55} />
        </linearGradient>
      ))}
    </defs>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
  iconBg = 'bg-red-100 dark:bg-red-900/30',
  iconColor = 'text-red-600 dark:text-red-400',
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className={cadastroListClasses.cardHeaderIconRow}>
      <div className={`shrink-0 rounded-lg p-2 sm:p-3 ${iconBg}`}>
        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} aria-hidden />
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
  iconBg,
  iconColor,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col ${className || ''}`}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <SectionTitle icon={icon} title={title} subtitle={subtitle} iconBg={iconBg} iconColor={iconColor} />
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
  const uid = React.useId().replace(/:/g, '');
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
          <BarGradients idPrefix={`rk-${uid}`} colors={data.map((d, i) => color ?? CHART_PALETTE[i % CHART_PALETTE.length])} horizontal />
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
            cursor={{ fill: theme.barCursor, radius: 8 }}
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as Bucket | undefined;
              return (
                <ChartLightTooltip
                  active={active}
                  label={b?.label}
                  rows={b ? [{ key: 'v', name: `Total · ${b.count} boletos`, value: brl(b.value), color: String(payload?.[0]?.color || '#64748b') }] : []}
                />
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} isAnimationActive={false} shape={growingBarShape('value')}>
            {data.map((d, i) => (
              <Cell key={d.key} fill={`url(#rk-${uid}-${i})`} />
            ))}
            <LabelList
              dataKey="value"
              content={(labelProps) => (
                <CountUpLabel {...(labelProps as unknown as ChartLabelProps)} color={theme.chartLabel} format={brlCompact} />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DonutChart({ data, icon }: { data: Bucket[]; icon: LucideIcon }) {
  const theme = useChartTheme();
  const total = data.reduce((s, d) => s + d.value, 0);
  const totalShown = useAnimatedNumber(total, 0, 1100);
  const [hover, setHover] = useState<number | null>(null);
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
              animationDuration={1100}
              animationEasing="ease-out"
              onMouseEnter={(_, i) => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} fillOpacity={hover === null || hover === slices.indexOf(s) ? 1 : 0.45} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="max-w-[80px] truncate text-base font-bold leading-none tabular-nums text-gray-900 dark:text-gray-100">
            {hover !== null && slices[hover] ? brlCompact(slices[hover].value) : brlCompact(totalShown)}
          </span>
          <span className="mt-1 max-w-[80px] truncate text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {hover !== null && slices[hover] ? slices[hover].label : "Total"}
          </span>
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
  const uid = React.useId().replace(/:/g, '');
  if (!data.length) return <ChartEmpty icon={CalendarRange} />;
  const rows = data.map((d) => ({ ...d, mes: monthLabel(d.key) }));
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
          <BarGradients idPrefix={`mo-${uid}`} colors={[STATUS_COLORS.pago, STATUS_COLORS.aVencer, STATUS_COLORS.vencido]} />
          <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: theme.chartTick, fontSize: 11 }} interval={0} angle={rows.length > 14 ? -45 : 0} textAnchor={rows.length > 14 ? 'end' : 'middle'} height={rows.length > 14 ? 48 : 28} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.chartTick, fontSize: 11 }} tickFormatter={(v) => brlCompact(Number(v))} />
          <Tooltip
            cursor={{ fill: theme.barCursor, radius: 8 }}
            content={({ active, label, payload }) => (
              <ChartLightTooltip
                active={active}
                label={label}
                rows={(payload ?? []).map((e) => ({
                  key: String(e.dataKey),
                  name: String(e.name),
                  value: brl(Number(e.value) || 0),
                  color: STATUS_COLORS[String(e.dataKey) as keyof typeof STATUS_COLORS] ?? '#64748b',
                }))}
              />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="pago" name="Pago" stackId="s" fill={`url(#mo-${uid}-0)`} isAnimationActive={false} shape={growingColumnShape('pago', 0)} />
          <Bar dataKey="aVencer" name="À vencer" stackId="s" fill={`url(#mo-${uid}-1)`} isAnimationActive={false} shape={growingColumnShape('aVencer', 0)} />
          <Bar dataKey="vencido" name="Vencido" stackId="s" fill={`url(#mo-${uid}-2)`} radius={[4, 4, 0, 0]} isAnimationActive={false} shape={growingColumnShape('vencido', 4)} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PaymentTypeBlock({ data }: { data: Bucket[] }) {
  const theme = useChartTheme();
  const uid = React.useId().replace(/:/g, '');
  const total = data.reduce((s, d) => s + d.value, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  if (!totalCount) return <ChartEmpty icon={CreditCard} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
            <BarGradients idPrefix={`pt-${uid}`} colors={data.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length])} />
            <CartesianGrid strokeDasharray="4 6" stroke={theme.chartGrid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: theme.chartTick, fontSize: 10 }} interval={0} tickFormatter={(v: string) => truncate(v, 14)} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.chartTick, fontSize: 11 }} tickFormatter={(v) => brlCompact(Number(v))} />
            <Tooltip
              cursor={{ fill: theme.barCursor, radius: 8 }}
              content={({ active, label, payload }) => (
                <ChartLightTooltip
                  active={active}
                  label={label}
                  rows={(payload ?? []).map((e) => ({ key: 'v', name: 'Valor', value: brl(Number(e.value) || 0), color: String(e.color || '#64748b') }))}
                />
              )}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false} shape={growingColumnShape('value', 6)}>
              {data.map((d, i) => (
                <Cell key={d.key} fill={`url(#pt-${uid}-${i})`} />
              ))}
              <LabelList
                dataKey="value"
                content={(labelProps) => (
                  <FadeInTopLabel {...(labelProps as unknown as ChartLabelProps)} color={theme.chartLabel} format={brlCompact} />
                )}
              />
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
            {data.map((d, rowIndex) => (
              <tr key={d.key} className="chart-row-in text-xs text-gray-900 dark:text-gray-100" style={rowInStyle(rowIndex)}>
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
  const uid = React.useId().replace(/:/g, '');
  if (!data.length) return <ChartEmpty icon={ReceiptText} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 8, bottom: 4, left: 4 }} barCategoryGap="22%">
            <BarGradients idPrefix={`cd-${uid}`} colors={['#0f766e']} />
            <CartesianGrid strokeDasharray="4 6" stroke={theme.chartGrid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: theme.chartTick, fontSize: 10 }} interval={0} tickFormatter={(v: string) => truncate(v, 12)} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fill: theme.chartTick, fontSize: 11 }} tickFormatter={(v) => brlCompact(Number(v))} />
            <Tooltip
              cursor={{ fill: theme.barCursor, radius: 8 }}
              content={({ active, label, payload }) => (
                <ChartLightTooltip
                  active={active}
                  label={label}
                  rows={(payload ?? []).map((e) => ({ key: 'v', name: 'Valor', value: brl(Number(e.value) || 0), color: '#0f766e' }))}
                />
              )}
            />
            <Bar dataKey="value" fill={`url(#cd-${uid}-0)`}radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false} shape={growingColumnShape('value', 6)}>
              <LabelList
                dataKey="value"
                content={(labelProps) => (
                  <FadeInTopLabel
                    {...(labelProps as unknown as ChartLabelProps)}
                    color={theme.chartLabel}
                    fontSize={10}
                    format={brlCompact}
                  />
                )}
              />
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
            {data.map((d, rowIndex) => (
              <tr key={d.key} className="chart-row-in text-xs text-gray-900 dark:text-gray-100" style={rowInStyle(rowIndex)}>
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
          {rows.map((r, rowIndex) => {
            const l = line(r);
            return (
              <tr key={r.key} className="chart-row-in text-xs text-gray-900 dark:text-gray-100" style={rowInStyle(rowIndex)}>
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
          {data.map((d, rowIndex) => (
            <tr key={d.key} className="chart-row-in text-xs text-gray-900 dark:text-gray-100" style={rowInStyle(rowIndex)}>
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

/** Destaque do topo: total em boletos e evolução por mês de vencimento (mesmo desenho do Faturamento de contrato). */
function TotalAreaCard({ total, paidPct, byMonth }: { total: number; paidPct: number; byMonth: Bucket[] }) {
  const theme = useChartTheme();
  const { isDark } = useTheme();
  const uid = React.useId().replace(/:/g, '');
  const totalShown = useAnimatedNumber(total, 0, 1200);
  const stroke = '#60a5fa';
  const series = byMonth.filter((b) => b.key !== 'sem-data').map((b) => ({ mes: monthLabel(b.key), value: b.value, pago: b.pago }));
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-5`}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">Total em boletos</h3>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-gray-50 sm:text-3xl">{brl(totalShown)}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden />
              {paidPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% pago
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">por mês de vencimento</span>
          </div>
        </div>
        <div className="mt-5 h-[240px] w-full min-w-0">
          {series.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 12, right: 10, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id={`tot-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                    <stop offset="75%" stopColor={stroke} stopOpacity={0.06} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: theme.chartTick }} interval="preserveStartEnd" minTickGap={14} axisLine={false} tickLine={false} tickMargin={8} />
                <YAxis tick={{ fontSize: 11, fill: theme.chartTick }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => brlCompact(Number(v) || 0)} domain={[0, (max: number) => Math.max(Number(max) || 0, 1)]} />
                <Tooltip
                  cursor={{ stroke: isDark ? '#6b7280' : '#cbd5e1', strokeDasharray: '4 4', strokeWidth: 1 }}
                  content={({ active, label, payload }) => (
                    <ChartLightTooltip
                      active={active}
                      label={label}
                      rows={(payload ?? []).map((e) => ({ key: 'v', name: 'Valor no mês', value: brl(Number(e.value) || 0), color: stroke }))}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={stroke}
                  strokeWidth={2.75}
                  fill={`url(#tot-${uid})`}
                  dot={false}
                  animationDuration={1300}
                  animationEasing="ease-out"
                  activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? '#1f2937' : '#fff', fill: stroke }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty icon={CalendarRange} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Semicírculo com a parte já paga do total (visual do card Progresso de contrato). */
function PaidGaugeCard({ paid, total }: { paid: number; total: number }) {
  const { isDark } = useTheme();
  const uid = React.useId().replace(/:/g, '');
  const target = total > 0 ? Math.max(0, Math.min(100, (paid / total) * 100)) : 0;
  const pct = useAnimatedNumber(target, 0, 1200);
  const open = Math.max(0, total - paid);
  const track = isDark ? '#374151' : '#e5e7eb';
  const hatch = isDark ? '#6b7280' : '#cbd5e1';
  const pendingLen = Math.max(0, 100 - pct);
  const arc = 'M 28 100 A 72 72 0 0 1 172 100';
  return (
    <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <SectionTitle icon={Gauge} title="Progresso" iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" />
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-1`}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="mx-auto w-full max-w-[220px]">
            <svg viewBox="0 12 200 112" className="h-auto w-full" role="img" aria-label={`${Math.round(pct)}% pago`}>
              <defs>
                <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(42)">
                  <rect width="6" height="6" fill={track} />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={hatch} strokeWidth="2.4" />
                </pattern>
              </defs>
              <path d={arc} fill="none" stroke={track} strokeWidth="32" strokeLinecap="butt" pathLength={100} />
              {pendingLen > 0.4 ? (
                <path d={arc} fill="none" stroke={`url(#hatch-${uid})`} strokeWidth="32" strokeLinecap="round" pathLength={100} strokeDasharray={`${pendingLen} 1000`} strokeDashoffset={-pct} />
              ) : null}
              {pct > 0.4 ? (
                <path d={arc} fill="none" stroke="#16a34a" strokeWidth="32" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 1000`} />
              ) : null}
              <text x="100" y="80" textAnchor="middle" fill={isDark ? '#f9fafb' : '#111827'} style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>
                {Math.round(pct)}%
              </text>
              <text x="100" y="98" textAnchor="middle" fill="#9ca3af" style={{ fontSize: 10 }}>
                pago
              </text>
            </svg>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-emerald-50/80 px-3 py-2.5 dark:bg-emerald-900/20">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Pago</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">{brl(paid)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Em aberto</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{brl(open)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Cartão de indicador cujo valor e quantidade sobem até o total, um cartão depois do outro. */
function AnimatedKpiCard({
  index,
  label,
  value,
  count,
  isAverage,
  icon,
  iconBg,
  iconColor,
  loading,
}: {
  index: number;
  label: string;
  value: number;
  count: number;
  isAverage: boolean;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  loading: boolean;
}) {
  const valueShown = useAnimatedNumber(value, index * BAR_STAGGER_MS, 1000);
  const countShown = Math.round(useAnimatedNumber(count, index * BAR_STAGGER_MS, 1000));
  return (
    <FilterStatCard
      label={label}
      count={brl(valueShown)}
      subtitle={isAverage ? 'média por boleto' : `${countShown.toLocaleString('pt-BR')} ${count === 1 ? 'boleto' : 'boletos'}`}
      icon={icon}
      iconBg={iconBg}
      iconColor={iconColor}
      loading={loading}
    />
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

  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  /** Exporta os indicadores que estão na tela (já com os filtros aplicados). */
  const handleExport = async (kind: 'excel' | 'pdf') => {
    if (!data) return;
    const lines: ExportFilterLine[] = [];
    if (filters.polo) lines.push({ label: 'Polo', value: filters.polo });
    if (filters.costCenter) lines.push({ label: 'Centro de custo', value: filters.costCenter });
    if (filters.manager) lines.push({ label: 'Gestor', value: filters.manager });
    if (filters.status) {
      lines.push({ label: 'Situação', value: STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? filters.status });
    }
    if (filters.dueFrom) lines.push({ label: 'Vencimento de', value: filters.dueFrom });
    if (filters.dueTo) lines.push({ label: 'Vencimento até', value: filters.dueTo });
    setExporting(kind);
    try {
      if (kind === 'excel') await exportDashboardExcel(data, lines);
      else await exportDashboardPdf(data, lines);
    } catch {
      toast.error('Não foi possível exportar. Tente novamente.');
    } finally {
      setExporting(null);
    }
  };

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
    { key: 'aberto', label: 'Em aberto', count: (t?.A_VENCER.count ?? 0) + (t?.VENCIDO.count ?? 0), value: (t?.A_VENCER.value ?? 0) + (t?.VENCIDO.value ?? 0), Icon: Wallet, bg: 'bg-blue-100 dark:bg-blue-900/30', color: 'text-blue-600 dark:text-blue-300' },
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

        {!isError ? (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
            <div className="h-full lg:col-span-2">
              <TotalAreaCard
                total={t?.all.value ?? 0}
                paidPct={t && t.all.value > 0 ? (t.PAGO.value / t.all.value) * 100 : 0}
                byMonth={data?.byMonth ?? []}
              />
            </div>
            <PaidGaugeCard paid={t?.PAGO.value ?? 0} total={t?.all.value ?? 0} />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {kpis.map((k, i) => (
            <AnimatedKpiCard
              key={k.key}
              index={i}
              label={k.label}
              value={k.value}
              count={k.count}
              isAverage={k.key === 'media'}
              icon={k.Icon}
              iconBg={k.bg}
              iconColor={k.color}
              loading={isLoading}
            />
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleExport('excel')}
            disabled={!data || exporting !== null}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            title="Exportar os indicadores filtrados para Excel"
          >
            {exporting === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            type="button"
            onClick={() => void handleExport('pdf')}
            disabled={!data || exporting !== null}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            title="Exportar os indicadores filtrados para PDF"
          >
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span className="hidden sm:inline">PDF</span>
          </button>
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
                <SectionTitle icon={ListFilter} title="Filtros" subtitle="Recorte os indicadores por polo, centro de custo, gestor, situação e período de vencimento" />
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <FilterField label="Polo">
                  <StringSingleSelectDropdown value={filters.polo} onChange={setFilter('polo')} options={options?.polos ?? []} placeholder="Todos" emptyOptionLabel="Todos" matchTriggerWidth />
                </FilterField>
                <FilterField label="Centro de custo">
                  <StringSingleSelectDropdown value={filters.costCenter} onChange={setFilter('costCenter')} options={options?.costCenters ?? []} placeholder="Todos" emptyOptionLabel="Todos" matchTriggerWidth />
                </FilterField>
                <FilterField label="Gestor">
                  <StringSingleSelectDropdown value={filters.manager} onChange={setFilter('manager')} options={options?.managers ?? []} placeholder="Todos" emptyOptionLabel="Todos" matchTriggerWidth />
                </FilterField>
                <FilterField label="Situação">
                  <StringSingleSelectDropdown value={filters.status} onChange={setFilter('status')} options={STATUS_OPTIONS} placeholder="Todas" emptyOptionLabel="Todas" matchTriggerWidth />
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
            <ChartCard icon={CalendarRange} title="Valor por mês de vencimento" iconBg="bg-sky-100 dark:bg-sky-900/30" iconColor="text-sky-600 dark:text-sky-400" subtitle="Pago, à vencer e vencido" className="lg:col-span-2">
              <MonthlyChart data={data.byMonth} />
            </ChartCard>

            <ChartCard icon={CalendarRange} title="Resumo mensal por polo" iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600 dark:text-violet-400" subtitle="Valor e quantidade por mês de vencimento" className="lg:col-span-2">
              <MonthlySummaryTable rows={data.byMonthPolo ?? []} polos={data.byPolo.map((p) => p.label)} />
            </ChartCard>

            <ChartCard icon={CreditCard} title="Total por tipo de pagamento" iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400" subtitle="Classificado pela condição de pagamento" className="lg:col-span-2">
              <PaymentTypeBlock data={data.byPaymentType ?? []} />
            </ChartCard>

            <ChartCard icon={ReceiptText} title="Principais condições de pagamento" iconBg="bg-teal-100 dark:bg-teal-900/30" iconColor="text-teal-600 dark:text-teal-400" subtitle="8 maiores por valor" className="lg:col-span-2">
              <ConditionBlock data={data.byCondition ?? []} total={data.totals.all.value} />
            </ChartCard>

            <ChartCard icon={Banknote} title="Valor por polo" iconBg="bg-rose-100 dark:bg-rose-900/30" iconColor="text-rose-600 dark:text-rose-400" subtitle="Distribuição do valor total">
              <DonutChart data={data.byPolo} icon={Banknote} />
            </ChartCard>

            <ChartCard icon={UserCog} title="Valor por gestor" iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600 dark:text-violet-400" subtitle="Centros de custo agrupados pelo gestor do contrato">
              <RankBarChart data={data.byManager} icon={UserCog} />
            </ChartCard>

            <ChartCard icon={Wallet} title="Valor por centro de custo" iconBg="bg-indigo-100 dark:bg-indigo-900/30" iconColor="text-indigo-600 dark:text-indigo-400" subtitle="10 maiores">
              <RankBarChart data={data.byCostCenter.slice(0, 10)} icon={Wallet} color="#1e40af" />
            </ChartCard>

            <ChartCard icon={Truck} title="Valor por fornecedor" iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" subtitle="10 maiores">
              <RankBarChart data={data.bySupplier.slice(0, 10)} icon={Truck} color="#0f766e" />
            </ChartCard>

            <ChartCard icon={Wallet} title="Todos os centros de custo" iconBg="bg-sky-100 dark:bg-sky-900/30" iconColor="text-sky-600 dark:text-sky-400" subtitle="Total no período, com % do período" className="lg:col-span-2">
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
    <ProtectedRoute route="/ponto/controle-boletos/dashboard">
      <DashboardBoletosPage />
    </ProtectedRoute>
  );
}
