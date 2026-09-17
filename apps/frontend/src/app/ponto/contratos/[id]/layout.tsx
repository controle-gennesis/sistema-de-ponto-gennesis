'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';

/** Sincroniza o nome do contrato no breadcrumb da navbar em todas as subpáginas. */
export default function ContractDetailLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const contractId = typeof params?.id === 'string' ? params.id : '';

  const { data } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: Boolean(contractId),
    staleTime: 30_000,
  });

  const name = (data?.data as { name?: string } | undefined)?.name?.trim() || '';

  // Sempre publica o nome do contrato (inclusive em /orcamento). A página soma Orçamentos / nome.
  useBreadcrumbEntity(
    name && contractId ? { label: name, href: `/ponto/contratos/${contractId}` } : null,
    { priority: 0 },
  );

  return children;
}
