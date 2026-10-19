'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, FileText, Filter, MoreVertical, RotateCcw, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Modal } from '@/components/ui/Modal';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import {
  ListRowNavigableLabel,
  getListTableRowClassName,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { PageStack } from '@/components/ui/pageLayout';
import {
  ApprovalPhaseStatCards,
  DEFAULT_APPROVAL_PHASE_CARDS,
} from './ApprovalPhaseStatCards';
import {
  APPROVAL_STATUS_COLUMN_TITLE,
  ApprovalStatusBadge,
  type ApprovalStatusKind,
} from './ApprovalStatusBadge';

type ReviewPhase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';

type AddendumReviewItem = {
  id: string;
  number: number;
  reason: string;
  effectiveDate: string;
  amount: number;
  servicesAdded?: string | null;
  servicesRemoved?: string | null;
  files?: Array<{ url: string; name?: string }>;
  status: 'PENDING' | 'APPROVED' | 'CORRECTION';
  correctionNote?: string | null;
  approvedByName?: string | null;
  createdByName?: string | null;
  empreiteiroId: string;
  empreiteiroContractId: string;
  serviceName: string;
  empreiteiro: { id: string; name: string; specialty?: string | null };
  paymentMode: 'new' | 'redistribute';
  installments: number[];
};

const ADITIVO_PHASE_CARDS = DEFAULT_APPROVAL_PHASE_CARDS.map((card) =>
  card.filter === 'REJECTED' ? { ...card, label: 'Devolvidos' } : card,
);

const PHASE_FILTER_OPTIONS = labeledToSelectOptions([
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Devolvidos' },
  { value: 'ALL', label: 'Todos' },
]);

const PHASE_SUBTITLE: Record<ReviewPhase, string> = {
  PENDING: 'Aditivos aguardando aprovação',
  APPROVED: 'Aditivos já aprovados',
  REJECTED: 'Devolvidos para correção',
  ALL: 'Todos os aditivos',
};

const ACTION_MENU_WIDTH_PX = 224;
const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';

function itemPhase(status?: string | null): Exclude<ReviewPhase, 'ALL'> {
  const raw = String(status || '').toUpperCase();
  if (raw === 'APPROVED') return 'APPROVED';
  if (raw === 'CORRECTION') return 'REJECTED';
  return 'PENDING';
}

function statusKind(status?: string | null): ApprovalStatusKind {
  const phase = itemPhase(status);
  if (phase === 'APPROVED') return 'aprovado';
  if (phase === 'REJECTED') return 'cancelado';
  return 'pendente';
}

function statusLabel(status?: string | null) {
  const phase = itemPhase(status);
  if (phase === 'APPROVED') return 'Aprovado';
  if (phase === 'REJECTED') return 'Devolvido';
  return 'Pendente';
}

function formatDateBr(ymd?: string | null) {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatMoney(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function paymentModeLabel(item: AddendumReviewItem) {
  if (item.paymentMode === 'redistribute') return 'Redistribuído nas parcelas em aberto';
  if (item.installments.length === 0) return 'Sem parcela nova (valor reduzido)';
  if (item.installments.length === 1) return `Nova parcela de ${formatMoney(item.installments[0])}`;
  return `${item.installments.length} novas parcelas: ${item.installments
    .map((value) => formatMoney(value))
    .join(', ')}`;
}

export function AditivoApprovalsSection() {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ReviewPhase>('PENDING');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<AddendumReviewItem | null>(null);
  const [actionMenu, setActionMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [returnNote, setReturnNote] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['empreiteiro-addenda-pending', 'review'],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/addenda/pending', { params: { phase: 'ALL' } });
      return (res.data?.data || []) as AddendumReviewItem[];
    },
  });

  const rows = data ?? [];
  const counts = useMemo(() => {
    const pending = rows.filter((row) => itemPhase(row.status) === 'PENDING').length;
    const approved = rows.filter((row) => itemPhase(row.status) === 'APPROVED').length;
    const rejected = rows.filter((row) => itemPhase(row.status) === 'REJECTED').length;
    return { PENDING: pending, APPROVED: approved, REJECTED: rejected, ALL: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const byPhase = phase === 'ALL' ? rows : rows.filter((row) => itemPhase(row.status) === phase);
    const term = search.trim();
    if (!term) return byPhase;
    return byPhase.filter((row) =>
      textMatchesSearch(
        [row.empreiteiro?.name, row.serviceName, row.reason, row.createdByName, row.approvedByName]
          .filter(Boolean)
          .join(' '),
        term,
      ),
    );
  }, [rows, phase, search]);

  const menuItem = filtered.find((row) => row.id === actionMenu?.id) ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['empreiteiro-addenda-pending'] });
    // O selo da aba soma medições + aditivos e vive nesta chave.
    void queryClient.invalidateQueries({ queryKey: ['empreiteiro-daily-measurements-pending'] });
    void queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
  };

  const basePath = (item: AddendumReviewItem) =>
    `/empreiteiros/${item.empreiteiroId}/contracts/${item.empreiteiroContractId}/addenda/${item.id}`;

  const approveMutation = useMutation({
    mutationFn: async (item: AddendumReviewItem) => {
      const res = await api.post(`${basePath(item)}/approve`);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Aditivo aprovado');
      setDetail(null);
      invalidate();
    },
    onError: (error: { message?: string; response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || error.message || 'Não foi possível aprovar');
    },
  });

  const returnMutation = useMutation({
    mutationFn: async (item: AddendumReviewItem) => {
      const note = returnNote.trim();
      if (!note) throw new Error('Explique o que precisa ser corrigido');
      const res = await api.post(`${basePath(item)}/return`, { correctionNote: note });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Aditivo devolvido');
      setDetail(null);
      setReturnNote('');
      invalidate();
    },
    onError: (error: { message?: string; response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || error.message || 'Não foi possível devolver');
    },
  });

  useEffect(() => {
    setActionMenu(null);
  }, [phase, search]);

  const openDetail = (item: AddendumReviewItem) => {
    setActionMenu(null);
    setReturnNote('');
    setDetail(item);
  };

  const activeCard = ADITIVO_PHASE_CARDS.find((card) => card.filter === phase) ?? ADITIVO_PHASE_CARDS[0];
  const PhaseIcon = activeCard.Icon;
  const detailPending = detail ? itemPhase(detail.status) === 'PENDING' : false;
  const busy = approveMutation.isPending || returnMutation.isPending;

  return (
    <PageStack>
      <ApprovalPhaseStatCards
        cards={ADITIVO_PHASE_CARDS}
        activeFilter={phase}
        counts={counts}
        loading={isLoading}
        onSelect={setPhase}
      />
      <Card className="w-full">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <div className={`rounded-lg p-2 sm:p-3 ${activeCard.iconBg}`}>
                <PhaseIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${activeCard.iconColor}`} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{activeCard.label}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{PHASE_SUBTITLE[phase]}</p>
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar empreita, serviço, motivo..."
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
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  phase !== 'PENDING'
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
              >
                <Filter className="h-4 w-4" />
                {phase !== 'PENDING' ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CadastroListLoading message="Carregando aditivos..." />
          ) : isError ? (
            <div className="py-8 text-center text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar os aditivos. Recarregue a página ou tente novamente.
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
              <p className="text-gray-500 dark:text-gray-400">Nenhum aditivo neste filtro.</p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span>
                  Mostrando 1 a {filtered.length} de {filtered.length} aditivos
                </span>
                <span>Página 1 de 1</span>
              </div>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {['Empreita', 'Serviço', 'Aditivo', 'Data', 'Valor', APPROVAL_STATUS_COLUMN_TITLE, 'Ação'].map(
                        (label) => (
                          <th
                            key={label}
                            className={`px-3 py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6 ${
                              label === APPROVAL_STATUS_COLUMN_TITLE || label === 'Ação'
                                ? 'text-center'
                                : 'text-left'
                            }`}
                          >
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {filtered.map((item) => (
                      <tr
                        key={item.id}
                        className={getListTableRowClassName(true)}
                        onClick={() => openDetail(item)}
                      >
                        <td className="px-3 py-3 align-middle text-sm sm:px-6">
                          <ListRowNavigableLabel className="font-medium">
                            {item.empreiteiro?.name || '—'}
                          </ListRowNavigableLabel>
                        </td>
                        <td
                          className="max-w-[240px] truncate px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                          title={item.serviceName}
                        >
                          {item.serviceName || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          {item.number}º aditivo
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          {formatDateBr(item.effectiveDate)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                          {formatMoney(item.amount)}
                        </td>
                        <td className="px-3 py-3 text-center align-middle sm:px-6">
                          <ApprovalStatusBadge kind={statusKind(item.status)} label={statusLabel(item.status)} />
                        </td>
                        <td
                          className="px-3 py-3 text-center align-middle sm:px-6"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                const rect = event.currentTarget.getBoundingClientRect();
                                setActionMenu((prev) => {
                                  if (prev?.id === item.id) return null;
                                  let left = rect.right - ACTION_MENU_WIDTH_PX;
                                  left = Math.max(
                                    8,
                                    Math.min(left, window.innerWidth - ACTION_MENU_WIDTH_PX - 8),
                                  );
                                  return { id: item.id, top: rect.bottom + 4, left };
                                });
                              }}
                              className={rowActionMenuButtonClass(actionMenu?.id === item.id)}
                              aria-label="Menu de ações"
                              aria-expanded={actionMenu?.id === item.id}
                              aria-haspopup="menu"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ActionMenuOverlay
        open={!!actionMenu && !!menuItem}
        onClose={() => setActionMenu(null)}
        top={actionMenu?.top ?? 0}
        left={actionMenu?.left ?? 0}
      >
        {menuItem ? (
          <button type="button" role="menuitem" onClick={() => openDetail(menuItem)} className={MENU_ITEM_CLASS}>
            <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>Ver detalhes</span>
          </button>
        ) : null}
      </ActionMenuOverlay>

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.number}º aditivo — ${detail.empreiteiro?.name || 'Empreita'}` : 'Aditivo'}
        size="lg"
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="Empreita" value={detail.empreiteiro?.name || ''} />
              <DetailField label="Serviço" value={detail.serviceName} />
              <DetailField label="Data do aditivo" value={formatDateBr(detail.effectiveDate)} />
              <DetailField label="Valor" value={formatMoney(detail.amount)} />
              <DetailField label="Lançado por" value={detail.createdByName || '—'} />
              <DetailField label="Status" value={statusLabel(detail.status)} />
              <DetailField label="Forma de pagamento" value={paymentModeLabel(detail)} />
              {itemPhase(detail.status) === 'APPROVED' && detail.approvedByName ? (
                <DetailField label="Aprovado por" value={detail.approvedByName} />
              ) : null}
            </div>
            <DetailField label="Motivo" value={detail.reason} />
            {detail.servicesAdded ? <DetailField label="Serviços adicionados" value={detail.servicesAdded} /> : null}
            {detail.servicesRemoved ? <DetailField label="Serviços retirados" value={detail.servicesRemoved} /> : null}
            {itemPhase(detail.status) === 'REJECTED' && detail.correctionNote ? (
              <DetailField label="Motivo da devolução" value={detail.correctionNote} />
            ) : null}

            {(detail.files || []).length > 0 ? (
              <div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Contrato atualizado / anexos</p>
                <ul className="space-y-1">
                  {(detail.files || []).map((file, index) => {
                    const href = resolveApiMediaUrl(file.url) || file.url;
                    return (
                      <li key={`${file.url}-${index}`}>
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:underline dark:text-red-300"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          {file.name || 'Documento'}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {detailPending ? (
              <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  O valor e as parcelas do contrato só mudam quando o aditivo é aprovado.
                </p>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Motivo da devolução
                  <textarea
                    value={returnNote}
                    onChange={(event) => setReturnNote(event.target.value)}
                    rows={3}
                    placeholder="O que precisa ser ajustado no aditivo"
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={() => setDetail(null)}>
                    Fechar
                  </Button>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="warning"
                      icon={<RotateCcw className="h-4 w-4" />}
                      onClick={() => returnMutation.mutate(detail)}
                      disabled={busy || !returnNote.trim()}
                    >
                      {returnMutation.isPending ? 'Devolvendo…' : 'Devolver'}
                    </Button>
                    <Button
                      type="button"
                      variant="success"
                      icon={<Check className="h-4 w-4" />}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Aprovar o ${detail.number}º aditivo (${formatMoney(detail.amount)})? O valor do contrato e as parcelas serão atualizados.`,
                          )
                        ) {
                          return;
                        }
                        approveMutation.mutate(detail);
                      }}
                      disabled={busy}
                    >
                      {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={() => setDetail(null)}>
                  Fechar
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtro — Aditivos" size="sm">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
          <StringSingleSelectDropdown
            value={phase}
            onChange={(value) => setPhase(value as ReviewPhase)}
            options={PHASE_FILTER_OPTIONS}
            allowEmpty={false}
            className="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
              Fechar
            </Button>
            <Button type="button" onClick={() => setFiltersOpen(false)}>
              Aplicar
            </Button>
          </div>
        </div>
      </Modal>
    </PageStack>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="font-medium text-gray-900 dark:text-gray-100">{value || '—'}</p>
    </div>
  );
}
