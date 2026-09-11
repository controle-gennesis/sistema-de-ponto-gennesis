import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

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

/** Pode ver/atuar na fila de aprovação de FD (permissão Controle + contratos liberados). */
export async function userHasAnyFdApproverAccess(userId: string): Promise<boolean> {
  const hasPerm = await userHasFdApprovePermission(userId);
  if (!hasPerm) return false;
  const ids = await getFdApprovalContractIds(userId, false);
  return !!ids && ids.length > 0;
}

/**
 * Escopo de listagem na aba Aprovações > Fichas de Demanda.
 * Admin: sem filtro. Demais: só contratos marcados em Controle → Aprovar Fichas de Demanda.
 * Não herda a coluna Gestor do contrato.
 */
export async function getFdManagerApprovalVisibilityWhere(
  userId: string,
  isAdmin: boolean,
): Promise<Prisma.DemandSheetApprovalWhereInput> {
  if (isAdmin) return {};

  const contractIds = await getFdApprovalContractIds(userId, false);
  if (contractIds && contractIds.length > 0) {
    return fdApprovalVisibilityWhere(contractIds);
  }
  return { id: { in: [] } };
}

/** Valida se o usuário pode aprovar/reprovar a FD (pelo contrato/CC liberado). */
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

  throw createError('Sem permissão para aprovar fichas de demanda deste contrato', 403);
}

export function assertFdApproverOrThrow(ok: boolean): void {
  if (!ok) throw createError('Você não tem permissão para aprovar fichas de demanda', 403);
}
