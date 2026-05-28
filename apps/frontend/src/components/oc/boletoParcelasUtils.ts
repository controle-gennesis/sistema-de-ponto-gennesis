import {
  parsePaymentBoletoInstallments,
  type BoletoInstallmentRow,
  type BoletoInstallmentPaymentStatus
} from '@/components/oc/ocPaymentBoleto';

export type BoletoParcelasOrderFields = {
  orderDate?: string | null;
  amountToPay?: number | string | null;
  paymentParcelCount?: number;
  paymentParcelDueDays?: number[];
  paymentBoletoInstallments?: unknown;
  paymentBoletoPhaseReleased?: boolean | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
};

export type RowDraft = {
  amount: string;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  uploading: boolean;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
};

export function ymdAddDays(ymd: string | undefined | null, add: number): string {
  const raw = (ymd ?? '').trim();
  if (!raw) {
    const t = new Date();
    t.setDate(t.getDate() + add);
    return t.toISOString().slice(0, 10);
  }
  const base = raw.includes('T') ? raw : `${raw}T12:00:00`;
  const d = new Date(base);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + add);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

export function splitAmountInInstallments(total: number, n: number): number[] {
  if (!Number.isFinite(total) || n < 1) return Array.from({ length: Math.max(n, 0) }, () => 0);
  const cents = Math.round(total * 100);
  const q = Math.floor(cents / n);
  const r = cents % n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = q + (i === n - 1 ? r : 0);
    out.push(c / 100);
  }
  return out;
}

export function formatMoneyBr(n: number): string {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMoneyDisplay(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `R$ ${formatMoneyBr(Number(n))}`;
}

export function formatDueDateBr(ymd: string | undefined | null): string {
  const s = (ymd || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function parseMoneyInput(value: string): number | null {
  const cleaned = value.trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (!cleaned) return null;
  const x = parseFloat(cleaned);
  return Number.isFinite(x) ? x : null;
}

export function buildInitialRows(order: BoletoParcelasOrderFields): RowDraft[] {
  const n = order.paymentParcelCount ?? 1;
  const days = order.paymentParcelDueDays?.length ? order.paymentParcelDueDays : [30];
  const existing = parsePaymentBoletoInstallments(order.paymentBoletoInstallments);
  const total = Number(order.amountToPay);
  const amounts = splitAmountInInstallments(Number.isFinite(total) ? total : 0, n);
  return Array.from({ length: n }, (_, i) => {
    const ex = existing[i];
    const d = days[i] ?? days[days.length - 1] ?? 30;
    return {
      amount: formatMoneyBr(Number.isFinite(ex?.amount) ? ex.amount : amounts[i] ?? 0),
      dueDate: ex?.dueDate || ymdAddDays(order.orderDate, d),
      boletoUrl: ex?.boletoUrl ?? null,
      boletoName: ex?.boletoName ?? null,
      uploading: false,
      paymentStatus: ex?.paymentStatus
    };
  });
}

export function draftToRow(d: RowDraft): BoletoInstallmentRow {
  return {
    amount: parseMoneyInput(d.amount) ?? 0,
    dueDate: (d.dueDate ?? '').trim().slice(0, 10),
    boletoUrl: d.boletoUrl,
    boletoName: d.boletoName,
    paymentStatus: d.paymentStatus
  };
}

export function installmentsStateKey(order: BoletoParcelasOrderFields & { id: string }): string {
  return `${order.id}:${JSON.stringify(order.paymentBoletoInstallments ?? null)}:${order.paymentBoletoPhaseReleased ?? ''}:${order.paymentParcelCount ?? 1}:${order.paymentProofUrl ?? ''}`;
}

export function rowsToInstallments(rows: RowDraft[]): BoletoInstallmentRow[] {
  return rows.map((r) => {
    const amt = parseMoneyInput(r.amount);
    return {
      amount: amt ?? 0,
      dueDate: (r.dueDate ?? '').trim().slice(0, 10),
      boletoUrl: (r.boletoUrl || '').trim() || null,
      boletoName: (r.boletoName || '').trim() || null,
      paymentStatus: r.paymentStatus
    };
  });
}
