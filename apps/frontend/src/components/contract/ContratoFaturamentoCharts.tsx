'use client';

import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import { useTheme } from '@/context/ThemeContext';
import { formatCpfInput } from '@/lib/cpf';
import api from '@/lib/api';

export type ContratoFaturamentoInsightPoint = {
  label: string;
  atual: number;
  anterior: number;
};

export type ContratoFaturamentoBreakdownItem = {
  key: string;
  label: string;
  value: number;
  accentClass: string;
  barClass: string;
};

export type ContratoFaturamentoInsight = {
  total: number;
  previousTotal: number;
  comparisonLabel: string;
  series: ContratoFaturamentoInsightPoint[];
  breakdown: ContratoFaturamentoBreakdownItem[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}K`;
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function useChartTheme() {
  const { isDark } = useTheme();
  return {
    chartTick: isDark ? '#9ca3af' : '#6b7280',
    chartGrid: isDark ? '#374151' : '#e5e7eb',
  };
}

/** Tooltip clara (fundo branco) — mesma aparência em Faturamento e Meta vs realidade. */
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
            <span
              className="h-3 w-0.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            {row.name}
          </span>
          <span className="text-xs font-semibold tabular-nums text-gray-900">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function CardHeading({
  title,
  subtitle,
  extra,
  compact = false,
  tone = 'default',
}: {
  title: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  compact?: boolean;
  tone?: 'default' | 'brand';
}) {
  const isBrand = tone === 'brand';
  return (
    <CardHeader
      className={`${cadastroListClasses.cardHeader} ${compact ? '!pb-1 !pt-4' : '!pt-5'} ${
        subtitle ? '!pb-2' : ''
      }`}
    >
      <div className={cadastroListClasses.cardHeaderRow}>
        <div className="min-w-0">
          <h3
            className={`font-semibold ${
              isBrand ? 'text-white' : 'text-gray-900 dark:text-gray-100'
            } ${compact && !isBrand ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'}`}
          >
            {title}
          </h3>
          {subtitle ? <div className="mt-1.5">{subtitle}</div> : null}
        </div>
        {extra ? <div className={`${cadastroListClasses.cardToolbar} self-start`}>{extra}</div> : null}
      </div>
    </CardHeader>
  );
}

function ProgressoGaugeCard({
  title,
  billed,
  total,
}: {
  title: string;
  billed: number;
  total: number;
}) {
  const { isDark } = useTheme();
  const uid = React.useId().replace(/:/g, '');
  const billedSafe = Math.max(0, Number(billed) || 0);
  const totalSafe = Math.max(0, Number(total) || 0);
  const pending = Math.max(0, totalSafe - billedSafe);
  const pct = totalSafe > 0 ? Math.max(0, Math.min(100, (billedSafe / totalSafe) * 100)) : 0;
  const pctRounded = Math.round(pct);
  const track = isDark ? '#374151' : '#e5e7eb';
  const hatch = isDark ? '#6b7280' : '#cbd5e1';
  const billedColor = '#16a34a';
  const labelFill = isDark ? '#f9fafb' : '#111827';
  const hintFill = isDark ? '#9ca3af' : '#9ca3af';
  const pendingLen = Math.max(0, 100 - pct);

  return (
    <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
      <CardHeading title={title} />
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-1`}>
        {/* flex-1 + items-center: arco no meio do espaço entre título e blocos */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="mx-auto w-full max-w-[220px]">
            {/* viewBox apertado no visual do semicírculo (evita “peso” pra baixo) */}
            <svg
              viewBox="0 12 200 112"
              className="h-auto w-full"
              role="img"
              aria-label={`${title}: ${pctRounded}% faturado`}
            >
              <defs>
                <pattern
                  id={`hatch-${uid}`}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(42)"
                >
                  <rect width="6" height="6" fill={track} />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={hatch} strokeWidth="2.4" />
                </pattern>
              </defs>
              {/* Trilha sem caps — o padrão/hatch e o verde cobrem as pontas arredondadas */}
              <path
                d="M 28 100 A 72 72 0 0 1 172 100"
                fill="none"
                stroke={track}
                strokeWidth="32"
                strokeLinecap="butt"
                pathLength={100}
              />
              {pendingLen > 0.4 ? (
                <path
                  d="M 28 100 A 72 72 0 0 1 172 100"
                  fill="none"
                  stroke={`url(#hatch-${uid})`}
                  strokeWidth="32"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${pendingLen} 100`}
                  strokeDashoffset={-pct}
                />
              ) : null}
              {pct > 0.4 ? (
                <path
                  d="M 28 100 A 72 72 0 0 1 172 100"
                  fill="none"
                  stroke={billedColor}
                  strokeWidth="32"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${pct} ${100 - pct}`}
                />
              ) : null}
              {/* Caps hachurados nas pontas quando o pendente cobre as extremidades
                  (alguns browsers não pintam pattern em strokeLinecap=round). */}
              {pct < 0.4 && pendingLen > 0.4 ? (
                <circle cx="28" cy="100" r="16" fill={`url(#hatch-${uid})`} />
              ) : null}
              {pct + pendingLen > 99.6 && pendingLen > 0.4 ? (
                <circle cx="172" cy="100" r="16" fill={`url(#hatch-${uid})`} />
              ) : null}
              <text
                x="100"
                y="80"
                textAnchor="middle"
                fill={labelFill}
                style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}
              >
                {pctRounded}%
              </text>
              <text x="100" y="98" textAnchor="middle" fill={hintFill} style={{ fontSize: 10 }}>
                faturado
              </text>
            </svg>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-emerald-50/80 px-3 py-2.5 dark:bg-emerald-900/20">
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Faturado</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
              {formatCurrency(billedSafe)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Pendente</p>
            <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {formatCurrency(pending)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FaturamentoProfitCard({ insight }: { insight: ContratoFaturamentoInsight }) {
  const { isDark } = useTheme();
  const uid = React.useId().replace(/:/g, '');
  const deltaPct = useMemo(() => {
    if (insight.previousTotal === 0) {
      return insight.total > 0 ? 100 : 0;
    }
    return ((insight.total - insight.previousTotal) / Math.abs(insight.previousTotal)) * 100;
  }, [insight.total, insight.previousTotal]);
  const isUp = deltaPct >= 0;
  const deltaLabel = `${Math.abs(deltaPct).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })}%`;
  const atualStroke = '#60a5fa';
  const anteriorStroke = '#fb923c';
  const tickFill = isDark ? '#9ca3af' : '#94a3b8';

  return (
    <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-5`}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
              Faturamento
            </h3>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-gray-900 dark:text-gray-50 sm:text-3xl">
              {formatCurrency(insight.total)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isUp
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              }`}
            >
              {isUp ? (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden />
              )}
              {deltaLabel}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{insight.comparisonLabel}</span>
          </div>
        </div>

        <div className="mt-5 h-[180px] w-full min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={insight.series} margin={{ top: 12, right: 10, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id={`fat-atual-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={atualStroke} stopOpacity={0.28} />
                  <stop offset="75%" stopColor={atualStroke} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={atualStroke} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`fat-anterior-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={anteriorStroke} stopOpacity={0.22} />
                  <stop offset="75%" stopColor={anteriorStroke} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={anteriorStroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: tickFill }}
                interval="preserveStartEnd"
                minTickGap={14}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: tickFill }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => formatCurrencyCompact(Number(v) || 0)}
                domain={[0, (max: number) => Math.max(Number(max) || 0, 1)]}
              />
              <Tooltip
                cursor={{ stroke: isDark ? '#6b7280' : '#cbd5e1', strokeDasharray: '4 4', strokeWidth: 1 }}
                content={({ active, label, payload }) => (
                  <ChartLightTooltip
                    active={active}
                    label={label}
                    rows={(payload ?? []).map((entry) => {
                      const key = String(entry.dataKey);
                      const isAtual = key === 'atual';
                      return {
                        key,
                        name: isAtual ? 'Este período' : 'Período anterior',
                        value: formatCurrency(Number(entry.value) || 0),
                        color: isAtual ? atualStroke : anteriorStroke,
                      };
                    })}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="anterior"
                stroke={anteriorStroke}
                strokeWidth={2.5}
                fill={`url(#fat-anterior-${uid})`}
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: isDark ? '#1f2937' : '#fff',
                  fill: anteriorStroke,
                }}
              />
              <Area
                type="monotone"
                dataKey="atual"
                stroke={atualStroke}
                strokeWidth={2.75}
                fill={`url(#fat-atual-${uid})`}
                dot={false}
                activeDot={{
                  r: 5,
                  strokeWidth: 2,
                  stroke: isDark ? '#1f2937' : '#fff',
                  fill: atualStroke,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export type ContratoOsTotais = {
  totalOrcado: number;
  totalPleiteado: number;
  totalFaturado: number;
};

export type ContratoResumoPeriodoFatPendente = {
  periodLabel: string;
  faturado: number;
  pendente: number;
};

export type ContratoResumoMetaPoint = {
  label: string;
  metaIdeal: number;
  metaReal: number;
  faturado: number;
};

export type ContratoResumoMetaVsReal = {
  periodLabel: string;
  metaIdeal: number;
  metaReal: number;
  faturado: number;
  series: ContratoResumoMetaPoint[];
};

export type ContratoResumoProdFatPoint = {
  label: string;
  producao: number;
  faturamento: number;
};

export type ContratoResumoProdFat = {
  periodLabel: string;
  producao: number;
  faturamento: number;
  delta: number;
  series: ContratoResumoProdFatPoint[];
};

export type ContratoResumoGastoTeto = {
  periodLabel: string;
  gastos: number;
  teto: number;
  loading?: boolean;
};

export type ContratoResumoAlerta = {
  id: string;
  tone: 'info' | 'warn' | 'danger';
  title: string;
  detail: string;
};

const OS_TOTAIS_META = [
  {
    key: 'orcado' as const,
    label: 'Orçado',
    fill: '#2563eb',
  },
  {
    key: 'pleiteado' as const,
    label: 'Pleiteado',
    fill: '#7c3aed',
  },
  {
    key: 'faturado' as const,
    label: 'Faturado',
    fill: '#16a34a',
  },
];

function OsTotaisDashboardCard({ totais }: { totais: ContratoOsTotais }) {
  const theme = useChartTheme();
  const { isDark } = useTheme();
  const uid = React.useId().replace(/:/g, '');
  const data = useMemo(
    () =>
      OS_TOTAIS_META.map((meta) => ({
        ...meta,
        value:
          meta.key === 'orcado'
            ? totais.totalOrcado
            : meta.key === 'pleiteado'
              ? totais.totalPleiteado
              : totais.totalFaturado,
      })),
    [totais.totalOrcado, totais.totalPleiteado, totais.totalFaturado]
  );
  const maxValue = Math.max(...data.map((d) => d.value), 0);
  const chartMax = maxValue > 0 ? maxValue * 1.18 : 1;
  const labelFill = isDark ? '#e5e7eb' : '#374151';

  return (
    <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
      <CardHeading title="Ordem de serviço" />
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
        <div className="min-h-[200px] flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 28, right: 8, left: 0, bottom: 4 }} barCategoryGap="28%">
              <defs>
                {data.map((item) => (
                  <linearGradient key={item.key} id={`os-bar-${uid}-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={item.fill} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={item.fill} stopOpacity={0.55} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: theme.chartTick, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis
                tick={{ fontSize: 10, fill: theme.chartTick }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) => formatCurrencyCompact(Number(v) || 0)}
                domain={[0, chartMax]}
              />
                  <Tooltip
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)', radius: 8 }}
                content={({ active, label, payload }) => (
                  <ChartLightTooltip
                    active={active}
                    label={label}
                    rows={(payload ?? []).map((entry) => ({
                      key: String(entry.dataKey ?? entry.name ?? 'value'),
                      name: 'Valor',
                      value: formatCurrency(Number(entry.value) || 0),
                      color: String(entry.payload?.fill || entry.color || '#64748b'),
                    }))}
                  />
                )}
              />
              <Bar dataKey="value" radius={[10, 10, 4, 4]} maxBarSize={48} background={{ fill: 'transparent' }}>
                {data.map((item) => (
                  <Cell
                    key={item.key}
                    fill={`url(#os-bar-${uid}-${item.key})`}
                    stroke={item.fill}
                    strokeWidth={0}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  offset={8}
                  fill={labelFill}
                  fontSize={11}
                  fontWeight={600}
                  formatter={(value) => formatCurrencyCompact(Number(value) || 0)}
                />
              </Bar>
            </BarChart>
              </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export type ContratoResumoKpi = {
  title: string;
  value: string;
  subtitle?: string;
  loading?: boolean;
  href?: string;
  /** Aviso numérico (ex.: relatório mensal pendente). */
  badgeCount?: number;
  /** Card compacto/quadrado (ex.: Caixinha). */
  variant?: 'default' | 'square';
  /** Destaque invertido (ex.: vermelho com texto branco). */
  tone?: 'default' | 'brand';
};

/** Cota semanal de abastecimento do contrato (API quota-balance). */
export type ContratoResumoAbastecimento = {
  contractId?: string;
  weeklyBudgetReais: number | null;
  usedReais: number;
  remainingReais: number | null;
  unlimited: boolean;
  weekStart?: string;
  weekEnd?: string;
  loading?: boolean;
};

type AbastecimentoUsedRequest = {
  id: string;
  displayNumber: number;
  status: string;
  requestedAt?: string | null;
  suppliesApprovedAt?: string | null;
  driverName?: string | null;
  vehiclePlate?: string | null;
  litersRefueled?: string | number | null;
  pricePerLiter?: string | number | null;
  releasedAmountReais?: number | null;
  contract?: { id: string; name?: string; number?: string } | null;
};

const ABSTECIMENTO_USED_STATUSES = new Set(['APPROVED', 'AWAITING_REFUEL', 'COMPLETED']);

function formatAbastecimentoWeekLabel(isoStart?: string, isoEnd?: string) {
  if (!isoStart || !isoEnd) return 'esta semana';
  const start = new Date(isoStart);
  const end = new Date(new Date(isoEnd).getTime() - 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'esta semana';
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${fmt(start)} a ${fmt(end)}`;
}

/** Arco semicircular segmentado (ticks radiais), no estilo gauge de dashboard. */
function SegmentedSemiGauge({
  percent,
  centerLabel,
  hint,
  over = false,
  ariaLabel,
}: {
  percent: number;
  centerLabel: string;
  hint: string;
  over?: boolean;
  ariaLabel: string;
}) {
  const { isDark } = useTheme();
  const segments = 44;
  const clamped = Math.max(0, Math.min(100, percent));
  const filledCount = Math.round((clamped / 100) * segments);
  const cx = 100;
  const cy = 108;
  const outerR = 86;
  const innerR = 58;
  const startAngle = Math.PI;
  const endAngle = 0;
  const track = isDark ? '#374151' : '#e5e7eb';
  const activeBase = over ? '#f43f5e' : '#22c55e';
  const activeHi = over ? '#fb7185' : '#4ade80';
  const labelFill = isDark ? '#f9fafb' : '#111827';
  const hintFill = isDark ? '#9ca3af' : '#6b7280';
  const segmentSpan = Math.max(1, segments - 1);

  return (
    <div className="mx-auto w-full max-w-[240px]">
      <svg
        viewBox="0 0 200 132"
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {Array.from({ length: segments }, (_, i) => {
          const t = i / segmentSpan;
          const angle = startAngle + t * (endAngle - startAngle);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const x1 = cx + cos * innerR;
          const y1 = cy - sin * innerR;
          const x2 = cx + cos * outerR;
          const y2 = cy - sin * outerR;
          const active = i < filledCount;
          const fillT = filledCount <= 1 ? 1 : i / Math.max(1, filledCount - 1);
          const stroke = active
            ? fillT < 0.55
              ? activeBase
              : activeHi
            : track;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={3.2}
              strokeLinecap="round"
            />
          );
        })}
        <text
          x="100"
          y="88"
          textAnchor="middle"
          fill={labelFill}
          style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}
        >
          {centerLabel}
        </text>
        <text
          x="100"
          y="108"
          textAnchor="middle"
          fill={hintFill}
          style={{ fontSize: 10, fontWeight: 500 }}
        >
          {hint}
        </text>
      </svg>
    </div>
  );
}

function abastecimentoSpendOfRow(row: AbastecimentoUsedRequest): number {
  if (row.status === 'COMPLETED') {
    const liters = Number(row.litersRefueled);
    const ppl = Number(row.pricePerLiter);
    if (Number.isFinite(liters) && Number.isFinite(ppl) && liters > 0 && ppl > 0) {
      return liters * ppl;
    }
  }
  const released = Number(row.releasedAmountReais);
  return Number.isFinite(released) && released > 0 ? released : 0;
}

function abastecimentoQuotaAnchorMs(row: AbastecimentoUsedRequest): number | null {
  const raw = row.suppliesApprovedAt || row.requestedAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function AbastecimentoQuotaCard({ data }: { data: ContratoResumoAbastecimento }) {
  const [usedOpen, setUsedOpen] = useState(false);
  const weekLabel = formatAbastecimentoWeekLabel(data.weekStart, data.weekEnd);
  const used = Number.isFinite(data.usedReais) ? data.usedReais : 0;
  const budget =
    data.weeklyBudgetReais != null && Number.isFinite(data.weeklyBudgetReais)
      ? data.weeklyBudgetReais
      : null;
  const remaining =
    data.remainingReais != null && Number.isFinite(data.remainingReais)
      ? data.remainingReais
      : null;
  const over = remaining != null && remaining < 0;
  const usedPct =
    !data.unlimited && budget != null && budget > 0 ? (used / budget) * 100 : 0;
  const barPct = Math.max(0, Math.min(100, usedPct));
  const contractId = data.contractId?.trim() || '';

  const { data: usedRows = [], isLoading: loadingUsed } = useQuery({
    queryKey: ['fuel-refuel-requests', 'contract-abastecimento-used', contractId, data.weekStart, data.weekEnd],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests', {
        params: { status: 'APPROVED,AWAITING_REFUEL,COMPLETED' },
      });
      return (res.data?.data || []) as AbastecimentoUsedRequest[];
    },
    enabled: usedOpen && Boolean(contractId),
    staleTime: 15_000,
  });

  const weekRequests = useMemo(() => {
    if (!contractId) return [];
    const weekStartMs = data.weekStart ? new Date(data.weekStart).getTime() : null;
    const weekEndMs = data.weekEnd ? new Date(data.weekEnd).getTime() : null;
    return usedRows
      .filter((row) => ABSTECIMENTO_USED_STATUSES.has(row.status))
      .filter((row) => row.contract?.id === contractId)
      .filter((row) => {
        if (weekStartMs == null || weekEndMs == null || Number.isNaN(weekStartMs) || Number.isNaN(weekEndMs)) {
          return true;
        }
        const anchor = abastecimentoQuotaAnchorMs(row);
        if (anchor == null) return false;
        return anchor >= weekStartMs && anchor < weekEndMs;
      })
      .map((row) => ({ row, total: abastecimentoSpendOfRow(row) }))
      .sort((a, b) => {
        const da = abastecimentoQuotaAnchorMs(a.row) ?? 0;
        const db = abastecimentoQuotaAnchorMs(b.row) ?? 0;
        return db - da;
      });
  }, [usedRows, contractId, data.weekStart, data.weekEnd]);

  const openUsedSolicitacoes = () => {
    if (!contractId) return;
    setUsedOpen(true);
  };

  const usedBlockClass =
    'rounded-xl bg-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 dark:bg-gray-800/60 dark:hover:bg-gray-800';

  return (
    <>
      <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
        <CardHeading
          title="Abastecimento"
          subtitle={
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cota semanal · {weekLabel}
            </p>
          }
        />
        <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-1`}>
          {data.loading ? (
            <div className="flex flex-1 items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Carregando" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex flex-1 flex-col justify-center">
                {data.unlimited ? (
                  <SegmentedSemiGauge
                    percent={0}
                    centerLabel={formatCurrency(used)}
                    hint="Sem limite de cota"
                    ariaLabel={`Usado na semana: ${formatCurrency(used)}. Sem limite configurado.`}
                  />
                ) : (
                  <SegmentedSemiGauge
                    percent={barPct}
                    centerLabel={`${Math.round(usedPct)}%`}
                    hint={
                      over
                        ? 'Cota estourada'
                        : usedPct >= 80
                          ? 'Próximo do limite'
                          : `de ${formatCurrency(budget ?? 0)}`
                    }
                    over={over}
                    ariaLabel={`${Math.round(usedPct)}% da cota usado`}
                  />
                )}
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2.5">
                {data.unlimited ? (
                  <div className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-800/60">
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Cota</p>
                    <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      Livre
                    </p>
                  </div>
                ) : (
                  <div
                    className={`rounded-xl px-3 py-2.5 ${
                      over
                        ? 'bg-rose-50/90 dark:bg-rose-900/25'
                        : 'bg-emerald-50/80 dark:bg-emerald-900/20'
                    }`}
                  >
                    <p
                      className={`text-[11px] font-medium ${
                        over
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      Disponível
                    </p>
                    <p
                      className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${
                        over
                          ? 'text-rose-900 dark:text-rose-100'
                          : 'text-emerald-900 dark:text-emerald-100'
                      }`}
                    >
                      {formatCurrency(remaining ?? 0)}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className={usedBlockClass}
                  onClick={openUsedSolicitacoes}
                  title="Ver solicitações usadas na semana"
                >
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Usado</p>
                  <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrency(used)}
                  </p>
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={usedOpen}
        onClose={() => setUsedOpen(false)}
        title="Usado na semana"
        size="lg"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Solicitações que entram na cota ({weekLabel}).
          </p>
          {loadingUsed ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Carregando" />
            </div>
          ) : weekRequests.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Nenhuma solicitação encontrada.</p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
              {weekRequests.map(({ row, total }) => {
                const whenMs = abastecimentoQuotaAnchorMs(row);
                const whenLabel =
                  whenMs != null
                    ? new Date(whenMs).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '—';
                const liters = Number(row.litersRefueled);
                return (
                  <li
                    key={row.id}
                    className="flex items-start justify-between gap-3 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        #{row.displayNumber}
                        <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                          {whenLabel}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        {[row.driverName, row.vehiclePlate].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm tabular-nums">
                      <p className="font-semibold text-gray-800 dark:text-gray-200">
                        {formatCurrency(total)}
                      </p>
                      {Number.isFinite(liters) && liters > 0 ? (
                        <p className="text-xs text-gray-400">
                          {liters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}

function MetaVsRealidadeCard({ data }: { data: ContratoResumoMetaVsReal }) {
  const theme = useChartTheme();
  const uid = React.useId().replace(/:/g, '');
  const chartData = data.series.length > 0
    ? data.series
    : [{ label: data.periodLabel, metaIdeal: data.metaIdeal, metaReal: data.metaReal, faturado: data.faturado }];
  const desvio = data.metaReal > 0 ? ((data.faturado - data.metaReal) / data.metaReal) * 100 : data.faturado > 0 ? 100 : 0;
  const onTrack = desvio >= -5;

  return (
    <Card className={`${cadastroListClasses.card} flex min-h-0 flex-col`}>
      <CardHeading
        title="Meta vs realidade"
        extra={
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              onTrack
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
            }`}
          >
            {desvio >= 0 ? '+' : ''}
            {desvio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs meta real
                </span>
        }
      />
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-1`}>
        <div className="h-[190px] w-full min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={4}>
              <defs>
                <linearGradient id={`meta-ideal-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.45} />
                </linearGradient>
                <linearGradient id={`meta-real-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={1} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke={theme.chartGrid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: theme.chartTick, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                tick={{ fontSize: 10, fill: theme.chartTick }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(v) => formatCurrencyCompact(Number(v) || 0)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.12)' }}
                content={({ active, label, payload }) => {
                  const nameByKey: Record<string, string> = {
                    metaIdeal: 'Meta ideal',
                    metaReal: 'Meta real',
                    faturado: 'Faturado',
                  };
                  const colorByKey: Record<string, string> = {
                    metaIdeal: '#94a3b8',
                    metaReal: '#10b981',
                    faturado: '#2563eb',
                  };
                  return (
                    <ChartLightTooltip
                      active={active}
                      label={label}
                      rows={(payload ?? []).map((entry) => {
                        const key = String(entry.dataKey);
                        return {
                          key,
                          name: nameByKey[key] || key,
                          value: formatCurrency(Number(entry.value) || 0),
                          color: colorByKey[key] || String(entry.color || '#64748b'),
                        };
                      })}
                    />
                  );
                }}
              />
              <Bar
                dataKey="metaIdeal"
                fill={`url(#meta-ideal-${uid})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={16}
              />
              <Bar
                dataKey="metaReal"
                fill={`url(#meta-real-${uid})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={16}
              />
              <Line
                type="monotone"
                dataKey="faturado"
                stroke="#2563eb"
                strokeWidth={2.75}
                dot={{ r: 3.5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
              </div>
      </CardContent>
    </Card>
  );
}

const PEOPLE_AVATAR_TONES = [
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
] as const;

function personInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function avatarToneForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % 997;
  return PEOPLE_AVATAR_TONES[hash % PEOPLE_AVATAR_TONES.length];
}

export type ContratoResumoPessoa = {
  id: string;
  name: string;
  email?: string | null;
  cpf?: string | null;
  position?: string | null;
  department?: string | null;
};

function PessoasContratoCard({
  people,
  loading = false,
  error = false,
}: {
  people: ContratoResumoPessoa[];
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <Card className={`${cadastroListClasses.card} flex h-full min-h-0 flex-col`}>
      <CardHeading title="Colaboradores" />
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col !pt-2`}>
        {loading ? (
          <div className="flex h-[280px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Carregando" />
            </div>
        ) : error ? (
          <p className="flex h-[280px] items-center justify-center text-center text-sm text-rose-600 dark:text-rose-400">
            Não foi possível carregar as pessoas. Atualize a página.
          </p>
        ) : people.length === 0 ? (
          <p className="flex h-[280px] items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma pessoa com este contrato liberado.
          </p>
        ) : (
          <ul className="h-[280px] space-y-1 overflow-y-auto overscroll-contain pr-1">
            {people.map((person) => {
              const cpfLabel = person.cpf ? formatCpfInput(person.cpf) : '—';
                return (
                <li
                  key={person.id}
                  className="flex items-center gap-3 rounded-xl px-1.5 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                      <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarToneForName(
                      person.name
                    )}`}
                    aria-hidden
                  >
                    {personInitials(person.name)}
                      </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {person.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {cpfLabel}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Liberado
                  </span>
                  </li>
                );
              })}
            </ul>
        )}
      </CardContent>
    </Card>
  );
}

function KpiStatCard({
  title,
  value,
  subtitle,
  loading,
  href,
  badgeCount = 0,
  variant = 'default',
  tone = 'default',
}: ContratoResumoKpi) {
  const isSquare = variant === 'square';
  const isBrand = tone === 'brand';
  const openLink = href ? (
    <Link
      href={href}
      aria-label={`Abrir ${title}`}
      title={title}
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        isBrand
          ? 'bg-white/20 text-white hover:bg-white/30'
          : 'text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400'
      }`}
    >
      <ExternalLink className="h-4 w-4" aria-hidden />
      {badgeCount > 0 ? <NotificationCountBadge count={badgeCount} rail /> : null}
    </Link>
  ) : null;

  return (
    <Card
      title={title}
      className={`${cadastroListClasses.card} flex min-h-0 flex-col ${
        isSquare ? 'aspect-square w-[8.75rem] shrink-0 sm:w-[9.5rem]' : ''
      } ${
        isBrand
          ? '!border-transparent !bg-gradient-to-br !from-red-600 !via-red-600 !to-red-700 shadow-[0_16px_32px_-18px_rgba(220,38,38,0.55)] dark:!from-red-600 dark:!via-red-700 dark:!to-red-800'
          : ''
      }`}
    >
      {/* Em viewport estreito o título some e fica só o ícone, para o card não quebrar. */}
      <CardHeader
        className={`${cadastroListClasses.cardHeader} ${isSquare ? '!pb-1 !pt-4' : '!pt-5'}`}
      >
        <div
          className={`${cadastroListClasses.cardHeaderRow} max-xl:justify-end`}
        >
          <h3
            className={`min-w-0 font-semibold max-xl:sr-only ${
              isBrand ? 'text-white' : 'text-gray-900 dark:text-gray-100'
            } ${isSquare && !isBrand ? 'text-sm sm:text-base' : 'text-lg sm:text-xl'}`}
          >
            {title}
            </h3>
          {openLink ? (
            <div className={`${cadastroListClasses.cardToolbar} self-start`}>{openLink}</div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent
        className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col ${
          isSquare ? 'justify-end !pt-0' : ''
        }`}
      >
        {loading ? (
          <div className={`flex items-center justify-center ${isSquare ? 'flex-1' : 'py-6'}`}>
            <Loader2
              className={`h-6 w-6 animate-spin ${isBrand ? 'text-white/70' : 'text-gray-400'}`}
              aria-label="Carregando"
            />
          </div>
        ) : (
          <div>
            <p
              className={`font-semibold tracking-tight tabular-nums ${
                isBrand ? 'text-white' : 'text-gray-900 dark:text-gray-50'
              } ${isSquare ? 'text-base leading-tight sm:text-lg' : 'text-xl sm:text-2xl'}`}
            >
              {value}
            </p>
            {subtitle ? (
              <p
                className={`mt-1 ${
                  isBrand ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'
                } ${isSquare ? 'text-xs' : 'text-sm'}`}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ContratoFaturamentoCharts({
  faturamentoInsight,
  progressoTitle,
  progressoBilled = 0,
  progressoTotal = 0,
  osTotais,
  resumoKpis = [],
  metaVsReal,
  people = [],
  peopleLoading = false,
  peopleError = false,
  abastecimento,
}: {
  faturamentoInsight: ContratoFaturamentoInsight;
  progressoTitle: string;
  progressoBilled?: number;
  progressoTotal?: number;
  osTotais: ContratoOsTotais;
  resumoKpis?: ContratoResumoKpi[];
  metaVsReal: ContratoResumoMetaVsReal;
  people?: ContratoResumoPessoa[];
  peopleLoading?: boolean;
  peopleError?: boolean;
  abastecimento?: ContratoResumoAbastecimento | null;
}) {
  const showAbastecimento = Boolean(abastecimento);

  return (
    <div className="space-y-4">
      {resumoKpis.length > 0 ? (
        <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {resumoKpis.map((kpi) => (
            <KpiStatCard key={kpi.title} {...kpi} />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1.35fr_1fr_1fr]">
        <FaturamentoProfitCard insight={faturamentoInsight} />
        <ProgressoGaugeCard
          title={progressoTitle}
          billed={progressoBilled}
          total={progressoTotal}
        />
        <OsTotaisDashboardCard totais={osTotais} />
      </div>

      <div
        className={`grid grid-cols-1 items-stretch gap-4 ${
          showAbastecimento ? 'lg:grid-cols-3' : 'lg:grid-cols-[1fr_2fr]'
        }`}
      >
        <MetaVsRealidadeCard data={metaVsReal} />
        {showAbastecimento && abastecimento ? (
          <AbastecimentoQuotaCard data={abastecimento} />
        ) : null}
        <PessoasContratoCard people={people} loading={peopleLoading} error={peopleError} />
      </div>
    </div>
  );
}
