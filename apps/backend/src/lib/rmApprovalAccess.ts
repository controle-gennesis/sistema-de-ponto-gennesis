import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const RM_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais');

export async function userHasRmApprovePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: RM_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

export async function assertUserCanApproveMaterialRequests(
  userId: string,
  isAdmin?: boolean,
): Promise<void> {
  if (isAdmin) return;
  if (await userHasRmApprovePermission(userId)) return;
  throw createError('Sem permissão para aprovar requisições de materiais', 403);
}

/** Decisões do aprovador (não do solicitante). */
export function isRmApproverStatusChange(
  nextStatus: string,
  requestedBy: string,
  actorUserId: string,
): boolean {
  if (nextStatus === 'APPROVED' || nextStatus === 'IN_REVIEW') return true;
  if (nextStatus === 'CANCELLED' && requestedBy !== actorUserId) return true;
  return false;
}
