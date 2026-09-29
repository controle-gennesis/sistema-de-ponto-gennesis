'use client';

import { FileText, Video } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  ContratoAcompanhamentoListPage,
  type ContratoAcompanhamentoListConfig,
} from '@/components/contract/ContratoAcompanhamentoListPage';
import { Loading } from '@/components/ui/Loading';
import { useMensalReportPendingCount } from '@/hooks/useMensalReportPendingCount';
import { usePermissions } from '@/hooks/usePermissions';

const REUNIOES_CONFIG: ContratoAcompanhamentoListConfig = {
  kind: 'semanal',
  pageTitle: 'Reuniões de Contrato',
  sectionTitle: 'Reuniões Quinzenais',
  sectionDescription: 'Reuniões gravadas com a equipe do contrato.',
  Icon: Video,
  periodColumnLabel: 'Quinzena',
  searchPlaceholder: 'Buscar por quinzena ou responsável...',
  emptyMessage: 'Nenhuma reunião registrada ainda.',
  emptyTitle: 'Nenhuma reunião registrada',
  emptyHint: 'Registre a reunião da quinzena com a equipe.',
  configModalTitle: 'Formulário de reunião quinzenal',
  configModalDescription:
    'Escolha o formulário usado nas reuniões quinzenais gravadas com a equipe do contrato. Os templates vêm de Cadastros → Formulários.',
  fillButtonLabel: 'Registrar reunião da quinzena',
  fillButtonContinueLabel: 'Continuar reunião da quinzena',
  fillButtonNewLabel: 'Nova reunião',
  currentPeriodSummaryLabel: 'Quinzena atual',
  recordsCountLabel: (count) =>
    `${count} ${count === 1 ? 'quinzena registrada' : 'quinzenas registradas'}`,
  saveSuccessToast: 'Formulário de reunião quinzenal configurado!',
  openSuccessToast: 'Reunião da quinzena aberta para registro.',
  createSuccessToast: 'Nova reunião criada.',
  allowConfigureForm: false,
  allowToolbarCreate: false,
  allowRowEditDelete: false,
};

const RELATORIO_MENSAL_CONFIG: ContratoAcompanhamentoListConfig = {
  kind: 'mensal',
  pageTitle: 'Reuniões de Contrato',
  sectionTitle: 'Relatório Mensal',
  sectionDescription: 'Preenchimento mensal da equipe do contrato.',
  Icon: FileText,
  periodColumnLabel: 'Mês',
  searchPlaceholder: 'Buscar por mês ou responsável...',
  emptyMessage: 'Nenhum relatório mensal ainda.',
  emptyTitle: 'Nenhum relatório registrado',
  emptyHint: 'Quando houver relatório do mês, ele aparece aqui para preenchimento.',
  configModalTitle: 'Formulário do relatório mensal',
  configModalDescription:
    'Escolha o formulário mensal deste contrato. Os templates vêm de Cadastros → Formulários.',
  fillButtonLabel: 'Preencher mês atual',
  fillButtonContinueLabel: 'Continuar mês atual',
  fillButtonNewLabel: 'Novo relatório',
  currentPeriodSummaryLabel: 'Mês atual',
  recordsCountLabel: (count) =>
    `${count} ${count === 1 ? 'mês registrado' : 'meses registrados'}`,
  saveSuccessToast: 'Formulário do relatório mensal configurado!',
  openSuccessToast: 'Mês atual aberto para preenchimento.',
  createSuccessToast: 'Novo relatório criado.',
  allowConfigureForm: false,
  allowToolbarCreate: false,
  allowRowEditDelete: false,
};

type AbaId = 'quinzenais' | 'relatorio-mensal';

export default function ContratoReunioesDeContratoPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAccessContractReunioesTab, isLoading: permissionsLoading } = usePermissions();
  const rawId = params?.id;
  const contractId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] ?? '' : '';
  const canReunioesAba = canAccessContractReunioesTab(contractId);
  const { pendingByContractId } = useMensalReportPendingCount(Boolean(contractId));
  const mensalPendingForContract = pendingByContractId.has(contractId) ? 1 : 0;

  const activeAba: AbaId =
    searchParams?.get('aba') === 'relatorio-mensal' ? 'relatorio-mensal' : 'quinzenais';

  const handleAbaChange = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');
      if (id === 'relatorio-mensal') {
        next.set('aba', 'relatorio-mensal');
      } else {
        next.delete('aba');
      }
      const qs = next.toString();
      router.replace(
        qs ? `/ponto/contratos/${contractId}/reunioes?${qs}` : `/ponto/contratos/${contractId}/reunioes`,
        { scroll: false }
      );
    },
    [contractId, router, searchParams]
  );

  const tabs = useMemo(
    () => ({
      items: [
        { id: 'quinzenais' as const, label: 'Reuniões Quinzenais' },
        {
          id: 'relatorio-mensal' as const,
          label: 'Relatório Mensal',
          badgeCount: mensalPendingForContract,
        },
      ],
      activeId: activeAba,
      onChange: handleAbaChange,
    }),
    [activeAba, handleAbaChange, mensalPendingForContract]
  );

  if (permissionsLoading) {
    return <Loading message="Carregando…" fullScreen size="lg" />;
  }

  if (!canReunioesAba) {
    return <ContratoAcompanhamentoListPage config={RELATORIO_MENSAL_CONFIG} />;
  }

  return (
    <ContratoAcompanhamentoListPage
      config={activeAba === 'relatorio-mensal' ? RELATORIO_MENSAL_CONFIG : REUNIOES_CONFIG}
      tabs={tabs}
    />
  );
}
