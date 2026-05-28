export type BoletoInstallmentPaymentStatus = 'PENDING_BOLETO' | 'AWAITING_PAYMENT' | 'PAID';

export type BoletoInstallmentRow = {
  amount: number;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
  installmentProofUrl?: string | null;
  installmentProofName?: string | null;
};

export function parsePaymentBoletoInstallments(raw: unknown): BoletoInstallmentRow[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
    .map((x) => {
    const ps = x.paymentStatus;
    const paymentStatus =
      ps === 'PENDING_BOLETO' || ps === 'AWAITING_PAYMENT' || ps === 'PAID' ? ps : undefined;
    const ipu = x.installmentProofUrl;
    const ipn = x.installmentProofName;
    return {
      amount: Number(x.amount),
      dueDate: typeof x.dueDate === 'string' ? x.dueDate.slice(0, 10) : '',
      boletoUrl:
        typeof x.boletoUrl === 'string' && x.boletoUrl.trim() ? String(x.boletoUrl).trim() : null,
      boletoName:
        typeof x.boletoName === 'string' && x.boletoName.trim() ? String(x.boletoName).trim() : null,
      paymentStatus,
      installmentProofUrl:
        typeof ipu === 'string' && ipu.trim() ? String(ipu).trim() : null,
      installmentProofName:
        typeof ipn === 'string' && ipn.trim() ? String(ipn).trim() : null
    };
  });
}

export function rowStatus(row: BoletoInstallmentRow | undefined): BoletoInstallmentPaymentStatus {
  const s = row?.paymentStatus;
  if (s === 'PAID' || s === 'AWAITING_PAYMENT' || s === 'PENDING_BOLETO') return s;
  return 'PENDING_BOLETO';
}

/** Todas as parcelas da condição de pagamento já têm arquivo de boleto. */
export function allInstallmentsHaveBoleto(rows: BoletoInstallmentRow[], n: number): boolean {
  if (n <= 1 || rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!(rows[i]?.boletoUrl || '').trim()) return false;
  }
  return true;
}

/** Pagamento em lote: não exige voltar ao comprador entre parcelas. */
export function useParallelBoletoPaymentFlow(o: OrderBoletoPhasePick): boolean {
  if (o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return allInstallmentsHaveBoleto(rows, n);
}

export function allInstallmentsHavePaymentProof(rows: BoletoInstallmentRow[], n: number): boolean {
  if (n <= 1 || rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!((rows[i]?.installmentProofUrl || '').trim())) return false;
  }
  return true;
}

/** Exibe comprovante geral da OC na seção documentos (oculto quando cada parcela já tem o seu). */
export function shouldShowOrderLevelPaymentProofInDocuments(
  o: OrderBoletoPhasePick & { paymentProofUrl?: string | null }
): boolean {
  if (!(o.paymentProofUrl || '').trim()) return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1 || o.paymentType !== 'BOLETO') return true;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  return !allInstallmentsHavePaymentProof(rows, n);
}

function isLegacyBulkNoExplicitStatus(rows: BoletoInstallmentRow[], n: number): boolean {
  if (rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!(rows[i]?.boletoUrl || '').trim()) return false;
    if (rows[i]?.paymentStatus) return false;
  }
  return true;
}

export function allMultiInstallmentsPaid(rows: BoletoInstallmentRow[], n: number): boolean {
  if (n <= 1) return true;
  if (rows.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (rowStatus(rows[i]) !== 'PAID') return false;
  }
  return true;
}

export type OrderBoletoPhasePick = {
  status: string;
  paymentType?: string | null;
  paymentBoletoUrl?: string | null;
  paymentBoletoInstallments?: unknown;
  paymentParcelCount?: number;
  paymentBoletoPhaseReleased?: boolean | null;
};

/** OC na fase Pagamento (ou correção) em que o lançamento no Controle Financeiro é exigido. */
export function isOcInFinancialLaunchPhase(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' && o.status !== 'PENDING_PROOF_CORRECTION') return false;
  if (o.paymentType === 'BOLETO') return o.paymentBoletoPhaseReleased === true;
  return true;
}

/** Índice da parcela em que o comprador pode anexar/editar boleto (sequencial). */
export function buyerActiveInstallmentIndex(o: OrderBoletoPhasePick): number | null {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1 || o.paymentBoletoPhaseReleased) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID') continue;
    if (st === 'AWAITING_PAYMENT') return null;
    if (st === 'PENDING_BOLETO') return i;
  }
  return null;
}

export function installmentStatusLabel(st: BoletoInstallmentPaymentStatus): string {
  switch (st) {
    case 'PAID':
      return 'Pago';
    case 'AWAITING_PAYMENT':
      return 'Aguardando pagamento';
    default:
      return 'Anexar boleto';
  }
}

/** Pode enviar a parcela atual ao financeiro (boleto da parcela corrente anexado). */
export function canSendCurrentBoletoToPayment(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return !!((o.paymentBoletoUrl || '').trim());
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (rows.length < n) return false;
  if (allInstallmentsHaveBoleto(rows, n)) return true;
  if (isLegacyBulkNoExplicitStatus(rows, n)) {
    return true;
  }
  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID') continue;
    if (st === 'AWAITING_PAYMENT') return false;
    if (st === 'PENDING_BOLETO') {
      return !!(rows[i]?.boletoUrl || '').trim();
    }
  }
  return false;
}

/** @deprecated use canSendCurrentBoletoToPayment — mesmo critério para o botão de envio */
export const allPaymentBoletosAttached = canSendCurrentBoletoToPayment;

export function hasAwaitingInstallmentPayment(o: OrderBoletoPhasePick): boolean {
  if ((o.paymentParcelCount ?? 1) <= 1) return false;
  return parsePaymentBoletoInstallments(o.paymentBoletoInstallments).some(
    (r) => rowStatus(r) === 'AWAITING_PAYMENT'
  );
}

/** Comprovante do pagamento já anexado na parcela em AWAITING_PAYMENT. */
export function awaitingBoletoInstallmentHasProof(o: OrderBoletoPhasePick): boolean {
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const aw = rows.find((r) => rowStatus(r) === 'AWAITING_PAYMENT');
  if (!aw) return false;
  return !!((aw.installmentProofUrl || '').trim());
}

/**
 * OC na aba "Anexar Boleto" (comprador). Com parcelas, some daqui enquanto o financeiro paga a parcela atual.
 */
export function orderNeedsPaymentBoleto(o: OrderBoletoPhasePick): boolean {
  if (o.status !== 'APPROVED' || o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) {
    if (!((o.paymentBoletoUrl || '').trim())) return true;
    if (o.paymentBoletoPhaseReleased === undefined) return false;
    return o.paymentBoletoPhaseReleased !== true;
  }
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (allInstallmentsHaveBoleto(rows, n)) {
    return o.paymentBoletoPhaseReleased !== true;
  }
  if (allMultiInstallmentsPaid(rows, n)) {
    if (o.paymentBoletoPhaseReleased === undefined) return false;
    return o.paymentBoletoPhaseReleased !== true;
  }
  if (o.paymentBoletoPhaseReleased) return false;
  return true;
}

/** Comprovante disponível na fase Pagamento (sequencial: todas pagas; em lote: todas com comprovante por parcela). */
export function canAttachComprovanteForBoletoOrder(o: OrderBoletoPhasePick): boolean {
  if (o.paymentType !== 'BOLETO') return true;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return true;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (useParallelBoletoPaymentFlow(o)) {
    return (
      o.paymentBoletoPhaseReleased === true &&
      allInstallmentsHavePaymentProof(rows, n)
    );
  }
  return allMultiInstallmentsPaid(rows, n);
}

export type OrderProofValidationPick = OrderBoletoPhasePick & {
  paymentProofUrl?: string | null;
};

/**
 * Envio para validação do comprovante: aceita comprovante geral da OC ou,
 * em boleto parcelado com todas as parcelas pagas, o comprovante já anexado na última parcela.
 */
export function canSubmitProofValidationWithFinancialEntry(
  o: OrderProofValidationPick,
  hasFinancialControlEntry: boolean
): boolean {
  if (!hasFinancialControlEntry) return false;
  return canSubmitBoletoToProofValidation(o);
}

export function canSubmitBoletoToProofValidation(o: OrderProofValidationPick): boolean {
  if ((o.paymentProofUrl || '').trim()) return true;
  if (o.paymentType !== 'BOLETO') return false;
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1) return false;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (useParallelBoletoPaymentFlow(o)) {
    return (
      o.paymentBoletoPhaseReleased === true &&
      allInstallmentsHavePaymentProof(rows, n)
    );
  }
  if (!allMultiInstallmentsPaid(rows, n)) return false;
  const last = rows[n - 1];
  return !!((last?.installmentProofUrl || '').trim());
}

/** Parcelas em que o financeiro ainda pode anexar comprovante (fluxo em lote). */
export function financeProofTargetInstallmentIndices(o: OrderBoletoPhasePick): number[] {
  const n = o.paymentParcelCount ?? 1;
  if (n <= 1 || !useParallelBoletoPaymentFlow(o) || o.paymentBoletoPhaseReleased !== true) {
    return [];
  }
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const st = rowStatus(rows[i]);
    if (st === 'PAID' || st === 'AWAITING_PAYMENT' || st === 'PENDING_BOLETO') {
      if ((rows[i]?.boletoUrl || '').trim()) out.push(i);
    }
  }
  return out;
}

/** Comprovante da última parcela (quando todas pagas), para exibir se não houver paymentProofUrl. */
export function lastPaidInstallmentProofUrl(
  o: OrderBoletoPhasePick
): { url: string; name: string | null } | null {
  const n = o.paymentParcelCount ?? 1;
  if (o.paymentType !== 'BOLETO' || n <= 1) return null;
  const rows = parsePaymentBoletoInstallments(o.paymentBoletoInstallments);
  if (!allMultiInstallmentsPaid(rows, n)) return null;
  const last = rows[n - 1];
  const url = (last?.installmentProofUrl || '').trim();
  if (!url) return null;
  const name = (last?.installmentProofName || '').trim() || null;
  return { url, name };
}

export function hasAnyPaymentBoletoAttachment(o: {
  paymentBoletoUrl?: string | null;
  paymentBoletoInstallments?: unknown;
}): boolean {
  if ((o.paymentBoletoUrl || '').trim()) return true;
  return parsePaymentBoletoInstallments(o.paymentBoletoInstallments).some((x) => (x.boletoUrl || '').trim());
}

export const ROMAN_PARCEL_LABELS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function romanParcelLabel(index: number): string {
  return ROMAN_PARCEL_LABELS[index] ?? `${index + 1}ª`;
}
