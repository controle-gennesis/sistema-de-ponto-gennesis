'use client';

import React from 'react';

/** Linha pequena com o(s) colaborador(es) da solicitação (HE, atestado etc.) para as listas. */
export function ColaboradoresLinha({ nomes }: { nomes?: string[] | null }) {
  const lista = (nomes ?? []).filter(Boolean);
  if (lista.length === 0) return null;
  const resumo = lista.length > 2 ? `${lista.slice(0, 2).join(', ')} +${lista.length - 2}` : lista.join(', ');
  return (
    <div
      className="truncate text-xs text-gray-500 dark:text-gray-400"
      title={lista.join(', ')}
    >
      Colaborador: {resumo}
    </div>
  );
}
