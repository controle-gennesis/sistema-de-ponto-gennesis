import type { PurchaseOrder } from './OcPurchaseOrdersPanel';
import { showInAttachBoletoTab } from './ocPaymentBoleto';
import type { OcTabCounts } from './OcFluxTabsNav';
import { isOcFluxoDiretoTotvs, isOcTotvsEnviada, isOcTotvsNaoEnviada } from './ocTotvsFluxoDireto';

export function computeOcTabCounts(orders: PurchaseOrder[]): OcTabCounts {
  // Fluxo direto TOTVS fica fora de todas as fases do Conecta (Canceladas inclusive).
  const allOrders = orders.filter((o) => !isOcFluxoDiretoTotvs(o));
  const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
  const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
  const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
  const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
  const attachBoleto = allOrders.filter((o) => showInAttachBoletoTab(o)).length;
  const aprovadas = allOrders.filter((o) => o.status === 'APPROVED' && !showInAttachBoletoTab(o)).length;
  const proofValidation = allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION').length;
  const proofCorrection = allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION').length;
  const attachNf = allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT').length;
  const outras = allOrders.filter(
    (o) => o.status === 'REJECTED' || o.status === 'CANCELLED'
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
    TOTVS_NAO_ENVIADAS: orders.filter(isOcTotvsNaoEnviada).length,
    TOTVS_ENVIADAS: orders.filter(isOcTotvsEnviada).length,
    outras
  };
}
