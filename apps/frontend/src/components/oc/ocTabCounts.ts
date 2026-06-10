import type { PurchaseOrder } from './OcPurchaseOrdersPanel';
import { orderNeedsPaymentBoleto } from './ocPaymentBoleto';
import type { OcTabCounts } from './OcFluxTabsNav';

export function computeOcTabCounts(allOrders: PurchaseOrder[]): OcTabCounts {
  const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
  const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
  const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
  const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
  const attachBoleto = allOrders.filter((o) => orderNeedsPaymentBoleto(o)).length;
  const aprovadas = allOrders.filter((o) => o.status === 'APPROVED' && !orderNeedsPaymentBoleto(o)).length;
  const proofValidation = allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION').length;
  const proofCorrection = allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION').length;
  const attachNf = allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT').length;
  const outras = allOrders.filter(
    (o) =>
      o.status !== 'REJECTED' &&
      o.status !== 'CANCELLED' &&
      ![
        'PENDING_COMPRAS',
        'PENDING',
        'DRAFT',
        'PENDING_DIRETORIA',
        'IN_REVIEW',
        'APPROVED',
        'PENDING_PROOF_VALIDATION',
        'PENDING_PROOF_CORRECTION',
        'PENDING_NF_ATTACHMENT',
        'FINALIZED',
        'SENT'
      ].includes(o.status)
  ).length;

  return {
    compras,
    gestor,
    diretoria,
    IN_REVIEW: emCorrecao,
    ATTACH_BOLETO: attachBoleto,
    APPROVED: aprovadas,
    PROOF_VALIDATION: proofValidation,
    PROOF_CORRECTION: proofCorrection,
    ATTACH_NF: attachNf,
    outras
  };
}
