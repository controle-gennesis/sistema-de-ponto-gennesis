'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  HardHat,
  Link2,
  Link2Off,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCpfOrCnpjInput } from '@/lib/cpf';
import { formatDateBr } from '@/lib/dateTimeBr';
import { buildFluigWorkflowProcessViewUrl } from '@/lib/fluigWorkflowApproval';
import { faseExibicao } from '@/app/ponto/empreiteiros/EmpreiteiroFluigSolicitacoesModal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
} from '@/components/ui/CadastroListSummary';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';

type Parcela = {
  id: string;
  number: number;
  amount: number;
  dueDate?: string | null;
  status: string;
  /** Número da solicitação desta parcela no Fluig. */
  fluigRequestNumber?: string | null;
};

type Servico = {
  id: string;
  empreiteiroId: string;
  name?: string | null;
  status?: string | null;
  isActive: boolean;
  plannedValue?: number | null;
  currentValue?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  installments?: Parcela[];
  contractId?: string | null;
};

type EmpreiteiroRow = {
  id: string;
  name: string;
  tradeName?: string | null;
  documentKind?: string;
  document?: string;
  cpf?: string | null;
  phone?: string;
  specialty?: string;
  email?: string | null;
  isActive: boolean;
  contracts?: Servico[];
};

type FluigParcela = { fase: string; vencimento: string | null; pagamento: string | null };

type ConferenciaSolicitacaoFluig =
  | {
      estado: 'ok' | 'semDados';
      origem: 'espelho' | 'fluig';
      solicitacao: { numero: string; titulo: string; valor: number; fase: string; favorecido: string };
    }
  | { estado: 'naoExiste' }
  | { estado: 'outroDocumento'; favorecido: string }
  | { estado: 'indisponivel' };

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const money = (value?: number | null) =>
  Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const SERVICO_STATUS: Record<string, { label: string; className: string }> = {
  NOT_STARTED: { label: 'Não iniciado', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  IN_PROGRESS: { label: 'Em andamento', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200' },
  COMPLETED: { label: 'Concluído', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' },
  CANCELLED: { label: 'Cancelado', className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' },
  OVERDUE: { label: 'Em atraso', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' },
  PENDING_REVIEW: { label: 'Avaliar', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
};

function Badge({ meta }: { meta: { label: string; className: string } }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

/**
 * Serviços e parcelas de um empreiteiro, com a coluna do Fluig no mesmo formato da tela de Empreitas:
 * vencimento e fase vêm da solicitação do Fluig; o ícone vincula (ou abre) a solicitação; o menu troca ou remove.
 */
function EmpreiteiroDetalhe({
  emp,
  servicos,
  canManage,
  onChanged,
  servicoId,
  setServicoId,
}: {
  emp: EmpreiteiroRow;
  servicos: Servico[];
  canManage: boolean;
  onChanged: () => void;
  servicoId: string | null;
  setServicoId: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  // Lista de contratos (serviços) do empreiteiro; ao tocar num, mostra as parcelas dele.
  const servicoSel = servicoId ? servicos.find((x) => x.id === servicoId) ?? null : null;
  const todasParcelas = useMemo(
    () => (emp.contracts || []).flatMap((s) => (s.installments || []).map((p) => ({ ...p, linkId: s.id }))),
    [emp.contracts],
  );
  const numerosFluig = todasParcelas
    .map((p) => p.fluigRequestNumber || '')
    .filter(Boolean)
    .join(',');

  // Fase, vencimento e pagamento de cada solicitação, direto do Fluig.
  const { data: fluigParcelas } = useQuery({
    queryKey: ['empreiteiro-fluig-parcelas', emp.id, numerosFluig],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${emp.id}/fluig-parcelas`);
      // O servidor quita as parcelas pagas no Fluig e recalcula as seguintes: recarrega os dados.
      if (res.data?.changed) onChanged();
      return (res.data?.data ?? {}) as Record<string, FluigParcela>;
    },
    enabled: numerosFluig.length > 0,
    staleTime: 60_000,
  });

  // --- Janela de vincular/trocar a solicitação ---
  const [fluigModal, setFluigModal] = useState<{ linkId: string; parcelId: string; number: number } | null>(null);
  const [numeroInput, setNumeroInput] = useState('');
  const [numeroPausado, setNumeroPausado] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setNumeroPausado(numeroInput.replace(/[^0-9]/g, '')), 500);
    return () => clearTimeout(t);
  }, [numeroInput]);
  const numeroParaConferir = fluigModal && numeroPausado.length >= 4 ? numeroPausado : '';

  // O servidor acha o número no espelho ou pergunta ao Fluig na hora e confere o CPF/CNPJ do favorecido.
  const {
    data: conferencia,
    isFetching: conferindo,
    isError: erroConferencia,
  } = useQuery({
    queryKey: ['empreiteiro-fluig-conferencia', emp.id, numeroParaConferir],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${emp.id}/fluig-solicitacao/${numeroParaConferir}`);
      return res.data?.data as ConferenciaSolicitacaoFluig;
    },
    enabled: Boolean(numeroParaConferir),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const verificacao = useMemo(() => {
    const numero = numeroInput.replace(/[^0-9]/g, '');
    if (!numero) return { estado: 'vazio' as const };
    const outra = todasParcelas.find((p) => p.id !== fluigModal?.parcelId && p.fluigRequestNumber === numero);
    if (outra) return { estado: 'jaLigada' as const, parcela: outra.number };
    if (numero.length < 4) return { estado: 'curto' as const };
    if (numero !== numeroParaConferir || conferindo) return { estado: 'carregando' as const };
    if (erroConferencia || !conferencia) return { estado: 'indisponivel' as const };
    switch (conferencia.estado) {
      case 'ok':
        return { estado: 'ok' as const, solicitacao: conferencia.solicitacao };
      case 'semDados':
        return { estado: 'semDados' as const, solicitacao: conferencia.solicitacao };
      case 'naoExiste':
        return { estado: 'naoEncontrada' as const };
      case 'outroDocumento':
        return { estado: 'outroDocumento' as const, favorecido: conferencia.favorecido };
      default:
        return { estado: 'indisponivel' as const };
    }
  }, [numeroInput, numeroParaConferir, conferencia, conferindo, erroConferencia, todasParcelas, fluigModal]);

  const abrirModal = (linkId: string, parcela: Parcela) => {
    setNumeroInput(parcela.fluigRequestNumber || '');
    setFluigModal({ linkId, parcelId: parcela.id, number: parcela.number });
  };

  const patchParcela = async (linkId: string, parcelId: string, fluigRequestNumber: string) => {
    const res = await api.patch(`/empreiteiros/${emp.id}/contracts/${linkId}/installments/${parcelId}`, {
      fluigRequestNumber,
    });
    void queryClient.invalidateQueries({ queryKey: ['empreiteiro-fluig-parcelas', emp.id] });
    onChanged();
    return res;
  };

  const salvar = async () => {
    if (!fluigModal) return;
    const numero = numeroInput.replace(/[^0-9]/g, '');
    if (!numero) {
      toast.error('Informe o número da solicitação do Fluig');
      return;
    }
    if (verificacao.estado === 'jaLigada') {
      toast.error(`Essa solicitação já está vinculada à parcela ${verificacao.parcela}.`);
      return;
    }
    if (verificacao.estado === 'naoEncontrada') {
      toast.error(`A solicitação ${numero} não foi encontrada no Fluig. Confira o número.`);
      return;
    }
    if (verificacao.estado === 'outroDocumento') {
      toast.error(`A solicitação ${numero} é de outro favorecido, e não deste CPF/CNPJ.`);
      return;
    }
    if (verificacao.estado === 'curto') {
      toast.error('Informe o número completo da solicitação do Fluig');
      return;
    }
    setSalvando(true);
    try {
      const res = await patchParcela(fluigModal.linkId, fluigModal.parcelId, numero);
      toast.success(res.data?.message || 'Solicitação vinculada à parcela');
      setFluigModal(null);
    } catch (e) {
      toast.error(errMsg(e, 'Não foi possível salvar a solicitação'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      {!servicoSel ? (
        servicos.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Este empreiteiro não tem contratos neste contrato.
          </p>
        ) : (
          <div className="table-scroll">
            <table className={`${cadastroListClasses.table} text-sm`} data-cc-skip-column-customizer="1">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className={`${cadastroListClasses.th} text-left`}>Contrato</th>
                  <th className={`${cadastroListClasses.th} text-center`}>Valor</th>
                  <th className={`${cadastroListClasses.th} text-center`}>Período</th>
                  <th className={`${cadastroListClasses.th} text-center`}>Parcelas</th>
                  <th className={`${cadastroListClasses.th} text-center`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {servicos.map((s) => {
                  const parcelas = s.installments || [];
                  const pagas = parcelas.filter((p) => String(p.status).toUpperCase() === 'PAID').length;
                  const statusMeta =
                    SERVICO_STATUS[String(s.status || 'IN_PROGRESS').toUpperCase()] || SERVICO_STATUS.IN_PROGRESS;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setServicoId(s.id)}
                      className={getListTableRowClassName(true)}
                    >
                      <td className="px-3 py-4 sm:px-6">
                        <ListRowNavigableLabel className="font-medium">{s.name || 'Contrato'}</ListRowNavigableLabel>
                      </td>
                      <td className={`${cadastroListClasses.td} text-center tabular-nums`}>
                        {money(s.currentValue ?? s.plannedValue)}
                      </td>
                      <td className={`${cadastroListClasses.td} whitespace-nowrap text-center`}>
                        {s.startDate || s.endDate
                          ? `${formatDateBr(s.startDate, '—')} a ${formatDateBr(s.endDate, '—')}`
                          : '—'}
                      </td>
                      <td className={`${cadastroListClasses.td} text-center tabular-nums`}>
                        {pagas}/{parcelas.length}
                      </td>
                      <td className={`${cadastroListClasses.td} text-center`}>
                        <Badge meta={statusMeta} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {(servicoSel ? [servicoSel] : []).map((s) => {
        const parcelas = s.installments || [];
        const pagas = parcelas.filter((p) => String(p.status).toUpperCase() === 'PAID').length;
        return (
          <div key={s.id}>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: 'Valor', value: money(s.currentValue ?? s.plannedValue), sub: 'com aditivos' },
                {
                  label: 'Parcelas pagas',
                  value: `${pagas} de ${parcelas.length}`,
                  sub: `${parcelas.length - pagas} em aberto`,
                },
                {
                  label: 'Período',
                  value: s.startDate ? formatDateBr(s.startDate, '—') : '—',
                  sub: s.endDate ? `até ${formatDateBr(s.endDate, '—')}` : 'sem data final',
                },
              ].map((c) => (
                <div
                  key={c.label}
                  className="min-w-0 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {c.label}
                  </p>
                  <p className="mt-0.5 truncate text-base font-bold text-gray-900 dark:text-white" title={c.value}>
                    {c.value}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{c.sub}</p>
                </div>
              ))}
            </div>

            {parcelas.length === 0 ? (
              <p className="border-t border-gray-200 px-3 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400 sm:px-6">
                Este contrato ainda não tem parcelas cadastradas.
              </p>
            ) : (
              <div className="table-scroll border-t border-gray-200 dark:border-gray-700">
                <table
                  className={`${cadastroListClasses.table} text-sm`}
                  data-cc-skip-column-customizer="1"
                  // Colunas fixas: «Parcela» fica estreita e colada à esquerda (embaixo do ID da tabela de cima).
                  style={{ tableLayout: 'fixed' }}
                >
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th
                        className="px-2 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                        style={{ width: '5rem' }}
                      >
                        Parcela
                      </th>
                      <th className={`${cadastroListClasses.th} text-center`}>Valor</th>
                      <th className={`${cadastroListClasses.th} text-center`}>Vencimento</th>
                      <th className={`${cadastroListClasses.th} text-center`}>Status</th>
                      <th className={`${cadastroListClasses.th} text-right`} style={{ width: '5rem' }}>
                        Fluig
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {parcelas.map((parcel) => {
                      const numeroFluig = parcel.fluigRequestNumber || '';
                      const noFluig = numeroFluig ? fluigParcelas?.[numeroFluig] : undefined;
                      const fase = noFluig?.fase ? faseExibicao(noFluig.fase) : null;
                      return (
                        <tr key={parcel.id}>
                          <td
                            className="whitespace-nowrap px-2 py-4 text-center text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100"
                            style={{ width: '5rem' }}
                          >
                            {parcel.number}ª
                          </td>
                          <td className={`${cadastroListClasses.td} text-center tabular-nums`}>
                            {money(parcel.amount)}
                          </td>
                          <td className={`${cadastroListClasses.td} whitespace-nowrap text-center`}>
                            {noFluig?.vencimento ? formatDateBr(noFluig.vencimento) : '—'}
                          </td>
                          <td className={`${cadastroListClasses.td} text-center`}>
                            {!numeroFluig ? (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                Sem solicitação
                              </span>
                            ) : fase ? (
                              <span
                                className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                  fase.finalizada
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                                }`}
                              >
                                {fase.texto}
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                Não encontrada no Fluig
                              </span>
                            )}
                          </td>
                          <td className={`${cadastroListClasses.td} text-right`} style={{ width: '5rem' }}>
                            <div className="flex items-center justify-end gap-1.5">
                              {numeroFluig ? (
                                <a
                                  href={buildFluigWorkflowProcessViewUrl(numeroFluig)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                  aria-label={`Abrir solicitação ${numeroFluig} no Fluig`}
                                  title={`Abrir solicitação ${numeroFluig} no Fluig`}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              ) : canManage ? (
                                <button
                                  type="button"
                                  onClick={() => abrirModal(s.id, parcel)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                                  aria-label="Informar solicitação do Fluig"
                                  title="Informar solicitação do Fluig"
                                >
                                  <Link2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <Modal
        isOpen={fluigModal !== null}
        onClose={() => setFluigModal(null)}
        title={`Parcela ${fluigModal?.number ?? ''}`}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Solicitação do Fluig *</label>
            <input
              type="text"
              inputMode="numeric"
              value={numeroInput}
              onChange={(e) => setNumeroInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Digite o número da solicitação. Ex.: 570966"
              className={inputClass}
              autoFocus
            />
            {verificacao.estado === 'carregando' ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Conferindo no Fluig…</p>
            ) : null}
            {verificacao.estado === 'ok' ? (
              <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                ✓ {verificacao.solicitacao.titulo || 'Solicitação'} · {money(verificacao.solicitacao.valor)} ·{' '}
                {verificacao.solicitacao.fase ? faseExibicao(verificacao.solicitacao.fase).texto : 'Sem fase'}
              </p>
            ) : null}
            {verificacao.estado === 'semDados' ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {verificacao.solicitacao.titulo || 'Solicitação'} · {money(verificacao.solicitacao.valor)}. O Fluig não
                informa o favorecido, então não deu para conferir o CPF/CNPJ.
              </p>
            ) : null}
            {verificacao.estado === 'naoEncontrada' ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">Não encontrada no Fluig. Confira o número.</p>
            ) : null}
            {verificacao.estado === 'outroDocumento' ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Essa solicitação é de outro favorecido{verificacao.favorecido ? ` (${verificacao.favorecido})` : ''}, e não
                deste CPF/CNPJ.
              </p>
            ) : null}
            {verificacao.estado === 'jaLigada' ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Essa solicitação já está vinculada à parcela {verificacao.parcela}.
              </p>
            ) : null}
            {verificacao.estado === 'indisponivel' ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Não foi possível conferir o número no Fluig agora. Ele será vinculado como digitado.
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setFluigModal(null)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                salvando ||
                !numeroInput.trim() ||
                verificacao.estado === 'curto' ||
                verificacao.estado === 'carregando' ||
                verificacao.estado === 'naoEncontrada' ||
                verificacao.estado === 'outroDocumento' ||
                verificacao.estado === 'jaLigada'
              }
              onClick={() => void salvar()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Aba "Empreiteiros" do contrato: empreiteiros com serviço neste contrato, os serviços, o valor e as
 * parcelas de cada um, com a solicitação do Fluig de cada parcela (igual à tela de Empreitas).
 * Mesmo padrão do Resumo (cartões de indicadores) e das listas do sistema (cabeçalho, busca e tabela).
 */
export function ContratoEmpreiteirosTab({ contractId, canManage }: { contractId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  // Empreiteiro aberto na janela de detalhes (serviços e parcelas).
  const [detalheId, setDetalheId] = useState<string | null>(null);
  // Contrato aberto dentro da janela (null = lista de contratos do empreiteiro).
  const [servicoDetalheId, setServicoDetalheId] = useState<string | null>(null);
  const fecharDetalhe = () => {
    setDetalheId(null);
    setServicoDetalheId(null);
  };

  const queryKey = ['empreiteiros', 'contrato', contractId];
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await api.get('/empreiteiros', { params: { contractId, limit: 500 } });
      return (res.data?.data || []) as EmpreiteiroRow[];
    },
    enabled: !!contractId,
    staleTime: 30_000,
  });

  // Só os serviços ligados a ESTE contrato (o empreiteiro pode ter serviços em outros).
  const linhas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return (data || [])
      .map((e) => ({ emp: e, servicos: (e.contracts || []).filter((s) => s.contractId === contractId) }))
      .filter((l) => l.servicos.length > 0)
      .filter((l) => {
        if (!termo) return true;
        const hay = [
          l.emp.name,
          l.emp.tradeName,
          l.emp.document,
          l.emp.cpf,
          l.emp.specialty,
          ...l.servicos.map((s) => s.name),
          ...l.servicos.flatMap((s) => (s.installments || []).map((p) => p.fluigRequestNumber)),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(termo);
      });
  }, [data, contractId, search]);

  const totais = useMemo(() => {
    let servicos = 0;
    let contratado = 0;
    let parcelas = 0;
    let pagas = 0;
    let valorPago = 0;
    let semFluig = 0;
    for (const l of linhas) {
      for (const s of l.servicos) {
        servicos += 1;
        contratado += Number(s.currentValue ?? s.plannedValue ?? 0);
        for (const p of s.installments || []) {
          parcelas += 1;
          if (String(p.status).toUpperCase() === 'PAID') {
            pagas += 1;
            valorPago += Number(p.amount || 0);
          }
          if (!p.fluigRequestNumber) semFluig += 1;
        }
      }
    }
    return { empreiteiros: linhas.length, servicos, contratado, parcelas, pagas, valorPago, semFluig };
  }, [linhas]);

  const recarregar = () => void queryClient.invalidateQueries({ queryKey });
  // Lido da lista atual: depois de vincular um número a janela já mostra os dados novos.
  const detalheAtual = detalheId ? linhas.find((l) => l.emp.id === detalheId) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FilterStatCard
          label="Empreiteiros"
          count={String(totais.empreiteiros)}
          subtitle={`${totais.servicos} contrato(s) de empreiteiro`}
          icon={HardHat}
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <FilterStatCard
          label="Valor contratado"
          count={money(totais.contratado)}
          subtitle="soma dos contratos, com aditivos"
          icon={Wallet}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
        />
        <FilterStatCard
          label="Parcelas pagas"
          count={`${totais.pagas} de ${totais.parcelas}`}
          subtitle={`${money(totais.valorPago)} pagos`}
          icon={CheckCircle2}
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <FilterStatCard
          label="Sem nº do Fluig"
          count={String(totais.semFluig)}
          subtitle={totais.semFluig > 0 ? 'parcelas sem solicitação' : 'todas as parcelas vinculadas'}
          icon={Link2Off}
          iconBg="bg-purple-100 dark:bg-purple-900/30"
          iconColor="text-purple-600 dark:text-purple-400"
        />
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <HardHat className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Empreiteiros</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{linhas.length} no contrato</p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar empreiteiro, contrato, CPF/CNPJ ou nº do Fluig..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className={cadastroListClasses.cardContent}>
          {isLoading ? (
            <CadastroListLoading message="Carregando empreiteiros..." />
          ) : isError ? (
            <CadastroListEmpty
              icon={HardHat}
              title="Não foi possível carregar"
              hint="Tente recarregar a página em instantes"
            />
          ) : linhas.length === 0 ? (
            <CadastroListEmpty
              icon={HardHat}
              title="Nenhum empreiteiro encontrado"
              hint={
                search
                  ? 'Tente ajustar a busca'
                  : 'Eles aparecem aqui quando um contrato é ligado a este contrato, em Empreitas'
              }
            />
          ) : (
            <>
              <CadastroListSummary
                startItem={1}
                endItem={linhas.length}
                total={linhas.length}
                itemLabel="empreiteiro"
                itemLabelPlural="empreiteiros"
              />
              <div className="table-scroll">
                <table className={cadastroListClasses.table} data-cc-skip-column-customizer="1">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className={cadastroListClasses.th} style={{ width: '5rem' }}>
                        ID
                      </th>
                      <th className={cadastroListClasses.th}>Empreiteiro</th>
                      <th className={cadastroListClasses.th}>CPF/CNPJ</th>
                      <th className={cadastroListClasses.th}>Especialidade</th>
                      <th className={`${cadastroListClasses.th} text-center`}>Contratos</th>
                      <th className={cadastroListClasses.thNumeric}>Valor</th>
                      <th className={`${cadastroListClasses.th} text-center`}>Parcelas</th>
                      <th className={cadastroListClasses.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {linhas.map(({ emp, servicos }, index) => {
                      const doc = emp.document || emp.cpf || '';
                      const todasParcelas = servicos.flatMap((s) => s.installments || []);
                      const pagas = todasParcelas.filter((p) => String(p.status).toUpperCase() === 'PAID').length;
                      const valor = servicos.reduce((t, s) => t + Number(s.currentValue ?? s.plannedValue ?? 0), 0);
                      return (
                        <React.Fragment key={emp.id}>
                          <tr
                            className={getListTableRowClassName(true)}
                            onClick={() => setDetalheId(emp.id)}
                          >
                            <td className={cadastroListClasses.tdMono} style={{ width: '5rem' }}>
                              {formatCadastroListId(undefined, index + 1)}
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <ListRowNavigableLabel className="font-medium">{emp.name}</ListRowNavigableLabel>
                              {emp.phone ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400">{emp.phone}</p>
                              ) : null}
                            </td>
                            <td className={cadastroListClasses.tdMuted}>{doc ? formatCpfOrCnpjInput(doc) : '—'}</td>
                            <td className={cadastroListClasses.tdMuted}>{emp.specialty || '—'}</td>
                            <td className="px-2 py-3 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6 sm:py-4">
                              {servicos.length}
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 sm:px-6 sm:py-4">
                              {money(valor)}
                            </td>
                            <td className={`${cadastroListClasses.tdMuted} text-center`}>
                              {pagas}/{todasParcelas.length}
                            </td>
                            <td className="px-2 py-3 sm:px-6 sm:py-4">
                              <Badge
                                meta={
                                  emp.isActive
                                    ? { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' }
                                    : { label: 'Inativo', className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200' }
                                }
                              />
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {detalheAtual ? (
        <Modal
          isOpen
          onClose={fecharDetalhe}
          size="5xl"
          title={
            <span className="flex min-w-0 items-center gap-2">
              {servicoDetalheId ? (
                <button
                  type="button"
                  onClick={() => setServicoDetalheId(null)}
                  className="-ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                  aria-label="Voltar para os contratos"
                  title="Voltar para os contratos"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              {(() => {
                const sv = servicoDetalheId
                  ? detalheAtual.servicos.find((x) => x.id === servicoDetalheId)
                  : null;
                if (!sv) {
                  return (
                    <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {detalheAtual.emp.name}
                    </h3>
                  );
                }
                const meta =
                  SERVICO_STATUS[String(sv.status || 'IN_PROGRESS').toUpperCase()] || SERVICO_STATUS.IN_PROGRESS;
                return (
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {sv.name || 'Contrato'}
                      </h3>
                      <Badge meta={meta} />
                    </div>
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">{detalheAtual.emp.name}</p>
                  </div>
                );
              })()}
            </span>
          }
        >
          <EmpreiteiroDetalhe
            emp={detalheAtual.emp}
            servicos={detalheAtual.servicos}
            canManage={canManage}
            onChanged={recarregar}
            servicoId={servicoDetalheId}
            setServicoId={setServicoDetalheId}
          />
        </Modal>
      ) : null}
    </div>
  );
}
