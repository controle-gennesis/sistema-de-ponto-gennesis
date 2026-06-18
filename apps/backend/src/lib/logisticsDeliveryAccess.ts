import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { userIsDepartmentCompras } from './fuelSuppliesAccess';

export const LOGISTICS_DELIVERY_MODULE_KEY = pathToModuleKey('/ponto/entregas-logistica');

export async function userHasLogisticsDeliveryModuleAccess(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: LOGISTICS_DELIVERY_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

export async function userHasLogisticsDeliveryAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasLogisticsDeliveryModuleAccess(userId)) return true;
  return userIsDepartmentCompras(userId);
}

export async function assertUserHasLogisticsDeliveryAccess(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const ok = await userHasLogisticsDeliveryAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Sem permissão para gerenciar entregas logísticas', 403);
  }
}
