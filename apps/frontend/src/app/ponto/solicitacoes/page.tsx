'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, List } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PointCorrectionCard } from '@/components/ponto/PointCorrectionCard';
import { PointCorrectionList } from '@/components/ponto/PointCorrectionList';
import { Loading } from '@/components/ui/Loading';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';

export default function SolicitacoesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const user = userData?.data || {
    name: 'Usuário',
    cpf: '000.000.000-00',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/solicitacoes">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const handleSuccess = () => {
    setActiveTab('list');
  };

  return (
    <ProtectedRoute route="/ponto/solicitacoes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Alterações de Ponto</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite e acompanhe alterações de marcação do seu ponto</p>
          </div>

          {/* Navegação no topo */}
          <AppUnderlineTabList aria-label="Seções de alterações de ponto" centered={false}>
            <AppUnderlineTabButton
              active={activeTab === 'list'}
              onClick={() => setActiveTab('list')}
              className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm"
            >
              <List className="w-4 h-4" />
              Minhas alterações
            </AppUnderlineTabButton>
            <AppUnderlineTabButton
              active={activeTab === 'new'}
              onClick={() => setActiveTab('new')}
              className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Nova alteração
            </AppUnderlineTabButton>
          </AppUnderlineTabList>

          {/* Conteúdo principal */}
          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <FileText className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {activeTab === 'list' ? 'Minhas alterações' : 'Nova alteração'}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {activeTab === 'list' ? 'Visualize o status das suas alterações de ponto' : 'Preencha os dados para solicitar uma nova alteração'}
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {activeTab === 'list' ? (
                <PointCorrectionList />
              ) : (
                <PointCorrectionCard onSuccess={handleSuccess} />
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
