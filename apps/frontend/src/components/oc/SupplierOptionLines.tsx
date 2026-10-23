'use client';

import React from 'react';

export type SupplierOptionLinesData = {
  name?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
};

/** Nome exibido do fornecedor: fantasia, ou razão social quando não há fantasia. */
export function supplierDisplayName(supplier: SupplierOptionLinesData): string {
  return String(supplier.tradeName || '').trim() || String(supplier.name || '').trim();
}

function formatSupplierDocument(value: string | null | undefined): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return String(value || '').trim() || '—';
}

/** Opção de fornecedor em três linhas: nome fantasia, razão social e CNPJ. */
export function SupplierOptionLines({ supplier }: { supplier: SupplierOptionLinesData }) {
  const nome = supplierDisplayName(supplier) || '—';
  const razao = String(supplier.name || '').trim() || '—';
  const documento = formatSupplierDocument(supplier.cnpj);
  return (
    <span className="block min-w-0 leading-snug">
      <span className="block truncate font-medium" title={nome}>
        {nome}
      </span>
      <span className="block truncate text-xs text-gray-500 dark:text-gray-400" title={razao}>
        {razao}
      </span>
      <span className="block truncate text-xs text-gray-500 dark:text-gray-400" title={documento}>
        {documento}
      </span>
    </span>
  );
}
