'use client';

import React from 'react';
import {
  FD_STATUS_LABELS,
  fdPurchaseStatusBadgeClass,
  fdStatusBadgeClass,
  purchaseStatusLabel,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

const badgeBase = 'inline-flex max-w-[220px] whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold';

const EM_APROVACAO_CLASS =
  'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300';
const AGUARDANDO_SC_CLASS = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

/**
 * Um único status, no mesmo vocabulário dos cards da lista:
 * Aguardando Aprovação → (aprovada) Em Fila → Em Cotação → Finalizado.
 * "Aprovada" sozinho não aparece: depois de aprovada, a ficha mostra o status de compras.
 */
export function FdStatusBadges({ record }: { record: FichaDemandaApprovalRecord }) {
  if (record.status === 'WAITING_MANAGER') {
    return <span className={`${badgeBase} ${EM_APROVACAO_CLASS}`}>Aguardando Aprovação</span>;
  }

  if (record.status === 'APPROVED') {
    if (!record.purchaseStatus) {
      return <span className={`${badgeBase} ${AGUARDANDO_SC_CLASS}`}>Em Fila</span>;
    }
    return (
      <span
        className={`${badgeBase} ${fdPurchaseStatusBadgeClass(record.purchaseStatus)}`}
        title={purchaseStatusLabel(record.purchaseStatus)}
      >
        {purchaseStatusLabel(record.purchaseStatus)}
      </span>
    );
  }

  return (
    <span className={`${badgeBase} ${fdStatusBadgeClass(record.status)}`}>
      {FD_STATUS_LABELS[record.status]}
    </span>
  );
}
