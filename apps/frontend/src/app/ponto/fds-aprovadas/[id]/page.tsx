'use client';

import React, { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import { OrcamentoPageView } from '@/app/ponto/orcamento/OrcamentoPageView';
import api from '@/lib/api';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import {
  fdOrcamentoVinculo,
  FD_STATUS_LABELS,
  formatCurrencyDisplay,
  purchaseStatusLabel,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

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
  const vinculo = record ? fdOrcamentoVinculo(record) : null;
  const codigoFd = record?.codFichaDemanda?.trim() || '';

  useBreadcrumbEntity(codigoFd ? [{ label: codigoFd }] : null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

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

  if (vinculo) {
    return (
      <Suspense fallback={<Loading message="Carregando ficha de demanda..." fullScreen size="lg" />}>
        <OrcamentoPageView
          lockedCostCenterId={vinculo.centroCustoId}
          embeddedContractId={record.contratoId}
          embeddedContractName={record.contratoNome}
          embeddedOrcamentoIdFromRoute={vinculo.orcamentoId}
          fichaDemandaOnly
          fichaDemandaRecord={record}
        />
      </Suspense>
    );
  }

  return (
    <ProtectedRoute route="/ponto/fds-aprovadas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              {record.codFichaDemanda || 'Ficha de demanda'}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Pedido {record.codigoPedido || '—'} · {record.polo || '—'}
            </p>
          </div>
          <Card>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <div className="flex justify-end">
                <FdStatusBadges record={record} />
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Contrato</dt>
                  <dd className="mt-1 text-sm uppercase text-gray-900 dark:text-gray-100">{record.contratoNome || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Obra</dt>
                  <dd className="mt-1 text-sm uppercase text-gray-900 dark:text-gray-100">{record.obra || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Solicitante</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{record.solicitanteNome || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Faturamento estimado</dt>
                  <dd className="mt-1 text-sm tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrencyDisplay(record.faturamentoEstimado)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Custo estimado</dt>
                  <dd className="mt-1 text-sm tabular-nums text-gray-900 dark:text-gray-100">
                    {formatCurrencyDisplay(record.custoEstimado)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Status</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {FD_STATUS_LABELS[record.status] || record.status}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Status compras</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                    {purchaseStatusLabel(record.purchaseStatus)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Observação</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{record.observacao || '—'}</dd>
                </div>
              </dl>
              <Link
                href="/ponto/fds-aprovadas"
                className="inline-flex items-center gap-2 text-sm text-red-600 hover:underline dark:text-red-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar às fichas
              </Link>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
