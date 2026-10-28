export type PoloFd = 'DF' | 'GO';

export type DemandSheetApprovalStatus =
  | 'WAITING_MANAGER'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type DemandSheetPurchaseStatus =
  | 'WAREHOUSE_DF'
  | 'WAREHOUSE_GO'
  | 'FULLY_FULFILLED_BY_STOCK'
  | 'PARTIALLY_FULFILLED_BY_STOCK'
  | 'PURCHASE_REQUEST'
  | 'QUOTATION'
  | 'SUPPLIES'
  | 'FINISHED'
  | 'CANCELLED';

/** Status que podem ser escolhidos hoje. "Almoxarifado" usa o valor WAREHOUSE_DF (o GO antigo segue válido). */
export const FD_PURCHASE_STATUS_OPTIONS: {
  value: DemandSheetPurchaseStatus;
  label: string;
}[] = [
  { value: 'WAREHOUSE_DF', label: 'Almoxarifado' },
  { value: 'QUOTATION', label: 'Cotação' },
  { value: 'FINISHED', label: 'Finalizado' },
  { value: 'CANCELLED', label: 'Cancelado' },
];

/** Rótulos de todos os valores, inclusive os que não são mais selecionáveis (fichas antigas). */
export const FD_PURCHASE_STATUS_LABELS: Record<DemandSheetPurchaseStatus, string> = {
  WAREHOUSE_DF: 'Almoxarifado',
  WAREHOUSE_GO: 'Almoxarifado',
  FULLY_FULFILLED_BY_STOCK: 'Atendida totalmente pelo estoque',
  PARTIALLY_FULFILLED_BY_STOCK: 'Atendida parcialmente pelo estoque',
  PURCHASE_REQUEST: 'Cotação',
  QUOTATION: 'Cotação',
  SUPPLIES: 'Cotação',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export function fdPurchaseStatusBadgeClass(status: DemandSheetPurchaseStatus | null | undefined): string {
  if (!status) {
    // Sem status de compras = "Fila" (mesma cor do card).
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  switch (status) {
    case 'FINISHED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'PURCHASE_REQUEST':
    case 'SUPPLIES':
    case 'QUOTATION':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'FULLY_FULFILLED_BY_STOCK':
    case 'PARTIALLY_FULFILLED_BY_STOCK':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
}

export function purchaseStatusLabel(value: DemandSheetPurchaseStatus | null | undefined): string {
  if (!value) return 'Fila';
  return FD_PURCHASE_STATUS_LABELS[value] ?? value;
}

export type PedidosStatus = 'PENDENTE' | 'PARCIAL' | 'COMPLETO';

const PEDIDOS_STATUS_LABELS: Record<PedidosStatus, string> = {
  PENDENTE: 'Pendente',
  PARCIAL: 'Pedido parcialmente',
  COMPLETO: 'Pedido completo',
};

export function pedidosStatusLabel(value: PedidosStatus | null | undefined): string {
  if (!value) return 'Pendente';
  return PEDIDOS_STATUS_LABELS[value] ?? value;
}

export function pedidosStatusBadgeClass(value: PedidosStatus | null | undefined): string {
  switch (value) {
    case 'COMPLETO':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'PARCIAL':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

export type FdAnexoKind = 'orcamento' | 'fd' | 'oc' | 'outro';

export interface FdAnexo {
  id: string;
  name: string;
  url?: string;
  kind?: string;
  sourcePath?: string;
  /** ID da ordem de compra a que o anexo pertence (Cotação aceita várias). */
  ocRef?: string;
  /** Texto livre dizendo o que é o anexo (Demais anexos). */
  descricao?: string;
}

export function fdAnexoKindLabel(kind?: string): string {
  if (kind === 'orcamento') return 'Orçamento';
  if (kind === 'fd') return 'Ficha de demanda';
  if (kind === 'oc') return 'Ordem de compra';
  return 'Anexo';
}

export function inferFdAnexoKind(anexo: FdAnexo | undefined): FdAnexoKind | 'orcamento-ref' | undefined {
  if (!anexo) return undefined;
  if (anexo.kind === 'orcamento' || anexo.kind === 'fd' || anexo.kind === 'oc' || anexo.kind === 'outro') {
    return anexo.kind;
  }
  if (anexo.kind === 'orcamento-ref') return 'orcamento-ref';
  const n = String(anexo.name || '').toUpperCase();
  if (/ORDEM\s*DE\s*COMPRA|ANEXO[_-]?OC|(?:^|[_-])OC(?:[_-]|\d)/.test(n)) return 'oc';
  if (/(?:^|[^A-Z])FD(?:[^A-Z]|$)|FICHA\s*DE\s*DEMANDA|ANEXO[_-]?FD/.test(n)) return 'fd';
  if (/OR[CÇ]AMENTO|ANEXO[_-]?RM|(?:^|[_-])RM(?:[_-]|$)/.test(n)) return 'orcamento';
  return 'outro';
}

export function findAnexoByKind(anexos: FdAnexo[] | undefined, kind: 'orcamento' | 'fd'): FdAnexo | undefined {
  return (anexos ?? []).find((a) => inferFdAnexoKind(a) === kind);
}

export function anexosDemais(anexos: FdAnexo[] | undefined): FdAnexo[] {
  return (anexos ?? []).filter((a) => {
    const kind = inferFdAnexoKind(a);
    return kind !== 'orcamento' && kind !== 'fd' && kind !== 'oc' && kind !== 'orcamento-ref';
  });
}

export function formatFichaDemandaPct(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

export function fdOrcamentoVinculo(
  record: Pick<FichaDemandaApprovalRecord, 'orcamentoId' | 'orcamentoCentroCustoId' | 'contratoCostCenterId'>
): { orcamentoId: string; centroCustoId: string } | null {
  const orcamentoId = String(record.orcamentoId || '').trim();
  const centroCustoId = String(
    record.orcamentoCentroCustoId || record.contratoCostCenterId || ''
  ).trim();
  if (!orcamentoId || !centroCustoId) return null;
  return { orcamentoId, centroCustoId };
}

export function anexosOrdemCompra(anexos: FdAnexo[] | undefined): FdAnexo[] {
  return (anexos ?? []).filter((a) => inferFdAnexoKind(a) === 'oc');
}

export function upsertAnexoObrigatorio(
  anexos: FdAnexo[],
  kind: 'orcamento' | 'fd',
  next: FdAnexo | null
): FdAnexo[] {
  const rest = anexos.filter((a) => a.kind !== kind);
  return next ? [...rest, { ...next, kind }] : rest;
}

export interface FichaDemandaApprovalRecord {
  id: string;
  numMovRm: string;
  idMovRm: string;
  scNumero?: string | null;
  scId?: string | null;
  ocId?: string | null;
  codigoPedido: string;
  solicitanteId: string;
  /** Número sequencial automático da lista (1, 2, 3…). */
  displayNumber?: number | null;
  solicitanteNome: string;
  contratoId: string;
  contratoNome: string;
  obra: string;
  codFichaDemanda: string;
  faturamentoEstimado: number | string;
  custoEstimado: number | string;
  observacao: string;
  dataHora: string;
  polo: PoloFd;
  anexos: FdAnexo[];
  status: DemandSheetApprovalStatus;
  purchaseStatus?: DemandSheetPurchaseStatus | null;
  purchaseStatusUpdatedAt?: string | null;
  purchaseStatusUpdaterNome?: string | null;
  purchaseCancellationNote?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  managerRejectionComment?: string | null;
  managerApproverNome?: string | null;
  createdAt: string;
  updatedAt: string;
  orcamentoId?: string | null;
  orcamentoCentroCustoId?: string | null;
  contratoCostCenterId?: string | null;
  fichaDemandaPct?: number | null;
  pedidosStatus?: 'PENDENTE' | 'PARCIAL' | 'COMPLETO';
  pedidosEncerrados?: boolean;
  /** Itens da FD já pedidos em RMs geradas pelo modal de associação (vazio = nenhum pedido pela FD). */
  itensPedidos?: unknown[];
  /** Custo real (OCs enviadas ao TOTVS) dos itens pedidos pela FD; null quando ainda não há pedidos. */
  custoReal?: number | null;
  /** Centro de custo da FD (o do contrato) — agrupamento da lista. */
  centroCustoNome?: string | null;
  /** OS e nº da pasta da importação do orçamento de origem ("OS - Nº123"). */
  osNumeroPasta?: string | null;
  /** Soma das OCs pagas (validadas pelo compras no G4), cada OC uma vez, pelo total da OC. */
  totalPagoOcs?: number;
  /** false quando o orçamento de origem foi excluído; null quando a FD não tem orçamento vinculado. */
  orcamentoExiste?: boolean | null;
}

export interface FichaDemandaApprovalFormState {
  rmFeita: boolean | null;
  numMovRm: string;
  idMovRm: string;
  codigoPedido: string;
  solicitanteId: string;
  contratoId: string;
  obra: string;
  codFichaDemanda: string;
  faturamentoEstimado: string;
  custoEstimado: string;
  observacao: string;
  dataHora: string;
  polo: PoloFd | '';
  anexos: FdAnexo[];
}

export const FD_STATUS_LABELS: Record<DemandSheetApprovalStatus, string> = {
  WAITING_MANAGER: 'Pendente de aprovação',
  APPROVED: 'Aprovada',
  REJECTED: 'Reprovada',
  CANCELLED: 'Cancelada',
};

export function fdStatusBadgeClass(status: DemandSheetApprovalStatus): string {
  switch (status) {
    case 'WAITING_MANAGER':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'APPROVED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'REJECTED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}

export function formatDateTimePtBr(date: Date = new Date()): string {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function parseCurrencyToNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value?.toString().trim()) return 0;
  const s = String(value).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

export function formatCurrencyInput(value: number): string {
  if (!value) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function currencyDigitsToFormatted(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return formatCurrencyInput(parseInt(digits, 10) / 100);
}

export function adjustCurrency(value: string, deltaCents: number): string {
  const current = Math.round(parseCurrencyToNumber(value) * 100);
  const next = Math.max(0, current + deltaCents);
  return formatCurrencyInput(next / 100);
}

export function emptyFichaDemandaForm(): FichaDemandaApprovalFormState {
  return {
    rmFeita: null,
    numMovRm: '',
    idMovRm: '',
    codigoPedido: '',
    solicitanteId: '',
    contratoId: '',
    obra: '',
    codFichaDemanda: '',
    faturamentoEstimado: '',
    custoEstimado: '',
    observacao: '',
    dataHora: formatDateTimePtBr(),
    polo: '',
    anexos: [],
  };
}

export function recordToForm(record: FichaDemandaApprovalRecord): FichaDemandaApprovalFormState {
  const fat =
    typeof record.faturamentoEstimado === 'number'
      ? formatCurrencyInput(record.faturamentoEstimado)
      : String(record.faturamentoEstimado || '');
  const custo =
    typeof record.custoEstimado === 'number'
      ? formatCurrencyInput(record.custoEstimado)
      : String(record.custoEstimado || '');

  return {
    rmFeita: !!(record.numMovRm || record.idMovRm),
    numMovRm: record.numMovRm,
    idMovRm: record.idMovRm,
    codigoPedido: record.codigoPedido,
    solicitanteId: record.solicitanteId,
    contratoId: record.contratoId,
    obra: record.obra,
    codFichaDemanda: record.codFichaDemanda,
    faturamentoEstimado: fat,
    custoEstimado: custo,
    observacao: record.observacao,
    dataHora: record.dataHora,
    polo: record.polo,
    anexos: record.anexos || [],
  };
}

export function validateFichaDemandaForm(form: FichaDemandaApprovalFormState): string | null {
  if (form.rmFeita === null) return 'Informe se a RM foi feita no TOTVS.';
  if (form.rmFeita) {
    if (!form.numMovRm.trim()) return 'Informe o Número de Movimento da RM.';
    if (!form.idMovRm.trim()) return 'Informe o ID de Movimento da RM.';
  }
  if (!form.codigoPedido.trim()) return 'Informe o Código do Pedido.';
  if (!form.contratoId.trim()) return 'Selecione o contrato.';
  if (!form.obra.trim()) return 'Selecione a obra.';
  if (!form.codFichaDemanda.trim()) return 'Informe o Código da Ficha de Demanda.';
  if (!form.faturamentoEstimado.trim()) return 'Informe o Faturamento Estimado.';
  if (!form.custoEstimado.trim()) return 'Informe o Custo Estimado.';
  if (!form.observacao.trim()) return 'Informe a observação.';
  if (!form.polo) return 'Selecione o polo.';
  if (!findAnexoByKind(form.anexos, 'orcamento')?.url) return 'Anexe o orçamento.';
  if (!findAnexoByKind(form.anexos, 'fd')?.url) return 'Anexe a ficha de demanda.';
  return null;
}

export function formToApiPayload(form: FichaDemandaApprovalFormState) {
  return {
    numMovRm: form.numMovRm.trim(),
    idMovRm: form.idMovRm.trim(),
    codigoPedido: form.codigoPedido.trim(),
    contratoId: form.contratoId,
    obra: form.obra.trim(),
    codFichaDemanda: form.codFichaDemanda.trim(),
    faturamentoEstimado: parseCurrencyToNumber(form.faturamentoEstimado),
    custoEstimado: parseCurrencyToNumber(form.custoEstimado),
    observacao: form.observacao.trim(),
    dataHora: form.dataHora,
    polo: form.polo,
    anexos: form.anexos,
  };
}

export function formatCurrencyDisplay(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : parseCurrencyToNumber(String(value ?? ''));
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
