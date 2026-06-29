import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { assertUserHasFuelSuppliesAccess } from '../lib/fuelSuppliesAccess';
import {
  FUEL_ABASTECIMENTO_STATE_CODES,
  listActiveFuelGasStationsByRegion,
} from '../lib/fuelAdministrativeRegions';

const regionBodySchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  stateCode: z.enum(['DF', 'GO']),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const stationBodySchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(240).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const regionInclude = {
  gasStations: {
    orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
  },
} as const;

export class FuelAdministrativeRegionController {
  private async assertAccess(req: AuthRequest) {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    await assertUserHasFuelSuppliesAccess(req.user.id, req.user.isAdmin);
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      const includeInactive = req.query.includeInactive === 'true';

      const rows = await prisma.fuelAdministrativeRegion.findMany({
        where: {
          ...(includeInactive ? {} : { isActive: true }),
          ...(stateCode && FUEL_ABASTECIMENTO_STATE_CODES.includes(stateCode as 'DF' | 'GO')
            ? { stateCode }
            : {}),
        },
        orderBy: [{ stateCode: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          gasStations: {
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
          _count: { select: { requests: true } },
        },
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const body = regionBodySchema.parse(req.body);

      const existing = await prisma.fuelAdministrativeRegion.findUnique({
        where: { code: body.code.trim().toUpperCase() },
      });
      if (existing) throw createError('Já existe uma região com este código', 400);

      const row = await prisma.fuelAdministrativeRegion.create({
        data: {
          code: body.code.trim().toUpperCase(),
          name: body.name.trim(),
          stateCode: body.stateCode,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
        },
        include: regionInclude,
      });

      res.status(201).json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const body = regionBodySchema.partial().parse(req.body);
      const existing = await prisma.fuelAdministrativeRegion.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw createError('Região não encontrada', 404);

      if (body.code) {
        const duplicate = await prisma.fuelAdministrativeRegion.findFirst({
          where: {
            code: body.code.trim().toUpperCase(),
            NOT: { id: existing.id },
          },
        });
        if (duplicate) throw createError('Já existe uma região com este código', 400);
      }

      const row = await prisma.fuelAdministrativeRegion.update({
        where: { id: existing.id },
        data: {
          ...(body.code !== undefined && { code: body.code.trim().toUpperCase() }),
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.stateCode !== undefined && { stateCode: body.stateCode }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
        include: regionInclude,
      });

      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const existing = await prisma.fuelAdministrativeRegion.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { requests: true } } },
      });
      if (!existing) throw createError('Região não encontrada', 404);
      if (existing._count.requests > 0) {
        throw createError(
          'Não é possível excluir: existem solicitações vinculadas. Desative a região.',
          400,
        );
      }

      await prisma.fuelGasStation.deleteMany({ where: { regionId: existing.id } });
      await prisma.fuelAdministrativeRegion.delete({ where: { id: existing.id } });
      res.json({ success: true, message: 'Região excluída' });
    } catch (error) {
      next(error);
    }
  }

  async listStations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const regionId = req.params.regionId;
      const region = await prisma.fuelAdministrativeRegion.findUnique({ where: { id: regionId } });
      if (!region) throw createError('Região não encontrada', 404);

      const rows = await listActiveFuelGasStationsByRegion(regionId);
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async createStation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const body = stationBodySchema.parse(req.body);
      const region = await prisma.fuelAdministrativeRegion.findUnique({
        where: { id: req.params.regionId },
      });
      if (!region) throw createError('Região não encontrada', 404);

      const row = await prisma.fuelGasStation.create({
        data: {
          regionId: region.id,
          name: body.name.trim(),
          address: body.address?.trim() || null,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
        },
      });

      res.status(201).json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async updateStation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const body = stationBodySchema.partial().parse(req.body);
      const existing = await prisma.fuelGasStation.findUnique({ where: { id: req.params.stationId } });
      if (!existing) throw createError('Posto não encontrado', 404);

      const row = await prisma.fuelGasStation.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.address !== undefined && { address: body.address?.trim() || null }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async removeStation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const existing = await prisma.fuelGasStation.findUnique({
        where: { id: req.params.stationId },
        include: { _count: { select: { requests: true } } },
      });
      if (!existing) throw createError('Posto não encontrado', 404);
      if (existing._count.requests > 0) {
        throw createError(
          'Não é possível excluir: existem solicitações vinculadas. Desative o posto.',
          400,
        );
      }

      await prisma.fuelGasStation.delete({ where: { id: existing.id } });
      res.json({ success: true, message: 'Posto excluído' });
    } catch (error) {
      next(error);
    }
  }
}

export const fuelAdministrativeRegionController = new FuelAdministrativeRegionController();
