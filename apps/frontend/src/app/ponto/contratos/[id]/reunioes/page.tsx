'use client';

import { useParams } from 'next/navigation';
import { ContratoAcompanhamentoListPage } from '@/components/contract/ContratoAcompanhamentoListPage';
import { REUNIOES_CONFIG, RELATORIO_MENSAL_CONFIG } from '@/components/contract/contratoReunioesConfigs';
import { Loading } from '@/components/ui/Loading';
import { usePermissions } from '@/hooks/usePermissions';

export default function ContratoReunioesDeContratoPage() {
  const params = useParams();
  const { canAccessContractReunioesTab, isLoading: permissionsLoading } = usePermissions();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';
  const canReunioesAba = canAccessContractReunioesTab(contractId);

  if (permissionsLoading) {
    return <Loading message="Carregando…" fullScreen size="lg" />;
  }

  // Controle Geral repetido no topo (o mesmo da página do contrato) e, abaixo, reunião quinzenal e
  // relatório mensal lado a lado — para acompanhar tudo ao mesmo tempo durante a reunião.
  if (!canReunioesAba) {
    return <ContratoAcompanhamentoListPage config={RELATORIO_MENSAL_CONFIG} showMonthlyControleGeral />;
  }

  return (
    <ContratoAcompanhamentoListPage
      config={REUNIOES_CONFIG}
      splitWith={RELATORIO_MENSAL_CONFIG}
      showMonthlyControleGeral
    />
  );
}
