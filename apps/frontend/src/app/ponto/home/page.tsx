'use client';

// Página padrão de entrada para todos os usuários autenticados (home minimalista).

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import api from '@/lib/api';
import { authService } from '@/lib/auth';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';
import { useLogout } from '@/hooks/useLogout';
import { fetchPlannerEvents, type PlannerEvent } from '@/lib/plannerEvents';
import {
  fetchPlannerTasks,
  toTimeInputValue,
  type PlannerTask,
} from '@/lib/plannerTasks';

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getStoredUserQueryData() {
  const stored = authService.getUser();
  if (!stored) return undefined;
  return { success: true, data: stored };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

type TodayItem = {
  id: string;
  kind: 'event' | 'task';
  title: string;
  sortAt: number;
  timeLabel: string;
  color?: string;
};

function buildTodayItems(events: PlannerEvent[], tasks: PlannerTask[]): TodayItem[] {
  const items: TodayItem[] = [];

  for (const ev of events) {
    const start = new Date(ev.startAt);
    if (Number.isNaN(start.getTime())) continue;
    items.push({
      id: `ev-${ev.id}`,
      kind: 'event',
      title: ev.title,
      sortAt: start.getTime(),
      timeLabel: start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      color: ev.color || '#3B82F6',
    });
  }

  for (const task of tasks) {
    if (!task.dueDate || task.completed) continue;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) continue;
    const time = toTimeInputValue(task.dueDate);
    items.push({
      id: `task-${task.id}`,
      kind: 'task',
      title: task.title,
      sortAt: due.getTime(),
      timeLabel: time || '—',
    });
  }

  return items.sort((a, b) => a.sortAt - b.sortAt);
}

export default function HomePage() {
  const handleLogout = useLogout();
  const { logoSrc, logoAlt } = useBrandingLogo();
  const [now, setNow] = useState<Date>(() => new Date());

  // Não bloqueia o shell: usa cache/storage e atualiza /auth/me em background
  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me', {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    placeholderData: () => getStoredUserQueryData(),
  });

  const todayRange = useMemo(() => {
    const from = startOfDay(now);
    return { from, to: addDays(from, 1) };
  }, [now]);

  const { data: todayEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['planner-events', 'home-today', todayRange.from.toISOString()],
    queryFn: async () => {
      const { events } = await fetchPlannerEvents(todayRange.from, todayRange.to);
      return events;
    },
    staleTime: 60_000,
  });

  const { data: todayTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['planner-tasks', 'home-today', todayRange.from.toISOString()],
    queryFn: () =>
      fetchPlannerTasks({
        from: todayRange.from,
        to: todayRange.to,
        withDue: true,
        includeCompleted: false,
      }),
    staleTime: 60_000,
  });

  const todayItems = useMemo(
    () => buildTodayItems(todayEvents, todayTasks),
    [todayEvents, todayTasks]
  );

  const agendaLoading = loadingEvents || loadingTasks;

  useEffect(() => {
    // Atualiza o relógio a cada minuto (suficiente para a home)
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const user = userData?.data || authService.getUser() || { name: 'Usuário', role: 'EMPLOYEE' };
  const firstName = (user?.name || 'Usuário').split(' ')[0] || 'Usuário';

  const greeting = getGreeting(now);

  const formattedDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    return capitalizeFirst(formatter.format(now));
  }, [now]);

  const formattedTime = useMemo(() => {
    return now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [now]);

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden">
        {/* Decoração de fundo: glow vermelho suave que segue o tema do app */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/3 h-[520px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/15" />
          <div className="absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400/10 blur-2xl dark:bg-red-500/10" />
        </div>

        <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
          {/* Logo */}
          <div className="animate-home-fade-in mb-10">
            <img
              src={logoSrc}
              alt={logoAlt}
              className="h-20 w-auto max-w-[240px] object-contain opacity-95 sm:h-24"
            />
          </div>

          {/* Saudação principal */}
          <section className="animate-home-fade-in">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400 sm:text-base">
              {greeting}
            </p>
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-6xl">
              <span className="text-red-600 dark:text-red-500">{firstName}</span>
              <span className="text-gray-900 dark:text-gray-100">!</span>
            </h1>
          </section>

          {/* Subtítulo de boas-vindas */}
          <p className="animate-home-slide-up mt-6 max-w-md text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg">
            Bem-vindo de volta ao seu painel. Que seja um dia produtivo.
          </p>

          {/* Linha divisória sutil */}
          <div className="animate-home-slide-up mt-10 h-px w-16 bg-gray-200 dark:bg-gray-700" />

          {/* Hora acima · Data abaixo */}
          <div className="animate-home-slide-up mt-8 flex flex-col items-center gap-1">
            <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
              {formattedTime}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 sm:text-base">
              {formattedDate}
            </span>
          </div>

          {/* Agenda de hoje */}
          <section className="animate-home-slide-up mt-10 w-full max-w-md text-left">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Na agenda hoje
              </h2>
              <Link
                href="/ponto/agenda"
                className="text-xs font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Abrir agenda
              </Link>
            </div>

            {agendaLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Carregando…</p>
            ) : todayItems.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nada marcado na agenda para hoje.
              </p>
            ) : (
              <ol className="relative ml-1 border-l border-gray-200 pl-5 dark:border-gray-700">
                {todayItems.map((item) => (
                  <li key={item.id} className="relative pb-5 last:pb-0">
                    <span
                      className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-gray-950"
                      style={{
                        backgroundColor:
                          item.kind === 'event' ? item.color || '#3B82F6' : '#F59E0B',
                      }}
                      aria-hidden
                    />
                    <Link href="/ponto/agenda" className="group block">
                      <div className="flex items-baseline gap-2">
                        <time className="font-mono text-xs font-semibold tabular-nums text-red-600 dark:text-red-400">
                          {item.timeLabel}
                        </time>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                          {item.kind === 'task' ? 'Tarefa' : 'Evento'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-gray-900 group-hover:text-red-600 dark:text-gray-100 dark:group-hover:text-red-400">
                        {item.title}
                      </p>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
