'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FileText, Filter, Fuel, Image as ImageIcon, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { hasFuelStoredPhoto, resolveFuelPhotoSrc } from '@/lib/resolveMediaUrl';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { usePermissions } from '@/hooks/usePermissions';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';

type FuelPhaseFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
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
  costCenter?: string | null;
  requester: { id: string; name: string; email: string };
  contract?: { id: string; name: string; number: string } | null;
};

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

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota / empresa',
};

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando gestor',
  PENDING_SUPPLIES: 'Encaminhada ao Suprimentos',
  APPROVED: 'Encaminhada ao Suprimentos',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  PENDING_SUPPLIES:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export function FuelApprovalsSection() {
  const queryClient = useQueryClient();
  const { canApproveFuel } = usePermissions();

  const [searchFuel, setSearchFuel] = useState('');
  const [fuelPhase, setFuelPhase] = useState<FuelPhaseFilter>('PENDING');
  const [isFuelFiltersOpen, setIsFuelFiltersOpen] = useState(false);
  const [detailFuel, setDetailFuel] = useState<FuelRefuelRequest | null>(null);
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});

  const { data: fuelResp, isLoading: loadingFuel, isError: fuelError } = useQuery({
    queryKey: ['approvals', 'fuel', fuelPhase],
    queryFn: async () => {
      const res = await api.get(`/fuel-refuel-requests/aprovacoes?phase=${fuelPhase}`);
      return (res.data?.data ?? []) as FuelRefuelRequest[];
    },
    enabled: canApproveFuel,
  });

  const fuelList = fuelResp ?? [];

  const fuelFiltered = useMemo(() => {
    const q = searchFuel.trim().toLowerCase();
    if (!q) return fuelList;
    return fuelList.filter((r) => {
      return (
        String(r.displayNumber).includes(q) ||
        r.route.toLowerCase().includes(q) ||
        r.driverName.toLowerCase().includes(q) ||
        r.vehiclePlate.toLowerCase().includes(q) ||
        r.requester.name.toLowerCase().includes(q) ||
        fuelContractLabel(r).toLowerCase().includes(q)
      );
    });
  }, [fuelList, searchFuel]);

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/fuel-refuel-requests/${id}/manager-approve`, { comment });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação aprovada e encaminhada ao Suprimentos.');
      setDetailFuel(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'fuel'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao aprovar solicitação');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/fuel-refuel-requests/${id}/manager-reject`, {
        reason: comment.trim() || 'Rejeitada pelo gestor',
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Solicitação de combustível rejeitada.');
      setDetailFuel(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals', 'fuel'] });
      void queryClient.invalidateQueries({ queryKey: ['fuel-refuel-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err.response?.data?.error || 'Erro ao rejeitar solicitação');
    },
  });

  if (!canApproveFuel) {
    return null;
  }

  return (
    <>
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
                  Apenas veículos particulares — frota/empresa vai direto ao Suprimentos
                </p>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchFuel}
                  onChange={(e) => setSearchFuel(e.target.value)}
                  placeholder="Buscar por nº, rota, placa, contrato..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {searchFuel ? (
                  <button
                    type="button"
                    onClick={() => setSearchFuel('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsFuelFiltersOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  fuelPhase !== 'PENDING'
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={fuelPhase !== 'PENDING' ? 'Filtro (status ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {fuelPhase !== 'PENDING' ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFuel ? (
            <Loading message="Carregando solicitações de combustível..." />
          ) : fuelError ? (
            <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar as solicitações. Recarregue a página ou tente novamente.
            </div>
          ) : fuelFiltered.length === 0 ? (
            <div className="py-8 text-center">
              <Fuel className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
              <p className="text-gray-500 dark:text-gray-400">
                Nenhuma solicitação de combustível neste filtro.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span>
                  Mostrando 1 a {fuelFiltered.length} de {fuelFiltered.length} solicitações
                </span>
                <span>Página 1 de 1</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Nº
                      </th>
                      <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Contrato
                      </th>
                      <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Data abast.
                      </th>
                      <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Veículo / Condutor
                      </th>
                      <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Solicitante
                      </th>
                      <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Status
                      </th>
                      <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {fuelFiltered.map((r) => (
                      <tr key={r.id} className={listTableRowClasses.tr}>
                        <td className="px-3 py-3 align-middle text-sm font-medium text-gray-900 dark:text-gray-100 sm:px-6">
                          #{r.displayNumber}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                          title={fuelContractLabel(r)}
                        >
                          {fuelContractLabel(r)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          {format(new Date(r.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                        </td>
                        <td className="px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          <div>{r.vehiclePlate}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{r.driverName}</div>
                        </td>
                        <td className="px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          {r.requester.name}
                        </td>
                        <td className="px-3 py-3 align-middle text-center sm:px-6">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}
                          >
                            {STATUS_LABELS[r.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle text-center sm:px-6">
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => setDetailFuel(r)}
                              className={rowActionMenuButtonClass(false)}
                              title="Ver detalhes"
                              aria-label="Ver detalhes da solicitação"
                            >
                              <FileText className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!detailFuel}
        onClose={() => setDetailFuel(null)}
        title={`Solicitação de combustível #${detailFuel?.displayNumber ?? ''}`}
        size="lg"
      >
        {detailFuel ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFuel.requester.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Data para abastecer</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {format(new Date(detailFuel.refuelDate), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Contrato</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {fuelContractLabel(detailFuel)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rota</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFuel.route}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Condutor</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{detailFuel.driverName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Veículo</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {detailFuel.vehiclePlate}
                  {detailFuel.vehicleDescription ? ` — ${detailFuel.vehicleDescription}` : ''}
                </p>
              </div>
              {detailFuel.vehicleType ? (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tipo</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {VEHICLE_TYPE_LABELS[detailFuel.vehicleType]}
                  </p>
                </div>
              ) : null}
            </div>
            {detailFuel.observations ? (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Observações</p>
                <p className="text-gray-900 dark:text-gray-100">{detailFuel.observations}</p>
              </div>
            ) : null}
            {hasFuelStoredPhoto(detailFuel.dashboardPhotoUrl, detailFuel.dashboardPhotoKey) ? (() => {
              const panelPhotoUrl = resolveFuelPhotoSrc(
                detailFuel.dashboardPhotoViewUrl,
                detailFuel.dashboardPhotoUrl,
              );
              if (!panelPhotoUrl) return null;
              return (
                <div>
                  <p className="mb-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <ImageIcon className="h-4 w-4" />
                    Foto do painel
                  </p>
                  <a
                    href={panelPhotoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block overflow-hidden rounded-lg border dark:border-gray-600"
                  >
                    <img
                      src={panelPhotoUrl}
                      alt={detailFuel.dashboardPhotoName || 'Painel'}
                      className="max-h-48 object-contain"
                    />
                  </a>
                </div>
              );
            })() : null}

            {detailFuel.status === 'PENDING_MANAGER' ? (
              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                <div className="space-y-3">
                  <Input
                    value={managerComment[detailFuel.id] || ''}
                    onChange={(e) =>
                      setManagerComment((p) => ({ ...p, [detailFuel.id]: e.target.value }))
                    }
                    placeholder="Comentário (opcional na aprovação; obrigatório na rejeição se vazio usa texto padrão)"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button type="button" variant="outline" onClick={() => setDetailFuel(null)}>
                      Fechar
                    </Button>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="error"
                        onClick={() => rejectMutation.mutate({ id: detailFuel.id })}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        {rejectMutation.isPending ? 'Rejeitando…' : 'Rejeitar'}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => approveMutation.mutate({ id: detailFuel.id })}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={() => setDetailFuel(null)}>
                  Fechar
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={isFuelFiltersOpen}
        onClose={() => setIsFuelFiltersOpen(false)}
        title="Filtro — Solicitações de Combustível"
        size="sm"
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
          <select
            value={fuelPhase}
            onChange={(e) => setFuelPhase(e.target.value as FuelPhaseFilter)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="PENDING">Aguardando aprovação</option>
            <option value="APPROVED">Aprovadas</option>
            <option value="REJECTED">Reprovadas</option>
            <option value="ALL">Todas</option>
          </select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsFuelFiltersOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => setIsFuelFiltersOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
