import api from './api';
import { readApiData } from './http';
import type { DpRequest } from './dpRequests';

export type ApprovalPhase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

export type ApprovalNotificationCounts = {
  dp: number;
  fd: number;
  fuel: number;
  oc: number;
  rm: number;
  espelhoMirrors?: number;
  total: number;
};

export type FuelApprovalRow = {
  id: string;
  displayNumber?: number | null;
  requestedAt?: string;
  refuelDate?: string;
  route?: string;
  driverName?: string;
  vehiclePlate?: string;
  vehicleDescription?: string | null;
  observations?: string | null;
  status: string;
  costCenter?: string | null;
  requester?: { id: string; name: string; email?: string } | null;
  contract?: { id: string; name?: string; number?: string } | null;
};

export type FdApprovalRow = {
  id: string;
  displayNumber?: number | null;
  status: string;
  createdAt?: string;
  title?: string | null;
  description?: string | null;
  requester?: { id: string; name: string } | null;
  contract?: { id: string; name?: string; number?: string } | null;
  costCenter?: { id: string; name?: string; code?: string | null } | null;
};

export type RmApprovalRow = {
  id: string;
  displayNumber?: number | null;
  status: string;
  createdAt?: string;
  urgency?: string | null;
  requester?: { id: string; name: string } | null;
  costCenter?: { id: string; name?: string; code?: string | null } | null;
  contract?: { id: string; name?: string; number?: string } | null;
  itemsCount?: number | null;
};

export type OcApprovalRow = {
  id: string;
  displayNumber?: number | null;
  status: string;
  createdAt?: string;
  supplierName?: string | null;
  totalValue?: number | null;
  materialRequest?: {
    costCenter?: { id: string; name?: string } | null;
    requester?: { id: string; name: string } | null;
  } | null;
};

export type MedicaoApprovalRow = {
  id: string;
  empreiteiroId: string;
  status: string;
  measurementDate?: string | null;
  executedAmount?: number | null;
  approvedBy?: string | null;
  contratoNome?: string | null;
  empreiteiro?: {
    id?: string;
    name?: string;
    contratoNome?: string | null;
  } | null;
  notes?: string | null;
};

function phaseQuery(phase: ApprovalPhase): string {
  return `phase=${encodeURIComponent(phase)}`;
}

export async function fetchApprovalNotificationCounts(): Promise<ApprovalNotificationCounts> {
  const res = await api.get('/api/approvals/notification-counts');
  const data = await readApiData<ApprovalNotificationCounts>(res);
  return (
    data ?? {
      dp: 0,
      fd: 0,
      fuel: 0,
      oc: 0,
      rm: 0,
      total: 0,
    }
  );
}

export async function fetchDpApprovals(phase: ApprovalPhase = 'PENDING'): Promise<DpRequest[]> {
  const res = await api.get(`/api/solicitacoes-dp/aprovacoes?${phaseQuery(phase)}`);
  return (await readApiData<DpRequest[]>(res)) || [];
}

export async function approveDpRequest(id: string, comment = ''): Promise<void> {
  const res = await api.put(`/api/solicitacoes-dp/${id}/manager-approve`, { comment });
  await readApiData(res);
}

export async function rejectDpRequest(id: string, comment: string): Promise<void> {
  const res = await api.put(`/api/solicitacoes-dp/${id}/manager-reject`, { comment });
  await readApiData(res);
}

export async function fetchFuelApprovals(phase: ApprovalPhase = 'PENDING'): Promise<FuelApprovalRow[]> {
  const res = await api.get(`/api/fuel-refuel-requests/aprovacoes?${phaseQuery(phase)}`);
  return (await readApiData<FuelApprovalRow[]>(res)) || [];
}

export async function approveFuelRequest(id: string, comment = ''): Promise<void> {
  const res = await api.put(`/api/fuel-refuel-requests/${id}/manager-approve`, { comment });
  await readApiData(res);
}

export async function rejectFuelRequest(id: string, comment: string): Promise<void> {
  const res = await api.put(`/api/fuel-refuel-requests/${id}/manager-reject`, { comment });
  await readApiData(res);
}

export async function fetchFdApprovals(phase: ApprovalPhase = 'PENDING'): Promise<FdApprovalRow[]> {
  const res = await api.get(`/api/demand-sheet-approvals/aprovacoes?${phaseQuery(phase)}`);
  return (await readApiData<FdApprovalRow[]>(res)) || [];
}

export async function approveFdRequest(id: string, comment = ''): Promise<void> {
  const res = await api.put(`/api/demand-sheet-approvals/${id}/manager-approve`, { comment });
  await readApiData(res);
}

export async function rejectFdRequest(id: string, comment: string): Promise<void> {
  const res = await api.put(`/api/demand-sheet-approvals/${id}/manager-reject`, { comment });
  await readApiData(res);
}

export async function fetchRmApprovals(status = 'PENDING'): Promise<RmApprovalRow[]> {
  const q = new URLSearchParams({ status, summary: '1', limit: '200' });
  const res = await api.get(`/api/material-requests?${q.toString()}`);
  const data = await readApiData<RmApprovalRow[] | { items?: RmApprovalRow[] }>(res);
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

export async function approveRmRequest(id: string): Promise<void> {
  const res = await api.patch(`/api/material-requests/${id}/status`, { status: 'APPROVED' });
  await readApiData(res);
}

export async function rejectRmRequest(id: string, comment: string): Promise<void> {
  const res = await api.patch(`/api/material-requests/${id}/status`, {
    status: 'CANCELLED',
    comment,
  });
  await readApiData(res);
}

export async function fetchOcApprovals(): Promise<OcApprovalRow[]> {
  const res = await api.get('/api/purchase-orders?limit=500&summary=1');
  const data = await readApiData<OcApprovalRow[] | { items?: OcApprovalRow[] }>(res);
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

export async function approveOcRequest(id: string, nextStatus: string): Promise<void> {
  const res = await api.patch(`/api/purchase-orders/${id}/status`, { status: nextStatus });
  await readApiData(res);
}

export async function rejectOcRequest(id: string, comment: string): Promise<void> {
  const res = await api.patch(`/api/purchase-orders/${id}/status`, {
    status: 'CANCELLED',
    comment,
  });
  await readApiData(res);
}

export async function fetchMedicaoApprovals(): Promise<MedicaoApprovalRow[]> {
  const res = await api.get('/api/empreiteiros/daily-measurements/pending?includeReviewed=1');
  return (await readApiData<MedicaoApprovalRow[]>(res)) || [];
}

export async function approveMedicao(
  empreiteiroId: string,
  id: string,
  amount: number,
): Promise<void> {
  const res = await api.post(
    `/api/empreiteiros/${empreiteiroId}/daily-measurements/${id}/approve`,
    { amount },
  );
  await readApiData(res);
}

export async function returnMedicao(
  empreiteiroId: string,
  id: string,
  note: string,
): Promise<void> {
  const res = await api.post(
    `/api/empreiteiros/${empreiteiroId}/daily-measurements/${id}/return`,
    { note },
  );
  await readApiData(res);
}

export function ocPendingStatusesForUser(opts: {
  canCompras: boolean;
  canGestor: boolean;
  canDiretoria: boolean;
}): string[] {
  const out: string[] = [];
  if (opts.canCompras) out.push('PENDING_COMPRAS', 'DRAFT');
  if (opts.canGestor) out.push('PENDING');
  if (opts.canDiretoria) out.push('PENDING_DIRETORIA');
  return out;
}

export function nextOcApproveStatus(status: string): string | null {
  if (status === 'DRAFT' || status === 'PENDING_COMPRAS') return 'PENDING';
  if (status === 'PENDING') return 'PENDING_DIRETORIA';
  if (status === 'PENDING_DIRETORIA') return 'APPROVED';
  return null;
}
