'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Filter, Plus, Search, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading, formatCadastroListId } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { Modal } from '@/components/ui/Modal';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import { OrcamentoPageView } from '@/app/ponto/orcamento/OrcamentoPageView';

type ContractRow = {
  id: string;
  name?: string;
  number?: string;
  costCenterId?: string | null;
};

type OrcamentoStatusAprovacao =
  | 'rascunho'
  | 'pronta'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'em_correcao'
  | 'reprovado';

type OrcamentoListaRow = {
  id: string;
  nome: string;
  updatedAt: string;
  statusAprovacao?: string;
  bdiPercentual?: number;
  totalComBdi?: number;
};

type OrcamentoListItem = {
  id: string;
  contractId: string;
  costCenterId: string;
  contractName: string;
  orcamentoId: string;
  nome: string;
  codigo: string;
  updatedAt: string;
  status: OrcamentoStatusAprovacao;
  bdiPercentual?: number;
  totalComBdi?: number;
};

const ITEMS_PER_PAGE = 20;

const ORCAMENTO_STATUS_LABELS: Record<OrcamentoStatusAprovacao, string> = {
  rascunho: 'Rascunho',
  pronta: 'FD pronta',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  em_correcao: 'Em correção',
  reprovado: 'Reprovado',
};

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

function normalizarStatusAprovacao(raw: unknown): OrcamentoStatusAprovacao {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (
    s === 'pronta' ||
    s === 'aguardando_aprovacao' ||
    s === 'aprovado' ||
    s === 'em_correcao' ||
    s === 'reprovado' ||
    s === 'rascunho'
  ) {
    return s;
  }
  return 'rascunho';
}

function orcamentoStatusBadgeClass(status: OrcamentoStatusAprovacao): string {
  const base =
    'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap';
  switch (status) {
    case 'pronta':
      return `${base} bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200`;
    case 'aguardando_aprovacao':
      return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
    case 'aprovado':
      return `${base} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200`;
    case 'em_correcao':
      return `${base} bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200`;
    case 'reprovado':
      return `${base} bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200`;
    default:
      return `${base} bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200`;
  }
}

function formatCurrencyBrl(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBdiPct(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2).replace('.', ',')}%`;
}

export default function OrcamentosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const contratoFromUrl = (searchParams?.get('contrato') || '').trim();
  const [searchTerm, setSearchTerm] = useState('');
  const [contratoFiltro, setContratoFiltro] = useState(contratoFromUrl);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [contratoActionModal, setContratoActionModal] = useState<'novo' | null>(null);
  const [actionContratoId, setActionContratoId] = useState('');
  const [importShellOpen, setImportShellOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<OrcamentoListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const {
    canAccessContractOrcamentoTab,
    isAdministrator,
    isLoading: loadingPermissions,
  } = usePermissions();

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
    queryKey: ['contracts', 'orcamentos-all'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500 } });
      return res.data;
    },
    enabled: !loadingUser,
  });

  const contractsComOrcamento = useMemo(() => {
    const raw = contractsData?.data ?? contractsData;
    const list = Array.isArray(raw) ? (raw as ContractRow[]) : [];
    return list
      .filter((c) => {
        if (!c?.id || !c.costCenterId) return false;
        if (isAdministrator) return true;
        return canAccessContractOrcamentoTab(c.id);
      })
      .sort((a, b) =>
        (a.name || a.number || '').localeCompare(b.name || b.number || '', 'pt-BR', {
          sensitivity: 'base',
        })
      );
  }, [contractsData, isAdministrator, canAccessContractOrcamentoTab]);

  const contratoFilterOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contractsComOrcamento.map((c) => ({
          value: c.id,
          label: (c.name || c.number || c.id).trim(),
        }))
      ),
    [contractsComOrcamento]
  );

  const hasActiveFilters = Boolean(contratoFiltro);

  const contractsKey = contractsComOrcamento.map((c) => c.id).sort().join(',');

  const { data: orcamentosData, isLoading: loadingOrcamentos } = useQuery({
    queryKey: ['orcamentos-todos', contractsKey],
    queryFn: async () => {
      const settled = await Promise.allSettled(
        contractsComOrcamento.map(async (c) => {
          const res = await api.get(`/orcamento/${c.costCenterId}`, { timeout: 60000 });
          const orcs = (Array.isArray(res.data?.orcamentos)
            ? res.data.orcamentos
            : []) as OrcamentoListaRow[];
          return orcs.map(
            (o): OrcamentoListItem => ({
              id: `${c.id}-${o.id}`,
              contractId: c.id,
              costCenterId: String(c.costCenterId),
              contractName: (c.name || c.number || c.id).trim(),
              orcamentoId: o.id,
              nome: nomeOrcamentoSemCodigo(o.nome) || o.nome,
              codigo: codigoFromNomeOrcamento(o.nome),
              updatedAt: o.updatedAt || '',
              status: normalizarStatusAprovacao(o.statusAprovacao),
              bdiPercentual:
                typeof o.bdiPercentual === 'number' && Number.isFinite(o.bdiPercentual)
                  ? o.bdiPercentual
                  : undefined,
              totalComBdi:
                typeof o.totalComBdi === 'number' && Number.isFinite(o.totalComBdi)
                  ? o.totalComBdi
                  : undefined,
            })
          );
        })
      );
      const items: OrcamentoListItem[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') items.push(...r.value);
      }
      // Mesmo centro de custo em 2 contratos espelhava o mesmo orçamento duas vezes.
      const vistos = new Set<string>();
      const unicos: OrcamentoListItem[] = [];
      for (const item of items) {
        const chave = `${item.costCenterId}::${item.orcamentoId}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        unicos.push(item);
      }
      unicos.sort((a, b) => {
        const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return tb - ta;
      });
      return unicos;
    },
    enabled: !loadingContracts && !loadingPermissions && contractsComOrcamento.length > 0,
  });

  const orcamentos = useMemo(() => {
    const list = Array.isArray(orcamentosData) ? orcamentosData : [];
    const q = searchTerm.trim().toLowerCase();
    return list.filter((o) => {
      if (contratoFiltro && o.contractId !== contratoFiltro) return false;
      if (!q) return true;
      const nome = (o.nome || '').toLowerCase();
      const codigo = (o.codigo || '').toLowerCase();
      const contrato = (o.contractName || '').toLowerCase();
      const status = (ORCAMENTO_STATUS_LABELS[o.status] || '').toLowerCase();
      return (
        nome.includes(q) || codigo.includes(q) || contrato.includes(q) || status.includes(q)
      );
    });
  }, [orcamentosData, searchTerm, contratoFiltro]);

  const totalFiltered = orcamentos.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const pageRows = orcamentos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(orcamentos);

  const isLoadingList =
    loadingContracts || loadingPermissions || (contractsComOrcamento.length > 0 && loadingOrcamentos);
  const isListEmpty = !isLoadingList && totalFiltered === 0;
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const abrirOrcamento = (o: OrcamentoListItem) => {
    router.push(`/ponto/orcamentos/${o.contractId}/${o.orcamentoId}`);
  };

  const irParaNovoNoContrato = (contractId: string) => {
    // Cria no contrato, mas com origem na lista global para o breadcrumb/URL finais.
    router.push(`/ponto/contratos/${contractId}/orcamento?novo=1&origem=lista`);
  };

  const abrirFluxoImportar = () => {
    if (contractsComOrcamento.length === 0) {
      toast.error('Nenhum contrato com permissão de orçamento.');
      return;
    }
    setImportShellOpen(true);
  };

  const abrirFluxoNovoOrcamento = () => {
    if (contractsComOrcamento.length === 0) {
      toast.error('Nenhum contrato com permissão de orçamento.');
      return;
    }
    if (contratoFiltro && contractsComOrcamento.some((c) => c.id === contratoFiltro)) {
      irParaNovoNoContrato(contratoFiltro);
      return;
    }
    if (contractsComOrcamento.length === 1) {
      irParaNovoNoContrato(contractsComOrcamento[0].id);
      return;
    }
    setActionContratoId('');
    setContratoActionModal('novo');
  };

  const confirmarNovoComContrato = () => {
    const id = actionContratoId.trim();
    if (!id) {
      toast.error('Selecione o contrato.');
      return;
    }
    setContratoActionModal(null);
    irParaNovoNoContrato(id);
  };

  const importContractOptions = useMemo(
    () =>
      contractsComOrcamento
        .filter((c) => Boolean(c.costCenterId))
        .map((c) => ({
          id: c.id,
          costCenterId: String(c.costCenterId),
          label: (c.name || c.number || c.id).trim(),
        })),
    [contractsComOrcamento]
  );

  const confirmarExclusao = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await api.delete(
        `/orcamento/${deleteTarget.costCenterId}/orcamentos/${deleteTarget.orcamentoId}`
      );
      toast.success('Orçamento excluído.');
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['orcamentos-todos'] });
    } catch {
      toast.error('Não foi possível excluir o orçamento.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/orcamentos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Orçamentos"
            description="Orçamentos dos contratos liberados para você."
          />

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Calculator className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Orçamentos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Crie, edite e exclua os orçamentos dos seus contratos
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por orçamento, código ou contrato..."
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
                  <button
                    type="button"
                    onClick={abrirFluxoImportar}
                    disabled={isLoadingList || contractsComOrcamento.length === 0}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
                    title="Importar orçamento"
                    aria-label="Importar orçamento"
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={abrirFluxoNovoOrcamento}
                    disabled={isLoadingList || contractsComOrcamento.length === 0}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 active:bg-red-200/80 disabled:pointer-events-none disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40 dark:active:bg-red-900/55"
                  >
                    <Plus className="h-4 w-4 shrink-0" aria-hidden />
                    Novo orçamento
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingList ? (
                <CadastroListLoading message="Carregando orçamentos..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <Calculator className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhum orçamento encontrado</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim() || hasActiveFilters
                      ? 'Tente ajustar os filtros'
                      : contractsComOrcamento.length === 0
                        ? 'Você não tem contratos com acesso a orçamento'
                        : 'Não há orçamentos nos contratos disponíveis'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="w-[10%] px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Código
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Descrição
                          </th>
                          <th className="w-[14%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="w-[14%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4">
                            Status
                          </th>
                          <th className="w-[10%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4">
                            BDI
                          </th>
                          <th className="w-[14%] px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Total
                          </th>
                          <th className="w-[14%] px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Atualizado
                          </th>
                          <th className={cadastroListClasses.thRight}>Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pageRows.map((o) => (
                          <tr
                            key={o.id}
                            onClick={() => abrirOrcamento(o)}
                            className={getListTableRowClassName(true)}
                            aria-label={`Abrir orçamento ${o.nome}`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCadastroListId(o.codigo || null)}
                            </td>
                            <td className="max-w-0 px-3 py-3 sm:px-6">
                              <ListRowNavigableLabel className="block truncate font-medium">
                                {o.nome}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="max-w-0 px-3 py-3 text-center sm:px-6">
                              <span className="block truncate text-sm text-gray-700 dark:text-gray-300">
                                {o.contractName}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center sm:px-4">
                              <span className={orcamentoStatusBadgeClass(o.status)}>
                                {ORCAMENTO_STATUS_LABELS[o.status]}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 sm:px-4">
                              {formatBdiPct(o.bdiPercentual)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums font-medium text-gray-900 dark:text-gray-100 sm:px-6">
                              {formatCurrencyBrl(o.totalComBdi)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 sm:px-6">
                              {o.updatedAt
                                ? new Date(o.updatedAt).toLocaleString('pt-BR')
                                : '—'}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(o.id)}
                              onToggle={(e) => toggleRowActionMenu(o.id, e.currentTarget)}
                            />
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
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => {
                        closeRowActionMenu();
                        abrirOrcamento(rowForActionMenu);
                      }}
                      onDelete={() => {
                        closeRowActionMenu();
                        setDeleteTarget(rowForActionMenu);
                      }}
                    />
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

          <Modal
            isOpen={contratoActionModal != null}
            onClose={() => setContratoActionModal(null)}
            title="Novo orçamento"
            size="md"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Selecione o contrato em que o orçamento será criado.
              </p>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contrato
                </label>
                <StringSingleSelectDropdown
                  value={actionContratoId}
                  onChange={setActionContratoId}
                  options={contratoFilterOptions}
                  allowEmpty
                  emptyOptionLabel="Selecione…"
                  placeholder="Selecione o contrato"
                  searchPlaceholder="Pesquisar contrato..."
                  emptyOptionsMessage="Nenhum contrato disponível."
                  className="w-full"
                />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setContratoActionModal(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarNovoComContrato}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Continuar
                </button>
              </div>
            </div>
          </Modal>

          {importShellOpen ? (
            <OrcamentoPageView
              key={`import-shell-${contratoFiltro || 'all'}`}
              importShellOnly
              deferContractOnImport
              autoOpenImportOrcamento
              importContractOptions={importContractOptions}
              initialImportContractId={
                contratoFiltro && contractsComOrcamento.some((c) => c.id === contratoFiltro)
                  ? contratoFiltro
                  : contractsComOrcamento.length === 1
                    ? contractsComOrcamento[0].id
                    : null
              }
              onImportShellDismiss={() => {
                setImportShellOpen(false);
                void queryClient.invalidateQueries({ queryKey: ['orcamentos-todos'] });
              }}
            />
          ) : null}

          <Modal
            isOpen={Boolean(deleteTarget)}
            onClose={() => {
              if (!isDeleting) setDeleteTarget(null);
            }}
            title="Excluir orçamento?"
            size="md"
          >
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tem certeza que deseja excluir o orçamento{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {deleteTarget?.nome}
                </span>
                ? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteTarget(null)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void confirmarExclusao()}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </Modal>
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
