import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { sortPurchaseOrdersByMostRecent } from '@/components/oc/ocPurchaseOrderListSort';
import {
  ocStatusBadgeClassForOrder,
  purchaseOrderPhaseLabelForOrder
} from '@/components/oc/ocStatusLabels';

export type MaterialRequestOcListPurchaseOrder = {
  id: string;
  status: string;
  orderNumber?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentBoletoUrl?: string | null;
  boletoAttachmentUrl?: string | null;
  paymentBoletoInstallments?: unknown;
  paymentParcelCount?: number;
  paymentBoletoPhaseReleased?: boolean | null;
  totvsIdMov?: number | null;
  totvsFluxoDireto?: boolean | null;
  /** Fase atual no Fluig (espelho G3/G4), quando a OC já foi enviada ao TOTVS. */
  fluigFase?: { fluxo: 'G3' | 'G4'; etapa: string } | null;
  items?: Array<{ materialRequestItemId?: string | null } | null> | null;
};

export type MaterialRequestOcListRow = {
  key: string;
  id: string;
  idTitle?: string;
  status: string;
  /** Dica ao passar o mouse (ex.: fluxo do Fluig). */
  statusTitle?: string;
  statusBadgeClassName: string;
};

const RM_POST_APPROVAL = new Set(['APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED']);

const ocWaitBadgeClass =
  'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';

/** Rótulo da OC sem prefixo "OC -" para caber melhor na coluna. */
export function purchaseOrderPhaseShortLabel(
  orderOrStatus: string | MaterialRequestOcListPurchaseOrder
): string {
  const full =
    typeof orderOrStatus === 'string'
      ? purchaseOrderPhaseLabelForOrder({ status: orderOrStatus })
      : purchaseOrderPhaseLabelForOrder(orderOrStatus);
  return full.replace(/^OC\s*-\s*/i, '').trim() || full;
}

const badgeBase = 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

/**
 * OC no TOTVS: mostra onde ela está no Fluig (G3 aprovação, G4 pagamento).
 * Sem fase no espelho ainda: diz se já foi enviada ao TOTVS. OCs do fluxo do Conecta: null.
 */
function ocFaseTotvsFluig(
  po: MaterialRequestOcListPurchaseOrder
): { status: string; title: string; badge: string } | null {
  if (po.status === 'CANCELLED' || po.status === 'REJECTED') return null;
  const fase = po.fluigFase;
  if (fase?.etapa) {
    const finalizada = /finalizad/i.test(fase.etapa);
    const badge = finalizada
      ? `${badgeBase} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200`
      : fase.fluxo === 'G4'
        ? `${badgeBase} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`
        : `${badgeBase} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200`;
    const etapa = finalizada && fase.fluxo === 'G4' ? 'Pagamento finalizado' : fase.etapa;
    const fluxo = fase.fluxo === 'G4' ? 'Fluig G4 — pagamento' : 'Fluig G3 — aprovação da OC';
    return { status: etapa, title: `${fluxo}: ${fase.etapa}`, badge };
  }
  if (!po.totvsFluxoDireto) return null;
  if (!po.totvsIdMov) {
    return { status: 'Não enviada ao TOTVS', title: 'OC ainda não enviada ao TOTVS', badge: ocWaitBadgeClass };
  }
  return {
    status: 'Enviada ao TOTVS',
    title: 'Enviada ao TOTVS; a fase do Fluig aparece na próxima atualização do espelho',
    badge: `${badgeBase} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200`,
  };
}

export function sortMaterialRequestPurchaseOrders<T extends MaterialRequestOcListPurchaseOrder>(
  orders: T[]
): T[] {
  return sortPurchaseOrdersByMostRecent(orders);
}

export function materialRequestOcListRows(
  request: { status?: string },
  purchaseOrders: MaterialRequestOcListPurchaseOrder[]
): MaterialRequestOcListRow[] {
  const rm = String(request.status || '');
  const pos = Array.isArray(purchaseOrders) ? purchaseOrders : [];

  if (!RM_POST_APPROVAL.has(rm)) return [];

  if (pos.length === 0) {
    if (rm === 'APPROVED') {
      return [
        {
          key: 'wait-oc',
          id: '—',
          status: 'Aguardando OC',
          statusBadgeClassName: ocWaitBadgeClass
        }
      ];
    }
    return [];
  }

  return sortMaterialRequestPurchaseOrders(pos).map((po) => {
    const fullNumber = po.orderNumber && String(po.orderNumber).trim() ? String(po.orderNumber) : '';
    const id = fullNumber ? formatOcListDisplayId(fullNumber) : po.id.slice(0, 8);
    const totvs = ocFaseTotvsFluig(po);
    if (totvs) {
      return {
        key: `po-${po.id}`,
        id,
        idTitle: fullNumber || undefined,
        status: totvs.status,
        statusTitle: totvs.title,
        statusBadgeClassName: totvs.badge
      };
    }
    return {
      key: `po-${po.id}`,
      id,
      idTitle: fullNumber || undefined,
      status: purchaseOrderPhaseShortLabel(po),
      statusBadgeClassName: ocStatusBadgeClassForOrder(po)
    };
  });
}
