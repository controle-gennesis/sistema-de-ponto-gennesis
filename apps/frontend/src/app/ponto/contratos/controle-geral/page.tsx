'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, BarChart3, Search, ExternalLink, X, Filter, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

const ITEMS_PER_PAGE = 20;

interface ContractOverview {
  id: string;
  name: string;
  number: string;
  startDate: string;
  endDate: string;
  costCenter?: { id: string; code: string; name: string };
  valuePlusAddenda: number;
  qtdProducoesSemanais?: number;
  /** Valor bruto (NFs), todos os anos */
  faturamentoAcumulado: number;
  /** Valor bruto no ano do filtro (0 se filtro "Todos") */
  faturamentoAnual: number;
  /** Se false, a coluna anual deve exibir "—" */
  faturamentoAnualAplica?: boolean;
  totalProducaoSemanal: number;
  valorOrcado: number;
  pendenteFaturamento: number;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export default function ControleGeralContratosPage() {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState<number | ''>(() => new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: overviewData, isLoading: loadingOverview } = useQuery({
    queryKey: ['contracts-overview', selectedYear],
    queryFn: async () => {
      const res = await api.get('/contracts/overview', {
        params: selectedYear ? { year: selectedYear } : {}
      });
      return res.data;
    }
  });

  const rawList = (overviewData?.data ?? []) as ContractOverview[];
  const filterYear = overviewData?.filterYear ?? null;

  const filteredContracts = useMemo(() => {
    if (!searchTerm.trim()) return rawList;
    const term = searchTerm.toLowerCase().trim();
    return rawList.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.number.toLowerCase().includes(term) ||
        (c.costCenter?.name ?? '').toLowerCase().includes(term) ||
        (c.costCenter?.code ?? '').toLowerCase().includes(term)
    );
  }, [rawList, searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedYear]);

  const totalFiltered = filteredContracts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startItem = totalFiltered === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem =
    totalFiltered === 0 ? 0 : Math.min(currentPage * ITEMS_PER_PAGE, totalFiltered);

  const pageContracts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredContracts.slice(start, end);
  }, [filteredContracts, currentPage]);

  const totals = useMemo(() => {
    return filteredContracts.reduce(
      (acc, c) => ({
        faturamentoAcumulado: acc.faturamentoAcumulado + c.faturamentoAcumulado,
        faturamentoAnual: acc.faturamentoAnual + c.faturamentoAnual,
        totalProducaoSemanal: acc.totalProducaoSemanal + c.totalProducaoSemanal,
        valorOrcado: acc.valorOrcado + c.valorOrcado,
        pendenteFaturamento: acc.pendenteFaturamento + c.pendenteFaturamento
      }),
      {
        faturamentoAcumulado: 0,
        faturamentoAnual: 0,
        totalProducaoSemanal: 0,
        valorOrcado: 0,
        pendenteFaturamento: 0
      }
    );
  }, [filteredContracts]);


  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const availableYears = ((overviewData?.availableYears as number[] | undefined) || []).filter((y) =>
    Number.isFinite(y)
  );
  const hasActiveYearFilter = selectedYear !== '';

  const clearYearFilters = () => {
    setSelectedYear('');
    setCurrentPage(1);
  };

  // Ordem fixa solicitada para este módulo:
  // CONTRATO, CENTRO DE CUSTO, FATURAMENTO ACUMULADO, FATURAMENTO ANUAL, PRODUÇÃO, VALOR ORÇADO, PENDENTE FATURAMENTO.

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div ref={containerRef} className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Controle Geral de Contratos
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Visão consolidada de todos os contratos
            </p>
          </div>

          {loadingOverview ? (
            <Card>
              <CardContent className="py-16">
                <Loading message="Carregando controle geral..." size="lg" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="border-b-0 pb-1">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                      <BarChart3 className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Controle geral
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Acompanhe faturamento e produção por contrato
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        placeholder="Buscar contrato..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {searchTerm ? (
                        <button
                          type="button"
                          onClick={() => setSearchTerm('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFiltersModalOpen(true)}
                      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        hasActiveYearFilter
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      aria-label="Abrir filtros"
                      title={hasActiveYearFilter ? 'Filtros ativos' : 'Filtros'}
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveYearFilter ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {totalFiltered === 0 ? (
                  <div className="py-8 text-center">
                    <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum contrato encontrado</p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                      {searchTerm.trim()
                        ? 'Tente ajustar a busca'
                        : 'Cadastre um contrato para começar'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        Mostrando {startItem} a {endItem} de {totalFiltered}{' '}
                        {totalFiltered === 1 ? 'contrato' : 'contratos'}
                      </span>
                      <span>
                        Página {currentPage} de {totalPages}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                              Contrato
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Centro de Custo
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                              Faturamento acumulado
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                              Faturamento anual
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Produção
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                              Valor orçado
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase whitespace-nowrap">
                              Pendente faturamento
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16">
                              Ações
                            </th>
                          </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {pageContracts.map((c) => (
                            <tr
                              key={c.id}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                              <td className="px-3 sm:px-6 py-4">
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-gray-100">
                                    {c.name}
                                  </p>
                                  <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                    nº {c.number}
                                  </p>
                                </div>
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-gray-900 dark:text-gray-100">
                                {c.costCenter?.name || c.costCenter?.code || '-'}
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-right font-medium text-green-600 dark:text-green-400">
                                {formatCurrency(c.faturamentoAcumulado)}
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-right font-medium text-emerald-500/90 dark:text-emerald-400/90">
                                {c.faturamentoAnualAplica === false ? (
                                  <span className="text-gray-400 dark:text-gray-500">—</span>
                                ) : (
                                  formatCurrency(c.faturamentoAnual)
                                )}
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-center">
                                <span className="inline-flex items-center gap-1 text-gray-900 dark:text-gray-100">
                                  <BarChart3 className="h-4 w-4 text-amber-500" />
                                  {formatCurrency(c.totalProducaoSemanal)}
                                </span>
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-right font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(c.valorOrcado)}
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-right font-medium text-amber-700 dark:text-amber-400">
                                {formatCurrency(c.pendenteFaturamento)}
                              </td>
                              <td className="px-3 sm:px-6 py-4 text-right">
                                <Link
                                  href={`/ponto/contratos/${c.id}`}
                                  className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Ver
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>

                        <tfoot className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          <tr className="font-semibold">
                            <td colSpan={2} className="px-3 sm:px-6 py-4 text-gray-900 dark:text-gray-100">
                              Total ({totalFiltered} {totalFiltered === 1 ? 'contrato' : 'contratos'})
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-right text-green-600 dark:text-green-400">
                              {formatCurrency(totals.faturamentoAcumulado)}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-right text-emerald-500/90 dark:text-emerald-400/90">
                              {filterYear == null ? (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              ) : (
                                formatCurrency(totals.faturamentoAnual)
                              )}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-center text-gray-900 dark:text-gray-100">
                              {formatCurrency(totals.totalProducaoSemanal)}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-right text-gray-900 dark:text-gray-100">
                              {formatCurrency(totals.valorOrcado)}
                            </td>
                            <td className="px-3 sm:px-6 py-4 text-right text-amber-700 dark:text-amber-400">
                              {formatCurrency(totals.pendenteFaturamento)}
                            </td>
                            <td className="px-3 sm:px-6 py-4" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {totalPages > 1 ? (
                      <div className="mt-6 flex items-center justify-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                        >
                          Anterior
                        </button>

                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const pageNumber = i + 1;
                          const isActive = pageNumber === currentPage;
                          return (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={() => setCurrentPage(pageNumber)}
                              className={`rounded-md px-3 py-2 text-sm font-medium ${
                                isActive
                                  ? 'bg-red-600 text-white'
                                  : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                        >
                          Próxima
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {isFiltersModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              aria-hidden
              onClick={() => setIsFiltersModalOpen(false)}
            />
            <div className="relative mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar filtros"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-4">
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Ano
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value === '' ? '' : parseInt(e.target.value, 10));
                    setCurrentPage(1);
                  }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="">Todos</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={clearYearFilters}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <RotateCcw className="h-4 w-4" />
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}
