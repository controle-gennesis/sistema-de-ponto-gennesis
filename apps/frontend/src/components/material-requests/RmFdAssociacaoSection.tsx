'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import type { FdItemPedido } from '@/components/engenharia/FdPedidoMaterialModal';

type FdAssociacao = {
  fdId: string;
  codFichaDemanda: string;
  obra: string;
  itens: FdItemPedido[];
  orcamentoId?: string | null;
  contratoId?: string | null;
  centroCustoId?: string | null;
};

const fmtQtd = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const ALERTA_LABEL: Record<string, string> = {
  '1:N': '1 item da FD com vários materiais',
  unidade: 'unidade diferente da FD',
};

export function RmFdAssociacaoSection({ materialRequestId }: { materialRequestId: string }) {
  const [alertasExpandidos, setAlertasExpandidos] = useState(false);

  const { data } = useQuery({
    queryKey: ['rm-fd-association', materialRequestId],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/by-material-request/${materialRequestId}`);
      return (res.data?.data ?? null) as FdAssociacao | null;
    },
    enabled: !!materialRequestId,
    staleTime: 60_000,
    retry: false,
  });

  if (!data || data.itens.length === 0) return null;

  const itensComAlerta = data.itens.filter((i) => (i.alertas ?? []).length > 0);
  const emAlerta = itensComAlerta.length;
  const orcamentoLink = data.orcamentoId && data.contratoId
    ? `/ponto/orcamentos/${data.contratoId}/${data.orcamentoId}`
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Ficha de Demanda {data.codFichaDemanda ? `· ${data.codFichaDemanda}` : ''}
          {data.obra && <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">— {data.obra}</span>}
        </p>
        {orcamentoLink && (
          <a
            href={orcamentoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver no orçamento
          </a>
        )}
      </div>

      {emAlerta > 0 && (
        <div className="rounded-lg border border-red-300 dark:border-red-700">
          <button
            type="button"
            onClick={() => setAlertasExpandidos((v) => !v)}
            className="flex w-full items-center gap-2 rounded-t-lg bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {emAlerta} item(ns) da FD precisam de atenção antes da aprovação.
            {alertasExpandidos
              ? <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />
              : <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" />}
          </button>
          {alertasExpandidos && (
            <ul className="space-y-2 p-3">
              {itensComAlerta.map((it) => {
                const alertas = it.alertas ?? [];
                return (
                  <li
                    key={it.fdItemKey}
                    className="rounded-md border border-red-400 bg-red-50 p-3 dark:border-red-700 dark:bg-red-950/30"
                  >
                    <p className="font-medium text-red-800 dark:text-red-200">
                      <span className="mr-2 tabular-nums opacity-70">{it.fdItem}</span>
                      {it.descricao}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      Qtd. FD: {it.quantidadeFd != null ? `${fmtQtd(it.quantidadeFd)} ${it.unidadeFd || ''}` : '—'}
                    </p>
                    {(it.materiais ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {(it.materiais ?? []).map((m, idx) => (
                          <li key={`${m.materialId}-${idx}`} className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                              → {m.materialLabel || 'Material'}
                            </span>
                            <span
                              className={`shrink-0 tabular-nums ${
                                it.unidadeFd && m.unit !== it.unidadeFd
                                  ? 'font-semibold text-red-700 dark:text-red-300'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {fmtQtd(m.quantity)} {m.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">
                      Atenção: {alertas.map((a) => ALERTA_LABEL[a] ?? a).join(' e ')} — quantidade não travada pela FD.
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Tabela resumo dos itens da FD e materiais pedidos */}
      <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-base">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">Item da FD</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Qtd. FD</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">Material</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">Qtd. pedida</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {data.itens.map((it) => {
              const materiais = it.materiais ?? [];
              const rowSpan = Math.max(1, materiais.length);
              const hasAlerta = (it.alertas ?? []).length > 0;
              return materiais.length <= 1 ? (
                <tr key={it.fdItemKey} className={hasAlerta ? 'bg-red-50/50 dark:bg-red-950/20' : ''}>
                  <td className="px-4 py-3 align-top text-gray-900 dark:text-gray-100">
                    <span className="mr-1.5 tabular-nums text-gray-400 dark:text-gray-500">{it.fdItem}</span>
                    {it.descricao}
                    {hasAlerta && <AlertTriangle className="ml-1.5 inline h-4 w-4 text-red-500" />}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300">
                    {it.quantidadeFd != null ? `${fmtQtd(it.quantidadeFd)} ${it.unidadeFd || ''}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    {materiais[0] ? materiais[0].materialLabel : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300">
                    {materiais[0] ? `${fmtQtd(materiais[0].quantity)} ${materiais[0].unit}` : '—'}
                  </td>
                </tr>
              ) : (
                materiais.map((m, idx) => (
                  <tr key={`${it.fdItemKey}-${idx}`} className={`${hasAlerta ? 'bg-red-50/50 dark:bg-red-950/20' : ''} ${idx > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                    {idx === 0 && (
                      <>
                        <td className="px-4 py-3 align-top text-gray-900 dark:text-gray-100" rowSpan={rowSpan}>
                          <span className="mr-1.5 tabular-nums text-gray-400 dark:text-gray-500">{it.fdItem}</span>
                          {it.descricao}
                          {hasAlerta && <AlertTriangle className="ml-1.5 inline h-4 w-4 text-red-500" />}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300 align-top" rowSpan={rowSpan}>
                          {it.quantidadeFd != null ? `${fmtQtd(it.quantidadeFd)} ${it.unidadeFd || ''}` : '—'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {m.materialLabel}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {fmtQtd(m.quantity)} {m.unit}
                    </td>
                  </tr>
                ))
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
