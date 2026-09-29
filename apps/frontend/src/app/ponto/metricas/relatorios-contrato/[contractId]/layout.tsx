'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';

/** Inclui o nome do contrato no breadcrumb após Relatórios de Contrato. */
export default function RelatorioContratoDetalheLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const contractId =
    typeof params?.contractId === 'string'
      ? params.contractId
      : Array.isArray(params?.contractId)
        ? params.contractId[0] ?? ''
        : '';

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

  useBreadcrumbEntity(
    name && contractId
      ? { label: name, href: `/ponto/metricas/relatorios-contrato/${contractId}` }
      : null,
    { priority: 0 },
  );

  return children;
}
