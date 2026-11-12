import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { isAdmTstDpRequestType } from './dpRequestAdmTst';
import { dpRequestGoesToAccounting } from './dpContabilidadeFromInterna';
import { isAccountingDirectRequestType } from './dpRequestDetails';
import { DP_CONTABILIDADE_MODULE_KEY } from './dpContabilidadeAccess';
import { sendPushToUsers } from '../services/PushNotificationService';
import { savePersistentUpload, deletePersistentUpload } from './persistentUpload';
import { fixMulterOriginalName } from './fixUploadFileName';

/**
 * Conversa entre o Departamento Pessoal, a Administração (ADM/TST) e a Contabilidade sobre uma
 * solicitação. Não muda o status: serve só para tirar dúvidas e combinar o andamento.
 */

const DP_MANAGE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
const ADM_MANAGE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-adm-tst');
/** Tela Solicitações à Contabilidade (onde o DP acompanha o que enviou). */
const ACCOUNTING_PAGE_KEY = pathToModuleKey('/ponto/solicitacoes-contabilidade');

const bodySchema = z.object({ body: z.string().trim().min(1, 'Escreva a mensagem.').max(4000) });

type Modules = { admin: boolean; dp: boolean; adm: boolean; contab: boolean; acctPage: boolean };

async function loadModules(userId: string, isAdmin: boolean): Promise<Modules> {
  if (isAdmin) return { admin: true, dp: true, adm: true, contab: true, acctPage: true };
  const rows = await prisma.userPermission.findMany({
    where: {
      userId,
      allowed: true,
      action: PERMISSION_ACCESS_ACTION,
      module: { in: [DP_MANAGE_KEY, ADM_MANAGE_KEY, DP_CONTABILIDADE_MODULE_KEY, ACCOUNTING_PAGE_KEY] },
    },
    select: { module: true },
  });
  const has = (k: string) => rows.some((r) => r.module === k);
  return {
    admin: false,
    dp: has(DP_MANAGE_KEY),
    adm: has(ADM_MANAGE_KEY),
    contab: has(DP_CONTABILIDADE_MODULE_KEY),
    acctPage: has(ACCOUNTING_PAGE_KEY),
  };
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

/** Vai à Contabilidade (interna finalizada) ou é um pedido criado direto para ela. */
function involvesAccounting(row: Parameters<typeof dpRequestGoesToAccounting>[0]): boolean {
  return dpRequestGoesToAccounting(row) || isAccountingDirectRequestType((row as { requestType: string }).requestType);
}

function canAccess(mods: Modules, row: Parameters<typeof dpRequestGoesToAccounting>[0]): boolean {
  if (mods.admin) return true;
  if (isAdmRow(row as { requestType: string })) return mods.adm;
  return mods.dp || ((mods.contab || mods.acctPage) && involvesAccounting(row));
}

/** Avisa as outras pessoas da conversa (push no celular; o sininho usa a contagem de não lidas). */
function notifyParticipants(
  row: Parameters<typeof dpRequestGoesToAccounting>[0] & { displayNumber: number },
  authorId: string,
  title: string,
  bodyText: string
) {
  void (async () => {
    const groups = isAdmRow(row)
      ? [await userIdsWithModule(ADM_MANAGE_KEY)]
      : [
          await userIdsWithModule(DP_MANAGE_KEY),
          ...(involvesAccounting(row)
            ? [await userIdsWithModule(DP_CONTABILIDADE_MODULE_KEY), await userIdsWithModule(ACCOUNTING_PAGE_KEY)]
            : []),
        ];
    const recipients = [...new Set(groups.flat())].filter((id) => id !== authorId);
    await sendPushToUsers(recipients, { title, body: bodyText, data: { type: 'dp-request-message', id: (row as { id: string }).id } });
  })().catch(() => undefined);
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

    notifyParticipants(row, req.user.id, `Mensagem na solicitação nº ${row.displayNumber}`, `${authorName}: ${parsed.data.body.slice(0, 120)}`);

    const items = await listMessages(row.id);
    res.json({ success: true, data: { items } });
  } catch (e) {
    next(e);
  }
}

/** Mensagens que o usuário ainda não leu, por solicitação (alimenta o sininho). */
/** Mensagem automática + push para o DP quando a Contabilidade conclui (sem digitar no chat). */
export async function announceAccountingDone(dpRequestId: string, actorUserId: string, authorName: string) {
  const row = await prisma.dpRequest.findUnique({ where: { id: dpRequestId } });
  if (!row) return;
  await prisma.dpRequestComment.create({
    data: {
      requestId: row.id,
      userId: actorUserId,
      userName: authorName,
      body: 'Contabilidade concluiu o atendimento. O DP pode encerrar a solicitação.',
    },
  });
  await markRead(row.id, actorUserId);
  notifyParticipants(
    row,
    actorUserId,
    `Contabilidade concluiu - solicitação nº ${row.displayNumber}`,
    `${authorName} concluiu o atendimento. O DP pode encerrar.`
  );
}

/** A Contabilidade cancelou o pedido: mensagem automática com o motivo + aviso para o DP. */
export async function announceAccountingCancelled(
  dpRequestId: string,
  actorUserId: string,
  authorName: string,
  reason?: string | null
) {
  const row = await prisma.dpRequest.findUnique({ where: { id: dpRequestId } });
  if (!row) return;
  const motivo = (reason ?? '').trim();
  await prisma.dpRequestComment.create({
    data: {
      requestId: row.id,
      userId: actorUserId,
      userName: authorName,
      body: motivo ? `Contabilidade cancelou o pedido. Motivo: ${motivo}` : 'Contabilidade cancelou o pedido.',
    },
  });
  await markRead(row.id, actorUserId);
  notifyParticipants(
    row,
    actorUserId,
    `Pedido cancelado - solicitação nº ${row.displayNumber}`,
    `${authorName} cancelou o pedido${motivo ? `: ${motivo.slice(0, 120)}` : '.'}`
  );
}

export async function getDpRequestUnreadMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const userId = req.user.id;
    const mods = await loadModules(userId, req.user.isAdmin);
    if (!mods.admin && !mods.dp && !mods.adm && !mods.contab && !mods.acctPage) {
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
        const accounting = !isAdmRow(r) && involvesAccounting(r);
        // Onde abrir: pedidos da Contabilidade vão para a tela de quem acompanha (DP) ou de quem atende.
        const area: 'adm' | 'dp' | 'contabilidade' | 'acct' = isAdmRow(r)
          ? 'adm'
          : accounting && mods.acctPage
            ? 'acct'
            : accounting && mods.contab
              ? 'contabilidade'
              : mods.dp
                ? 'dp'
                : 'contabilidade';
        return { requestId: r.id, displayNumber: r.displayNumber, title: r.title, unread, area, accounting };
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

// ───────── Documentos anexados ─────────

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx'];

function isAllowedFile(name: string, mime: string): boolean {
  const n = name.toLowerCase();
  const m = mime.toLowerCase();
  if (ALLOWED_EXT.some((e) => n.endsWith(e))) return true;
  return m.includes('pdf') || m.startsWith('image/') || m.includes('msword') || m.includes('officedocument');
}

function serializeAttachment(a: {
  id: string;
  uploadedByUserId: string;
  uploadedByName: string;
  fileName: string;
  mimeType: string;
  url: string;
  createdAt: Date;
}) {
  return {
    id: a.id,
    uploadedByUserId: a.uploadedByUserId,
    uploadedByName: a.uploadedByName,
    fileName: a.fileName,
    mimeType: a.mimeType,
    url: a.url,
    createdAt: a.createdAt,
  };
}

async function listAttachments(requestId: string) {
  const rows = await prisma.dpRequestAttachment.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } });
  return rows.map(serializeAttachment);
}

export async function getDpRequestAttachments(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const row = await loadRowOrThrow(String(req.params.id || '').trim());
    const mods = await loadModules(req.user.id, req.user.isAdmin);
    if (!canAccess(mods, row)) throw createError('Sem permissão para ver os documentos desta solicitação.', 403);
    res.json({ success: true, data: { items: await listAttachments(row.id) } });
  } catch (e) {
    next(e);
  }
}

export async function postDpRequestAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const file = (req as AuthRequest & { file?: { buffer: Buffer; originalname: string; mimetype: string } }).file;
    if (!file?.buffer) throw createError('Selecione um arquivo', 400);
    const row = await loadRowOrThrow(String(req.params.id || '').trim());
    const mods = await loadModules(req.user.id, req.user.isAdmin);
    if (!canAccess(mods, row)) throw createError('Sem permissão para anexar documentos nesta solicitação.', 403);
    const originalName = fixMulterOriginalName(file.originalname) || 'documento';
    if (!isAllowedFile(originalName, file.mimetype || '')) {
      throw createError('Envie PDF, imagem, Word ou Excel.', 400);
    }
    const author = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, email: true } });
    const authorName = (author?.name || author?.email || 'Usuário').trim();

    const saved = await savePersistentUpload({
      folder: 'dp-request-files',
      buffer: file.buffer,
      originalName,
      mimeType: file.mimetype || 'application/octet-stream',
      includeSafeOriginalName: true,
    });
    await prisma.$transaction([
      prisma.dpRequestAttachment.create({
        data: {
          requestId: row.id,
          uploadedByUserId: req.user.id,
          uploadedByName: authorName,
          fileName: originalName,
          mimeType: file.mimetype || 'application/octet-stream',
          url: saved.url,
          key: saved.key,
        },
      }),
      // Entra também no histórico de mensagens (fica visível e conta como mensagem nova para o outro lado).
      prisma.dpRequestComment.create({
        data: { requestId: row.id, userId: req.user.id, userName: authorName, body: `Anexou o documento: ${originalName}` },
      }),
    ]);
    await markRead(row.id, req.user.id);
    notifyParticipants(
      row,
      req.user.id,
      `Documento na solicitação nº ${row.displayNumber}`,
      `${authorName} anexou: ${originalName}`.slice(0, 140)
    );
    res.json({ success: true, data: { items: await listAttachments(row.id) } });
  } catch (e) {
    next(e);
  }
}

export async function deleteDpRequestAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const row = await loadRowOrThrow(String(req.params.id || '').trim());
    const mods = await loadModules(req.user.id, req.user.isAdmin);
    if (!canAccess(mods, row)) throw createError('Sem permissão.', 403);
    const att = await prisma.dpRequestAttachment.findFirst({
      where: { id: String(req.params.attachmentId || '').trim(), requestId: row.id },
    });
    if (!att) throw createError('Documento não encontrado', 404);
    if (att.uploadedByUserId !== req.user.id && !mods.admin) {
      throw createError('Só quem anexou o documento (ou um administrador) pode removê-lo.', 403);
    }
    await prisma.dpRequestAttachment.delete({ where: { id: att.id } });
    await deletePersistentUpload(att.key).catch(() => undefined);
    res.json({ success: true, data: { items: await listAttachments(row.id) } });
  } catch (e) {
    next(e);
  }
}
