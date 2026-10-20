import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import {
  getContractGestorCostCenterIds,
  isCostCenterAllowedForContractGestor,
  userHasContractGestorAssignment,
} from './contractGestorApprovalAccess';

/**
 * Aprovação de medições de entrega e aditivos de empreita. Pode aprovar:
 * - o administrador (tudo);
 * - o gestor do contrato (coluna «Gestor» na aba Contratos);
 * - quem recebeu a permissão «Aprovar medições de entrega» com contratos escolhidos.
 * O escopo é sempre o dos centros de custo dos contratos ligados ao usuário.
 */
export const EMPREITEIRO_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-medicoes-empreita');

/** Contratos liberados pela permissão (exige o módulo marcado; sem contrato escolhido, não aprova). */
async function getPermissionGrantedContractIds(userId: string): Promise<string[]> {
  const perm = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: EMPREITEIRO_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  if (!perm) return [];
  const rows = await prisma.userEmpreiteiroApprovalContract.findMany({
    where: { userId },
    select: { contractId: true },
  });
  return rows.map((row) => row.contractId);
}

async function getPermissionGrantedCostCenterIds(userId: string): Promise<string[]> {
  const contractIds = await getPermissionGrantedContractIds(userId);
  if (contractIds.length === 0) return [];
  const rows = await prisma.contract.findMany({
    where: { id: { in: contractIds } },
    select: { costCenterId: true },
  });
  return rows.map((row) => row.costCenterId).filter((id): id is string => !!id);
}

/** O usuário pode aprovar (gestor de algum contrato ou permissão com contratos escolhidos). */
export async function userIsEmpreiteiroApprovalGestor(userId: string): Promise<boolean> {
  if (await userHasContractGestorAssignment(userId)) return true;
  return (await getPermissionGrantedContractIds(userId)).length > 0;
}

/** Centros de custo que o usuário pode aprovar (sem expansão para administrador). */
export async function getEmpreiteiroGestorCostCenterIds(userId: string): Promise<string[]> {
  const ids = new Set(await getContractGestorCostCenterIds(userId));
  for (const id of await getPermissionGrantedCostCenterIds(userId)) ids.add(id);
  return Array.from(ids);
}

/** O usuário pode decidir sobre um item deste centro de custo? */
export async function gestorCanDecideForCostCenter(
  userId: string,
  costCenterId: string | null | undefined
): Promise<boolean> {
  if (!costCenterId) return false;
  if (await isCostCenterAllowedForContractGestor(userId, costCenterId)) return true;
  return (await getPermissionGrantedCostCenterIds(userId)).includes(costCenterId);
}
