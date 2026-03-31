import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

function toDec(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function serializePleito(p: any) {
  const dec = (v: unknown) => (v != null ? Number(v) : null);
  return {
    ...p,
    accumulatedBilled: dec(p.accumulatedBilled),
    billingRequest: dec(p.billingRequest),
    budgetAmount1: dec(p.budgetAmount1),
    budgetAmount2: dec(p.budgetAmount2),
    budgetAmount3: dec(p.budgetAmount3),
    budgetAmount4: dec(p.budgetAmount4),
  };
}

export class PleitoController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, page = 1, limit = 20, gerados } = req.query;
      const where: Prisma.PleitoWhereInput = {};

      if (search) {
        const s = search as string;
        where.OR = [
          { serviceDescription: { contains: s, mode: 'insensitive' } },
          { folderNumber: { contains: s, mode: 'insensitive' } },
          { location: { contains: s, mode: 'insensitive' } },
          { engineer: { contains: s, mode: 'insensitive' } }
        ];
      }

      if (gerados === '1' || gerados === 'true') {
        where.billingRequest = { gt: 0 };
      }

      const limitNum = Math.min(Number(limit) || 20, 200);
      const skip = (Number(page) - 1) * limitNum;

      const [rows, total] = await Promise.all([
        prisma.pleito.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: gerados === '1' || gerados === 'true' ? { updatedContract: { select: { id: true, name: true, number: true } } } : undefined
        }),
        prisma.pleito.count({ where })
      ]);

      res.json({
        success: true,
        data: rows.map(serializePleito),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getDivSeList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.pleito.findMany({
        where: { divSe: { not: null } },
        select: { divSe: true },
        distinct: ['divSe'],
        orderBy: { divSe: 'asc' }
      });
      const list = rows.map((r) => r.divSe).filter((v): v is string => !!v && v.trim() !== '');
      res.json({ success: true, data: list });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const row = await prisma.pleito.findUnique({ where: { id } });
      if (!row) throw createError('Registro não encontrado', 404);
      res.json({ success: true, data: serializePleito(row) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const b = req.body;
      if (!b.serviceDescription?.trim()) {
        throw createError('Descrição do serviço é obrigatória', 400);
      }

      const creationYear = b.creationYear != null && b.creationYear !== '' ? Number(b.creationYear) : null;
      const data: Prisma.PleitoCreateInput = {
        creationMonth: b.creationMonth?.trim() || null,
        creationYear: Number.isInteger(creationYear) ? creationYear : null,
        startDate: b.startDate ? new Date(b.startDate) : null,
        endDate: b.endDate ? new Date(b.endDate) : null,
        budgetStatus: b.budgetStatus?.trim() || null,
        folderNumber: b.folderNumber?.trim() || null,
        lot: b.lot?.trim() || null,
        divSe: b.divSe?.trim() || null,
        location: b.location?.trim() || null,
        unit: b.unit?.trim() || null,
        serviceDescription: b.serviceDescription.trim(),
        budget: b.budget?.trim() || null,
        executionStatus: b.executionStatus?.trim() || null,
        billingStatus: b.billingStatus?.trim() || null,
        accumulatedBilled: toDec(b.accumulatedBilled),
        billingRequest: toDec(b.billingRequest),
        invoiceNumber: b.invoiceNumber?.trim() || null,
        estimator: b.estimator?.trim() || null,
        budgetAmount1: toDec(b.budgetAmount1),
        budgetAmount2: toDec(b.budgetAmount2),
        budgetAmount3: toDec(b.budgetAmount3),
        budgetAmount4: toDec(b.budgetAmount4),
        pv: b.pv?.trim() || null,
        ipi: b.ipi?.trim() || null,
        reportsBilling: b.reportsBilling?.trim() || null,
        engineer: b.engineer?.trim() || null,
        supervisor: b.supervisor?.trim() || null
      };

      const row = await prisma.pleito.create({ data });

      res.status(201).json({
        success: true,
        data: serializePleito(row),
        message: 'Andamento da OS cadastrado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const b = req.body;
      const existing = await prisma.pleito.findUnique({ where: { id } });
      if (!existing) throw createError('Registro não encontrado', 404);

      const data: Prisma.PleitoUpdateInput = {};
      if (b.creationMonth !== undefined) data.creationMonth = b.creationMonth?.trim() || null;
      if (b.creationYear !== undefined) {
        const vy = b.creationYear != null && b.creationYear !== '' ? Number(b.creationYear) : null;
        data.creationYear = Number.isInteger(vy) ? vy : null;
      }
      if (b.startDate !== undefined) data.startDate = b.startDate ? new Date(b.startDate) : null;
      if (b.endDate !== undefined) data.endDate = b.endDate ? new Date(b.endDate) : null;
      if (b.budgetStatus !== undefined) data.budgetStatus = b.budgetStatus?.trim() || null;
      if (b.folderNumber !== undefined) data.folderNumber = b.folderNumber?.trim() || null;
      if (b.lot !== undefined) data.lot = b.lot?.trim() || null;
      if (b.divSe !== undefined) data.divSe = b.divSe?.trim() || null;
      if (b.location !== undefined) data.location = b.location?.trim() || null;
      if (b.unit !== undefined) data.unit = b.unit?.trim() || null;
      if (b.serviceDescription !== undefined) {
        if (!b.serviceDescription?.trim()) throw createError('Descrição do serviço é obrigatória', 400);
        data.serviceDescription = b.serviceDescription.trim();
      }
      if (b.budget !== undefined) data.budget = b.budget?.trim() || null;
      if (b.executionStatus !== undefined) data.executionStatus = b.executionStatus?.trim() || null;
      if (b.billingStatus !== undefined) data.billingStatus = b.billingStatus?.trim() || null;
      if (b.accumulatedBilled !== undefined) data.accumulatedBilled = toDec(b.accumulatedBilled);
      if (b.billingRequest !== undefined) data.billingRequest = toDec(b.billingRequest);
      if (b.invoiceNumber !== undefined) data.invoiceNumber = b.invoiceNumber?.trim() || null;
      if (b.estimator !== undefined) data.estimator = b.estimator?.trim() || null;
      if (b.budgetAmount1 !== undefined) data.budgetAmount1 = toDec(b.budgetAmount1);
      if (b.budgetAmount2 !== undefined) data.budgetAmount2 = toDec(b.budgetAmount2);
      if (b.budgetAmount3 !== undefined) data.budgetAmount3 = toDec(b.budgetAmount3);
      if (b.budgetAmount4 !== undefined) data.budgetAmount4 = toDec(b.budgetAmount4);
      if (b.pv !== undefined) data.pv = b.pv?.trim() || null;
      if (b.ipi !== undefined) data.ipi = b.ipi?.trim() || null;
      if (b.reportsBilling !== undefined) data.reportsBilling = b.reportsBilling?.trim() || null;
      if (b.engineer !== undefined) data.engineer = b.engineer?.trim() || null;
      if (b.supervisor !== undefined) data.supervisor = b.supervisor?.trim() || null;

      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.pleito.update({ where: { id }, data });

        const isPaid = (updated.billingStatus || '').trim().toLowerCase() === 'pago';
        const invoiceNumber = (updated.invoiceNumber || '').trim();
        const serviceOrder = (updated.divSe || '').trim();
        const grossValue = updated.billingRequest != null ? Number(updated.billingRequest) : 0;

        // Quando o pleito for marcado como pago e tiver Nº NF, refletir automaticamente em faturamento.
        if (updated.updatedContractId && isPaid && invoiceNumber && serviceOrder && grossValue > 0) {
          const existingBilling = await tx.contractBilling.findFirst({
            where: {
              contractId: updated.updatedContractId,
              invoiceNumber,
              serviceOrder
            }
          });

          if (existingBilling) {
            await tx.contractBilling.update({
              where: { id: existingBilling.id },
              data: {
                issueDate: new Date(),
                grossValue,
                netValue: grossValue
              }
            });
          } else {
            await tx.contractBilling.create({
              data: {
                contractId: updated.updatedContractId,
                issueDate: new Date(),
                invoiceNumber,
                serviceOrder,
                grossValue,
                netValue: grossValue
              }
            });
          }
        }

        return updated;
      });

      res.json({ success: true, data: serializePleito(row), message: 'Atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.pleito.findUnique({ where: { id } });
      if (!existing) throw createError('Registro não encontrado', 404);
      await prisma.pleito.delete({ where: { id } });
      res.json({ success: true, message: 'Excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }
}
