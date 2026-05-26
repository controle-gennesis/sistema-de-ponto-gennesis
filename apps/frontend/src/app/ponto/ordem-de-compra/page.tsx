'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import {
  OcPurchaseOrdersPanel,
  type OcTab,
  type PurchaseOrder
} from '@/components/oc/OcPurchaseOrdersPanel';
import { OcFluxTabsNav } from '@/components/oc/OcFluxTabsNav';
import { computeOcTabCounts } from '@/components/oc/ocTabCounts';

export default function OrdemDeCompraPage() {
  const router = useRouter();
  const [ocTab, setOcTab] = useState<OcTab>('compras');
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

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['purchase-orders', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    }
  });

  const { data: finalizedTotal = 0 } = useQuery({
    queryKey: ['purchase-orders', 'finalized-total'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', {
        params: { status: 'FINALIZED,SENT', page: 1, limit: 1 }
      });
      return Number(res.data?.pagination?.total ?? 0);
    },
    staleTime: 30_000
  });

  const allOrders: PurchaseOrder[] = ordersData?.data || [];
  const tabCounts = useMemo(() => computeOcTabCounts(allOrders), [allOrders]);

  if (loadingUser || loadingOrders) {
    return <Loading message="Carregando ordens de compra..." fullScreen size="lg" />;
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  return (
    <ProtectedRoute route="/ponto/ordem-de-compra">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
              Ordens de Compra
            </h1>
            <p className="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">
              Acompanhe aprovações, pagamentos e o fluxo completo das OCs em um só lugar.
            </p>
          </div>

          <div className="scroll-mt-4">
            <OcFluxTabsNav
              activeTab={ocTab}
              onActiveTab={setOcTab}
              tabCounts={tabCounts}
              finalizedTotal={finalizedTotal}
            />

            <div className="mt-4">
              <OcPurchaseOrdersPanel
                embedded
                hideTabs
                activeTab={ocTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
              />
            </div>
          </div>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
