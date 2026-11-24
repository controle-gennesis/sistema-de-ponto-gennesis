'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
  type ChartLabelProps,
  FadeInTopLabel,
  growingColumnShape,
  rowInStyle,
  prefersReducedMotion,
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
const STATUS_COLORS = { pago: '#34d399', aVencer: '#f59e0b', vencido: '#f87171' };
/** Azul das barras, o mesmo do gráfico de Faturamento das páginas de contrato. */
const SERIES_BLUE = '#60a5fa';

/** Valores curtos nos eixos e rótulos das barras: 233K, 2,2M. */
function compactAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
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

/** Bolinha + nome da série, no canto do cartão (como em Faturamento por Mês x Meta). */
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> {label}
    </span>
  );
}

function ChartCard({
  title,
  subtitle,
  legend,
  className,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  legend?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col ${className || ''}`}>
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
          {legend ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">{legend}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>{children}</CardContent>
    </Card>
  );
}

function ChartEmpty({ icon }: { icon: LucideIcon }) {
  return <CadastroListEmpty icon={icon} hint="Ajuste os filtros para ver os dados" title="Sem dados no filtro atual" />;
}

/** Colunas empilhadas por mês de vencimento: pago / à vencer / vencido. */
function MonthlyChart({ data }: { data: Bucket[] }) {
  const theme = useChartTheme();
  if (!data.length) return <ChartEmpty icon={CalendarRange} />;
  const rows = data.map((d) => ({ ...d, mes: monthLabel(d.key) }));
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 22, right: 10, bottom: 4, left: 0 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="4 6" stroke={theme.chartGrid} vertical={false} />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={6} tick={{ fill: theme.chartTick, fontSize: 11, fontWeight: 500 }} interval={0} angle={rows.length > 14 ? -45 : 0} textAnchor={rows.length > 14 ? 'end' : 'middle'} height={rows.length > 14 ? 48 : 28} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: theme.chartTick, fontSize: 10 }} tickFormatter={(v) => compactAxis(Number(v))} />
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
          <Bar dataKey="pago" name="Pago" stackId="s" fill={STATUS_COLORS.pago} maxBarSize={44} isAnimationActive={false} shape={growingColumnShape('pago', 0)} />
          <Bar dataKey="aVencer" name="À vencer" stackId="s" fill={STATUS_COLORS.aVencer} maxBarSize={44} isAnimationActive={false} shape={growingColumnShape('aVencer', 0)} />
          <Bar dataKey="vencido" name="Vencido" stackId="s" fill={STATUS_COLORS.vencido} maxBarSize={44} isAnimationActive={false} shape={growingColumnShape('vencido', 6)}>
            <LabelList
              dataKey="vencido"
              content={(labelProps) => {
                const lp = labelProps as unknown as ChartLabelProps;
                const total = rows[Number(lp.index ?? 0)]?.value ?? 0;
                return <FadeInTopLabel {...lp} value={total} color={theme.chartLabel} fontSize={11} format={compactAxis} />;
              }}
            />
          </Bar>
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
          <BarChart data={data} margin={{ top: 22, right: 10, bottom: 4, left: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="4 6" stroke={theme.chartGrid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={{ fill: theme.chartTick, fontSize: 11, fontWeight: 500 }} interval={0} tickFormatter={(v: string) => truncate(v, 14)} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: theme.chartTick, fontSize: 10 }} tickFormatter={(v) => compactAxis(Number(v))} />
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
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false} shape={growingColumnShape('value', 6)}>
              {data.map((d) => (
                <Cell key={d.key} fill={SERIES_BLUE} />
              ))}
              <LabelList
                dataKey="value"
                content={(labelProps) => (
                  <FadeInTopLabel {...(labelProps as unknown as ChartLabelProps)} color={theme.chartLabel} fontSize={11} format={compactAxis} />
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
  if (!data.length) return <ChartEmpty icon={ReceiptText} />;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 10, bottom: 4, left: 0 }} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="4 6" stroke={theme.chartGrid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} tick={{ fill: theme.chartTick, fontSize: 11, fontWeight: 500 }} interval={0} tickFormatter={(v: string) => truncate(v, 12)} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: theme.chartTick, fontSize: 10 }} tickFormatter={(v) => compactAxis(Number(v))} />
            <Tooltip
              cursor={{ fill: theme.barCursor, radius: 8 }}
              content={({ active, label, payload }) => (
                <ChartLightTooltip
                  active={active}
                  label={label}
                  rows={(payload ?? []).map((e) => ({ key: 'v', name: 'Valor', value: brl(Number(e.value) || 0), color: SERIES_BLUE }))}
                />
              )}
            />
            <Bar dataKey="value" fill={SERIES_BLUE} radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={false} shape={growingColumnShape('value', 6)}>
              <LabelList
                dataKey="value"
                content={(labelProps) => (
                  <FadeInTopLabel
                    {...(labelProps as unknown as ChartLabelProps)}
                    color={theme.chartLabel}
                    fontSize={11}
                    format={compactAxis}
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
        <SectionTitle icon={Gauge} title="Progresso" />
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

/** Cartão de módulo (como Orçamentos / Cronogramas / Diários de Obra do contrato). */
function ModuleCard({
  icon,
  iconBg,
  iconColor,
  title,
  children,
  footerLeft,
  footerHref,
  footerLabel = 'Ver detalhes',
  className,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerHref?: string;
  footerLabel?: string;
  className?: string;
}) {
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col ${className || ''}`}>
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <SectionTitle icon={icon} title={title} iconBg={iconBg} iconColor={iconColor} />
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col gap-4`}>
        <div className="flex-1 space-y-4">{children}</div>
        {footerLeft || footerHref ? (
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3 text-xs dark:border-gray-700">
            <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">{footerLeft}</span>
            {footerHref ? (
              <Link href={footerHref} className="shrink-0 font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                {footerLabel} ›
              </Link>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Bloco colorido com número (verde, amarelo, vermelho ou azul), como os do cartão de Orçamentos. */
function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'green' | 'amber' | 'red' | 'blue' }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  } as const;
  return (
    <div className={`rounded-xl px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-[11px] font-medium opacity-90">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] opacity-80">{sub}</p> : null}
    </div>
  );
}

/** Faixa de aviso (verde quando está tudo certo, vermelha ou amarela quando precisa de atenção). */
function NoticeBar({ tone, children }: { tone: 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
  } as const;
  return <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${tones[tone]}`}>{children}</div>;
}

/** Lista com barra fina de progresso: rótulo à esquerda, valor à direita (como Faturamento estimado / Custo estimado). */
function RankProgressList({
  data,
  icon,
  showPercent = false,
  color = SERIES_BLUE,
  getValue = (b: Bucket) => b.value,
}: {
  data: Bucket[];
  icon: LucideIcon;
  showPercent?: boolean;
  color?: string;
  getValue?: (b: Bucket) => number;
}) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setOn(true);
      return;
    }
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const rows = data.filter((b) => getValue(b) > 0);
  if (!rows.length) return <ChartEmpty icon={icon} />;
  const max = Math.max(...rows.map(getValue), 1);
  const sum = rows.reduce((acc, b) => acc + getValue(b), 0);
  return (
    <ul className="space-y-3.5">
      {rows.map((b, i) => {
        const v = getValue(b);
        return (
          <li key={b.key}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-300" title={b.label}>
                {b.label}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {brl(v)}
                {showPercent && sum > 0 ? (
                  <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">{(Math.round((v / sum) * 1000) / 10).toLocaleString('pt-BR')}%</span>
                ) : null}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/70">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{ width: on ? `${Math.max(2, (v / max) * 100)}%` : '0%', backgroundColor: color, transitionDelay: `${Math.min(i, 12) * 60}ms` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
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
  ];

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
        <ListPageHeader
          title="Dashboard de Boletos"
          description="Indicadores de pagos, à vencer e vencidos por polo, gestor, centro de custo e mês de vencimento"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard
              title="Valor por mês de vencimento"
              subtitle={
                <>
                  Boletos de cada mês de vencimento, somando <strong className="text-gray-800 dark:text-gray-100">{brlCompact(data.totals.all.value)}</strong> em{' '}
                  <strong className="text-gray-800 dark:text-gray-100">{data.byMonth.length}</strong> {data.byMonth.length === 1 ? 'mês' : 'meses'}.
                </>
              }
              legend={
                <>
                  <LegendDot color={STATUS_COLORS.pago} label="Pago" />
                  <LegendDot color={STATUS_COLORS.aVencer} label="À vencer" />
                  <LegendDot color={STATUS_COLORS.vencido} label="Vencido" />
                </>
              }
              className="lg:col-span-3"
            >
              <MonthlyChart data={data.byMonth} />
            </ChartCard>

            <ModuleCard
              icon={Wallet}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              title="Situação dos boletos"
              footerLeft={`Valor médio: ${brl(data.totals.all.count ? data.totals.all.value / data.totals.all.count : 0)}`}
              footerHref="/ponto/controle-boletos"
              footerLabel="Ver boletos"
            >
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Valor total</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">{brl(data.totals.all.value)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{data.totals.all.count.toLocaleString('pt-BR')} boletos</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <StatTile tone="green" label="Pagos" value={brlCompact(data.totals.PAGO.value)} sub={`${data.totals.PAGO.count.toLocaleString('pt-BR')} boletos`} />
                <StatTile tone="amber" label="À vencer" value={brlCompact(data.totals.A_VENCER.value)} sub={`${data.totals.A_VENCER.count.toLocaleString('pt-BR')} boletos`} />
                <StatTile tone="red" label="Vencidos" value={brlCompact(data.totals.VENCIDO.value)} sub={`${data.totals.VENCIDO.count.toLocaleString('pt-BR')} boletos`} />
                <StatTile
                  tone="blue"
                  label="Em aberto"
                  value={brlCompact(data.totals.A_VENCER.value + data.totals.VENCIDO.value)}
                  sub={`${(data.totals.A_VENCER.count + data.totals.VENCIDO.count).toLocaleString('pt-BR')} boletos`}
                />
              </div>
            </ModuleCard>

            <ModuleCard
              icon={AlertTriangle}
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
              title="Vencidos"
              footerLeft="Quem concentra os vencidos"
              footerHref="/ponto/controle-boletos"
              footerLabel="Ver na lista"
            >
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Valor vencido</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">{brl(data.totals.VENCIDO.value)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{data.totals.VENCIDO.count.toLocaleString('pt-BR')} boletos</p>
              </div>
              {data.totals.VENCIDO.count === 0 ? (
                <NoticeBar tone="green">Nenhum boleto vencido</NoticeBar>
              ) : (
                <NoticeBar tone="red">
                  {data.totals.VENCIDO.count.toLocaleString('pt-BR')} {data.totals.VENCIDO.count === 1 ? 'boleto vencido' : 'boletos vencidos'}
                </NoticeBar>
              )}
              <RankProgressList data={[...data.byCostCenter].sort((x, y) => y.vencido - x.vencido).slice(0, 4)} icon={AlertTriangle} color={STATUS_COLORS.vencido} getValue={(b) => b.vencido} />
            </ModuleCard>

            <ModuleCard
              icon={CalendarClock}
              iconBg="bg-purple-100 dark:bg-purple-900/30"
              iconColor="text-purple-600 dark:text-purple-400"
              title="Próximos 30 dias"
              footerLeft="Boletos que vencem em até 30 dias"
              footerHref="/ponto/controle-boletos"
              footerLabel="Ver na lista"
            >
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Valor a vencer</p>
                <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">{brl(data.next30.value)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{data.next30.count.toLocaleString('pt-BR')} boletos</p>
              </div>
              {data.next30.count === 0 ? (
                <NoticeBar tone="green">Nada vencendo nos próximos 30 dias</NoticeBar>
              ) : (
                <NoticeBar tone="amber">{data.next30.count.toLocaleString('pt-BR')} {data.next30.count === 1 ? 'boleto vence' : 'boletos vencem'} em até 30 dias</NoticeBar>
              )}
              <RankProgressList data={[...data.byCostCenter].sort((x, y) => y.aVencer - x.aVencer).slice(0, 4)} icon={CalendarClock} color={STATUS_COLORS.aVencer} getValue={(b) => b.aVencer} />
            </ModuleCard>

            <ModuleCard icon={Banknote} iconBg="bg-rose-100 dark:bg-rose-900/30" iconColor="text-rose-600 dark:text-rose-400" title="Valor por polo">
              <RankProgressList data={data.byPolo} icon={Banknote} showPercent />
            </ModuleCard>

            <ModuleCard icon={UserCog} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600 dark:text-violet-400" title="Valor por gestor">
              <RankProgressList data={data.byManager} icon={UserCog} showPercent />
            </ModuleCard>

            <ModuleCard icon={Wallet} iconBg="bg-indigo-100 dark:bg-indigo-900/30" iconColor="text-indigo-600 dark:text-indigo-400" title="Centros de custo">
              <RankProgressList data={data.byCostCenter.slice(0, 8)} icon={Wallet} />
            </ModuleCard>

            <ModuleCard icon={Truck} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400" title="Fornecedores" className="lg:col-span-3">
              <RankProgressList data={data.bySupplier.slice(0, 10)} icon={Truck} />
            </ModuleCard>

            <ChartCard title="Resumo mensal por polo" subtitle="Valor e quantidade por mês de vencimento" className="lg:col-span-3">
              <MonthlySummaryTable rows={data.byMonthPolo ?? []} polos={data.byPolo.map((p) => p.label)} />
            </ChartCard>

            <ChartCard title="Total por tipo de pagamento" subtitle="Classificado pela condição de pagamento" className="lg:col-span-3">
              <PaymentTypeBlock data={data.byPaymentType ?? []} />
            </ChartCard>

            <ChartCard title="Principais condições de pagamento" subtitle="8 maiores por valor" className="lg:col-span-3">
              <ConditionBlock data={data.byCondition ?? []} total={data.totals.all.value} />
            </ChartCard>

            <ChartCard title="Todos os centros de custo" subtitle="Total no período, com % do período" className="lg:col-span-3">
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
