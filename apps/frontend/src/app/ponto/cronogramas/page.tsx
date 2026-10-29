'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarRange, CheckCircle, Filter, Layers, PlayCircle, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading, formatCadastroListId } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { OrcamentoRevisaoBadge } from '@/components/orcamento/OrcamentoRevisaoBadge';
import { sincronizarCronogramasRecentes } from '@/lib/cronogramaNovos';
import { authService } from '@/lib/auth';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';

type ContractRow = {
  id: string;
  name?: string;
  number?: string;
  costCenterId?: string | null;
};

type OrcamentoListaRow = {
  id: string;
  nome: string;
  updatedAt: string;
  statusAprovacao?: string;
  versao?: number;
  familiaId?: string;
  cronogramaProgressoFisico?: number;
  cronogramaConcluido?: number;
  cronogramaTotalEtapas?: number;
  cronogramaAtrasado?: number;
};

type CronogramaListItem = {
  contractId: string;
  contractName: string;
  orcamentoId: string;
  nome: string;
  codigo: string;
  updatedAt: string;
  familiaId: string;
  revisao: number;
  progressoFisico?: number;
  concluido?: number;
  totalEtapas?: number;
  atrasado?: number;
};

const ITEMS_PER_PAGE = 20;

type StatusCard = 'all' | 'andamento' | 'atrasados' | 'concluidos';

const STATUS_LIST_HEADER: Record<
  StatusCard,
  { title: string; subtitle: string; Icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Cronogramas',
    subtitle: 'Todos os orçamentos com cronograma dos seus contratos',
    Icon: Layers,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  andamento: {
    title: 'Em andamento',
    subtitle: 'Cronogramas com obra iniciada e ainda não concluída',
    Icon: PlayCircle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  atrasados: {
    title: 'Com etapas atrasadas',
    subtitle: 'Cronogramas com pelo menos uma etapa atrasada',
    Icon: AlertTriangle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  concluidos: {
    title: 'Concluídos',
    subtitle: 'Cronogramas com 100% de progresso',
    Icon: CheckCircle,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
};

function matchesStatusCard(item: { progressoFisico?: number; atrasado?: number }, card: StatusCard): boolean {
  const pct = item.progressoFisico ?? 0;
  if (card === 'andamento') return pct > 0 && pct < 100;
  if (card === 'atrasados') return (item.atrasado ?? 0) > 0;
  if (card === 'concluidos') return pct >= 100;
  return true;
}

function codigoFromNomeOrcamento(nome: string): string {
  const m = String(nome || '').match(/\(([^)]+)\)\s*$/);
  return m?.[1]?.trim() || '';
}

function nomeOrcamentoSemCodigo(nome: string): string {
  return (
    String(nome || '')
      .replace(/\s*\([^)]+\)\s*$/, '')
      .trim() || String(nome || '')
  );
}

function formatPctLista(v: number | undefined): string {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return `${n.toFixed(1).replace('.', ',')}%`;
}

export default function CronogramasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contratoFromUrl = (searchParams?.get('contrato') || '').trim();
  const [searchTerm, setSearchTerm] = useState('');
  const [contratoFiltro, setContratoFiltro] = useState(contratoFromUrl);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusCard, setStatusCard] = useState<StatusCard>('all');
  const { canAccessContract, isAdministrator, isLoading: loadingPermissions } = usePermissions();

  useEffect(() => {
    setContratoFiltro(contratoFromUrl);
    setCurrentPage(1);
  }, [contratoFromUrl]);

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
    },
  });

  const { data: contractsData, isLoading: loadingContracts } = useQuery({
    queryKey: ['contracts', 'cronogramas-all'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500 } });
      return res.data;
    },
    enabled: !loadingUser,
  });

  const contractsLiberados = useMemo(() => {
    const raw = contractsData?.data ?? contractsData;
    const list = Array.isArray(raw) ? (raw as ContractRow[]) : [];
    return list
      .filter((c) => {
        if (!c?.id || !c.costCenterId) return false;
        if (isAdministrator) return true;
        return canAccessContract(c.id);
      })
      .sort((a, b) =>
        (a.name || a.number || '').localeCompare(b.name || b.number || '', 'pt-BR', {
          sensitivity: 'base',
        })
      );
  }, [contractsData, isAdministrator, canAccessContract]);

  const contratoFilterOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contractsLiberados.map((c) => ({
          value: c.id,
          label: (c.name || c.number || c.id).trim(),
        }))
      ),
    [contractsLiberados]
  );

  const hasActiveFilters = Boolean(contratoFiltro);

  const { data: cronogramasData, isLoading: loadingOrcamentos } = useQuery({
    queryKey: [
      'cronogramas-todos',
      'v2',
      contractsLiberados.map((c) => c.id).sort().join(','),
    ],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        contractsLiberados.map(async (c) => {
          const res = await api.get(`/orcamento/${c.costCenterId}`, { timeout: 60000 });
          const orcs = (Array.isArray(res.data?.orcamentos)
            ? res.data.orcamentos
            : []) as OrcamentoListaRow[];
          return orcs
            .filter((o) => {
              const status = String(o.statusAprovacao || '').trim().toLowerCase();
              const versao = Number(o.versao);
              const revisao = Number.isFinite(versao) && versao >= 1 ? Math.floor(versao) : 1;
              return (
                revisao > 1 ||
                status === 'finalizado' ||
                status === 'aguardando_aprovacao' ||
                status === 'aprovado'
              );
            })
            .map(
            (o): CronogramaListItem => {
              const versao = Number(o.versao);
              const revisao = Number.isFinite(versao) && versao >= 1 ? Math.floor(versao) : 1;
              const nomeBase = nomeOrcamentoSemCodigo(o.nome) || o.nome;
              return {
              contractId: c.id,
              contractName: (c.name || c.number || c.id).trim(),
              orcamentoId: o.id,
              nome: nomeBase,
              codigo: codigoFromNomeOrcamento(o.nome),
              updatedAt: o.updatedAt || '',
              familiaId: (o.familiaId || '').trim() || o.id,
              revisao,
              progressoFisico:
                typeof o.cronogramaProgressoFisico === 'number' && Number.isFinite(o.cronogramaProgressoFisico)
                  ? o.cronogramaProgressoFisico
                  : undefined,
              concluido:
                typeof o.cronogramaConcluido === 'number' && Number.isFinite(o.cronogramaConcluido)
                  ? o.cronogramaConcluido
                  : undefined,
              totalEtapas:
                typeof o.cronogramaTotalEtapas === 'number' && Number.isFinite(o.cronogramaTotalEtapas)
                  ? o.cronogramaTotalEtapas
                  : undefined,
              atrasado:
                typeof o.cronogramaAtrasado === 'number' && Number.isFinite(o.cronogramaAtrasado)
                  ? o.cronogramaAtrasado
                  : undefined,
            };
            }
          );
        })
      );
      // Um cronograma por orçamento: das revisões da mesma família fica só a mais recente.
      const maisRecentePorFamilia = new Map<string, CronogramaListItem>();
      for (const r of settled) {
        if (r.status !== 'fulfilled') continue;
        for (const item of r.value) {
          const key = `${item.contractId}|${item.familiaId}`;
          const atual = maisRecentePorFamilia.get(key);
          if (!atual || item.revisao > atual.revisao) maisRecentePorFamilia.set(key, item);
        }
      }
      const items: CronogramaListItem[] = [...maisRecentePorFamilia.values()];
      items.sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      });
      return items;
    },
    enabled: !loadingContracts && !loadingPermissions && contractsLiberados.length > 0,
  });

  useEffect(() => {
    const userId = authService.getUser()?.id;
    if (!userId || !Array.isArray(cronogramasData)) return;
    sincronizarCronogramasRecentes(userId, cronogramasData);
  }, [cronogramasData]);

  const stats = useMemo(() => {
    const list = (Array.isArray(cronogramasData) ? cronogramasData : []).filter(
      (o) => !contratoFiltro || o.contractId === contratoFiltro
    );
    return {
      total: list.length,
      andamento: list.filter((o) => matchesStatusCard(o, 'andamento')).length,
      atrasados: list.filter((o) => matchesStatusCard(o, 'atrasados')).length,
      concluidos: list.filter((o) => matchesStatusCard(o, 'concluidos')).length,
    };
  }, [cronogramasData, contratoFiltro]);

  const listHeader = STATUS_LIST_HEADER[statusCard];
  const ListHeaderIcon = listHeader.Icon;

  // Numeração em sequência (o mais recente tem o maior número), mantida ao filtrar/buscar.
  const numeroPorOrcamento = useMemo(() => {
    const list = Array.isArray(cronogramasData) ? cronogramasData : [];
    const map = new Map<string, number>();
    list.forEach((o, i) => map.set(o.orcamentoId, list.length - i));
    return map;
  }, [cronogramasData]);

  const cronogramas = useMemo(() => {
    const list = Array.isArray(cronogramasData) ? cronogramasData : [];
    const q = searchTerm.trim().toLowerCase();
    return list.filter((o) => {
      if (contratoFiltro && o.contractId !== contratoFiltro) return false;
      if (!matchesStatusCard(o, statusCard)) return false;
      if (!q) return true;
      const nome = (o.nome || '').toLowerCase();
      const codigo = (o.codigo || '').toLowerCase();
      const contrato = (o.contractName || '').toLowerCase();
      return nome.includes(q) || codigo.includes(q) || contrato.includes(q);
    });
  }, [cronogramasData, searchTerm, contratoFiltro, statusCard]);

  const totalFiltered = cronogramas.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = cronogramas.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const isLoadingList =
    loadingContracts || loadingPermissions || (contractsLiberados.length > 0 && loadingOrcamentos);
  const isListEmpty = !isLoadingList && totalFiltered === 0;
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/cronogramas">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/cronogramas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Cronogramas"
            description="Cronogramas dos orçamentos dos contratos liberados para você."
          />

          <div className={pageStatCardsGridClass}>
            <FilterStatCard
              label="Total"
              count={stats.total}
              icon={Layers}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              isActive={statusCard === 'all'}
              onClick={() => {
                setStatusCard('all');
                setCurrentPage(1);
              }}
            />
            <FilterStatCard
              label="Em andamento"
              count={stats.andamento}
              icon={PlayCircle}
              iconBg="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
              isActive={statusCard === 'andamento'}
              onClick={() => {
                setStatusCard('andamento');
                setCurrentPage(1);
              }}
            />
            <FilterStatCard
              label="Atrasados"
              count={stats.atrasados}
              icon={AlertTriangle}
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
              isActive={statusCard === 'atrasados'}
              onClick={() => {
                setStatusCard('atrasados');
                setCurrentPage(1);
              }}
            />
            <FilterStatCard
              label="Concluídos"
              count={stats.concluidos}
              icon={CheckCircle}
              iconBg="bg-emerald-100 dark:bg-emerald-900/30"
              iconColor="text-emerald-600 dark:text-emerald-400"
              isActive={statusCard === 'concluidos'}
              onClick={() => {
                setStatusCard('concluidos');
                setCurrentPage(1);
              }}
            />
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por orçamento ou código..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setCurrentPage(1);
                        }}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilters ? 'Filtro (contrato ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingList ? (
                <CadastroListLoading message="Carregando cronogramas..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <CalendarRange className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhum cronograma encontrado</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim() || hasActiveFilters
                      ? 'Tente ajustar os filtros'
                      : contractsLiberados.length === 0
                        ? 'Você não tem contratos liberados'
                        : 'Não há orçamentos nos contratos liberados'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="w-[1%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            ID
                          </th>
                          <th className="w-[10%] px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Código
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Orçamento
                          </th>
                          <th className="w-[8%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4">
                            Revisão
                          </th>
                          <th className="w-[16%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="w-[10%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4">
                            Progresso
                          </th>
                          <th className="w-[10%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4">
                            Concluídos
                          </th>
                          <th className="w-[10%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4">
                            Atrasados
                          </th>
                          <th className="w-[14%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Atualizado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pageRows.map((o) => (
                          <tr
                            key={`${o.contractId}-${o.orcamentoId}`}
                            onClick={() =>
                              router.push(`/ponto/cronogramas/${o.contractId}/${o.orcamentoId}`)
                            }
                            className={getListTableRowClassName(true)}
                            aria-label={`Abrir cronograma de ${o.nome}`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                              {numeroPorOrcamento.get(o.orcamentoId) ?? '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCadastroListId(o.codigo || null)}
                            </td>
                            <td className="max-w-0 px-3 py-3 sm:px-6">
                              <ListRowNavigableLabel className="block whitespace-normal break-words font-medium">
                                {o.nome}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center sm:px-4">
                              <OrcamentoRevisaoBadge versao={o.revisao} size="sm" />
                            </td>
                            <td className="max-w-0 px-3 py-3 text-center sm:px-6">
                              <span className="block truncate text-sm text-gray-700 dark:text-gray-300">
                                {o.contractName}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums font-semibold text-gray-900 dark:text-gray-100 sm:px-4">
                              {formatPctLista(o.progressoFisico)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 sm:px-4">
                              {`${o.concluido ?? 0}/${o.totalEtapas ?? 0}`}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums font-semibold sm:px-4 ${
                                (o.atrasado ?? 0) > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {o.atrasado ?? 0}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 sm:px-6">
                              {o.updatedAt
                                ? new Date(o.updatedAt).toLocaleString('pt-BR')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 ? (
                    <div className="mt-4">
                      <ListPagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={isFiltersModalOpen}
            onClose={() => setIsFiltersModalOpen(false)}
            title="Filtros"
            size="md"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contrato
                </label>
                <StringSingleSelectDropdown
                  value={contratoFiltro}
                  onChange={(value) => {
                    setContratoFiltro(value);
                    setCurrentPage(1);
                  }}
                  options={contratoFilterOptions}
                  allowEmpty
                  emptyOptionLabel="Todos os contratos"
                  placeholder="Todos os contratos"
                  searchPlaceholder="Pesquisar contrato..."
                  emptyOptionsMessage="Nenhum contrato disponível."
                  className="w-full"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setContratoFiltro('');
                    setCurrentPage(1);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
