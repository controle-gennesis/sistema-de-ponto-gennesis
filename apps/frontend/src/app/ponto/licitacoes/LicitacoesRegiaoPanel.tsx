'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TableCheckbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { currencyDigitsToFormatted } from '@/lib/fichaDemandaApproval';

const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1a91oJtIVYdydilp9hrmtVXnPwnXQ5Pf0/edit';

const BRASIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

const BRASIL_UF_LABELS: Record<(typeof BRASIL_UFS)[number], string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

type LicitacaoRegiaoTab = {
  key: string;
  label: string;
  sheetName: string;
};

type LicitacaoRegiaoAceiteSummary = {
  rowKey: string;
  acceptedBy: string;
  acceptedByName: string;
  acceptedAt: string;
};

type LicitacaoRegiaoSheetData = {
  tab: LicitacaoRegiaoTab;
  spreadsheetId: string;
  headers: string[];
  rows: string[][];
  rowKeys: string[];
  manualRowKeys?: string[];
  aceites: LicitacaoRegiaoAceiteSummary[];
  rowCount: number;
  sheetAvailable: boolean;
  fetchedAt: string;
};

type VisibleRow = {
  cells: string[];
  rowKey: string;
  sourceIndex: number;
  isManual: boolean;
};

const DEFAULT_REGIAO_KEY = 'centro-oeste';

const CANONICAL_HEADERS_BY_REGIAO: Record<string, string[]> = {
  'centro-oeste': [
    'ITEM',
    'ESTADO',
    'ÓRGÃO',
    'OBJETO',
    'QUALIFICAÇÃO TÉCNICA',
    'VALOR ESTIMADO',
    'Nº DO PREGÃO',
    'CÓDIGO / UASG',
    'SITE/LOCAL',
    'ABERTURA',
    'HORA',
    'DESCONTO',
    'EMPRESA ',
    'EDITAL',
  ],
  sudeste: [
    'ITEM',
    'ESTADO',
    'ÓRGÃO',
    'OBJETO',
    'QUALIFICAÇÃO TÉCNICA',
    'VALOR ESTIMADO',
    'Nº DO PREGÃO',
    'CÓDIGO / UASG',
    'SITE/LOCAL',
    'ABERTURA',
    'HORA',
    'DESCONTO',
    'FASE DA LICITAÇÃO',
    'EMPRESA ',
    'EDITAL',
  ],
};

function getCanonicalHeaders(regiaoKey: string): string[] {
  if (regiaoKey === 'centro-oeste') return CANONICAL_HEADERS_BY_REGIAO['centro-oeste'];
  return CANONICAL_HEADERS_BY_REGIAO.sudeste;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function formatFetchedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function buildRowSnapshot(headers: string[], row: string[]): Record<string, string> {
  const snapshot: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = row[index]?.trim();
    if (value) snapshot[header || `Coluna ${index + 1}`] = value;
  });
  return snapshot;
}

function emptyFormFields(headers: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const header of headers) fields[header] = '';
  return fields;
}

function normalizeHeaderKey(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function isValorEstimadoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'VALOR ESTIMADO' || key === 'VALOR';
}

function isEstadoHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return key === 'ESTADO' || key === 'UF';
}

function isLinkHeader(header: string): boolean {
  const key = normalizeHeaderKey(header);
  return (
    key === 'EDITAL' ||
    key === 'SITE/LOCAL' ||
    key === 'SITE' ||
    key === 'LOCAL' ||
    key.startsWith('SITE')
  );
}

function isAberturaHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'ABERTURA';
}

function isHoraHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'HORA';
}

function isDescontoHeader(header: string): boolean {
  return normalizeHeaderKey(header) === 'DESCONTO';
}

function formatValorEstimadoInput(raw: string): string {
  const formatted = currencyDigitsToFormatted(raw);
  if (!formatted) return '';
  return `R$ ${formatted}`;
}

function formatDescontoInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  const value = cents / 100;
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted}%`;
}

function isoDateToBr(iso: string): string {
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso.trim();
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeLinkInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function prepareCreateFields(
  headers: string[],
  fields: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const header of headers) {
    const raw = fields[header] ?? '';
    if (isLinkHeader(header)) {
      next[header] = normalizeLinkInput(raw);
    } else if (isAberturaHeader(header)) {
      next[header] = isoDateToBr(raw);
    } else {
      next[header] = raw.trim();
    }
  }
  return next;
}

function CellContent({ value }: { value: string }) {
  const text = value.trim();
  if (!text || text === '?' || text === '-') {
    return <span className="text-gray-400">—</span>;
  }
  if (isUrl(text)) {
    return (
      <a
        href={text}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1 text-red-600 hover:text-red-700 hover:underline dark:text-red-400"
        title={text}
      >
        <span className="truncate">{text.replace(/^https?:\/\//, '')}</span>
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      </a>
    );
  }
  return (
    <span className="line-clamp-3" title={text.length > 80 ? text : undefined}>
      {text}
    </span>
  );
}

const SHEET_POLL_INTERVAL_MS = 15_000;

export function LicitacoesRegiaoPanel() {
  const queryClient = useQueryClient();
  const [regiaoKey, setRegiaoKey] = useState(DEFAULT_REGIAO_KEY);
  const [search, setSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(() => new Set());
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createFields, setCreateFields] = useState<Record<string, string>>({});

  const { data: tabs = [], isLoading: loadingTabs } = useQuery({
    queryKey: ['licitacoes-planilha-regioes'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/planilha-regioes');
      return (res.data?.data ?? []) as LicitacaoRegiaoTab[];
    },
  });

  const activeTab = tabs.find((tab) => tab.key === regiaoKey) ?? tabs[0];

  const {
    data: sheet,
    isLoading: loadingSheet,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['licitacoes-planilha-regiao', activeTab?.key],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/planilha-regioes/${activeTab!.key}`, {
        params: { refresh: '1', t: Date.now() },
      });
      return res.data?.data as LicitacaoRegiaoSheetData;
    },
    enabled: Boolean(activeTab?.key),
    staleTime: 0,
    gcTime: 0,
    structuralSharing: false,
    refetchInterval: SHEET_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const formHeaders = useMemo(() => {
    if (sheet?.headers?.length) return sheet.headers;
    return getCanonicalHeaders(activeTab?.key ?? regiaoKey);
  }, [sheet?.headers, activeTab?.key, regiaoKey]);

  const openCreateModal = () => {
    setCreateFields(emptyFormFields(formHeaders));
    setCreateModalOpen(true);
  };

  const manualRowKeySet = useMemo(
    () => new Set(sheet?.manualRowKeys ?? []),
    [sheet?.manualRowKeys]
  );

  const aceitesByRowKey = useMemo(() => {
    const map = new Map<string, LicitacaoRegiaoAceiteSummary>();
    for (const aceite of sheet?.aceites ?? []) {
      map.set(aceite.rowKey, aceite);
    }
    return map;
  }, [sheet?.aceites]);

  const visibleRows = useMemo((): VisibleRow[] => {
    const rows = sheet?.rows ?? [];
    const rowKeys = sheet?.rowKeys ?? [];
    const query = normalizeSearchText(search);

    return rows
      .map((cells, sourceIndex) => {
        const rowKey = rowKeys[sourceIndex] ?? '';
        return {
          cells,
          rowKey,
          sourceIndex,
          isManual:
            Boolean(rowKey) &&
            (rowKey.startsWith('manual:') || manualRowKeySet.has(rowKey)),
        };
      })
      .filter(({ cells }) => {
        if (!query) return true;
        return cells.some((cell) => normalizeSearchText(cell).includes(query));
      });
  }, [sheet?.rows, sheet?.rowKeys, search, manualRowKeySet]);

  const selectableVisibleRowKeys = useMemo(
    () => visibleRows.filter((row) => row.rowKey && !aceitesByRowKey.has(row.rowKey)).map((r) => r.rowKey),
    [visibleRows, aceitesByRowKey]
  );

  const selectedPendingRowKeys = useMemo(
    () => Array.from(selectedRowKeys).filter((key) => !aceitesByRowKey.has(key)),
    [selectedRowKeys, aceitesByRowKey]
  );

  const selectedAcceptedRowKeys = useMemo(
    () => Array.from(selectedRowKeys).filter((key) => aceitesByRowKey.has(key)),
    [selectedRowKeys, aceitesByRowKey]
  );

  const selectedManualRowKeys = useMemo(
    () =>
      Array.from(selectedRowKeys).filter(
        (key) => key.startsWith('manual:') || manualRowKeySet.has(key)
      ),
    [selectedRowKeys, manualRowKeySet]
  );

  const allVisibleSelected =
    selectableVisibleRowKeys.length > 0 &&
    selectableVisibleRowKeys.every((key) => selectedRowKeys.has(key));

  const aceiteMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados da planilha indisponíveis.');

      const items = rowKeys.map((rowKey) => {
        const sourceIndex = sheet.rowKeys.indexOf(rowKey);
        return {
          rowKey,
          rowSnapshot:
            sourceIndex >= 0
              ? buildRowSnapshot(sheet.headers, sheet.rows[sourceIndex])
              : undefined,
        };
      });

      const res = await api.post('/licitacoes/planilha-regioes/aceites', {
        regiaoKey: activeTab.key,
        spreadsheetId: sheet.spreadsheetId,
        items,
      });
      return res.data as {
        message?: string;
        data?: LicitacaoRegiaoAceiteSummary[];
      };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Aceite registrado com sucesso.');
      setSelectedRowKeys(new Set());

      const incomingAceites = payload?.data ?? [];
      if (incomingAceites.length > 0 && activeTab?.key) {
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            const byKey = new Map((current.aceites ?? []).map((aceite) => [aceite.rowKey, aceite]));
            for (const aceite of incomingAceites) {
              byKey.set(aceite.rowKey, aceite);
            }
            return { ...current, aceites: Array.from(byKey.values()) };
          }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao registrar aceite.');
    },
  });

  const desfazerAceiteMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados da planilha indisponíveis.');

      const res = await api.delete('/licitacoes/planilha-regioes/aceites', {
        data: {
          regiaoKey: activeTab.key,
          spreadsheetId: sheet.spreadsheetId,
          rowKeys,
        },
      });
      return res.data as {
        message?: string;
        data?: { rowKeys?: string[] };
      };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Aceite desfeito com sucesso.');
      setSelectedRowKeys(new Set());

      const removedRowKeys = new Set(payload?.data?.rowKeys ?? []);
      if (removedRowKeys.size > 0 && activeTab?.key) {
        queryClient.setQueryData<LicitacaoRegiaoSheetData>(
          ['licitacoes-planilha-regiao', activeTab.key],
          (current) => {
            if (!current) return current;
            return {
              ...current,
              aceites: (current.aceites ?? []).filter((aceite) => !removedRowKeys.has(aceite.rowKey)),
            };
          }
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao desfazer aceite.');
    },
  });

  const createManualMutation = useMutation({
    mutationFn: async (fields: Record<string, string>) => {
      if (!activeTab) throw new Error('Região indisponível.');
      const res = await api.post('/licitacoes/planilha-regioes/manuais', {
        regiaoKey: activeTab.key,
        fields,
      });
      return res.data as { message?: string };
    },
    onSuccess: async (payload) => {
      toast.success(payload?.message ?? 'Licitação criada com sucesso.');
      setCreateModalOpen(false);
      setCreateFields({});
      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erro ao criar licitação.');
    },
  });

  const deleteManualMutation = useMutation({
    mutationFn: async (rowKeys: string[]) => {
      if (!sheet || !activeTab) throw new Error('Dados indisponíveis.');
      const uniqueKeys = [...new Set(rowKeys.filter((key) => key.startsWith('manual:')))];
      if (uniqueKeys.length === 0) {
        throw new Error('Nenhuma licitação do sistema selecionada.');
      }

      for (const rowKey of uniqueKeys) {
        await api.delete('/licitacoes/planilha-regioes/manuais', {
          data: {
            regiaoKey: activeTab.key,
            spreadsheetId: sheet.spreadsheetId,
            rowKey,
          },
        });
      }

      return { count: uniqueKeys.length };
    },
    onSuccess: async (payload) => {
      toast.success(
        payload.count === 1
          ? 'Licitação removida da lista.'
          : `${payload.count} licitações removidas da lista.`
      );
      setSelectedRowKeys(new Set());
      await queryClient.invalidateQueries({ queryKey: ['licitacoes-planilha-regiao', activeTab?.key] });
      await queryClient.invalidateQueries({ queryKey: ['licitacoes'] });
      await refetch();
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err.response?.data?.message ?? err.message ?? 'Erro ao excluir licitação.');
    },
  });

  const isAceiteBusy = aceiteMutation.isPending || desfazerAceiteMutation.isPending;
  const isManualBusy = createManualMutation.isPending || deleteManualMutation.isPending;

  const toggleRowSelection = (rowKey: string) => {
    if (!rowKey) return;
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const key of selectableVisibleRowKeys) next.delete(key);
      } else {
        for (const key of selectableVisibleRowKeys) next.add(key);
      }
      return next;
    });
  };

  const errorMessage =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
      : error instanceof Error
        ? error.message
        : 'Erro ao carregar planilha';

  const tableHeaders = sheet?.headers?.length ? sheet.headers : formHeaders;
  const canShowTable = Boolean(tableHeaders.length);

  return (
    <div className="space-y-4">
      <Card padding="none" className="shadow-sm">
        <CardHeader className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-red-600" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Licitações por Região
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Licitações encontradas pela equipe. Selecione e registre ou desfaça o aceite da diretoria.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openCreateModal}
                disabled={!activeTab || loadingSheet}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Nova licitação
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      selectedManualRowKeys.length === 1
                        ? 'Excluir esta licitação criada no sistema?'
                        : `Excluir ${selectedManualRowKeys.length} licitações criadas no sistema?`
                    )
                  ) {
                    deleteManualMutation.mutate(selectedManualRowKeys);
                  }
                }}
                disabled={
                  selectedManualRowKeys.length === 0 ||
                  isManualBusy ||
                  loadingSheet ||
                  !sheet
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
              >
                {deleteManualMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
                Excluir
                {selectedManualRowKeys.length > 0 ? ` (${selectedManualRowKeys.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => aceiteMutation.mutate(selectedPendingRowKeys)}
                disabled={
                  selectedPendingRowKeys.length === 0 || isAceiteBusy || loadingSheet || !sheet
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aceiteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                Aceite
                {selectedPendingRowKeys.length > 0 ? ` (${selectedPendingRowKeys.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => desfazerAceiteMutation.mutate(selectedAcceptedRowKeys)}
                disabled={
                  selectedAcceptedRowKeys.length === 0 || isAceiteBusy || loadingSheet || !sheet
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
              >
                {desfazerAceiteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Undo2 className="h-4 w-4" aria-hidden />
                )}
                Desfazer aceite
                {selectedAcceptedRowKeys.length > 0 ? ` (${selectedAcceptedRowKeys.length})` : ''}
              </button>
              <a
                href={SPREADSHEET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Abrir planilha
              </a>
              <button
                type="button"
                onClick={() => {
                  void refetch();
                }}
                disabled={isFetching || !activeTab}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
                Atualizar
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-5 py-4">
          {loadingTabs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-red-600" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Regiões">
              {tabs.map((tab) => {
                const active = tab.key === (activeTab?.key ?? regiaoKey);
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setRegiaoKey(tab.key);
                      setSearch('');
                      setSelectedRowKeys(new Set());
                      setCreateModalOpen(false);
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar órgão, objeto, pregão, UF…"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <p className="text-sm text-gray-500">
              {loadingSheet ? 'Carregando…' : `${visibleRows.length} licitação(ões)`}
              {sheet?.aceites?.length ? ` · ${sheet.aceites.length} com aceite` : ''}
              {manualRowKeySet.size ? ` · ${manualRowKeySet.size} manual(is)` : ''}
              {sheet?.fetchedAt ? ` · Atualizado em ${formatFetchedAt(sheet.fetchedAt)}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card padding="none" className="overflow-hidden shadow-sm">
        {error ? (
          <CardContent className="px-5 py-12 text-center">
            <p className="font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 text-sm text-gray-600 underline hover:text-gray-800 dark:text-gray-400"
            >
              Tentar novamente
            </button>
          </CardContent>
        ) : loadingSheet ? (
          <CardContent className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-red-600" />
          </CardContent>
        ) : !canShowTable ? (
          <CardContent className="px-5 py-12 text-center text-sm text-gray-500">
            Nenhum dado encontrado nesta região.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <TableCheckbox
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAllVisible()}
                      disabled={selectableVisibleRowKeys.length === 0}
                      ariaLabel="Selecionar todas as licitações visíveis"
                    />
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
                  >
                    Aceite
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
                  >
                    Origem
                  </th>
                  {tableHeaders.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      scope="col"
                      className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
                    >
                      {header.trim()}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
                  >
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-950/20">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableHeaders.length + 4}
                      className="px-5 py-10 text-center text-gray-500"
                    >
                      {search.trim()
                        ? 'Nenhum resultado para a busca atual.'
                        : sheet?.sheetAvailable === false
                          ? `Nenhuma licitação nesta região por enquanto. Use “Nova licitação” ou aguarde a aba ${sheet.tab.sheetName} na planilha.`
                          : 'Nenhuma licitação nesta região.'}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const aceite = row.rowKey ? aceitesByRowKey.get(row.rowKey) : undefined;
                    const isAccepted = Boolean(aceite);
                    const isSelected = row.rowKey ? selectedRowKeys.has(row.rowKey) : false;

                    return (
                      <tr
                        key={`${row.sourceIndex}-${row.rowKey}`}
                        className={`align-top transition-colors ${
                          isAccepted
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/20'
                            : isSelected
                              ? 'bg-red-50/50 dark:bg-red-950/10'
                              : 'hover:bg-gray-50/80 dark:hover:bg-gray-900/40'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <TableCheckbox
                            checked={isSelected}
                            onChange={() => toggleRowSelection(row.rowKey)}
                            disabled={!row.rowKey || isAceiteBusy}
                            ariaLabel="Selecionar licitação"
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {isAccepted ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" aria-hidden />
                                Aceite
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {aceite?.acceptedByName}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {aceite ? formatFetchedAt(aceite.acceptedAt) : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => desfazerAceiteMutation.mutate([row.rowKey])}
                                disabled={isAceiteBusy}
                                className="mt-0.5 inline-flex w-fit items-center gap-1 text-[10px] font-medium text-amber-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-amber-400"
                              >
                                <Undo2 className="h-3 w-3" aria-hidden />
                                Desfazer
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Pendente</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {row.isManual ? (
                            <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                              Sistema
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              Planilha
                            </span>
                          )}
                        </td>
                        {tableHeaders.map((_, colIndex) => (
                          <td
                            key={colIndex}
                            className="max-w-xs px-3 py-2.5 text-gray-800 dark:text-gray-200"
                          >
                            <CellContent value={row.cells[colIndex] ?? ''} />
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {row.isManual ? (
                            <button
                              type="button"
                              title="Excluir licitação criada no sistema"
                              disabled={isManualBusy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Excluir esta licitação criada no sistema? Ela não existe na planilha.'
                                  )
                                ) {
                                  deleteManualMutation.mutate([row.rowKey]);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-transparent dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Excluir
                            </button>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={createModalOpen}
        onClose={() => {
          if (createManualMutation.isPending) return;
          setCreateModalOpen(false);
        }}
        title={`Nova licitação — ${activeTab?.label ?? 'Região'}`}
        size="xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createManualMutation.mutate(prepareCreateFields(formHeaders, createFields));
          }}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Preencha os mesmos campos da planilha. A licitação será adicionada apenas à lista do
            sistema e não será gravada na planilha Google.
          </p>
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {formHeaders.map((header) => {
              const label = header.trim();
              const value = createFields[header] ?? '';
              const fieldClass =
                'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900';

              if (isEstadoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <select
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    >
                      <option value="">Selecione o estado</option>
                      {BRASIL_UFS.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf} — {BRASIL_UF_LABELS[uf]}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              if (isValorEstimadoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({
                          ...prev,
                          [header]: formatValorEstimadoInput(e.target.value),
                        }))
                      }
                      placeholder="R$ 0,00"
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isAberturaHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="date"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isHoraHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="time"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isDescontoHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({
                          ...prev,
                          [header]: formatDescontoInput(e.target.value),
                        }))
                      }
                      placeholder="0,00%"
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (isLinkHeader(header)) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <input
                      type="url"
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      placeholder="https://"
                      disabled={createManualMutation.isPending}
                      className={fieldClass}
                    />
                  </label>
                );
              }

              if (
                normalizeHeaderKey(header) === 'OBJETO' ||
                normalizeHeaderKey(header) === 'QUALIFICACAO TECNICA'
              ) {
                return (
                  <label key={header} className="block sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {label}
                    </span>
                    <textarea
                      value={value}
                      onChange={(e) =>
                        setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                      }
                      rows={3}
                      disabled={createManualMutation.isPending}
                      className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                    />
                  </label>
                );
              }

              return (
                <label key={header} className="block sm:col-span-1">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {label}
                  </span>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setCreateFields((prev) => ({ ...prev, [header]: e.target.value }))
                    }
                    disabled={createManualMutation.isPending}
                    className={fieldClass}
                  />
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              disabled={createManualMutation.isPending}
              className="inline-flex h-9 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createManualMutation.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createManualMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Criar licitação
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
