'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarRange, Car, ClipboardCheck, FileText, Plus, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses,
  type RowActionMenuExtraItem
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { SignatureField, isBlankSignature } from '@/components/ui/SignatureField';
import {
  VehicleReturnPhotoField,
  isBlankVehiclePhoto
} from '@/components/ui/VehicleReturnPhotoField';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { POLO_OPTIONS } from '@/components/suprimentos/materialDeliveryLabels';
import { useCostCenters } from '@/hooks/useCostCenters';
import { fetchEmployeeSelectOptions } from '@/lib/employeeSelectOptions';
import { formatPlacaDisplay } from '@/lib/brazilianVehiclePlate';
import {
  defaultReturnDatetimeLocalValue,
  formatPeriodoUso,
  formatVehicleReservationStatus,
  vehicleReservationStatusBadgeClass,
  type VehicleReservationStatus
} from '@/lib/vehicleReservationLabels';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const PERIODO_USO_OPTIONS: MultiSelectSearchOption[] = [
  { value: 'INTEGRAL', label: 'Integral' },
  { value: 'MATUTINO', label: 'Matutino' },
  { value: 'VESPERTINO', label: 'Vespertino' },
  { value: 'NOTURNO', label: 'Noturno' }
];

type VehicleOption = {
  id: string;
  code: string;
  marcaVeic?: string | null;
  modeloVeic: string;
  placaVeic: string;
};

type VehicleReservation = {
  id: string;
  code: string;
  solicitante: string;
  motorista: string;
  vehicleId: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  periodoUso: string[];
  polo?: string | null;
  contrato?: string | null;
  assinatura: string;
  status: VehicleReservationStatus;
  createdBy?: { id: string; name: string } | null;
  vehicle?: VehicleOption;
  vistoriaAt?: string | null;
  vistoriaLaudoUrl?: string | null;
  vistoriaLaudoFileName?: string | null;
  vistoriaReportedBy?: { id: string; name: string } | null;
};

type ReturnFormState = {
  devolucaoAt: string;
  baixaFoto: string;
  baixaObservacao: string;
  baixaAssinatura: string;
};

const EMPTY_RETURN_FORM = (): ReturnFormState => ({
  devolucaoAt: defaultReturnDatetimeLocalValue(),
  baixaFoto: '',
  baixaObservacao: '',
  baixaAssinatura: ''
});

type ReservationFormState = {
  solicitante: string;
  motorista: string;
  vehicleId: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  periodoUso: string[];
  polo: string;
  contrato: string;
};

function todayInputValue() {
  return format(new Date(), 'yyyy-MM-dd');
}

const EMPTY_FORM = (): ReservationFormState => ({
  solicitante: '',
  motorista: '',
  vehicleId: '',
  atividade: '',
  localDestino: '',
  dataUsoInicio: todayInputValue(),
  dataUsoFim: todayInputValue(),
  periodoUso: [],
  polo: '',
  contrato: ''
});

const fieldClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function formatVehicleLabel(vehicle: VehicleOption): string {
  const placa = formatPlacaDisplay(vehicle.placaVeic);
  const modelo = [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim();
  return modelo ? `${placa} — ${modelo}` : placa;
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
}

function formatDateTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
}

export default function ReservaVeiculosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [returnReservation, setReturnReservation] = useState<VehicleReservation | null>(null);
  const [inspectionReservation, setInspectionReservation] = useState<VehicleReservation | null>(null);
  const [returnFormData, setReturnFormData] = useState<ReturnFormState>(EMPTY_RETURN_FORM);
  const [formData, setFormData] = useState<ReservationFormState>(EMPTY_FORM);
  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();

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

  const { data: listData, isLoading } = useQuery({
    queryKey: ['vehicle-reservations', searchTerm, currentPage, itemsPerPage],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations', {
        params: {
          search: searchTerm || undefined,
          page: currentPage,
          limit: itemsPerPage
        }
      });
      return res.data;
    }
  });

  const { data: employeeOptions = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['vehicle-reservation-employees'],
    queryFn: fetchEmployeeSelectOptions,
    enabled: showForm,
    staleTime: 10 * 60 * 1000
  });

  const { data: vehiclesData, isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicle-reservation-vehicles'],
    queryFn: async () => {
      const res = await api.get('/vehicles', {
        params: { isActive: 'true', limit: 100, page: 1 }
      });
      return (res.data?.data || []) as VehicleOption[];
    },
    enabled: showForm,
    staleTime: 5 * 60 * 1000
  });

  const reservations = (listData?.data || []) as VehicleReservation[];
  const pagination = listData?.pagination || {
    page: 1,
    limit: itemsPerPage,
    total: 0,
    totalPages: 1
  };

  const employeeSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      employeeOptions.map((employee) => ({
        value: employee.name,
        label: employee.name,
        searchText: employee.name
      })),
    [employeeOptions]
  );

  const vehicleSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      (vehiclesData || []).map((vehicle) => ({
        value: vehicle.id,
        label: formatVehicleLabel(vehicle),
        searchText: [vehicle.placaVeic, vehicle.marcaVeic, vehicle.modeloVeic, vehicle.code]
          .filter(Boolean)
          .join(' ')
      })),
    [vehiclesData]
  );

  const contractSelectOptions = useMemo<MultiSelectSearchOption[]>(
    () =>
      costCenters.map((center) => ({
        value: center.label,
        label: center.label,
        searchText: center.label
      })),
    [costCenters]
  );

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
    setRowActionMenu
  } = useRowActionMenu(reservations);

  const listRange = getCadastroListRange(
    pagination.page,
    pagination.limit,
    pagination.total
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const openCreateForm = () => {
    const userName = userData?.data?.name ? String(userData.data.name) : '';
    setFormData({
      ...EMPTY_FORM(),
      solicitante: userName
    });
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post('/vehicle-reservations', body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservation-supplies-pending-count'] });
      setShowForm(false);
      setFormData(EMPTY_FORM());
      toast.success('Reserva enviada! Aguardando aprovação do Suprimentos.');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao registrar reserva')
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/vehicle-reservations/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
      setDeleteId(null);
      setRowActionMenu(null);
      toast.success('Reserva excluída com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir reserva')
  });

  const returnMutation = useMutation({
    mutationFn: async ({
      id,
      body
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => {
      const res = await api.put(`/vehicle-reservations/${id}/submit-return`, body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['vehicle-reservations-supplies'] });
      setReturnReservation(null);
      setReturnFormData(EMPTY_RETURN_FORM());
      toast.success('Baixa registrada! Aguardando vistoria do Suprimentos.');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.message || 'Erro ao registrar baixa do veículo')
  });

  const openReturnModal = (reservation: VehicleReservation) => {
    setReturnReservation(reservation);
    setReturnFormData(EMPTY_RETURN_FORM());
  };

  const openInspectionModal = (reservation: VehicleReservation) => {
    setInspectionReservation(reservation);
  };

  const { data: inspectionDetail, isLoading: loadingInspectionDetail } = useQuery({
    queryKey: ['vehicle-reservation-detail', inspectionReservation?.id],
    queryFn: async () => {
      const res = await api.get(`/vehicle-reservations/${inspectionReservation!.id}`);
      return res.data?.data as VehicleReservation;
    },
    enabled: Boolean(inspectionReservation?.id)
  });

  const inspectionData = inspectionDetail ?? inspectionReservation;

  const userCanSubmitReturn = (reservation: VehicleReservation): boolean => {
    const userName = String(userData?.data?.name ?? '').trim().toLowerCase();
    const userId = String(userData?.data?.id ?? '');
    if (userData?.data?.isAdmin) return true;
    if (reservation.createdBy?.id && reservation.createdBy.id === userId) return true;
    const solicitante = reservation.solicitante.trim().toLowerCase();
    return userName.length > 0 && userName === solicitante;
  };

  const buildRowExtraMenuItems = (reservation: VehicleReservation): RowActionMenuExtraItem[] => {
    const items: RowActionMenuExtraItem[] = [];

    if (reservation.status === 'APPROVED' && userCanSubmitReturn(reservation)) {
      items.push({
        label: 'Dar baixa',
        onClick: () => openReturnModal(reservation),
        icon: (
          <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )
      });
    }

    if (reservation.status === 'INSPECTED') {
      items.push({
        label: 'Ver vistoria',
        onClick: () => openInspectionModal(reservation),
        icon: <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      });
    }

    return items;
  };

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReservation) return;
    if (!returnFormData.devolucaoAt) {
      return toast.error('Informe a data e hora da devolução');
    }
    if (isBlankVehiclePhoto(returnFormData.baixaFoto)) {
      return toast.error('Fotografe o veículo');
    }
    if (isBlankSignature(returnFormData.baixaAssinatura)) {
      return toast.error('Assine a devolução');
    }

    returnMutation.mutate({
      id: returnReservation.id,
      body: {
        devolucaoAt: returnFormData.devolucaoAt,
        baixaFoto: returnFormData.baixaFoto,
        baixaObservacao: returnFormData.baixaObservacao.trim() || undefined,
        baixaAssinatura: returnFormData.baixaAssinatura
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.solicitante) return toast.error('Selecione o solicitante');
    if (!formData.motorista) return toast.error('Selecione o motorista');
    if (!formData.vehicleId) return toast.error('Selecione o veículo');
    if (!formData.atividade.trim()) return toast.error('Informe a atividade');
    if (!formData.localDestino.trim()) return toast.error('Informe o local de destino');
    if (!formData.dataUsoInicio) return toast.error('Informe a data de início');
    if (!formData.dataUsoFim) return toast.error('Informe a data de fim');
    if (formData.dataUsoFim < formData.dataUsoInicio) {
      return toast.error('A data final não pode ser anterior à data inicial');
    }
    if (!formData.periodoUso.length) return toast.error('Selecione o período de uso');

    createMutation.mutate({
      solicitante: formData.solicitante,
      motorista: formData.motorista,
      vehicleId: formData.vehicleId,
      atividade: formData.atividade.trim(),
      localDestino: formData.localDestino.trim(),
      dataUsoInicio: formData.dataUsoInicio,
      dataUsoFim: formData.dataUsoFim,
      periodoUso: formData.periodoUso,
      polo: formData.polo || undefined,
      contrato: formData.contrato || undefined
    });
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const isListEmpty = !isLoading && reservations.length === 0;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/reserva-veiculos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Reserva de Veículos
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Solicite o uso de veículos da frota
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <CalendarRange className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      Reservas
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isLoading
                        ? 'Carregando...'
                        : pagination.total === 1
                          ? '1 reserva registrada'
                          : `${pagination.total} reservas registradas`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por solicitante, motorista, placa..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova reserva</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando reservas..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={Car}
                  title="Nenhuma reserva encontrada"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Clique em Nova reserva para solicitar um veículo'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={pagination.total}
                    itemLabel="reserva"
                    itemLabelPlural="reservas"
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                  />
                  <div className="overflow-x-auto">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Solicitante</th>
                          <th className={cadastroListClasses.th}>Motorista</th>
                          <th className={cadastroListClasses.th}>Veículo</th>
                          <th className={cadastroListClasses.thCenter}>Período</th>
                          <th className={cadastroListClasses.thCenter}>Uso</th>
                          <th className={cadastroListClasses.thCenter}>Contrato</th>
                          <th className={cadastroListClasses.thCenter}>Status</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {reservations.map((reservation, index) => (
                          <tr key={reservation.id} className={listTableRowClasses.tr}>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(
                                reservation.code,
                                listRange.startItem + index
                              )}
                            </td>
                            <td className={cadastroListClasses.td}>{reservation.solicitante}</td>
                            <td className={cadastroListClasses.td}>{reservation.motorista}</td>
                            <td className={cadastroListClasses.td}>
                              {reservation.vehicle
                                ? formatPlacaDisplay(reservation.vehicle.placaVeic)
                                : '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {formatDateLabel(reservation.dataUsoInicio)}
                              {reservation.dataUsoFim !== reservation.dataUsoInicio
                                ? ` — ${formatDateLabel(reservation.dataUsoFim)}`
                                : ''}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {formatPeriodoUso(
                                Array.isArray(reservation.periodoUso) ? reservation.periodoUso : []
                              )}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>{reservation.contrato || '—'}</td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${vehicleReservationStatusBadgeClass(
                                  reservation.status || 'PENDING_SUPPLIES'
                                )}`}
                              >
                                {formatVehicleReservationStatus(
                                  reservation.status || 'PENDING_SUPPLIES'
                                )}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(reservation.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(
                                  reservation.id,
                                  e.currentTarget as HTMLButtonElement
                                )
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {rowActionMenu && rowForActionMenu && (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={closeRowActionMenu}
                      editDisabled
                      extraItems={buildRowExtraMenuItems(rowForActionMenu as VehicleReservation)}
                      onDelete={() => setDeleteId((rowForActionMenu as VehicleReservation).id)}
                      deleteDisabled={
                        (rowForActionMenu as VehicleReservation).status !== 'PENDING_SUPPLIES'
                      }
                      deleteDisabledTitle="Somente reservas pendentes podem ser excluídas"
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              setFormData(EMPTY_FORM());
            }}
            title="Nova reserva de veículo"
            size="lg"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Solicitante
                </label>
                <SingleSelectSearchDropdown
                  value={formData.solicitante}
                  onChange={(solicitante) => setFormData((current) => ({ ...current, solicitante }))}
                  options={employeeSelectOptions}
                  disabled={loadingEmployees}
                  allowEmpty={false}
                  placeholder={
                    loadingEmployees ? 'Carregando funcionários...' : 'Selecionar solicitante...'
                  }
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Motorista *
                </label>
                <SingleSelectSearchDropdown
                  value={formData.motorista}
                  onChange={(motorista) => setFormData((current) => ({ ...current, motorista }))}
                  options={employeeSelectOptions}
                  disabled={loadingEmployees}
                  allowEmpty={false}
                  placeholder={
                    loadingEmployees ? 'Carregando funcionários...' : 'Selecionar motorista...'
                  }
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Veículo *
                </label>
                <SingleSelectSearchDropdown
                  value={formData.vehicleId}
                  onChange={(vehicleId) => setFormData((current) => ({ ...current, vehicleId }))}
                  options={vehicleSelectOptions}
                  disabled={loadingVehicles}
                  allowEmpty={false}
                  placeholder={
                    loadingVehicles ? 'Carregando veículos...' : 'Selecionar veículo...'
                  }
                  searchPlaceholder="Pesquisar..."
                  emptyOptionsMessage="Nenhum veículo ativo cadastrado."
                  noFocusRing
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Atividade *
                </label>
                <input
                  type="text"
                  value={formData.atividade}
                  onChange={(e) => setFormData((current) => ({ ...current, atividade: e.target.value }))}
                  className={fieldClassName}
                  placeholder="Descreva a atividade"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Local de destino *
                </label>
                <input
                  type="text"
                  value={formData.localDestino}
                  onChange={(e) =>
                    setFormData((current) => ({ ...current, localDestino: e.target.value }))
                  }
                  className={fieldClassName}
                  placeholder="Informe o destino"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data de uso — início *
                  </label>
                  <DatePickerField
                    value={formData.dataUsoInicio}
                    onChange={(dataUsoInicio) =>
                      setFormData((current) => ({ ...current, dataUsoInicio }))
                    }
                    placeholder="dd/mm/aaaa"
                    aria-label="Data de uso — início"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data de uso — fim *
                  </label>
                  <DatePickerField
                    value={formData.dataUsoFim}
                    onChange={(dataUsoFim) =>
                      setFormData((current) => ({ ...current, dataUsoFim }))
                    }
                    placeholder="dd/mm/aaaa"
                    aria-label="Data de uso — fim"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Período de uso *
                </label>
                <MultiSelectSearchDropdown
                  options={PERIODO_USO_OPTIONS}
                  selected={formData.periodoUso}
                  onChange={(periodoUso) => setFormData((current) => ({ ...current, periodoUso }))}
                  placeholder="Selecione um ou mais períodos"
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Polo
                </label>
                <div className="flex gap-2">
                  {POLO_OPTIONS.map((option) => (
                    <ButtonSeg
                      key={option.value}
                      active={formData.polo === option.value}
                      onClick={() => setFormData((current) => ({ ...current, polo: option.value }))}
                      label={option.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contrato
                </label>
                <SingleSelectSearchDropdown
                  value={formData.contrato}
                  onChange={(contrato) => setFormData((current) => ({ ...current, contrato }))}
                  options={contractSelectOptions}
                  disabled={loadingCostCenters}
                  placeholder={
                    loadingCostCenters ? 'Carregando contratos...' : 'Selecionar contrato...'
                  }
                  searchPlaceholder="Pesquisar..."
                  emptyOptionsMessage="Nenhum contrato disponível."
                  noFocusRing
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData(EMPTY_FORM());
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Salvando...' : 'Salvar reserva'}
                </button>
              </div>
            </form>
          </Modal>

          <Modal
            isOpen={Boolean(returnReservation)}
            onClose={() => {
              setReturnReservation(null);
              setReturnFormData(EMPTY_RETURN_FORM());
            }}
            title="Baixa da reserva de veículo"
            size="lg"
          >
            {returnReservation ? (
              <form onSubmit={handleSubmitReturn} className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Veículo{' '}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {returnReservation.vehicle
                      ? formatVehicleLabel(returnReservation.vehicle)
                      : '—'}
                  </span>
                  {' · '}
                  Reserva {returnReservation.code}
                </p>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Data e hora da devolução *
                  </label>
                  <DateTimePickerField
                    value={returnFormData.devolucaoAt}
                    onChange={(devolucaoAt) =>
                      setReturnFormData((current) => ({ ...current, devolucaoAt }))
                    }
                    placeholder="dd/mm/aaaa hh:mm"
                    aria-label="Data e hora da devolução"
                    disabled={returnMutation.isPending}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Foto do veículo *
                  </label>
                  <VehicleReturnPhotoField
                    value={returnFormData.baixaFoto}
                    onChange={(baixaFoto) =>
                      setReturnFormData((current) => ({ ...current, baixaFoto }))
                    }
                    disabled={returnMutation.isPending}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Observação
                  </label>
                  <input
                    type="text"
                    value={returnFormData.baixaObservacao}
                    onChange={(e) =>
                      setReturnFormData((current) => ({
                        ...current,
                        baixaObservacao: e.target.value
                      }))
                    }
                    className={fieldClassName}
                    placeholder="Opcional"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Assinatura *
                  </label>
                  <SignatureField
                    value={returnFormData.baixaAssinatura}
                    onChange={(baixaAssinatura) =>
                      setReturnFormData((current) => ({ ...current, baixaAssinatura }))
                    }
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => {
                      setReturnReservation(null);
                      setReturnFormData(EMPTY_RETURN_FORM());
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={returnMutation.isPending}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {returnMutation.isPending ? 'Salvando...' : 'Salvar baixa'}
                  </button>
                </div>
              </form>
            ) : null}
          </Modal>

          <Modal
            isOpen={Boolean(inspectionReservation)}
            onClose={() => setInspectionReservation(null)}
            title="Vistoria do veículo"
            size="md"
          >
            {inspectionData ? (
              loadingInspectionDetail ? (
                <div className="py-6 text-center text-sm text-gray-600 dark:text-gray-400">
                  Carregando vistoria...
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Veículo{' '}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {inspectionData.vehicle
                        ? formatVehicleLabel(inspectionData.vehicle)
                        : '—'}
                    </span>
                    {' · '}
                    Reserva {inspectionData.code}
                  </p>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Data e hora da vistoria</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {inspectionData.vistoriaAt
                          ? formatDateTimeLabel(inspectionData.vistoriaAt)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 dark:text-gray-400">Registrado por</dt>
                      <dd className="font-medium text-gray-900 dark:text-gray-100">
                        {inspectionData.vistoriaReportedBy?.name || '—'}
                      </dd>
                    </div>
                  </dl>
                  {inspectionData.vistoriaLaudoUrl ? (
                    <a
                      href={inspectionData.vistoriaLaudoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <FileText className="h-4 w-4" />
                      {inspectionData.vistoriaLaudoFileName || 'Abrir laudo de vistoria'}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Laudo de vistoria não disponível.
                    </p>
                  )}
                  <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setInspectionReservation(null)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )
            ) : null}
          </Modal>

          <Modal
            isOpen={Boolean(deleteId)}
            onClose={() => setDeleteId(null)}
            title="Excluir reserva"
            size="md"
          >
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja excluir esta reserva? Esta ação não pode ser desfeita.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
