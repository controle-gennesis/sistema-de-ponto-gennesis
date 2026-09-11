import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
} from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Response, NextFunction } from 'express';

export const DP_CONTABILIDADE_MODULE_KEY = pathToModuleKey('/ponto/dp-contabilidade');

export function departmentCanAccessDpContabilidade(department: string | null | undefined): boolean {
  const dept = (department || '').toLowerCase();
  if (!dept) return false;
  if (dept.includes('departamento pessoal') || dept.includes('pessoal')) return true;
  if (dept.includes('contabil')) return true;
  if (dept.includes('financeiro')) return true;
  return false;
}

export async function userHasDpContabilidadeAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { department: true } } },
  });
  if (departmentCanAccessDpContabilidade(user?.employee?.department)) return true;

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

export async function assertDpContabilidadeAccess(userId: string, isAdmin: boolean): Promise<void> {
  const ok = await userHasDpContabilidadeAccess(userId, isAdmin);
  if (!ok) throw createError('Sem permissão para o módulo Comunicação Contábil.', 403);
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
