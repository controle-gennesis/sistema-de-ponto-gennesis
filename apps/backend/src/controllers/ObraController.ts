import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ensureUnaccentExtension, textMatchesSearch } from '../lib/normalizeSearchText';

const obraInclude = {
  contrato: { select: { id: true, name: true, number: true } },
} as const;

function serializeObra(row: {
  id: string;
  name: string;
  contratoId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  contrato?: { id: string; name: string; number: string } | null;
}) {
  return {
    id: row.id,
    name: row.name,
    contratoId: row.contratoId,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contratoNome: row.contrato?.name ?? '',
    contrato: row.contrato
      ? { id: row.contrato.id, name: row.contrato.name, number: row.contrato.number }
      : null,
  };
}

export class ObraController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, page = 1, limit = 100, isActive, contratoId } = req.query;
      const limitNum = Math.min(Number(limit) || 100, 500);
      const skip = (Number(page) - 1) * limitNum;
      const searchTerm = typeof search === 'string' ? search.trim() : '';
      const contratoFilter =
        typeof contratoId === 'string' && contratoId.trim() ? contratoId.trim() : '';

      const where: Prisma.ObraWhereInput = {};
      if (isActive !== undefined) where.isActive = isActive === 'true';
      if (contratoFilter) where.contratoId = contratoFilter;

      if (searchTerm) {
        await ensureUnaccentExtension();
        const all = await prisma.obra.findMany({
          where,
          include: obraInclude,
          orderBy: { name: 'asc' },
        });
        const filtered = all.filter(
          (row) =>
            textMatchesSearch(row.name, searchTerm) ||
            textMatchesSearch(row.contrato?.name, searchTerm) ||
            textMatchesSearch(row.contrato?.number, searchTerm)
        );
        const total = filtered.length;
        const items = filtered.slice(skip, skip + limitNum).map(serializeObra);
        res.json({
          success: true,
          data: items,
          pagination: {
            page: Number(page),
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
          },
        });
        return;
      }

      const [items, total] = await Promise.all([
        prisma.obra.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { name: 'asc' },
          include: obraInclude,
        }),
        prisma.obra.count({ where }),
      ]);

      res.json({
        success: true,
        data: items.map(serializeObra),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.obra.findUnique({
        where: { id },
        include: obraInclude,
      });
      if (!item) throw createError('Obra não encontrada', 404);
      res.json({ success: true, data: serializeObra(item) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const contratoId =
        typeof req.body?.contratoId === 'string' ? req.body.contratoId.trim() : '';
      if (!name) throw createError('Nome é obrigatório', 400);
      if (!contratoId) throw createError('Contrato é obrigatório', 400);

      const contrato = await prisma.contract.findUnique({ where: { id: contratoId } });
      if (!contrato) throw createError('Contrato não encontrado', 404);

      const duplicate = await prisma.obra.findFirst({
        where: {
          contratoId,
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (duplicate) throw createError('Já existe uma obra com este nome neste contrato', 400);

      const created = await prisma.obra.create({
        data: { name, contratoId },
        include: obraInclude,
      });
      res.status(201).json({ success: true, data: serializeObra(created), message: 'Obra criada' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.obra.findUnique({ where: { id } });
      if (!item) throw createError('Obra não encontrada', 404);

      const data: Prisma.ObraUpdateInput = {};
      let nextContratoId = item.contratoId;
      let nextName = item.name;

      if (req.body?.contratoId !== undefined) {
        const contratoId =
          typeof req.body.contratoId === 'string' ? req.body.contratoId.trim() : '';
        if (!contratoId) throw createError('Contrato é obrigatório', 400);
        const contrato = await prisma.contract.findUnique({ where: { id: contratoId } });
        if (!contrato) throw createError('Contrato não encontrado', 404);
        nextContratoId = contratoId;
        data.contrato = { connect: { id: contratoId } };
      }

      if (req.body?.name !== undefined) {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        if (!name) throw createError('Nome é obrigatório', 400);
        nextName = name;
        data.name = name;
      }

      if (req.body?.isActive !== undefined) {
        data.isActive = Boolean(req.body.isActive);
      }

      if (req.body?.name !== undefined || req.body?.contratoId !== undefined) {
        const duplicate = await prisma.obra.findFirst({
          where: {
            id: { not: id },
            contratoId: nextContratoId,
            name: { equals: nextName, mode: 'insensitive' },
          },
        });
        if (duplicate) throw createError('Já existe uma obra com este nome neste contrato', 400);
      }

      const updated = await prisma.obra.update({
        where: { id },
        data,
        include: obraInclude,
      });
      res.json({ success: true, data: serializeObra(updated), message: 'Atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.obra.findUnique({ where: { id } });
      if (!item) throw createError('Obra não encontrada', 404);
      await prisma.obra.delete({ where: { id } });
      res.json({ success: true, message: 'Registro excluído' });
    } catch (error) {
      next(error);
    }
  }

  async importMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { obras } = req.body as { obras?: unknown };
      if (!Array.isArray(obras) || obras.length === 0) {
        throw createError('Envie um array "obras" com ao menos um item', 400);
      }

      const contracts = await prisma.contract.findMany({
        select: { id: true, name: true, number: true },
      });
      const byId = new Map(contracts.map((c) => [c.id, c]));
      const byNumber = new Map(
        contracts
          .filter((c) => c.number?.trim())
          .map((c) => [c.number.trim().toLowerCase(), c]),
      );
      const byName = new Map(
        contracts
          .filter((c) => c.name?.trim())
          .map((c) => [c.name.trim().toLowerCase(), c]),
      );
      const byExternal = new Map<string, (typeof contracts)[number]>();
      try {
        const extRows = await prisma.$queryRaw<Array<{ id: string; externalId: string | null }>>`
          SELECT id, "externalId" FROM "contracts" WHERE "externalId" IS NOT NULL
        `;
        for (const row of extRows) {
          const contract = byId.get(row.id);
          if (contract && row.externalId?.trim()) {
            byExternal.set(row.externalId.trim().toLowerCase(), contract);
          }
        }
      } catch {
        // coluna ainda não existe
      }

      const resolveContrato = (raw: string) => {
        const key = raw.trim();
        if (!key) return null;
        const low = key.toLowerCase();
        return (
          byId.get(key) ||
          byNumber.get(low) ||
          byName.get(low) ||
          byExternal.get(low) ||
          null
        );
      };

      let created = 0;
      let updated = 0;
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < obras.length; i += 1) {
        const row = (obras[i] || {}) as {
          name?: unknown;
          contrato?: unknown;
          contratoId?: unknown;
          externalId?: unknown;
          isActive?: unknown;
        };
        try {
          const name = typeof row.name === 'string' ? row.name.trim() : '';
          const contratoRef =
            (typeof row.contrato === 'string' ? row.contrato.trim() : '') ||
            (typeof row.contratoId === 'string' ? row.contratoId.trim() : '');
          const externalId =
            typeof row.externalId === 'string' ? row.externalId.trim() : '';
          const isActive =
            row.isActive === undefined
              ? true
              : typeof row.isActive === 'boolean'
                ? row.isActive
                : String(row.isActive).toLowerCase() !== 'false';

          if (!name) throw new Error('Nome é obrigatório');
          if (!contratoRef) throw new Error('Contrato é obrigatório');

          const contrato = resolveContrato(contratoRef);
          if (!contrato) {
            throw new Error(`Contrato não encontrado: "${contratoRef}"`);
          }

          if (externalId) {
            const existingByExt = await prisma.obra.findUnique({
              where: { externalId },
            });
            if (existingByExt) {
              await prisma.obra.update({
                where: { id: existingByExt.id },
                data: { name, contratoId: contrato.id, isActive },
              });
              updated += 1;
              continue;
            }
          }

          const existingByName = await prisma.obra.findFirst({
            where: {
              contratoId: contrato.id,
              name: { equals: name, mode: 'insensitive' },
            },
          });
          if (existingByName) {
            await prisma.obra.update({
              where: { id: existingByName.id },
              data: {
                name,
                isActive,
                ...(externalId && !existingByName.externalId
                  ? { externalId }
                  : {}),
              },
            });
            updated += 1;
            continue;
          }

          await prisma.obra.create({
            data: {
              name,
              contratoId: contrato.id,
              isActive,
              ...(externalId ? { externalId } : {}),
            },
          });
          created += 1;
        } catch (err: unknown) {
          errors.push({
            index: i,
            message: err instanceof Error ? err.message : 'Erro ao importar linha',
          });
        }
      }

      res.json({
        success: true,
        data: {
          created: created + updated,
          updated,
          failed: errors.length,
          errors,
        },
        message: `Importação: ${created} nova(s), ${updated} atualizada(s), ${errors.length} erro(s)`,
      });
    } catch (error) {
      next(error);
    }
  }
}
