import { prisma } from './prisma';

/**
 * OCs validadas pelo compras no G4 (Fluig - Processos, fluxo de pagamentos).
 * Lê só o espelho do Fluig no Conecta (fluig_dataset_mirror_rows) — nenhuma chamada ao Fluig/TOTVS.
 * A solicitação do G4 tem o mesmo IdMov da OC enviada ao TOTVS (movimento 1.1.26).
 */
const G4_DATASET_ID = 'DataSet_G4FollowUp';

let cache: { syncedAt: number; idMovs: Set<number> } | null = null;

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function textoCelula(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return String(o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? '').trim();
  }
  return String(value).trim();
}

/** Etapas do G4 depois da Validação Compras: Anexar Nota Fiscal e Finalizada. */
export function isEtapaG4ValidadaCompras(etapa: string): boolean {
  const l = normalizar(etapa);
  return l.includes('nota fiscal') || l.includes('finalizada');
}

function acharColuna(keys: string[], padroes: RegExp[]): string | null {
  for (const re of padroes) {
    const k = keys.find((c) => re.test(c.trim()));
    if (k) return k;
  }
  return null;
}

/** IdMovs (TOTVS) cujas solicitações no G4 já passaram da Validação Compras. */
export async function idMovsValidadosComprasG4(): Promise<Set<number>> {
  let meta: { syncedAt: Date } | null = null;
  try {
    meta = await prisma.fluigDatasetMirrorMeta.findUnique({
      where: { datasetId: G4_DATASET_ID },
      select: { syncedAt: true },
    });
  } catch {
    return new Set();
  }
  if (!meta) return new Set();
  if (cache && cache.syncedAt === meta.syncedAt.getTime()) return cache.idMovs;

  const rows = await prisma.fluigDatasetMirrorRow.findMany({
    where: { datasetId: G4_DATASET_ID },
    select: { payload: true },
  });
  const idMovs = new Set<number>();
  for (const r of rows) {
    const row = (r.payload ?? {}) as Record<string, unknown>;
    const keys = Object.keys(row);
    const idCol = acharColuna(keys, [/^idmov$/i]);
    const etapaCol = acharColuna(keys, [/^etapa_?atual$/i, /^fase_?atual$/i, /^status$/i]);
    if (!idCol || !etapaCol) continue;
    if (!isEtapaG4ValidadaCompras(textoCelula(row[etapaCol]))) continue;
    const idMov = Number(textoCelula(row[idCol]).replace(/\D/g, ''));
    if (Number.isInteger(idMov) && idMov > 0) idMovs.add(idMov);
  }
  cache = { syncedAt: meta.syncedAt.getTime(), idMovs };
  return idMovs;
}
