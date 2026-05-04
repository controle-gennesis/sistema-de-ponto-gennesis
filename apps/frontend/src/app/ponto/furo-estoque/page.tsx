'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronUp, Filter, PackageX, RotateCcw, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'ACABAMENTO',
  'ADMINISTRATIVO',
  'ALVENARIA',
  'COBERTURA',
  'COMUNICAÇÃO VISUAL',
  'ELÉTRICA',
  'EPI',
  'FERRAMENTAS',
  'GASES MEDICINAIS',
  'HIDRÁULICA',
  'IMPERMEABILIZAÇÃO',
  'INCÊNDIO',
  'MARCENARIA',
  'MARMORARIA',
  'MATERIAL DE EXPEDIENTE',
  'PAISAGISMO',
  'PINTURA',
  'REFRIGERAÇÃO',
  'SERRALHERIA',
  'TELECOMUNICAÇÕES',
  'VIDRAÇARIA'
] as const;

type ShortfallStatus = 'ABERTO' | 'RESOLVIDO';

type ShortfallRow = {
  id: string;
  orderNumber: string;
  status: ShortfallStatus;
  engineeringLabel: string;
  unit: string | null;
  orderedQty: unknown;
  receivedQty: unknown;
  gapQty: unknown;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  costCenter: { id: string; code: string; name: string } | null;
  constructionMaterial: { id: string; name: string; unit: string; category: string | null };
  purchaseOrder: {
    id: string;
    orderNumber: string;
    orderDate: string;
    supplier: { id: string; name: string } | null;
    materialRequest: {
      requestNumber: string;
      costCenter: { id: string; code: string; name: string } | null;
    } | null;
  };
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function FuroEstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filtersCostCenterId, setFiltersCostCenterId] = useState('');
  const [filtersCategory, setFiltersCategory] = useState('');
  const [filtersMonth, setFiltersMonth] = useState('');
  const [filtersYear, setFiltersYear] = useState(String(new Date().getFullYear()));
  const [filtersSearch, setFiltersSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ABERTO' | 'RESOLVIDO' | 'ALL'>('ABERTO');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [detail, setDetail] = useState<ShortfallRow | null>(null);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: costCentersData } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers');
      return res.data;
    }
  });

  const { data: shortfallsRes, isLoading: loadingShortfalls } = useQuery({
    queryKey: [
      'stock-shortfalls',
      filtersCostCenterId,
      filtersCategory,
      filtersMonth,
      filtersYear,
      filtersSearch,
      statusFilter
    ],
    queryFn: async () => {
      const res = await api.get('/stock/shortfalls', {
        params: {
          costCenterId: filtersCostCenterId || undefined,
          category: filtersCategory || undefined,
          month: filtersMonth || undefined,
          year: filtersYear || undefined,
          search: filtersSearch.trim() || undefined,
          status: statusFilter,
          limit: 300
        }
      });
      return res.data;
    }
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/stock/shortfalls/${id}/resolve`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-shortfalls'] });
      setDetail(null);
      toast.success('Furo encerrado como Resolvido.');
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e.response?.data?.message || e.message || 'Erro ao encerrar')
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const costCenters = Array.isArray(costCentersData?.data)
    ? costCentersData.data
    : Array.isArray(costCentersData)
      ? costCentersData
      : [];
  const rows: ShortfallRow[] = shortfallsRes?.data || [];

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/furo-estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Furo de estoque</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Materiais ainda não totalmente recebidos após entrada parcial na OC (diferença entre quantidade
              pedida e soma das entradas de estoque vinculadas à mesma OC).
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtros</h3>
                </div>
                <div className="flex items-center space-x-4">
                  {isFiltersExpanded && (
                    <button
                      type="button"
                      onClick={() => {
                        setFiltersCostCenterId('');
                        setFiltersCategory('');
                        setFiltersMonth('');
                        setFiltersYear(String(new Date().getFullYear()));
                        setFiltersSearch('');
                        setStatusFilter('ABERTO');
                      }}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                    className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {isFiltersExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </CardHeader>
            {isFiltersExpanded && (
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Centro de custo
                    </label>
                    <select
                      value={filtersCostCenterId}
                      onChange={(e) => setFiltersCostCenterId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Todos</option>
                      {costCenters.map((cc: { id: string; code: string; name: string }) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.code} - {cc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Categoria
                    </label>
                    <select
                      value={filtersCategory}
                      onChange={(e) => setFiltersCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Todas</option>
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mês</label>
                    <select
                      value={filtersMonth}
                      onChange={(e) => setFiltersMonth(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Todos</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(0, i).toLocaleString('pt-BR', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ano</label>
                    <select
                      value={filtersYear}
                      onChange={(e) => setFiltersYear(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Buscar (OC, material)
                    </label>
                    <input
                      type="text"
                      value={filtersSearch}
                      onChange={(e) => setFiltersSearch(e.target.value)}
                      placeholder="Nº OC ou nome do material..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Situação</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="ABERTO">Aberto</option>
                      <option value="RESOLVIDO">Resolvido</option>
                      <option value="ALL">Todos</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {rows.length} registro(s) exibidos
              {statusFilter === 'ABERTO' ? ' (situação: aberto).' : statusFilter === 'RESOLVIDO' ? ' (situação: resolvido).' : '.'}
            </span>
          </div>

          {loadingShortfalls ? (
            <Loading message="Carregando furos..." size="md" />
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500 dark:text-gray-400">
                Nenhum furo encontrado com os filtros atuais.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDetail(row)}
                  className="text-left rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm hover:border-red-400/60 dark:hover:border-red-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <PackageX className="w-5 h-5 text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {row.orderNumber}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {row.constructionMaterial.name}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        row.status === 'ABERTO'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                          : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                      }`}
                    >
                      {row.status === 'ABERTO' ? 'Aberto' : 'Resolvido'}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-red-600 dark:text-red-400">
                    Falta: {num(row.gapQty).toLocaleString('pt-BR')}{' '}
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {row.unit || row.constructionMaterial.unit}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Pedido {num(row.orderedQty).toLocaleString('pt-BR')} · Recebido{' '}
                    {num(row.receivedQty).toLocaleString('pt-BR')}
                  </p>
                </button>
              ))}
            </div>
          )}

          {detail && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Fechar"
                onClick={() => setDetail(null)}
              />
              <div className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2">
                    Detalhe do furo — {detail.orderNumber}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setDetail(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Situação</span>
                      <p className="font-medium">{detail.status === 'ABERTO' ? 'Aberto' : 'Resolvido'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Fornecedor</span>
                      <p className="font-medium">{detail.purchaseOrder.supplier?.name || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Requisição (SC)</span>
                      <p className="font-medium">
                        {detail.purchaseOrder.materialRequest?.requestNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Centro de custo (SC)</span>
                      <p className="font-medium">
                        {detail.purchaseOrder.materialRequest?.costCenter
                          ? `${detail.purchaseOrder.materialRequest.costCenter.code} — ${detail.purchaseOrder.materialRequest.costCenter.name}`
                          : detail.costCenter
                            ? `${detail.costCenter.code} — ${detail.costCenter.name}`
                            : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Material (estoque)</span>
                      <span className="font-medium">{detail.constructionMaterial.name}</span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Descrição na OC</span>
                      <span>{detail.engineeringLabel}</span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Categoria</span>
                      <span>{detail.constructionMaterial.category || '—'}</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Pedido</span>
                        <span className="font-semibold">{num(detail.orderedQty).toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Recebido</span>
                        <span className="font-semibold">{num(detail.receivedQty).toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block">Falta</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          {num(detail.gapQty).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Atualizado em {new Date(detail.updatedAt).toLocaleString('pt-BR')}
                    </p>
                    {detail.status === 'RESOLVIDO' && (
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        Resolvido em{' '}
                        {detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString('pt-BR') : '—'}
                        {detail.resolvedBy ? ` por ${detail.resolvedBy.name}` : ''}
                      </p>
                    )}
                  </div>
                  {detail.status === 'ABERTO' && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-end">
                      <button
                        type="button"
                        disabled={resolveMutation.isPending}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Encerrar este furo como Resolvido? Use quando a pendência foi tratada (ex.: acordo com fornecedor ou ajuste manual).'
                            )
                          ) {
                            return;
                          }
                          resolveMutation.mutate(detail.id);
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {resolveMutation.isPending ? 'Salvando…' : 'Encerrar como Resolvido'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
