'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2, MapPin, RefreshCw, Search, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

const SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1a91oJtIVYdydilp9hrmtVXnPwnXQ5Pf0/edit';

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
  aceites: LicitacaoRegiaoAceiteSummary[];
  rowCount: number;
  sheetAvailable: boolean;
  fetchedAt: string;
};

type VisibleRow = {
  cells: string[];
  rowKey: string;
  sourceIndex: number;
};

const DEFAULT_REGIAO_KEY = 'centro-oeste';

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
      .map((cells, sourceIndex) => ({
        cells,
        rowKey: rowKeys[sourceIndex] ?? '',
        sourceIndex,
      }))
      .filter(({ cells }) => {
        if (!query) return true;
        return cells.some((cell) => normalizeSearchText(cell).includes(query));
      });
  }, [sheet?.rows, sheet?.rowKeys, search]);

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

  const isAceiteBusy = aceiteMutation.isPending || desfazerAceiteMutation.isPending;

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
        ) : sheet?.sheetAvailable === false ? (
          <CardContent className="px-5 py-12 text-center text-sm text-gray-500">
            <p className="font-medium text-gray-700 dark:text-gray-300">
              Nenhuma licitação nesta região por enquanto.
            </p>
            <p className="mt-2">
              Os dados serão exibidos automaticamente quando a aba{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {sheet.tab.sheetName}
              </span>{' '}
              for criada na planilha.
            </p>
          </CardContent>
        ) : !sheet || sheet.headers.length === 0 ? (
          <CardContent className="px-5 py-12 text-center text-sm text-gray-500">
            Nenhum dado encontrado nesta região.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 dark:bg-gray-900/60">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas as licitações visíveis"
                      checked={allVisibleSelected}
                      disabled={selectableVisibleRowKeys.length === 0}
                      onChange={toggleSelectAllVisible}
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
                  >
                    Aceite
                  </th>
                  {sheet.headers.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      scope="col"
                      className="whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-950/20">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sheet.headers.length + 2}
                      className="px-5 py-10 text-center text-gray-500"
                    >
                      Nenhum resultado para a busca atual.
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
                          <input
                            type="checkbox"
                            aria-label="Selecionar licitação"
                            checked={isSelected}
                            disabled={!row.rowKey || isAceiteBusy}
                            onChange={() => toggleRowSelection(row.rowKey)}
                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-40"
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
                        {sheet.headers.map((_, colIndex) => (
                          <td
                            key={colIndex}
                            className="max-w-xs px-3 py-2.5 text-gray-800 dark:text-gray-200"
                          >
                            <CellContent value={row.cells[colIndex] ?? ''} />
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
