'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Search, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Button } from '@/components/ui/Button';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListEmpty, CadastroListLoading, CadastroListSummary } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import api from '@/lib/api';
import { mergeWorkflowApproverBuckets } from '@/lib/fluigWorkflowApproval';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  APPROVERS_LIST_PAGE_SIZE,
  useFluigWorkflowApprovalDatasets,
} from '@/components/fluig/fluigWorkflowAprovadoresShared';

export function FluigWorkflowAprovadoresPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [listPage, setListPage] = useState(1);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const user = userData?.data ?? { name: 'Usuário', role: 'EMPLOYEE' as const };

  const { g3Buckets, g5Buckets, isLoading, hasError, errorMessage } =
    useFluigWorkflowApprovalDatasets();

  const mergedApprovers = useMemo(
    () => mergeWorkflowApproverBuckets(g3Buckets, g5Buckets),
    [g3Buckets, g5Buckets]
  );

  const summary = useMemo(() => {
    const withPending = mergedApprovers.filter((item) => item.pendingCount > 0).length;
    const totalApprovedActions = mergedApprovers.reduce((sum, item) => sum + item.approvedCount, 0);
    const totalPendingActions = mergedApprovers.reduce((sum, item) => sum + item.pendingCount, 0);
    return {
      approvers: mergedApprovers.length,
      withPending,
      totalApprovedActions,
      totalPendingActions,
    };
  }, [mergedApprovers]);

  const filteredApprovers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mergedApprovers;
    return mergedApprovers.filter((item) => item.name.toLowerCase().includes(term));
  }, [mergedApprovers, search]);

  const totalPages = Math.max(1, Math.ceil(filteredApprovers.length / APPROVERS_LIST_PAGE_SIZE));

  const paginatedApprovers = useMemo(() => {
    const start = (listPage - 1) * APPROVERS_LIST_PAGE_SIZE;
    return filteredApprovers.slice(start, start + APPROVERS_LIST_PAGE_SIZE);
  }, [filteredApprovers, listPage]);

  useEffect(() => {
    setListPage(1);
  }, [search]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const listStart =
    filteredApprovers.length === 0 ? 0 : (listPage - 1) * APPROVERS_LIST_PAGE_SIZE + 1;
  const listEnd =
    filteredApprovers.length === 0
      ? 0
      : Math.min(listPage * APPROVERS_LIST_PAGE_SIZE, filteredApprovers.length);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fluig-workflow-approval'] });
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/fluig/aprovadores">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/fluig/aprovadores">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Aprovadores
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Aprovações e pendências por pessoa nos fluxos G3 e G5
            </p>
          </div>

          {hasError && !isLoading ? (
            <Card className="w-full">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                <Button type="button" className="mt-4" onClick={refetch}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <FilterStatCard
                  label="Aprovadores"
                  count={summary.approvers}
                  icon={Users}
                  iconBg="bg-blue-100 dark:bg-blue-900/30"
                  iconColor="text-blue-600 dark:text-blue-400"
                  loading={isLoading}
                  onClick={() => undefined}
                />
                <FilterStatCard
                  label="Com pendências"
                  count={summary.withPending}
                  icon={Clock}
                  iconBg="bg-amber-100 dark:bg-amber-900/30"
                  iconColor="text-amber-600 dark:text-amber-400"
                  loading={isLoading}
                  onClick={() => undefined}
                />
                <FilterStatCard
                  label="Aprovações registradas"
                  count={summary.totalApprovedActions}
                  icon={CheckCircle2}
                  iconBg="bg-green-100 dark:bg-green-900/30"
                  iconColor="text-green-600 dark:text-green-400"
                  loading={isLoading}
                  onClick={() => undefined}
                />
                <FilterStatCard
                  label="Pendências atribuídas"
                  count={summary.totalPendingActions}
                  icon={Clock}
                  iconBg="bg-amber-100 dark:bg-amber-900/30"
                  iconColor="text-amber-600 dark:text-amber-400"
                  loading={isLoading}
                  onClick={() => undefined}
                />
              </div>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div className={cadastroListClasses.cardHeaderIconRow}>
                      <div className="rounded-lg bg-blue-100 p-2 sm:p-3 dark:bg-blue-900/30">
                        <Users className="h-5 w-5 text-blue-600 sm:h-6 sm:w-6 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Lista de aprovadores
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Selecione um aprovador para ver suas solicitações
                        </p>
                      </div>
                    </div>
                    <div className={cadastroListClasses.cardToolbar}>
                      <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                        <input
                          type="search"
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Buscar pessoa..."
                          disabled={isLoading}
                          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className={cadastroListClasses.cardContent}>
                  {isLoading ? (
                    <CadastroListLoading message="Carregando aprovadores..." />
                  ) : filteredApprovers.length === 0 ? (
                    <CadastroListEmpty
                      icon={Users}
                      title="Nenhum aprovador encontrado"
                      hint="Ajuste a busca ou aguarde a sincronização com o Fluig."
                    />
                  ) : (
                    <>
                      <CadastroListSummary
                        startItem={listStart}
                        endItem={listEnd}
                        total={filteredApprovers.length}
                        itemLabel="aprovador"
                        itemLabelPlural="aprovadores"
                        currentPage={listPage}
                        totalPages={totalPages}
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className={cadastroListClasses.th}>Nome</th>
                              <th className={cadastroListClasses.thCenter}>Grupos</th>
                              <th className={cadastroListClasses.thCenter}>Aprovadas</th>
                              <th className={cadastroListClasses.thCenter}>Pendentes</th>
                              <th className={cadastroListClasses.thCenter}>Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {paginatedApprovers.map((item) => (
                              <tr
                                key={item.nameKey}
                                className={getListTableRowClassName(true)}
                                onClick={() =>
                                  router.push(
                                    `/ponto/fluig/aprovadores/${encodeURIComponent(item.nameKey)}`
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    router.push(
                                      `/ponto/fluig/aprovadores/${encodeURIComponent(item.nameKey)}`
                                    );
                                  }
                                }}
                                tabIndex={0}
                                role="link"
                              >
                                <td className={cadastroListClasses.td}>
                                  <ListRowNavigableLabel>{item.name}</ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <div className="inline-flex items-center justify-center gap-1.5">
                                    {item.inG3 ? (
                                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-gray-700 dark:text-red-400">
                                        G3
                                      </span>
                                    ) : null}
                                    {item.inG5 ? (
                                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                        G5
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td
                                  className={`${cadastroListClasses.tdCenter} tabular-nums text-green-700 dark:text-green-400`}
                                >
                                  {item.approvedCount}
                                </td>
                                <td
                                  className={`${cadastroListClasses.tdCenter} tabular-nums text-amber-700 dark:text-amber-400`}
                                >
                                  {item.pendingCount}
                                </td>
                                <td className={`${cadastroListClasses.tdCenter} tabular-nums`}>
                                  {item.totalCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ListPagination
                        currentPage={listPage}
                        totalPages={totalPages}
                        onPageChange={setListPage}
                        className={cadastroListClasses.pagination}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
