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

/**
 * Na lista da aba Pagamento da OC, "Pago" = já existe lançamento no Controle Financeiro
 * (status LANCADO etc.), não só quando o título está como PAGO no financeiro.
 */
function isFinanceEntryLaunched(
  e: Pick<FinancialControlEntry, 'status' | 'paidDate'>
): boolean {
  if (e.status === 'CANCELADO') return false;
  return true;
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
  const launchedEntries = entriesForOc.filter(isFinanceEntryLaunched);
  const launchedFinanceCount = launchedEntries.length;

  if (o.paymentType === 'BOLETO' && (o.paymentParcelCount ?? 1) > 1) {
    const n = o.paymentParcelCount ?? 1;
    const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
    const paidInstallments = countPaidInstallments(o);

    if (allMultiInstallmentsPaid(rows, n)) return 'pago';

    const curIdx = visiblePaymentBoletoInstallmentIndex(o);
    if (curIdx != null && rowStatus(rows[curIdx]) === 'PAID') return 'pago';

    // Um lançamento por parcela: se já lançou a parcela atual, mostra Pago.
    if (launchedFinanceCount > paidInstallments) {
      if (curIdx == null || curIdx === paidInstallments) return 'pago';
    }

    return 'pendente';
  }

  if (launchedFinanceCount === 0 && !isOcPaymentCompleted(o)) return 'pendente';
  return 'pago';
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
