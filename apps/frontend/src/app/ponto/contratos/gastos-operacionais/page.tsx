'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { ControleGeralGastosOperacionaisPanel } from '../controle-geral/ControleGeralGastosOperacionaisPanel';
import type {
  QueryGastosDetailRow,
  QueryGastosNaturezaDetailRow
} from '../controle-geral/buildQueryGastosRows';
import { normalizeGastosOperacionaisContractName } from '../controle-geral/gastosOperacionaisContractOrder';
import { resolveGastosPoloFromContractName } from '@/lib/extratoCaixaPolo';

type GastosOperacionaisApi = {
  success: boolean;
  message?: string;
  data: {
    configured: boolean;
    detailRows?: QueryGastosDetailRow[];
    naturezaDetailRows?: QueryGastosNaturezaDetailRow[];
    fetchedAt?: string;
    message?: string;
  };
};

export default function GastosOperacionaisPage() {
  const router = useRouter();

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

  const {
    data: gastosData,
    isLoading: loadingGastos,
    isError: gastosError,
    error: gastosErrorObj,
    isFetching: fetchingGastos,
    refetch: refetchGastos
  } = useQuery({
    queryKey: ['gastos-operacionais-module-totvs-v34-adiantamento-predial'],
    queryFn: async () => {
      const res = await api.get<GastosOperacionaisApi>('/contracts/gastos-operacionais', {
        timeout: 180_000
      });
      const payload = res.data;

      if (payload?.data?.configured === false) {
        throw new Error(
          payload.data.message ??
            'Integração TOTVS RM não configurada. Defina TOTVS_RM_* no servidor.'
        );
      }

      if (payload?.success === false) {
        throw new Error(payload.message ?? 'Não foi possível carregar os gastos no TOTVS RM.');
      }

      const detailRows = (payload.data?.detailRows ?? []).map((row) => {
        const contract = normalizeGastosOperacionaisContractName(row.contract);
        const polo = resolveGastosPoloFromContractName(contract, row.polo);
        return { ...row, contract, polo };
      });

      const naturezaDetailRows = (payload.data?.naturezaDetailRows ?? []).map((row) => ({
        ...row,
        contract: normalizeGastosOperacionaisContractName(row.contract)
      }));

      return {
        gastosOperacionais: {
          detailRows,
          naturezaDetailRows,
          fetchedAt: payload.data?.fetchedAt ?? new Date().toISOString()
        }
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const gastosDetailRows = gastosData?.gastosOperacionais?.detailRows ?? [];
  const gastosNaturezaDetailRows = gastosData?.gastosOperacionais?.naturezaDetailRows ?? [];
  const gastosErrorMessage = (() => {
    const err = gastosErrorObj as {
      response?: { data?: { message?: string } };
      message?: string;
    } | null;
    return (
      err?.response?.data?.message ??
      err?.message ??
      'Não foi possível carregar os gastos no TOTVS RM.'
    );
  })();

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos/gastos-operacionais">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos/gastos-operacionais">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Gastos Operacionais
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Visualize e exporte os gastos de todos os centros de custo.
            </p>
          </div>

          <ControleGeralGastosOperacionaisPanel
            detailRows={gastosDetailRows}
            naturezaDetailRows={gastosNaturezaDetailRows}
            isLoading={loadingGastos || fetchingGastos}
            isError={gastosError}
            errorMessage={gastosErrorMessage}
            onRetry={() => {
              void refetchGastos();
            }}
            hideDataRefreshControls
            inlineFilters
            panelTitle="Resumo por centro de custo"
            panelDescription="Totais mensais e anuais integrados ao TOTVS RM."
            readOnlyPoloColumn
            showPdfExport
          />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
