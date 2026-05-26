'use client';

import React from 'react';
import { X } from 'lucide-react';
import { BoletoParcelasList } from '@/components/oc/BoletoParcelasList';
import type { BoletoParcelasOrderFields } from '@/components/oc/boletoParcelasUtils';

export type BoletoParcelasModalOrder = BoletoParcelasOrderFields & {
  id: string;
  orderNumber: string;
};

export type BoletoParcelasModalProps = {
  order: BoletoParcelasModalOrder;
  onClose: () => void;
  onSaved: (payload: { data: unknown }) => void;
};

export function BoletoParcelasModal({ order, onClose, onSaved }: BoletoParcelasModalProps) {
  const n = order.paymentParcelCount ?? 1;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Boletos por parcela</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {order.orderNumber} — {n} parcela{n > 1 ? 's' : ''} (condição de pagamento). Informe valor,
              vencimento e arquivo por parcela.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <BoletoParcelasList
          order={order}
          editable
          hint="Envie uma parcela por vez ao financeiro após anexar o boleto da parcela atual."
          onSaved={(payload) => {
            onSaved(payload);
            onClose();
          }}
        />

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
