'use client';

import { FileText } from 'lucide-react';
import {
  ContratoAcompanhamentoListPage,
  type ContratoAcompanhamentoListConfig,
} from '@/components/contract/ContratoAcompanhamentoListPage';

const CONFIG: ContratoAcompanhamentoListConfig = {
  kind: 'mensal',
  pageTitle: 'Relatório Mensal',
  sectionTitle: 'Histórico',
  sectionDescription: 'Relatórios mensais registrados para este contrato.',
  Icon: FileText,
  periodColumnLabel: 'Mês',
  searchPlaceholder: 'Buscar por mês ou responsável...',
  emptyMessage: 'Nenhum relatório mensal ainda.',
  emptyTitle: 'Nenhum relatório registrado',
  emptyHint: 'Quando houver relatório do mês, ele aparece aqui.',
  configModalTitle: 'Formulário do relatório mensal',
  configModalDescription:
    'Escolha o formulário mensal deste contrato. Você também pode atribuir em Métricas → Relatórios de Contrato.',
  fillButtonLabel: 'Preencher mês atual',
  fillButtonContinueLabel: 'Continuar mês atual',
  fillButtonNewLabel: 'Novo relatório',
  currentPeriodSummaryLabel: 'Mês atual',
  recordsCountLabel: (count) =>
    `${count} ${count === 1 ? 'mês registrado' : 'meses registrados'}`,
  saveSuccessToast: 'Formulário do relatório mensal configurado!',
  openSuccessToast: 'Mês atual aberto para preenchimento.',
  createSuccessToast: 'Novo relatório criado.',
  allowToolbarCreate: false,
  backHref: () => '/ponto/metricas/relatorios-contrato?aba=relatorio-mensal',
  backLabel: 'Voltar ao painel',
  protectedRoute: '/ponto/metricas/relatorios-contrato',
};

export default function RelatorioContratoMensalDetalhePage() {
  return <ContratoAcompanhamentoListPage config={CONFIG} />;
}
