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
import { usePermissions } from '@/hooks/usePermissions';

interface Contract {
  id: string;
  costCenterId: string;
  name?: string;
}

/**
 * Detalhe do orçamento a partir da lista global `/ponto/orcamentos`.
 * Evita a trilha Contratos > Contrato no breadcrumb (rota dedicada, como Cronogramas).
 */
export default function OrcamentoListaGlobalDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const rawContract = params?.contractId;
  const rawOrcamento = params?.orcamentoId;
  const contractId =
    typeof rawContract === 'string'
      ? rawContract
      : Array.isArray(rawContract)
        ? rawContract[0] ?? ''
        : '';
  const orcamentoId =
    typeof rawOrcamento === 'string'
      ? rawOrcamento
      : Array.isArray(rawOrcamento)
        ? rawOrcamento[0] ?? ''
        : '';

  const { canAccessContractOrcamentoTab, isLoading: loadingPerms } = usePermissions();

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

  if (!contractId || !orcamentoId || loadingUser || loadingPerms) {
    // Dentro do shell de /ponto — sem overlay fixed que “pisca” a navbar/sidebar.
    return <Loading message="Carregando..." size="lg" />;
  }

  if (loadingContract) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando contrato..." size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!contract?.costCenterId) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-700 dark:text-gray-300">
                Contrato não encontrado ou sem centro de custo.
              </p>
              <Link
                href="/ponto/orcamentos"
                className="mt-4 inline-flex items-center gap-2 text-red-600 dark:text-red-400 hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para orçamentos
              </Link>
            </CardContent>
          </Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  if (!canAccessContractOrcamentoTab(contractId)) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-700 dark:text-gray-300">
                Orçamentos não estão disponíveis para o seu centro de custo.
              </p>
              <Link
                href="/ponto/orcamentos"
                className="mt-4 inline-flex items-center gap-2 text-red-600 dark:text-red-400 hover:underline"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para orçamentos
              </Link>
            </CardContent>
          </Card>
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <Suspense fallback={<Loading message="Carregando orçamento..." size="lg" />}>
      <OrcamentoPageView
        lockedCostCenterId={contract.costCenterId}
        embeddedContractId={contractId}
        embeddedContractName={typeof contract.name === 'string' ? contract.name.trim() : ''}
        embeddedOrcamentoIdFromRoute={orcamentoId}
        listaGlobalEntry
      />
    </Suspense>
  );
}
