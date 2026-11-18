'use client';

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

type Row = { employeeId: string; codigoAtestado: string; observacao: string };

function rowsFromDetails(details: Record<string, unknown> | null | undefined): Row[] {
  const d = details ?? {};
  const list = Array.isArray(d.atestados) ? (d.atestados as Record<string, unknown>[]) : null;
  if (list) {
    return list.map((r) => ({
      employeeId: String(r.employeeId ?? ''),
      codigoAtestado: String(r.codigoAtestado ?? ''),
      observacao: String(r.observacao ?? ''),
    }));
  }
  // Formato antigo (ex.: atestado enviado pelo WhatsApp): campos direto em details.
  return [
    {
      employeeId: String(d.employeeId ?? ''),
      codigoAtestado: String(d.codigoAtestado ?? ''),
      observacao: String(d.observacao ?? ''),
    },
  ];
}

const fieldCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

/** Código (CID) e observação do atestado: editáveis depois de criado, por quem abriu ou pelo DP. */
export function AtestadoEditavel({
  requestId,
  details,
  employeeNameById,
  onSaved,
}: {
  requestId: string;
  details?: Record<string, unknown> | null;
  employeeNameById?: Map<string, string>;
  onSaved?: (details: Record<string, unknown>) => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => rowsFromDetails(details));
  const [savingIdx, setSavingIdx] = useState<number | null>(null);

  useEffect(() => {
    setRows(rowsFromDetails(details));
  }, [requestId, details]);

  async function save(index: number) {
    const row = rows[index];
    setSavingIdx(index);
    try {
      const res = await api.put(`/solicitacoes-dp/${requestId}/atestado`, {
        employeeId: row.employeeId || undefined,
        codigoAtestado: row.codigoAtestado,
        observacao: row.observacao,
      });
      const next = res.data?.data?.details as Record<string, unknown> | undefined;
      if (next) onSaved?.(next);
      toast.success('Atestado atualizado');
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey?.[0] ?? '').toLowerCase().includes('dp'),
      });
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      toast.error(data?.error || data?.message || 'Não foi possível atualizar o atestado');
    } finally {
      setSavingIdx(null);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Código e observação do atestado
      </h3>
      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={`${row.employeeId}-${index}`} className="space-y-2">
            {rows.length > 1 || (row.employeeId && employeeNameById?.get(row.employeeId)) ? (
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {employeeNameById?.get(row.employeeId) || `Atestado ${index + 1}`}
              </p>
            ) : null}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Código do atestado (CID)
              </label>
              <input
                type="text"
                className={fieldCls}
                value={row.codigoAtestado}
                maxLength={40}
                onChange={(e) =>
                  setRows((p) => p.map((r, i) => (i === index ? { ...r, codigoAtestado: e.target.value } : r)))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Observação
              </label>
              <textarea
                className={`${fieldCls} min-h-[72px] resize-y`}
                value={row.observacao}
                maxLength={1000}
                onChange={(e) =>
                  setRows((p) => p.map((r, i) => (i === index ? { ...r, observacao: e.target.value } : r)))
                }
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void save(index)}
                disabled={savingIdx === index}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                {savingIdx === index ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
