import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { getTotvsRmRelatorioFinService } from './TotvsRmRelatorioFinService';

const DEFAULT_PATH = '/api/framework/v1/consultaSQLServer/RealizaConsulta/FORNECEDORES/1/G';
/** A cada 5 min — o RM não notifica novos cadastros; polling curto + upsert sem duplicar. */
const DEFAULT_CRON = '*/5 * * * *';
const CREATE_BATCH = 200;
const UPDATE_BATCH = 50;

export type SupplierTotvsSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  durationMs: number;
};

let started = false;
let syncInFlight = false;
let lastSyncAt: Date | null = null;
let lastSyncResult: SupplierTotvsSyncResult | null = null;

type MappedSupplier = {
  code: string;
  partyType: string | null;
  tradeName: string | null;
  name: string;
  cnpj: string | null;
  cnpjDigits: string | null;
  category: string | null;
  street: string | null;
  streetNumber: string | null;
  neighborhood: string | null;
  poBox: string | null;
  email: string | null;
  contactName: string | null;
  state: string | null;
  zipCode: string | null;
  bank: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  address: string | null;
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

function digitsOnly(value: string | null): string | null {
  if (!value) return null;
  const d = value.replace(/\D/g, '');
  return d || null;
}

function pickRow(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined) {
      return row[key];
    }
  }
  const wanted = new Set(keys.map((k) => k.toUpperCase()));
  for (const [k, v] of Object.entries(row)) {
    if (wanted.has(k.toUpperCase())) return v;
  }
  return undefined;
}

function parseActive(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  if (['0', 'n', 'nao', 'não', 'false', 'inativo', 'no'].includes(s)) return false;
  return true;
}

function categoryFromCnpj(cnpjDigits: string | null): string | null {
  if (!cnpjDigits) return null;
  if (cnpjDigits.length === 11) return 'Pessoa Física';
  if (cnpjDigits.length === 14) return 'Pessoa Jurídica';
  return null;
}

function composeAddress(parts: {
  street: string | null;
  streetNumber: string | null;
  neighborhood: string | null;
}): string | null {
  const segments = [
    parts.street,
    parts.streetNumber ? `nº ${parts.streetNumber}` : null,
    parts.neighborhood,
  ].filter(Boolean);
  return segments.length > 0 ? segments.join(', ') : null;
}

function mapRmRow(row: Record<string, unknown>): MappedSupplier | null {
  const code = cell(pickRow(row, 'CLIENTE/FORNECEDOR', 'CODIGO', 'CODCLIENTE', 'CODCFO'));
  const name = cell(pickRow(row, 'NOME', 'RAZAO SOCIAL', 'RAZÃO SOCIAL'));
  if (!code || !name) return null;

  const cnpj = cell(pickRow(row, 'CPF/CNPJ', 'CGCCFO', 'CNPJ', 'CPF'));
  const cnpjDigits = digitsOnly(cnpj);
  const street = cell(pickRow(row, 'RUA', 'ENDERECO', 'ENDEREÇO'));
  const streetNumber = cell(pickRow(row, 'NÚMERO', 'NUMERO', 'NUMEROEND'));
  const neighborhood = cell(pickRow(row, 'BAIRRO'));
  const bankName = cell(pickRow(row, 'BANCO'));
  const bankCode = cell(pickRow(row, 'CÓD. BANCO', 'COD. BANCO', 'CODBANCO'));

  return {
    code,
    partyType: cell(pickRow(row, 'TIPO', 'TIPOCFO')),
    tradeName: cell(pickRow(row, 'NOME FANTASIA', 'NOMEFANTASIA')),
    name,
    cnpj,
    cnpjDigits,
    category: categoryFromCnpj(cnpjDigits),
    street,
    streetNumber,
    neighborhood,
    poBox: cell(pickRow(row, 'CAIXA POSTAL', 'CAIXAPOSTAL')),
    email: cell(pickRow(row, 'E-MAIL', 'EMAIL')),
    contactName: cell(pickRow(row, 'CONTATO', 'NOME CONTATO')),
    state: cell(pickRow(row, 'ESTADO', 'UF')),
    zipCode: cell(pickRow(row, 'CEP')),
    bank: bankName || bankCode,
    pixKeyType: cell(pickRow(row, 'TIPO DE CHAVE PIX', 'TIPOCHAVEPIX')),
    pixKey: cell(pickRow(row, 'CHAVE PIX', 'CHAVEPIX')),
    address: composeAddress({ street, streetNumber, neighborhood }),
    isActive: parseActive(pickRow(row, 'ATIVO')),
  };
}

function fornecedoresPath(): string {
  return (process.env.TOTVS_RM_FORNECEDORES_PATH || '').trim() || DEFAULT_PATH;
}

function toCreateData(m: MappedSupplier) {
  return {
    code: m.code,
    partyType: m.partyType,
    tradeName: m.tradeName,
    name: m.name,
    cnpj: m.cnpj,
    category: m.category,
    street: m.street,
    streetNumber: m.streetNumber,
    neighborhood: m.neighborhood,
    poBox: m.poBox,
    email: m.email,
    contactName: m.contactName,
    state: m.state,
    zipCode: m.zipCode,
    bank: m.bank,
    pixKeyType: m.pixKeyType,
    pixKey: m.pixKey,
    address: m.address,
    isActive: m.isActive,
  };
}

function needsUpdate(
  existing: {
    partyType: string | null;
    tradeName: string | null;
    name: string;
    cnpj: string | null;
    category: string | null;
    street: string | null;
    streetNumber: string | null;
    neighborhood: string | null;
    poBox: string | null;
    email: string | null;
    contactName: string | null;
    state: string | null;
    zipCode: string | null;
    bank: string | null;
    pixKeyType: string | null;
    pixKey: string | null;
    address: string | null;
    isActive: boolean;
    code: string;
  },
  m: MappedSupplier,
  nextCode: string,
  nextCnpj: string | null
): boolean {
  return (
    existing.code !== nextCode ||
    existing.partyType !== m.partyType ||
    existing.tradeName !== m.tradeName ||
    existing.name !== m.name ||
    existing.cnpj !== nextCnpj ||
    existing.category !== m.category ||
    existing.street !== m.street ||
    existing.streetNumber !== m.streetNumber ||
    existing.neighborhood !== m.neighborhood ||
    existing.poBox !== m.poBox ||
    existing.email !== m.email ||
    existing.contactName !== m.contactName ||
    existing.state !== m.state ||
    existing.zipCode !== m.zipCode ||
    existing.bank !== m.bank ||
    existing.pixKeyType !== m.pixKeyType ||
    existing.pixKey !== m.pixKey ||
    existing.address !== m.address ||
    existing.isActive !== m.isActive
  );
}

/**
 * Busca FORNECEDORES no TOTVS RM e faz upsert local por CPF/CNPJ (preferência) ou código.
 */
export async function runSupplierTotvsSync(
  trigger: 'cron' | 'boot' | 'manual' = 'cron'
): Promise<SupplierTotvsSyncResult | null> {
  if (syncInFlight) {
    console.log(`[supplier-totvs] sync já em andamento (trigger=${trigger}) — ignorado`);
    return null;
  }

  const rm = getTotvsRmRelatorioFinService();
  if (!rm.isConfigured()) {
    console.warn('[supplier-totvs] TOTVS RM não configurado — sync ignorado');
    return null;
  }

  syncInFlight = true;
  const startedAt = Date.now();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    console.log(`[supplier-totvs] iniciando sync (${trigger})…`);
    const rows = await rm.fetchRowsForPath(fornecedoresPath());
    const mapped: MappedSupplier[] = [];
    const seenCodes = new Set<string>();
    const seenCnpjDigits = new Set<string>();

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
      // Uma linha por código / CNPJ na carga (última prevalece)
      if (seenCodes.has(m.code)) {
        const idx = mapped.findIndex((x) => x.code === m.code);
        if (idx >= 0) mapped[idx] = m;
        continue;
      }
      if (m.cnpjDigits && seenCnpjDigits.has(m.cnpjDigits)) {
        const idx = mapped.findIndex((x) => x.cnpjDigits === m.cnpjDigits);
        if (idx >= 0) {
          seenCodes.delete(mapped[idx].code);
          mapped[idx] = m;
          seenCodes.add(m.code);
        }
        continue;
      }
      seenCodes.add(m.code);
      if (m.cnpjDigits) seenCnpjDigits.add(m.cnpjDigits);
      mapped.push(m);
    }

    const existing = await prisma.supplier.findMany({
      select: {
        id: true,
        code: true,
        cnpj: true,
        partyType: true,
        tradeName: true,
        name: true,
        category: true,
        street: true,
        streetNumber: true,
        neighborhood: true,
        poBox: true,
        email: true,
        contactName: true,
        state: true,
        zipCode: true,
        bank: true,
        pixKeyType: true,
        pixKey: true,
        address: true,
        isActive: true,
      },
    });

    const byCode = new Map(existing.map((s) => [s.code, s]));
    const byCnpjDigits = new Map<string, (typeof existing)[number]>();
    for (const s of existing) {
      const d = digitsOnly(s.cnpj);
      if (d) byCnpjDigits.set(d, s);
    }

    const toCreate: ReturnType<typeof toCreateData>[] = [];
    const toUpdate: { id: string; data: ReturnType<typeof toCreateData> }[] = [];

    for (const m of mapped) {
      const byDoc = m.cnpjDigits ? byCnpjDigits.get(m.cnpjDigits) : undefined;
      const byCod = byCode.get(m.code);
      const target = byDoc || byCod;

      if (!target) {
        // Evita colisão de unique se outro registro já usa o código/CNPJ
        if (byCode.has(m.code) || (m.cnpjDigits && byCnpjDigits.has(m.cnpjDigits))) {
          skipped += 1;
          continue;
        }
        const data = toCreateData(m);
        toCreate.push(data);
        // Reserva no mapa em memória para o restante do lote
        const placeholder = {
          id: `__new_${m.code}`,
          ...data,
        };
        byCode.set(m.code, placeholder as (typeof existing)[number]);
        if (m.cnpjDigits) byCnpjDigits.set(m.cnpjDigits, placeholder as (typeof existing)[number]);
        continue;
      }

      let nextCode = target.code;
      if (m.code !== target.code && !byCode.has(m.code)) {
        nextCode = m.code;
      }

      let nextCnpj = target.cnpj;
      if (m.cnpj) {
        const taken = m.cnpjDigits ? byCnpjDigits.get(m.cnpjDigits) : undefined;
        if (!taken || taken.id === target.id) {
          nextCnpj = m.cnpj;
        }
      }

      if (!needsUpdate(target, m, nextCode, nextCnpj)) {
        skipped += 1;
        continue;
      }

      const data = { ...toCreateData(m), code: nextCode, cnpj: nextCnpj };
      toUpdate.push({ id: target.id, data });

      // Atualiza índices em memória
      if (nextCode !== target.code) {
        byCode.delete(target.code);
        byCode.set(nextCode, { ...target, ...data });
      } else {
        byCode.set(nextCode, { ...target, ...data });
      }
      const oldDigits = digitsOnly(target.cnpj);
      if (oldDigits && oldDigits !== m.cnpjDigits) byCnpjDigits.delete(oldDigits);
      if (m.cnpjDigits) byCnpjDigits.set(m.cnpjDigits, { ...target, ...data });
    }

    for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
      const chunk = toCreate.slice(i, i + CREATE_BATCH);
      const result = await prisma.supplier.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      created += result.count;
    }

    for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
      const chunk = toUpdate.slice(i, i + UPDATE_BATCH);
      await Promise.all(
        chunk.map((item) =>
          prisma.supplier.update({
            where: { id: item.id },
            data: item.data,
          })
        )
      );
      updated += chunk.length;
    }

    const durationMs = Date.now() - startedAt;
    const result: SupplierTotvsSyncResult = {
      fetched: rows.length,
      created,
      updated,
      skipped,
      durationMs,
    };
    lastSyncAt = new Date();
    lastSyncResult = result;
    console.log(
      `[supplier-totvs] sync ok (${trigger}): fetched=${rows.length} mapped=${mapped.length} created=${created} updated=${updated} skipped=${skipped} em ${durationMs}ms`
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[supplier-totvs] falha (${trigger}): ${msg}`);
    throw err;
  } finally {
    syncInFlight = false;
  }
}

export function getSupplierTotvsSyncStatus() {
  return {
    inFlight: syncInFlight,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    lastResult: lastSyncResult,
  };
}

/**
 * Dispara sync se ainda não rodou ou se a última execução passou do intervalo (ms).
 * Usado ao abrir a tela de fornecedores para não esperar o cron.
 */
export async function runSupplierTotvsSyncIfStale(
  maxAgeMs = 60_000
): Promise<SupplierTotvsSyncResult | null> {
  if (syncInFlight) return null;
  if (lastSyncAt && Date.now() - lastSyncAt.getTime() < maxAgeMs) {
    return lastSyncResult;
  }
  return runSupplierTotvsSync('manual');
}

export function startSupplierTotvsSyncScheduler(): void {
  if (started) return;

  const rm = getTotvsRmRelatorioFinService();
  const enabledDefault = rm.isConfigured();
  if (!envBool('SUPPLIER_TOTVS_SYNC_ENABLED', enabledDefault)) {
    console.log('[supplier-totvs] desabilitado (defina SUPPLIER_TOTVS_SYNC_ENABLED=1 para ligar)');
    return;
  }

  if (!rm.isConfigured()) {
    console.warn('[supplier-totvs] TOTVS RM não configurado — agenda não iniciada');
    return;
  }

  const expression = (process.env.SUPPLIER_TOTVS_SYNC_CRON || '').trim() || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    console.error(`[supplier-totvs] cron inválido: ${expression}`);
    return;
  }

  started = true;
  const tz = process.env.TZ || 'America/Sao_Paulo';

  cron.schedule(
    expression,
    () => {
      void runSupplierTotvsSync('cron').catch(() => {
        /* já logado */
      });
    },
    { timezone: tz }
  );

  console.log(
    `[supplier-totvs] agendado: "${expression}" (${tz}) — consulta FORNECEDORES no RM a cada poucos minutos`
  );

  // Sempre sincroniza no boot (local e produção) para a lista não ficar vazia.
  if (envBool('SUPPLIER_TOTVS_SYNC_ON_BOOT', true)) {
    const delayMs = Number(process.env.SUPPLIER_TOTVS_SYNC_BOOT_DELAY_MS || 8_000);
    const wait = Number.isFinite(delayMs) ? delayMs : 8_000;
    setTimeout(() => {
      void runSupplierTotvsSync('boot').catch(() => {
        /* já logado */
      });
    }, wait);
    console.log(`[supplier-totvs] também sincroniza ~${Math.round(wait / 1000)}s após o boot`);
  }
}
