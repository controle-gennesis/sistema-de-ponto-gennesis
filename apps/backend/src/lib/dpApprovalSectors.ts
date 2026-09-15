import { ASO_SETORES } from './asoFuncao';

const DF_ADM_LOCAL_KEY = 'df adm local';

export function normalizeLabelKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Contrato/centro de custo da sede administrativa do DF. */
export function isDfAdmLocalLabel(...parts: Array<string | null | undefined>): boolean {
  for (const part of parts) {
    if (!part) continue;
    const n = normalizeLabelKey(part);
    if (!n) continue;
    if (n === DF_ADM_LOCAL_KEY || n.includes(DF_ADM_LOCAL_KEY)) return true;
  }
  return false;
}

export function sanitizeDpApprovalSectors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const key = item.trim().toLowerCase();
    if (!key) continue;
    const canonical = ASO_SETORES.find((setor) => setor.toLowerCase() === key);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export function parseDpApprovalSectorsMap(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [contractId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!contractId) continue;
    const sectors = sanitizeDpApprovalSectors(value);
    if (sectors.length > 0) out[contractId] = sectors;
  }
  return out;
}

export function sectorSolicitanteMatches(allowedSectors: string[], sectorSolicitante: string | null | undefined): boolean {
  if (allowedSectors.length === 0) return true;
  const key = (sectorSolicitante ?? '').trim().toLowerCase();
  if (!key) return false;
  return allowedSectors.some((setor) => setor.toLowerCase() === key);
}
