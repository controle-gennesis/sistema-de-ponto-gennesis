'use client';

import React, { Suspense, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

/** Redireciona `?orcamento=uuid` (formato antigo) para `/orcamento/uuid`. */
function LegacyOrcamentoQueryRedirect({ contractId }: { contractId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams?.get('orcamento')?.trim();
    if (!q) return;
    router.replace(`/ponto/contratos/${contractId}/orcamento/${q}`, { scroll: false });
  }, [contractId, router, searchParams]);
  return null;
}

function OrcamentoEmbeddedWithQueryFlags({
  lockedCostCenterId,
  embeddedContractId,
  embeddedContractName,
  embeddedOrcamentoIdFromRoute,
}: {
  lockedCostCenterId: string;
  embeddedContractId: string;
  embeddedContractName: string;
  embeddedOrcamentoIdFromRoute: string | null;
}) {
  const searchParams = useSearchParams();
  const novoFlag = (searchParams?.get('novo') || '').trim().toLowerCase();
  const importarFlag = (searchParams?.get('importar') || '').trim().toLowerCase();
  const onList = !embeddedOrcamentoIdFromRoute;
  const autoOpenNovoOrcamento =
    onList && (novoFlag === '1' || novoFlag === 'true');
  const autoOpenImportOrcamento =
    onList && (importarFlag === '1' || importarFlag === 'true');
  return (
    <OrcamentoPageView
      lockedCostCenterId={lockedCostCenterId}
      embeddedContractId={embeddedContractId}
      embeddedContractName={embeddedContractName}
      embeddedOrcamentoIdFromRoute={embeddedOrcamentoIdFromRoute}
      autoOpenNovoOrcamento={autoOpenNovoOrcamento}
      autoOpenImportOrcamento={autoOpenImportOrcamento}
    />
  );
}

export default function ContratoOrcamentoPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  const { canAccessContractOrcamentoTab, isLoading: loadingPerms } = usePermissions();
  const rawSeg = params?.orcamentoSeg;
  const orcamentoSeg = useMemo(
    () => (Array.isArray(rawSeg) ? rawSeg : rawSeg ? [String(rawSeg)] : []),
    [rawSeg]
  );
  const embeddedOrcamentoIdFromRoute = orcamentoSeg.length === 1 ? orcamentoSeg[0] : null;

  useEffect(() => {
    if (!contractId || orcamentoSeg.length <= 1) return;
    router.replace(`/ponto/contratos/${contractId}/orcamento`, { scroll: false });
  }, [contractId, orcamentoSeg.length, router]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId
  });

  const contract = contractData?.data as Contract | undefined;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (!contractId || loadingUser || loadingPerms) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
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

  if (!contract) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">Contrato não encontrado.</p>
            <Link
              href="/ponto/orcamentos"
              className="mt-4 inline-flex items-center gap-2 text-red-600 dark:text-red-400 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para orçamentos
            </Link>
          </div>
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

  if (!contract.costCenterId) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-700 dark:text-gray-300">
                Este contrato não tem centro de custo vinculado. O orçamento depende de um centro de custo.
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

  if (orcamentoSeg.length > 1) {
    return (
      <ProtectedRoute route="/ponto/orcamentos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Redirecionando…" size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <Suspense fallback={<Loading message="Carregando orçamento..." size="lg" />}>
      <LegacyOrcamentoQueryRedirect contractId={contractId} />
      <OrcamentoEmbeddedWithQueryFlags
        lockedCostCenterId={contract.costCenterId}
        embeddedContractId={contractId}
        embeddedContractName={typeof contract.name === 'string' ? contract.name.trim() : ''}
        embeddedOrcamentoIdFromRoute={embeddedOrcamentoIdFromRoute}
      />
    </Suspense>
  );
}
