import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

/** Igual a pathToModuleKey('/ponto/contratos') no pacote permission-modules. */
export const CONTRACTS_MODULE_KEY = 'ponto_contratos';

export type ContractAccessFilter =
  | { filter: 'all' }
  | { filter: 'none' }
  | { filter: 'ids'; ids: string[] };

export async function getContractAccessForUser(
  userId: string,
  isAdmin: boolean
): Promise<ContractAccessFilter> {
  if (isAdmin) return { filter: 'all' };

  const hasModule = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });

  if (!hasModule) return { filter: 'none' };

  const rows = await prisma.userContractPermission.findMany({
    where: { userId },
    select: { contractId: true },
  });

  return { filter: 'ids', ids: rows.map((r) => r.contractId) };
}

export async function assertContractAccess(req: AuthRequest, contractId: string): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);

  const access = await getContractAccessForUser(req.user.id, req.user.isAdmin);
  if (access.filter === 'all') return;
  if (access.filter === 'none') {
    throw createError('Sem permissão para acessar contratos', 403);
  }
  if (!access.ids.includes(contractId)) {
    throw createError('Sem permissão para este contrato', 403);
  }
}
