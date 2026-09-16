import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { isUnbRelatedLabel } from './unbBranding';
import {
  employeeRecordIsUnb,
  getUnbCostCenterIds,
  isUnbCostCenterRecord,
} from './unbCostCenterScope';

async function userHasLegacyModule(userId: string, moduleKey: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: moduleKey, action: PERMISSION_ACCESS_ACTION, allowed: true },
    select: { id: true },
  });
  return !!row;
}

/** Contratos em que o usuário é gestor (coluna «Gestor» na aba Contratos). */
export async function userHasContractGestorAssignment(userId: string): Promise<boolean> {
  const row = await prisma.userDpApprovalContract.findFirst({
    where: { userId },
    select: { id: true },
  });
  return !!row;
}

export async function getContractGestorCostCenterIds(userId: string): Promise<string[]> {
  const contractIds = (
    await prisma.userDpApprovalContract.findMany({
      where: { userId },
      select: { contractId: true },
    })
  ).map((row) => row.contractId);

  if (contractIds.length === 0) return [];

  const rows = await prisma.contract.findMany({
    where: { id: { in: contractIds } },
    select: {
      costCenterId: true,
      name: true,
      number: true,
      costCenter: { select: { name: true, code: true, company: true, polo: true } },
    },
  });

  const ids = new Set(rows.map((row) => row.costCenterId).filter(Boolean));

  if (await userShouldExpandUnbGestorCatalog(userId, rows)) {
    for (const id of await getUnbCostCenterIds()) ids.add(id);
  }

  return Array.from(ids);
}

async function userShouldExpandUnbGestorCatalog(
  userId: string,
  contractRows?: Array<{
    name: string | null;
    number: string | null;
    costCenter: { name?: string | null; code?: string | null; company?: string | null; polo?: string | null } | null;
  }>,
): Promise<boolean> {
  const assignedIds = (
    await prisma.userDpApprovalContract.findMany({
      where: { userId },
      select: { contractId: true },
    })
  ).map((row) => row.contractId);

  const rows =
    contractRows ??
    (assignedIds.length === 0
      ? []
      : await prisma.contract.findMany({
          where: { id: { in: assignedIds } },
          select: {
            name: true,
            number: true,
            costCenter: { select: { name: true, code: true, company: true, polo: true } },
          },
        }));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { costCenter: true } } },
  });

  const gestorHasUnbContract = rows.some(
    (row) =>
      isUnbRelatedLabel(row.name) ||
      isUnbRelatedLabel(row.number) ||
      isUnbCostCenterRecord(row.costCenter),
  );

  return (await employeeRecordIsUnb(user?.employee?.costCenter)) || gestorHasUnbContract;
}

/** Gestor UNB pode agir em qualquer CC do catálogo UNB, mesmo com id diferente do contrato. */
export async function isCostCenterAllowedForContractGestor(
  userId: string,
  costCenterId: string | null | undefined,
): Promise<boolean> {
  if (!costCenterId) return false;
  const scopeIds = await getContractGestorCostCenterIds(userId);
  if (scopeIds.includes(costCenterId)) return true;
  if (scopeIds.length === 0) return false;
  if (!(await userShouldExpandUnbGestorCatalog(userId))) return false;
  const cc = await prisma.costCenter.findUnique({
    where: { id: costCenterId },
    select: { name: true, code: true, company: true, polo: true },
  });
  return isUnbCostCenterRecord(cc);
}

/**
 * null = sem filtro por contrato (admin ou permissão legada Controle).
 * string[] = centros de custo dos contratos em que é gestor (pode ser vazio).
 */
export async function getContractGestorListScopeCostCenterIds(
  userId: string,
  isAdmin: boolean,
  legacyControleModuleKey: string,
): Promise<string[] | null> {
  if (isAdmin) return null;
  if (await userHasLegacyModule(userId, legacyControleModuleKey)) return null;
  if (!(await userHasContractGestorAssignment(userId))) return null;
  return getContractGestorCostCenterIds(userId);
}

export async function assertUserIsContractGestorForCostCenter(
  userId: string,
  isAdmin: boolean,
  legacyControleModuleKey: string,
  costCenterId: string | null | undefined,
): Promise<void> {
  if (isAdmin) return;

  const scopeIds = await getContractGestorListScopeCostCenterIds(userId, false, legacyControleModuleKey);
  if (scopeIds === null) return;

  if (await isCostCenterAllowedForContractGestor(userId, costCenterId)) return;

  throw createError('Sem permissão para aprovar solicitações deste contrato', 403);
}
