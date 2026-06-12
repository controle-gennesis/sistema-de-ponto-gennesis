'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { ControleGeralGastosOperacionaisPanel } from '../controle-geral/ControleGeralGastosOperacionaisPanel';
import { buildGastosDetailRowsFromSheetRows } from '../controle-geral/buildQueryGastosRows';

export default function GastosOperacionaisPage() {
  const router = useRouter();
  const [gastosRefreshNonce, setGastosRefreshNonce] = useState(0);

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
    isFetching: fetchingGastos
  } = useQuery({
    queryKey: ['gastos-operacionais-module-v1', gastosRefreshNonce],
    queryFn: async () => {
      const refreshParams = gastosRefreshNonce > 0 ? { refresh: 1 } : {};

      const sheetRes = await api.get<{
        success: boolean;
        data?: { rows?: string[][]; fetchedAt?: string };
      }>('/controle-nfs/sheet-data', {
        params: { sheetName: 'QUERY BASE DE GASTOS', ...refreshParams },
        timeout: 120_000
      });

      const detailRows = buildGastosDetailRowsFromSheetRows(sheetRes.data?.data?.rows ?? []);

      return {
        gastosOperacionais: {
          detailRows,
          fetchedAt: sheetRes.data?.data?.fetchedAt ?? new Date().toISOString()
        }
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  const gastosDetailRows = gastosData?.gastosOperacionais?.detailRows ?? [];
  const gastosFetchedAt = gastosData?.gastosOperacionais?.fetchedAt;
  const gastosErrorMessage = (() => {
    const err = gastosErrorObj as {
      response?: { data?: { message?: string } };
      message?: string;
    } | null;
    return (
      err?.response?.data?.message ??
      err?.message ??
      'Não foi possível carregar os gastos da planilha.'
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
              Gastos operacionais por contrato — QUERY BASE DE GASTOS
            </p>
          </div>

          <ControleGeralGastosOperacionaisPanel
            detailRows={gastosDetailRows}
            isLoading={loadingGastos || fetchingGastos}
            fetchedAt={gastosFetchedAt}
            isError={gastosError}
            errorMessage={gastosErrorMessage}
            onRetry={() => setGastosRefreshNonce((n) => n + 1)}
            showPdfExport
          />
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
