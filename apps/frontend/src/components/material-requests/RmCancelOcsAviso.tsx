'use client';

import React from 'react';
import { Ban } from 'lucide-react';

type OcDaRm = { status?: string | null; orderNumber?: string | null };

/** OCs da RM que contam para o bloqueio: todas, menos as canceladas e as reprovadas. */
function ocsAtivas(purchaseOrders?: OcDaRm[] | null): OcDaRm[] {
  return (purchaseOrders ?? []).filter((o) => o.status !== 'CANCELLED' && o.status !== 'REJECTED');
}

/** RM com OC gerada não pode ser cancelada (o servidor também bloqueia). */
export function rmTemOcAtiva(purchaseOrders?: OcDaRm[] | null): boolean {
  return ocsAtivas(purchaseOrders).length > 0;
}

/** Na confirmação de cancelar a RM: avisa que o cancelamento está bloqueado porque já existe OC. */
export function RmCancelOcsAviso({ purchaseOrders }: { purchaseOrders?: OcDaRm[] | null }) {
  const ativas = ocsAtivas(purchaseOrders);
  if (ativas.length === 0) return null;
  const numeros = ativas.map((o) => o.orderNumber).filter(Boolean).join(', ');
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
      <Ban className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <strong>Não é possível cancelar esta RM:</strong> ela já tem OC gerada{numeros ? ` (${numeros})` : ''}. Cancele ou
        reprove a OC antes de cancelar a RM.
      </span>
    </p>
  );
}
