'use client';

import React from 'react';
import {
  FD_STATUS_LABELS,
  fdPurchaseStatusBadgeClass,
  fdStatusBadgeClass,
  purchaseStatusLabel,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

const badgeBase = 'inline-flex max-w-[220px] rounded-full px-2.5 py-0.5 text-xs font-semibold';

/**
 * Um único status na linha do tempo:
 * Pendente de aprovação → Aprovada → status de compras (quando houver).
 */
export function FdStatusBadges({ record }: { record: FichaDemandaApprovalRecord }) {
  if (record.status === 'APPROVED' && record.purchaseStatus) {
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
