'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Download,
  FolderKanban,
  Timer,
  Wrench
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { exportGestaoOsReportsPdf } from '@/lib/exportGestaoOsReportsPdf';
import api from '@/lib/api';
import {
  STATUS_LABELS,
  type GestaoOsReportsSummary,
  type GestaoOsStatus
} from '../../sistema-gestao-os/gestaoOsTypes';

type DistRow = { key: string; label: string; count: number };

const PHASE_ORDER: GestaoOsStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'APPROVED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'COMPLETED',
  'REWORK',
  'CLOSED',
  'CANCELLED'
];

function DistributionCard({
  title,
  icon: Icon,
  rows,
  emptyTitle
}: {
  title: string;
  icon: LucideIcon;
  rows: DistRow[];
  emptyTitle: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <div className={cadastroListClasses.cardHeaderIconRow}>
          <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
            <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {rows.length} {rows.length === 1 ? 'item' : 'itens'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        {rows.length === 0 ? (
          <CadastroListEmpty icon={Icon} title={emptyTitle} />
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row) => (
              <li key={row.key} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {row.label}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {row.count}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-red-500/80 dark:bg-red-400/80"
                    style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function RelatoriosUnidadePageClient() {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [buildingId, setBuildingId] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data: linkedBuildings = [], isLoading: loadingLinked } = useQuery({
    queryKey: ['gestao-os-my-unit-buildings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Array<{ id: string; name: string }> }>(
        '/gestao-os/cadastros/my-unit-buildings'
      );
      return res.data?.data ?? [];
    }
  });

  // Quem não é responsável de um prédio (ex.: cadastro/gestão) vê todas as localidades.
  const scopedToMyUnits = linkedBuildings.length > 0;
  const { data: allBuildings = [], isLoading: loadingAll } = useQuery({
    queryKey: ['gestao-os-locations-for-unit-reports'],
    enabled: !loadingLinked && !scopedToMyUnits,
    queryFn: async () => {
      try {
        const res = await api.get<{
          success: boolean;
          data: Array<{ id: string; name: string }>;
        }>('/gestao-os/locations');
        return res.data?.data ?? [];
      } catch {
        return [];
      }
    }
  });

  const unitBuildings = scopedToMyUnits ? linkedBuildings : allBuildings;
  const loadingBuildings = loadingLinked || (!scopedToMyUnits && loadingAll);

  const reportParams = {
    ...(scopedToMyUnits ? { unitPortal: 1 } : {}),
    from: from || undefined,
    to: to || undefined,
    buildingId: buildingId || undefined
  };

  const { data, isLoading } = useQuery({
    queryKey: ['gestao-os-unit-reports-summary', reportParams],
    enabled: !loadingBuildings && unitBuildings.length > 0,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsReportsSummary }>(
        '/gestao-os/reports/summary',
        { params: reportParams }
      );
      return res.data?.data;
    }
  });

  const phaseRows = useMemo<DistRow[]>(() => {
    if (!data) return [];
    return PHASE_ORDER.map((status) => ({
      key: status,
      label: STATUS_LABELS[status],
      count: data.byStatus[status] ?? 0
    })).filter((row) => row.count > 0);
  }, [data]);

  const periodLabel = useMemo(() => {
    const fmt = (value: string) => value.split('-').reverse().join('/');
    if (from && to) return `Período de ${fmt(from)} a ${fmt(to)}`;
    if (from) return `A partir de ${fmt(from)}`;
    if (to) return `Até ${fmt(to)}`;
    return 'Todo o período';
  }, [from, to]);

  const selectedBuildingName =
    unitBuildings.find((b) => b.id === buildingId)?.name ||
    (unitBuildings.length === 1
      ? unitBuildings[0].name
      : scopedToMyUnits
        ? 'Todas as minhas localidades'
        : 'Todas as localidades');

  const exportCsv = async () => {
    try {
      const res = await api.get('/gestao-os/reports/export.csv', {
        responseType: 'blob',
        params: reportParams
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relatorio-localidade.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Não foi possível exportar o CSV.');
    }
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/meus-chamados/relatorios">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Relatórios da Localidade
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Acompanhe os serviços executados nas localidades sob sua responsabilidade e exporte
              em PDF ou CSV.
            </p>
          </div>

          {!loadingBuildings && unitBuildings.length === 0 ? (
            <Card className={`mx-auto max-w-2xl ${cadastroListClasses.card}`}>
              <CardContent className={`${cadastroListClasses.cardContent} py-8 text-center`}>
                <Building2 className="mx-auto mb-4 h-10 w-10 text-gray-400" />
                <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Nenhuma localidade vinculada ao seu usuário
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Peça ao administrador para indicar você como responsável, preposto, gestor ou
                  fiscal de uma localidade no cadastro de locais.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    De
                  </label>
                  <DatePickerField
                    value={from}
                    onChange={setFrom}
                    noFocusRing
                    aria-label="Data inicial"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Até
                  </label>
                  <DatePickerField
                    value={to}
                    onChange={setTo}
                    noFocusRing
                    aria-label="Data final"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Localidade
                  </label>
                  <StringSingleSelectDropdown
                    value={buildingId}
                    onChange={setBuildingId}
                    options={labeledToSelectOptions(
                      unitBuildings.map((b) => ({ value: b.id, label: b.name }))
                    )}
                    placeholder="Todas"
                    emptyOptionLabel="Todas"
                    allowEmpty
                  />
                </div>
              </div>

              {isLoading || !data ? (
                <Card className={cadastroListClasses.card}>
                  <CardContent className={cadastroListClasses.cardContent}>
                    <CadastroListLoading message="Carregando indicadores..." />
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void exportCsv()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                    >
                      <Download className="h-4 w-4" />
                      Exportar CSV
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void exportGestaoOsReportsPdf(data, {
                          title: 'Relatório de serviços da localidade',
                          subtitle: `${selectedBuildingName} · ${periodLabel}`,
                          fileName: `relatorio-localidade-${new Date()
                            .toISOString()
                            .slice(0, 10)}.pdf`
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                    >
                      <Download className="h-4 w-4" />
                      Exportar PDF
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <FilterStatCard
                      label="Em aberto"
                      count={data.openLike}
                      subtitle="Chamados ainda em andamento"
                      icon={FolderKanban}
                      iconBg="bg-red-100 dark:bg-red-900/30"
                      iconColor="text-red-600 dark:text-red-400"
                    />
                    <FilterStatCard
                      label="Resolvidas"
                      count={data.resolved ?? 0}
                      subtitle="Concluídas ou encerradas"
                      icon={CheckCircle2}
                      iconBg="bg-emerald-100 dark:bg-emerald-900/30"
                      iconColor="text-emerald-600 dark:text-emerald-400"
                    />
                    <FilterStatCard
                      label="Atrasadas"
                      count={data.overdue}
                      subtitle="Prazo de SLA estourado"
                      icon={AlertTriangle}
                      iconBg="bg-rose-100 dark:bg-rose-900/30"
                      iconColor="text-rose-600 dark:text-rose-400"
                    />
                    <FilterStatCard
                      label="MTTR"
                      count={data.mttrHours != null ? data.mttrHours : '—'}
                      subtitle="Tempo médio de atendimento (horas)"
                      icon={Timer}
                      iconBg="bg-sky-100 dark:bg-sky-900/30"
                      iconColor="text-sky-600 dark:text-sky-400"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <DistributionCard
                      title="Por fase"
                      icon={BarChart3}
                      rows={phaseRows}
                      emptyTitle="Nenhum chamado no período"
                    />
                    <DistributionCard
                      title="Por tipo de serviço"
                      icon={Wrench}
                      rows={data.byCategory.map((r) => ({
                        key: r.category,
                        label: r.category,
                        count: r.count
                      }))}
                      emptyTitle="Nenhum tipo de serviço com chamado"
                    />
                    <DistributionCard
                      title="Por localidade"
                      icon={Building2}
                      rows={data.byBuilding.map((r) => ({
                        key: r.buildingId || r.name,
                        label: r.name,
                        count: r.count
                      }))}
                      emptyTitle="Nenhuma localidade com chamado"
                    />
                    <DistributionCard
                      title="Volume mensal"
                      icon={BarChart3}
                      rows={(data.monthlyByCategory || []).map((m) => ({
                        key: m.month,
                        label: m.month,
                        count: m.total
                      }))}
                      emptyTitle="Sem série mensal ainda"
                    />
                  </div>

                  <Card className={cadastroListClasses.card}>
                    <CardHeader className={cadastroListClasses.cardHeader}>
                      <div className={cadastroListClasses.cardHeaderIconRow}>
                        <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Pendências
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Chamados abertos, atrasados ou aguardando solução
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className={cadastroListClasses.cardContent}>
                      {(data.pendencias || []).length === 0 ? (
                        <CadastroListEmpty
                          icon={CheckCircle2}
                          title="Nenhuma pendência no recorte"
                          hint="Quando houver chamados em aberto, eles aparecem aqui."
                        />
                      ) : (
                        <div className={cadastroListClasses.tableScroll}>
                          <table className={`${cadastroListClasses.table} min-w-[36rem]`}>
                            <thead className="border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className={cadastroListClasses.th}>Chamado</th>
                                <th className={cadastroListClasses.th}>Status</th>
                                <th className={cadastroListClasses.th}>Tipo</th>
                                <th className={cadastroListClasses.th}>Local</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                              {(data.pendencias || []).map((row) => (
                                <tr key={row.id}>
                                  <td className={cadastroListClasses.td}>
                                    <span className="font-medium">{row.label}</span>
                                    {row.overdue ? (
                                      <span className="ml-2 text-xs font-semibold text-rose-600">
                                        Atrasada
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className={cadastroListClasses.td}>
                                    {STATUS_LABELS[row.status]}
                                  </td>
                                  <td className={cadastroListClasses.td}>{row.category}</td>
                                  <td className={cadastroListClasses.td}>
                                    {row.locationLabel || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
