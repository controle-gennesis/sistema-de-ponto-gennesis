'use client';

import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, BookOpen, ChevronLeft, ChevronRight, ClipboardCheck, Plus, TriangleAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { PageStack } from '@/components/ui/pageLayout';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { usePermissions } from '@/hooks/usePermissions';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';

type DiarioRow = {
  id: string;
  date: string;
  noActivity: boolean;
  noActivityReason: string | null;
  finalizedAt: string | null;
  activities: number;
  workers: number;
  occurrences: number;
  updatedAt: string;
  updatedByName: string;
};

const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const todayIso = () => {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth(), n.getDate());
};
const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
};
const brDateTime = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ObraDoContratoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string; obraId: string }>();
  const contractId = String(params?.id ?? '');
  const obraId = String(params?.obraId ?? '');
  const { can, isAdministrator } = usePermissions();
  const canDiario = isAdministrator || can(pathToModuleKey('/ponto/diario-obra'));
  const { canDelete } = useCadastroCrudPermissions('/ponto/diario-obra');

  const today = todayIso();
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m0: n.getMonth() };
  });
  // Hoje a obra só tem a aba do Diário; novas abas entram aqui.
  const [tab, setTab] = useState<'diario'>('diario');
  const [deleteRow, setDeleteRow] = useState<DiarioRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const [creating, setCreating] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: obraData, isLoading: loadingObra } = useQuery({
    queryKey: ['obra-detalhe', obraId],
    enabled: !!obraId,
    queryFn: async () => (await api.get(`/obras/${obraId}`)).data?.data ?? null,
  });
  const obra: { name?: string; contratoId?: string; contratoNome?: string } | null = obraData ?? null;

  useBreadcrumbEntity(
    obra?.name ? { label: obra.name, href: `/ponto/contratos/${contractId}/obras/${obraId}` } : null,
    { priority: 1 },
  );

  const monthStart = toIso(month.y, month.m0, 1);
  const daysInMonth = new Date(month.y, month.m0 + 1, 0).getDate();
  const monthEnd = toIso(month.y, month.m0, daysInMonth);

  const { data: listData, isLoading: loadingList } = useQuery({
    queryKey: ['diario-obra-list', 'obra', obraId, monthStart],
    enabled: !!obraId && canDiario,
    queryFn: async () =>
      (await api.get('/diario-obra', { params: { obraId, from: monthStart, to: monthEnd, limit: 100 } })).data,
  });
  const rows: DiarioRow[] = useMemo(() => listData?.data ?? [], [listData]);
  const byDate = useMemo(() => new Map(rows.map((r) => [r.date, r])), [rows]);

  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(rows);

  const deleteMutation = useMutation({
    mutationFn: async (row: DiarioRow) => api.delete(`/diario-obra/${obraId}/${row.date}`),
    onSuccess: () => {
      toast.success('Diário de obra excluído.');
      setDeleteRow(null);
      void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });
      void queryClient.invalidateQueries({ queryKey: ['diario-obra-month'] });
    },
    onError: () => toast.error('Não foi possível excluir o diário de obra.'),
  });

  const stats = useMemo(
    () => ({
      total: rows.length,
      work: rows.filter((r) => !r.noActivity).length,
      none: rows.filter((r) => r.noActivity).length,
      occurrences: rows.reduce((t, r) => t + r.occurrences, 0),
    }),
    [rows],
  );

  const shiftMonth = (delta: number) =>
    setMonth((m) => {
      const d = new Date(m.y, m.m0 + delta, 1);
      return { y: d.getFullYear(), m0: d.getMonth() };
    });

  const openDay = (iso: string) => router.push(`/ponto/contratos/${contractId}/obras/${obraId}/diario/${iso}`);

  const createDiario = async () => {
    if (!newDate) {
      toast.error('Selecione a data.');
      return;
    }
    if (newDate > today) {
      toast.error('Não é possível criar um diário em data futura.');
      return;
    }
    setCreating(true);
    try {
      const existing = await api.get(`/diario-obra/${obraId}/${newDate}`);
      if (existing.data?.data) {
        toast.error('Já existe um diário para esta obra nesta data.');
        return;
      }
      await api.put(`/diario-obra/${obraId}/${newDate}`, { noActivity: false });
      toast.success('Diário de obra criado.');
      setShowNew(false);
      void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });
      // Mostra o mês do diário criado, para ele aparecer na lista
      const [y, m] = newDate.split('-').map(Number);
      setMonth({ y, m0: m - 1 });
    } catch {
      toast.error('Não foi possível criar o diário de obra.');
    } finally {
      setCreating(false);
    }
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
        <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos" contractId={contractId}>
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {loadingObra ? 'Obra' : obra?.name || 'Obra'}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                {obra?.contratoNome || 'Obra do contrato'}
              </p>
            </div>
          </div>

          {obra && canDiario ? (
            <AppUnderlineTabList aria-label="Seções da obra" centered={false} className="mt-1">
              <AppUnderlineTabButton
                active={tab === 'diario'}
                onClick={() => setTab('diario')}
                className="whitespace-nowrap px-3 py-2.5 text-sm"
              >
                Diários de Obra
              </AppUnderlineTabButton>
            </AppUnderlineTabList>
          ) : null}

          {!loadingObra && !obra ? (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              Obra não encontrada.
            </p>
          ) : !canDiario ? (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              Você não tem acesso aos Diários de Obra.
            </p>
          ) : (
            <>
              {/* Indicadores do mês */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                <FilterStatCard
                  label="Diários no Mês"
                  count={stats.total}
                  icon={BookOpen}
                  iconBg="bg-red-100 dark:bg-red-900/30"
                  iconColor="text-red-600 dark:text-red-400"
                  loading={loadingList}
                />
                <FilterStatCard
                  label="Com atividade"
                  count={stats.work}
                  icon={ClipboardCheck}
                  iconBg="bg-green-100 dark:bg-green-900/30"
                  iconColor="text-green-600 dark:text-green-400"
                  loading={loadingList}
                />
                <FilterStatCard
                  label="Sem atividade"
                  count={stats.none}
                  icon={Ban}
                  iconBg="bg-red-100 dark:bg-red-900/30"
                  iconColor="text-red-600 dark:text-red-400"
                  loading={loadingList}
                />
                <FilterStatCard
                  label="Ocorrências"
                  count={stats.occurrences}
                  icon={TriangleAlert}
                  iconBg="bg-amber-100 dark:bg-amber-900/30"
                  iconColor="text-amber-600 dark:text-amber-400"
                  loading={loadingList}
                />
              </div>

              {/* Calendário do mês */}
              <Card className="min-w-0">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                        <BookOpen className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                          Calendário
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          Registros diários da obra
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" /> Com atividade
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <X className="h-3 w-3 text-red-600 dark:text-red-400" strokeWidth={3} /> Sem atividade
                        </span>
                      </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => shiftMonth(-1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        aria-label="Mês anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300 sm:min-w-[8.5rem]">
                        {MONTH_NAMES[month.m0]} de {month.y}
                      </span>
                      <button
                        type="button"
                        onClick={() => shiftMonth(1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        aria-label="Próximo mês"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0">
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const iso = toIso(month.y, month.m0, d);
                      const wd = new Date(month.y, month.m0, d).getDay();
                      const future = iso > today;
                      const weekend = wd === 0 || wd === 6;
                      const row = byDate.get(iso);
                      // verde = teve atividade; vermelho = sem atividade; sem cor = ainda não registrado
                      const status: 'work' | 'none' | null = row ? (row.noActivity ? 'none' : 'work') : null;
                      const tone =
                        status === 'work'
                          ? 'text-green-700 dark:text-green-400'
                          : status === 'none'
                            ? 'text-red-600 dark:text-red-400'
                            : null;
                      // Hoje: sem fundo colorido, só o círculo — verde (teve atividade), vermelho (sem atividade) ou cinza (não começou)
                      const isToday = iso === today;
                      const ringHoje = !isToday
                        ? ''
                        : status === 'work'
                          ? 'ring-1 ring-green-600 dark:ring-green-400'
                          : status === 'none'
                            ? 'ring-1 ring-red-600 dark:ring-red-400'
                            : 'ring-1 ring-gray-400 dark:ring-gray-500';
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={future}
                          onClick={() => openDay(iso)}
                          aria-label={`${d} de ${MONTH_NAMES[month.m0]}`}
                          className={`flex min-w-9 flex-1 flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                            future ? 'cursor-not-allowed opacity-40' : ''
                          } ${
                            isToday
                              ? future
                                ? ''
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                              : status === 'work'
                              ? `bg-green-100 dark:bg-green-900/30 ${future ? '' : 'hover:bg-green-200 dark:hover:bg-green-900/50'}`
                              : status === 'none'
                                ? `bg-red-100 dark:bg-red-900/30 ${future ? '' : 'hover:bg-red-200 dark:hover:bg-red-900/50'}`
                                : weekend
                                  ? `bg-gray-100 dark:bg-gray-800 ${future ? '' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`
                                  : future
                                    ? ''
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className={`font-medium ${tone ?? 'text-gray-500'}`}>{WEEKDAY_LETTER[wd]}</span>
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                              tone
                                ? `font-semibold ${tone}`
                                : iso === today
                                  ? 'font-bold text-gray-900 dark:text-gray-100'
                                  : 'text-gray-800 dark:text-gray-200'
                            } ${ringHoje}`}
                          >
                            {d}
                          </span>
                          <span className="flex h-3 items-center justify-center">
                            {status === 'none' ? (
                              <X className="h-3 w-3 text-red-600 dark:text-red-400" strokeWidth={3} aria-label="Sem atividade" />
                            ) : (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  status === 'work' ? 'bg-green-600 dark:bg-green-400' : 'bg-transparent'
                                }`}
                              />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Lista do mês */}
              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div className={cadastroListClasses.cardHeaderIconRow}>
                      <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                        <ClipboardCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Diários do Mês</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{rows.length} registrado(s)</p>
                      </div>
                    </div>
                    <div className={cadastroListClasses.cardToolbar}>
                      <button
                        type="button"
                        onClick={() => {
                          setNewDate(today);
                          setShowNew(true);
                        }}
                        className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>Novo Diário de Obra</span>
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className={cadastroListClasses.cardContent}>
                  {loadingList ? (
                    <CadastroListLoading message="Carregando diários de obra..." />
                  ) : rows.length === 0 ? (
                    <CadastroListEmpty
                      icon={BookOpen}
                      title="Nenhum diário neste mês"
                      hint='Clique em um dia do calendário ou em "Novo Diário de Obra"'
                    />
                  ) : (
                    <div className="table-scroll">
                      <table className={cadastroListClasses.table}>
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.th}>Data</th>
                            <th className={`${cadastroListClasses.th} !text-center`}>Situação</th>
                            <th className={`${cadastroListClasses.th} !text-center`}>Atividades</th>
                            <th className={`${cadastroListClasses.th} !text-center`}>Equipe</th>
                            <th className={`${cadastroListClasses.th} !text-center`}>Ocorrências</th>
                            <th className={`${cadastroListClasses.th} !text-center`}>Atualizado</th>
                            {canDelete ? <th className={cadastroListClasses.thRight}>Ação</th> : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {rows.map((it) => (
                            <tr
                              key={it.id}
                              className={getListTableRowClassName(true)}
                              onClick={() => openDay(it.date)}
                            >
                              <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                                <ListRowNavigableLabel className="block font-medium">{brDate(it.date)}</ListRowNavigableLabel>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{weekdayOf(it.date)}</span>
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-center sm:px-6">
                                <span
                                  title={it.noActivity ? it.noActivityReason || undefined : undefined}
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                    it.finalizedAt
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                      : it.noActivity
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                        : it.activities > 0
                                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                  }`}
                                >
                                  {it.finalizedAt
                                    ? 'Finalizado'
                                    : it.noActivity
                                      ? 'Sem atividade'
                                      : it.activities > 0
                                        ? 'Preenchido'
                                        : 'Em branco'}
                                </span>
                              </td>
                              <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                                {it.activities}
                              </td>
                              <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                                {it.workers}
                              </td>
                              <td className="px-3 py-4 text-center text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                                {it.occurrences}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4 text-center sm:px-6">
                                <span className="block text-sm text-gray-900 dark:text-gray-100">
                                  {brDateTime(it.updatedAt)}
                                </span>
                                {it.updatedByName ? (
                                  <span className="block text-xs text-gray-500 dark:text-gray-400">{it.updatedByName}</span>
                                ) : null}
                              </td>
                              {canDelete ? (
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(it.id)}
                                  onToggle={(e) => {
                                    e.stopPropagation();
                                    toggleRowActionMenu(it.id, e.currentTarget as HTMLButtonElement);
                                  }}
                                />
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onDelete={canDelete ? () => setDeleteRow(rowForActionMenu) : undefined}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </>
          )}
        </PageStack>

        {deleteRow ? (
          <Modal
            isOpen
            onClose={() => setDeleteRow(null)}
            title="Excluir diário de obra"
            size="sm"
            footer={
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteRow(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(deleteRow)}
                  disabled={deleteMutation.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  Excluir
                </button>
              </div>
            }
          >
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Excluir o diário de {brDate(deleteRow.date)}? Todo o conteúdo do dia será perdido e não dá para desfazer.
            </p>
          </Modal>
        ) : null}

        {showNew ? (
          <Modal
            isOpen
            onClose={() => setShowNew(false)}
            title="Novo Diário de Obra"
            size="sm"
            contentOverflowVisible
            footer={
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void createDiario()}
                  disabled={creating}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar'}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Data <span className="text-red-600 dark:text-red-400">*</span></label>
                <DatePickerField value={newDate} onChange={setNewDate} max={today} />
              </div>
            </div>
          </Modal>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
