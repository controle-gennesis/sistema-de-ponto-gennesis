'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PointCorrectionCard } from '@/components/ponto/PointCorrectionCard';
import { PointCorrectionList } from '@/components/ponto/PointCorrectionList';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import api from '@/lib/api';

export default function SolicitacoesPage() {
  const router = useRouter();
  const [showNewModal, setShowNewModal] = useState(false);

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
    setShowNewModal(false);
  };

  return (
    <ProtectedRoute route="/ponto/solicitacoes">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <PageStack>
          <ListPageHeader
            title="Alterações de Ponto"
            description="Solicite e acompanhe alterações de marcação do seu ponto"
          />

          <PointCorrectionList onNew={() => setShowNewModal(true)} />
        </PageStack>

        <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Nova Alteração de Ponto" size="xl">
          <PointCorrectionCard onSuccess={handleSuccess} />
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
