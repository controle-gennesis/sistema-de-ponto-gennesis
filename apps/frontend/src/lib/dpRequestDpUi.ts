import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

/** Etapas do feedback do Departamento Pessoal. */
export type DpFlowFeedbackStatus =
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'IN_ACCOUNTING'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'CONCLUDED'
  | 'CANCELLED';

/** "Pendência contábil" saiu das etapas selecionáveis; o rótulo segue para solicitações antigas nessa etapa. */
export const DP_FLOW_FEEDBACK_STATUSES: DpFlowFeedbackStatus[] = [
  'IN_REVIEW_DP',
  'IN_FINANCEIRO',
  'IN_ACCOUNTING',
  'WAITING_RETURN',
  'WAITING_RETURN_ADM_TST',
  'WAITING_RETURN_ENGINEERING',
  'CONCLUDED',
  'CANCELLED',
];

export const DP_STATUS_LABELS: Record<DpFlowFeedbackStatus, string> = {
  IN_REVIEW_DP: 'Em Análise',
  IN_FINANCEIRO: 'No Financeiro',
  IN_ACCOUNTING: 'Na Contabilidade',
  WAITING_RETURN_ACCOUNTING: 'Pendência Contábil',
  WAITING_RETURN: 'Pendência Colaborador',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência Engenharia',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const DP_STATUS_LABEL_CLASS: Record<DpFlowFeedbackStatus, string> = {
  IN_REVIEW_DP: 'font-semibold text-yellow-800 dark:text-yellow-300',
  IN_FINANCEIRO: 'font-semibold text-indigo-800 dark:text-indigo-300',
  IN_ACCOUNTING: 'font-semibold text-indigo-800 dark:text-indigo-300',
  WAITING_RETURN_ACCOUNTING: 'font-semibold text-orange-800 dark:text-orange-300',
  WAITING_RETURN: 'font-semibold text-amber-800 dark:text-amber-300',
  WAITING_RETURN_ADM_TST: 'font-semibold text-orange-800 dark:text-orange-300',
  WAITING_RETURN_ENGINEERING: 'font-semibold text-orange-800 dark:text-orange-300',
  CONCLUDED: 'font-semibold text-green-700 dark:text-green-300',
  CANCELLED: 'font-semibold text-red-700 dark:text-red-300',
};

/** Status exibidos no filtro da fila DP (inclui etapas de tramitação). */
export const DP_FLOW_FILTER_STATUSES: DpFlowFeedbackStatus[] = [...DP_FLOW_FEEDBACK_STATUSES];

/** Tipos que, ao finalizar, geram um pedido no Atendimento Contábil (espelha o backend). */
// DESLIGADO: o DP não envia mais direto à Contabilidade (só finaliza). Os tipos voltam aqui se o envio for reativado
// (e `ENVIO_AUTOMATICO_CONTABILIDADE`, no backend, deve ser ligado junto).
const DP_TYPES_SENT_TO_ACCOUNTING = new Set<string>([]);

export const DP_SENT_TO_ACCOUNTING_LABEL = 'Na Contabilidade';
export const DP_SEND_TO_ACCOUNTING_ACTION_LABEL = 'Enviar à Contabilidade';

export function dpRequestIsSentToAccounting(requestType: string | null | undefined): boolean {
  return !!requestType && DP_TYPES_SENT_TO_ACCOUNTING.has(requestType);
}

/** Rótulo da etapa final: nos tipos que vão para a Contabilidade, "Finalizada" vira "Enviada à Contabilidade". */
export function dpStatusLabelForType(status: DpFlowFeedbackStatus, requestType: string): string {
  if (status === 'CONCLUDED' && dpRequestIsSentToAccounting(requestType)) {
    return DP_SENT_TO_ACCOUNTING_LABEL;
  }
  return DP_STATUS_LABELS[status];
}

function toColoredSelectOption(
  value: DpFlowFeedbackStatus,
  requestType?: string
): MultiSelectSearchOption {
  // No seletor de feedback é uma ação, então usa o verbo; nos selos de status fica "Enviada à Contabilidade".
  const label =
    requestType && value === 'CONCLUDED' && dpRequestIsSentToAccounting(requestType)
      ? DP_SEND_TO_ACCOUNTING_ACTION_LABEL
      : DP_STATUS_LABELS[value];
  return {
    value,
    label,
    searchText: label,
    labelClassName:
      label === DP_SEND_TO_ACCOUNTING_ACTION_LABEL
        ? 'font-semibold text-indigo-700 dark:text-indigo-300'
        : DP_STATUS_LABEL_CLASS[value],
  };
}

/** Opções do select de feedback DP (com cores alinhadas ao badge da tabela). */
export function buildDpFeedbackSelectOptions(): MultiSelectSearchOption[] {
  return DP_FLOW_FEEDBACK_STATUSES.map((value) => toColoredSelectOption(value));
}

/** Opções do feedback DP para um tipo específico (rótulo da etapa final varia com o tipo). */
export function buildDpFeedbackSelectOptionsForType(requestType: string): MultiSelectSearchOption[] {
  return DP_FLOW_FEEDBACK_STATUSES.map((value) => toColoredSelectOption(value, requestType));
}

/** Opções do filtro de status DP — mesmas etapas e rótulos do feedback. */
export function buildDpStatusFilterOptions(): MultiSelectSearchOption[] {
  return labeledToSelectOptions([
    { value: 'all', label: 'Todos' },
    ...DP_FLOW_FILTER_STATUSES.map((value) => ({
      value,
      label: DP_STATUS_LABELS[value],
    })),
  ]).map((opt) => {
    if (opt.value === 'all') return opt;
    const flow = opt.value as DpFlowFeedbackStatus;
    return toColoredSelectOption(flow);
  });
}
