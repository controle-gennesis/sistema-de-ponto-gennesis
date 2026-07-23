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
      <div className="flex flex-col -mx-2 sm:-mx-4">
        <div className="mb-4 flex flex-shrink-0 items-center justify-between gap-3 px-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {agendaView === 'tasks' ? 'Tarefas' : 'Agenda'}
          </h1>
          <AgendaModeSwitcher mode={agendaView} onChange={setView} />
        </div>

        {agendaView === 'tasks' ? (
          <KanbanTasksView />
        ) : (
          <KanbanPlannerView />
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
