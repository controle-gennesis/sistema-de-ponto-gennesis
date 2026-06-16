import { Response, NextFunction } from 'express';
import type { VehicleUsageType } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { listFipeBrands, listFipeModels } from '../services/FipeService';
import {
  isValidBrazilianPlate,
  normalizePlacaForStorage,
  placaVariants
} from '../lib/brazilianVehiclePlate';

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizePlaca(value: unknown): string {
  return normalizePlacaForStorage(value);
}

async function findDuplicatePlaca(placa: string, excludeId?: string) {
  const variants = placaVariants(placa);
  return prisma.vehicle.findFirst({
    where: {
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      placaVeic: { in: variants }
    }
  });
}

function parseFrotaPartic(value: unknown): VehicleUsageType | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['frota', 'f', 'fleet'].includes(normalized)) return 'FROTA';
  if (['particular', 'partic', 'p', 'private'].includes(normalized)) return 'PARTICULAR';
  if (normalized === 'frota_partic') return null;

  const upper = String(value).trim().toUpperCase();
  if (upper === 'FROTA') return 'FROTA';
  if (upper === 'PARTICULAR') return 'PARTICULAR';

  throw createError('Frota/Particular inválido. Use Frota ou Particular.', 400);
}

function buildVehicleData(body: Record<string, unknown>) {
  const contrato =
    normalizeOptionalString(body.contrato) ?? normalizeOptionalString(body.projeto);

  return {
    marcaVeic: normalizeOptionalString(body.marcaVeic),
    modeloVeic: normalizeOptionalString(body.modeloVeic) || '',
    placaVeic: normalizePlaca(body.placaVeic),
    polo: normalizeOptionalString(body.polo),
    contrato,
    responsavel: normalizeOptionalString(body.responsavel),
    frotaPartic: parseFrotaPartic(body.frota_partic ?? body.frotaPartic),
    isActive:
      body.isActive === undefined
        ? true
        : typeof body.isActive === 'boolean'
          ? body.isActive
          : ['true', '1', 'sim', 's', 'ativo'].includes(String(body.isActive).trim().toLowerCase())
  };
}

async function reserveVehicleCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER) END
    ) AS max
    FROM vehicles
  `;

  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

async function generateVehicleCode(): Promise<string> {
  const [code] = await reserveVehicleCodes(1);
  if (!code) throw createError('Não foi possível gerar o código do veículo', 500);
  return code;
}

export class VehicleController {
  async getFipeBrands(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const brands = await listFipeBrands(req.query.type);
      res.json({ success: true, data: brands });
    } catch (error) {
      next(error);
    }
  }

  async getFipeModels(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { brandId } = req.params;
      const models = await listFipeModels(req.query.type, brandId);
      res.json({ success: true, data: models });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive, page = 1, limit = 20 } = req.query;
      const where: Record<string, unknown> = {};

      if (search) {
        const term = search as string;
        where.OR = [
          { code: { contains: term, mode: 'insensitive' } },
          { marcaVeic: { contains: term, mode: 'insensitive' } },
          { modeloVeic: { contains: term, mode: 'insensitive' } },
          { placaVeic: { contains: term, mode: 'insensitive' } },
          { polo: { contains: term, mode: 'insensitive' } },
          { contrato: { contains: term, mode: 'insensitive' } },
          { responsavel: { contains: term, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) where.isActive = isActive === 'true';

      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;

      const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ createdAt: 'asc' }]
        }),
        prisma.vehicle.count({ where })
      ]);

      res.json({
        success: true,
        data: vehicles,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const vehicle = await prisma.vehicle.findUnique({ where: { id } });
      if (!vehicle) throw createError('Veículo não encontrado', 404);
      res.json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = buildVehicleData(req.body);
      if (!parsed.modeloVeic) throw createError('Modelo do veículo é obrigatório', 400);
      if (!parsed.placaVeic) throw createError('Placa é obrigatória', 400);
      if (!isValidBrazilianPlate(parsed.placaVeic)) {
        throw createError('Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul).', 400);
      }

      const existingPlaca = await findDuplicatePlaca(parsed.placaVeic);
      if (existingPlaca) throw createError('Já existe um veículo com esta placa', 400);

      const finalCode = await generateVehicleCode();
      const vehicle = await prisma.vehicle.create({
        data: {
          ...parsed,
          code: finalCode
        }
      });

      res.status(201).json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.vehicle.findUnique({ where: { id } });
      if (!existing) throw createError('Veículo não encontrado', 404);

      const parsed = buildVehicleData({ ...existing, ...req.body });
      if (!parsed.modeloVeic) throw createError('Modelo do veículo é obrigatório', 400);
      if (!parsed.placaVeic) throw createError('Placa é obrigatória', 400);
      if (!isValidBrazilianPlate(parsed.placaVeic)) {
        throw createError('Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul).', 400);
      }

      const duplicatePlaca = await findDuplicatePlaca(parsed.placaVeic, id);
      if (duplicatePlaca) throw createError('Já existe um veículo com esta placa', 400);

      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: parsed
      });

      res.json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.vehicle.findUnique({ where: { id } });
      if (!existing) throw createError('Veículo não encontrado', 404);

      await prisma.vehicle.delete({ where: { id } });
      res.json({ success: true, message: 'Veículo excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }
}
