import { prisma } from './prisma';
import { userHidesContractOrcamento } from './unbCostCenterScope';

/**
 * Orçamentos ficam por centro de custo. Vê/edita quem é administrador ou tem «Liberado»
 * (aba Contratos das permissões) em algum contrato desse centro de custo — a mesma regra
 * da lista de Orçamentos no front (canAccessContractOrcamentoTab).
 */
export async function userCanAccessOrcamentoCostCenter(
  userId: string,
  isAdmin: boolean,
  costCenterId: string
): Promise<boolean> {
  if (isAdmin) return true;
  if (!costCenterId) return false;
  if (await userHidesContractOrcamento(userId)) return false;
  const liberado = await prisma.userContractPermission.findFirst({
    where: { userId, accessLiberado: true, contract: { costCenterId } },
    select: { id: true },
  });
  return !!liberado;
}
