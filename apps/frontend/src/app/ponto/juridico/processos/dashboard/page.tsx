'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { JuridicoProcessosDashboard } from '@/components/juridico/JuridicoProcessosDashboard';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import api from '@/lib/api';

export default function ProcessosAtivosDashboardPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/juridico/processos/dashboard">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Dashboards dos Processos"
            description="Indicadores de causas, sentenças, custas, recursos e acordos"
          />

          <JuridicoProcessosDashboard />
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
