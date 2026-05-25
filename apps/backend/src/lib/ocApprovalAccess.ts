import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const OC_APPROVE_COMPRAS_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-compras');
export const OC_APPROVE_GESTOR_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-gestor');
export const OC_APPROVE_DIRETORIA_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-diretoria');

export type OcApprovalPhase = 'compras' | 'gestor' | 'diretoria';

export function ocApprovalPhaseForStatus(status: string): OcApprovalPhase | null {
  if (status === 'PENDING_COMPRAS' || status === 'DRAFT') return 'compras';
  if (status === 'PENDING') return 'gestor';
  if (status === 'PENDING_DIRETORIA') return 'diretoria';
  return null;
}

async function userHasModule(userId: string, module: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module, action: PERMISSION_ACCESS_ACTION, allowed: true }
  });
  return !!row;
}

export async function userHasOcComprasApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_COMPRAS_MODULE_KEY);
}

export async function userHasOcGestorApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_GESTOR_MODULE_KEY);
}

export async function userHasOcDiretoriaApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_DIRETORIA_MODULE_KEY);
}

export async function assertUserMayActOnOcApprovalPhase(
  userId: string,
  isAdmin: boolean,
  phase: OcApprovalPhase
): Promise<void> {
  if (isAdmin) return;

  if (phase === 'compras') {
    if (!(await userHasOcComprasApprovePermission(userId))) {
      throw createError('Sem permissão para aprovar OCs na fase de compras', 403);
    }
    return;
  }

  if (phase === 'gestor') {
    if (!(await userHasOcGestorApprovePermission(userId))) {
      throw createError('Sem permissão para aprovar OCs na fase do gestor', 403);
    }
    return;
  }

  if (!(await userHasOcDiretoriaApprovePermission(userId))) {
    throw createError('Sem permissão para aprovar OCs na fase da diretoria', 403);
  }
}

/** Valida aprovação, reprovação ou envio para correção nas fases de aprovação da OC. */
export async function assertOcApprovalStatusChange(
  userId: string,
  isAdmin: boolean,
  currentStatus: string,
  newStatus: string
): Promise<void> {
  const phase = ocApprovalPhaseForStatus(currentStatus);
  if (!phase) return;

  const approvalActions = new Set([
    'PENDING',
    'PENDING_DIRETORIA',
    'APPROVED',
    'IN_REVIEW',
    'REJECTED'
  ]);
  if (!approvalActions.has(newStatus)) return;

  await assertUserMayActOnOcApprovalPhase(userId, isAdmin, phase);
}
