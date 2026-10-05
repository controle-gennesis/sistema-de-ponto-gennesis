import { DP_TYPE_LABELS } from '../services/dpRequests';
import {
  fetchDpApprovals,
  fetchFdApprovals,
  fetchFuelApprovals,
  fetchMedicaoApprovals,
  fetchOcApprovals,
  fetchRmApprovals,
  ocPendingStatusesForUser,
  type FdApprovalRow,
  type FuelApprovalRow,
  type MedicaoApprovalRow,
  type OcApprovalRow,
  type RmApprovalRow,
} from '../services/approvals';

export type ApprovalTabId = 'dp' | 'fuel' | 'fd' | 'rm' | 'oc' | 'medicao';

export type ApprovalListItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  statusLabel: string;
  pending: boolean;
  raw: unknown;
};

export type OcPermissionFlags = {
  canCompras: boolean;
  canGestor: boolean;
  canDiretoria: boolean;
};

export function formatApprovalDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

export function formatApprovalMoney(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseApprovalMoneyInput(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function isApprovalPendingStatus(kind: ApprovalTabId, status: string): boolean {
  if (kind === 'dp' || kind === 'fuel' || kind === 'fd') {
    return status === 'WAITING_MANAGER' || status === 'PENDING_MANAGER';
  }
  if (kind === 'rm') return status === 'PENDING';
  if (kind === 'oc') {
    return ['PENDING', 'PENDING_COMPRAS', 'DRAFT', 'PENDING_DIRETORIA'].includes(status);
  }
  if (kind === 'medicao') return status !== 'APPROVED' && status !== 'CORRECTION';
  return false;
}

/** Lista só pendentes da fila ativa (Home). */
export async function fetchPendingApprovalsForTab(
  tab: ApprovalTabId,
  ocFlags: OcPermissionFlags,
): Promise<ApprovalListItem[]> {
  if (tab === 'dp') {
    const rows = await fetchDpApprovals('PENDING');
    return rows.map((row) => ({
      id: row.id,
      title: DP_TYPE_LABELS[row.requestType] || row.requestType,
      subtitle:
        row.contract?.name ||
        row.costCenter?.name ||
        row.employee?.user?.name ||
        '—',
      meta: `#${row.displayNumber ?? '—'} · ${formatApprovalDate(row.createdAt)}`,
      statusLabel: 'Pendente',
      pending: true,
      raw: row,
    }));
  }

  if (tab === 'fuel') {
    const rows = await fetchFuelApprovals('PENDING');
    return rows.map((row: FuelApprovalRow) => ({
      id: row.id,
      title: `${row.vehiclePlate || 'Veículo'} · ${row.driverName || '—'}`,
      subtitle: row.contract?.name || row.costCenter || row.route || '—',
      meta: `#${row.displayNumber ?? '—'} · ${formatApprovalDate(row.refuelDate || row.requestedAt)}`,
      statusLabel: 'Pendente',
      pending: true,
      raw: row,
    }));
  }

  if (tab === 'fd') {
    const rows = await fetchFdApprovals('PENDING');
    return rows.map((row: FdApprovalRow) => ({
      id: row.id,
      title: row.title?.trim() || `Ficha #${row.displayNumber ?? '—'}`,
      subtitle: row.contract?.name || row.costCenter?.name || row.requester?.name || '—',
      meta: `#${row.displayNumber ?? '—'} · ${formatApprovalDate(row.createdAt)}`,
      statusLabel: 'Pendente',
      pending: true,
      raw: row,
    }));
  }

  if (tab === 'rm') {
    const rows = await fetchRmApprovals('PENDING');
    return rows.map((row: RmApprovalRow) => ({
      id: row.id,
      title: `RM #${row.displayNumber ?? '—'}`,
      subtitle: row.costCenter?.name || row.contract?.name || row.requester?.name || '—',
      meta: formatApprovalDate(row.createdAt),
      statusLabel: 'Pendente',
      pending: true,
      raw: row,
    }));
  }

  if (tab === 'oc') {
    const pendingStatuses = new Set(ocPendingStatusesForUser(ocFlags));
    const rows = await fetchOcApprovals();
    return rows
      .filter((row: OcApprovalRow) => pendingStatuses.has(row.status))
      .map((row: OcApprovalRow) => ({
        id: row.id,
        title: `OC #${row.displayNumber ?? '—'}`,
        subtitle:
          row.supplierName ||
          row.materialRequest?.costCenter?.name ||
          row.materialRequest?.requester?.name ||
          '—',
        meta: `${formatApprovalMoney(row.totalValue)} · ${formatApprovalDate(row.createdAt)}`,
        statusLabel: 'Pendente',
        pending: true,
        raw: row,
      }));
  }

  if (tab === 'medicao') {
    const rows = await fetchMedicaoApprovals();
    return rows
      .filter((row: MedicaoApprovalRow) => isApprovalPendingStatus('medicao', row.status))
      .map((row: MedicaoApprovalRow) => ({
        id: row.id,
        title: row.empreiteiro?.name || 'Medição',
        subtitle:
          row.contratoNome ||
          row.empreiteiro?.contratoNome ||
          formatApprovalMoney(row.executedAmount),
        meta: formatApprovalDate(row.measurementDate),
        statusLabel: 'Pendente',
        pending: true,
        raw: row,
      }));
  }

  return [];
}
