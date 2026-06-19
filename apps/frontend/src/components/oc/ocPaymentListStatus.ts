import type { FinancialControlEntry } from '@/lib/financialControlEntry';
import {
  allMultiInstallmentsPaid,
  parsePaymentBoletoInstallments,
  rowStatus,
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

export function getOcPaymentListStatus(
  o: OrderProofValidationPick,
  entriesForOc: Pick<FinancialControlEntry, 'status' | 'paidDate'>[]
): OcPaymentListStatus {
  if (entriesForOc.length === 0) return 'pendente';
  const markedPaidInFinance = entriesForOc.some(
    (e) =>
      e.status === 'PAGO' ||
      e.status === 'PROCESSO_COMPLETO' ||
      Boolean(e.paidDate)
  );
  if (markedPaidInFinance || isOcPaymentCompleted(o)) return 'pago';
  return 'pendente';
}

export function ocPaymentListStatusLabel(status: OcPaymentListStatus): string {
  return status === 'pago' ? 'Pago' : 'Pendente';
}

export function ocPaymentListStatusClass(status: OcPaymentListStatus): string {
  return status === 'pago'
    ? 'text-green-600 dark:text-green-400'
    : 'text-amber-600 dark:text-amber-400';
}
