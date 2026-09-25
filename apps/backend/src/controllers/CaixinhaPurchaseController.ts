import { Response, NextFunction } from 'express';
import { Prisma, type CaixinhaPurchase } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { listCaixinhaAccountNames, upsertCaixinhaAccountName } from '../lib/ensureCaixinhaAccounts';

function trimOrNull(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.round(raw * 100) / 100);
  }
  const s = String(raw ?? '')
    .replace(/[R$\s]/g, '')
    .trim();
  if (!s) return 0;
  const n = s.includes(',')
    ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
    : parseFloat(s);
  if (!Number.isFinite(n) || n < 0) {
    throw createError('Valor inválido', 400);
  }
  return Math.round(n * 100) / 100;
}

function parseYmd(raw: unknown): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw createError('Data de compra inválida', 400);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
}

function ymdFromDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function serialize(row: CaixinhaPurchase) {
  return {
    id: row.id,
    filledAt: row.filledAt.toISOString(),
    personName: row.personName,
    personUserId: row.personUserId,
    osNumber: row.osNumber,
    contractId: row.contractId,
    contractName: row.contractName,
    obraId: row.obraId,
    obraName: row.obraName,
    caixinha: row.caixinha,
    purchaseDate: ymdFromDate(row.purchaseDate),
    storeName: row.storeName,
    invoiceNumber: row.invoiceNumber,
    amount: Number(row.amount),
    notes: row.notes,
    invoicePdfUrl: row.invoicePdfUrl,
    invoicePdfName: row.invoicePdfName,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveContract(contractId: string | null) {
  if (!contractId) return { contractId: null as string | null, contractName: null as string | null };
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, name: true },
  });
  if (!contract) throw createError('Contrato não encontrado', 400);
  return { contractId: contract.id, contractName: contract.name };
}

async function resolveObra(obraId: string | null, contractId: string | null) {
  if (!obraId) return { obraId: null as string | null, obraName: null as string | null };
  const obra = await prisma.obra.findUnique({
    where: { id: obraId },
    select: { id: true, name: true, contratoId: true },
  });
  if (!obra) throw createError('Obra não encontrada', 400);
  if (contractId && obra.contratoId !== contractId) {
    throw createError('A obra não pertence ao contrato selecionado', 400);
  }
  return { obraId: obra.id, obraName: obra.name };
}

async function resolvePerson(personUserId: string | null, personNameRaw: unknown) {
  const typedName = String(personNameRaw ?? '').trim();
  if (personUserId) {
    const user = await prisma.user.findUnique({
      where: { id: personUserId },
      select: { id: true, name: true },
    });
    if (!user) throw createError('Usuário não encontrado', 400);
    return { personUserId: user.id, personName: typedName || user.name };
  }
  if (!typedName) throw createError('Informe o nome', 400);
  return { personUserId: null as string | null, personName: typedName };
}

export class CaixinhaPurchaseController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const where: Prisma.CaixinhaPurchaseWhereInput = search
        ? {
            OR: [
              { personName: { contains: search, mode: 'insensitive' } },
              { osNumber: { contains: search, mode: 'insensitive' } },
              { contractName: { contains: search, mode: 'insensitive' } },
              { obraName: { contains: search, mode: 'insensitive' } },
              { caixinha: { contains: search, mode: 'insensitive' } },
              { storeName: { contains: search, mode: 'insensitive' } },
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};

      const rows = await prisma.caixinhaPurchase.findMany({
        where,
        orderBy: { filledAt: 'desc' },
        take: 500,
      });

      return res.json({ success: true, data: rows.map(serialize), count: rows.length });
    } catch (error) {
      return next(error);
    }
  }

  async options(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const [users, contracts, caixinhas, purchaseNames] = await Promise.all([
        prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
          take: 2000,
        }),
        prisma.contract.findMany({
          select: { id: true, name: true, number: true },
          orderBy: { name: 'asc' },
          take: 1000,
        }),
        listCaixinhaAccountNames(prisma).catch(() => [] as string[]),
        prisma.caixinhaPurchase.findMany({
          distinct: ['caixinha'],
          select: { caixinha: true },
        }),
      ]);

      const caixinhaSet = new Set<string>(caixinhas);
      for (const row of purchaseNames) {
        if (row.caixinha?.trim()) caixinhaSet.add(row.caixinha.trim());
      }

      return res.json({
        success: true,
        data: {
          users: users
            .filter((u) => u.name?.trim())
            .map((u) => ({ id: u.id, name: u.name.trim() })),
          contracts: contracts.map((c) => ({
            id: c.id,
            name: c.name,
          })),
          caixinhas: [...caixinhaSet].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.caixinhaPurchase.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Lançamento não encontrado', 404);
      return res.json({ success: true, data: serialize(row) });
    } catch (error) {
      return next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Não autenticado', 401);

      const body = req.body || {};
      const caixinha = String(body.caixinha ?? '').trim();
      if (!caixinha) throw createError('Informe a caixinha', 400);

      const person = await resolvePerson(trimOrNull(body.personUserId), body.personName);
      const contract = await resolveContract(trimOrNull(body.contractId));
      const obra = await resolveObra(trimOrNull(body.obraId), contract.contractId);
      const filledAtRaw = body.filledAt ? new Date(body.filledAt) : new Date();
      if (Number.isNaN(filledAtRaw.getTime())) throw createError('Data de preenchimento inválida', 400);

      const row = await prisma.caixinhaPurchase.create({
        data: {
          filledAt: filledAtRaw,
          personName: person.personName,
          personUserId: person.personUserId,
          osNumber: trimOrNull(body.osNumber),
          contractId: contract.contractId,
          contractName: contract.contractName,
          obraId: obra.obraId,
          obraName: obra.obraName,
          caixinha,
          purchaseDate: parseYmd(body.purchaseDate),
          storeName: trimOrNull(body.storeName),
          invoiceNumber: trimOrNull(body.invoiceNumber),
          amount: parseAmount(body.amount),
          notes: trimOrNull(body.notes),
          invoicePdfUrl: trimOrNull(body.invoicePdfUrl),
          invoicePdfName: trimOrNull(body.invoicePdfName),
          createdById: userId,
        },
      });
      await upsertCaixinhaAccountName(prisma, caixinha);

      return res.status(201).json({
        success: true,
        data: serialize(row),
        message: 'Lançamento criado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.caixinhaPurchase.findUnique({ where: { id: req.params.id } });
      if (!existing) throw createError('Lançamento não encontrado', 404);

      const body = req.body || {};
      const caixinha = String(body.caixinha ?? existing.caixinha).trim();
      if (!caixinha) throw createError('Informe a caixinha', 400);

      const person = await resolvePerson(
        body.personUserId !== undefined ? trimOrNull(body.personUserId) : existing.personUserId,
        body.personName !== undefined ? body.personName : existing.personName
      );
      const contract = await resolveContract(
        body.contractId !== undefined ? trimOrNull(body.contractId) : existing.contractId
      );
      const obra = await resolveObra(
        body.obraId !== undefined ? trimOrNull(body.obraId) : existing.obraId,
        contract.contractId
      );

      const row = await prisma.caixinhaPurchase.update({
        where: { id: existing.id },
        data: {
          personName: person.personName,
          personUserId: person.personUserId,
          osNumber: body.osNumber !== undefined ? trimOrNull(body.osNumber) : existing.osNumber,
          contractId: contract.contractId,
          contractName: contract.contractName,
          obraId: obra.obraId,
          obraName: obra.obraName,
          caixinha,
          purchaseDate:
            body.purchaseDate !== undefined ? parseYmd(body.purchaseDate) : existing.purchaseDate,
          storeName: body.storeName !== undefined ? trimOrNull(body.storeName) : existing.storeName,
          invoiceNumber:
            body.invoiceNumber !== undefined ? trimOrNull(body.invoiceNumber) : existing.invoiceNumber,
          amount: body.amount !== undefined ? parseAmount(body.amount) : existing.amount,
          notes: body.notes !== undefined ? trimOrNull(body.notes) : existing.notes,
          invoicePdfUrl:
            body.invoicePdfUrl !== undefined ? trimOrNull(body.invoicePdfUrl) : existing.invoicePdfUrl,
          invoicePdfName:
            body.invoicePdfName !== undefined
              ? trimOrNull(body.invoicePdfName)
              : existing.invoicePdfName,
        },
      });
      await upsertCaixinhaAccountName(prisma, caixinha);

      return res.json({
        success: true,
        data: serialize(row),
        message: 'Lançamento atualizado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  async createAccount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const name = String(req.body?.name ?? '').trim();
      if (!name) throw createError('Informe o nome da caixinha', 400);
      await upsertCaixinhaAccountName(prisma, name);
      return res.status(201).json({ success: true, data: { name }, message: 'Caixinha criada' });
    } catch (error) {
      return next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.caixinhaPurchase.findUnique({ where: { id: req.params.id } });
      if (!existing) throw createError('Lançamento não encontrado', 404);
      await prisma.caixinhaPurchase.delete({ where: { id: existing.id } });
      return res.json({ success: true, message: 'Lançamento excluído' });
    } catch (error) {
      return next(error);
    }
  }
}

export const caixinhaPurchaseController = new CaixinhaPurchaseController();
