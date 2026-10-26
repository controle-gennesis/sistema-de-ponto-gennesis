'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, ChevronRight, Clock, ClipboardCheck, Edit, Eye, LayoutList, MoreVertical, Plus, Search, Trash2, Upload, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { FichaDemandaApprovalFormModal } from '@/components/engenharia/FichaDemandaApprovalFormModal';
import { FichaDemandaDetailModal } from '@/components/engenharia/FichaDemandaDetailModal';
import { FichaDemandaImportModal } from '@/components/engenharia/FichaDemandaImportModal';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import api from '@/lib/api';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import {
  formatCurrencyDisplay,
  formToApiPayload,
  pedidosStatusBadgeClass,
  pedidosStatusLabel,
  type FichaDemandaApprovalFormState,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { FilterStatCard } from '@/components/ui/FilterStatCard';

const ROW_ACTION_MENU_WIDTH_PX = 224;

/** Resultado somado de um nível (FD, OS, obra ou centro de custo). */
type ResultadoFd = { faturamento: number; custoEstimado: number; custoReal: number; pagoOcs: number };

const RESULTADO_ZERO: ResultadoFd = { faturamento: 0, custoEstimado: 0, custoReal: 0, pagoOcs: 0 };

function somarResultado(rows: FichaDemandaApprovalRecord[]): ResultadoFd {
  return rows.reduce<ResultadoFd>(
    (acc, r) => ({
      faturamento: acc.faturamento + (Number(r.faturamentoEstimado) || 0),
      custoEstimado: acc.custoEstimado + (Number(r.custoEstimado) || 0),
      custoReal: acc.custoReal + (Number(r.custoReal) || 0),
      pagoOcs: acc.pagoOcs + (Number(r.totalPagoOcs) || 0),
    }),
    { ...RESULTADO_ZERO }
  );
}

type NivelOs = { key: string; label: string; rows: FichaDemandaApprovalRecord[]; resultado: ResultadoFd };
type NivelObra = { key: string; label: string; oss: NivelOs[]; total: number; resultado: ResultadoFd };
type NivelCc = { key: string; label: string; obras: NivelObra[]; total: number; resultado: ResultadoFd };

const SEM_CC = 'Sem centro de custo';
const SEM_OBRA = 'Sem obra';
const SEM_OS = 'Sem OS';

const porNome = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, 'pt-BR', { numeric: true, sensitivity: 'base' });

/** Centro de custo → obra → OS/pasta → FDs, em ordem alfabética, com o resultado somado em cada nível. */
function agruparFds(rows: FichaDemandaApprovalRecord[]): NivelCc[] {
  const ccs = new Map<string, Map<string, Map<string, FichaDemandaApprovalRecord[]>>>();
  for (const r of rows) {
    const cc = r.centroCustoNome?.trim() || SEM_CC;
    const obra = r.obra?.trim().toUpperCase() || SEM_OBRA;
    const os = r.osNumeroPasta?.trim() || SEM_OS;
    const obras = ccs.get(cc) ?? new Map<string, Map<string, FichaDemandaApprovalRecord[]>>();
    const oss = obras.get(obra) ?? new Map<string, FichaDemandaApprovalRecord[]>();
    oss.set(os, [...(oss.get(os) ?? []), r]);
    obras.set(obra, oss);
    ccs.set(cc, obras);
  }
  return [...ccs].map(([cc, obras]) => {
    const niveisObra = [...obras].map(([obra, oss]) => {
      const niveisOs = [...oss]
        .map(([os, fds]) => ({
          key: `${cc}|${obra}|${os}`,
          label: os,
          rows: fds,
          resultado: somarResultado(fds),
        }))
        .sort(porNome);
      const todas = niveisOs.flatMap((o) => o.rows);
      return { key: `${cc}|${obra}`, label: obra, oss: niveisOs, total: todas.length, resultado: somarResultado(todas) };
    });
    niveisObra.sort(porNome);
    const todas = niveisObra.flatMap((o) => o.oss.flatMap((x) => x.rows));
    return { key: cc, label: cc, obras: niveisObra, total: todas.length, resultado: somarResultado(todas) };
  }).sort(porNome);
}

/**
 * Colunas fixas do resultado: as quatro colunas de valor têm a mesma largura em todos os níveis
 * (geral, centro de custo, obra, OS) e na tabela das FDs, para os valores ficarem alinhados.
 */
const COL_VALOR = 'w-[11rem] min-w-[11rem] max-w-[11rem] px-3 text-right';

/** Resultado do nível: faturamento estimado, custo estimado (40%), custo real e total pago em OCs. */
function ResultadoNivel({ resultado }: { resultado: ResultadoFd }) {
  const acimaEstimado = resultado.custoReal > resultado.custoEstimado && resultado.custoReal > 0;
  const item = (rotulo: string, valor: number, cls = 'text-gray-900 dark:text-gray-100') => (
    <div className={COL_VALOR}>
      <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{rotulo}</p>
      <p className={`text-sm font-semibold tabular-nums ${cls}`}>{formatCurrencyDisplay(valor)}</p>
    </div>
  );
  return (
    <div className="flex shrink-0 items-center self-end lg:self-auto">
      {item('Faturamento estimado', resultado.faturamento)}
      {item('Custo estimado (40%)', resultado.custoEstimado, 'text-amber-600 dark:text-amber-400')}
      {item(
        'Custo real',
        resultado.custoReal,
        acimaEstimado ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
      )}
      {item('Pago em OCs', resultado.pagoOcs, 'text-emerald-700 dark:text-emerald-400')}
    </div>
  );
}

export default function AprovacaoFdsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contratoFiltro = (searchParams?.get('contrato') || '').trim();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  /** Níveis abertos (centro de custo, obra e OS), pela chave do nível. */
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FichaDemandaApprovalRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<FichaDemandaApprovalRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'WAITING_MANAGER' | 'APPROVED' | 'REJECTED_CANCELLED'>('ALL');
  const [rowActionMenu, setRowActionMenu] = useState<{
    rowId: string;
    top: number;
    left: number;
  } | null>(null);

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

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['demand-sheet-approvals', searchTerm, contratoFiltro],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals', {
        params: {
          search: searchTerm || undefined,
          contratoId: contratoFiltro || undefined,
        },
      });
      return (res.data?.data || []) as FichaDemandaApprovalRecord[];
    },
    enabled: !loadingUser,
  });

  // Só informação real: FD cancelada ou cujo orçamento de origem foi excluído não entra na página nem nos resultados.
  const allRecords = useMemo(
    () => (listData || []).filter((r) => r.status !== 'CANCELLED' && r.orcamentoExiste !== false),
    [listData]
  );

  const statusCounts = useMemo(() => {
    let waiting = 0;
    let approved = 0;
    let rejectedCancelled = 0;
    for (const r of allRecords) {
      if (r.status === 'WAITING_MANAGER') waiting++;
      else if (r.status === 'APPROVED') approved++;
      else rejectedCancelled++;
    }
    return { WAITING_MANAGER: waiting, APPROVED: approved, REJECTED_CANCELLED: rejectedCancelled, ALL: allRecords.length };
  }, [allRecords]);

  const records = useMemo(() => {
    if (statusFilter === 'ALL') return allRecords;
    if (statusFilter === 'REJECTED_CANCELLED') return allRecords.filter((r) => r.status === 'REJECTED');
    return allRecords.filter((r) => r.status === statusFilter);
  }, [allRecords, statusFilter]);

  const totalFiltered = records.length;
  const isListEmpty = !loadingList && totalFiltered === 0;
  const niveis = useMemo(() => agruparFds(records), [records]);
  const resultadoGeral = useMemo(() => somarResultado(records), [records]);
  // Com busca, abre todos os níveis até as FDs encontradas.
  const buscando = searchTerm.trim() !== '';
  const estaAberto = (key: string) => buscando || abertos.has(key);
  const alternar = (key: string) =>
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rowForActionMenu = rowActionMenu
    ? records.find((r) => r.id === rowActionMenu.rowId) ?? null
    : null;

  useEffect(() => {
    if (!rowActionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRowActionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowActionMenu]);

  useEffect(() => {
    if (rowActionMenu && !records.some((r) => r.id === rowActionMenu.rowId)) {
      setRowActionMenu(null);
    }
  }, [rowActionMenu, records]);

  const modalOpen = showForm || deleteId != null || detailRecord != null;

  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [modalOpen]);

  const createMutation = useMutation({
    mutationFn: async (form: FichaDemandaApprovalFormState) => {
      const res = await api.post('/demand-sheet-approvals', formToApiPayload(form));
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha registrada. Aguardando aprovação.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setShowForm(false);
      setEditingRecord(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao salvar ficha');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      form,
    }: {
      id: string;
      form: FichaDemandaApprovalFormState;
    }) => {
      const res = await api.patch(`/demand-sheet-approvals/${id}`, formToApiPayload(form));
      return res.data;
    },
    onSuccess: () => {
      toast.success('Ficha atualizada.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setShowForm(false);
      setEditingRecord(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao atualizar ficha');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/demand-sheet-approvals/${id}`);
    },
    onSuccess: () => {
      toast.success('Registro excluído.');
      void queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
      setDeleteId(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao excluir');
    },
  });

  const handleSave = (form: FichaDemandaApprovalFormState) => {
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const openCreate = () => {
    setEditingRecord(null);
    setShowForm(true);
  };

  const openDetail = (row: FichaDemandaApprovalRecord) => {
    setDetailRecord(row);
  };

  const openEdit = (row: FichaDemandaApprovalRecord) => {
    if (row.status !== 'WAITING_MANAGER' && row.status !== 'REJECTED') {
      toast.error('Somente fichas aguardando aprovação ou reprovadas podem ser editadas.');
      return;
    }
    setEditingRecord(row);
    setShowForm(true);
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/aprovacao-fds">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/aprovacao-fds">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Fichas de Demanda"
            description="Cadastre e acompanhe as fichas de demanda."
          />

          <div className={pageStatCardsGridClass}>
            <FilterStatCard
              label="Aguardando Aprovação"
              count={statusCounts.WAITING_MANAGER}
              icon={Clock}
              iconBg="bg-yellow-100 dark:bg-yellow-900/30"
              iconColor="text-yellow-600 dark:text-yellow-400"
              isActive={statusFilter === 'WAITING_MANAGER'}
              loading={loadingList}
              onClick={() => setStatusFilter(statusFilter === 'WAITING_MANAGER' ? 'ALL' : 'WAITING_MANAGER')}
            />
            <FilterStatCard
              label="Aprovadas"
              count={statusCounts.APPROVED}
              icon={CheckCircle}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
              isActive={statusFilter === 'APPROVED'}
              loading={loadingList}
              onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
            />
            <FilterStatCard
              label="Reprovadas"
              count={statusCounts.REJECTED_CANCELLED}
              icon={XCircle}
              iconBg="bg-red-100 dark:bg-red-900/30"
              iconColor="text-red-600 dark:text-red-400"
              isActive={statusFilter === 'REJECTED_CANCELLED'}
              loading={loadingList}
              onClick={() => setStatusFilter(statusFilter === 'REJECTED_CANCELLED' ? 'ALL' : 'REJECTED_CANCELLED')}
            />
            <FilterStatCard
              label="Todas"
              count={statusCounts.ALL}
              icon={LayoutList}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              isActive={statusFilter === 'ALL'}
              loading={loadingList}
              onClick={() => setStatusFilter('ALL')}
            />
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <ClipboardCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Fichas de Demanda
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Gerencie as fichas de demanda cadastradas
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por FD, pedido, contrato, RM, OC ou IdMov..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowImport(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Importar"
                    title="Importar"
                  >
                    <Upload className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova Ficha de Demanda</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingList ? (
                <CadastroListLoading message="Carregando fichas..." />
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <ClipboardCheck className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">Nenhuma ficha de demanda encontrada</p>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                    {searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre uma nova ficha para começar'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 py-3 pl-4 pr-0 dark:border-gray-700 dark:bg-gray-900/40 lg:flex-row lg:items-center lg:justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <strong>Resultado geral</strong> · {totalFiltered} {totalFiltered === 1 ? 'ficha' : 'fichas'}
                    </span>
                    <ResultadoNivel resultado={resultadoGeral} />
                  </div>
                  <div className="space-y-2">
                    {niveis.map((cc) => (
                      <div key={cc.key} className="rounded-lg border border-gray-200 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => alternar(cc.key)}
                          aria-expanded={estaAberto(cc.key)}
                          className="flex w-full flex-col gap-2 rounded-lg py-3 pl-4 pr-0 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <ChevronRight
                              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${estaAberto(cc.key) ? 'rotate-90' : ''}`}
                            />
                            <span className="truncate text-base font-semibold uppercase text-gray-900 dark:text-gray-100">
                              {cc.label}
                            </span>
                            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                              {cc.obras.length} {cc.obras.length === 1 ? 'obra' : 'obras'} · {cc.total}{' '}
                              {cc.total === 1 ? 'FD' : 'FDs'}
                            </span>
                          </span>
                          <ResultadoNivel resultado={cc.resultado} />
                        </button>
                        {estaAberto(cc.key) && (
                          <div className="space-y-2 border-t border-gray-200 py-3 pl-3 pr-0 dark:border-gray-700 sm:pl-8">
                            {cc.obras.map((obra) => (
                              <div key={obra.key} className="rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-700">
                                <button
                                  type="button"
                                  onClick={() => alternar(obra.key)}
                                  aria-expanded={estaAberto(obra.key)}
                                  className="flex w-full flex-col gap-2 rounded-lg py-2.5 pl-4 pr-0 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 lg:flex-row lg:items-center lg:justify-between"
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ChevronRight
                                      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${estaAberto(obra.key) ? 'rotate-90' : ''}`}
                                    />
                                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                      Obra
                                    </span>
                                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                      {obra.label}
                                    </span>
                                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                                      {obra.oss.length} {obra.oss.length === 1 ? 'OS' : 'OSs'} · {obra.total}{' '}
                                      {obra.total === 1 ? 'FD' : 'FDs'}
                                    </span>
                                  </span>
                                  <ResultadoNivel resultado={obra.resultado} />
                                </button>
                                {estaAberto(obra.key) && (
                                  <div className="space-y-2 border-t border-gray-200 py-3 pl-3 pr-0 dark:border-gray-700 sm:pl-8">
                                    {obra.oss.map((os) => (
                                      <div key={os.key} className="rounded-l-lg border border-r-0 border-gray-200 dark:border-gray-700">
                                        <button
                                          type="button"
                                          onClick={() => alternar(os.key)}
                                          aria-expanded={estaAberto(os.key)}
                                          className="flex w-full flex-col gap-2 rounded-lg py-2.5 pl-4 pr-0 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 lg:flex-row lg:items-center lg:justify-between"
                                        >
                                          <span className="flex min-w-0 items-center gap-2">
                                            <ChevronRight
                                              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${estaAberto(os.key) ? 'rotate-90' : ''}`}
                                            />
                                            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                              OS
                                            </span>
                                            <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                              {os.label}
                                            </span>
                                            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                                              {os.rows.length} {os.rows.length === 1 ? 'FD' : 'FDs'}
                                            </span>
                                          </span>
                                          <ResultadoNivel resultado={os.resultado} />
                                        </button>
                                        {estaAberto(os.key) && (
                                          <div className="table-scroll border-t border-gray-200 dark:border-gray-700">
                                            <table className="w-full text-sm">
                                    <thead className="border-b border-gray-200 dark:border-gray-700">
                                      <tr>
                                        <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Código da FD
                                        </th>
                                        <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Pedido
                                        </th>
                                        <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Contrato
                                        </th>
                                        <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Solicitante
                                        </th>
                                        <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Polo
                                        </th>
                                        <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Status
                                        </th>
                                        <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                          Pedidos
                                        </th>
                                        <th className={`${COL_VALOR} py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}>
                                          Faturamento estimado
                                        </th>
                                        <th className={`${COL_VALOR} py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}>
                                          Custo estimado (40%)
                                        </th>
                                        <th
                                          className={`${COL_VALOR} py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}
                                          title="Custo real da FD (espelho da Ficha de Demanda)"
                                        >
                                          Custo real
                                        </th>
                                        <th
                                          className={`${COL_VALOR} py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}
                                          title="OCs pagas (validadas pelo compras no G4), pelo total de cada OC"
                                        >
                                          Pago em OCs
                                        </th>
                                      </tr>
                                    </thead>
                                              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                                {os.rows.map((row) => (
                                        <tr
                                          key={row.id}
                                          onClick={() => openDetail(row)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              openDetail(row);
                                            }
                                          }}
                                          tabIndex={0}
                                          role="button"
                                          className={getListTableRowClassName(true, listTableRowClasses.tr)}
                                        >
                                          <td className="px-3 py-4 text-left sm:px-6">
                                            <ListRowNavigableLabel className="text-sm font-medium">
                                              {row.codFichaDemanda}
                                            </ListRowNavigableLabel>
                                          </td>
                                          <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                                            {row.codigoPedido}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-4 text-center uppercase text-gray-900 dark:text-gray-100 sm:px-6">
                                            {row.contratoNome}
                                          </td>
                                          <td className="px-3 py-4 text-center text-gray-900 dark:text-gray-100 sm:px-6">
                                            {row.solicitanteNome}
                                          </td>
                                          <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                                            {row.polo}
                                          </td>
                                          <td className="px-3 py-4 text-center sm:px-6">
                                            <FdStatusBadges record={row} />
                                          </td>
                                          <td className="px-3 py-4 text-center sm:px-6">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pedidosStatusBadgeClass(row.pedidosStatus)}`}>
                                              {pedidosStatusLabel(row.pedidosStatus)}
                                            </span>
                                          </td>
                                          <td className={`${COL_VALOR} whitespace-nowrap py-4 tabular-nums text-gray-900 dark:text-gray-100`}>
                                            {formatCurrencyDisplay(row.faturamentoEstimado)}
                                          </td>
                                          <td className={`${COL_VALOR} whitespace-nowrap py-4 tabular-nums text-amber-600 dark:text-amber-400`}>
                                            {formatCurrencyDisplay(row.custoEstimado)}
                                          </td>
                                          <td className={`${COL_VALOR} whitespace-nowrap py-4 tabular-nums`}>
                                            {row.custoReal != null && row.custoReal > 0 ? (
                                              <span
                                                className={
                                                  row.custoReal > Number(row.custoEstimado)
                                                    ? 'font-medium text-red-600 dark:text-red-400'
                                                    : 'font-medium text-blue-600 dark:text-blue-400'
                                                }
                                                title={
                                                  row.custoReal > Number(row.custoEstimado)
                                                    ? 'Acima do custo estimado (40%)'
                                                    : 'Dentro do custo estimado (40%)'
                                                }
                                              >
                                                {formatCurrencyDisplay(row.custoReal)}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400 dark:text-gray-500">—</span>
                                            )}
                                          </td>
                                          <td className={`${COL_VALOR} whitespace-nowrap py-4 tabular-nums`}>
                                            {row.totalPagoOcs ? (
                                              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                                {formatCurrencyDisplay(row.totalPagoOcs)}
                                              </span>
                                            ) : (
                                              <span className="text-gray-400 dark:text-gray-500">—</span>
                                            )}
                                          </td>
                                        </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {rowActionMenu && rowForActionMenu && (
                    <ActionMenuOverlay
                      open
                      onClose={() => setRowActionMenu(null)}
                      top={rowActionMenu.top}
                      left={rowActionMenu.left}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          openDetail(rowForActionMenu);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-300" />
                        <span>Ver detalhes</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          openEdit(rowForActionMenu);
                        }}
                        disabled={rowForActionMenu.status !== 'WAITING_MANAGER' && rowForActionMenu.status !== 'REJECTED'}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Edit className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRowActionMenu(null);
                          if (rowForActionMenu.status !== 'WAITING_MANAGER') {
                            toast.error('Somente fichas aguardando aprovação podem ser excluídas.');
                            return;
                          }
                          setDeleteId(rowForActionMenu.id);
                        }}
                        disabled={rowForActionMenu.status !== 'WAITING_MANAGER'}
                        className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        <span>Excluir</span>
                      </button>
                    </ActionMenuOverlay>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </PageStack>

        <FichaDemandaDetailModal
          isOpen={detailRecord != null}
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onRecordUpdated={(updated) => setDetailRecord(updated)}
        />

        <FichaDemandaApprovalFormModal
          isOpen={showForm}
          onClose={() => {
            if (!isSaving) {
              setShowForm(false);
              setEditingRecord(null);
            }
          }}
          editingRecord={editingRecord}
          onSave={handleSave}
          isSaving={isSaving}
        />

        <FichaDemandaImportModal
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onImported={() => {
            queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
          }}
        />

        {deleteId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => setDeleteId(null)} />
            <div className="relative z-[1101] w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <p className="mb-1 text-gray-900 dark:text-gray-100">Excluir ficha de demanda?</p>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
