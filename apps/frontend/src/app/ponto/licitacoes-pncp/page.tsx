'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ClipboardList,
  ExternalLink,
  Filter,
  RefreshCw,
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
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import api from '@/lib/api';

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

function formatCurrency(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { dataInicial: toDateInputValue(start), dataFinal: toDateInputValue(end) };
}

function modalidadeOptionLabel(codigo: string): string {
  const found = MODALIDADE_OPTIONS.find((m) => String(m.codigo) === String(codigo));
  if (!found) return codigo;
  return found.codigo === 'all' ? found.nome : `${found.codigo} — ${found.nome}`;
}

function LicitacoesPncpPageContent() {
  const defaults = useMemo(() => defaultRange(), []);
  const [uf, setUf] = useState('DF');
  const [modalidadeCodigo, setModalidadeCodigo] = useState('6');
  const [dataInicial, setDataInicial] = useState(defaults.dataInicial);
  const [dataFinal, setDataFinal] = useState(defaults.dataFinal);
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [applied, setApplied] = useState({
    uf: 'DF',
    modalidadeCodigo: '6',
    dataInicial: defaults.dataInicial,
    dataFinal: defaults.dataFinal,
    q: '',
    pagina: 1,
  });

  const MIN_SEARCH_LEN = 3;

  const modalidadeOptions = useMemo(
    () =>
      MODALIDADE_OPTIONS.map((m) =>
        m.codigo === 'all' ? m.nome : `${m.codigo} — ${m.nome}`
      ),
    []
  );

  const searchTerm = applied.q.trim();
  const hasSearch =
    searchTerm.length >= MIN_SEARCH_LEN ||
    /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(searchTerm);

  const hasActiveFilters =
    applied.uf !== 'DF' ||
    applied.modalidadeCodigo !== '6' ||
    applied.dataInicial !== defaults.dataInicial ||
    applied.dataFinal !== defaults.dataFinal ||
    hasSearch;

  const query = useQuery({
    queryKey: ['pncp-contratacoes', { ...applied, q: hasSearch ? searchTerm : '' }],
    queryFn: async () => {
      const res = await api.get('/pncp/contratacoes', {
        params: {
          uf: applied.uf,
          codigoModalidadeContratacao: applied.modalidadeCodigo,
          dataInicial: dateInputToYyyymmdd(applied.dataInicial),
          dataFinal: dateInputToYyyymmdd(applied.dataFinal),
          pagina: applied.pagina,
          tamanhoPagina: 50,
          ...(hasSearch ? { q: searchTerm } : {}),
        },
        timeout:
          applied.modalidadeCodigo === 'all' ? 180_000 : hasSearch ? 120_000 : 60_000,
      });
      return (res.data?.data ?? res.data) as PncpListResult;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const items = query.data?.items ?? [];
  const totalRegistros = query.data?.totalRegistros ?? items.length;
  const totalPaginas = Math.max(1, query.data?.totalPaginas ?? 1);
  const currentPage = query.data?.pagina ?? applied.pagina;
  const pageSize = query.data?.tamanhoPagina ?? 50;
  const startItem = totalRegistros === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem =
    totalRegistros === 0 ? 0 : Math.min(currentPage * pageSize, totalRegistros);

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
    setModalidadeCodigo('6');
    setDataInicial(defaults.dataInicial);
    setDataFinal(defaults.dataFinal);
    setApplied((prev) => ({
      ...prev,
      uf: 'DF',
      modalidadeCodigo: '6',
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

  const listSubtitle =
    query.isLoading || query.isFetching
      ? 'Carregando...'
      : totalRegistros === 1
        ? '1 licitação encontrada'
        : `${totalRegistros.toLocaleString('pt-BR')} licitações encontradas`;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Licitações PNCP
        </h1>
        <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Consulta pública de contratações publicadas no Portal Nacional de Contratações Públicas.
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
                  Publicações PNCP
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {listSubtitle}
                  {hasActiveFilters ? ' (filtrados)' : ''}
                </p>
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
                onClick={() => query.refetch()}
                disabled={query.isFetching}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                aria-label="Atualizar"
                title="Atualizar"
              >
                <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className={cadastroListClasses.cardContent}>
          {query.isError ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
            </div>
          ) : query.isLoading ? (
            <CadastroListLoading message="Consultando PNCP..." />
          ) : items.length === 0 ? (
            <CadastroListEmpty
              icon={ClipboardList}
              title="Nenhuma licitação encontrada"
              hint="Ajuste a busca ou os filtros e tente novamente."
            />
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

              <div className="overflow-x-auto">
                <table className="w-full min-w-[76rem] text-sm">
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
                                title={row.unidadeCompradora || undefined}
                              >
                                {row.unidadeCompradora || '—'}
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
                          <td className={cadastroListClasses.tdTruncate}>
                            <span
                              className="block max-w-[22rem] text-sm text-gray-900 dark:text-gray-100 line-clamp-3"
                              title={row.objeto || undefined}
                            >
                              {row.objeto || '—'}
                            </span>
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
                            {row.linkSistemaOrigem ? (
                              <a
                                href={row.linkSistemaOrigem}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                aria-label="Abrir sistema de origem"
                                title="Abrir origem"
                              >
                                <ExternalLink className="h-4 w-4" aria-hidden />
                              </a>
                            ) : (
                              '—'
                            )}
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
                    const codigo =
                      label === 'Todas' ? 'all' : label.split('—')[0]?.trim() || '6';
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

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Fonte: API pública do PNCP. Id PNCP busca direto; demais termos varrem páginas do período.
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
    </div>
  );
}

export default function LicitacoesPncpPage() {
  return (
    <ProtectedRoute route="/ponto/licitacoes">
      <MainLayout>
        <LicitacoesPncpPageContent />
      </MainLayout>
    </ProtectedRoute>
  );
}
