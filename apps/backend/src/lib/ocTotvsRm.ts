export type OcDestination = 'CONECTA' | 'TOTVS';

export const TOTVS_OC_CODTMV = '1.1.26';
export const TOTVS_OC_SERIE = 'OC';
export const TOTVS_OC_FILIAL = '1';
export const TOTVS_OC_FILIAL_DF = 1;
export const TOTVS_OC_FILIAL_GO = 5;
export const TOTVS_OC_PAYMENT_AVISTA = '001';

export function parseTotvsFilial(value: unknown): number | null {
  const n = Number(value);
  if (n === TOTVS_OC_FILIAL_GO) return TOTVS_OC_FILIAL_GO;
  if (n === TOTVS_OC_FILIAL_DF) return TOTVS_OC_FILIAL_DF;
  return null;
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

export const OC_DESTINATION_CONECTA_COST_CENTERS = [
  'UNB - CONSÓRCIO PREDIAL BRASILIA',
  'HUB - CONSÓRCIO PREDIAL HUB',
] as const;

export const TOTVS_FREIGHT_TYPES = [
  { code: 'T', label: 'Terceiros' },
  { code: 'C', label: 'CIF' },
  { code: 'F', label: 'FOB' },
  { code: 'S', label: 'Sem Frete' },
  { code: 'R', label: 'Transp. Próprio Remetente' },
  { code: 'D', label: 'Transp. Próprio Destinatário' },
] as const;

export type TotvsFreightTypeCode = (typeof TOTVS_FREIGHT_TYPES)[number]['code'];

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

export function isTotvsFreightType(code: string | null | undefined): code is TotvsFreightTypeCode {
  return TOTVS_FREIGHT_TYPES.some((row) => row.code === code);
}

/** Condição interna À vista → código TOTVS 001. */
export function toTotvsPaymentCondition(code: string | null | undefined, paymentType?: string | null): string {
  const raw = (code || '').trim();
  if (raw === TOTVS_OC_PAYMENT_AVISTA) return TOTVS_OC_PAYMENT_AVISTA;
  if (raw === 'AVISTA' || paymentType === 'AVISTA') return TOTVS_OC_PAYMENT_AVISTA;
  return raw;
}

export function totvsCodColigada(): number {
  const n = Number(process.env.TOTVS_RM_CODCOLIGADA || '1');
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** FCFO.CODCFO no RM costuma ter 9 dígitos (ex.: 000019582). */
export function toTotvsCodCfo(code: string | null | undefined): string {
  const raw = (code || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw) && raw.length < 9) return raw.padStart(9, '0');
  return raw;
}

/** Unidade do Conecta → código TUND do RM (UN, KG, M…). */
export function toTotvsUnit(unit?: string | null): string {
  const raw = (unit || '').trim();
  if (!raw) return '';
  const key = raw
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
  const map: Record<string, string> = {
    UN: 'UN',
    UND: 'UN',
    UNID: 'UN',
    UNIDADE: 'UN',
    KG: 'KG',
    KILO: 'KG',
    KILOS: 'KG',
    M: 'M',
    MT: 'M',
    METRO: 'M',
    METROS: 'M',
    M2: 'M2',
    M3: 'M3',
    PC: 'PC',
    PECA: 'PC',
    PECAS: 'PC',
    CX: 'CX',
    CAIXA: 'CX',
    L: 'L',
    LT: 'L',
    LITRO: 'L',
    HR: 'HR',
    H: 'HR',
    HORA: 'HR',
    CJ: 'CJ',
    CONJ: 'CJ',
    CONJUNTO: 'CJ',
    VB: 'VB',
  };
  if (map[key]) return map[key];
  if (/^[A-Z0-9]{1,5}$/.test(key)) return key;
  return key.slice(0, 5);
}
