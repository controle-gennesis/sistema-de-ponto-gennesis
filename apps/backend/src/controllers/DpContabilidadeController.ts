import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const REQUEST_TYPES = [
  'ADMISSAO',
  'AFASTAMENTO',
  'ALTERACAO_FUNCAO',
  'ALTERACAO_SALARIAL',
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'FERIAS',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RESCISAO',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
] as const;

const STATUSES = ['OPEN', 'IN_PROGRESS', 'CONCLUDED', 'CANCELLED'] as const;

const createSchema = z.object({
  requestType: z.enum(REQUEST_TYPES),
  title: z.string().trim().min(3, 'Informe um título com pelo menos 3 caracteres.').max(180),
  description: z.string().trim().min(8, 'Descreva a solicitação com pelo menos 8 caracteres.').max(8000),
  contractId: z.string().trim().min(1).optional().nullable(),
});

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Informe o comentário.').max(4000),
});

const statusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'CONCLUDED', 'CANCELLED']),
});

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDateStart(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateEnd(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T23:59:59.999-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadActor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      employee: { select: { department: true } },
    },
  });
  if (!user) throw createError('Usuário não encontrado.', 404);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    sector: user.employee?.department?.trim() || null,
  };
}

function serializeRequest(
  row: Prisma.DpContabilidadeRequestGetPayload<{ include: { comments: true } }>
) {
  return {
    id: row.id,
    displayNumber: row.displayNumber,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdByEmail: row.createdByEmail,
    sector: row.sector,
    requestType: row.requestType,
    title: row.title,
    description: row.description,
    contractId: row.contractId,
    contractName: row.contractName,
    status: row.status,
    concludedAt: row.concludedAt?.toISOString() ?? null,
    concludedByUserId: row.concludedByUserId,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledByUserId: row.cancelledByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    comments: row.comments.map((c) => ({
      id: c.id,
      userId: c.userId,
      userName: c.userName,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

const listInclude = {
  comments: { orderBy: { createdAt: 'asc' as const } },
};

export class DpContabilidadeController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const q = asString(req.query.q);
      const type = asString(req.query.type);
      const status = asString(req.query.status);
      const from = asString(req.query.from);
      const to = asString(req.query.to);
      const contractId = asString(req.query.contractId);

      const where: Prisma.DpContabilidadeRequestWhereInput = {};
      if (type && REQUEST_TYPES.includes(type as (typeof REQUEST_TYPES)[number])) {
        where.requestType = type as (typeof REQUEST_TYPES)[number];
      }

      const fromDate = from ? parseDateStart(from) : null;
      const toDate = to ? parseDateEnd(to) : null;
      if (fromDate || toDate) {
        where.createdAt = {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        };
      }

      if (contractId) {
        where.contractId = contractId;
      }

      if (q) {
        const num = Number(q.replace(/\D/g, ''));
        where.OR = [
          ...(Number.isInteger(num) && num > 0 ? [{ displayNumber: num }] : []),
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { createdByName: { contains: q, mode: 'insensitive' } },
          { contractName: { contains: q, mode: 'insensitive' } },
        ];
      }

      const statsWhere = { ...where };
      if (status && STATUSES.includes(status as (typeof STATUSES)[number])) {
        where.status = status as (typeof STATUSES)[number];
      }

      const [rows, counts] = await Promise.all([
        prisma.dpContabilidadeRequest.findMany({
          where,
          include: listInclude,
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        prisma.dpContabilidadeRequest.groupBy({
          by: ['status'],
          where: statsWhere,
          _count: { _all: true },
        }),
      ]);

      const stats = {
        total: 0,
        OPEN: 0,
        IN_PROGRESS: 0,
        CONCLUDED: 0,
        CANCELLED: 0,
      };
      for (const row of counts) {
        stats.total += row._count._all;
        stats[row.status] = row._count._all;
      }

      res.json({
        success: true,
        data: rows.map(serializeRequest),
        stats,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const existing = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: req.params.id },
        include: listInclude,
      });
      if (!existing) throw createError('Solicitação não encontrada.', 404);
      res.json({ success: true, data: serializeRequest(existing) });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const parsed = createSchema.parse(req.body);
      const actor = await loadActor(req.user.id);

      let contractName: string | null = null;
      if (parsed.contractId) {
        const contract = await prisma.contract.findUnique({
          where: { id: parsed.contractId },
          select: { id: true, name: true },
        });
        if (!contract) throw createError('Contrato não encontrado.', 404);
        contractName = contract.name;
      }

      const last = await prisma.dpContabilidadeRequest.findFirst({
        orderBy: { displayNumber: 'desc' },
        select: { displayNumber: true },
      });
      const displayNumber = (last?.displayNumber ?? 0) + 1;

      const created = await prisma.dpContabilidadeRequest.create({
        data: {
          displayNumber,
          createdByUserId: actor.id,
          createdByName: actor.name,
          createdByEmail: actor.email,
          sector: actor.sector,
          requestType: parsed.requestType,
          title: parsed.title,
          description: parsed.description,
          contractId: parsed.contractId || null,
          contractName,
          status: 'OPEN',
        },
        include: listInclude,
      });

      res.status(201).json({ success: true, data: serializeRequest(created) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(createError(err.issues[0]?.message || 'Dados inválidos.', 400));
        return;
      }
      next(err);
    }
  }

  async addComment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { body } = commentSchema.parse(req.body);
      const actor = await loadActor(req.user.id);

      const existing = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true },
      });
      if (!existing) throw createError('Solicitação não encontrada.', 404);

      await prisma.dpContabilidadeComment.create({
        data: {
          requestId: existing.id,
          userId: actor.id,
          userName: actor.name,
          body,
        },
      });

      if (existing.status === 'OPEN') {
        await prisma.dpContabilidadeRequest.update({
          where: { id: existing.id },
          data: { status: 'IN_PROGRESS' },
        });
      }

      const updated = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: existing.id },
        include: listInclude,
      });
      res.json({ success: true, data: serializeRequest(updated!) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(createError(err.issues[0]?.message || 'Dados inválidos.', 400));
        return;
      }
      next(err);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { status } = statusSchema.parse(req.body);
      const actor = await loadActor(req.user.id);

      const existing = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw createError('Solicitação não encontrada.', 404);

      if (existing.status === 'CONCLUDED' || existing.status === 'CANCELLED') {
        throw createError('Esta solicitação já está encerrada e permanece no histórico.', 400);
      }

      const data: Prisma.DpContabilidadeRequestUpdateInput = { status };
      if (status === 'CONCLUDED') {
        data.concludedAt = new Date();
        data.concludedByUserId = actor.id;
      }
      if (status === 'CANCELLED') {
        data.cancelledAt = new Date();
        data.cancelledByUserId = actor.id;
      }

      const updated = await prisma.dpContabilidadeRequest.update({
        where: { id: existing.id },
        data,
        include: listInclude,
      });
      res.json({ success: true, data: serializeRequest(updated) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(createError(err.issues[0]?.message || 'Dados inválidos.', 400));
        return;
      }
      next(err);
    }
  }
}
