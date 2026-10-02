import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
  PERMISSION_MODULE_CRUD_ACTIONS,
} from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { userHasFuelSuppliesAccess } from './fuelSuppliesAccess';

/** Cadastro «Postos de Combustível». */
export const FUEL_GAS_STATIONS_MODULE_KEY = pathToModuleKey('/ponto/regioes-postos-combustivel');

async function userHasFuelGasStationsModuleAccess(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: FUEL_GAS_STATIONS_MODULE_KEY,
      allowed: true,
      action: {
        in: [PERMISSION_ACCESS_ACTION, ...PERMISSION_MODULE_CRUD_ACTIONS],
      },
    },
    select: { id: true },
  });
  return !!row;
}

/**
 * Quem acessa a página de Postos (ou a fila de Abastecimento) pode gerenciar
 * todos os postos, inclusive vincular contratos.
 */
export async function userHasFuelGasStationsAccess(
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasFuelGasStationsModuleAccess(userId)) return true;
  return userHasFuelSuppliesAccess(userId, false);
}

export async function assertUserHasFuelGasStationsAccess(
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  const ok = await userHasFuelGasStationsAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Sem permissão para gerenciar postos de combustível', 403);
  }
}
