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
import api from '@/lib/api';
import { OrcamentoPageView } from '@/app/ponto/orcamento/OrcamentoPageView';

interface Contract {
  id: string;
  costCenterId: string;
  name?: string;
}

export default function CronogramaOrcamentoPage() {
  const params = useParams();
  const router = useRouter();
  const rawContract = params?.contractId;
  const rawOrcamento = params?.orcamentoId;
  const contractId =
    typeof rawContract === 'string' ? rawContract : Array.isArray(rawContract) ? rawContract[0] ?? '' : '';
  const orcamentoId =
    typeof rawOrcamento === 'string' ? rawOrcamento : Array.isArray(rawOrcamento) ? rawOrcamento[0] ?? '' : '';

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: Boolean(contractId),
  });

  const contract = contractData?.data as Contract | undefined;
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  if (!contractId || !orcamentoId || loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  if (loadingContract) {
    return (
      <ProtectedRoute route="/ponto/cronogramas" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando contrato..." size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!contract?.costCenterId) {
    return (
      <ProtectedRoute route="/ponto/cronogramas" contractId={contractId}>
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-700 dark:text-gray-300">
                Contrato não encontrado ou sem centro de custo.
              </p>
              <Link
                href="/ponto/cronogramas"
                className="mt-4 inline-flex items-center gap-2 text-red-600 dark:text-red-400 hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar aos cronogramas
              </Link>
            </CardContent>
          </Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  // OrcamentoPageView já inclui MainLayout + ProtectedRoute.
  return (
    <Suspense fallback={<Loading message="Carregando cronograma..." fullScreen size="lg" />}>
      <OrcamentoPageView
        lockedCostCenterId={contract.costCenterId}
        embeddedContractId={contractId}
        embeddedContractName={typeof contract.name === 'string' ? contract.name.trim() : ''}
        embeddedOrcamentoIdFromRoute={orcamentoId}
        cronogramaOnly
      />
    </Suspense>
  );
}
