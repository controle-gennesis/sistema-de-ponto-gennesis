import { DP_TYPE_LABELS, URGENCY_LABELS, type DpUrgency } from '../services/dpRequests';
import {
  fetchDpApprovals,
  fetchAditivoApprovals,
  fetchFdApprovals,
  fetchFuelApprovals,
  fetchMedicaoApprovals,
  fetchOcApprovals,
  fetchRmApprovals,
  ocPendingStatusesForUser,
  type AditivoApprovalRow,
  type FdApprovalRow,
  type FuelApprovalRow,
  type MedicaoApprovalRow,
  type OcApprovalRow,
  type RmApprovalRow,
} from '../services/approvals';

export type ApprovalTabId = 'dp' | 'fuel' | 'fd' | 'rm' | 'oc' | 'medicao' | 'aditivo';

export type ApprovalListItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  statusLabel: string;
  pending: boolean;
  raw: unknown;
  /** Nome da pessoa (solicitante / motorista). */
  person?: string | null;
  /** Local / contrato / centro de custo. */
  place?: string | null;
  urgencyLabel?: string | null;
  urgencyTone?: 'normal' | 'high' | 'urgent' | null;
};

export type ApprovalListItemWithTab = ApprovalListItem & {
  tab: ApprovalTabId;
  categoryLabel: string;
};

const APPROVAL_TAB_LABELS: Record<ApprovalTabId, string> = {
  dp: 'Solicitações Internas',
  fuel: 'Combustível',
  fd: 'Fichas de Demanda',
  rm: 'RM',
  oc: 'OC',
  medicao: 'Medições',
  aditivo: 'Aditivos',
};

export type OcPermissionFlags = {
  canCompras: boolean;
  canGestor: boolean;
  canDiretoria: boolean;
};

export function formatApprovalDate(value?: string | null): string {
  if (!value) return '—';
  // Data sem hora (YYYY-MM-DD): `new Date` leria como UTC e mostraria o dia anterior no Brasil.
  const soDia = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (soDia) return `${soDia[3]}/${soDia[2]}/${soDia[1]}`;
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
  if (kind === 'aditivo') return status === 'PENDING';
  return false;
}

/** Lista só pendentes da fila ativa (Home). */
export async function fetchPendingApprovalsForTab(
  tab: ApprovalTabId,
  ocFlags: OcPermissionFlags,
): Promise<ApprovalListItem[]> {
  if (tab === 'dp') {
    const rows = await fetchDpApprovals('PENDING');
    return rows.map((row) => {
      const urgency = row.urgency as DpUrgency | undefined;
      const urgencyTone =
        urgency === 'URGENT' ? 'urgent' : urgency === 'HIGH' ? 'high' : 'normal';
      return {
        id: row.id,
        title: DP_TYPE_LABELS[row.requestType] || row.requestType,
        person: row.employee?.user?.name || null,
        place: row.costCenter?.name || row.contract?.name || null,
        subtitle: row.costCenter?.name || row.contract?.name || row.employee?.user?.name || '—',
        meta: `#${row.displayNumber ?? '—'} · ${formatApprovalDate(row.createdAt)}`,
        statusLabel: 'Pendente',
        urgencyLabel: urgency ? URGENCY_LABELS[urgency] : null,
        urgencyTone,
        pending: true,
        raw: row,
      };
    });
  }

  if (tab === 'fuel') {
    const rows = await fetchFuelApprovals('PENDING');
    return rows.map((row: FuelApprovalRow) => ({
      id: row.id,
      title: row.driverName || row.requester?.name || '—',
      person: row.driverName || row.requester?.name || null,
      place: row.contract?.name || row.costCenter || row.route || null,
      subtitle: row.contract?.name || row.costCenter || row.route || '—',
      meta: `#${row.displayNumber ?? '—'} · ${formatApprovalDate(row.refuelDate || row.requestedAt)}`,
      statusLabel: 'Pendente',
      pending: true,
      raw: row,
    }));
  }

  if (tab === 'fd') {
    const rows = await fetchFdApprovals('PENDING');
    return rows.map((row: FdApprovalRow) => {
      const codigo = row.codFichaDemanda?.trim() || '';
      const solicitante = row.solicitanteNome?.trim() || row.solicitante?.name || null;
      const contrato = row.contratoNome?.trim() || row.contrato?.name || null;
      const obra = row.obra?.trim() || null;
      return {
        id: row.id,
        title: codigo || 'Ficha de demanda',
        person: solicitante,
        // Contrato em cima e a obra embaixo.
        place: [contrato, obra].filter(Boolean).join('\n') || null,
        subtitle: obra || contrato || solicitante || '—',
        meta: `${formatApprovalMoney(Number(row.faturamentoEstimado))} · ${formatApprovalDate(row.createdAt)}`,
        statusLabel: 'Pendente',
        pending: true,
        raw: row,
      };
    });
  }

  if (tab === 'rm') {
    const rows = await fetchRmApprovals('PENDING');
    return rows.map((row: RmApprovalRow) => ({
      id: row.id,
      title: `RM #${row.displayNumber ?? '—'}`,
      person: row.requester?.name || null,
      place: row.costCenter?.name || row.contract?.name || null,
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
        person: row.materialRequest?.requester?.name || null,
        place:
          row.supplierName ||
          row.materialRequest?.costCenter?.name ||
          null,
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
        // O número e o tipo já aparecem no topo do cartão (#N e «Medições»): o título diz de quem é.
        title: row.empreiteiro?.name || 'Medição',
        person: null,
        place:
          [row.obraContratoNome, row.contratoNome || row.empreiteiro?.contratoNome].filter(Boolean).join(' · ') ||
          null,
        subtitle:
          row.contratoNome ||
          row.empreiteiro?.contratoNome ||
          formatApprovalMoney(row.executedAmount),
        meta: formatApprovalDate(row.measurementDate || row.workDate),
        statusLabel: 'Pendente',
        pending: true,
        raw: row,
      }));
  }

  if (tab === 'aditivo') {
    const rows = await fetchAditivoApprovals();
    return rows
      .filter((row: AditivoApprovalRow) => isApprovalPendingStatus('aditivo', row.status))
      .map((row: AditivoApprovalRow) => ({
        id: row.id,
        // O número e o tipo já aparecem no topo do cartão (#N e «Aditivos»): o título diz de quem é.
        title: row.empreiteiro?.name || row.serviceName || 'Aditivo',
        person: null,
        place:
          [row.obraContratoNome, row.serviceName !== row.empreiteiro?.name ? row.serviceName : null]
            .filter(Boolean)
            .join(' · ') || null,
        subtitle: row.serviceName || row.empreiteiro?.name || formatApprovalMoney(row.amount),
        meta: `${formatApprovalMoney(row.amount)} · ${formatApprovalDate(row.createdAt)}`,
        statusLabel: 'Pendente',
        pending: true,
        raw: row,
      }));
  }

  return [];
}

/** Todas as filas pendentes em uma lista só (Home / modal unificado). */
export async function fetchAllPendingApprovals(
  tabs: ApprovalTabId[],
  ocFlags: OcPermissionFlags,
): Promise<ApprovalListItemWithTab[]> {
  const unique = Array.from(new Set(tabs));
  const batches = await Promise.all(
    unique.map(async (tab) => {
      const rows = await fetchPendingApprovalsForTab(tab, ocFlags);
      const categoryLabel = APPROVAL_TAB_LABELS[tab];
      return rows.map((row) => ({
        ...row,
        id: `${tab}:${row.id}`,
        tab,
        categoryLabel,
      }));
    }),
  );
  return batches.flat();
}

/** Id da API (sem prefixo `tab:`). */
export function approvalApiId(item: ApprovalListItemWithTab | ApprovalListItem): string {
  const rawId = (item.raw as { id?: string } | null)?.id;
  if (rawId) return String(rawId);
  const s = String(item.id);
  const i = s.indexOf(':');
  return i >= 0 ? s.slice(i + 1) : s;
}
