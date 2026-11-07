import { prisma } from './prisma';

/**
 * Fase atual da OC no Fluig (G3 = aprovação da OC, G4 = pagamento), pelo IdMov da OC no TOTVS.
 * Lê só o espelho do Fluig no Conecta (fluig_dataset_mirror_rows) — nenhuma chamada ao Fluig/TOTVS.
 * O G4 nasce depois que o G3 termina, então quando o IdMov está nos dois vale o G4.
 */
const G3_DATASET_ID = 'DataSet_G3FollowUp';
const G4_DATASET_ID = 'DataSet_G4FollowUp';

export type FluigOcFase = { fluxo: 'G3' | 'G4'; etapa: string };

type CacheDataset = { syncedAt: number; fases: Map<number, string> };
const cache = new Map<string, CacheDataset>();

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

function acharColuna(keys: string[], padroes: RegExp[]): string | null {
  for (const re of padroes) {
    const k = keys.find((c) => re.test(c.trim()));
    if (k) return k;
  }
  return null;
}

/** Mesmos rótulos da tela Gestão de Solicitações (Fluig). */
function rotuloEtapaG3(bruto: string): string {
  if (/Etapa\s*108\b/i.test(bruto)) return 'Análise Controladoria';
  if (/Etapa\s*117\b/i.test(bruto)) return 'Validação de Frete';
  if (/Etapa\s*10\b/i.test(bruto)) return 'Finalizada';
  const l = normalizar(bruto);
  if (/gestor\s+de\s+compras/.test(l) || /aprovacao\s+do\s+compras/.test(l)) return 'Aprovação do Compras';
  if (/setor\s+tecnico/.test(l)) return 'Aprovação do Setor Técnico';
  if (/diretoria/.test(l)) return 'Aprovação da Diretoria';
  if (/estoque/.test(l)) return 'Aprovação de Estoque';
  if (/recotacao/.test(l)) return 'Recotação';
  if (/finalizada/.test(l)) return 'Finalizada';
  if (/frete/.test(l)) return 'Validação de Frete';
  return bruto;
}

function rotuloEtapaG4(bruto: string): string {
  if (/Etapa\s*24\b/i.test(bruto) || /Etapa\s*147\b/i.test(bruto)) return 'Finalizada';
  const l = normalizar(bruto);
  if (l.includes('finalizada')) return 'Finalizada';
  if (l.includes('nota fiscal')) return 'Anexar Nota Fiscal';
  if (l.includes('validacao')) return 'Validação Compras';
  if (l.includes('comprovante')) return 'Anexar Comprovante';
  return bruto;
}

async function fasesDoDataset(
  datasetId: string,
  rotulo: (bruto: string) => string
): Promise<Map<number, string>> {
  let meta: { syncedAt: Date } | null = null;
  try {
    meta = await prisma.fluigDatasetMirrorMeta.findUnique({
      where: { datasetId },
      select: { syncedAt: true },
    });
  } catch {
    return new Map();
  }
  if (!meta) return new Map();
  const emCache = cache.get(datasetId);
  if (emCache && emCache.syncedAt === meta.syncedAt.getTime()) return emCache.fases;

  const rows = await prisma.fluigDatasetMirrorRow.findMany({
    where: { datasetId },
    select: { payload: true },
  });
  const fases = new Map<number, string>();
  for (const r of rows) {
    const row = (r.payload ?? {}) as Record<string, unknown>;
    const keys = Object.keys(row);
    const idCol = acharColuna(keys, [/^idmov$/i]);
    const etapaCol = acharColuna(keys, [/^etapa_?atual$/i, /^fase_?atual$/i, /^status$/i]);
    if (!idCol || !etapaCol) continue;
    const idMov = Number(textoCelula(row[idCol]).replace(/\D/g, ''));
    const etapa = textoCelula(row[etapaCol]);
    if (!Number.isInteger(idMov) || idMov <= 0 || !etapa) continue;
    fases.set(idMov, rotulo(etapa));
  }
  cache.set(datasetId, { syncedAt: meta.syncedAt.getTime(), fases });
  return fases;
}

/** IdMov → fase atual no Fluig (G4 quando já existe, senão G3). */
export async function fasesFluigDasOcs(idMovs: Iterable<number | null | undefined>): Promise<Map<number, FluigOcFase>> {
  const alvo = new Set<number>();
  for (const id of idMovs) if (typeof id === 'number' && id > 0) alvo.add(id);
  const out = new Map<number, FluigOcFase>();
  if (alvo.size === 0) return out;

  const [g3, g4] = await Promise.all([
    fasesDoDataset(G3_DATASET_ID, rotuloEtapaG3),
    fasesDoDataset(G4_DATASET_ID, rotuloEtapaG4),
  ]);
  for (const id of alvo) {
    const etapaG4 = g4.get(id);
    if (etapaG4) {
      out.set(id, { fluxo: 'G4', etapa: etapaG4 });
      continue;
    }
    const etapaG3 = g3.get(id);
    if (etapaG3) out.set(id, { fluxo: 'G3', etapa: etapaG3 });
  }
  return out;
}
