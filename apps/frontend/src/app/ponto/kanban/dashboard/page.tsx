'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Inbox } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { useTheme } from '@/context/ThemeContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import api from '@/lib/api';
import { safeLabelHex } from '@/components/kanban/KanbanLabelColorPicker';

type DashboardData = {
  boards: Array<{ id: string; name: string; department: string }>;
  summary: { total: number; open: number; completed: number; overdue: number; dueSoon: number; noDueDate: number };
  byColumn: Array<{ title: string; color: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byAssignee: Array<{ userId: string | null; name: string; open: number; completed: number; overdue: number }>;
  weekly: Array<{ weekStart: string; created: number; completed: number; avgDays: number | null }>;
  byLabel: Array<{ text: string; color: string; count: number }>;
  byBoard: Array<{ name: string; onTime: number; overdue: number; completed: number }>;
  aging: Array<{ label: string; count: number }>;
  overdueList: Array<{
    id: string;
    title: string;
    board: string;
    column: string;
    dueDate: string;
    daysLate: number;
    priority: string;
    assignees: string[];
  }>;
};

type CardGroup = 'total' | 'open' | 'completed' | 'overdue' | 'dueSoon';
const GROUP_LABEL: Record<CardGroup, string> = {
  total: 'Todas as tasks',
  open: 'Em aberto',
  completed: 'Concluídas',
  overdue: 'Atrasadas',
  dueSoon: 'Vencem em 7 dias',
};
type GroupCard = {
  id: string;
  title: string;
  board: string;
  boardDepartment: string;
  boardDepartmentKey: string;
  columnId: string;
  column: string;
  dueDate: string | null;
  priority: string;
  completed: boolean;
  assignees: string[];
};

const PRIORITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const shortLabel = (v: unknown) => {
  const t = String(v ?? '');
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
};

const selectClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

export default function KanbanDashboardPage() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { user: meUser, isLoading: loadingPerms } = usePermissions();
  const [boardId, setBoardId] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [group, setGroup] = useState<CardGroup | null>(null);

  useDocumentTitle('Dashboard de Tasks');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['kanban-dashboard', boardId, assigneeUserId],
    queryFn: async () => {
      const res = await api.get('/kanban-dashboard', {
        params: { boardId: boardId || undefined, assigneeUserId: assigneeUserId || undefined },
      });
      return res.data?.data as DashboardData;
    },
    enabled: !!meUser,
    staleTime: 30_000,
  });

  const { data: groupData, isLoading: loadingGroup } = useQuery({
    queryKey: ['kanban-dashboard-cards', group, boardId, assigneeUserId],
    queryFn: async () => {
      const res = await api.get('/kanban-dashboard/cards', {
        params: { group, boardId: boardId || undefined, assigneeUserId: assigneeUserId || undefined },
      });
      return res.data?.data as { total: number; cards: GroupCard[] };
    },
    enabled: !!meUser && !!group,
    staleTime: 30_000,
  });
  const toggleGroup = (g: CardGroup) => setGroup((cur) => (cur === g ? null : g));

  // Lista de pessoas do filtro: sempre a do quadro inteiro (sem filtro de pessoa), senão o seletor some ao filtrar.
  const { data: peopleData } = useQuery({
    queryKey: ['kanban-dashboard-people', boardId],
    queryFn: async () => {
      const res = await api.get('/kanban-dashboard', { params: { boardId: boardId || undefined } });
      return (res.data?.data as DashboardData).byAssignee;
    },
    enabled: !!meUser,
    staleTime: 60_000,
  });

  const c = {
    tick: isDark ? '#9ca3af' : '#6b7280',
    grid: isDark ? '#374151' : '#e5e7eb',
    created: isDark ? '#60a5fa' : '#2563eb',
    completed: isDark ? '#34d399' : '#059669',
    open: isDark ? '#60a5fa' : '#2563eb',
    overdue: isDark ? '#f87171' : '#dc2626',
    tooltipBg: isDark ? '#111827' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
  };
  const tooltipStyle = {
    backgroundColor: c.tooltipBg,
    border: `1px solid ${c.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
    color: isDark ? '#f3f4f6' : '#111827',
  };

  const weekly = useMemo(
    () =>
      (data?.weekly ?? []).map((w) => ({
        ...w,
        label: format(new Date(`${w.weekStart}T12:00:00`), 'dd/MM', { locale: ptBR }),
      })),
    [data?.weekly],
  );
  const statusDonut = useMemo(() => {
    const sm = data?.summary;
    if (!sm) return [];
    return [
      { name: 'Em dia', value: Math.max(0, sm.open - sm.overdue), fill: c.open },
      { name: 'Atrasadas', value: sm.overdue, fill: c.overdue },
      { name: 'Concluídas', value: sm.completed, fill: c.completed },
    ].filter((x) => x.value > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.summary, isDark]);
  const priorities = useMemo(
    () =>
      PRIORITY_ORDER.map((p) => ({
        label: PRIORITY_LABEL[p] ?? p,
        count: data?.byPriority.find((x) => x.priority === p)?.count ?? 0,
      })),
    [data?.byPriority],
  );

  if (loadingPerms || !meUser) return <Loading message="Verificando sessão..." fullScreen size="lg" />;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };
  const s = data?.summary;
  const completionPct = s && s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;

  return (
    <MainLayout userRole={meUser.role} userName={meUser.name} onLogout={handleLogout}>
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/ponto/kanban"
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para Tasks
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard de Tasks</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className={selectClass} aria-label="Quadro">
              <option value="">Todos os quadros</option>
              {(data?.boards ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.department}
                </option>
              ))}
            </select>
            <select
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
              className={selectClass}
              aria-label="Responsável"
            >
              <option value="">Todas as pessoas</option>
              {(peopleData ?? [])
                .filter((p) => p.userId)
                .map((p) => (
                  <option key={p.userId!} value={p.userId!}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {isError ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-600 dark:text-gray-400">
              Não foi possível carregar o dashboard. Tente atualizar a página.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <FilterStatCard
                label="Total"
                isActive={group === 'total'}
                onClick={() => toggleGroup('total')}
                count={s?.total ?? 0}
                loading={isLoading}
                icon={ClipboardList}
                iconBg="bg-blue-100 dark:bg-blue-900/30"
                iconColor="text-blue-600 dark:text-blue-300"
              />
              <FilterStatCard
                label="Em aberto"
                isActive={group === 'open'}
                onClick={() => toggleGroup('open')}
                count={s?.open ?? 0}
                loading={isLoading}
                icon={Inbox}
                iconBg="bg-amber-100 dark:bg-amber-900/30"
                iconColor="text-amber-600 dark:text-amber-300"
              />
              <FilterStatCard
                label="Concluídas"
                isActive={group === 'completed'}
                onClick={() => toggleGroup('completed')}
                count={s?.completed ?? 0}
                subtitle={s && s.total > 0 ? `${completionPct}% do total` : undefined}
                loading={isLoading}
                icon={CheckCircle2}
                iconBg="bg-emerald-100 dark:bg-emerald-900/30"
                iconColor="text-emerald-600 dark:text-emerald-300"
              />
              <FilterStatCard
                label="Atrasadas"
                isActive={group === 'overdue'}
                onClick={() => toggleGroup('overdue')}
                count={s?.overdue ?? 0}
                loading={isLoading}
                icon={AlertTriangle}
                iconBg="bg-red-100 dark:bg-red-900/30"
                iconColor="text-red-600 dark:text-red-300"
              />
              <FilterStatCard
                label="Vencem em 7 dias"
                isActive={group === 'dueSoon'}
                onClick={() => toggleGroup('dueSoon')}
                count={s?.dueSoon ?? 0}
                subtitle={s ? `${s.noDueDate} sem prazo` : undefined}
                loading={isLoading}
                icon={CalendarClock}
                iconBg="bg-violet-100 dark:bg-violet-900/30"
                iconColor="text-violet-600 dark:text-violet-300"
              />
            </div>

            {group && (
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {GROUP_LABEL[group]}
                      {groupData ? ` (${groupData.total})` : ''}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setGroup(null)}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Fechar lista
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingGroup ? (
                    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Carregando…</p>
                  ) : (groupData?.cards.length ?? 0) === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma task neste grupo.</p>
                  ) : (
                    <>
                      <div className="max-h-[480px] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-white dark:bg-gray-800">
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                              <th className="py-2 pr-3 font-medium">Task</th>
                              <th className="px-3 py-2 font-medium">Quadro / coluna</th>
                              <th className="px-3 py-2 font-medium">Responsável</th>
                              <th className="px-3 py-2 font-medium">Prioridade</th>
                              <th className="py-2 pl-3 font-medium">Prazo</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {groupData!.cards.map((t) => (
                              <tr
                                key={t.id}
                                onClick={() =>
                                  router.push(
                                    `/ponto/kanban?departmentKey=${encodeURIComponent(t.boardDepartmentKey)}&cardId=${encodeURIComponent(t.id)}`,
                                  )
                                }
                                className="cursor-pointer text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/40"
                              >
                                <td className="max-w-[360px] truncate py-2 pr-3 font-medium">{t.title}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                  {t.board} · {t.boardDepartment} · {t.column}
                                </td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                  {t.assignees.length ? t.assignees.join(', ') : '—'}
                                </td>
                                <td className="px-3 py-2">{PRIORITY_LABEL[t.priority] ?? t.priority}</td>
                                <td className="py-2 pl-3 tabular-nums">
                                  {t.dueDate ? format(new Date(t.dueDate), 'dd/MM/yyyy') : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {groupData && groupData.total > groupData.cards.length && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Mostrando as {groupData.cards.length} primeiras de {groupData.total}. Use os filtros de quadro e
                          pessoa para refinar.
                        </p>
                      )}
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Clique numa task para abrir o cartão no quadro.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Cartões por coluna</h2>
                </CardHeader>
                <CardContent>
                  <div style={{ height: Math.max(220, (data?.byColumn.length ?? 0) * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.byColumn ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid stroke={c.grid} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis type="category" dataKey="title" width={200} interval={0} tickFormatter={shortLabel} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                        <Bar dataKey="count" name="Cartões" fill={c.open} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Criadas × concluídas por semana
                  </h2>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weekly} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid stroke={c.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="created" name="Criadas" stroke={c.created} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="completed" name="Concluídas" stroke={c.completed} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Por pessoa</h2>
                </CardHeader>
                <CardContent>
                  <div style={{ height: Math.max(220, (data?.byAssignee.length ?? 0) * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.byAssignee ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid stroke={c.grid} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={200} interval={0} tickFormatter={shortLabel} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="open" name="Em aberto" stackId="a" fill={c.open} />
                        <Bar dataKey="overdue" name="Atrasadas" stackId="b" fill={c.overdue} />
                        <Bar dataKey="completed" name="Concluídas" stackId="c" fill={c.completed} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Em aberto por prioridade</h2>
                </CardHeader>
                <CardContent>
                  <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={priorities} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid stroke={c.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                        <Bar dataKey="count" name="Cartões" fill={c.open} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Situação geral</h2>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusDonut} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2} stroke="none">
                          {statusDonut.map((d) => (
                            <Cell key={d.name} fill={d.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tasks abertas por tempo parado</h2>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.aging ?? []} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid stroke={c.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                        <Bar dataKey="count" name="Tasks abertas" fill={c.open} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Conta desde a criação do cartão.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tempo médio até concluir (dias)</h2>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weekly} margin={{ left: 0, right: 16 }}>
                        <CartesianGrid stroke={c.grid} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => (v == null ? '—' : `${v} dias`)} />
                        <Line type="monotone" dataKey="avgDays" name="Média" stroke={c.completed} strokeWidth={2} connectNulls dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Semana da conclusão. Semanas sem conclusões ficam sem ponto.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Situação por quadro</h2>
                </CardHeader>
                <CardContent>
                  <div style={{ height: Math.max(220, (data?.byBoard.length ?? 0) * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.byBoard ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid stroke={c.grid} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={200} interval={0} tickFormatter={shortLabel} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="onTime" name="Em dia" stackId="s" fill={c.open} />
                        <Bar dataKey="overdue" name="Atrasadas" stackId="s" fill={c.overdue} />
                        <Bar dataKey="completed" name="Concluídas" stackId="s" fill={c.completed} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tasks por etiqueta</h2>
              </CardHeader>
              <CardContent>
                {(data?.byLabel.length ?? 0) === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma etiqueta usada nas tasks.</p>
                ) : (
                  <div style={{ height: Math.max(220, (data?.byLabel.length ?? 0) * 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data?.byLabel ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid stroke={c.grid} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: c.tick, fontSize: 12 }} />
                        <YAxis type="category" dataKey="text" width={200} interval={0} tickFormatter={shortLabel} tick={{ fill: c.tick, fontSize: 12 }} />
                        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.12)' }} />
                        <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]}>
                          {(data?.byLabel ?? []).map((l, i) => (
                            <Cell key={`${l.color}-${l.text}-${i}`} fill={safeLabelHex(l.color)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Atrasadas {s && s.overdue > 0 ? `(${s.overdue})` : ''}
                </h2>
              </CardHeader>
              <CardContent>
                {(data?.overdueList.length ?? 0) === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma task atrasada. Só entram aqui cartões com prazo vencido e ainda não concluídos.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <th className="py-2 pr-3 font-medium">Task</th>
                          <th className="px-3 py-2 font-medium">Quadro / coluna</th>
                          <th className="px-3 py-2 font-medium">Responsável</th>
                          <th className="px-3 py-2 font-medium">Prazo</th>
                          <th className="py-2 pl-3 text-right font-medium">Atraso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {data!.overdueList.map((t) => (
                          <tr key={t.id} className="text-gray-900 dark:text-gray-100">
                            <td className="max-w-[320px] truncate py-2 pr-3 font-medium">{t.title}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {t.board} · {t.column}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {t.assignees.length ? t.assignees.join(', ') : '—'}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{format(new Date(t.dueDate), 'dd/MM/yyyy')}</td>
                            <td className="py-2 pl-3 text-right tabular-nums text-red-600 dark:text-red-400">
                              {t.daysLate} {t.daysLate === 1 ? 'dia' : 'dias'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
}
