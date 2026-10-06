'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Download, Layers, Loader2, Plus, Ruler, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import api from '@/lib/api';
import { exportHabilitacoesPendentesPdf } from '@/lib/exportHabilitacoesPendentesPdf';

type HabilitacaoStatus = 'PENDENTE' | 'ADQUIRIDA';
type StatusFilter = 'PENDENTE' | 'ADQUIRIDA' | 'TODAS';

type HabilitacaoPendente = {
  id: string;
  titulo: string;
  acaoSugerida: string;
  quantidade?: number | null;
  unidadeMedida?: string | null;
  status: HabilitacaoStatus;
  adquiridaEm?: string | null;
  createdByName?: string;
  createdAt?: string;
};

const UNIDADES_MEDIDA = ['un', 'm', 'm²', 'm³', 'kg', 't', 'L', 'h', 'vb', 'cj', 'pç', 'km'];

function parseQuantidadeInput(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  let normalized = text.replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatQuantidade(quantidade?: number | null, unidade?: string | null): string {
  const unidadeLabel = unidade?.trim() || '';
  if (quantidade == null && !unidadeLabel) return '';
  const qty =
    quantidade == null
      ? ''
      : quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  return [qty, unidadeLabel].filter(Boolean).join(' ');
}

const QUERY_KEY = ['licitacoes-habilitacoes-pendentes'] as const;

const fieldClassName =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const labelClassName =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

function statusLabel(status: HabilitacaoStatus): string {
  return status === 'ADQUIRIDA' ? 'Habilitação adquirida' : 'Habilitação pendente';
}

export function LicitacaoHabilitacaoPendentePanel() {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [unidadeMedida, setUnidadeMedida] = useState('');
  const [acaoSugerida, setAcaoSugerida] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDENTE');
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await api.get('/licitacoes/habilitacoes-pendentes');
      return (res.data?.data ?? []) as HabilitacaoPendente[];
    },
  });

  const pendingCount = useMemo(
    () => items.filter((item) => item.status === 'PENDENTE').length,
    [items]
  );
  const acquiredCount = items.length - pendingCount;
  const visibleItems = useMemo(() => {
    if (statusFilter === 'TODAS') return items;
    return items.filter((item) => item.status === statusFilter);
  }, [items, statusFilter]);

  const quadroTitulo =
    statusFilter === 'ADQUIRIDA'
      ? 'Habilitações adquiridas'
      : statusFilter === 'TODAS'
        ? 'Todas as habilitações'
        : 'Habilitações pendentes';

  const handleExportPdf = async () => {
    if (visibleItems.length === 0) {
      toast.error('Não há habilitações para exportar neste quadro.');
      return;
    }
    setExportingPdf(true);
    try {
      await exportHabilitacoesPendentesPdf({
        titulo: quadroTitulo,
        items: visibleItems.map((item) => ({
          descricao: item.titulo,
          quantidade:
            item.quantidade == null
              ? ''
              : item.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 }),
          unidade: item.unidadeMedida?.trim() || '',
          acaoSugerida: item.acaoSugerida,
          status: statusLabel(item.status),
        })),
      });
      toast.success('PDF gerado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/licitacoes/habilitacoes-pendentes', {
        titulo: titulo.trim(),
        quantidade: parseQuantidadeInput(quantidade),
        unidadeMedida: unidadeMedida.trim(),
        acaoSugerida: acaoSugerida.trim(),
      });
      return res.data?.data as HabilitacaoPendente;
    },
    onSuccess: async () => {
      setTitulo('');
      setQuantidade('');
      setUnidadeMedida('');
      setAcaoSugerida('');
      setStatusFilter('PENDENTE');
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Habilitação cadastrada.');
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível cadastrar.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; status?: HabilitacaoStatus; titulo?: string; acaoSugerida?: string }) => {
      const res = await api.patch(`/licitacoes/habilitacoes-pendentes/${input.id}`, input);
      return res.data?.data as HabilitacaoPendente;
    },
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(
        updated?.status === 'ADQUIRIDA'
          ? 'Status alterado para Habilitação adquirida.'
          : 'Habilitação atualizada.'
      );
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível atualizar.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/licitacoes/habilitacoes-pendentes/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Habilitação removida.');
    },
    onError: () => toast.error('Não foi possível remover.'),
  });

  const handleCreate = () => {
    if (
      titulo.trim().length < 2 ||
      acaoSugerida.trim().length < 2 ||
      parseQuantidadeInput(quantidade) == null ||
      !unidadeMedida.trim()
    ) {
      toast.error('Informe a descrição, a quantidade, a unidade de medida e a ação sugerida.');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FilterStatCard
          size="sm"
          label="Pendentes"
          count={pendingCount}
          icon={Clock}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-700 dark:text-amber-300"
          isActive={statusFilter === 'PENDENTE'}
          loading={isLoading}
          onClick={() => setStatusFilter('PENDENTE')}
        />
        <FilterStatCard
          size="sm"
          label="Adquiridas"
          count={acquiredCount}
          icon={CheckCircle2}
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconColor="text-emerald-700 dark:text-emerald-300"
          isActive={statusFilter === 'ADQUIRIDA'}
          loading={isLoading}
          onClick={() => setStatusFilter('ADQUIRIDA')}
        />
        <FilterStatCard
          size="sm"
          label="Todas"
          count={items.length}
          icon={Layers}
          iconBg="bg-gray-100 dark:bg-gray-800"
          iconColor="text-gray-700 dark:text-gray-200"
          isActive={statusFilter === 'TODAS'}
          loading={isLoading}
          onClick={() => setStatusFilter('TODAS')}
        />
      </div>

      <Card>
        <CardHeader className="border-b-0 pb-2">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
              <ShieldAlert className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Habilitação Pendente
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Cadastre as habilitações que a empresa ainda não possui e a ação sugerida para
                corrigir. Quando a habilitação for obtida, altere o status para Habilitação
                adquirida.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_8rem_9rem_minmax(0,1fr)]">
            <label className="block">
              <span className={labelClassName}>Descrição</span>
              <input
                value={titulo}
                onChange={(event) => setTitulo(event.target.value)}
                placeholder="Ex.: Certidão de acervo técnico de impermeabilização"
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Quantidade</span>
              <input
                value={quantidade}
                onChange={(event) => setQuantidade(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={fieldClassName}
              />
            </label>
            <label className="block">
              <span className={labelClassName}>Unidade de medida</span>
              <input
                value={unidadeMedida}
                onChange={(event) => setUnidadeMedida(event.target.value)}
                list="habilitacao-unidades-medida"
                placeholder="Ex.: m²"
                className={fieldClassName}
              />
              <datalist id="habilitacao-unidades-medida">
                {UNIDADES_MEDIDA.map((unidade) => (
                  <option key={unidade} value={unidade} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className={labelClassName}>Ação sugerida</span>
              <input
                value={acaoSugerida}
                onChange={(event) => setAcaoSugerida(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleCreate();
                  }
                }}
                placeholder="Ex.: Contratar serviço e emitir CAT"
                className={fieldClassName}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Cadastrar
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className={`border-b pb-4 ${
            statusFilter === 'ADQUIRIDA'
              ? 'border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30'
              : statusFilter === 'TODAS'
                ? 'border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-800/40'
                : 'border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`rounded-xl p-2.5 ${
                statusFilter === 'ADQUIRIDA'
                  ? 'bg-emerald-100 dark:bg-emerald-900/40'
                  : statusFilter === 'TODAS'
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'bg-amber-100 dark:bg-amber-900/40'
              }`}
            >
              {statusFilter === 'ADQUIRIDA' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-700 dark:text-emerald-300" aria-hidden />
              ) : statusFilter === 'TODAS' ? (
                <Layers className="h-6 w-6 text-gray-700 dark:text-gray-200" aria-hidden />
              ) : (
                <ShieldAlert className="h-6 w-6 text-amber-700 dark:text-amber-200" aria-hidden />
              )}
            </div>
            <h2
              className={`text-2xl font-bold tracking-tight ${
                statusFilter === 'ADQUIRIDA'
                  ? 'text-emerald-900 dark:text-emerald-100'
                  : statusFilter === 'TODAS'
                    ? 'text-gray-900 dark:text-gray-50'
                    : 'text-amber-950 dark:text-amber-50'
              }`}
            >
              {quadroTitulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={exportingPdf || isLoading || visibleItems.length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF'}
          </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Carregando habilitações…
            </div>
          ) : isError ? (
            <p className="py-14 text-center text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar as habilitações. Confirme se a atualização do banco já foi
              aplicada.
            </p>
          ) : visibleItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="rounded-2xl bg-gray-100 p-3 dark:bg-gray-800">
                <ShieldAlert className="h-5 w-5 text-gray-400" aria-hidden />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma habilitação neste filtro.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleItems.map((item) => {
                const acquired = item.status === 'ADQUIRIDA';
                const quantidadeLabel = formatQuantidade(item.quantidade, item.unidadeMedida);
                return (
                  <li
                    key={item.id}
                    className={`rounded-2xl border p-4 ${
                      acquired
                        ? 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                        : 'border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-950/30'
                    }`}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {item.titulo}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
                              acquired
                                ? 'bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-amber-100 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950/70 dark:text-amber-100'
                            }`}
                          >
                            {acquired ? null : <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />}
                            {statusLabel(item.status)}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-start gap-3">
                          {quantidadeLabel ? (
                            <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                              <Ruler className="h-4 w-4 text-gray-400" aria-hidden />
                              <div>
                                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                  Quantidade
                                </p>
                                <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                  {quantidadeLabel}
                                </p>
                              </div>
                            </div>
                          ) : null}
                          <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                              Ação sugerida
                            </p>
                            <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">{item.acaoSugerida}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              id: item.id,
                              status: acquired ? 'PENDENTE' : 'ADQUIRIDA',
                            })
                          }
                          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                            acquired
                              ? 'border border-gray-300 text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                              : 'border border-gray-300 bg-transparent text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          {acquired ? 'Voltar para pendente' : 'Marcar como adquirida'}
                        </button>
                        <button
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Remover “${item.titulo}”?`)) {
                              deleteMutation.mutate(item.id);
                            }
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          aria-label={`Remover ${item.titulo}`}
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
