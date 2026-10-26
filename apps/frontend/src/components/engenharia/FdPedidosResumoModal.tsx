'use client';

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import type { FdInsumoLine } from '@/components/engenharia/FdPedidoMaterialModal';

export type OcResumo = {
  orderNumber: string;
  status: string;
  totvsIdMov: number | null;
  totvsNumMovimento: string | null;
  /** Validada pelo compras no G4 (Anexar Nota Fiscal ou Finalizada). */
  pago?: boolean;
  /** Valor deste material na OC, rateado para o item da FD; só quando pago. */
  valorPago?: number | null;
};

/** OC paga (validada pelo compras no G4), contada uma vez pelo total da OC. */
export type OcPagaResumo = { orderNumber: string; totvsIdMov: number; valor: number };

export const fmtMoeda = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export type ItemResumo = {
  fdItemKey: string;
  fdItem: string;
  descricao: string;
  quantidadeFd: number | null;
  unidadeFd: string;
  alertas: string[];
  requestedAt: string;
  rm: { id: string; requestNumber: string; status: string | null };
  materiais: { materialId: string; materialLabel: string; quantity: number; unit: string; ocs: OcResumo[] }[];
};

export const RM_STATUS: Record<string, string> = {
  PENDING: 'Pendente',
  IN_REVIEW: 'Em correção',
  APPROVED: 'Aprovada',
  PARTIALLY_FULFILLED: 'Parcialmente atendida',
  FULFILLED: 'Atendida',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

export const OC_STATUS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_COMPRAS: 'Aprovação Compras',
  PENDING: 'Aprovação Gestor',
  PENDING_DIRETORIA: 'Aprovação Diretoria',
  IN_REVIEW: 'Correção',
  APPROVED: 'Aprovada',
  PENDING_PROOF_VALIDATION: 'Validação de comprovante',
  PENDING_PROOF_CORRECTION: 'Correção de comprovante',
  PENDING_NF_ATTACHMENT: 'Anexar NF',
  SENT: 'Enviada',
  FINALIZED: 'Finalizada',
  PARTIALLY_RECEIVED: 'Parcialmente recebida',
  RECEIVED: 'Recebida',
  REJECTED: 'Reprovada',
  CANCELLED: 'Cancelada',
};

const ALERTA_LABEL: Record<string, string> = {
  '1:N': 'vários materiais',
  unidade: 'unidade diferente da FD',
};

const fmtQtd = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fdApprovalId: string;
  /** Itens da FD, para agrupar o resumo por etapa na ordem da ficha. */
  insumos: FdInsumoLine[];
}

/** Resumo do que já foi pedido da FD: materiais, quantidades, RM, OC e IdMov do TOTVS. Só leitura. */
export function FdPedidosResumoModal({ isOpen, onClose, fdApprovalId, insumos }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fd-pedidos-resumo', fdApprovalId],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/${fdApprovalId}/pedidos-resumo`);
      return res.data?.data as {
        codFichaDemanda: string;
        itens: ItemResumo[];
        ocsPagas?: OcPagaResumo[];
        totalOcsPagas?: number;
      };
    },
    enabled: isOpen && !!fdApprovalId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  /** Agrupa por RM (pedido), mostrando todos os itens de cada RM juntos. */
  const grupos = useMemo(() => {
    const itens = data?.itens ?? [];
    const ordem = new Map(insumos.map((ins, idx) => [ins.key, idx]));
    const etapaPorKey = new Map(insumos.map((ins) => [ins.key, ins.etapa]));
    const byRm = new Map<string, { rm: ItemResumo['rm']; itens: ItemResumo[] }>();
    for (const it of itens) {
      const key = it.rm.id;
      if (!byRm.has(key)) byRm.set(key, { rm: it.rm, itens: [] });
      byRm.get(key)!.itens.push(it);
    }
    const groups = Array.from(byRm.values()).map((g) => ({
      ...g,
      itens: g.itens.sort(
        (a, b) => (ordem.get(a.fdItemKey) ?? Number.MAX_SAFE_INTEGER) - (ordem.get(b.fdItemKey) ?? Number.MAX_SAFE_INTEGER),
      ),
      etapaPorKey,
    }));
    return groups;
  }, [data, insumos]);

  if (!isOpen) return null;

  const total = data?.itens.length ?? 0;
  const comOc = (data?.itens ?? []).filter((i) => i.materiais.some((m) => m.ocs.length > 0)).length;
  const ocsPagas = data?.ocsPagas ?? [];
  const totalOcsPagas = data?.totalOcsPagas ?? 0;

  return (
    <AppModalOverlay
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[85vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-900 dark:shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Itens já solicitados</h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              {data?.codFichaDemanda ? `${data.codFichaDemanda} · ` : ''}
              {total} item(ns) solicitados · {comOc} com ordem de compra
            </p>
          </div>
          <div
            className="ml-auto shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-right dark:border-emerald-800/60 dark:bg-emerald-950/30"
            title={
              ocsPagas.length
                ? ocsPagas
                    .map((oc) => `${oc.orderNumber} · IdMov ${oc.totvsIdMov} · ${fmtMoeda(oc.valor)}`)
                    .join('\n')
                : 'Nenhuma OC validada pelo compras no G4 ainda'
            }
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Total pago · {ocsPagas.length} OC(s)
            </p>
            <p className="text-base font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
              {fmtMoeda(totalOcsPagas)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar o resumo dos pedidos.
            </p>
          ) : total === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum item desta FD foi solicitado ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => (
                <section key={g.rm.id} className="rounded-lg border border-gray-200 dark:border-gray-700">
                  <h3 className="flex items-center gap-3 rounded-t-lg bg-red-50 px-3 py-2 text-sm dark:bg-red-950/40">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{g.rm.requestNumber}</span>
                    {g.rm.status && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {RM_STATUS[g.rm.status] ?? g.rm.status}
                      </span>
                    )}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-xs">
                      <thead className="text-gray-500 dark:text-gray-400">
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2 font-medium">Etapa</th>
                          <th className="px-3 py-2 font-medium">Item da FD</th>
                          <th className="px-3 py-2 font-medium">Qtd. FD</th>
                          <th className="px-3 py-2 font-medium">Material</th>
                          <th className="px-3 py-2 text-right font-medium">Qtd. pedida</th>
                          <th className="px-3 py-2 font-medium">Ordem de compra</th>
                          <th className="px-3 py-2 font-medium">IdMov TOTVS</th>
                          <th className="px-3 py-2 text-right font-medium">Valor pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.itens.map((it) => {
                          const atencao = it.alertas.length > 0;
                          const linhas = it.materiais.length > 0 ? it.materiais : [null];
                          const etapa = g.etapaPorKey.get(it.fdItemKey) || '';
                          return linhas.map((m, idx) => (
                            <tr
                              key={`${it.fdItemKey}-${it.rm.id}-${idx}`}
                              className={`border-b border-gray-100 align-top last:border-0 dark:border-gray-800 ${
                                atencao ? 'bg-red-50/70 dark:bg-red-950/25' : ''
                              }`}
                            >
                              {idx === 0 && (
                                <>
                                  <td className="px-3 py-2 text-[11px] uppercase text-gray-500 dark:text-gray-400" rowSpan={linhas.length}>
                                    {etapa}
                                  </td>
                                  <td className="px-3 py-2" rowSpan={linhas.length}>
                                    <p className={`font-medium ${atencao ? 'text-red-800 dark:text-red-200' : 'text-gray-900 dark:text-gray-100'}`}>
                                      <span className="mr-1.5 tabular-nums opacity-70">{it.fdItem}</span>
                                      {it.descricao}
                                    </p>
                                    {atencao && (
                                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-300">
                                        <AlertTriangle className="h-3 w-3" aria-hidden />
                                        {it.alertas.map((a) => ALERTA_LABEL[a] ?? a).join(' e ')}
                                      </p>
                                    )}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300" rowSpan={linhas.length}>
                                    {it.quantidadeFd != null ? `${fmtQtd(it.quantidadeFd)} ${it.unidadeFd}` : '—'}
                                  </td>
                                </>
                              )}
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{m?.materialLabel || '—'}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                                {m ? `${fmtQtd(m.quantity)} ${m.unit}` : '—'}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2">
                                {m && m.ocs.length > 0 ? (
                                  m.ocs.map((oc) => (
                                    <p key={oc.orderNumber}>
                                      <span className="font-medium text-gray-900 dark:text-gray-100">{oc.orderNumber}</span>{' '}
                                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                        · {OC_STATUS[oc.status] ?? oc.status}
                                      </span>
                                    </p>
                                  ))
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">Aguardando OC</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                                {m && m.ocs.length > 0 ? (
                                  m.ocs.map((oc) => (
                                    <p key={oc.orderNumber}>
                                      {oc.totvsIdMov != null ? (
                                        <span className="font-medium text-green-700 dark:text-green-400">{oc.totvsIdMov}</span>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500">Não enviada</span>
                                      )}
                                    </p>
                                  ))
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                                {m && m.ocs.length > 0 ? (
                                  m.ocs.map((oc) => (
                                    <p key={oc.orderNumber}>
                                      {oc.pago && oc.valorPago != null ? (
                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                          {fmtMoeda(oc.valorPago)}
                                        </span>
                                      ) : oc.totvsIdMov != null ? (
                                        <span
                                          className="text-[11px] text-amber-600 dark:text-amber-400"
                                          title="Pago só depois da Validação Compras no G4"
                                        >
                                          Aguardando validação
                                        </span>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500">—</span>
                                      )}
                                    </p>
                                  ))
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">—</span>
                                )}
                              </td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </AppModalOverlay>
  );
}
