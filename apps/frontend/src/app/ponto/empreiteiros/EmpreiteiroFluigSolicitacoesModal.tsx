'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileText, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { buildFluigWorkflowProcessViewUrl } from '@/lib/fluigWorkflowApproval';
import { Modal } from '@/components/ui/Modal';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';

type SolicitacaoFluig = {
  numero: string;
  titulo: string;
  natureza: string;
  fase: string;
  contrato: string;
  filial: string;
  solicitante: string;
  favorecido: string;
  data: string | null;
  vencimento: string | null;
  pagamento: string | null;
  valor: number;
  vinculo: 'documento' | 'nome';
};

type Resposta = { itens: SolicitacaoFluig[]; total: number; totalPago: number };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** No Fluig a etapa 117 é a última (pagamento concluído): aparece como "Finalizado". */
export function faseExibicao(fase: string): { texto: string; finalizada: boolean } {
  const finalizada = /(^|[^0-9])117([^0-9]|$)/.test(fase);
  return { texto: finalizada ? 'Finalizado' : fase, finalizada };
}

function dataBr(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
}

function useFluigDaEmpreita(empreiteiroId: string, ativo = true) {
  return useQuery({
    queryKey: ['empreiteiro-fluig-solicitacoes', empreiteiroId],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${empreiteiroId}/fluig-solicitacoes`);
      return (res.data?.data ?? { itens: [], total: 0, totalPago: 0 }) as Resposta;
    },
    enabled: ativo,
    staleTime: 60_000,
  });
}

/** Os 3 totais, como cards de métrica do sistema (ficam fora do cartão da lista). */
export function EmpreiteiroFluigResumoCards({ empreiteiroId }: { empreiteiroId: string }) {
  const { data, isLoading } = useFluigDaEmpreita(empreiteiroId);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
      <FilterStatCard
        label="Solicitações"
        count={data?.itens.length ?? 0}
        icon={FileText}
        iconBg="bg-blue-100 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        loading={isLoading}
      />
      <FilterStatCard
        label="Total solicitado"
        count={brl(data?.total ?? 0)}
        icon={Wallet}
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        iconColor="text-amber-600 dark:text-amber-400"
        loading={isLoading}
      />
      <FilterStatCard
        label="Total pago"
        count={brl(data?.totalPago ?? 0)}
        icon={CheckCircle2}
        iconBg="bg-emerald-100 dark:bg-emerald-900/30"
        iconColor="text-emerald-600 dark:text-emerald-400"
        loading={isLoading}
      />
    </div>
  );
}

/** Lista de solicitações do Fluig da empreita (usada na aba da página da empreita). */
export function EmpreiteiroFluigSolicitacoesPainel({ empreiteiroId, ativo = true }: { empreiteiroId: string; ativo?: boolean }) {
  const { data, isLoading, error, refetch } = useFluigDaEmpreita(empreiteiroId, ativo);

  const itens = data?.itens ?? [];

  return (
    <>
      {isLoading ? (
        <CadastroListLoading message="Buscando solicitações no Fluig..." />
      ) : error ? (
        <div className="py-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">Não foi possível carregar as solicitações.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
          >
            Tentar novamente
          </button>
        </div>
      ) : itens.length === 0 ? (
        <CadastroListEmpty
          icon={FileText}
          title="Nenhuma solicitação encontrada"
          hint="Não há solicitações de serviços tomados no Fluig com o CPF ou CNPJ desta empreita."
        />
      ) : (
        <div className="space-y-4">
          <div className="table-scroll max-h-[60vh] overflow-y-auto">
            <table className={`${cadastroListClasses.table} text-sm`}>
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className={cadastroListClasses.th}>Nº</th>
                  <th className={cadastroListClasses.th}>Solicitação</th>
                  <th className={`${cadastroListClasses.th} text-center`}>Fase</th>
                  <th className={cadastroListClasses.th}>Abertura</th>
                  <th className={cadastroListClasses.th}>Vencimento</th>
                  <th className={cadastroListClasses.th}>Pagamento</th>
                  <th className={`${cadastroListClasses.th} text-right`}>Valor</th>
                  <th className={`${cadastroListClasses.th} text-center`}>Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {itens.map((s) => (
                  <tr key={`${s.numero}-${s.valor}-${s.data}`}>
                    <td className={`${cadastroListClasses.td} whitespace-nowrap tabular-nums`}>{s.numero || '—'}</td>
                    <td className={cadastroListClasses.td}>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{s.titulo || '—'}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {[s.contrato, s.filial].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {s.vinculo === 'nome' ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Ligada pelo nome, confira o documento
                        </p>
                      ) : null}
                    </td>
                    <td className={`${cadastroListClasses.td} text-center`}>
                      {s.fase ? (
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            faseExibicao(s.fase).finalizada
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {faseExibicao(s.fase).texto}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={`${cadastroListClasses.td} whitespace-nowrap`}>{dataBr(s.data)}</td>
                    <td className={`${cadastroListClasses.td} whitespace-nowrap`}>{dataBr(s.vencimento)}</td>
                    <td className={`${cadastroListClasses.td} whitespace-nowrap`}>
                      {s.pagamento ? (
                        <span className="font-medium text-emerald-700 dark:text-emerald-400">{dataBr(s.pagamento)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={`${cadastroListClasses.td} whitespace-nowrap text-right tabular-nums`}>{brl(s.valor)}</td>
                    <td className={`${cadastroListClasses.td} whitespace-nowrap text-center`}>
                      {s.numero ? (
                        <a
                          href={buildFluigWorkflowProcessViewUrl(s.numero)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir no Fluig"
                          title="Abrir no Fluig"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

export function EmpreiteiroFluigSolicitacoesModal({
  empreiteiroId,
  empreiteiroNome,
  isOpen,
  onClose,
}: {
  empreiteiroId: string;
  empreiteiroNome: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Solicitações no Fluig · ${empreiteiroNome}`} size="5xl">
      <div className="space-y-4">
        <EmpreiteiroFluigResumoCards empreiteiroId={empreiteiroId} />
        <EmpreiteiroFluigSolicitacoesPainel empreiteiroId={empreiteiroId} ativo={isOpen} />
      </div>
    </Modal>
  );
}
