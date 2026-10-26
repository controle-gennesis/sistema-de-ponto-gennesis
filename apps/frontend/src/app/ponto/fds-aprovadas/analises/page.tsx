'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle2,
  ClipboardList,
  Filter,
  Hourglass,
  Loader2,
  MapPin,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { useTheme } from '@/context/ThemeContext';
import api from '@/lib/api';
import type { FichaDemandaApprovalRecord } from '@/lib/fichaDemandaApproval';

type Situacao = 'FILA' | 'COTACAO' | 'FINALIZADA' | 'CANCELADA' | 'ESTOQUE';

const SITUACAO_LABEL: Record<Situacao, string> = {
  FILA: 'Fila',
  COTACAO: 'Cotação',
  FINALIZADA: 'Finalizadas',
  CANCELADA: 'Canceladas',
  ESTOQUE: 'Atendidas pelo estoque',
};

const SITUACAO_COR: Record<Situacao, string> = {
  FILA: '#d97706',
  COTACAO: '#4f46e5',
  FINALIZADA: '#16a34a',
  CANCELADA: '#dc2626',
  ESTOQUE: '#0d9488',
};

const PALETA = [
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

function situacaoDe(r: FichaDemandaApprovalRecord): Situacao {
  const s = r.purchaseStatus;
  if (!s) return 'FILA';
  if (s === 'CANCELLED') return 'CANCELADA';
  if (s === 'FINISHED') return 'FINALIZADA';
  if (s === 'QUOTATION' || s === 'PURCHASE_REQUEST' || s === 'SUPPLIES') return 'COTACAO';
  return 'ESTOQUE';
}

function numero(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moeda(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function moedaCompacta(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} mi`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)} mil`;
  return moeda(v);
}

function dataDe(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nomeCurto(nome: string, max = 26): string {
  const limpo = (nome || 'Sem contrato').trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

function useChartTheme() {
  const { isDark } = useTheme();
  return {
    tick: isDark ? '#9ca3af' : '#6b7280',
    grid: isDark ? '#374151' : '#e5e7eb',
    pieStroke: isDark ? '#1f2937' : '#ffffff',
    tip: {
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
}: {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <Card className={cadastroListClasses.card}>
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

function SemDados({ texto = 'Sem dados neste período.' }: { texto?: string }) {
  return <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">{texto}</p>;
}

function AnalisesFichasContent() {
  const theme = useChartTheme();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [contrato, setContrato] = useState('ALL');
  const [polo, setPolo] = useState('ALL');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['demand-sheet-approvals', 'aprovadas-compras', 'analises'],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/aprovadas-compras');
      return (res.data?.data || []) as FichaDemandaApprovalRecord[];
    },
  });

  const todas = useMemo(() => data ?? [], [data]);

  const contratoOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'ALL', label: 'Todos os contratos' },
        ...[...new Set(todas.map((r) => r.contratoNome).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
          .map((nome) => ({ value: nome, label: nome })),
      ]),
    [todas]
  );
  const poloOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'ALL', label: 'Todos os polos' },
        ...[...new Set(todas.map((r) => r.polo).filter(Boolean))]
          .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
          .map((p) => ({ value: String(p), label: String(p) })),
      ]),
    [todas]
  );

  const temFiltro = Boolean(dateFrom || dateTo) || contrato !== 'ALL' || polo !== 'ALL';

  const fichas = useMemo(
    () =>
      todas.filter((r) => {
        const criada = dataDe(r.createdAt);
        const dia = criada ? ymd(criada) : '';
        if (dateFrom && (!dia || dia < dateFrom)) return false;
        if (dateTo && (!dia || dia > dateTo)) return false;
        if (contrato !== 'ALL' && r.contratoNome !== contrato) return false;
        if (polo !== 'ALL' && String(r.polo) !== polo) return false;
        return true;
      }),
    [todas, dateFrom, dateTo, contrato, polo]
  );

  const insights = useMemo(() => {
    const porSituacao: Record<Situacao, number> = {
      FILA: 0,
      COTACAO: 0,
      FINALIZADA: 0,
      CANCELADA: 0,
      ESTOQUE: 0,
    };
    let faturamento = 0;
    let custo = 0;
    let faturamentoAberto = 0;
    const duracoes: number[] = [];
    const meses = new Map<
      string,
      { mes: string; criadas: number; finalizadas: number; faturamento: number; custo: number }
    >();
    const porContrato = new Map<string, { nome: string; faturamento: number; fichas: number }>();
    const porPolo = new Map<string, number>();
    const porSolicitante = new Map<string, number>();
    const mes = (d: Date) => {
      const chave = format(d, 'yyyy-MM');
      let m = meses.get(chave);
      if (!m) {
        m = { mes: chave, criadas: 0, finalizadas: 0, faturamento: 0, custo: 0 };
        meses.set(chave, m);
      }
      return m;
    };

    for (const r of fichas) {
      const sit = situacaoDe(r);
      porSituacao[sit] += 1;
      const fat = numero(r.faturamentoEstimado);
      const cus = numero(r.custoEstimado);
      if (sit !== 'CANCELADA') {
        faturamento += fat;
        custo += cus;
      }
      if (sit === 'FILA' || sit === 'COTACAO') faturamentoAberto += fat;

      const criada = dataDe(r.createdAt);
      if (criada) {
        const m = mes(criada);
        m.criadas += 1;
        if (sit !== 'CANCELADA') {
          m.faturamento += fat;
          m.custo += cus;
        }
      }
      if (sit === 'FINALIZADA') {
        const fim = dataDe(r.purchaseStatusUpdatedAt);
        if (fim) mes(fim).finalizadas += 1;
        if (fim && criada && fim >= criada) {
          duracoes.push((fim.getTime() - criada.getTime()) / 86_400_000);
        }
      }

      if (sit !== 'CANCELADA') {
        const chave = r.contratoNome || 'Sem contrato';
        const atual = porContrato.get(chave) ?? { nome: chave, faturamento: 0, fichas: 0 };
        atual.faturamento += fat;
        atual.fichas += 1;
        porContrato.set(chave, atual);
      }
      const nomePolo = String(r.polo || 'Sem polo');
      porPolo.set(nomePolo, (porPolo.get(nomePolo) ?? 0) + 1);
      const quem = r.solicitanteNome || 'Sem solicitante';
      porSolicitante.set(quem, (porSolicitante.get(quem) ?? 0) + 1);
    }

    const mensal = [...meses.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-12)
      .map((m) => ({
        ...m,
        rotulo: format(parseISO(`${m.mes}-01`), 'MMM/yy', { locale: ptBR }),
      }));

    const agora = Date.now();
    const maisAntigas = fichas
      .filter((r) => situacaoDe(r) === 'FILA')
      .map((r) => {
        const criada = dataDe(r.createdAt);
        return {
          id: r.id,
          codigo: r.codFichaDemanda || 'Sem código',
          contrato: r.contratoNome,
          solicitante: r.solicitanteNome,
          valor: numero(r.faturamentoEstimado),
          dias: criada ? Math.max(0, Math.floor((agora - criada.getTime()) / 86_400_000)) : 0,
        };
      })
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 8);

    return {
      total: fichas.length,
      porSituacao,
      faturamento,
      custo,
      margem: faturamento - custo,
      faturamentoAberto,
      emAberto: porSituacao.FILA + porSituacao.COTACAO,
      tempoMedioDias:
        duracoes.length > 0 ? duracoes.reduce((s, d) => s + d, 0) / duracoes.length : null,
      finalizadasComTempo: duracoes.length,
      pizzaSituacao: (Object.keys(porSituacao) as Situacao[])
        .filter((s) => porSituacao[s] > 0)
        .map((s) => ({ name: SITUACAO_LABEL[s], value: porSituacao[s], cor: SITUACAO_COR[s] })),
      mensal,
      contratos: [...porContrato.values()]
        .sort((a, b) => b.faturamento - a.faturamento)
        .slice(0, 10)
        .map((c) => ({ ...c, curto: nomeCurto(c.nome) })),
      polos: [...porPolo.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value })),
      solicitantes: [...porSolicitante.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([nome, fichasQtd]) => ({ nome, curto: nomeCurto(nome, 22), fichas: fichasQtd })),
      maisAntigas,
    };
  }, [fichas]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    );
  }

  const barraFiltros = (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => setFiltrosAbertos(true)}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
          temFiltro
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
        aria-label="Abrir filtros"
        title={temFiltro ? 'Filtros ativos' : 'Filtros'}
      >
        <Filter className="h-4 w-4" />
        {temFiltro ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
        ) : null}
      </button>
    </div>
  );

  const modalFiltros = (
    <Modal
      isOpen={filtrosAbertos}
      onClose={() => setFiltrosAbertos(false)}
      title="Filtros"
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setContrato('ALL');
              setPolo('ALL');
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() => setFiltrosAbertos(false)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Aplicar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Criadas de
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
            <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
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
        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Contrato
          </span>
          <StringSingleSelectDropdown
            value={contrato}
            onChange={setContrato}
            options={contratoOptions}
            allowEmpty={false}
          />
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">
            Polo
          </span>
          <StringSingleSelectDropdown
            value={polo}
            onChange={setPolo}
            options={poloOptions}
            allowEmpty={false}
          />
        </div>
      </div>
    </Modal>
  );

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">Não foi possível carregar as fichas.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (insights.total === 0) {
    return (
      <div className="space-y-6">
        {barraFiltros}
        {modalFiltros}
        <CadastroListEmpty
          icon={ClipboardList}
          title={temFiltro ? 'Nenhuma ficha com esses filtros' : 'Ainda sem fichas aprovadas'}
          hint={
            temFiltro
              ? 'Ajuste o período, o contrato ou o polo.'
              : 'Quando houver fichas aprovadas, os gráficos aparecem aqui.'
          }
        />
      </div>
    );
  }

  const tempoMedio =
    insights.tempoMedioDias == null
      ? '—'
      : `${insights.tempoMedioDias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;

  return (
    <div className="space-y-6">
      {barraFiltros}
      {modalFiltros}

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <FilterStatCard
          label="Fichas aprovadas"
          count={insights.total}
          icon={ClipboardList}
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
          subtitle={`${insights.porSituacao.FINALIZADA} finalizadas`}
        />
        <FilterStatCard
          label="Em aberto"
          count={insights.emAberto}
          icon={Hourglass}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
          subtitle={`${insights.porSituacao.FILA} na fila e ${insights.porSituacao.COTACAO} em cotação`}
        />
        <FilterStatCard
          label="Tempo médio até finalizar"
          count={tempoMedio}
          icon={Timer}
          iconBg="bg-teal-100 dark:bg-teal-900/30"
          iconColor="text-teal-600 dark:text-teal-400"
          subtitle={
            insights.finalizadasComTempo > 0
              ? `Base: ${insights.finalizadasComTempo} fichas finalizadas`
              : 'Ainda sem fichas finalizadas'
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <FilterStatCard
          label="Faturamento estimado"
          count={moeda(insights.faturamento)}
          icon={Wallet}
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
          subtitle="Sem as canceladas"
        />
        <FilterStatCard
          label="Custo estimado"
          count={moeda(insights.custo)}
          icon={TrendingUp}
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconColor="text-violet-600 dark:text-violet-400"
          subtitle="Sem as canceladas"
        />
        <FilterStatCard
          label="Margem estimada"
          count={moeda(insights.margem)}
          icon={Wallet}
          iconBg="bg-sky-100 dark:bg-sky-900/30"
          iconColor="text-sky-600 dark:text-sky-400"
          subtitle={
            insights.faturamento > 0
              ? `${((insights.margem / insights.faturamento) * 100).toLocaleString('pt-BR', {
                  maximumFractionDigits: 1,
                })}% do faturamento`
              : 'Sem faturamento no período'
          }
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <ChartCard
          title="Situação das fichas"
          subtitle="Quantas fichas estão em cada etapa de compras."
          Icon={CheckCircle2}
        >
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={insights.pizzaSituacao}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  stroke={theme.pieStroke}
                  label={(p) => String(p.value)}
                >
                  {insights.pizzaSituacao.map((item) => (
                    <Cell key={item.name} fill={item.cor} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={theme.tip}
                  formatter={(value) => [`${value} fichas`, '']}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: theme.tick }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Fichas por mês"
          subtitle="Quantas foram criadas e quantas foram finalizadas em cada mês."
          Icon={TrendingUp}
        >
          {insights.mensal.length === 0 ? (
            <SemDados />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.mensal} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fill: theme.tick, fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: theme.tick, fontSize: 11 }} />
                  <Tooltip contentStyle={theme.tip} />
                  <Legend wrapperStyle={{ fontSize: 12, color: theme.tick }} />
                  <Bar dataKey="criadas" name="Criadas" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="finalizadas" name="Finalizadas" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Faturamento e custo por mês"
          subtitle="Valores estimados das fichas criadas em cada mês (sem as canceladas)."
          Icon={Wallet}
        >
          {insights.mensal.length === 0 ? (
            <SemDados />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.mensal} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fill: theme.tick, fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: theme.tick, fontSize: 11 }}
                    tickFormatter={(v) => moedaCompacta(Number(v))}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={theme.tip}
                    formatter={(value) => moeda(Number(value ?? 0))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: theme.tick }} />
                  <Bar dataKey="faturamento" name="Faturamento" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="custo" name="Custo" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Faturamento por contrato"
          subtitle="Os 10 contratos com maior valor estimado em fichas."
          Icon={Wallet}
        >
          {insights.contratos.length === 0 ? (
            <SemDados />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={insights.contratos}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: theme.tick, fontSize: 11 }}
                    tickFormatter={(v) => moedaCompacta(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="curto"
                    width={130}
                    tick={{ fill: theme.tick, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={theme.tip}
                    formatter={(value) => [moeda(Number(value ?? 0)), 'Faturamento']}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { nome?: string } | undefined)?.nome ?? ''
                    }
                  />
                  <Bar dataKey="faturamento" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {insights.contratos.map((c, i) => (
                      <Cell key={c.nome} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Fichas por polo"
          subtitle="Distribuição das fichas entre os polos."
          Icon={MapPin}
        >
          {insights.polos.length === 0 ? (
            <SemDados />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insights.polos}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke={theme.pieStroke}
                    label={(p) => String(p.value)}
                  >
                    {insights.polos.map((p, i) => (
                      <Cell key={p.name} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={theme.tip}
                    formatter={(value) => [`${value} fichas`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: theme.tick }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Quem mais envia fichas"
          subtitle="Solicitantes com mais fichas aprovadas."
          Icon={Users}
        >
          {insights.solicitantes.length === 0 ? (
            <SemDados />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={insights.solicitantes}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: theme.tick, fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="curto"
                    width={130}
                    tick={{ fill: theme.tick, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={theme.tip}
                    formatter={(value) => [`${value} fichas`, '']}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { nome?: string } | undefined)?.nome ?? ''
                    }
                  />
                  <Bar dataKey="fichas" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {insights.solicitantes.map((s, i) => (
                      <Cell key={s.nome} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Há mais tempo na fila"
        subtitle="Fichas aprovadas que ainda não foram para Cotação, das mais antigas para as mais novas."
        Icon={Hourglass}
      >
        {insights.maisAntigas.length === 0 ? (
          <SemDados texto="Nenhuma ficha aguardando na fila." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  <th className="py-2 pr-3">Ficha</th>
                  <th className="px-3 py-2">Contrato</th>
                  <th className="px-3 py-2">Solicitante</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="py-2 pl-3 text-right">Na fila há</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {insights.maisAntigas.map((f) => (
                  <tr key={f.id}>
                    <td className="max-w-[18rem] truncate py-2.5 pr-3 font-medium text-gray-900 dark:text-gray-100">
                      {f.codigo}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{f.contrato}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300">{f.solicitante}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {moeda(f.valor)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums">
                      <span
                        className={
                          f.dias >= 15
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : f.dias >= 7
                              ? 'font-semibold text-amber-600 dark:text-amber-400'
                              : 'text-gray-600 dark:text-gray-300'
                        }
                      >
                        {f.dias} {f.dias === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

export default function AnalisesFichasDemandaPage() {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth/login';
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/fds-aprovadas">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/fds-aprovadas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Análises de Fichas de Demanda"
            description="Situação das fichas, valores estimados, contratos, polos e o que está esperando há mais tempo na fila."
          />
          <AnalisesFichasContent />
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
