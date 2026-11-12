import { FileText, Video } from 'lucide-react';
import type { ContratoAcompanhamentoListConfig } from './ContratoAcompanhamentoListPage';

/** Reuniões quinzenais do contrato (usada na página própria e na aba Reuniões do contrato). */
export const REUNIOES_CONFIG: ContratoAcompanhamentoListConfig = {
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
  // Botão pequeno (+) para criar/abrir a reunião manualmente e preencher durante a reunião.
  allowToolbarCreate: true,
  allowRowEditDelete: false,
};

/** Relatório mensal do contrato. */
export const RELATORIO_MENSAL_CONFIG: ContratoAcompanhamentoListConfig = {
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
  // Botão pequeno (+) para criar/abrir o relatório do mês manualmente.
  allowToolbarCreate: true,
  allowRowEditDelete: false,
};
