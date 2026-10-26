import { Response, NextFunction } from 'express';
import { proximaAtualizacaoManual, reservarAtualizacaoManual } from '../lib/totvsManualSyncCooldown';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { findIdsByUnaccentSearch } from '../lib/normalizeSearchText';
import { ensureStockLocationsTable } from '../lib/ensureProductionSchema';
import { syncStockLocationsFromTotvs } from '../services/StockLocationTotvsSync';

type StockLocationRow = {
  id: string;
  code: string;
  name: string;
  polo: string | null;
  filial: number;
  costCenterId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Nome do centro de custo de cada local (só exibição; o envio da OC ao TOTVS não usa este campo). */
async function comCentroCusto<T extends { costCenterId: string | null }>(
  rows: T[]
): Promise<Array<T & { costCenterName: string | null }>> {
  const ids = [...new Set(rows.map((r) => r.costCenterId).filter((x): x is string => !!x))];
  const ccs = ids.length
    ? await prisma.costCenter.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } })
    : [];
  const nome = new Map(ccs.map((c) => [c.id, c.name?.trim() || c.code]));
  return rows.map((r) => ({ ...r, costCenterName: r.costCenterId ? nome.get(r.costCenterId) ?? null : null }));
}

/** Centro de custo opcional: vazio limpa; id precisa existir. */
async function parseCostCenterId(value: unknown): Promise<string | null> {
  const id = String(value ?? '').trim();
  if (!id) return null;
  const cc = await prisma.costCenter.findUnique({ where: { id }, select: { id: true } });
  if (!cc) throw createError('Centro de custo não encontrado', 400);
  return id;
}

function parseFilial(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (n === 1 || n === 5) return n;
  return null;
}

function filialFromPolo(polo?: string | null): number {
  return String(polo || '').toUpperCase().includes('GO') ? 5 : 1;
}

function newId(): string {
  return `sl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class StockLocationController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureStockLocationsTable(prisma);
      const { search, isActive, filial, page = 1, limit = 20 } = req.query;
      const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

      if (search) {
        const ids = await findIdsByUnaccentSearch({
          from: Prisma.sql`stock_locations`,
          columns: ['code', 'name', 'polo'],
          search: String(search),
        });
        const safeIds = ids && ids.length > 0 ? ids : ['__none__'];
        conditions.push(Prisma.sql`id IN (${Prisma.join(safeIds)})`);
      }

      if (isActive !== undefined) {
        conditions.push(Prisma.sql`"isActive" = ${isActive === 'true'}`);
      }

      const parsedFilial = parseFilial(filial);
      if (parsedFilial != null) {
        conditions.push(Prisma.sql`filial = ${parsedFilial}`);
      }

      const limitNum = Math.min(Number(limit) || 20, 2000);
      const skip = (Number(page) - 1) * limitNum;
      const whereSql = Prisma.join(conditions, ' AND ');

      const [rows, countRows] = await Promise.all([
        prisma.$queryRaw<StockLocationRow[]>`
          SELECT id, code, name, polo, filial, "costCenterId", "isActive", "createdAt", "updatedAt"
          FROM stock_locations
          WHERE ${whereSql}
          ORDER BY filial ASC, code ASC
          OFFSET ${skip} LIMIT ${limitNum}
        `,
        prisma.$queryRaw<Array<{ c: bigint }>>`
          SELECT COUNT(*)::bigint AS c FROM stock_locations WHERE ${whereSql}
        `,
      ]);

      const total = Number(countRows[0]?.c ?? 0);
      res.json({
        success: true,
        data: await comCentroCusto(rows),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async syncTotvs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const espera = reservarAtualizacaoManual('locais-estoque');
      if (espera) {
        res.status(429).json({
          success: false,
          message: espera.mensagem,
          retryAfterSeconds: espera.segundosRestantes,
          liberaEm: espera.liberaEm,
        });
        return;
      }
      const force = req.query.force === 'true' || req.body?.force === true;
      const result = await syncStockLocationsFromTotvs({ force });
      res.json({ success: true, data: result, liberaEm: proximaAtualizacaoManual('locais-estoque') });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      next(createError(`Não foi possível sincronizar com o TOTVS: ${message}`, 502));
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureStockLocationsTable(prisma);
      const rows = await prisma.$queryRaw<StockLocationRow[]>`
        SELECT id, code, name, polo, filial, "costCenterId", "isActive", "createdAt", "updatedAt"
        FROM stock_locations WHERE id = ${req.params.id} LIMIT 1
      `;
      if (!rows[0]) {
        throw createError('Local de estoque não encontrado', 404);
      }
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureStockLocationsTable(prisma);
      const { code, name, polo, filial, isActive, costCenterId } = req.body;
      const trimmedName = String(name || '').trim();
      const trimmedCode = String(code || '').trim();

      if (!trimmedName) {
        throw createError('Nome é obrigatório', 400);
      }
      if (!trimmedCode) {
        throw createError('ID é obrigatório', 400);
      }

      const parsedFilial = parseFilial(filial) ?? filialFromPolo(polo);
      const exists = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM stock_locations WHERE filial = ${parsedFilial} AND code = ${trimmedCode} LIMIT 1
      `;
      if (exists[0]) {
        throw createError('Já existe um local de estoque com este ID nesta filial', 409);
      }

      const id = newId();
      const now = new Date();
      const poloValue = polo ? String(polo).trim() : null;
      const active = isActive !== undefined ? Boolean(isActive) : true;
      const ccId = await parseCostCenterId(costCenterId);
      await prisma.$executeRaw`
        INSERT INTO stock_locations (id, code, name, polo, filial, "costCenterId", "isActive", "createdAt", "updatedAt")
        VALUES (${id}, ${trimmedCode}, ${trimmedName}, ${poloValue}, ${parsedFilial}, ${ccId}, ${active}, ${now}, ${now})
      `;
      const rows = await prisma.$queryRaw<StockLocationRow[]>`
        SELECT id, code, name, polo, filial, "costCenterId", "isActive", "createdAt", "updatedAt"
        FROM stock_locations WHERE id = ${id} LIMIT 1
      `;

      res.status(201).json({
        success: true,
        data: (await comCentroCusto(rows))[0],
        message: 'Local de estoque criado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureStockLocationsTable(prisma);
      const { id } = req.params;
      const { code, name, polo, filial, isActive, costCenterId } = req.body;
      const existing = (
        await prisma.$queryRaw<StockLocationRow[]>`
          SELECT id, code, name, polo, filial, "costCenterId", "isActive", "createdAt", "updatedAt"
          FROM stock_locations WHERE id = ${id} LIMIT 1
        `
      )[0];
      if (!existing) {
        throw createError('Local de estoque não encontrado', 404);
      }

      const nextCode = code !== undefined ? String(code).trim() : existing.code;
      const nextFilial = filial !== undefined ? parseFilial(filial) : existing.filial;
      if (filial !== undefined && nextFilial == null) {
        throw createError('Filial deve ser 1 (DF) ou 5 (GO)', 400);
      }
      if (!nextCode) {
        throw createError('ID é obrigatório', 400);
      }

      if (nextCode !== existing.code || nextFilial !== existing.filial) {
        const clash = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM stock_locations
          WHERE filial = ${nextFilial} AND code = ${nextCode} AND id <> ${id}
          LIMIT 1
        `;
        if (clash[0]) {
          throw createError('Já existe um local de estoque com este ID nesta filial', 409);
        }
      }

      const nextName = name !== undefined ? String(name).trim() : existing.name;
      const nextPolo = polo !== undefined ? (polo ? String(polo).trim() : null) : existing.polo;
      const nextActive = isActive !== undefined ? Boolean(isActive) : existing.isActive;
      const nextCostCenterId =
        costCenterId !== undefined ? await parseCostCenterId(costCenterId) : existing.costCenterId;
      const now = new Date();
      await prisma.$executeRaw`
        UPDATE stock_locations
        SET code = ${nextCode},
            name = ${nextName},
            polo = ${nextPolo},
            filial = ${nextFilial},
            "costCenterId" = ${nextCostCenterId},
            "isActive" = ${nextActive},
            "updatedAt" = ${now}
        WHERE id = ${id}
      `;
      const rows = await prisma.$queryRaw<StockLocationRow[]>`
        SELECT id, code, name, polo, filial, "costCenterId", "isActive", "createdAt", "updatedAt"
        FROM stock_locations WHERE id = ${id} LIMIT 1
      `;

      res.json({
        success: true,
        data: (await comCentroCusto(rows))[0],
        message: 'Local de estoque atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureStockLocationsTable(prisma);
      const { id } = req.params;
      const existing = (
        await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM stock_locations WHERE id = ${id} LIMIT 1
        `
      )[0];
      if (!existing) {
        throw createError('Local de estoque não encontrado', 404);
      }

      let usedCount = 0;
      try {
        const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
          SELECT COUNT(*)::bigint AS c FROM purchase_orders WHERE "stockLocationId" = ${id}
        `;
        usedCount = Number(rows[0]?.c ?? 0);
      } catch {
        usedCount = 0;
      }

      if (usedCount > 0) {
        throw createError(
          `Não é possível excluir este local de estoque.\n\nEle está vinculado a ${usedCount} ordem(ns) de compra.`,
          409
        );
      }

      await prisma.$executeRaw`DELETE FROM stock_locations WHERE id = ${id}`;
      res.json({
        success: true,
        message: 'Local de estoque excluído com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }
}
