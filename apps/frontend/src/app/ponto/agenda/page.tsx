'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { KanbanPlannerView } from '@/components/kanban/KanbanPlannerView';
import { KanbanTasksView } from '@/components/kanban/KanbanTasksView';
import {
  AgendaModeSwitcher,
  type AgendaSurfaceMode,
} from '@/components/kanban/AgendaModeSwitcher';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermissions } from '@/hooks/usePermissions';

function AgendaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: meUser } = usePermissions();
  const [agendaView, setAgendaView] = useState<AgendaSurfaceMode>('planner');

  useEffect(() => {
    const viewParam = searchParams?.get('view');
    if (viewParam === 'tasks' || viewParam === 'planner') {
      setAgendaView(viewParam);
    }
  }, [searchParams]);

  useDocumentTitle(agendaView === 'tasks' ? 'Tarefas' : 'Agenda');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const setView = (next: AgendaSurfaceMode) => {
    setAgendaView(next);
    router.replace(next === 'tasks' ? '/ponto/agenda?view=tasks' : '/ponto/agenda');
  };

  const user = meUser || { name: 'Usuário', role: 'EMPLOYEE' };

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div
        className={
          agendaView === 'planner'
            ? 'flex h-[calc(100dvh-2rem)] flex-col overflow-hidden -mx-2 sm:-mx-4 lg:h-[calc(100dvh-4rem)]'
            : 'flex flex-col -mx-2 sm:-mx-4'
        }
      >
        {agendaView === 'tasks' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3 px-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Tarefas</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Minhas tarefas</p>
              </div>
              <AgendaModeSwitcher mode="tasks" onChange={setView} />
            </div>
            <KanbanTasksView />
          </div>
        ) : (
          <KanbanPlannerView
            mode="planner"
            onModeChange={setView}
            pageTitle="Agenda"
            pageSubtitle="Agenda pessoal"
          />
        )}
      </div>
    </MainLayout>
  );
}

export default function AgendaPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <AgendaPage />
    </Suspense>
  );
}
