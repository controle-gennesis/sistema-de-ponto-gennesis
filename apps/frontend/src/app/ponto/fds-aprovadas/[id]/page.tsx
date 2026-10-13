'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { FichaDemandaDetailModal } from '@/components/engenharia/FichaDemandaDetailModal';
import api from '@/lib/api';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import type { FichaDemandaApprovalRecord } from '@/lib/fichaDemandaApproval';

export default function FichaDemandaAprovadaDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const id = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: fdRes, isLoading: loadingFd, isError } = useQuery({
    queryKey: ['demand-sheet-approval', id],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/${id}`);
      return (res.data?.data || null) as FichaDemandaApprovalRecord | null;
    },
    enabled: Boolean(id),
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const record = fdRes ?? null;
  const codigoFd = record?.codFichaDemanda?.trim() || '';

  useBreadcrumbEntity(codigoFd ? [{ label: codigoFd }] : null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const voltar = () => router.push('/ponto/fds-aprovadas');

  if (!id || loadingUser || loadingFd) {
    return <Loading message="Carregando ficha de demanda..." fullScreen size="lg" />;
  }

  if (isError || !record) {
    return (
      <ProtectedRoute route="/ponto/fds-aprovadas">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-700 dark:text-gray-300">Ficha de demanda não encontrada.</p>
              <Link
                href="/ponto/fds-aprovadas"
                className="mt-4 inline-flex items-center gap-2 text-red-600 hover:underline dark:text-red-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar às fichas
              </Link>
            </CardContent>
          </Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/fds-aprovadas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="mx-auto w-full max-w-4xl">
          <Link
            href="/ponto/fds-aprovadas"
            className="inline-flex items-center gap-2 text-sm text-red-600 hover:underline dark:text-red-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar às fichas
          </Link>
        </div>
        <FichaDemandaDetailModal
          isOpen
          record={record}
          onClose={voltar}
          allowAddOrdemCompra
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
