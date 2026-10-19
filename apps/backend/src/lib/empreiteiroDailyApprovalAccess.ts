import {
  getContractGestorCostCenterIds,
  isCostCenterAllowedForContractGestor,
  userHasContractGestorAssignment,
} from './contractGestorApprovalAccess';

/**
 * Aprovação de medições de entrega e aditivos de empreita: só o gestor do centro de custo
 * (coluna «Gestor» na aba Contratos) e o administrador.
 */

/** O usuário é gestor de algum contrato (condição para ver a fila de aprovação). */
export async function userIsEmpreiteiroApprovalGestor(userId: string): Promise<boolean> {
  return userHasContractGestorAssignment(userId);
}

/** Centros de custo em que o usuário é gestor (sem expansão para administrador). */
export async function getEmpreiteiroGestorCostCenterIds(userId: string): Promise<string[]> {
  return getContractGestorCostCenterIds(userId);
}

/** O gestor pode decidir sobre um item deste centro de custo? */
export async function gestorCanDecideForCostCenter(
  userId: string,
  costCenterId: string | null | undefined
): Promise<boolean> {
  return isCostCenterAllowedForContractGestor(userId, costCenterId);
}
