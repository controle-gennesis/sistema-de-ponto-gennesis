'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loading } from '@/components/ui/Loading';

/** Mantém o link antigo apontando para a aba Relatório Mensal em Reuniões de Contrato. */
export default function AcompanhamentoMensalRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';

  useEffect(() => {
    if (!contractId) return;
    const qs = new URLSearchParams(searchParams?.toString() ?? '');
    qs.set('aba', 'relatorio-mensal');
    const query = qs.toString();
    router.replace(`/ponto/contratos/${contractId}/reunioes${query ? `?${query}` : ''}`);
  }, [contractId, router, searchParams]);

  return <Loading message="Redirecionando..." fullScreen size="lg" />;
}
