'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

type OcDaRm = { status?: string | null; orderNumber?: string | null };

/** Aviso na confirmação de cancelar a RM: as OCs dela não são canceladas (nem nada no TOTVS). */
export function RmCancelOcsAviso({ purchaseOrders }: { purchaseOrders?: OcDaRm[] | null }) {
  const ativas = (purchaseOrders ?? []).filter((o) => o.status !== 'CANCELLED' && o.status !== 'REJECTED');
  if (ativas.length === 0) return null;
  const numeros = ativas.map((o) => o.orderNumber).filter(Boolean).join(', ');
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        Esta RM tem {ativas.length} OC(s){numeros ? ` (${numeros})` : ''}. Cancelar a RM não cancela as OCs nem nada
        no TOTVS. Cancele as OCs separadamente se for o caso.
      </span>
    </p>
  );
}
