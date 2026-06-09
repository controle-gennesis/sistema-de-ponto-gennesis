'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Fuel, Search, Filter, X, FileText, Image as ImageIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { hasFuelStoredPhoto, resolveFuelPhotoSrc } from '@/lib/resolveMediaUrl';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';

type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type FuelTankLevelAfter = 'RESERVE' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL';

type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
  | 'AWAITING_REFUEL'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type FuelRefuelRequest = {
  id: string;
  displayNumber: number;
  requestedAt: string;
  refuelDate: string;
  route: string;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType?: FuelVehicleType | null;
  observations?: string | null;
  status: FuelRefuelStatus;
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  dashboardPhotoViewUrl?: string | null;
  dashboardPhotoName?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  odometerKm?: number | null;
  tankLevelAfter?: FuelTankLevelAfter | null;
  litersRefueled?: string | number | null;
  pricePerLiter?: string | number | null;
  refuelReportObservations?: string | null;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
  receiptPhotoViewUrl?: string | null;
  receiptPhotoName?: string | null;
  refuelReportedAt?: string | null;
  costCenter?: string | null;
  requester: { id: string; name: string; email: string };
  contract?: {
    id: string;
    name: string;
    number: string;
    costCenter?: { code?: string | null; name?: string | null } | null;
  } | null;
  managerApprover?: { id: string; name: string } | null;
  suppliesApprover?: { id: string; name: string } | null;
};

const TANK_LEVEL_LABELS: Record<FuelTankLevelAfter, string> = {
  RESERVE: 'Reserva',
  QUARTER: '1/4 do tanque',
  HALF: '1/2 do tanque',
  THREE_QUARTERS: '3/4 do tanque',
  FULL: 'Tanque cheio',
};

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota / empresa',
};

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando gestor',
  PENDING_SUPPLIES: 'Aguardando Suprimentos',
  AWAITING_REFUEL: 'Aprovada — aguardando abastecimento',
  COMPLETED: 'Concluída',
  APPROVED: 'Aguardando Suprimentos',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  PENDING_SUPPLIES:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  AWAITING_REFUEL:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  COMPLETED:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ITEMS_PER_PAGE = 20;

function fuelContractLabel(row: {
  costCenter?: string | null;
  contract?: { number?: string; name?: string } | null;
}): string {
  if (row.costCenter?.trim()) return row.costCenter.trim();
  if (row.contract?.number && row.contract?.name) {
    return `${row.contract.number} — ${row.contract.name}`;
  }
  return row.contract?.number || row.contract?.name || '—';
}

export default function SolicitacoesCombustivelPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | FuelRefuelStatus>('PENDING_SUPPLIES');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<FuelRefuelRequest | null>(null);
  const [suppliesComment, setSuppliesComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

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
    queryKey: ['fuel-refuel-requests', searchTerm, statusFilter],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests', {
        params: {
          search: searchTerm || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
        },
      });
      return (res.data?.data || []) as FuelRefuelRequest[];
    },
    enabled: !loadingUser,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/supplies-approve`, {
        comment: suppliesComment.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação aprovada. O colaborador foi notificado na Gennecy.');
      setSelected(null);
      setSuppliesComment('');
      setShowRejectForm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao aprovar solicitação');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.put(`/fuel-refuel-requests/${id}/supplies-reject`, {
        reason: rejectReason.trim(),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação rejeitada. O colaborador foi notificado na Gennecy.');
      setSelected(null);
      setRejectReason('');
      setShowRejectForm(false);
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar solicitação');
    },
  });

  const records = listData || [];
  const totalFiltered = records.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = records.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);
  const isListEmpty = !loadingList && totalFiltered === 0;
  const hasActiveFilter = statusFilter !== 'PENDING_SUPPLIES';

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/solicitacoes-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Solicitações de Combustível
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Fila do Suprimentos: veículos de frota entram direto; particulares após aprovação do
              gestor.
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Fuel className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Solicitações de Combustível
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Analise solicitações aguardando tratamento pelo Suprimentos
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      placeholder="Buscar por nº, rota, condutor, placa, contrato..."
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
                    onClick={() => setIsFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilter
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilter ? 'Filtro (status ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingList ? (
                <div className="py-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="loading-spinner h-6 w-6" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Carregando solicitações...
                    </span>
                  </div>
                </div>
              ) : isListEmpty ? (
                <div className="py-8 text-center">
                  <Fuel className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Nenhuma solicitação encontrada
                  </p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                    Colaboradores podem solicitar via Conversas → Gennecy → opção 1 (combustível)
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                      {totalFiltered === 1 ? 'solicitação' : 'solicitações'}
                    </span>
                    <span>
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Nº
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Solicitante
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Data abast.
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Contrato
                          </th>
                          <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Veículo / Condutor
                          </th>
                          <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Status
                          </th>
                          <th className="min-w-[7rem] px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedRows.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setSelected(row)}
                            className={getListTableRowClassName(true)}
                          >
                            <td className="px-3 py-4 sm:px-6">
                              <ListRowNavigableLabel className="font-medium">
                                #{row.displayNumber}
                              </ListRowNavigableLabel>
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {row.requester.name}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              {format(new Date(row.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                            </td>
                            <td
                              className="max-w-[220px] truncate px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6"
                              title={fuelContractLabel(row)}
                            >
                              {fuelContractLabel(row)}
                            </td>
                            <td className="px-3 py-4 text-gray-900 dark:text-gray-100 sm:px-6">
                              <div>{row.vehiclePlate}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {row.driverName}
                              </div>
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span
                                className={`inline-flex max-w-[220px] rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status]}`}
                              >
                                {STATUS_LABELS[row.status]}
                              </span>
                            </td>
                            <td
                              className="px-3 py-4 text-right sm:px-6"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setSelected(row)}
                                className={rowActionMenuButtonClass(false)}
                                aria-label="Ver detalhes da solicitação"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 ? (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                      >
                        Próxima
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={!!selected}
          onClose={() => {
            setSelected(null);
            setSuppliesComment('');
            setRejectReason('');
            setShowRejectForm(false);
          }}
          title={`Solicitação #${selected?.displayNumber ?? ''}`}
          size="lg"
        >
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Solicitante</span>
                  <p className="text-gray-900 dark:text-gray-100">{selected.requester.name}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Solicitado em</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {format(new Date(selected.requestedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Data para abastecer
                  </span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {format(new Date(selected.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[selected.status]}`}
                    >
                      {STATUS_LABELS[selected.status]}
                    </span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Rota</span>
                  <p className="text-gray-900 dark:text-gray-100">{selected.route}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Contrato</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {fuelContractLabel(selected)}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Condutor</span>
                  <p className="text-gray-900 dark:text-gray-100">{selected.driverName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Veículo</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {selected.vehiclePlate}
                    {selected.vehicleDescription ? ` — ${selected.vehicleDescription}` : ''}
                  </p>
                </div>
                {selected.vehicleType ? (
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Tipo</span>
                    <p className="text-gray-900 dark:text-gray-100">
                      {VEHICLE_TYPE_LABELS[selected.vehicleType]}
                    </p>
                  </div>
                ) : null}
                {selected.observations ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Observações</span>
                    <p className="text-gray-900 dark:text-gray-100">{selected.observations}</p>
                  </div>
                ) : null}
              </div>

              {hasFuelStoredPhoto(selected.dashboardPhotoUrl, selected.dashboardPhotoKey) ? (() => {
                const panelPhotoUrl = resolveFuelPhotoSrc(
                  selected.dashboardPhotoViewUrl,
                  selected.dashboardPhotoUrl,
                );
                if (!panelPhotoUrl) return null;
                return (
                  <div>
                    <span className="mb-2 flex items-center gap-1 font-medium text-gray-500 dark:text-gray-400">
                      <ImageIcon className="h-4 w-4" />
                      Foto do painel
                    </span>
                    <a
                      href={panelPhotoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block overflow-hidden rounded-lg border dark:border-gray-600"
                    >
                      <img
                        src={panelPhotoUrl}
                        alt={selected.dashboardPhotoName || 'Painel'}
                        className="max-h-48 object-contain"
                      />
                    </a>
                  </div>
                );
              })() : null}

              {selected.managerApprovalComment || selected.managerRejectionReason ? (
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Parecer do gestor
                  </span>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {selected.managerApprovalComment || selected.managerRejectionReason}
                  </p>
                  {selected.managerApprover ? (
                    <p className="mt-1 text-xs text-gray-500">— {selected.managerApprover.name}</p>
                  ) : null}
                </div>
              ) : null}

              {selected.suppliesApprovalComment || selected.suppliesRejectionReason ? (
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Parecer do Suprimentos
                  </span>
                  <p className="mt-1 text-gray-900 dark:text-gray-100">
                    {selected.suppliesApprovalComment || selected.suppliesRejectionReason}
                  </p>
                  {selected.suppliesApprover ? (
                    <p className="mt-1 text-xs text-gray-500">— {selected.suppliesApprover.name}</p>
                  ) : null}
                </div>
              ) : null}

              {selected.status === 'COMPLETED' ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-950/20">
                  <span className="font-medium text-green-800 dark:text-green-200">
                    Dados do abastecimento
                  </span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {selected.odometerKm != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Hodômetro</span>
                        <p>{selected.odometerKm.toLocaleString('pt-BR')} km</p>
                      </div>
                    ) : null}
                    {selected.tankLevelAfter ? (
                      <div>
                        <span className="text-xs text-gray-500">Tanque após abastecimento</span>
                        <p>{TANK_LEVEL_LABELS[selected.tankLevelAfter]}</p>
                      </div>
                    ) : null}
                    {selected.litersRefueled != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Litros</span>
                        <p>
                          {Number(selected.litersRefueled).toLocaleString('pt-BR', {
                            minimumFractionDigits: 3,
                            maximumFractionDigits: 3,
                          })}
                        </p>
                      </div>
                    ) : null}
                    {selected.pricePerLiter != null ? (
                      <div>
                        <span className="text-xs text-gray-500">Valor por litro</span>
                        <p>
                          {Number(selected.pricePerLiter).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {selected.refuelReportObservations ? (
                    <p className="mt-2 text-sm">{selected.refuelReportObservations}</p>
                  ) : null}
                  {hasFuelStoredPhoto(selected.receiptPhotoUrl, selected.receiptPhotoKey) ? (() => {
                    const receiptPhotoUrl = resolveFuelPhotoSrc(
                      selected.receiptPhotoViewUrl,
                      selected.receiptPhotoUrl,
                    );
                    if (!receiptPhotoUrl) return null;
                    return (
                      <a
                        href={receiptPhotoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block overflow-hidden rounded-lg border dark:border-gray-600"
                      >
                        <img
                          src={receiptPhotoUrl}
                          alt={selected.receiptPhotoName || 'Cupom fiscal'}
                          className="max-h-48 object-contain"
                        />
                      </a>
                    );
                  })() : null}
                </div>
              ) : null}

              {selected.status === 'PENDING_SUPPLIES' ? (
                <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  {!showRejectForm ? (
                    <>
                      <Input
                        label="Observação (opcional)"
                        value={suppliesComment}
                        onChange={(e) => setSuppliesComment(e.target.value)}
                        placeholder="Mensagem para o colaborador na Gennecy"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRejectForm(true)}
                          disabled={approveMutation.isPending}
                        >
                          Rejeitar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => approveMutation.mutate(selected.id)}
                          disabled={approveMutation.isPending}
                        >
                          {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Input
                        label="Motivo da rejeição"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Informe o motivo"
                        required
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowRejectForm(false)}
                          disabled={rejectMutation.isPending}
                        >
                          Voltar
                        </Button>
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => rejectMutation.mutate(selected.id)}
                          disabled={rejectMutation.isPending || !rejectReason.trim()}
                        >
                          {rejectMutation.isPending ? 'Rejeitando...' : 'Confirmar rejeição'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </Modal>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Solicitações de Combustível"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | FuelRefuelStatus)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                <option value="PENDING_SUPPLIES">Aguardando Suprimentos</option>
                <option value="AWAITING_REFUEL">Aprovadas — aguardando abastecimento</option>
                <option value="COMPLETED">Concluídas</option>
                <option value="ALL">Todos</option>
                <option value="PENDING_MANAGER">Aguardando gestor</option>
                <option value="REJECTED">Rejeitadas</option>
                <option value="CANCELLED">Canceladas</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING_SUPPLIES')}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
