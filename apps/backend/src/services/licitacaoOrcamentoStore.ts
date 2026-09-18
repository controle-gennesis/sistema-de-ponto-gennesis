import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';

export type LicitacaoOrcamentoAnexo = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type LicitacaoOrcamentoRegistro = {
  mode: 'externo';
  valor: number | null;
  dataOrcamento: string;
  observacao: string;
  anexos: LicitacaoOrcamentoAnexo[];
};

export type LicitacaoOrcamentoRecord = {
  id: string;
  licitacaoId: string;
  registro: LicitacaoOrcamentoRegistro;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  licitacaoId: string;
  inputsJson: unknown;
  resultJson: unknown;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function emptyOrcamentoRegistro(): LicitacaoOrcamentoRegistro {
  return {
    mode: 'externo',
    valor: null,
    dataOrcamento: '',
    observacao: '',
    anexos: [],
  };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseAnexos(raw: unknown): LicitacaoOrcamentoAnexo[] {
  if (!Array.isArray(raw)) return [];
  const anexos: LicitacaoOrcamentoAnexo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!id || !name || !url) continue;
    anexos.push({
      id,
      name,
      url,
      mimeType: typeof row.mimeType === 'string' ? row.mimeType : 'application/octet-stream',
      size: typeof row.size === 'number' && Number.isFinite(row.size) ? row.size : 0,
      uploadedAt:
        typeof row.uploadedAt === 'string' && row.uploadedAt.trim()
          ? row.uploadedAt
          : new Date().toISOString(),
    });
  }
  return anexos;
}

export function normalizeOrcamentoRegistro(raw: unknown): LicitacaoOrcamentoRegistro {
  const base = emptyOrcamentoRegistro();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  const isExterno =
    row.mode === 'externo' ||
    Array.isArray(row.anexos) ||
    typeof row.dataOrcamento === 'string' ||
    typeof row.observacao === 'string';
  if (!isExterno) return base;

  const valor = asFiniteNumber(row.valor);
  return {
    mode: 'externo',
    valor: valor != null && valor >= 0 ? valor : null,
    dataOrcamento: typeof row.dataOrcamento === 'string' ? row.dataOrcamento.trim() : '',
    observacao: typeof row.observacao === 'string' ? row.observacao : '',
    anexos: parseAnexos(row.anexos),
  };
}

function mapRow(row: DbRow): LicitacaoOrcamentoRecord {
  return {
    id: row.id,
    licitacaoId: row.licitacaoId,
    registro: normalizeOrcamentoRegistro(row.inputsJson),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getLicitacaoOrcamentoByLicitacaoId(
  licitacaoId: string
): Promise<LicitacaoOrcamentoRecord | null> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<DbRow[]>`
    SELECT
      "id",
      "licitacaoId",
      "inputsJson",
      "resultJson",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt"
    FROM "licitacao_orcamentos"
    WHERE "licitacaoId" = ${licitacaoId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

export async function upsertLicitacaoOrcamento(params: {
  licitacaoId: string;
  registro: LicitacaoOrcamentoRegistro;
  userId: string;
}): Promise<LicitacaoOrcamentoRecord> {
  const prisma = getPrisma();
  const registro = normalizeOrcamentoRegistro(params.registro);
  const now = new Date();
  const inputsJson = JSON.stringify(registro);
  const resultJson = JSON.stringify({ valor: registro.valor });
  const existing = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "licitacao_orcamentos"
      SET
        "inputsJson" = ${inputsJson}::jsonb,
        "resultJson" = ${resultJson}::jsonb,
        "updatedBy" = ${params.userId},
        "updatedAt" = ${now}
      WHERE "licitacaoId" = ${params.licitacaoId}
    `;
  } else {
    const id = uuidv4();
    await prisma.$executeRaw`
      INSERT INTO "licitacao_orcamentos" (
        "id",
        "licitacaoId",
        "inputsJson",
        "resultJson",
        "createdBy",
        "updatedBy",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${params.licitacaoId},
        ${inputsJson}::jsonb,
        ${resultJson}::jsonb,
        ${params.userId},
        ${params.userId},
        ${now},
        ${now}
      )
    `;
  }

  const saved = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);
  if (!saved) {
    throw new Error('Falha ao gravar orçamento da licitação');
  }
  return saved;
}
