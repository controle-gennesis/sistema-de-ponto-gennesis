'use client';

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ChevronDown,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import api from '@/lib/api';
import { formatCurrencyInputBrFromNumber, maskCurrencyInputBrOrEmpty, parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { buildLicitacaoTituloDisplay } from './licitacaoDisplay';
import { LicitacaoAnalisesCarregadas } from './LicitacaoAnalisesCarregadas';
import {
  buildChecklistResumo,
  emptyChecklistState,
  LICITACAO_CHECKLIST,
  mergeChecklistFromSaved,
  type ChecklistSectionDef,
} from './licitacaoChecklist';
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

const STATUS_OPTIONS: Array<{ value: ArquivadaMotivo; label: string; singular: string }> = [
  { value: 'aguardando_aprovacao', label: 'Análise diretoria', singular: 'Análise diretoria' },
  { value: 'orcamento', label: 'Orçamento', singular: 'Orçamento' },
  { value: 'suspensa', label: 'Suspensas', singular: 'Suspensa' },
  { value: 'declinada', label: 'Declinadas', singular: 'Declinada' },
  { value: 'encerrada', label: 'Encerradas', singular: 'Encerrada' },
  { value: 'em_andamento', label: 'Em andamento', singular: 'Em andamento' },
  { value: 'vencidas', label: 'Vencidas', singular: 'Vencida' },
];

const STATUS_ARQUIVO_PERMITIDOS: ArquivadaMotivo[] = [
  'suspensa',
  'declinada',
  'encerrada',
  'em_andamento',
  'vencidas',
];

function isStatusArquivoPermitido(value: unknown): value is ArquivadaMotivo {
  return (
    typeof value === 'string' &&
    (STATUS_ARQUIVO_PERMITIDOS as readonly string[]).includes(value)
  );
}
function isMotivoValue(value: unknown): value is ArquivadaMotivo {
  return STATUS_OPTIONS.some((item) => item.value === value);
}

function resolveMotivo(item: {
  arquivadaMotivo?: string | null;
  analiseJson?: { arquivadaMotivo?: unknown; statusSelecionado?: unknown } | null;
} | null): ArquivadaMotivo | null {
  if (!item) return null;
  if (isMotivoValue(item.arquivadaMotivo)) return item.arquivadaMotivo;
  const fromJson = item.analiseJson?.arquivadaMotivo;
  if (isMotivoValue(fromJson)) return fromJson;
  return null;
}

function resolveStatusSelecionado(item: {
  analiseJson?: { statusSelecionado?: unknown } | null;
} | null): ArquivadaMotivo | null {
  const raw = item?.analiseJson?.statusSelecionado;
  if (isMotivoValue(raw) && isStatusArquivoPermitido(raw)) return raw;
  return null;
}

function resolveStatusParaArquivar(item: {
  arquivadaMotivo?: string | null;
  analiseJson?: { arquivadaMotivo?: unknown; statusSelecionado?: unknown } | null;
} | null): ArquivadaMotivo | null {
  return resolveStatusSelecionado(item) ?? resolveMotivo(item);
}

function motivoSingular(motivo: ArquivadaMotivo): string {
  return STATUS_OPTIONS.find((item) => item.value === motivo)?.singular ?? motivo;
}

type DecisaoAnaliseFinal = 'participar' | 'participar_consorcio' | 'nao_participar';

const DECISAO_OPTIONS: Array<{ value: DecisaoAnaliseFinal; label: string }> = [
  { value: 'participar', label: 'Participar' },
  { value: 'participar_consorcio', label: 'Participar em consórcio' },
  { value: 'nao_participar', label: 'Não participar' },
];

function isDecisaoValue(value: unknown): value is DecisaoAnaliseFinal {
  return DECISAO_OPTIONS.some((item) => item.value === value);
}

function decisaoLabel(decisao: DecisaoAnaliseFinal): string {
  return DECISAO_OPTIONS.find((item) => item.value === decisao)?.label ?? decisao;
}

function decisaoBadgeClass(decisao: DecisaoAnaliseFinal, active: boolean): string {
  if (active) {
    switch (decisao) {
      case 'participar':
        return 'bg-emerald-400/30 text-emerald-950 dark:text-emerald-100';
      case 'participar_consorcio':
        return 'bg-sky-400/30 text-sky-950 dark:text-sky-100';
      case 'nao_participar':
        return 'bg-rose-400/30 text-rose-950 dark:text-rose-100';
    }
  }
  switch (decisao) {
    case 'participar':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'participar_consorcio':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300';
    case 'nao_participar':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
  }
}

function statusBadgeClass(active: boolean): string {
  return active
    ? 'bg-indigo-400/30 text-indigo-950 dark:text-indigo-100'
    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300';
}

function formatDateOnly(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type LicitacaoRegiaoTab = { key: string; label: string };

type LicitacaoListItem = {
  id: string;
  titulo: string;
  numeroProcesso?: string | null;
  orgao?: string | null;
  valorEstimado?: string | null;
  estado?: string | null;
  regiaoKey?: string | null;
  arquivada?: boolean;
  arquivadaMotivo?: string | null;
  arquivadaEm?: string | null;
  updatedAt?: string;
  analiseJson?: {
    decisaoAnaliseFinal?: DecisaoAnaliseFinal | null;
    arquivadaMotivo?: string | null;
    statusSelecionado?: string | null;
    analisePreliminar?: unknown;
    linkNotebookLm?: string | null;
    analiseUsuario?: string | null;
    responsavelAnalise?: string | null;
    checklistAnalise?: Record<string, { checked: boolean; comentario: string }>;
    naoSeHabilita?: boolean;
    naoSeHabilitaItens?: NaoSeHabilitaItem[];
    analiseFinalTexto?: string | null;
    emArquivo?: boolean;
    origemRegiao?: {
      estado?: string | null;
      rowSnapshot?: Record<string, string> | null;
    } | null;
  } | null;
};

type OrcamentoAnexo = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

type OrcamentoRegistro = {
  mode?: 'externo';
  valor: number | null;
  dataOrcamento: string;
  observacao: string;
  anexos: OrcamentoAnexo[];
};

type OrcamentoPayload = {
  id: string;
  licitacaoId: string;
  registro: OrcamentoRegistro;
  draft?: boolean;
  updatedAt?: string;
};

const EMPTY_REGISTRO: OrcamentoRegistro = {
  mode: 'externo',
  valor: null,
  dataOrcamento: '',
  observacao: '',
  anexos: [],
};

const inputClassName =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

export function LicitacaoOrcamentoPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedLicitacaoId = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [valorLabel, setValorLabel] = useState('');
  const [dataOrcamento, setDataOrcamento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [dirty, setDirty] = useState(false);

  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [regiaoKey, setRegiaoKey] = useState('');
  const [estado, setEstado] = useState('');
  const [decisaoFilter, setDecisaoFilter] = useState<DecisaoAnaliseFinal | ''>('');
  const [listModalOpen, setListModalOpen] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());

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
      'orcamento',
      deferredSearch,
      dataInicio,
      dataFim,
      regiaoKey,
      estado,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        arquivada: 'true',
        arquivadaMotivo: 'orcamento',
      };
      if (deferredSearch) params.search = deferredSearch;
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (regiaoKey) params.regiaoKey = regiaoKey;
      if (estado) params.estado = estado;
      const res = await api.get('/licitacoes', { params });
      return (res.data?.data ?? []) as LicitacaoListItem[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const list = useMemo(() => {
    if (!decisaoFilter) return listRaw;
    return listRaw.filter((item) => item.analiseJson?.decisaoAnaliseFinal === decisaoFilter);
  }, [decisaoFilter, listRaw]);

  useEffect(() => {
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0].id);
    }
    if (selectedId && list.length > 0 && !list.some((item) => item.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
    }
    if (selectedId && list.length === 0) {
      setSelectedId(null);
    }
  }, [list, selectedId]);

  useEffect(() => {
    if (!listModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setListModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listModalOpen]);

  const selectedMeta = useMemo(
    () => list.find((item) => item.id === selectedId) ?? null,
    [list, selectedId]
  );

  const {
    data: orcamento,
    isLoading: loadingOrcamento,
    isFetching: fetchingOrcamento,
  } = useQuery({
    queryKey: ['licitacao-orcamento', selectedId],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/${selectedId}/orcamento`);
      return res.data?.data as OrcamentoPayload;
    },
    enabled: Boolean(selectedId),
    staleTime: 0,
  });

  useEffect(() => {
    if (!selectedId) {
      hydratedLicitacaoId.current = null;
      return;
    }
    if (!orcamento || orcamento.licitacaoId !== selectedId) return;
    if (hydratedLicitacaoId.current === selectedId) return;
    hydratedLicitacaoId.current = selectedId;
    const registro = orcamento.registro ?? EMPTY_REGISTRO;
    setValorLabel(formatCurrencyInputBrFromNumber(registro.valor));
    setDataOrcamento(registro.dataOrcamento || '');
    setObservacao(registro.observacao || '');
    setDirty(false);
  }, [orcamento, selectedId]);

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

  const { data: selectedDetail } = useQuery({
    queryKey: ['licitacao', selectedId],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/${selectedId}`);
      return res.data?.data as LicitacaoListItem;
    },
    enabled: Boolean(selectedId),
    staleTime: 0,
  });

  const selectedAnalise = selectedDetail ?? selectedMeta;
  const statusSelecionado = resolveStatusSelecionado(selectedAnalise);
  const statusAtual = statusSelecionado ?? resolveMotivo(selectedAnalise) ?? 'orcamento';
  const statusSelectRef = useRef<HTMLSelectElement | null>(null);
  const [statusSelectHighlight, setStatusSelectHighlight] = useState(false);

  const viabilidadeSections = useMemo(() => {
    if (!selectedAnalise) return [];
    const state = mergeChecklistFromSaved(
      selectedAnalise.analiseJson?.checklistAnalise,
      checklistSections
    );
    return buildChecklistResumo(
      checklistSections,
      state ?? emptyChecklistState(checklistSections)
    );
  }, [checklistSections, selectedAnalise]);

  const alterarStatusMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: ArquivadaMotivo }) => {
      const res = await api.patch(`/licitacoes/${id}/arquivar`, { motivo });
      return { data: res.data?.data, motivo };
    },
    onSuccess: ({ motivo }) => {
      toast.success(
        motivo === 'orcamento'
          ? 'Status mantido em Orçamento.'
          : motivo === 'aguardando_aprovacao'
            ? 'Enviada para Análise Diretoria.'
            : `Status alterado para ${motivoSingular(motivo)}.`
      );
      setStatusSelectHighlight(false);
      if (motivo !== 'orcamento') {
        setSelectedId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      void queryClient.invalidateQueries({ queryKey: ['licitacao', selectedId] });
      void refetchList();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao alterar status');
    },
  });

  const setStatusSelecionadoMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: ArquivadaMotivo }) => {
      const res = await api.patch(`/licitacoes/${id}/status-selecionado`, { motivo });
      return {
        data: res.data?.data as LicitacaoListItem,
        message:
          (res.data?.message as string | undefined) ??
          'Status selecionado. Clique em Arquivar para enviar ao Arquivo.',
      };
    },
    onSuccess: ({ data, message }) => {
      toast.success(message);
      setStatusSelectHighlight(false);
      if (data?.id) {
        queryClient.setQueryData(['licitacao', data.id], data);
      }
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      void refetchList();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao selecionar status');
    },
  });

  const enviarArquivoMutation = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: ArquivadaMotivo }) => {
      const res = await api.patch(`/licitacoes/${id}/enviar-arquivo`, { motivo });
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success('Licitação enviada para o Arquivo.');
      setSelectedId(null);
      setStatusSelectHighlight(false);
      void queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      void refetchList();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao arquivar');
    },
  });

  useEffect(() => {
    setStatusSelectHighlight(false);
  }, [selectedId]);

  const handleArquivar = () => {
    if (!selectedId || enviarArquivoMutation.isPending) return;
    const motivo = resolveStatusParaArquivar(selectedAnalise);
    if (!motivo || !isStatusArquivoPermitido(motivo)) {
      setStatusSelectHighlight(true);
      toast.error(
        'Selecione um status permitido e depois clique em Arquivar: Suspensa, Declinada, Encerrada, Em andamento ou Vencida.'
      );
      window.setTimeout(() => statusSelectRef.current?.focus(), 0);
      return;
    }
    if (
      !window.confirm(
        `Enviar esta licitação para o Arquivo com status "${motivoSingular(motivo)}"?`
      )
    ) {
      return;
    }
    enviarArquivoMutation.mutate({ id: selectedId, motivo });
  };

  const handleStatusChange = (motivo: ArquivadaMotivo) => {
    if (!selectedId || !isMotivoValue(motivo)) return;
    if (isStatusArquivoPermitido(motivo)) {
      if (statusSelecionado === motivo) return;
      setStatusSelecionadoMutation.mutate({ id: selectedId, motivo });
      return;
    }
    if (motivo === 'orcamento') {
      if (resolveMotivo(selectedAnalise) === 'orcamento' && !statusSelecionado) return;
      // Voltar a só Orçamento: limpa seleção via re-arquivar orcamento
      if (!window.confirm('Manter na aba Orçamento?')) return;
      alterarStatusMutation.mutate({ id: selectedId, motivo: 'orcamento' });
      return;
    }
    if (motivo === 'aguardando_aprovacao') {
      if (
        !window.confirm(
          'Enviar para Análise Diretoria? A licitação sairá da aba Orçamento.'
        )
      ) {
        return;
      }
      alterarStatusMutation.mutate({ id: selectedId, motivo });
      return;
    }
  };
  const anexos = orcamento?.registro?.anexos ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Selecione uma licitação');
      const res = await api.put(`/licitacoes/${selectedId}/orcamento`, {
        registro: {
          mode: 'externo',
          valor: parseCurrencyInputBr(valorLabel),
          dataOrcamento,
          observacao,
        },
      });
      return res.data?.data as OrcamentoPayload;
    },
    onSuccess: (data) => {
      toast.success('Orçamento cadastrado');
      setDirty(false);
      queryClient.setQueryData(['licitacao-orcamento', selectedId], data);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : 'Erro ao salvar orçamento');
      toast.error(message);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedId) throw new Error('Selecione uma licitação');
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/licitacoes/${selectedId}/orcamento/anexo`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data?.data as OrcamentoPayload;
    },
    onSuccess: (data) => {
      toast.success('Documento anexado');
      queryClient.setQueryData(['licitacao-orcamento', selectedId], data);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : 'Não foi possível anexar o documento');
      toast.error(message);
    },
    onSettled: () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
  });

  const removeAnexoMutation = useMutation({
    mutationFn: async (anexoId: string) => {
      if (!selectedId) throw new Error('Selecione uma licitação');
      const res = await api.delete(`/licitacoes/${selectedId}/orcamento/anexo/${anexoId}`);
      return res.data?.data as OrcamentoPayload;
    },
    onSuccess: (data) => {
      toast.success('Anexo removido');
      queryClient.setQueryData(['licitacao-orcamento', selectedId], data);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : 'Não foi possível remover o anexo');
      toast.error(message);
    },
  });

  const filterFieldClassName =
    'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100';
  const filterLabelClassName =
    'mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400';
  const hasActiveFilters = Boolean(
    search.trim() || dataInicio || dataFim || regiaoKey || estado || decisaoFilter
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Use a lista para localizar e abrir um processo.
          {hasActiveFilters ? (
            <span className="ml-1 text-xs text-red-600 dark:text-red-400">
              ({list.length} filtrada{list.length === 1 ? '' : 's'})
            </span>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => refetchList()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Atualizar lista"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setListModalOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
          >
            <ClipboardList className="h-4 w-4" />
            Licitações
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
              {list.length}
            </span>
          </button>
        </div>
      </div>

      {listModalOpen ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-3">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setListModalOpen(false)}
            aria-hidden
          />
          <aside
            className="relative z-10 w-[min(100%,56rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Card
              padding="none"
              className="flex h-[min(900px,92vh)] flex-col overflow-hidden shadow-2xl"
            >
              <CardHeader className="shrink-0 space-y-3 border-b border-gray-100 px-4 pb-3 pt-4 dark:border-gray-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Licitações
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {list.length} {list.length === 1 ? 'licitação' : 'licitações'}
                      {hasActiveFilters ? ' (filtradas)' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Fechar"
                    aria-label="Fechar lista"
                    onClick={() => setListModalOpen(false)}
                    className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
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

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                    <label className="min-w-0">
                      <span className={filterLabelClassName}>De</span>
                      <input
                        type="date"
                        aria-label="De"
                        value={dataInicio}
                        onChange={(e) => setDataInicio(e.target.value)}
                        className={filterFieldClassName}
                      />
                    </label>
                    <label className="min-w-0">
                      <span className={filterLabelClassName}>Até</span>
                      <input
                        type="date"
                        aria-label="Até"
                        value={dataFim}
                        min={dataInicio || undefined}
                        onChange={(e) => setDataFim(e.target.value)}
                        className={filterFieldClassName}
                      />
                    </label>
                    <label className="min-w-0">
                      <span className={filterLabelClassName}>Região</span>
                      <select
                        aria-label="Região"
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
                        aria-label="Estado"
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
                    <label className="min-w-0 col-span-2 md:col-span-1">
                      <span className={filterLabelClassName}>Decisão</span>
                      <select
                        aria-label="Decisão de participação"
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

                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setDataInicio('');
                        setDataFim('');
                        setRegiaoKey('');
                        setEstado('');
                        setDecisaoFilter('');
                      }}
                      className="w-fit text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
                {loadingList ? (
                  <div className="flex flex-1 items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-red-600" />
                  </div>
                ) : list.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-500">
                    Nenhuma licitação encontrada com status <strong>Orçamento</strong>
                    {hasActiveFilters ? ' para os filtros atuais' : ''}.
                  </p>
                ) : (
                  <ul
                    className="min-h-0 flex-1 divide-y divide-gray-200 overflow-y-auto pr-0.5 dark:divide-gray-700"
                    role="listbox"
                    aria-label="Licitações"
                  >
                    {list.map((item) => {
                      const active = item.id === selectedId;
                      const decisao = isDecisaoValue(item.analiseJson?.decisaoAnaliseFinal)
                        ? item.analiseJson!.decisaoAnaliseFinal!
                        : null;
                      const statusDate = formatDateOnly(item.arquivadaEm ?? item.updatedAt);
                      return (
                        <li key={item.id} className="py-0.5 first:pt-0 last:pb-0">
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setSelectedId(item.id);
                              setListModalOpen(false);
                            }}
                            className={`w-full rounded-lg px-4 py-3 text-left transition-colors ${
                              active
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <p className="min-w-0 whitespace-normal break-words text-sm font-medium">
                                {buildLicitacaoTituloDisplay(item)}
                              </p>
                              <div className="flex shrink-0 flex-row flex-wrap items-center gap-1">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${statusBadgeClass(active)}`}
                                >
                                  Orçamento
                                </span>
                                {decisao ? (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${decisaoBadgeClass(decisao, active)}`}
                                  >
                                    {decisaoLabel(decisao)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <p
                              className={`mt-1 text-xs ${active ? 'text-red-100' : 'text-gray-500'}`}
                            >
                              {statusDate || item.orgao || item.numeroProcesso || 'Sem órgão/processo'}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </aside>
        </AppModalOverlay>
      ) : null}

      <div className="space-y-5">
        {!selectedId ? (
          <Card className="border-dashed shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                Selecione uma licitação na lista
              </p>
              <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                Abra a lista de licitações para cadastrar o orçamento do processo.
              </p>
              <button
                type="button"
                onClick={() => setListModalOpen(true)}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
              >
                <ClipboardList className="h-4 w-4" />
                Abrir lista de licitações
              </button>
            </CardContent>
          </Card>
        ) : loadingOrcamento && !orcamento ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando orçamento…
            </CardContent>
          </Card>
        ) : (
          <>
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-red-600" aria-hidden />
                  <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {selectedMeta ? buildLicitacaoTituloDisplay(selectedMeta) : 'Orçamento'}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Cadastre o orçamento feito fora do sistema e anexe o documento.
                  {orcamento?.draft ? ' (ainda não cadastrado)' : null}
                  {fetchingOrcamento ? ' · atualizando…' : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setListModalOpen(true)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  <ClipboardList className="h-4 w-4" />
                  Lista
                </button>
                <label className="relative inline-flex items-center">
                  <ChevronDown
                    className="pointer-events-none absolute right-2.5 h-4 w-4 text-gray-400"
                    aria-hidden
                  />
                  <select
                    ref={statusSelectRef}
                    aria-label="Status"
                    disabled={
                      !selectedId ||
                      alterarStatusMutation.isPending ||
                      enviarArquivoMutation.isPending ||
                      setStatusSelecionadoMutation.isPending
                    }
                    value={statusAtual}
                    onChange={(e) => {
                      const motivo = e.target.value as ArquivadaMotivo;
                      if (!isMotivoValue(motivo)) return;
                      handleStatusChange(motivo);
                    }}
                    className={`inline-flex h-10 appearance-none rounded-lg border bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 ${
                      statusSelectHighlight
                        ? 'border-red-500 ring-2 ring-red-500/40 dark:border-red-400'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!selectedId || enviarArquivoMutation.isPending}
                  onClick={handleArquivar}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  {enviarArquivoMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Arquivar
                </button>
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar Orçamento
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Valor do orçamento
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={valorLabel}
                    onChange={(e) => {
                      setValorLabel(maskCurrencyInputBrOrEmpty(e.target.value));
                      setDirty(true);
                    }}
                    placeholder="R$ 0,00"
                    className={inputClassName}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Data do orçamento
                  </span>
                  <input
                    type="date"
                    value={dataOrcamento}
                    onChange={(e) => {
                      setDataOrcamento(e.target.value);
                      setDirty(true);
                    }}
                    className={inputClassName}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Observações
                </span>
                <textarea
                  value={observacao}
                  onChange={(e) => {
                    setObservacao(e.target.value);
                    setDirty(true);
                  }}
                  rows={4}
                  placeholder="Informações do orçamento feito fora do sistema…"
                  className="min-h-[6rem] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </label>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Documento do orçamento
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Anexe o arquivo gerado fora do sistema (PDF, Word ou planilha).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                    {uploadMutation.isPending ? 'Enviando…' : 'Anexar documento'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.txt,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadMutation.mutate(file);
                    }}
                  />
                </div>

                {anexos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700">
                    Nenhum documento anexado.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
                    {anexos.map((anexo) => {
                      const href = resolveApiMediaUrl(anexo.url);
                      return (
                        <li
                          key={anexo.id}
                          className="flex items-center gap-3 bg-white px-3 py-2.5 dark:bg-gray-950"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                              {anexo.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(anexo.size)}
                              {anexo.uploadedAt
                                ? ` · ${formatDateOnly(anexo.uploadedAt)}`
                                : ''}
                            </p>
                          </div>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                              title="Abrir documento"
                              aria-label={`Abrir ${anexo.name}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                          {href ? (
                            <a
                              href={href}
                              download={anexo.name}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                              title="Baixar documento"
                              aria-label={`Baixar ${anexo.name}`}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Remover o anexo “${anexo.name}”?`)) {
                                removeAnexoMutation.mutate(anexo.id);
                              }
                            }}
                            disabled={removeAnexoMutation.isPending}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            title="Remover anexo"
                            aria-label={`Remover ${anexo.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </CardContent>
          </Card>

          {selectedAnalise ? (
            <LicitacaoAnalisesCarregadas
              className="mt-1"
              titulo={buildLicitacaoTituloDisplay(selectedAnalise)}
              showPreliminar
              analisePreliminar={selectedAnalise.analiseJson?.analisePreliminar}
              showNotebook
              linkNotebookLm={selectedAnalise.analiseJson?.linkNotebookLm}
              showEmAnaliseResumo
              analiseUsuario={selectedAnalise.analiseJson?.analiseUsuario}
              responsavelAnalise={selectedAnalise.analiseJson?.responsavelAnalise}
              viabilidadeSections={viabilidadeSections}
              naoSeHabilita={selectedAnalise.analiseJson?.naoSeHabilita === true}
              naoSeHabilitaItens={selectedAnalise.analiseJson?.naoSeHabilitaItens ?? []}
              showDiretoria
              decisaoLabel={
                selectedAnalise.analiseJson?.decisaoAnaliseFinal
                  ? decisaoLabel(selectedAnalise.analiseJson.decisaoAnaliseFinal)
                  : null
              }
              analiseFinalTexto={selectedAnalise.analiseJson?.analiseFinalTexto}
            />
          ) : null}
          </>
        )}
      </div>
    </div>
  );
}
