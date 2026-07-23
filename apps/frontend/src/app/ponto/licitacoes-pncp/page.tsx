'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  DownloadCloud,
  ExternalLink,
  Filter,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { Loading } from '@/components/ui/Loading';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import api from '@/lib/api';

type PncpUfProgress = {
  uf: string;
  status: 'pending' | 'running' | 'done' | 'error';
  upsertedThisRun: number;
};

type PncpSyncStatus = {
  running: boolean;
  currentUf?: string | null;
  currentModalidade?: string | null;
  progress?: {
    totalUfs: number;
    doneUfs: number;
    pendingUfs: number;
    pagesFetched: number;
    upserted: number;
    rateLimitHits: number;
    lookbackDays: number;
    startedAt: string | null;
    ufs: PncpUfProgress[];
  } | null;
  mirror?: {
    total: number;
    byUf: { uf: string; count: number }[];
  };
  lastRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    lookbackDays: number;
    pagesFetched: number;
    upserted: number;
    pruned: number;
    rateLimitHits: number;
    errorMessage: string | null;
  } | null;
};

const BRASIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

const MODALIDADE_OPTIONS = [
  { codigo: 'all', nome: 'Todas' },
  { codigo: '6', nome: 'Pregão Eletrônico' },
  { codigo: '8', nome: 'Dispensa de Licitação' },
  { codigo: '9', nome: 'Inexigibilidade' },
  { codigo: '4', nome: 'Concorrência Eletrônica' },
  { codigo: '5', nome: 'Concorrência' },
  { codigo: '7', nome: 'Pregão Presencial' },
  { codigo: '1', nome: 'Leilão Eletrônico' },
] as const;

type PncpItem = {
  sequencialCompra: number | null;
  numeroControlePNCP: string | null;
  processo: string | null;
  objeto: string | null;
  orgao: string | null;
  cnpjOrgao: string | null;
  unidadeCompradora: string | null;
  codigoUnidadeCompradora: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  situacao: string | null;
  modoDisputa: string | null;
  plataforma: string | null;
  srp: boolean | null;
  valorEstimado: number | null;
  valorHomologado: number | null;
  dataInclusao: string | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  amparoLegal: string | null;
  linkSistemaOrigem: string | null;
  linkPncp: string | null;
};

type PncpListResult = {
  items: PncpItem[];
  pagina: number;
  tamanhoPagina: number;
  totalRegistros: number | null;
  totalPaginas: number | null;
  empty: boolean;
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInputToYyyymmdd(value: string): string {
  return value.replace(/-/g, '');
}

function formatBrDateParts(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function DateTimeStacked({ iso }: { iso: string | null }) {
  const parts = formatBrDateParts(iso);
  if (!parts) return <span>—</span>;
  return (
    <div className="leading-tight">
      <div className="text-gray-900 dark:text-gray-100">{parts.date}</div>
      {parts.time ? (
        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{parts.time}</div>
      ) : null}
    </div>
  );
}

function foldWithIndexMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const base = text[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    for (const ch of base) {
      folded += ch;
      map.push(i);
    }
  }
  return { folded, map };
}

type HighlightRange = { start: number; end: number };

function findKeywordRanges(text: string, keywords: string[]): HighlightRange[] {
  if (!text || keywords.length === 0) return [];
  const { folded, map } = foldWithIndexMap(text);
  const sorted = Array.from(
    new Set(
      keywords
        .map((k) =>
          k
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
        )
        .filter((k) => k.length >= 3)
    )
  ).sort((a, b) => b.length - a.length);

  const taken = new Array(folded.length).fill(false);
  const ranges: HighlightRange[] = [];

  for (const kw of sorted) {
    let from = 0;
    while (from < folded.length) {
      const idx = folded.indexOf(kw, from);
      if (idx < 0) break;
      const endFold = idx + kw.length;
      let overlap = false;
      for (let i = idx; i < endFold; i++) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        for (let i = idx; i < endFold; i++) taken[i] = true;
        const start = map[idx];
        const end = map[endFold - 1] + 1;
        ranges.push({ start, end });
      }
      from = idx + 1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function highlightObjetoText(text: string, keywords: string[]): React.ReactNode {
  const ranges = findKeywordRanges(text, keywords);
  if (ranges.length === 0) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) {
      nodes.push(text.slice(cursor, range.start));
    }
    nodes.push(
      <strong key={`kw-${i}-${range.start}`} className="font-semibold text-gray-950 dark:text-white">
        {text.slice(range.start, range.end)}
      </strong>
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function ObjetoExpandable({
  text,
  keywords = [],
}: {
  text: string | null;
  keywords?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const value = text?.trim() || '';

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || !value) {
      setNeedsToggle(false);
      return;
    }
    if (expanded) return;
    setNeedsToggle(el.scrollHeight > el.clientHeight + 2);
  }, [value, expanded, keywords]);

  if (!value) {
    return <p className="text-sm text-gray-800 dark:text-gray-200">—</p>;
  }

  return (
    <div>
      <p
        ref={textRef}
        className={`text-sm leading-relaxed text-gray-800 dark:text-gray-200 ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {highlightObjetoText(value, keywords)}
      </p>
      {needsToggle || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          {expanded ? (
            <>
              Ver menos
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              Ver mais
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Id PNCP `CNPJ-1-SEQ/ANO` → https://pncp.gov.br/app/editais/{CNPJ}/{ANO}/{SEQ} */
function buildPncpEditalUrl(numeroControlePNCP: string | null | undefined): string | null {
  const m = String(numeroControlePNCP || '')
    .trim()
    .match(/^(\d{14})-\d+-(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const [, cnpj, seq, ano] = m;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { dataInicial: toDateInputValue(start), dataFinal: toDateInputValue(end) };
}

function modalidadeOptionLabel(codigo: string): string {
  const found = MODALIDADE_OPTIONS.find((m) => String(m.codigo) === String(codigo));
  if (!found) return codigo;
  return found.nome;
}

function formatSyncLabel(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'nunca';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LicitacoesPncpPageContent() {
  const queryClient = useQueryClient();
  const defaults = useMemo(() => defaultRange(), []);
  const [uf, setUf] = useState('DF');
  const [modalidadeCodigo, setModalidadeCodigo] = useState('all');
  const [dataInicial, setDataInicial] = useState(defaults.dataInicial);
  const [dataFinal, setDataFinal] = useState(defaults.dataFinal);
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showKeywordsList, setShowKeywordsList] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [applied, setApplied] = useState({
    uf: 'DF',
    modalidadeCodigo: 'all',
    dataInicial: defaults.dataInicial,
    dataFinal: defaults.dataFinal,
    q: '',
    pagina: 1,
  });

  const MIN_SEARCH_LEN = 3;

  const modalidadeOptions = useMemo(
    () => MODALIDADE_OPTIONS.map((m) => m.nome),
    []
  );

  const searchTerm = applied.q.trim();
  const hasSearch =
    searchTerm.length >= MIN_SEARCH_LEN ||
    /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(searchTerm);

  const hasActiveFilters =
    applied.uf !== 'DF' ||
    applied.modalidadeCodigo !== 'all' ||
    applied.dataInicial !== defaults.dataInicial ||
    applied.dataFinal !== defaults.dataFinal ||
    hasSearch;

  const keywordsQuery = useQuery({
    queryKey: ['pncp-keywords'],
    queryFn: async () => {
      const res = await api.get('/pncp/keywords');
      return (res.data?.data ?? res.data) as string[];
    },
    staleTime: 60 * 60_000,
  });

  const keywords = keywordsQuery.data ?? [];

  const syncStatusQuery = useQuery({
    queryKey: ['pncp-sync-status'],
    queryFn: async () => {
      const res = await api.get('/pncp/sync/status');
      return (res.data?.data ?? res.data) as PncpSyncStatus;
    },
    refetchInterval: (q) => (q.state.data?.running ? 3_000 : 60_000),
    staleTime: 2_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/pncp/sync');
      return (res.data?.data ?? res.data) as PncpSyncStatus;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['pncp-sync-status'] });
      setShowSyncModal(true);
      if (data.running) {
        toast.success('Sincronização iniciada (DF primeiro). Pode demorar vários minutos.');
      }
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(
        err?.response?.data?.message || err?.message || 'Não foi possível iniciar a sincronização.'
      );
    },
  });

  const syncRunning =
    Boolean(syncStatusQuery.data?.running) || syncMutation.isPending;

  const query = useQuery({
    queryKey: [
      'pncp-contratacoes',
      { ...applied, q: hasSearch ? searchTerm : '' },
    ],
    queryFn: async () => {
      const res = await api.get('/pncp/contratacoes', {
        params: {
          uf: applied.uf,
          codigoModalidadeContratacao: applied.modalidadeCodigo,
          dataInicial: dateInputToYyyymmdd(applied.dataInicial),
          dataFinal: dateInputToYyyymmdd(applied.dataFinal),
          pagina: applied.pagina,
          tamanhoPagina: 20,
          ...(hasSearch ? { q: searchTerm } : {}),
        },
        timeout: 30_000,
      });
      return (res.data?.data ?? res.data) as PncpListResult;
    },
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
    retry: false,
  });

  // Enquanto sincroniza, atualiza a lista (dados vão entrando) e ao terminar avisa.
  const wasSyncRunning = useRef(false);
  useEffect(() => {
    const running = Boolean(syncStatusQuery.data?.running);
    if (running) {
      void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
    }
    if (wasSyncRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: ['pncp-contratacoes'] });
      const last = syncStatusQuery.data?.lastRun;
      if (last?.status === 'failed') {
        toast.error(last.errorMessage || 'Sincronização falhou.');
      } else {
        toast.success(
          `Sync concluída: ${last?.upserted?.toLocaleString('pt-BR') ?? 0} itens no espelho.`
        );
      }
    }
    wasSyncRunning.current = running;
  }, [
    syncStatusQuery.data?.running,
    syncStatusQuery.data?.lastRun?.status,
    syncStatusQuery.data?.lastRun?.upserted,
    syncStatusQuery.data?.lastRun?.errorMessage,
    queryClient,
  ]);

  const items = query.data?.items ?? [];
  const totalPaginas = Math.max(1, query.data?.totalPaginas ?? 1);
  const currentPage = applied.pagina;
  const pageSize = query.data?.tamanhoPagina ?? 20;
  const totalRegistros = query.data?.totalRegistros ?? items.length;
  const startItem =
    items.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem =
    items.length === 0 ? 0 : Math.min(currentPage * pageSize, totalRegistros);
  const showInitialLoading = query.isLoading && !query.data;

  const lastSyncAt =
    syncStatusQuery.data?.lastRun?.finishedAt ||
    syncStatusQuery.data?.lastRun?.startedAt ||
    null;
  const syncProgress = syncStatusQuery.data?.lastRun;
  const progress = syncStatusQuery.data?.progress;
  const mirror = syncStatusQuery.data?.mirror;
  const syncPct =
    progress && progress.totalUfs > 0
      ? Math.round((progress.doneUfs / progress.totalUfs) * 100)
      : 0;

  const commitFilters = (next: {
    uf: string;
    modalidadeCodigo: string;
    dataInicial: string;
    dataFinal: string;
  }) => {
    if (!next.dataInicial || !next.dataFinal) {
      toast.error('Informe o período de publicação.');
      return;
    }
    if (next.dataInicial > next.dataFinal) {
      toast.error('A data inicial não pode ser maior que a data final.');
      return;
    }
    setApplied((prev) => ({
      ...prev,
      ...next,
      pagina: 1,
    }));
  };

  // Busca opcional: aplica com debounce (mín. 3 caracteres ou Id PNCP completo).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = q.trim();
      const usable =
        nextQ.length === 0 ||
        nextQ.length >= MIN_SEARCH_LEN ||
        /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(nextQ);
      if (!usable) return;
      setApplied((prev) => {
        if (prev.q === nextQ) return prev;
        return { ...prev, q: nextQ, pagina: 1 };
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [q]);

  const clearFilters = () => {
    setUf('DF');
    setModalidadeCodigo('all');
    setDataInicial(defaults.dataInicial);
    setDataFinal(defaults.dataFinal);
    setApplied((prev) => ({
      ...prev,
      uf: 'DF',
      modalidadeCodigo: 'all',
      dataInicial: defaults.dataInicial,
      dataFinal: defaults.dataFinal,
      pagina: 1,
    }));
  };

  const clearSearch = () => {
    setQ('');
    setApplied((prev) => ({ ...prev, q: '', pagina: 1 }));
  };

  const goToPage = (page: number) => {
    const safe = Math.max(1, Math.min(page, totalPaginas));
    setApplied((prev) => ({ ...prev, pagina: safe }));
  };

  const loadError = (() => {
    const raw =
      (query.error as { response?: { data?: { message?: string } }; message?: string; code?: string })
        ?.response?.data?.message ||
      (query.error as Error)?.message ||
      'Erro ao consultar o PNCP.';
    if (/timeout of \d+ms exceeded/i.test(raw) || raw === 'ECONNABORTED') {
      return 'O PNCP demorou para responder. Aguarde um minuto e clique em Atualizar.';
    }
    return raw;
  })();

  const listSubtitle = showInitialLoading
    ? 'Carregando...'
    : query.isFetching
      ? `Atualizando página ${currentPage}…`
      : totalRegistros === 1
        ? '1 licitação no espelho local'
        : `${totalRegistros.toLocaleString('pt-BR')} licitações no espelho local`;

  const syncSubtitle = syncRunning
    ? `Sincronizando${
        syncStatusQuery.data?.currentUf ? ` ${syncStatusQuery.data.currentUf}` : ''
      }… ${syncProgress?.upserted ?? 0} salvos · ${syncProgress?.pagesFetched ?? 0} págs`
    : `Última sync: ${formatSyncLabel(lastSyncAt)}`;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Portal Nacional de Contratações Públicas
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Consulta pública de contratações publicadas no PNCP.
        </p>
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                  Licitações
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {listSubtitle}
                  {hasActiveFilters ? ' (filtrados)' : ''}
                </p>
                <button
                  type="button"
                  onClick={() => setShowSyncModal(true)}
                  className="mt-0.5 text-left text-xs text-gray-400 underline-offset-2 hover:text-red-600 hover:underline dark:text-gray-500 dark:hover:text-red-400"
                  title="Ver progresso da sincronização"
                >
                  {syncSubtitle}
                </button>
              </div>
            </div>

            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-[200px] flex-1 sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filtrar órgão, valor ou Id PNCP..."
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                {q ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveFilters
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={hasActiveFilters ? 'Filtro ativo' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilters ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => syncMutation.mutate()}
                disabled={syncRunning}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                aria-label="Sincronizar PNCP"
                title={
                  syncRunning
                    ? 'Sincronização em andamento'
                    : 'Sincronizar agora com o PNCP'
                }
              >
                <DownloadCloud
                  className={`h-4 w-4 ${syncRunning ? 'animate-pulse text-red-600' : ''}`}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className={cadastroListClasses.cardContent}>
          {query.isError && !query.data ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
            </div>
          ) : showInitialLoading ? (
            <CadastroListLoading message="Carregando espelho local..." />
          ) : items.length === 0 ? (
            <div className="space-y-4">
              <CadastroListEmpty
                icon={ClipboardList}
                title="Nenhuma licitação encontrada"
                hint={
                  syncRunning
                    ? 'Sincronização em andamento. Em breve os dados aparecem aqui.'
                    : 'Ajuste os filtros ou clique em Sincronizar para puxar do PNCP.'
                }
              />
              {totalPaginas > 1 ? (
                <div className={cadastroListClasses.pagination}>
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPaginas}
                    onPageChange={goToPage}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <CadastroListSummary
                startItem={startItem}
                endItem={endItem}
                total={totalRegistros}
                itemLabel="licitação"
                itemLabelPlural="licitações"
                currentPage={currentPage}
                totalPages={totalPaginas}
              />

              <div
                className={`overflow-x-auto transition-opacity ${
                  query.isFetching && !showInitialLoading ? 'opacity-60' : ''
                }`}
              >
                <table className="w-full min-w-[72rem] text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th scope="col" className={cadastroListClasses.th}>
                        Órgão
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        UF
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Modalidade
                      </th>
                      <th scope="col" className={cadastroListClasses.th}>
                        Objeto
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Processo
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Abertura
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Encerramento
                      </th>
                      <th scope="col" className={cadastroListClasses.thNumeric}>
                        Valor estimado
                      </th>
                      <th scope="col" className={cadastroListClasses.thCenter}>
                        Origem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {items.map((row, idx) => {
                      const key =
                        row.numeroControlePNCP ||
                        `${row.processo || 'p'}-${row.sequencialCompra || idx}`;
                      return (
                        <tr key={key} className={getListTableRowClassName(false)}>
                          <td className={cadastroListClasses.td}>
                            <div className="min-w-[12rem] max-w-[18rem]">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {row.orgao || '—'}
                              </div>
                              <div
                                className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
                                title={
                                  [
                                    row.codigoUnidadeCompradora,
                                    row.unidadeCompradora,
                                  ]
                                    .filter(Boolean)
                                    .join(' - ') || undefined
                                }
                              >
                                {row.codigoUnidadeCompradora && row.unidadeCompradora
                                  ? `${row.codigoUnidadeCompradora} - ${row.unidadeCompradora}`
                                  : row.unidadeCompradora ||
                                    row.codigoUnidadeCompradora ||
                                    '—'}
                              </div>
                            </div>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {row.uf || '—'}
                            </div>
                            {row.municipio ? (
                              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {row.municipio}
                              </div>
                            ) : null}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div className="min-w-[8rem] max-w-[12rem]">
                              <div>{row.modalidade || '—'}</div>
                              {row.srp ? (
                                <div className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                                  SRP
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className={cadastroListClasses.td}>
                            <div className="min-w-[16rem] max-w-[28rem]">
                              <ObjetoExpandable text={row.objeto} keywords={keywords} />
                            </div>
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <div>{row.processo || '—'}</div>
                            {row.numeroControlePNCP ? (
                              <div className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                                {row.numeroControlePNCP}
                              </div>
                            ) : null}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <DateTimeStacked iso={row.dataAberturaProposta} />
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            <DateTimeStacked iso={row.dataEncerramentoProposta} />
                          </td>
                          <td className={cadastroListClasses.tdNumeric}>
                            {formatCurrency(row.valorEstimado)}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {(() => {
                              const href =
                                buildPncpEditalUrl(row.numeroControlePNCP) ||
                                row.linkPncp ||
                                null;
                              if (!href) return '—';
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                  aria-label="Abrir edital no PNCP"
                                  title="Abrir no PNCP"
                                >
                                  <ExternalLink className="h-4 w-4" aria-hidden />
                                </a>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={cadastroListClasses.pagination}>
                <ListPagination
                  currentPage={currentPage}
                  totalPages={totalPaginas}
                  onPageChange={goToPage}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {showFilters ? (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFilters(false)} />
          <div className="relative w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Fechar filtros"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  UF
                </label>
                <StringSingleSelectDropdown
                  value={uf}
                  onChange={(nextUf) => {
                    setUf(nextUf);
                    commitFilters({
                      uf: nextUf,
                      modalidadeCodigo,
                      dataInicial,
                      dataFinal,
                    });
                  }}
                  options={[...BRASIL_UFS]}
                  allowEmpty={false}
                  placeholder="UF"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Modalidade
                </label>
                <StringSingleSelectDropdown
                  value={modalidadeOptionLabel(modalidadeCodigo)}
                  onChange={(label) => {
                    const found = MODALIDADE_OPTIONS.find((m) => m.nome === label);
                    const codigo = found ? String(found.codigo) : 'all';
                    setModalidadeCodigo(codigo);
                    commitFilters({
                      uf,
                      modalidadeCodigo: codigo,
                      dataInicial,
                      dataFinal,
                    });
                  }}
                  options={modalidadeOptions}
                  allowEmpty={false}
                  placeholder="Modalidade"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Publicação de
                  </label>
                  <DatePickerField
                    value={dataInicial}
                    onChange={(next) => {
                      setDataInicial(next);
                      commitFilters({
                        uf,
                        modalidadeCodigo,
                        dataInicial: next,
                        dataFinal,
                      });
                    }}
                    aria-label="Publicação de"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Publicação até
                  </label>
                  <DatePickerField
                    value={dataFinal}
                    onChange={(next) => {
                      setDataFinal(next);
                      commitFilters({
                        uf,
                        modalidadeCodigo,
                        dataInicial,
                        dataFinal: next,
                      });
                    }}
                    aria-label="Publicação até"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Espelho por palavras-chave
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  O sync guarda só objetos de{' '}
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    engenharia
                  </strong>{' '}
                  /{' '}
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    predial
                  </strong>{' '}
                  /{' '}
                  <strong className="font-semibold text-gray-700 dark:text-gray-200">
                    áreas verdes
                  </strong>{' '}
                  (e afins). A lista lê o banco local — sem rate limit do PNCP.
                </p>
                <button
                  type="button"
                  onClick={() => setShowKeywordsList((v) => !v)}
                  className="mt-2 text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  {showKeywordsList ? 'Ocultar palavras-chave' : 'Ver palavras-chave'}
                </button>
                {showKeywordsList ? (
                  <div className="mt-2 max-h-36 overflow-y-auto">
                    {keywordsQuery.isLoading ? (
                      <p className="text-xs text-gray-500">Carregando...</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {(keywordsQuery.data ?? []).slice(0, 80).map((kw) => (
                          <span
                            key={kw}
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sync automático a cada ~1h (Brasil, últimos 30 dias). Use o botão de nuvem para forçar
                agora.
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setShowFilters(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setShowFilters(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSyncModal ? (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSyncModal(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Sincronização PNCP
                </h3>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {syncRunning
                    ? `Em andamento${
                        syncStatusQuery.data?.currentUf
                          ? ` · UF ${syncStatusQuery.data.currentUf}`
                          : ''
                      }${
                        syncStatusQuery.data?.currentModalidade
                          ? ` · ${syncStatusQuery.data.currentModalidade}`
                          : ''
                      }`
                    : `Última sync: ${formatSyncLabel(lastSyncAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">No espelho</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {(mirror?.total ?? 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Nesta sync</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {(progress?.upserted ?? syncProgress?.upserted ?? 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">UFs feitas</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {progress?.doneUfs ?? 0}/{progress?.totalUfs ?? 27}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Faltam</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {progress?.pendingUfs ?? 0} UFs
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Progresso por UF</span>
                  <span>{syncPct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className="h-full rounded-full bg-red-600 transition-all duration-500"
                    style={{ width: `${syncPct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {(progress?.pagesFetched ?? 0).toLocaleString('pt-BR')} páginas consultadas
                  {(progress?.rateLimitHits ?? 0) > 0
                    ? ` · ${progress?.rateLimitHits} rate-limit`
                    : ''}
                  {progress?.lookbackDays ? ` · últimos ${progress.lookbackDays} dias` : ''}
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  Status por UF
                </p>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/80 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">UF</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 text-right font-medium">Sync</th>
                        <th className="px-3 py-2 text-right font-medium">Espelho</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {(progress?.ufs ?? []).map((row) => {
                        const mirrorCount =
                          mirror?.byUf.find((m) => m.uf === row.uf)?.count ?? 0;
                        const statusLabel =
                          row.status === 'done'
                            ? 'Feito'
                            : row.status === 'running'
                              ? 'Agora'
                              : row.status === 'error'
                                ? 'Erro'
                                : 'Falta';
                        const statusCls =
                          row.status === 'done'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : row.status === 'running'
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : row.status === 'error'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-gray-400';
                        return (
                          <tr key={row.uf} className="bg-white dark:bg-gray-800">
                            <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100">
                              {row.uf}
                            </td>
                            <td className={`px-3 py-1.5 ${statusCls}`}>{statusLabel}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                              {row.upsertedThisRun.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                              {mirrorCount.toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => syncMutation.mutate()}
                disabled={syncRunning}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <DownloadCloud className="h-4 w-4" />
                {syncRunning ? 'Sincronizando…' : 'Sincronizar agora'}
              </button>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function LicitacoesPncpPage() {
  const router = useRouter();
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' as const };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/licitacoes">
      <MainLayout
        userRole="EMPLOYEE"
        userName={user.name || ''}
        onLogout={handleLogout}
      >
        <LicitacoesPncpPageContent />
      </MainLayout>
    </ProtectedRoute>
  );
}
