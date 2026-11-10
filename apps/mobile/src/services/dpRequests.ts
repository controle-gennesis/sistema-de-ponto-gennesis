import api from './api';
import { readApiData } from './http';

export type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'WAITING_SUPPLIES'
  | 'WAITING_PAYMENT'
  | 'CONCLUDED'
  | 'CANCELLED';

export type DpRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO'
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR'
  | 'ADM_ASOS'
  | 'ADM_OUTROS';

export type DpEligibleContract = {
  id: string;
  name: string;
  number?: string;
  costCenterId?: string;
  costCenter?: {
    company?: string | null;
    polo?: string | null;
    name?: string | null;
    code?: string | null;
  };
};

export type DpEligibleCostCenter = {
  id: string;
  name: string;
  code?: string;
  company?: string | null;
  polo?: string | null;
  contractIds?: string[];
};

export type DpRequest = {
  id: string;
  displayNumber?: number | null;
  urgency: DpUrgency;
  requestType: DpRequestType;
  status: DpRequestStatus;
  contractId?: string | null;
  costCenterId?: string | null;
  company?: string | null;
  polo?: string | null;
  prazoInicio?: string | null;
  prazoFim?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  requesterReturnComment?: string | null;
  dpFeedback?: string | null;
  contract?: { id: string; name?: string; number?: string } | null;
  costCenter?: { id: string; name?: string; code?: string | null } | null;
  employee?: { id: string; department?: string; user?: { name?: string } } | null;
};

export type PayrollEmployeeOption = {
  id: string;
  name: string;
  department?: string;
  position?: string;
  cpf?: string;
  profilePhotoUrl?: string | null;
  company?: string | null;
  polo?: string | null;
  costCenter?: string | null;
  birthDate?: string | null;
};

export const DP_TYPE_LABELS: Record<string, string> = {
  ADMISSAO: 'Admissão',
  ADVERTENCIA_SUSPENSAO: 'Medida disciplinar',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  ATESTADO_MEDICO: 'Atestado médico',
  BENEFICIOS_VIAGEM: 'Benefícios de viagem',
  FERIAS: 'Férias',
  HORA_EXTRA: 'Hora extra',
  OUTRAS_SOLICITACOES: 'Outras solicitações',
  RESCISAO: 'Rescisão',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
  ADM_OUTROS: 'Outros',
};

export const ADM_SIMPLE_TYPES = [
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
] as const;

export const URGENCY_LABELS: Record<DpUrgency, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando Aprovação',
  IN_REVIEW_DP: 'Em Análise',
  IN_FINANCEIRO: 'No Financeiro',
  WAITING_RETURN: 'Sua Pendência',
  WAITING_RETURN_ACCOUNTING: 'Pendência Contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência Engenharia',
  WAITING_SUPPLIES: 'Aguardando Setor de Suprimentos',
  WAITING_PAYMENT: 'Aguardando Pagamento',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

/** Tipos que, ao finalizar, geram um pedido no Atendimento Contábil (igual ao web). */
const DP_TYPES_SENT_TO_ACCOUNTING = new Set([
  'ADMISSAO',
  'FERIAS',
  'RESCISAO',
  'ALTERACAO_FUNCAO_SALARIO',
  'RETIFICACAO_ALOCACAO',
]);

export const DP_SENT_TO_ACCOUNTING_LABEL = 'Na Contabilidade';

export function dpRequestIsSentToAccounting(requestType: string | null | undefined): boolean {
  return !!requestType && DP_TYPES_SENT_TO_ACCOUNTING.has(requestType);
}

/** Rótulo do status: nos tipos que vão para a Contabilidade, "Finalizada" aparece como "Na Contabilidade" (como no web). */
export function dpStatusLabel(status: string, requestType?: string | null): string {
  if (status === 'CONCLUDED' && dpRequestIsSentToAccounting(requestType)) {
    return DP_SENT_TO_ACCOUNTING_LABEL;
  }
  return (STATUS_LABELS as Record<string, string>)[status] || status;
}

export function isAdmTstRequestType(requestType: string): boolean {
  return requestType.startsWith('ADM_');
}

export function destinationLabel(requestType: string): string {
  return isAdmTstRequestType(requestType) ? 'Administração' : 'Departamento Pessoal';
}

/**
 * Tipos criados direto para a Contabilidade (sem gestor/DP). Não são "solicitações internas":
 * no web ficam na tela da Contabilidade e aqui não entram na lista nem nos avisos.
 */
const ACCOUNTING_DIRECT_TYPES = new Set([
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
]);

export function isAccountingDirectRequestType(requestType: string): boolean {
  return ACCOUNTING_DIRECT_TYPES.has(requestType);
}

export async function fetchMyDpRequests(status = 'all'): Promise<DpRequest[]> {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  const res = await api.get(`/api/solicitacoes-dp/minhas${q}`);
  const lista = (await readApiData<DpRequest[]>(res)) || [];
  return lista.filter((r) => !isAccountingDirectRequestType(r.requestType));
}

export async function fetchEligibleContracts(): Promise<DpEligibleContract[]> {
  const res = await api.get('/api/solicitacoes-dp/contratos-elegiveis');
  return (await readApiData<DpEligibleContract[]>(res)) || [];
}

export async function fetchEligibleCostCenters(): Promise<DpEligibleCostCenter[]> {
  const res = await api.get('/api/solicitacoes-dp/centros-custo-elegiveis');
  return (await readApiData<DpEligibleCostCenter[]>(res)) || [];
}

export async function fetchPayrollEmployees(): Promise<PayrollEmployeeOption[]> {
  const n = new Date();
  const params = new URLSearchParams({
    month: String(n.getMonth() + 1),
    year: String(n.getFullYear()),
    limit: '500',
    page: '1',
  });
  const res = await api.get(`/api/payroll/employees?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || 'Erro ao carregar colaboradores');
  }
  return (json?.data?.employees ?? []) as PayrollEmployeeOption[];
}

export async function createDpRequest(payload: {
  urgency: DpUrgency;
  requestType: DpRequestType;
  contractId?: string;
  costCenterId?: string;
  company?: string;
  polo?: string;
  prazoInicio?: string;
  prazoFim?: string;
  details?: Record<string, unknown>;
}): Promise<DpRequest> {
  const res = await api.post('/api/solicitacoes-dp', payload);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const details =
      Array.isArray(json?.details) && json.details[0]?.message
        ? json.details.map((d: any) => d.message).join('; ')
        : null;
    throw new Error(details || json?.error || json?.message || 'Falha ao criar solicitação');
  }
  const json = await res.json();
  return json.data as DpRequest;
}

export async function submitRequesterReturn(id: string, comment: string): Promise<DpRequest> {
  const res = await api.put(`/api/solicitacoes-dp/${id}/requester-return`, { comment });
  return readApiData<DpRequest>(res);
}
