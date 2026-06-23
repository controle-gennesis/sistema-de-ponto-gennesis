import type { FinancialControlEntry } from '@/lib/financialControlEntry';
import {
  allMultiInstallmentsPaid,
  parsePaymentBoletoInstallments,
  rowStatus,
  visiblePaymentBoletoInstallmentIndex,
  type OrderProofValidationPick,
} from '@/components/oc/ocPaymentBoleto';

export type OcPaymentListStatus = 'pendente' | 'pago';

export function isOcPaymentCompleted(o: OrderProofValidationPick): boolean {
  if (o.paymentType === 'BOLETO') {
    const n = o.paymentParcelCount ?? 1;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    if (n > 1) {
      return allMultiInstallmentsPaid(rows, n);
    }
    if (rowStatus(rows[0]) === 'PAID') return true;
  }
  return !!((o.paymentProofUrl || '').trim());
}

function isFinanceEntryMarkedPaid(
  e: Pick<FinancialControlEntry, 'status' | 'paidDate'>
): boolean {
  return e.status === 'PAGO' || e.status === 'PROCESSO_COMPLETO' || Boolean(e.paidDate);
}

function countPaidInstallments(o: OrderProofValidationPick): number {
  const n = o.paymentParcelCount ?? 1;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  let paid = 0;
  for (let i = 0; i < n; i++) {
    if (rowStatus(rows[i]) === 'PAID') paid++;
  }
  return paid;
}

export function getOcPaymentListStatus(
  o: OrderProofValidationPick,
  entriesForOc: Pick<FinancialControlEntry, 'status' | 'paidDate'>[]
): OcPaymentListStatus {
  const markedPaidInFinance = entriesForOc.some(isFinanceEntryMarkedPaid);
  const paidFinanceCount = entriesForOc.filter(isFinanceEntryMarkedPaid).length;

  if (o.paymentType === 'BOLETO' && (o.paymentParcelCount ?? 1) > 1) {
    const n = o.paymentParcelCount ?? 1;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    const paidInstallments = countPaidInstallments(o);

    if (allMultiInstallmentsPaid(rows, n)) return 'pago';

    const curIdx = visiblePaymentBoletoInstallmentIndex(o);
    if (curIdx != null && rowStatus(rows[curIdx]) === 'PAID') return 'pago';

    if (paidFinanceCount > paidInstallments) {
      if (curIdx == null || curIdx === paidInstallments) return 'pago';
    }

    return 'pendente';
  }

  if (entriesForOc.length === 0) return 'pendente';
  if (markedPaidInFinance || isOcPaymentCompleted(o)) return 'pago';
  return 'pendente';
}

export function ocPaymentListStatusLabel(status: OcPaymentListStatus): string {
  return status === 'pago' ? 'Pago' : 'Pendente';
}

const ocListStatusPillBase =
  'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

export function ocPaymentListStatusClass(status: OcPaymentListStatus): string {
  return status === 'pago'
    ? `${ocListStatusPillBase} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`
    : `${ocListStatusPillBase} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
}
