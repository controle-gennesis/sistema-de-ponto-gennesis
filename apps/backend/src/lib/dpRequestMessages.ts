import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { isAdmTstDpRequestType } from './dpRequestAdmTst';
import { dpRequestGoesToAccounting } from './dpContabilidadeFromInterna';
import { DP_CONTABILIDADE_MODULE_KEY } from './dpContabilidadeAccess';
import { sendPushToUsers } from '../services/PushNotificationService';

/**
 * Conversa entre o Departamento Pessoal, a Administração (ADM/TST) e a Contabilidade sobre uma
 * solicitação. Não muda o status: serve só para tirar dúvidas e combinar o andamento.
 */

const DP_MANAGE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
const ADM_MANAGE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-adm-tst');

const bodySchema = z.object({ body: z.string().trim().min(1, 'Escreva a mensagem.').max(4000) });

type Modules = { admin: boolean; dp: boolean; adm: boolean; contab: boolean };

async function loadModules(userId: string, isAdmin: boolean): Promise<Modules> {
  if (isAdmin) return { admin: true, dp: true, adm: true, contab: true };
  const rows = await prisma.userPermission.findMany({
    where: {
      userId,
      allowed: true,
      action: PERMISSION_ACCESS_ACTION,
      module: { in: [DP_MANAGE_KEY, ADM_MANAGE_KEY, DP_CONTABILIDADE_MODULE_KEY] },
    },
    select: { module: true },
  });
  const has = (k: string) => rows.some((r) => r.module === k);
  return { admin: false, dp: has(DP_MANAGE_KEY), adm: has(ADM_MANAGE_KEY), contab: has(DP_CONTABILIDADE_MODULE_KEY) };
}

/** Quem tem o módulo liberado + administradores. */
async function userIdsWithModule(moduleKey: string): Promise<string[]> {
  const [permitted, admins] = await Promise.all([
    prisma.userPermission.findMany({
      where: { module: moduleKey, allowed: true, action: PERMISSION_ACCESS_ACTION },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: { employee: { position: { equals: 'administrador', mode: 'insensitive' } } },
      select: { id: true },
    }),
  ]);
  return [...new Set([...permitted.map((p) => p.userId), ...admins.map((a) => a.id)])];
}

function isAdmRow(row: { requestType: string }): boolean {
  return isAdmTstDpRequestType(row.requestType as never);
}

function canAccess(mods: Modules, row: Parameters<typeof dpRequestGoesToAccounting>[0]): boolean {
  if (mods.admin) return true;
  if (isAdmRow(row as { requestType: string })) return mods.adm;
  return mods.dp || (mods.contab && dpRequestGoesToAccounting(row));
}

async function loadRowOrThrow(id: string) {
  const row = await prisma.dpRequest.findUnique({ where: { id } });
  if (!row) throw createError('Solicitação não encontrada', 404);
  return row;
}

async function listMessages(requestId: string) {
  const items = await prisma.dpRequestComment.findMany({
    where: { requestId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, userName: true, body: true, createdAt: true },
  });
  return items;
}

async function markRead(requestId: string, userId: string) {
  await prisma.dpRequestCommentRead.upsert({
    where: { requestId_userId: { requestId, userId } },
    create: { requestId, userId, readAt: new Date() },
    update: { readAt: new Date() },
  });
}

export async function getDpRequestMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const row = await loadRowOrThrow(String(req.params.id || '').trim());
    const mods = await loadModules(req.user.id, req.user.isAdmin);
    if (!canAccess(mods, row)) throw createError('Sem permissão para ver as mensagens desta solicitação.', 403);
    const items = await listMessages(row.id);
    await markRead(row.id, req.user.id);
    res.json({ success: true, data: { items } });
  } catch (e) {
    next(e);
  }
}

export async function postDpRequestMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) throw createError(parsed.error.issues[0]?.message || 'Dados inválidos', 400);
    const row = await loadRowOrThrow(String(req.params.id || '').trim());
    const mods = await loadModules(req.user.id, req.user.isAdmin);
    if (!canAccess(mods, row)) throw createError('Sem permissão para enviar mensagens nesta solicitação.', 403);

    const author = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, email: true },
    });
    const authorName = (author?.name || author?.email || 'Usuário').trim();

    await prisma.dpRequestComment.create({
      data: { requestId: row.id, userId: req.user.id, userName: authorName, body: parsed.data.body },
    });
    await markRead(row.id, req.user.id);

    // Avisa o outro lado (sininho pela contagem de não lidas + push no celular).
    void (async () => {
      const groups = isAdmRow(row)
        ? [await userIdsWithModule(ADM_MANAGE_KEY)]
        : [
            await userIdsWithModule(DP_MANAGE_KEY),
            ...(dpRequestGoesToAccounting(row) ? [await userIdsWithModule(DP_CONTABILIDADE_MODULE_KEY)] : []),
          ];
      const recipients = [...new Set(groups.flat())].filter((id) => id !== req.user!.id);
      await sendPushToUsers(recipients, {
        title: `Mensagem na solicitação nº ${row.displayNumber}`,
        body: `${authorName}: ${parsed.data.body.slice(0, 120)}`,
        data: { type: 'dp-request-message', id: row.id },
      });
    })().catch(() => undefined);

    const items = await listMessages(row.id);
    res.json({ success: true, data: { items } });
  } catch (e) {
    next(e);
  }
}

/** Mensagens que o usuário ainda não leu, por solicitação (alimenta o sininho). */
export async function getDpRequestUnreadMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const userId = req.user.id;
    const mods = await loadModules(userId, req.user.isAdmin);
    if (!mods.admin && !mods.dp && !mods.adm && !mods.contab) {
      res.json({ success: true, data: { count: 0, items: [] } });
      return;
    }
    const grouped = await prisma.$queryRaw<Array<{ requestId: string; unread: bigint }>>(Prisma.sql`
      SELECT c."requestId" AS "requestId", COUNT(*) AS unread
      FROM "dp_request_comments" c
      LEFT JOIN "dp_request_comment_reads" r
        ON r."requestId" = c."requestId" AND r."userId" = ${userId}
      WHERE c."userId" <> ${userId}
        AND (r."readAt" IS NULL OR c."createdAt" > r."readAt")
      GROUP BY c."requestId"
    `);
    if (!grouped.length) {
      res.json({ success: true, data: { count: 0, items: [] } });
      return;
    }

    const rows = await prisma.dpRequest.findMany({ where: { id: { in: grouped.map((g) => g.requestId) } } });
    const items = rows
      .filter((r) => canAccess(mods, r))
      .map((r) => {
        const unread = Number(grouped.find((g) => g.requestId === r.id)?.unread ?? 0);
        const area: 'adm' | 'dp' | 'contabilidade' = isAdmRow(r)
          ? 'adm'
          : mods.dp
            ? 'dp'
            : 'contabilidade';
        return { requestId: r.id, displayNumber: r.displayNumber, title: r.title, unread, area };
      })
      .sort((a, b) => b.displayNumber - a.displayNumber);
    res.json({
      success: true,
      data: { count: items.reduce((s, i) => s + i.unread, 0), items },
    });
  } catch (e) {
    next(e);
  }
}
