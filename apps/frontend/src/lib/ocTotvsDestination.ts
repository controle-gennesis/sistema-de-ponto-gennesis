export type OcDestination = 'CONECTA' | 'TOTVS';

/** CCs que continuam o fluxo de OC no Conecta. Demais vão por POST ao TOTVS. */
export const OC_DESTINATION_CONECTA_COST_CENTERS = [
  'UNB - CONSÓRCIO PREDIAL BRASILIA',
  'HUB - CONSÓRCIO PREDIAL HUB',
] as const;

function normalizeCostCenterLabel(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const CONECTA_CC_NORMALIZED = OC_DESTINATION_CONECTA_COST_CENTERS.map(normalizeCostCenterLabel);

export function resolveOcDestinationFromCostCenter(
  name?: string | null,
  code?: string | null
): OcDestination {
  const labels = [name, code].filter((v): v is string => Boolean(v?.trim())).map(normalizeCostCenterLabel);
  const staysOnConecta = labels.some((label) =>
    CONECTA_CC_NORMALIZED.some((cc) => label === cc || label.includes(cc))
  );
  return staysOnConecta ? 'CONECTA' : 'TOTVS';
}

/** Cadastro UNB Predial Brasília ou HUB Predial — sem card de orçamentos no contrato. */
export function isPredialConsorcioCostCenter(
  name?: string | null,
  code?: string | null
): boolean {
  return resolveOcDestinationFromCostCenter(name, code) === 'CONECTA';
}

export function ocDestinationLabel(destination: OcDestination): string {
  return destination === 'CONECTA' ? 'OC no Conecta' : 'POST no TOTVS';
}

export const TOTVS_FREIGHT_TYPES = [
  { code: 'T', label: 'Terceiros' },
  { code: 'C', label: 'CIF' },
  { code: 'F', label: 'FOB' },
  { code: 'S', label: 'Sem Frete' },
  { code: 'R', label: 'Transp. Próprio Remetente' },
  { code: 'D', label: 'Transp. Próprio Destinatário' },
] as const;

export const TOTVS_OC_PAYMENT_AVISTA = '001';
export const TOTVS_OC_PAYMENT_AVISTA_LABEL = '001 — A VISTA SEM PRAZO';

export const TOTVS_OC_FILIAL_DF = 1;
export const TOTVS_OC_FILIAL_GO = 5;

export const TOTVS_OC_FILIAL_OPTIONS = [
  { value: '1', label: '1 — Distrito Federal' },
  { value: '5', label: '5 — Goiás' },
] as const;

export function parseTotvsFilial(value: unknown): number {
  return Number(value) === TOTVS_OC_FILIAL_GO ? TOTVS_OC_FILIAL_GO : TOTVS_OC_FILIAL_DF;
}

export function resolveTotvsFilialFromCostCenter(cc?: {
  polo?: string | null;
  state?: string | null;
  name?: string | null;
} | null): number {
  const hay = [cc?.polo, cc?.state, cc?.name].filter((v) => v && String(v).trim()).join(' ');
  const u = hay
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (/\bGO\b/.test(u) || u.includes('GOIAS')) return TOTVS_OC_FILIAL_GO;
  return TOTVS_OC_FILIAL_DF;
}

export function totvsFilialLabel(code?: string | number | null): string {
  const value = String(parseTotvsFilial(code));
  return TOTVS_OC_FILIAL_OPTIONS.find((row) => row.value === value)?.label || value;
}

export function totvsFreightTypeLabel(code?: string | null): string {
  const row = TOTVS_FREIGHT_TYPES.find((item) => item.code === code);
  return row ? row.label : '';
}
