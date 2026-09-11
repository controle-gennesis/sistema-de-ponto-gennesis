import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const FUEL_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-combustivel');

export async function userHasFuelApproveControlePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: FUEL_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return !!row;
}

/** Tem a permissão Controle (sem olhar contratos). */
export async function userHasFuelApprovePermission(userId: string): Promise<boolean> {
  return userHasFuelApproveControlePermission(userId);
}

/** null = admin (sem filtro); [] = sem contrato liberado; lista = contratos permitidos. */
export async function getFuelApprovalContractIds(
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (isAdmin) return null;
  const hasPerm = await userHasFuelApproveControlePermission(userId);
  if (!hasPerm) return [];
  const rows = await prisma.userFuelApprovalContract.findMany({
    where: { userId },
    select: { contractId: true },
  });
  return rows.map((r) => r.contractId);
}

/** Pode ver/atuar na fila de aprovação de abastecimento (permissão + contratos liberados). */
export async function userHasAnyFuelApproverAccess(userId: string): Promise<boolean> {
  const hasPerm = await userHasFuelApproveControlePermission(userId);
  if (!hasPerm) return false;
  const ids = await getFuelApprovalContractIds(userId, false);
  return !!ids && ids.length > 0;
}

/**
 * Escopo para listar/decidir solicitações de combustível.
 * Admin: {}; com permissão + contratos: { contractId: { in } }; sem acesso: null.
 */
export async function getManagerFuelApprovalContractScope(
  userId: string,
  isAdmin: boolean,
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  const hasPerm = await userHasFuelApproveControlePermission(userId);
  if (!hasPerm) return null;
  const ids = await getFuelApprovalContractIds(userId, false);
  if (!ids || ids.length === 0) return null;
  return { contractId: { in: ids } };
}

export async function assertManagerCanActOnFuelContract(
  userId: string,
  isAdmin: boolean,
  contractId: string | null,
): Promise<void> {
  if (isAdmin) return;
  if (!contractId) {
    throw createError('Sem permissão para aprovar solicitações de combustível deste contrato', 403);
  }
  const ids = await getFuelApprovalContractIds(userId, false);
  if (ids && ids.includes(contractId)) return;
  throw createError('Sem permissão para aprovar solicitações de combustível deste contrato', 403);
}
