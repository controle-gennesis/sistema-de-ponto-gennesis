import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { syncPaymentConditionsFromTotvs } from '../services/PaymentConditionTotvsSync';

const DEFAULTS: Array<{
  code: string;
  label: string;
  paymentType: string;
  parcelCount: number;
  parcelDueDays: number[];
  sortOrder: number;
  isSystem: boolean;
}> = [
  { code: 'AVISTA', label: 'À vista', paymentType: 'AVISTA', parcelCount: 1, parcelDueDays: [0], sortOrder: 0, isSystem: true },
  {
    code: '001',
    label: 'A VISTA SEM PRAZO',
    paymentType: 'AVISTA',
    parcelCount: 1,
    parcelDueDays: [0],
    sortOrder: 1,
    isSystem: true
  },
  { code: 'BOLETO_30', label: 'Boleto 30 dias', paymentType: 'BOLETO', parcelCount: 1, parcelDueDays: [30], sortOrder: 10, isSystem: true },
  { code: 'BOLETO_28', label: 'Boleto 28 dias', paymentType: 'BOLETO', parcelCount: 1, parcelDueDays: [28], sortOrder: 20, isSystem: true }
];

function jsonDays(days: number[]): Prisma.InputJsonValue {
  return days as unknown as Prisma.InputJsonValue;
}

async function ensureDefaultPaymentConditions(): Promise<void> {
  const n = await prisma.paymentCondition.count();
  if (n > 0) return;
  await prisma.paymentCondition.createMany({
    data: DEFAULTS.map((d) => ({
      code: d.code,
      label: d.label,
      paymentType: d.paymentType,
      parcelCount: d.parcelCount,
      parcelDueDays: jsonDays(d.parcelDueDays),
      sortOrder: d.sortOrder,
      isSystem: d.isSystem,
      isActive: true
    })),
    skipDuplicates: true
  });
}

function normalizeParcelDueDays(input: unknown): number[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.map((x) => {
      const n = Number(x);
      if (!Number.isFinite(n) || n < 0) throw createError('Cada prazo deve ser um número ≥ 0', 400);
      return Math.round(n);
    });
  }
  throw createError('parcelDueDays deve ser um array de números (dias)', 400);
}

function validateParcels(paymentType: string, parcelCount: number, days: number[]): void {
  if (!Number.isInteger(parcelCount) || parcelCount < 1) {
    throw createError('Número de parcelas deve ser ≥ 1', 400);
  }
  if (days.length !== parcelCount) {
    throw createError(`Informe exatamente ${parcelCount} prazo(s) (um por parcela)`, 400);
  }
  if (paymentType === 'AVISTA') {
    if (parcelCount !== 1 || days[0] !== 0) {
      throw createError('À vista: use 1 parcela e prazo 0 dias', 400);
    }
  }
}

function normalizeConditionCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function assertCodeAvailable(code: string, exceptId?: string) {
  const existing = await prisma.paymentCondition.findFirst({
    where: {
      code,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw createError('Já existe uma condição com este ID', 409);
  }
}

function generateCodeFromLabel(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 36);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return base ? `${base}_${suffix}` : `COND_${suffix}`;
}

export class PaymentConditionController {
  async syncTotvs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const force = req.query.force === 'true' || req.body?.force === true;
      const result = await syncPaymentConditionsFromTotvs({ force });
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      next(createError(`Não foi possível sincronizar com o TOTVS: ${message}`, 502));
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureDefaultPaymentConditions();
      const { paymentType, activeOnly } = req.query;
      const where: any = {};
      if (paymentType && typeof paymentType === 'string') {
        where.paymentType = paymentType;
      }
      if (activeOnly === 'true' || activeOnly === undefined) {
        where.isActive = true;
      }
      const rows = await prisma.paymentCondition.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
      });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureDefaultPaymentConditions();
      const { label, paymentType, parcelCount, parcelDueDays, code: rawCode } = req.body;
      if (!label || typeof label !== 'string' || !label.trim()) {
        throw createError('Nome da condição é obrigatório', 400);
      }
      if (paymentType !== 'AVISTA' && paymentType !== 'BOLETO') {
        throw createError('paymentType deve ser AVISTA ou BOLETO', 400);
      }
      const finalDays =
        parcelDueDays !== undefined
          ? normalizeParcelDueDays(parcelDueDays)
          : paymentType === 'AVISTA'
            ? [0]
            : [30];
      const finalCount =
        parcelCount !== undefined && Number(parcelCount) >= 1
          ? Math.floor(Number(parcelCount))
          : finalDays.length;
      validateParcels(paymentType, finalCount, finalDays);

      let code = normalizeConditionCode(rawCode);
      if (code) {
        await assertCodeAvailable(code);
      } else {
        code = generateCodeFromLabel(label.trim());
        for (let i = 0; i < 5; i++) {
          const exists = await prisma.paymentCondition.findUnique({ where: { code } });
          if (!exists) break;
          code = `${generateCodeFromLabel(label.trim())}_${i}`;
        }
      }
      const row = await prisma.paymentCondition.create({
        data: {
          code,
          label: label.trim(),
          paymentType,
          parcelCount: finalCount,
          parcelDueDays: jsonDays(finalDays),
          sortOrder: 100,
          isSystem: false,
          isActive: true
        }
      });
      res.status(201).json({ success: true, data: row, message: 'Condição criada' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { label, sortOrder, isActive, parcelCount, parcelDueDays, code: rawCode } = req.body;
      const row = await prisma.paymentCondition.findUnique({ where: { id } });
      if (!row) throw createError('Condição não encontrada', 404);
      const data: any = {};
      let conflictId: string | null = null;
      const nextCode = normalizeConditionCode(rawCode);
      if (rawCode !== undefined && !nextCode) {
        throw createError('ID da condição é obrigatório', 400);
      }
      if (nextCode && nextCode !== row.code) {
        const conflict = await prisma.paymentCondition.findFirst({
          where: { code: nextCode, id: { not: id } },
          select: { id: true, label: true, paymentType: true },
        });
        if (conflict && conflict.paymentType !== row.paymentType) {
          throw createError(
            `O ID ${nextCode} já pertence a "${conflict.label}". Altere o ID dessa outra condição primeiro.`,
            409
          );
        }
        data.code = nextCode;
        conflictId = conflict?.id ?? null;
      }
      if (label !== undefined) {
        if (typeof label !== 'string' || !label.trim()) throw createError('Nome inválido', 400);
        data.label = label.trim();
      }
      if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
      if (isActive !== undefined) data.isActive = Boolean(isActive);

      let nextCount = row.parcelCount;
      let nextDays: number[];
      try {
        nextDays = normalizeParcelDueDays(row.parcelDueDays);
      } catch {
        nextDays = [0];
      }
      if (parcelCount !== undefined) {
        nextCount = Number(parcelCount);
      }
      if (parcelDueDays !== undefined) {
        nextDays = normalizeParcelDueDays(parcelDueDays);
      }
      if (parcelCount !== undefined || parcelDueDays !== undefined) {
        validateParcels(row.paymentType, nextCount, nextDays);
        data.parcelCount = nextCount;
        data.parcelDueDays = jsonDays(nextDays);
      }

      const updated = await prisma.$transaction(async (tx) => {
        if (conflictId) {
          await tx.paymentCondition.delete({ where: { id: conflictId } });
        }
        const saved = await tx.paymentCondition.update({ where: { id }, data });
        if (data.code && data.code !== row.code) {
          await tx.purchaseOrder.updateMany({
            where: { paymentCondition: row.code },
            data: { paymentCondition: data.code },
          });
          await tx.quoteMapSupplier.updateMany({
            where: { paymentCondition: row.code },
            data: { paymentCondition: data.code },
          });
        }
        return saved;
      });
      res.json({ success: true, data: updated, message: 'Condição atualizada' });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const row = await prisma.paymentCondition.findUnique({ where: { id } });
      if (!row) throw createError('Condição não encontrada', 404);
      const [ocCount, mapCount] = await Promise.all([
        prisma.purchaseOrder.count({ where: { paymentCondition: row.code } }),
        prisma.quoteMapSupplier.count({ where: { paymentCondition: row.code } })
      ]);
      if (ocCount > 0 || mapCount > 0) {
        throw createError(
          'Esta condição está em uso em ordens de compra ou mapas de cotação e não pode ser excluída',
          400
        );
      }

      await prisma.paymentCondition.delete({ where: { id } });
      res.json({ success: true, message: 'Condição excluída' });
    } catch (error) {
      next(error);
    }
  }
}
