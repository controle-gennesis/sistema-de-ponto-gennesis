import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import {
  ensureConstructionMaterialTotvsAvgPaid,
  ensureConstructionMaterialTotvsIdPrd,
} from '../lib/ensureProductionSchema';
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
  /** true quando UNIDADE/CODUNDCONTROLE veio preenchido do RM (não é fallback). */
  unitFromTotvs: boolean;
  productType: string;
  isActive: boolean;
  budgetNatureCode: string | null;
  budgetNatureName: string | null;
  /** Média unitária das últimas OCs no RM (0/null = sem histórico). */
  totvsAvgPaidUnitPrice: number | null;
  /** Quantidade de OCs usadas na média (para preferir linha de coligada com mais histórico). */
  totvsAvgPaidOcCount: number;
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
  budgetNatureId: string | null;
  totvsAvgPaidUnitPrice: number | null;
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

/** Nome/descrição com INATIV / INATIVAR / [INATIVO] etc. — sai do cadastro ativo. */
function looksInactiveText(...parts: Array<string | null | undefined>): boolean {
  return parts.some((p) => {
    const t = String(p || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase();
    return t.includes('INATIV');
  });
}

/** ATIVO=1 ativo; INATIVO=1 inativo (coluna invertida no RM). */
function parseProdutoAtivo(row: Record<string, unknown>): boolean {
  const name = cell(pickRow(row, 'NOMEFANTASIA', 'PRODUTO', 'NOME', 'DESCRICAO', 'DESCRIÇÃO'));
  const description = cell(pickRow(row, 'DESCRICAO', 'DESCRIÇÃO', 'DESCPRODUTO'));
  const status = cell(pickRow(row, 'STATUS', 'SITUACAO', 'SITUAÇÃO', 'SITPRODUTO'));

  // Texto manda: [INATIVAR], (INATIVAR), DEVER SER INATIVADO etc.
  if (looksInactiveText(name, description, status)) return false;

  const ativoRaw = pickRow(row, 'ATIVO', 'ATIVOYN', 'FLDATIVO', 'ACTIVE');
  const ativo = parseFlagTruthy(ativoRaw);
  if (ativo != null) return ativo;

  const inativoRaw = pickRow(row, 'INATIVO', 'INATIVOYN', 'FLDINATIVO', 'INACTIVE');
  const inativo = parseFlagTruthy(inativoRaw);
  if (inativo != null) return !inativo;

  if (status) {
    const s = status.toLowerCase();
    if (/desativ|bloque|cancel/.test(s)) return false;
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

function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw * 100) / 100;
  }
  const s = String(raw)
    .trim()
    .replace(/\s/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseNonNegInt(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

function preferAvgPaid(
  prev: MappedProduct,
  next: MappedProduct
): { totvsAvgPaidUnitPrice: number | null; totvsAvgPaidOcCount: number } {
  // Preferir a linha (coligada) com mais OCs; se empatar, a que tem média > 0.
  if (next.totvsAvgPaidOcCount > prev.totvsAvgPaidOcCount) {
    return {
      totvsAvgPaidUnitPrice: next.totvsAvgPaidUnitPrice ?? prev.totvsAvgPaidUnitPrice,
      totvsAvgPaidOcCount: next.totvsAvgPaidOcCount,
    };
  }
  if (prev.totvsAvgPaidOcCount > next.totvsAvgPaidOcCount) {
    return {
      totvsAvgPaidUnitPrice: prev.totvsAvgPaidUnitPrice ?? next.totvsAvgPaidUnitPrice,
      totvsAvgPaidOcCount: prev.totvsAvgPaidOcCount,
    };
  }
  return {
    totvsAvgPaidUnitPrice: prev.totvsAvgPaidUnitPrice ?? next.totvsAvgPaidUnitPrice,
    totvsAvgPaidOcCount: Math.max(prev.totvsAvgPaidOcCount, next.totvsAvgPaidOcCount),
  };
}

function preferUnit(prev: MappedProduct, next: MappedProduct): string {
  if (next.unitFromTotvs && prev.unitFromTotvs) {
    const prevGeneric = !prev.unit || prev.unit.toUpperCase() === 'UN';
    const nextGeneric = !next.unit || next.unit.toUpperCase() === 'UN';
    if (prevGeneric && !nextGeneric) return next.unit;
    if (!prevGeneric && nextGeneric) return prev.unit;
    return next.unit;
  }
  if (next.unitFromTotvs) return next.unit;
  return prev.unit;
}

function mergeMappedProduct(prev: MappedProduct, next: MappedProduct): MappedProduct {
  const avg = preferAvgPaid(prev, next);
  return {
    ...next,
    unit: preferUnit(prev, next),
    unitFromTotvs: next.unitFromTotvs || prev.unitFromTotvs,
    idPrd: next.idPrd ?? prev.idPrd,
    // Se qualquer linha indicar inativo (texto/flag), mantém inativo.
    isActive: prev.isActive && next.isActive,
    budgetNatureCode: prev.budgetNatureCode ?? next.budgetNatureCode,
    budgetNatureName: prev.budgetNatureCode
      ? prev.budgetNatureName
      : next.budgetNatureName ?? prev.budgetNatureName,
    totvsAvgPaidUnitPrice: avg.totvsAvgPaidUnitPrice,
    totvsAvgPaidOcCount: avg.totvsAvgPaidOcCount,
  };
}

function mapRmRow(row: Record<string, unknown>): MappedProduct | null {
  const code = cell(
    pickRow(
      row,
      'COD - PRODUTO',
      'CODIGOPRD',
      'CODIGO',
      'CODPRD',
      'CODPRODUTO',
      'CODE',
      'CODIGO PRODUTO'
    )
  );
  const name = cell(
    pickRow(
      row,
      'NOMEFANTASIA',
      'PRODUTO',
      'DESCRICAO',
      'DESCRIÇÃO',
      'NOMEPRD',
      'NOME',
      'DESCPRODUTO'
    )
  );
  if (!code || !name) return null;

  const idPrd = parseIdPrd(pickRow(row, 'IDPRD', 'IDPRDUTO', 'IDPRODUTO', 'IDPROD'));
  const unitRaw = cell(
    pickRow(
      row,
      'CODUNDCONTROLE',
      'UNIDADE',
      'CODUND',
      'CODUNDCOMPRA',
      'CODUNDVENDA',
      'CODUM',
      'UN',
      'UND'
    )
  );
  const tipoRaw = cell(pickRow(row, 'TIPOPRODUTO', 'TIPO', 'PRODUCTTYPE'));
  const productType =
    tipoRaw && /servi[cç]o/i.test(tipoRaw) ? 'Serviço' : 'Produto';
  const budgetNatureCode = cell(
    pickRow(row, 'COD NATUREZA ORCAMENTARIA', 'COD NATUREZA ORÇAMENTÁRIA', 'CODNATORCAMENTARIA', 'CODTBORCAMENTO')
  );
  const budgetNatureName = cell(
    pickRow(row, 'NATUREZA ORCAMENTARIA', 'NATUREZA ORÇAMENTÁRIA', 'DESCNATORCAMENTARIA')
  );
  const totvsAvgPaidUnitPrice = parseMoney(
    pickRow(
      row,
      'MEDIA OC (ULT. 10)',
      'MEDIA OC (ULT 10)',
      'MEDIA OC',
      'MEDIA_OC',
      'MEDIAOC'
    )
  );
  const totvsAvgPaidOcCount = parseNonNegInt(
    pickRow(row, 'QTD OCS CONSIDERADAS', 'QTD_OCS', 'QTDOCS')
  );

  return {
    code,
    idPrd,
    name,
    unit: (unitRaw || 'UN').toUpperCase(),
    unitFromTotvs: Boolean(unitRaw),
    productType,
    isActive: parseProdutoAtivo(row),
    budgetNatureCode,
    budgetNatureName: budgetNatureCode ? budgetNatureName : null,
    totvsAvgPaidUnitPrice,
    totvsAvgPaidOcCount,
  };
}

/** Mapa código RM → id da natureza; cria no cadastro as que ainda não existem. */
async function resolveBudgetNatureIds(mapped: MappedProduct[]): Promise<Map<string, string>> {
  const wanted = new Map<string, string>();
  for (const m of mapped) {
    if (!m.budgetNatureCode) continue;
    if (!wanted.has(m.budgetNatureCode) || !wanted.get(m.budgetNatureCode)) {
      wanted.set(m.budgetNatureCode, m.budgetNatureName || '');
    }
  }

  const idByCode = new Map<string, string>();
  if (wanted.size === 0) return idByCode;

  const existing = await prisma.budgetNature.findMany({
    where: { code: { not: null } },
    select: { id: true, code: true },
  });
  for (const n of existing) {
    const code = (n.code || '').trim();
    if (code) idByCode.set(code, n.id);
  }

  for (const [code, name] of wanted) {
    if (idByCode.has(code)) continue;
    const created = await prisma.budgetNature.upsert({
      where: { code },
      update: {},
      create: { code, name: name || code, isActive: true },
      select: { id: true },
    });
    idByCode.set(code, created.id);
    console.log(`[material-totvs] natureza orçamentária criada: ${code} - ${name || code}`);
  }
  return idByCode;
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

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function needsUpdate(
  existing: LocalMaterial,
  m: MappedProduct,
  nextCode: string | null,
  nextIdPrd: number | null,
  nextBudgetNatureId: string | null,
  nextTotvsAvg: number | null
): boolean {
  const unitChanged =
    m.unitFromTotvs &&
    (existing.unit || '').toUpperCase() !== (m.unit || '').toUpperCase();
  const avgChanged =
    nextTotvsAvg != null &&
    toNumberOrNull(existing.totvsAvgPaidUnitPrice) !== nextTotvsAvg;
  return (
    (existing.code || null) !== (nextCode || null) ||
    existing.name !== m.name ||
    unitChanged ||
    (existing.productType || null) !== m.productType ||
    existing.totvsIdPrd !== nextIdPrd ||
    existing.isActive !== m.isActive ||
    (existing.budgetNatureId || null) !== (nextBudgetNatureId || null) ||
    avgChanged
  );
}

/**
 * Busca PRODUTOSATIVOS no TOTVS RM e faz upsert local:
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
    await ensureConstructionMaterialTotvsAvgPaid(prisma);
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
        // PRODUTOSATIVOS pode repetir o código; preferir unidade específica a "UN".
        const idx = mapped.findIndex((x) => normalizeCodeKey(x.code) === codeKey);
        if (idx >= 0) mapped[idx] = mergeMappedProduct(mapped[idx], m);
        continue;
      }
      if (m.idPrd != null && seenIdPrd.has(m.idPrd)) {
        const idx = mapped.findIndex((x) => x.idPrd === m.idPrd);
        if (idx >= 0) {
          seenCodes.delete(normalizeCodeKey(mapped[idx].code));
          mapped[idx] = mergeMappedProduct(mapped[idx], m);
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
        budgetNatureId: true,
        totvsAvgPaidUnitPrice: true,
      },
    })) as unknown as LocalMaterial[];

    for (const mat of existing) {
      mat.totvsAvgPaidUnitPrice = toNumberOrNull(mat.totvsAvgPaidUnitPrice);
    }

    const budgetNatureIdByCode = await resolveBudgetNatureIds(mapped);

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
      budgetNatureId: string | null;
      totvsAvgPaidUnitPrice: number | null;
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
        budgetNatureId: string | null;
        totvsAvgPaidUnitPrice: number | null;
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

      // Texto INATIV* no nome → nunca criar/atualizar como ativo.
      const inactiveByText = looksInactiveText(m.name);
      const effectiveActive = m.isActive && !inactiveByText;
      const rmBudgetNatureId = m.budgetNatureCode
        ? budgetNatureIdByCode.get(m.budgetNatureCode) ?? null
        : null;

      if (!target) {
        if (byCode.has(codeKey) || (m.idPrd != null && byIdPrd.has(m.idPrd))) {
          conflicts += 1;
          continue;
        }
        // Não importa cadastro novo já marcado para inativar no texto.
        if (!effectiveActive) {
          skipped += 1;
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
          isActive: true,
          budgetNatureId: rmBudgetNatureId,
          totvsAvgPaidUnitPrice: m.totvsAvgPaidUnitPrice,
        });
        const placeholder: LocalMaterial = {
          id: `__new_${codeKey}`,
          code: m.code,
          name: m.name,
          description: m.name,
          unit: m.unit,
          productType: m.productType,
          totvsIdPrd: m.idPrd,
          isActive: true,
          budgetNatureId: rmBudgetNatureId,
          totvsAvgPaidUnitPrice: m.totvsAvgPaidUnitPrice,
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

      // RM manda quando informa natureza; sem natureza no RM, mantém a local.
      const nextBudgetNatureId = rmBudgetNatureId ?? target.budgetNatureId;
      // Média TOTVS: grava quando o RM manda valor > 0; se vier 0, mantém a salva.
      const nextTotvsAvg = m.totvsAvgPaidUnitPrice ?? target.totvsAvgPaidUnitPrice;

      const mappedForUpdate: MappedProduct = { ...m, isActive: effectiveActive };
      if (!needsUpdate(target, mappedForUpdate, nextCode, nextIdPrd, nextBudgetNatureId, nextTotvsAvg)) {
        skipped += 1;
        continue;
      }

      toUpdate.push({
        id: target.id,
        data: {
          code: nextCode,
          name: m.name,
          description: target.description?.trim() ? target.description : m.name,
          unit: m.unitFromTotvs ? m.unit : target.unit,
          productType: m.productType,
          category: m.productType,
          totvsIdPrd: nextIdPrd,
          isActive: effectiveActive,
          budgetNatureId: nextBudgetNatureId,
          totvsAvgPaidUnitPrice: nextTotvsAvg,
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

    // Locais ainda ativos com texto INATIV* (mesmo que o RM não tenha mandado no lote).
    const pendingUpdateIds = new Set(toUpdate.map((u) => u.id));
    for (const e of existing) {
      if (!e.isActive) continue;
      if (!looksInactiveText(e.name, e.description)) continue;
      if (pendingUpdateIds.has(e.id)) {
        const row = toUpdate.find((u) => u.id === e.id);
        if (row) row.data.isActive = false;
        continue;
      }
      toUpdate.push({
        id: e.id,
        data: {
          code: e.code,
          name: e.name,
          description: e.description || e.name,
          unit: e.unit,
          productType: e.productType || 'Produto',
          category: e.productType || 'Produto',
          totvsIdPrd: e.totvsIdPrd,
          isActive: false,
          budgetNatureId: e.budgetNatureId,
          totvsAvgPaidUnitPrice: e.totvsAvgPaidUnitPrice,
        },
      });
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
            budgetNatureId: data.budgetNatureId,
            totvsAvgPaidUnitPrice: data.totvsAvgPaidUnitPrice,
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
