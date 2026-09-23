'use client';

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowLeft,
  ClipboardList,
  Loader2,
  Search,
} from 'lucide-react';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { buildLicitacaoTituloDisplay } from './licitacaoDisplay';
import {
  buildChecklistResumo,
  emptyChecklistState,
  LICITACAO_CHECKLIST,
  mergeChecklistFromSaved,
  type ChecklistSectionDef,
} from './licitacaoChecklist';
import { LicitacaoAnalisesCarregadas } from './LicitacaoAnalisesCarregadas';
import type { NaoSeHabilitaItem } from './LicitacaoNaoSeHabilitaPanel';

const BRASIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

type ArquivadaMotivo =
  | 'suspensa'
  | 'declinada'
  | 'encerrada'
  | 'em_andamento'
  | 'vencidas'
  | 'aguardando_aprovacao'
  | 'orcamento';

const STATUS_OPTIONS: Array<{ value: ArquivadaMotivo; label: string; color: string }> = [
  { value: 'aguardando_aprovacao', label: 'Análise diretoria', color: '#6366f1' },
  { value: 'orcamento', label: 'Orçamento', color: '#0ea5e9' },
  { value: 'suspensa', label: 'Suspensa', color: '#f59e0b' },
  { value: 'declinada', label: 'Declinada', color: '#ef4444' },
  { value: 'encerrada', label: 'Encerrada', color: '#64748b' },
  { value: 'em_andamento', label: 'Em andamento', color: '#22c55e' },
  { value: 'vencidas', label: 'Vencida', color: '#a855f7' },
];

type DecisaoAnaliseFinal = 'participar' | 'participar_consorcio' | 'nao_participar';

const DECISAO_OPTIONS: Array<{ value: DecisaoAnaliseFinal; label: string }> = [
  { value: 'participar', label: 'Participar' },
  { value: 'participar_consorcio', label: 'Participar em consórcio' },
  { value: 'nao_participar', label: 'Não participar' },
];

const DECISAO_LABELS: Record<DecisaoAnaliseFinal, string> = {
  participar: 'Participar',
  participar_consorcio: 'Participar em consórcio',
  nao_participar: 'Não participar',
};

type LicitacaoRegiaoTab = { key: string; label: string };

type LicitacaoArquivoItem = {
  id: string;
  titulo: string;
  tituloExibicao?: string | null;
  numeroProcesso?: string | null;
  orgao?: string | null;
  valorEstimado?: string | null;
  estado?: string | null;
  regiaoKey?: string | null;
  arquivada?: boolean;
  arquivadaMotivo?: string | null;
  arquivadaEm?: string | null;
  updatedAt?: string;
  documentos?: Array<{
    id: string;
    originalName?: string;
    nome?: string;
    url?: string;
    storagePath?: string;
  }>;
  analiseJson?: {
    analisePreliminar?: unknown;
    linkNotebookLm?: string | null;
    analiseUsuario?: string | null;
    responsavelAnalise?: string | null;
    checklistAnalise?: Record<string, { checked: boolean; comentario: string }>;
    naoSeHabilita?: boolean;
    naoSeHabilitaItens?: NaoSeHabilitaItem[];
    decisaoAnaliseFinal?: DecisaoAnaliseFinal | null;
    analiseFinalTexto?: string | null;
    emArquivo?: boolean;
    origemRegiao?: { estado?: string | null } | null;
  } | null;
};

function isMotivo(value: unknown): value is ArquivadaMotivo {
  return STATUS_OPTIONS.some((item) => item.value === value);
}

function isDecisao(value: unknown): value is DecisaoAnaliseFinal {
  return DECISAO_OPTIONS.some((item) => item.value === value);
}

function resolveMotivo(item: LicitacaoArquivoItem): ArquivadaMotivo | null {
  if (isMotivo(item.arquivadaMotivo)) return item.arquivadaMotivo;
  const fromJson =
    item.analiseJson && (item.analiseJson as { arquivadaMotivo?: unknown }).arquivadaMotivo;
  if (isMotivo(fromJson)) return fromJson;
  return null;
}

function resolveDecisao(item: LicitacaoArquivoItem): DecisaoAnaliseFinal | null {
  const raw = item.analiseJson?.decisaoAnaliseFinal;
  return isDecisao(raw) ? raw : null;
}

function statusLabel(motivo: ArquivadaMotivo | null): string {
  return STATUS_OPTIONS.find((item) => item.value === motivo)?.label ?? 'Sem status';
}

function statusBadgeClass(motivo: ArquivadaMotivo | null): string {
  switch (motivo) {
    case 'aguardando_aprovacao':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300';
    case 'orcamento':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300';
    case 'suspensa':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
    case 'declinada':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
    case 'encerrada':
      return 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
    case 'em_andamento':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'vencidas':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

export function LicitacaoArquivoPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [regiaoKey, setRegiaoKey] = useState('');
  const [estado, setEstado] = useState('');
  const [motivoFilter, setMotivoFilter] = useState<ArquivadaMotivo | ''>('');
  const [decisaoFilter, setDecisaoFilter] = useState<DecisaoAnaliseFinal | ''>('');
  const deferredSearch = useDeferredValue(search.trim());

  const filterFieldClassName =
    'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
  const filterLabelClassName =
    'mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';

  const { data: checklistTemplateQuery } = useQuery({
    queryKey: ['licitacao-checklist-template'],
    queryFn: async () => {
      try {
        const res = await api.get('/licitacoes/checklist-template');
        return {
          sections: (res.data?.data ?? LICITACAO_CHECKLIST) as ChecklistSectionDef[],
          canManage: Boolean(res.data?.canManage),
        };
      } catch {
        return {
          sections: LICITACAO_CHECKLIST,
          canManage: false,
        };
      }
    },
    staleTime: 5 * 60 * 1000,
  });
  const checklistSections = Array.isArray(checklistTemplateQuery?.sections)
    ? checklistTemplateQuery.sections
    : LICITACAO_CHECKLIST;

  const { data: regiaoTabs = [] } = useQuery({
    queryKey: ['licitacoes-planilha-regioes'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/planilha-regioes');
      return (res.data?.data ?? []) as LicitacaoRegiaoTab[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: listRaw = [], isLoading: loadingList, refetch: refetchList } = useQuery({
    queryKey: [
      'licitacoes',
      'arquivo',
      deferredSearch,
      dataInicio,
      dataFim,
      regiaoKey,
      estado,
      motivoFilter,
    ],
    queryFn: async () => {
      const params: Record<string, string> = { emArquivo: 'true', arquivada: 'true' };
      if (deferredSearch) params.search = deferredSearch;
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (regiaoKey) params.regiaoKey = regiaoKey;
      if (estado) params.estado = estado;
      if (motivoFilter) params.arquivadaMotivo = motivoFilter;
      const res = await api.get('/licitacoes', { params });
      return (res.data?.data ?? []) as LicitacaoArquivoItem[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const list = useMemo(() => {
    if (!decisaoFilter) return listRaw;
    return listRaw.filter((item) => resolveDecisao(item) === decisaoFilter);
  }, [decisaoFilter, listRaw]);

  useEffect(() => {
    if (selectedId && list.length > 0 && !list.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [list, selectedId]);

  const { data: selectedDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['licitacao', selectedId],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/${selectedId}`);
      return res.data?.data as LicitacaoArquivoItem;
    },
    enabled: Boolean(selectedId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const selected =
    selectedDetail ?? list.find((item) => item.id === selectedId) ?? null;

  const pieData = useMemo(() => {
    const counts = new Map<ArquivadaMotivo | 'sem_status', number>();
    for (const item of listRaw) {
      const motivo = resolveMotivo(item) ?? 'sem_status';
      counts.set(motivo, (counts.get(motivo) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, value]) => {
      if (key === 'sem_status') {
        return { name: 'Sem status', value, color: '#9ca3af' };
      }
      const opt = STATUS_OPTIONS.find((item) => item.value === key);
      return { name: opt?.label ?? key, value, color: opt?.color ?? '#9ca3af' };
    });
  }, [listRaw]);

  const viabilidadeSections = useMemo(() => {
    if (!selected) return [];
    const state = mergeChecklistFromSaved(
      selected.analiseJson?.checklistAnalise,
      checklistSections
    );
    return buildChecklistResumo(checklistSections, state ?? emptyChecklistState(checklistSections));
  }, [checklistSections, selected]);

  const anexos = useMemo(() => {
    if (!selected?.documentos?.length) return [];
    return selected.documentos.map((doc) => {
      const nome = doc.originalName || doc.nome || 'Documento';
      const rawUrl = doc.url || doc.storagePath || '';
      return {
        id: doc.id,
        nome,
        url: rawUrl ? resolveApiMediaUrl(rawUrl) : null,
      };
    });
  }, [selected]);

  const desarquivarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/licitacoes/${id}/desarquivar`);
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success('Licitação reaberta na fila de análise.');
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      void refetchList();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao reabrir licitação');
    },
  });

  const clearFilters = () => {
    setSearch('');
    setDataInicio('');
    setDataFim('');
    setRegiaoKey('');
    setEstado('');
    setMotivoFilter('');
    setDecisaoFilter('');
  };

  const hasFilters = Boolean(
    search.trim() || dataInicio || dataFim || regiaoKey || estado || motivoFilter || decisaoFilter
  );

  const decisao = selected?.analiseJson?.decisaoAnaliseFinal ?? null;
  const motivo = selected ? resolveMotivo(selected) : null;

  if (selectedId) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à lista
          </button>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
          >
            <ClipboardList className="h-4 w-4" />
            Licitações
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
              {list.length}
            </span>
          </button>
        </div>

        <Card className="shadow-sm">
          <CardContent className="px-5 py-4">
            {loadingDetail && !selectedDetail ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando histórico…
              </div>
            ) : selected ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {buildLicitacaoTituloDisplay(selected)}
                    </h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(motivo)}`}
                      >
                        {statusLabel(motivo)}
                      </span>
                      {decisao && isDecisao(decisao) ? (
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          {DECISAO_LABELS[decisao]}
                        </span>
                      ) : null}
                      {selected.arquivadaEm ? (
                        <span className="text-xs text-gray-500">
                          Arquivada em {formatDate(selected.arquivadaEm)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={desarquivarMutation.isPending}
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Reabrir esta licitação na fila de análise? Ela sairá do Arquivo.'
                        )
                      ) {
                        return;
                      }
                      desarquivarMutation.mutate(selected.id);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  >
                    {desarquivarMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    Reabrir
                  </button>
                </div>

                <LicitacaoAnalisesCarregadas
                  titulo={buildLicitacaoTituloDisplay(selected)}
                  showPreliminar
                  analisePreliminar={selected.analiseJson?.analisePreliminar}
                  showNotebook
                  linkNotebookLm={selected.analiseJson?.linkNotebookLm}
                  showEmAnaliseResumo
                  analiseUsuario={selected.analiseJson?.analiseUsuario}
                  responsavelAnalise={selected.analiseJson?.responsavelAnalise}
                  viabilidadeSections={viabilidadeSections}
                  naoSeHabilita={selected.analiseJson?.naoSeHabilita === true}
                  naoSeHabilitaItens={selected.analiseJson?.naoSeHabilitaItens ?? []}
                  showDiretoria
                  decisaoLabel={decisao && isDecisao(decisao) ? DECISAO_LABELS[decisao] : null}
                  analiseFinalTexto={selected.analiseJson?.analiseFinalTexto}
                  anexos={anexos}
                />
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-gray-500">
                Licitação não encontrada.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="shadow-sm">
          <CardHeader className="space-y-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Arquivo</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Licitações que finalizaram o fluxo.
                {hasFilters ? (
                  <span className="ml-1 text-xs text-red-600 dark:text-red-400">
                    ({list.length} filtrada{list.length === 1 ? '' : 's'})
                  </span>
                ) : (
                  <span className="ml-1">{listRaw.length} registro(s).</span>
                )}
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar órgão, processo ou título..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <label className="min-w-0">
                  <span className={filterLabelClassName}>De</span>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className={filterFieldClassName}
                  />
                </label>
                <label className="min-w-0">
                  <span className={filterLabelClassName}>Até</span>
                  <input
                    type="date"
                    value={dataFim}
                    min={dataInicio || undefined}
                    onChange={(e) => setDataFim(e.target.value)}
                    className={filterFieldClassName}
                  />
                </label>
                <label className="min-w-0">
                  <span className={filterLabelClassName}>Região</span>
                  <select
                    value={regiaoKey}
                    onChange={(e) => setRegiaoKey(e.target.value)}
                    className={filterFieldClassName}
                  >
                    <option value="">Todas</option>
                    {regiaoTabs.map((tab) => (
                      <option key={tab.key} value={tab.key}>
                        {tab.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={filterLabelClassName}>Estado</span>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                    className={filterFieldClassName}
                  >
                    <option value="">Todos</option>
                    {BRASIL_UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={filterLabelClassName}>Status</span>
                  <select
                    value={motivoFilter}
                    onChange={(e) => setMotivoFilter(e.target.value as ArquivadaMotivo | '')}
                    className={filterFieldClassName}
                  >
                    <option value="">Todas</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className={filterLabelClassName}>Decisão</span>
                  <select
                    value={decisaoFilter}
                    onChange={(e) =>
                      setDecisaoFilter(e.target.value as DecisaoAnaliseFinal | '')
                    }
                    className={filterFieldClassName}
                  >
                    <option value="">Todas</option>
                    {DECISAO_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {hasFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-fit text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          </CardHeader>

          <CardContent className="px-3 pb-3 pt-2">
            {loadingList ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-red-600" />
              </div>
            ) : list.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">
                {hasFilters
                  ? 'Nenhuma licitação com os filtros selecionados.'
                  : 'Nenhuma licitação no arquivo.'}
              </p>
            ) : (
              <ul
                className="divide-y divide-gray-200 dark:divide-gray-700"
                role="listbox"
                aria-label="Licitações no Arquivo"
              >
                {list.map((item) => {
                  const itemMotivo = resolveMotivo(item);
                  const itemDecisao = resolveDecisao(item);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className="flex w-full flex-col gap-1.5 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {buildLicitacaoTituloDisplay(item)}
                        </span>
                        <span className="flex shrink-0 flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(itemMotivo)}`}
                          >
                            {statusLabel(itemMotivo)}
                          </span>
                          {itemDecisao ? (
                            <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                              {DECISAO_LABELS[itemDecisao]}
                            </span>
                          ) : null}
                          {item.arquivadaEm ? (
                            <span className="text-xs text-gray-500">
                              {formatDate(item.arquivadaEm)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Licitações por status
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">Distribuição no Arquivo</p>
          </CardHeader>
          <CardContent className="px-3 py-4">
            {pieData.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">Sem dados para o gráfico.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      outerRadius={72}
                      label={({ percent }) =>
                        percent && percent >= 0.08 ? `${Math.round(percent * 100)}%` : ''
                      }
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [`${Number(value ?? 0)}`, 'Qtd.']}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
