import { getTotvsRmRelatorioFinService } from '../services/TotvsRmRelatorioFinService';

/** Caminhos testados em ordem; consultas "visíveis a todas coligadas" costumam responder em 0/. */
export function rmConsultaPaths(code: string, envVar: string): string[] {
  const custom = (process.env[envVar] || '').trim();
  if (custom) return [custom];
  const base = `/api/framework/v1/consultaSQLServer/RealizaConsulta/${code}`;
  return [`${base}/1/T`, `${base}/0/T`, `${base}/1/G`, `${base}/0/G`];
}

export async function fetchRmConsultaRows(code: string, envVar: string): Promise<Record<string, unknown>[]> {
  const service = getTotvsRmRelatorioFinService();
  let lastError: Error | null = null;
  for (const pathRel of rmConsultaPaths(code, envVar)) {
    try {
      return await service.fetchRowsForPath(pathRel);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!/HTTP (401|403|404|500)/.test(lastError.message)) throw lastError;
    }
  }
  throw lastError ?? new Error(`Falha ao buscar ${code} no TOTVS RM`);
}

export function normRmKey(key: string): string {
  return key.toUpperCase().replace(/[\s_./-]/g, '');
}

export function pickRmField(row: Record<string, unknown>, ...aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const hit = keys.find((k) => normRmKey(k) === normRmKey(alias));
    if (hit != null && row[hit] != null && String(row[hit]).trim()) return String(row[hit]).trim();
  }
  return '';
}
