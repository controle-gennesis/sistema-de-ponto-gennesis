'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import api from '@/lib/api';
import {
  OsPleitosPanel,
  type OsTab,
  type OsPleitoListItem
} from '@/components/os/OsPleitosPanel';
import { OsFluxTabsNav, OS_FLUX_DEFAULT_TAB } from '@/components/os/OsFluxTabsNav';
import { OsGlobalSearch } from '@/components/os/OsGlobalSearch';
import { computeOsTabCounts, prepareOsFluxList } from '@/components/os/osFluxUtils';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';

export default function AndamentoDaOsPage() {
  const router = useRouter();
  const [osTab, setOsTab] = useState<OsTab>(OS_FLUX_DEFAULT_TAB);
  const [searchTerm, setSearchTerm] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: listData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['pleitos', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/pleitos', { params: { limit: 500, page: 1 } });
      return res.data;
    }
  });

  const allPleitos = useMemo(
    () => prepareOsFluxList((listData?.data || []) as OsPleitoListItem[]),
    [listData]
  );
  const tabCounts = useMemo(() => computeOsTabCounts(allPleitos), [allPleitos]);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/andamento-da-os">
        <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/andamento-da-os">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Ordem de Serviço"
            description="Acompanhe orçamento, execução, pleitos e faturamento das OS em um só lugar."
          />

          <OsGlobalSearch
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onNavigate={setOsTab}
            pleitos={allPleitos}
          />

          <div className="scroll-mt-4">
            <OsFluxTabsNav activeTab={osTab} onActiveTab={setOsTab} tabCounts={tabCounts} />

            <div className="mt-4">
              {loadingPleitos ? (
                <CadastroListLoading message="Carregando ordens de serviço..." />
              ) : (
                <OsPleitosPanel
                  embedded
                  hideTabs
                  hideSearch
                  activeTab={osTab}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                />
              )}
            </div>
          </div>
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
