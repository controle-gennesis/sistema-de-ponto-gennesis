'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { MedicalCertificateCard } from '@/components/medical-certificate/MedicalCertificateCard';
import {
  MedicalCertificateList,
  type MedicalCertificateStatusTab,
} from '@/components/medical-certificate/MedicalCertificateList';
import { FileText, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';

const STATUS_LIST_HEADER: Record<
  MedicalCertificateStatusTab,
  { title: string; subtitle: string; Icon: React.ElementType; iconBg: string; iconColor: string }
> = {
  all: {
    title: 'Todos os registros',
    subtitle: 'Todas as suas ausências registradas',
    Icon: FileText,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  PENDING: {
    title: 'Ausências pendentes',
    subtitle: 'Ausências aguardando análise',
    Icon: Clock,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  APPROVED: {
    title: 'Ausências aprovadas',
    subtitle: 'Ausências já aprovadas',
    Icon: CheckCircle,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  REJECTED: {
    title: 'Ausências rejeitadas',
    subtitle: 'Ausências que foram rejeitadas',
    Icon: XCircle,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
  },
  CANCELLED: {
    title: 'Ausências canceladas',
    subtitle: 'Ausências que foram canceladas',
    Icon: XCircle,
    iconBg: 'bg-gray-100 dark:bg-gray-700',
    iconColor: 'text-gray-600 dark:text-gray-300',
  },
};

function AtestadosPageContent() {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const [showNewModal, setShowNewModal] = useState(false);
  const [statusTab, setStatusTab] = useState<MedicalCertificateStatusTab>('all');

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: statsData } = useQuery({
    queryKey: ['medical-certificates-my-stats', permissions.canManageAbsences],
    queryFn: async () => {
      const response = await api.get(permissions.canManageAbsences ? '/medical-certificates' : '/medical-certificates/my');
      const payload = response.data?.data;
      const certificates: Array<{ status: string }> = Array.isArray(payload) ? payload : payload?.certificates || [];
      return {
        total: certificates.length,
        pending: certificates.filter((c) => c.status === 'PENDING').length,
        approved: certificates.filter((c) => c.status === 'APPROVED').length,
        rejected: certificates.filter((c) => c.status === 'REJECTED').length,
      };
    }
  });
  const stats = statsData || { total: 0, pending: 0, approved: 0, rejected: 0 };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/auth/login';
  };

  const handleSuccess = () => {
    setShowNewModal(false);
    queryClient.invalidateQueries({ queryKey: ['medical-certificates-my-stats'] });
    queryClient.invalidateQueries({ queryKey: ['medical-certificates'] });
  };

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <Loading message="Carregando..." fullScreen size="lg" />
      </MainLayout>
    );
  }

  const listHeader = STATUS_LIST_HEADER[statusTab];
  const ListHeaderIcon = listHeader.Icon;

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
        <ListPageHeader title="Enviar Atestado" description="Envie seus atestados e acompanhe o status" />

        <div className={pageStatCardsGridClass}>
          <FilterStatCard
            label="Total"
            count={stats.total}
            icon={FileText}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconColor="text-blue-600 dark:text-blue-400"
            isActive={statusTab === 'all'}
            onClick={() => setStatusTab('all')}
          />
          <FilterStatCard
            label="Pendentes"
            count={stats.pending}
            icon={Clock}
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconColor="text-amber-600 dark:text-amber-400"
            isActive={statusTab === 'PENDING'}
            onClick={() => setStatusTab('PENDING')}
          />
          <FilterStatCard
            label="Aprovados"
            count={stats.approved}
            icon={CheckCircle}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
            isActive={statusTab === 'APPROVED'}
            onClick={() => setStatusTab('APPROVED')}
          />
          <FilterStatCard
            label="Rejeitados"
            count={stats.rejected}
            icon={XCircle}
            iconBg="bg-red-100 dark:bg-red-900/30"
            iconColor="text-red-600 dark:text-red-400"
            isActive={statusTab === 'REJECTED'}
            onClick={() => setStatusTab('REJECTED')}
          />
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className={`rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                  <ListHeaderIcon className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{listHeader.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{listHeader.subtitle}</p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Enviar Atestado</span>
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cadastroListClasses.cardContent}>
            <MedicalCertificateList statusFilter={statusTab} />
          </CardContent>
        </Card>
      </PageStack>

      <Modal isOpen={showNewModal} onClose={() => setShowNewModal(false)} title="Enviar Atestado" size="xl">
        <MedicalCertificateCard onSuccess={handleSuccess} />
      </Modal>
    </MainLayout>
  );
}

export default function AtestadosPage() {
  return (
    <ProtectedRoute route="/ponto/atestados">
      <AtestadosPageContent />
    </ProtectedRoute>
  );
}
