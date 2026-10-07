import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { ensureConstructionMaterialTotvsIdPrd } from '../lib/ensureProductionSchema';
import { getTotvsRmRelatorioFinService } from './TotvsRmRelatorioFinService';

/** A cada 6h — catálogo muda pouco; evita sobrecarregar o RM. */
const DEFAULT_CRON = '0 */6 * * *';
const CREATE_BATCH = 80;
const UPDATE_BATCH = 40;

export type MaterialTotvsSyncResult = {
  fetched: number;
  mapped: number;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  durationMs: number;
};

let started = false;
let syncInFlight = false;
let lastSyncAt: Date | null = null;
let lastSyncResult: MaterialTotvsSyncResult | null = null;

type MappedProduct = {
  code: string;
  idPrd: number | null;
  name: string;
  unit: string;
  productType: string;
  isActive: boolean;
};

type LocalMaterial = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  unit: string;
  productType: string | null;
  totvsIdPrd: number | null;
  isActive: boolean;
};

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (v == null || v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'sim' || v === 'on';
}

function cell(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

function pickRow(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      return row[key];
    }
  }
  const wanted = new Set(keys.map((k) => k.toUpperCase().replace(/[\s_./-]/g, '')));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(k.toUpperCase().replace(/[\s_./-]/g, ''))) return v;
  }
  return undefined;
}

function parseFlagTruthy(raw: unknown): boolean | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (['1', 's', 'sim', 'true', 'ativo', 'a', 'yes', 'y'].includes(s)) return true;
  if (['0', 'n', 'nao', 'não', 'false', 'inativo', 'i', 'no'].includes(s)) return false;
  return null;
}

/** ATIVO=1 ativo; INATIVO=1 inativo (coluna invertida no RM). */
function parseProdutoAtivo(row: Record<string, unknown>): boolean {
  const ativoRaw = pickRow(row, 'ATIVO', 'ATIVOYN', 'FLDATIVO', 'ACTIVE');
  const ativo = parseFlagTruthy(ativoRaw);
  if (ativo != null) return ativo;

  const inativoRaw = pickRow(row, 'INATIVO', 'INATIVOYN', 'FLDINATIVO', 'INACTIVE');
  const inativo = parseFlagTruthy(inativoRaw);
  if (inativo != null) return !inativo;

  const status = cell(pickRow(row, 'STATUS', 'SITUACAO', 'SITUAÇÃO', 'SITPRODUTO'));
  if (status) {
    const s = status.toLowerCase();
    if (/inativ|desativ|bloque|cancel/.test(s)) return false;
    if (/ativ|liber/.test(s)) return true;
  }
  return true;
}

function normalizeCodeKey(code: string): string {
  const t = code.trim();
  if (/^\d+$/.test(t)) return (t.replace(/^0+/, '') || '0');
  return t.toUpperCase();
}

function normalizeNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

function parseIdPrd(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function mapRmRow(row: Record<string, unknown>): MappedProduct | null {
  const code = cell(
    pickRow(row, 'CODIGOPRD', 'CODIGO', 'CODPRD', 'CODPRODUTO', 'CODE', 'CODIGO PRODUTO')
  );
  const name = cell(
    pickRow(
      row,
      'NOMEFANTASIA',
      'DESCRICAO',
      'DESCRIÇÃO',
      'NOMEPRD',
      'NOME',
      'PRODUTO',
      'DESCPRODUTO'
    )
  );
  if (!code || !name) return null;

  const idPrd = parseIdPrd(pickRow(row, 'IDPRD', 'IDPRDUTO', 'IDPRODUTO', 'IDPROD'));
  const unit =
    cell(pickRow(row, 'CODUND', 'CODUNDCOMPRA', 'UNIDADE', 'CODUM', 'UN', 'UND')) || 'UN';
  const tipoRaw = cell(pickRow(row, 'TIPOPRODUTO', 'TIPO', 'PRODUCTTYPE'));
  const productType =
    tipoRaw && /servi[cç]o/i.test(tipoRaw) ? 'Serviço' : 'Produto';

  return {
    code,
    idPrd,
    name,
    unit,
    productType,
    isActive: parseProdutoAtivo(row),
  };
}

async function syncEngineeringMaterial(material: {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  isActive: boolean;
}) {
  const sinapiCode = `CM-${material.id}`;
  const engName = material.name;
  const engDescription = material.description || material.name;

  const existing = await prisma.engineeringMaterial.findUnique({
    where: { sinapiCode },
  });

  if (existing) {
    await prisma.engineeringMaterial.update({
      where: { sinapiCode },
      data: {
        name: engName,
        description: engDescription,
        unit: material.unit,
        isActive: material.isActive,
      },
    });
    return;
  }

  await prisma.engineeringMaterial.create({
    data: {
      sinapiCode,
      name: engName,
      description: engDescription,
      unit: material.unit,
      isActive: material.isActive,
    },
  });
}

function needsUpdate(
  existing: LocalMaterial,
  m: MappedProduct,
  nextCode: string | null,
  nextIdPrd: number | null
): boolean {
  return (
    (existing.code || null) !== (nextCode || null) ||
    existing.name !== m.name ||
    existing.unit !== m.unit ||
    (existing.productType || null) !== m.productType ||
    existing.totvsIdPrd !== nextIdPrd ||
    existing.isActive !== m.isActive
  );
}

/**
 * Busca PRODUTOS no TOTVS RM e faz upsert local:
 * 1) por totvsIdPrd (IDPRD)
 * 2) por código (CODIGOPRD)
 * 3) por nome exato único (só para alinhar código sem criar duplicata)
 *
 * Nunca apaga materiais locais. OCs continuam apontando para o mesmo id.
 */
export async function runMaterialTotvsSync(
  trigger: 'cron' | 'boot' | 'manual' = 'cron'
): Promise<MaterialTotvsSyncResult | null> {
  if (syncInFlight) {
    console.log(`[material-totvs] sync já em andamento (trigger=${trigger}) — ignorado`);
    return null;
  }

  const rm = getTotvsRmRelatorioFinService();
  if (!rm.isConfigured()) {
    console.warn('[material-totvs] TOTVS RM não configurado — sync ignorado');
    return null;
  }

  syncInFlight = true;
  const startedAt = Date.now();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let conflicts = 0;

  try {
    await ensureConstructionMaterialTotvsIdPrd(prisma);
    console.log(`[material-totvs] iniciando sync (${trigger})…`);

    const rows = await rm.fetchProdutosAtivosRows();
    const mapped: MappedProduct[] = [];
    const seenCodes = new Set<string>();
    const seenIdPrd = new Set<number>();

    for (const row of rows) {
      if (!row || typeof row !== 'object') {
        skipped += 1;
        continue;
      }
      const m = mapRmRow(row as Record<string, unknown>);
      if (!m) {
        skipped += 1;
        continue;
      }
      const codeKey = normalizeCodeKey(m.code);
      if (seenCodes.has(codeKey)) {
        const idx = mapped.findIndex((x) => normalizeCodeKey(x.code) === codeKey);
        if (idx >= 0) mapped[idx] = m;
        continue;
      }
      if (m.idPrd != null && seenIdPrd.has(m.idPrd)) {
        const idx = mapped.findIndex((x) => x.idPrd === m.idPrd);
        if (idx >= 0) {
          seenCodes.delete(normalizeCodeKey(mapped[idx].code));
          mapped[idx] = m;
          seenCodes.add(codeKey);
        }
        continue;
      }
      seenCodes.add(codeKey);
      if (m.idPrd != null) seenIdPrd.add(m.idPrd);
      mapped.push(m);
    }

    const existing = (await prisma.constructionMaterial.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        unit: true,
        productType: true,
        totvsIdPrd: true,
        isActive: true,
      },
    })) as LocalMaterial[];

    const byIdPrd = new Map<number, LocalMaterial>();
    const byCode = new Map<string, LocalMaterial>();
    const byName = new Map<string, LocalMaterial[]>();

    for (const mat of existing) {
      if (mat.totvsIdPrd != null && mat.totvsIdPrd > 0) byIdPrd.set(mat.totvsIdPrd, mat);
      if (mat.code) byCode.set(normalizeCodeKey(mat.code), mat);
      const nk = normalizeNameKey(mat.name);
      const arr = byName.get(nk) ?? [];
      arr.push(mat);
      byName.set(nk, arr);
    }

    type CreateRow = {
      code: string;
      name: string;
      description: string;
      unit: string;
      productType: string;
      category: string;
      totvsIdPrd: number | null;
      isActive: boolean;
    };
    type UpdateRow = {
      id: string;
      data: {
        code: string | null;
        name: string;
        description: string;
        unit: string;
        productType: string;
        category: string;
        totvsIdPrd: number | null;
        isActive: boolean;
      };
    };

    const toCreate: CreateRow[] = [];
    const toUpdate: UpdateRow[] = [];

    for (const m of mapped) {
      const codeKey = normalizeCodeKey(m.code);
      const byId = m.idPrd != null ? byIdPrd.get(m.idPrd) : undefined;
      const byCod = byCode.get(codeKey);
      let target = byId || byCod;

      // Nome exato único: alinha código errado sem criar segundo cadastro.
      if (!target) {
        const nameHits = byName.get(normalizeNameKey(m.name)) ?? [];
        if (nameHits.length === 1) {
          const only = nameHits[0];
          const idTaken =
            m.idPrd != null ? byIdPrd.get(m.idPrd) : undefined;
          if (!idTaken || idTaken.id === only.id) {
            target = only;
          }
        }
      }

      if (!target) {
        if (byCode.has(codeKey) || (m.idPrd != null && byIdPrd.has(m.idPrd))) {
          conflicts += 1;
          continue;
        }
        toCreate.push({
          code: m.code,
          name: m.name,
          description: m.name,
          unit: m.unit,
          productType: m.productType,
          category: m.productType,
          totvsIdPrd: m.idPrd,
          isActive: m.isActive,
        });
        const placeholder: LocalMaterial = {
          id: `__new_${codeKey}`,
          code: m.code,
          name: m.name,
          description: m.name,
          unit: m.unit,
          productType: m.productType,
          totvsIdPrd: m.idPrd,
          isActive: m.isActive,
        };
        byCode.set(codeKey, placeholder);
        if (m.idPrd != null) byIdPrd.set(m.idPrd, placeholder);
        const nk = normalizeNameKey(m.name);
        byName.set(nk, [...(byName.get(nk) ?? []), placeholder]);
        continue;
      }

      let nextCode = target.code;
      if (m.code !== (target.code || '')) {
        const taken = byCode.get(codeKey);
        if (!taken || taken.id === target.id) {
          nextCode = m.code;
        } else {
          conflicts += 1;
          // Ainda pode gravar IDPRD / nome / unidade no registro certo
        }
      }

      let nextIdPrd = target.totvsIdPrd;
      if (m.idPrd != null) {
        const taken = byIdPrd.get(m.idPrd);
        if (!taken || taken.id === target.id) {
          nextIdPrd = m.idPrd;
        }
      }

      if (!needsUpdate(target, m, nextCode, nextIdPrd)) {
        skipped += 1;
        continue;
      }

      toUpdate.push({
        id: target.id,
        data: {
          code: nextCode,
          name: m.name,
          description: target.description?.trim() ? target.description : m.name,
          unit: m.unit,
          productType: m.productType,
          category: m.productType,
          totvsIdPrd: nextIdPrd,
          isActive: m.isActive,
        },
      });

      if (target.code && normalizeCodeKey(target.code) !== codeKey) {
        byCode.delete(normalizeCodeKey(target.code));
      }
      if (nextCode) byCode.set(normalizeCodeKey(nextCode), { ...target, code: nextCode, totvsIdPrd: nextIdPrd });
      if (target.totvsIdPrd != null && target.totvsIdPrd !== nextIdPrd) {
        byIdPrd.delete(target.totvsIdPrd);
      }
      if (nextIdPrd != null) byIdPrd.set(nextIdPrd, { ...target, code: nextCode, totvsIdPrd: nextIdPrd });
    }

    for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
      const chunk = toCreate.slice(i, i + CREATE_BATCH);
      for (const data of chunk) {
        const material = await prisma.constructionMaterial.create({
          data: {
            code: data.code,
            name: data.name,
            description: data.description,
            unit: data.unit,
            productType: data.productType,
            category: data.category,
            totvsIdPrd: data.totvsIdPrd,
            isActive: data.isActive,
          },
        });
        try {
          await syncEngineeringMaterial(material);
        } catch (engErr) {
          console.warn(
            `[material-totvs] material ${material.id} criado; falha ao espelhar EngineeringMaterial:`,
            engErr
          );
        }
        created += 1;
      }
    }

    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
      const chunk = toUpdate.slice(i, i + UPDATE_BATCH);
      await Promise.all(
        chunk.map(async (item) => {
          if (item.id.startsWith('__new_')) return;
          const material = await prisma.constructionMaterial.update({
            where: { id: item.id },
            data: item.data,
          });
          try {
            await syncEngineeringMaterial(material);
          } catch (engErr) {
            console.warn(
              `[material-totvs] material ${material.id} atualizado; falha ao espelhar EngineeringMaterial:`,
              engErr
            );
          }
        })
      );
      updated += chunk.filter((c) => !c.id.startsWith('__new_')).length;
    }

    const durationMs = Date.now() - startedAt;
    const result: MaterialTotvsSyncResult = {
      fetched: rows.length,
      mapped: mapped.length,
      created,
      updated,
      skipped,
      conflicts,
      durationMs,
    };
    lastSyncAt = new Date();
    lastSyncResult = result;
    console.log(
      `[material-totvs] sync ok (${trigger}): fetched=${rows.length} mapped=${mapped.length} created=${created} updated=${updated} skipped=${skipped} conflicts=${conflicts} em ${durationMs}ms`
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[material-totvs] falha (${trigger}): ${msg}`);
    throw err;
  } finally {
    syncInFlight = false;
  }
}

export function getMaterialTotvsSyncStatus() {
  return {
    inFlight: syncInFlight,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    lastResult: lastSyncResult,
  };
}

export async function runMaterialTotvsSyncIfStale(
  maxAgeMs = 60_000
): Promise<MaterialTotvsSyncResult | null> {
  if (syncInFlight) return null;
  if (lastSyncAt && Date.now() - lastSyncAt.getTime() < maxAgeMs) {
    return lastSyncResult;
  }
  return runMaterialTotvsSync('manual');
}

export function startMaterialTotvsSyncScheduler(): void {
  if (started) return;

  const rm = getTotvsRmRelatorioFinService();
  const enabledDefault = rm.isConfigured();
  if (!envBool('MATERIAL_TOTVS_SYNC_ENABLED', enabledDefault)) {
    console.log('[material-totvs] desabilitado (defina MATERIAL_TOTVS_SYNC_ENABLED=1 para ligar)');
    return;
  }

  if (!rm.isConfigured()) {
    console.warn('[material-totvs] TOTVS RM não configurado — agenda não iniciada');
    return;
  }

  const expression = (process.env.MATERIAL_TOTVS_SYNC_CRON || '').trim() || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    console.error(`[material-totvs] cron inválido: ${expression}`);
    return;
  }

  started = true;
  const tz = process.env.TZ || 'America/Sao_Paulo';

  cron.schedule(
    expression,
    () => {
      void runMaterialTotvsSync('cron').catch(() => {
        /* já logado */
      });
    },
    { timezone: tz }
  );

  console.log(
    `[material-totvs] agendado: "${expression}" (${tz}) — consulta PRODUTOS no RM`
  );

  if (envBool('MATERIAL_TOTVS_SYNC_ON_BOOT', true)) {
    const delayMs = Number(process.env.MATERIAL_TOTVS_SYNC_BOOT_DELAY_MS || 12_000);
    const wait = Number.isFinite(delayMs) ? delayMs : 12_000;
    setTimeout(() => {
      void runMaterialTotvsSync('boot').catch(() => {
        /* já logado */
      });
    }, wait);
  }
}
