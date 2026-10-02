import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';

export const EMPREITEIRO_DAILY_APPROVE_MODULE_KEY = pathToModuleKey(
  '/ponto/controle/aprovar-medicoes-empreita'
);

/** Permissão Controle «Aprovar medições de entrega». */
export async function userHasEmpreiteiroDailyApprovePermission(
  userId: string
): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: EMPREITEIRO_DAILY_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}
