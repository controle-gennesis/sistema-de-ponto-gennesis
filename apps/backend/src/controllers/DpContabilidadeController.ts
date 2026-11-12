import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { isAccountingDirectRequestType } from '../lib/dpRequestDetails';
import { sendPushToUsers } from '../services/PushNotificationService';
import { announceAccountingDone } from '../lib/dpRequestMessages';

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

const commentSchema = z.object({
  body: z.string().trim().min(1, 'Informe o comentário.').max(4000),
});

const statusSchema = z
  .object({
    status: z.enum(['IN_PROGRESS', 'CONCLUDED', 'CANCELLED']),
    comment: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.status !== 'CANCELLED' || (v.comment?.length ?? 0) >= 3, {
    message: 'Informe o motivo do cancelamento.',
    path: ['comment'],
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

/** Registra no histórico da solicitação interna de origem o que a Contabilidade fez (sem mudar a etapa dela). */
async function appendSourceHistoryNote(
  tx: Prisma.TransactionClient,
  sourceId: string,
  actor: { id: string; name: string },
  note: string
) {
  const source = await tx.dpRequest.findUnique({
    where: { id: sourceId },
    select: { id: true, status: true, statusHistory: true },
  });
  if (!source) return;
  const history = Array.isArray(source.statusHistory) ? source.statusHistory : [];
  await tx.dpRequest.update({
    where: { id: source.id },
    data: {
      statusHistory: [
        ...history,
        {
          at: new Date().toISOString(),
          status: source.status,
          actorUserId: actor.id,
          actorName: actor.name,
          note,
        },
      ] as Prisma.InputJsonValue,
    },
  });
}

type RequestRow = Prisma.DpContabilidadeRequestGetPayload<{ include: { comments: true } }>;

/** Dados estruturados da solicitação interna de origem (só os tipos criados direto para a Contabilidade). */
type SourceInfo = {
  displayNumber: number;
  requestType: string;
  details: unknown;
  company: string | null;
  polo: string | null;
  prazoInicio: string;
  prazoFim: string;
  costCenterName: string | null;
  /** Nomes dos colaboradores citados em `details` (employeeId / colaboradorEmployeeId). */
  employeeNames: Record<string, string>;
};

async function loadSources(rows: RequestRow[]): Promise<Map<string, SourceInfo>> {
  // Todo pedido com origem traz a unidade (centro de custo); os detalhes completos só vêm nos tipos diretos.
  const ids = rows
    .map((r) => (r as { sourceDpRequestId?: string | null }).sourceDpRequestId)
    .filter((id): id is string => !!id);
  const map = new Map<string, SourceInfo>();
  if (ids.length === 0) return map;
  const sources = await prisma.dpRequest.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      displayNumber: true,
      requestType: true,
      details: true,
      company: true,
      polo: true,
      prazoInicio: true,
      prazoFim: true,
      costCenter: { select: { name: true } },
    },
  });
  const employeeIds = new Set<string>();
  for (const src of sources) {
    if (!isAccountingDirectRequestType(src.requestType)) continue;
    const det = (src.details ?? {}) as Record<string, unknown>;
    for (const key of ['employeeId', 'colaboradorEmployeeId']) {
      const v = det[key];
      if (typeof v === 'string' && v.trim()) employeeIds.add(v.trim());
    }
  }
  const employees = employeeIds.size
    ? await prisma.employee.findMany({
        where: { id: { in: [...employeeIds] } },
        select: { id: true, user: { select: { name: true } } },
      })
    : [];
  const employeeNames: Record<string, string> = {};
  for (const e of employees) {
    if (e.user?.name) employeeNames[e.id] = e.user.name;
  }

  for (const s of sources) {
    map.set(s.id, {
      displayNumber: s.displayNumber,
      requestType: s.requestType,
      details: isAccountingDirectRequestType(s.requestType) ? s.details : null,
      company: s.company,
      polo: s.polo,
      prazoInicio: s.prazoInicio.toISOString(),
      prazoFim: s.prazoFim.toISOString(),
      costCenterName: s.costCenter?.name ?? null,
      employeeNames,
    });
  }
  return map;
}

async function serializeWithSources(rows: RequestRow[]) {
  const sources = await loadSources(rows);
  return rows.map((row) => {
    const sourceId = (row as { sourceDpRequestId?: string | null }).sourceDpRequestId ?? null;
    return serializeRequest(row, sourceId ? (sources.get(sourceId) ?? null) : null);
  });
}

function serializeRequest(row: RequestRow, source: SourceInfo | null = null) {
  return {
    source,
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
    sourceDpRequestId: (row as { sourceDpRequestId?: string | null }).sourceDpRequestId ?? null,
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
        where.status = status === 'OPEN' ? { in: ['OPEN', 'IN_PROGRESS'] } : (status as (typeof STATUSES)[number]);
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
      // "Em andamento" deixou de existir para o usuário: conta como Pendente.
      stats.OPEN += stats.IN_PROGRESS;
      stats.IN_PROGRESS = 0;

      res.json({
        success: true,
        data: await serializeWithSources(rows),
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
      res.json({ success: true, data: (await serializeWithSources([existing]))[0] });
    } catch (err) {
      next(err);
    }
  }

  /** Pedidos ainda não atendidos (Abertas): alimenta o selo do menu e do sino. */
  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const count = await prisma.dpContabilidadeRequest.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } });
      res.json({ success: true, data: { count } });
    } catch (err) {
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

      const full = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: existing.id },
        select: { createdByUserId: true, title: true },
      });
      const sourceId =
        (
          await prisma.$queryRaw<Array<{ sourceDpRequestId: string | null }>>`
            SELECT "sourceDpRequestId" FROM "dp_contabilidade_requests" WHERE id = ${existing.id}
          `
        )[0]?.sourceDpRequestId ?? null;
      // Quem pediu também pode comentar; só a resposta de outra pessoa (Contabilidade) tira o pedido de "Aberta".
      const respondidoPorOutro = full?.createdByUserId !== actor.id;

      await prisma.$transaction(async (tx) => {
        await tx.dpContabilidadeComment.create({
          data: {
            requestId: existing.id,
            userId: actor.id,
            userName: actor.name,
            body,
          },
        });
        if (sourceId && respondidoPorOutro) {
          await appendSourceHistoryNote(tx, sourceId, actor, `Contabilidade: ${body}`);
        }
      });
      if (respondidoPorOutro && full?.createdByUserId) {
        void sendPushToUsers([full.createdByUserId], {
          title: 'Resposta da Contabilidade',
          body: `${full.title}: ${body.slice(0, 120)}`,
          data: { type: 'dp-contabilidade', id: existing.id },
        });
      }

      const updated = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: existing.id },
        include: listInclude,
      });
      res.json({ success: true, data: (await serializeWithSources([updated!]))[0] });
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(createError(err.issues[0]?.message || 'Dados inválidos.', 400));
        return;
      }
      next(err);
    }
  }

  /** Aplica a mudança de status (concluir/cancelar/em andamento) e propaga para a solicitação de origem. */
  private async applyStatus(
    existing: Prisma.DpContabilidadeRequestGetPayload<Record<string, never>>,
    actor: Awaited<ReturnType<typeof loadActor>>,
    status: z.infer<typeof statusSchema>['status'],
    comment: string | undefined,
    byLabel: 'Contabilidade' | 'DP'
  ) {
    const data: Prisma.DpContabilidadeRequestUpdateInput = { status };
    if (status === 'CONCLUDED') {
      data.concludedAt = new Date();
      data.concludedByUserId = actor.id;
    }
    if (status === 'CANCELLED') {
      data.cancelledAt = new Date();
      data.cancelledByUserId = actor.id;
    }

    const commentBody = comment
      ? status === 'CANCELLED'
        ? `Motivo do cancelamento: ${comment}`
        : comment
      : '';

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.dpContabilidadeRequest.update({
        where: { id: existing.id, status: existing.status },
        data,
      });
      if (commentBody) {
        await tx.dpContabilidadeComment.create({
          data: {
            requestId: row.id,
            userId: actor.id,
            userName: actor.name,
            body: commentBody,
          },
        });
      }
      // Pedido nascido de uma solicitação interna direta: o status volta para quem pediu.
      const sourceId = (existing as { sourceDpRequestId?: string | null }).sourceDpRequestId;
      const resumo =
        status === 'CONCLUDED'
          ? `${byLabel} concluiu o atendimento${comment ? `: ${comment}` : '.'}`
          : status === 'CANCELLED'
            ? `${byLabel} cancelou o atendimento: ${comment}`
            : '';
      if (sourceId && resumo) {
        const origem = await tx.dpRequest.findUnique({
          where: { id: sourceId },
          select: { requestType: true },
        });
        // Tipos antigos (concluídos pelo DP e encaminhados): a etapa não muda, só o histórico ganha o retorno.
        if (origem && !isAccountingDirectRequestType(origem.requestType)) {
          await appendSourceHistoryNote(tx, sourceId, actor, resumo);
        }
      }
      if (sourceId && (status === 'CONCLUDED' || status === 'CANCELLED')) {
        const source = await tx.dpRequest.findUnique({
          where: { id: sourceId },
          select: { id: true, requestType: true, status: true, statusHistory: true },
        });
        if (
          source &&
          isAccountingDirectRequestType(source.requestType) &&
          source.status === 'IN_ACCOUNTING'
        ) {
          const history = Array.isArray(source.statusHistory) ? source.statusHistory : [];
          await tx.dpRequest.update({
            where: { id: source.id },
            data: {
              status,
              statusHistory: [
                ...history,
                {
                  at: new Date().toISOString(),
                  status,
                  actorUserId: actor.id,
                  actorName: actor.name,
                  ...(comment ? { note: comment } : {}),
                },
              ] as Prisma.InputJsonValue,
              dpHandledBy: actor.id,
              ...(status === 'CONCLUDED'
                ? { dpConcludedAt: new Date(), dpConclusionComment: comment || null }
                : { dpCancellationReason: comment || null }),
            },
          });
        }
      }
      return tx.dpContabilidadeRequest.findUniqueOrThrow({
        where: { id: row.id },
        include: listInclude,
      });
    });
    if (status === 'CONCLUDED' || status === 'CANCELLED') {
      void sendPushToUsers([existing.createdByUserId], {
        title: status === 'CONCLUDED' ? `${byLabel} concluiu seu pedido` : `${byLabel} cancelou seu pedido`,
        body: existing.title + (comment ? `: ${comment.slice(0, 120)}` : ''),
        data: { type: 'dp-contabilidade', id: existing.id },
      });
    }
    return updated;
  }

  /** A Contabilidade conclui o atendimento (status Concluída) e o DP é avisado sem precisar de mensagem digitada. */
  async concludeFromAccounting(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const actor = await loadActor(req.user.id);
      const existing = await prisma.dpContabilidadeRequest.findUnique({
        where: { sourceDpRequestId: req.params.id },
      });
      if (!existing) throw createError('Esta solicitação não tem pedido na Contabilidade.', 404);
      if (existing.status === 'CONCLUDED' || existing.status === 'CANCELLED') {
        throw createError('Este pedido já está encerrado.', 400);
      }
      await this.applyStatus(existing, actor, 'CONCLUDED', undefined, 'Contabilidade');
      await prisma.dpContabilidadeRequest.update({
        where: { id: existing.id },
        data: { accountingDoneAt: new Date() },
      });
      await announceAccountingDone(req.params.id, actor.id, actor.name);
      res.json({ success: true, data: { id: existing.id, status: 'CONCLUDED' } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        next(createError('Este pedido foi atualizado por outra pessoa. Atualize a lista e tente novamente.', 409));
        return;
      }
      next(err);
    }
  }

  /** O DP encerra o acompanhamento do pedido que estava com a Contabilidade (depois da conversa entre os dois). */
  async concludeFromDp(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { comment } = z.object({ comment: z.string().trim().max(4000).optional() }).parse(req.body ?? {});
      const actor = await loadActor(req.user.id);
      const existing = await prisma.dpContabilidadeRequest.findUnique({
        where: { sourceDpRequestId: req.params.id },
      });
      if (!existing) throw createError('Esta solicitação não tem pedido na Contabilidade.', 404);
      if (existing.status === 'CANCELLED') throw createError('O pedido da Contabilidade foi cancelado.', 400);
      if (existing.dpClosedAt) throw createError('O atendimento já foi encerrado pelo DP.', 400);
      // Se a Contabilidade ainda não concluiu, o DP conclui por ela; se já concluiu, só encerra o acompanhamento.
      if (existing.status !== 'CONCLUDED') {
        await this.applyStatus(existing, actor, 'CONCLUDED', comment || undefined, 'DP');
      }
      const updated = await prisma.dpContabilidadeRequest.update({
        where: { id: existing.id },
        data: { dpClosedAt: new Date() },
      });
      res.json({ success: true, data: { id: updated.id, status: updated.status } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(createError(err.issues[0]?.message || 'Dados inválidos.', 400));
        return;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        next(createError('O pedido foi atualizado por outra pessoa. Atualize a lista e tente novamente.', 409));
        return;
      }
      next(err);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { status, comment } = statusSchema.parse(req.body);
      const actor = await loadActor(req.user.id);

      const existing = await prisma.dpContabilidadeRequest.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) throw createError('Solicitação não encontrada.', 404);

      if (existing.status === 'CONCLUDED' || existing.status === 'CANCELLED') {
        throw createError('Esta solicitação já está encerrada e permanece no histórico.', 400);
      }

      const updated = await this.applyStatus(existing, actor, status, comment, 'Contabilidade');
      res.json({ success: true, data: (await serializeWithSources([updated]))[0] });
    } catch (err) {
      if (err instanceof z.ZodError) {
        next(createError(err.issues[0]?.message || 'Dados inválidos.', 400));
        return;
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        next(createError('Esta solicitação foi atualizada por outra pessoa. Atualize a lista e tente novamente.', 409));
        return;
      }
      next(err);
    }
  }
}
