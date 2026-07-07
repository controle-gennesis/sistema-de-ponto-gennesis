import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';

const FLOW_MODULE_KEY = pathToModuleKey('/ponto/flow');

export async function userHasFlowAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: FLOW_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return Boolean(perm);
}
