import { v4 as uuidv4 } from 'uuid';
import { createError } from '../middleware/errorHandler';
import { getPrisma } from '../lib/prisma';

export type HabilitacaoPendenteStatus = 'PENDENTE' | 'ADQUIRIDA';

export type LicitacaoHabilitacaoPendenteRow = {
  id: string;
  titulo: string;
  acaoSugerida: string;
  quantidade: number | null;
  unidadeMedida: string | null;
  status: HabilitacaoPendenteStatus;
  adquiridaEm: Date | null;
  createdBy: string;
  createdByName: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DbRow = {
  id: string;
  titulo: string;
  acaoSugerida: string;
  quantidade: string | number | null;
  unidadeMedida: string | null;
  status: string;
  adquiridaEm: Date | null;
  createdBy: string;
  createdByName: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function readHabilitacaoQuantidade(value: unknown): number {
  const raw =
    typeof value === 'number'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!raw) throw createError('Informe a quantidade.', 400);
  let normalized = raw.replace(/\s/g, '');
  if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  const quantidade = Number(normalized);
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw createError('Informe uma quantidade maior que zero.', 400);
  }
  if (quantidade > 999_999_999) throw createError('Quantidade muito alta.', 400);
  return Math.round(quantidade * 10000) / 10000;
}

export function readHabilitacaoUnidade(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!text) throw createError('Informe a unidade de medida.', 400);
  if (text.length > 30) throw createError('Unidade de medida deve ter no máximo 30 caracteres.', 400);
  return text;
}

function mapQuantidade(value: string | number | null): number | null {
  if (value == null || value === '') return null;
  const quantidade = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(quantidade) ? quantidade : null;
}

function mapRow(row: DbRow): LicitacaoHabilitacaoPendenteRow {
  return {
    id: row.id,
    titulo: row.titulo,
    acaoSugerida: row.acaoSugerida,
    quantidade: mapQuantidade(row.quantidade),
    unidadeMedida: row.unidadeMedida?.trim() || null,
    status: row.status === 'ADQUIRIDA' ? 'ADQUIRIDA' : 'PENDENTE',
    adquiridaEm: row.adquiridaEm,
    createdBy: row.createdBy,
    createdByName: row.createdByName?.trim() || 'Usuário',
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listLicitacaoHabilitacoesPendentes(): Promise<LicitacaoHabilitacaoPendenteRow[]> {
  const rows = await getPrisma().$queryRaw<DbRow[]>`
    SELECT
      h.id,
      h.titulo,
      h."acaoSugerida",
      h.quantidade::text AS quantidade,
      h."unidadeMedida",
      h.status,
      h."adquiridaEm",
      h."createdBy",
      COALESCE(u.name, h."createdBy") AS "createdByName",
      h."updatedBy",
      h."createdAt",
      h."updatedAt"
    FROM licitacao_habilitacoes_pendentes h
    LEFT JOIN users u ON u.id = h."createdBy"
    ORDER BY
      CASE WHEN h.status = 'PENDENTE' THEN 0 ELSE 1 END,
      h."updatedAt" DESC
  `;
  return rows.map(mapRow);
}

export async function createLicitacaoHabilitacaoPendente(input: {
  titulo: string;
  acaoSugerida: string;
  quantidade: number;
  unidadeMedida: string;
  createdBy: string;
}): Promise<LicitacaoHabilitacaoPendenteRow> {
  const id = uuidv4();
  const rows = await getPrisma().$queryRaw<DbRow[]>`
    WITH inserted AS (
      INSERT INTO licitacao_habilitacoes_pendentes (
        id, titulo, "acaoSugerida", quantidade, "unidadeMedida", status, "createdBy", "updatedBy", "createdAt", "updatedAt"
      ) VALUES (
        ${id},
        ${input.titulo},
        ${input.acaoSugerida},
        ${input.quantidade},
        ${input.unidadeMedida},
        'PENDENTE',
        ${input.createdBy},
        ${input.createdBy},
        NOW(),
        NOW()
      )
      RETURNING
        id, titulo, "acaoSugerida", quantidade::text AS quantidade, "unidadeMedida", status, "adquiridaEm", "createdBy", "updatedBy", "createdAt", "updatedAt"
    )
    SELECT
      i.id,
      i.titulo,
      i."acaoSugerida",
      i.quantidade,
      i."unidadeMedida",
      i.status,
      i."adquiridaEm",
      i."createdBy",
      COALESCE(u.name, i."createdBy") AS "createdByName",
      i."updatedBy",
      i."createdAt",
      i."updatedAt"
    FROM inserted i
    LEFT JOIN users u ON u.id = i."createdBy"
  `;
  const row = rows[0];
  if (!row) throw new Error('Não foi possível cadastrar a habilitação.');
  return mapRow(row);
}

export async function updateLicitacaoHabilitacaoPendente(input: {
  id: string;
  titulo?: string;
  acaoSugerida?: string;
  quantidade?: number;
  unidadeMedida?: string;
  status?: HabilitacaoPendenteStatus;
  updatedBy: string;
}): Promise<LicitacaoHabilitacaoPendenteRow | null> {
  const current = await getPrisma().$queryRaw<DbRow[]>`
    SELECT
      h.id,
      h.titulo,
      h."acaoSugerida",
      h.quantidade::text AS quantidade,
      h."unidadeMedida",
      h.status,
      h."adquiridaEm",
      h."createdBy",
      NULL::text AS "createdByName",
      h."updatedBy",
      h."createdAt",
      h."updatedAt"
    FROM licitacao_habilitacoes_pendentes h
    WHERE h.id = ${input.id}
    LIMIT 1
  `;
  const existing = current[0];
  if (!existing) return null;

  const titulo = input.titulo?.trim() || existing.titulo;
  const acaoSugerida = input.acaoSugerida?.trim() || existing.acaoSugerida;
  const quantidade =
    input.quantidade != null ? input.quantidade : mapQuantidade(existing.quantidade);
  const unidadeMedida = input.unidadeMedida?.trim() || existing.unidadeMedida?.trim() || null;
  const status: HabilitacaoPendenteStatus =
    input.status === 'ADQUIRIDA' || input.status === 'PENDENTE'
      ? input.status
      : existing.status === 'ADQUIRIDA'
        ? 'ADQUIRIDA'
        : 'PENDENTE';
  const adquiridaEm = status === 'ADQUIRIDA' ? existing.adquiridaEm ?? new Date() : null;

  const rows = await getPrisma().$queryRaw<DbRow[]>`
    WITH updated AS (
      UPDATE licitacao_habilitacoes_pendentes
      SET
        titulo = ${titulo},
        "acaoSugerida" = ${acaoSugerida},
        quantidade = ${quantidade},
        "unidadeMedida" = ${unidadeMedida},
        status = ${status},
        "adquiridaEm" = ${adquiridaEm},
        "updatedBy" = ${input.updatedBy},
        "updatedAt" = NOW()
      WHERE id = ${input.id}
      RETURNING
        id, titulo, "acaoSugerida", quantidade::text AS quantidade, "unidadeMedida", status, "adquiridaEm", "createdBy", "updatedBy", "createdAt", "updatedAt"
    )
    SELECT
      i.id,
      i.titulo,
      i."acaoSugerida",
      i.quantidade,
      i."unidadeMedida",
      i.status,
      i."adquiridaEm",
      i."createdBy",
      COALESCE(u.name, i."createdBy") AS "createdByName",
      i."updatedBy",
      i."createdAt",
      i."updatedAt"
    FROM updated i
    LEFT JOIN users u ON u.id = i."createdBy"
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteLicitacaoHabilitacaoPendente(id: string): Promise<boolean> {
  const deleted = await getPrisma().$executeRaw`
    DELETE FROM licitacao_habilitacoes_pendentes WHERE id = ${id}
  `;
  return deleted > 0;
}
