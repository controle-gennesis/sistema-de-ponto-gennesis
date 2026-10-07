import api from '@/lib/api';

export type OrcamentoOsSyncMode = 'create' | 'revisao' | 'aditivo';

export type OrcamentoOsSyncInput = {
  contractId: string;
  osCodigo: string;
  numeroPasta: string;
  serviceDescription: string;
  valor: number;
  isAditivo: boolean;
  confirmValor: boolean;
  confirmSomarAditivo?: boolean;
  mode?: OrcamentoOsSyncMode;
  startDate?: string | null;
  endDate?: string | null;
  orcamentoId?: string | null;
};

export type OrcamentoOsSyncResult = {
  id: string;
  divSe: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  action: 'created' | 'revised' | 'additive';
};

/** Mantém compatibilidade com o campo antigo `osNumeroPasta`. */
export function composeOsNumeroPasta(osCodigo: string, numeroPasta: string): string {
  const os = osCodigo.trim();
  const pasta = numeroPasta.trim();
  if (os && pasta) return `${os} - Nº${pasta}`;
  return os || pasta;
}

/** Separa o texto legado "OS/Nº da pasta" em dois campos. */
export function splitOsNumeroPasta(raw: string): { osCodigo: string; numeroPasta: string } {
  const s = String(raw || '').trim();
  if (!s) return { osCodigo: '', numeroPasta: '' };
  const m = s.match(/^(.+?)\s*[-–]\s*(?:n[ºo°.]?\s*)?(\d+)\s*$/i);
  if (m) return { osCodigo: m[1].trim(), numeroPasta: m[2].trim() };
  const m2 = s.match(/^(.*?)\s*[|/]\s*(?:n[ºo°.]?\s*pasta\s*)?(\d+)\s*$/i);
  if (m2) return { osCodigo: m2[1].trim(), numeroPasta: m2[2].trim() };
  return { osCodigo: s, numeroPasta: '' };
}

export function formatOrcamentoValorBr(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseOrcamentoValorBr(raw: string): number {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

export async function syncOrcamentoOsToContract(
  input: OrcamentoOsSyncInput
): Promise<OrcamentoOsSyncResult> {
  const res = await api.post(`/contracts/${input.contractId}/pleitos/sync-from-orcamento`, {
    divSe: input.osCodigo.trim(),
    folderNumber: input.numeroPasta.trim(),
    serviceDescription: input.serviceDescription.trim(),
    valor: input.valor,
    isAditivo: input.isAditivo,
    confirmValor: input.confirmValor,
    confirmSomarAditivo: input.confirmSomarAditivo === true,
    mode: input.mode || (input.isAditivo ? 'aditivo' : 'create'),
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    orcamentoId: input.orcamentoId || null,
  });
  return res.data?.data as OrcamentoOsSyncResult;
}

export function syncOrcamentoOsErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const msg = (error as { response?: { data?: { message?: string; error?: string } } }).response
      ?.data?.message
      || (error as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (msg) return msg;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível criar/atualizar a OS no contrato.';
}
