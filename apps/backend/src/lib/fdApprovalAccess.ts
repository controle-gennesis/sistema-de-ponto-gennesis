import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertManagerCanActOnDpContract,
  getManagerDpApprovalContractScope,
  userHasDpApprovePermission,
} from './dpApprovalAccess';

export const FD_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-fichas-demanda');

export async function userHasFdApprovePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: FD_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

/** null = admin (sem filtro); [] = sem contrato liberado; lista = contratos permitidos. */
export async function getFdApprovalContractIds(
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (isAdmin) return null;
  const hasPerm = await userHasFdApprovePermission(userId);
  if (!hasPerm) return [];
  const rows = await prisma.userFdApprovalContract.findMany({
    where: { userId },
    select: { contractId: true },
  });
  return rows.map((r) => r.contractId);
}

export function fdApprovalVisibilityWhere(
  contractIds: string[],
): Prisma.DemandSheetApprovalWhereInput {
  if (!contractIds.length) return { id: { in: [] } };
  return { contratoId: { in: contractIds } };
}

/** Pode ver/atuar na fila de aprovação de FD (contratos FD, gestor legado ou admin). */
export async function userHasAnyFdApproverAccess(userId: string): Promise<boolean> {
  if (await userHasFdApprovePermission(userId)) return true;
  return userHasDpApprovePermission(userId);
}

/**
 * Escopo de listagem na aba Aprovações > Fichas de Demanda.
 * Admin: sem filtro. Caso contrário: contratos FD e/ou contratos de gestor DP.
 */
export async function getFdManagerApprovalVisibilityWhere(
  userId: string,
  isAdmin: boolean,
): Promise<Prisma.DemandSheetApprovalWhereInput> {
  if (isAdmin) return {};

  const or: Prisma.DemandSheetApprovalWhereInput[] = [];

  const contractIds = await getFdApprovalContractIds(userId, false);
  if (contractIds && contractIds.length > 0) {
    or.push(fdApprovalVisibilityWhere(contractIds));
  }

  const contractScope = await getManagerDpApprovalContractScope(userId, false);
  const contractFilter = contractScope?.contractId as { in?: string[] } | undefined;
  if (contractFilter?.in?.length) {
    or.push({ contratoId: { in: contractFilter.in } });
  }

  if (!or.length) return { id: { in: [] } };
  return { OR: or };
}

/** Valida se o usuário pode aprovar/reprovar a FD (pelo contrato liberado ou gestor legado). */
export async function assertUserCanApproveFd(
  userId: string,
  isAdmin: boolean,
  contratoId: string,
): Promise<void> {
  if (isAdmin) return;

  const contractIds = await getFdApprovalContractIds(userId, false);
  if (contractIds && contractIds.includes(contratoId)) {
    return;
  }

  // Fallback: mesmo vínculo de gestor de contrato das solicitações DP / OC.
  await assertManagerCanActOnDpContract(userId, false, contratoId);
}

export function assertFdApproverOrThrow(ok: boolean): void {
  if (!ok) throw createError('Você não tem permissão para aprovar fichas de demanda', 403);
}
