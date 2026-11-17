'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Loader2, Undo2, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import {
  HistoricoCorrecoes,
  correcoesDoItemRm,
  type RmCorrecaoLog,
} from '@/components/engenharia/HistoricoCorrecoes';

type RmCorrecaoPendente = {
  id: string;
  requestNumber: string;
  costCenter?: { code?: string | null; name?: string | null } | null;
  requester?: { name?: string | null } | null;
  demandSheet?: string | null;
  items: { id: string; materialId: string; materialLabel: string; quantity: number; unit: string }[];
  correcoes: RmCorrecaoLog[];
};

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

/**
 * Itens corrigidos pelo solicitante (RM aprovada com OC em andamento) aguardando o aprovador:
 * aprovar devolve os itens ao mapa de cotação; devolver manda de novo para correção.
 */
export function RmCorrecoesAprovacaoSection() {
  const queryClient = useQueryClient();
  const [devolverRm, setDevolverRm] = useState<RmCorrecaoPendente | null>(null);
  const [nota, setNota] = useState('');

  const { data: pendentes = [], isLoading } = useQuery({
    queryKey: ['rm-correcoes-aguardando-aprovacao'],
    queryFn: async () => {
      const res = await api.get('/material-requests/correcoes/aguardando-aprovacao');
      return (res.data?.data ?? []) as RmCorrecaoPendente[];
    },
    refetchOnWindowFocus: true,
  });

  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['rm-correcoes-aguardando-aprovacao'] }),
      queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['material-requests-approved-map'] }),
      queryClient.invalidateQueries({ queryKey: ['rm-minhas-correcao-count'] }),
      queryClient.invalidateQueries({ queryKey: ['fd-pedidos-resumo'] }),
    ]);

  const aprovarMutation = useMutation({
    mutationFn: async (rmId: string) => (await api.post(`/material-requests/${rmId}/correcoes/aprovar`)).data,
    onSuccess: async () => {
      toast.success('Correção aprovada. Os itens voltaram ao mapa de cotação.');
      await atualizar();
    },
    onError: (e: { response?: { data?: { message?: string; error?: string } } }) =>
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Não foi possível aprovar a correção'),
  });

  const devolverMutation = useMutation({
    mutationFn: async ({ rmId, correctionNote }: { rmId: string; correctionNote: string }) =>
      (await api.post(`/material-requests/${rmId}/correcoes/devolver`, { correctionNote })).data,
    onSuccess: async () => {
      toast.success('Correção devolvida ao solicitante.');
      setDevolverRm(null);
      setNota('');
      await atualizar();
    },
    onError: (e: { response?: { data?: { message?: string; error?: string } } }) =>
      toast.error(e.response?.data?.message || e.response?.data?.error || 'Não foi possível devolver a correção'),
  });

  if (isLoading || pendentes.length === 0) return null;

  return (
    <>
      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderIconRow}>
            <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
              <Wrench className="h-5 w-5 text-amber-700 sm:h-6 sm:w-6 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Itens corrigidos</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Correções de itens de RMs aprovadas aguardando a sua aprovação antes de voltar ao mapa de cotação.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendentes.map((rm) => (
            <section key={rm.id} className="rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                <div className="min-w-0 text-sm">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    RM {formatRmListDisplayId(rm.requestNumber)}
                  </span>
                  <span className="ml-2 text-xs text-gray-600 dark:text-gray-300">
                    {[rm.costCenter?.code || rm.costCenter?.name, rm.requester?.name, rm.demandSheet]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDevolverRm(rm)}
                    disabled={aprovarMutation.isPending || devolverMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Devolver para correção
                  </button>
                  <button
                    type="button"
                    onClick={() => aprovarMutation.mutate(rm.id)}
                    disabled={aprovarMutation.isPending || devolverMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {aprovarMutation.isPending && aprovarMutation.variables === rm.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Aprovar correção
                  </button>
                </div>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="text-gray-500 dark:text-gray-400">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-2 font-medium">Material (corrigido)</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  {rm.items.map((it) => (
                    <tr key={it.id} className="border-b border-gray-100 align-top last:border-0 dark:border-gray-800">
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                        {it.materialLabel || 'Material'}
                        <HistoricoCorrecoes registros={correcoesDoItemRm(rm.correcoes, it.materialId)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                        {fmtQtd(it.quantity)} {it.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!devolverRm}
        onClose={() => {
          if (devolverMutation.isPending) return;
          setDevolverRm(null);
          setNota('');
        }}
        title="Devolver correção ao solicitante"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Os itens voltam para correção na RM {devolverRm ? formatRmListDisplayId(devolverRm.requestNumber) : ''}.
            Informe o que precisa ser alterado.
          </p>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            maxLength={4000}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="O que precisa ser alterado..."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDevolverRm(null);
                setNota('');
              }}
              disabled={devolverMutation.isPending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (!devolverRm) return;
                if (!nota.trim()) {
                  toast.error('Informe o que precisa ser alterado');
                  return;
                }
                devolverMutation.mutate({ rmId: devolverRm.id, correctionNote: nota.trim() });
              }}
              disabled={devolverMutation.isPending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {devolverMutation.isPending ? 'Enviando…' : 'Devolver'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
