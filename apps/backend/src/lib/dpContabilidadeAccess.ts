import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
} from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Response, NextFunction } from 'express';

export const DP_CONTABILIDADE_MODULE_KEY = pathToModuleKey('/ponto/dp-contabilidade');

export async function userHasDpContabilidadeAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;

  const permission = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: DP_CONTABILIDADE_MODULE_KEY,
      allowed: true,
      action: PERMISSION_ACCESS_ACTION,
    },
    select: { id: true },
  });
  return Boolean(permission);
}

/** Quem atende a Contabilidade: administradores e quem tem a permissão do módulo (acesso só por permissão). */
export async function listDpContabilidadeUserIds(): Promise<string[]> {
  const [permitted, admins] = await Promise.all([
    prisma.userPermission.findMany({
      where: { module: DP_CONTABILIDADE_MODULE_KEY, allowed: true, action: PERMISSION_ACCESS_ACTION },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: { employee: { position: { equals: 'administrador', mode: 'insensitive' } } },
      select: { id: true },
    }),
  ]);
  return [...new Set([...permitted.map((p) => p.userId), ...admins.map((a) => a.id)])];
}

export async function assertDpContabilidadeAccess(userId: string, isAdmin: boolean): Promise<void> {
  const ok = await userHasDpContabilidadeAccess(userId, isAdmin);
  if (!ok) throw createError('Sem permissão para o módulo Atendimento Contábil.', 403);
}

export const requireDpContabilidadeAccess = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    await assertDpContabilidadeAccess(req.user.id, req.user.isAdmin);
    next();
  } catch (err) {
    next(err);
  }
};
