'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MoreHorizontal, Search } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent } from '@/components/ui/Card';
import {
  UserPermissionsEditor,
  UserPermissionsTabBar,
  type PermissionEditorTab,
  type PermissionsTargetPreview,
} from '@/components/permissions/UserPermissionsEditor';
import api from '@/lib/api';

type PositionSummary = {
  position: string;
  slug: string;
  permissionCount: number;
  contractsAllowed: number;
};

function PermissoesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cargoParam = searchParams?.get('cargo') ?? null;
  const [selectedPosition, setSelectedPosition] = useState<string>('');
  const [listSearch, setListSearch] = useState('');
  const [permissionTab, setPermissionTab] = useState<PermissionEditorTab>('gerais');
  const [showContractsTab, setShowContractsTab] = useState(false);

  const { data: userData, isLoading: loadingMe } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: summaries = [], isLoading: loadingSummaries } = useQuery({
    queryKey: ['permission-position-summaries'],
    queryFn: async () => (await api.get('/permissions/position-summaries')).data?.data as PositionSummary[],
    retry: false,
  });

  useEffect(() => {
    if (!cargoParam) return;
    const decoded = decodeURIComponent(cargoParam).trim();
    if (decoded && summaries.some((s) => s.position === decoded)) {
      setSelectedPosition(decoded);
    }
  }, [cargoParam, summaries]);

  useEffect(() => {
    setPermissionTab('gerais');
  }, [selectedPosition]);
  useEffect(() => {
    setShowContractsTab(false);
  }, [selectedPosition]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const openCargo = (position: string) => {
    setSelectedPosition(position);
    setPermissionTab('gerais');
    router.replace(`/ponto/permissoes?cargo=${encodeURIComponent(position)}`, { scroll: false });
  };

  const closeEditor = () => {
    setSelectedPosition('');
    router.replace('/ponto/permissoes', { scroll: false });
  };

  const filteredRows = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (r) =>
        r.position.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q)
    );
  }, [summaries, listSearch]);

  const positionPreview: PermissionsTargetPreview | null = selectedPosition
    ? {
        id: selectedPosition,
        name: selectedPosition,
        email: '',
        position: selectedPosition,
      }
    : null;

  if (loadingMe || loadingSummaries) {
    return <Loading message="Carregando permissões..." fullScreen size="lg" />;
  }

  const me = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  return (
    <MainLayout userRole={me.role} userName={me.name} onLogout={handleLogout}>
      <div className="space-y-6">
        {selectedPosition && positionPreview ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="inline-flex w-fit items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  Voltar
                </button>
                <div className="min-w-0 text-center sm:text-left">
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                    Permissões do cargo
                  </h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedPosition}</span>
                    {' · '}
                    Defina módulos e contratos para quem possui este cargo no cadastro.
                  </p>
                </div>
              </div>
            </div>
            <UserPermissionsTabBar
              activeTab={permissionTab}
              onChange={setPermissionTab}
              showContracts={showContractsTab}
              className="w-full pb-2"
            />
            <UserPermissionsEditor
              userId=""
              positionTemplate={selectedPosition}
              preview={positionPreview}
              onBack={closeEditor}
              hideTopNavigation
              permissionTab={permissionTab}
              onPermissionTabChange={setPermissionTab}
              onContractsTabAvailabilityChange={setShowContractsTab}
            />
          </>
        ) : (
          <>
            <div className="text-center sm:text-left">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Permissões por cargo</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                Cada cargo possui um template de permissões. Clique em <strong className="text-gray-700 dark:text-gray-300">permissões</strong> para editar
                — mesmo fluxo da tela de permissões em Funcionários.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Buscar cargo ou slug…"
                  className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/60 dark:border-gray-700 dark:bg-gray-900/40">
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Cargo
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Slug
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Permissões
                        </th>
                        <th className="w-14 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                            {summaries.length === 0
                              ? 'Nenhum cargo cadastrado ainda (cadastre funcionários com cargo diferente de Administrador).'
                              : 'Nenhum cargo encontrado com a busca.'}
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => (
                          <tr
                            key={row.position}
                            className="transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-800/40"
                          >
                            <td className="px-4 py-4 align-top">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">{row.position}</p>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                Template de acesso ao sistema para este cargo
                              </p>
                            </td>
                            <td className="px-4 py-4 align-middle">
                              <code className="rounded-md border border-gray-200 bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                {row.slug}
                              </code>
                            </td>
                            <td className="px-4 py-4 align-middle">
                              <button
                                type="button"
                                onClick={() => openCargo(row.position)}
                                className="text-left text-sm font-medium text-red-600 underline decoration-red-600/40 underline-offset-2 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                              >
                                {row.permissionCount} permissões
                                {row.contractsAllowed > 0 ? (
                                  <span className="font-normal text-gray-500 dark:text-gray-400">
                                    {' '}
                                    · {row.contractsAllowed} contrato
                                    {row.contractsAllowed !== 1 ? 's' : ''}
                                  </span>
                                ) : null}
                              </button>
                            </td>
                            <td className="px-4 py-4 text-right align-middle">
                              <button
                                type="button"
                                onClick={() => openCargo(row.position)}
                                className="inline-flex rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                aria-label="Abrir permissões"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}

export default function PermissoesPage() {
  return (
    <Suspense fallback={<Loading message="Carregando permissões..." fullScreen size="lg" />}>
      <PermissoesPageContent />
    </Suspense>
  );
}
