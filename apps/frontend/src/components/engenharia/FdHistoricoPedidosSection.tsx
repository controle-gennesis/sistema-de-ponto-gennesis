'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileText, History, Loader2, ShoppingCart } from 'lucide-react';
import api from '@/lib/api';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import {
  OC_STATUS,
  RM_STATUS,
  type ItemResumo,
  type OcResumo,
} from '@/components/engenharia/FdPedidosResumoModal';

type RmHistorico = {
  id: string;
  requestNumber: string;
  status: string | null;
  requestedAt: string;
  itens: number;
  ocs: OcResumo[];
};

const fmtData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Histórico de pedidos da FD em cards: FD → RMs geradas → OCs de cada RM (com IdMov do TOTVS).
 * Só leitura — usa o mesmo resumo do modal "Itens já solicitados".
 */
export function FdHistoricoPedidosSection({
  fdApprovalId,
  codFichaDemanda,
}: {
  fdApprovalId: string;
  codFichaDemanda: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fd-pedidos-resumo', fdApprovalId],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/${fdApprovalId}/pedidos-resumo`);
      return res.data?.data as { codFichaDemanda: string; itens: ItemResumo[] };
    },
    enabled: !!fdApprovalId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  /** Agrupa os itens pedidos por RM, na ordem em que foram pedidos. */
  const rms = useMemo<RmHistorico[]>(() => {
    const porRm = new Map<string, RmHistorico>();
    for (const it of data?.itens ?? []) {
      const key = it.rm.id || it.rm.requestNumber;
      const atual: RmHistorico = porRm.get(key) ?? {
        id: it.rm.id,
        requestNumber: it.rm.requestNumber,
        status: it.rm.status,
        requestedAt: it.requestedAt,
        itens: 0,
        ocs: [],
      };
      atual.itens += 1;
      for (const m of it.materiais) {
        for (const oc of m.ocs) {
          if (!atual.ocs.some((o) => o.orderNumber === oc.orderNumber)) atual.ocs.push(oc);
        }
      }
      porRm.set(key, atual);
    }
    return [...porRm.values()].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  }, [data]);

  const totalOcs = rms.reduce((acc, r) => acc + r.ocs.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <History className="h-4 w-4 text-gray-500" />
        Histórico de pedidos
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar o histórico de pedidos.</p>
      ) : (
        <>
          {/* FD */}
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
              <FileText className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {data?.codFichaDemanda || codFichaDemanda || 'FD'}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {rms.length === 0
                  ? 'Ainda não gerou nenhuma RM.'
                  : `Gerou ${plural(rms.length, 'RM', 'RMs')}${rms.length ? `: ${rms.map((r) => r.requestNumber).join(', ')}` : ''}`}
              </p>
            </div>
          </div>

          {/* RMs */}
          {rms.length > 0 && (
            <div className="grid gap-3 border-l-2 border-red-200 pl-4 sm:grid-cols-2 dark:border-red-900/60">
              {rms.map((rm) => (
                <div
                  key={rm.id || rm.requestNumber}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/60"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      <ClipboardList className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{rm.requestNumber || 'RM'}</p>
                        {rm.status && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {RM_STATUS[rm.status] ?? rm.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {fmtData(rm.requestedAt)} · {plural(rm.itens, 'item da FD', 'itens da FD')}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        {rm.ocs.length === 0
                          ? 'Ainda não gerou ordem de compra.'
                          : `Gerou ${plural(rm.ocs.length, 'OC', 'OCs')}`}
                      </p>
                    </div>
                  </div>

                  {/* OCs */}
                  {rm.ocs.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {rm.ocs.map((oc) => (
                        <div
                          key={oc.orderNumber}
                          className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                            <div className="min-w-0">
                              {/* orderNumber vem como "OC-2026-0010"; exibe "OC 10" como no restante do sistema. */}
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100" title={oc.orderNumber}>
                                OC {formatOcListDisplayId(oc.orderNumber)}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {OC_STATUS[oc.status] ?? oc.status}
                              </p>
                            </div>
                          </div>
                          {oc.totvsIdMov != null ? (
                            <span className="shrink-0 rounded-md bg-green-100 px-2 py-1 text-xs font-semibold tabular-nums text-green-800 dark:bg-green-900/40 dark:text-green-300">
                              IdMov {oc.totvsIdMov}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                              Não enviada ao TOTVS
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {rms.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {plural(rms.length, 'RM', 'RMs')} · {plural(totalOcs, 'OC', 'OCs')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
