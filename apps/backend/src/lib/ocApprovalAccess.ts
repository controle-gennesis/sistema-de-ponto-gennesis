import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertUserIsContractGestorForCostCenter,
  userHasContractGestorAssignment,
} from './contractGestorApprovalAccess';

export const OC_APPROVE_COMPRAS_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-compras');
export const OC_APPROVE_GESTOR_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-gestor');
export const OC_APPROVE_DIRETORIA_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-diretoria');
export const OC_TAB_ATTACH_BOLETO_KEY = pathToModuleKey('/ponto/controle/oc-anexar-boleto');
export const OC_TAB_PAYMENT_KEY = pathToModuleKey('/ponto/controle/oc-pagamento');
export const OC_TAB_VALIDATE_PROOF_KEY = pathToModuleKey('/ponto/controle/oc-validar-comprovante');
export const OC_TAB_PROOF_CORRECTION_KEY = pathToModuleKey('/ponto/controle/oc-corrigir-comprovante');
export const OC_TAB_ATTACH_NF_KEY = pathToModuleKey('/ponto/controle/oc-anexar-nf');
export const OC_TAB_CORRECTION_KEY = pathToModuleKey('/ponto/controle/oc-correcao');

export type OcApprovalPhase = 'compras' | 'gestor' | 'diretoria';

export function ocApprovalPhaseForStatus(status: string): OcApprovalPhase | null {
  if (status === 'PENDING_COMPRAS' || status === 'DRAFT') return 'compras';
  if (status === 'PENDING') return 'gestor';
  if (status === 'PENDING_DIRETORIA') return 'diretoria';
  return null;
}

async function userHasModule(userId: string, module: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

export async function userHasOcComprasApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_COMPRAS_MODULE_KEY);
}

/** Gestor por contrato ou permissão legada Controle. */
export async function userHasOcGestorApprovePermission(userId: string): Promise<boolean> {
  if (await userHasContractGestorAssignment(userId)) return true;
  return userHasModule(userId, OC_APPROVE_GESTOR_MODULE_KEY);
}

export async function userHasOcDiretoriaApprovePermission(userId: string): Promise<boolean> {
  return userHasModule(userId, OC_APPROVE_DIRETORIA_MODULE_KEY);
}

export async function assertUserHasOcModule(
  userId: string,
  isAdmin: boolean,
  module: string,
  message: string
): Promise<void> {
  if (isAdmin) return;
  if (!(await userHasModule(userId, module))) {
    throw createError(message, 403);
  }
}

export async function assertUserMayActOnOcApprovalPhase(
  userId: string,
  isAdmin: boolean,
  phase: OcApprovalPhase,
  materialRequestCostCenterId?: string | null,
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
    await assertUserIsContractGestorForCostCenter(
      userId,
      isAdmin,
      OC_APPROVE_GESTOR_MODULE_KEY,
      materialRequestCostCenterId,
    );
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
  newStatus: string,
  materialRequestCostCenterId?: string | null,
): Promise<void> {
  const phase = ocApprovalPhaseForStatus(currentStatus);
  if (!phase) return;

  const approvalActions = new Set([
    'PENDING',
    'PENDING_DIRETORIA',
    'APPROVED',
    'IN_REVIEW',
    'REJECTED',
  ]);
  if (!approvalActions.has(newStatus)) return;

  await assertUserMayActOnOcApprovalPhase(userId, isAdmin, phase, materialRequestCostCenterId);
}

/**
 * Gates de mudança de status fora das fases de aprovação (pagamento, validação, NF…).
 * As fases de aprovação continuam em `assertOcApprovalStatusChange`.
 */
export async function assertOcFlowStatusChange(
  userId: string,
  isAdmin: boolean,
  currentStatus: string,
  newStatus: string,
  materialRequestCostCenterId?: string | null,
): Promise<void> {
  await assertOcApprovalStatusChange(
    userId,
    isAdmin,
    currentStatus,
    newStatus,
    materialRequestCostCenterId
  );

  if (newStatus === 'PENDING_PROOF_VALIDATION') {
    if (currentStatus === 'PENDING_PROOF_CORRECTION') {
      await assertUserHasOcModule(
        userId,
        isAdmin,
        OC_TAB_PROOF_CORRECTION_KEY,
        'Sem permissão na aba Correção Comprovante da OC'
      );
    } else {
      await assertUserHasOcModule(
        userId,
        isAdmin,
        OC_TAB_PAYMENT_KEY,
        'Sem permissão na aba Pagamento da OC'
      );
    }
    return;
  }

  if (newStatus === 'PENDING_PROOF_CORRECTION') {
    await assertUserHasOcModule(
      userId,
      isAdmin,
      OC_TAB_VALIDATE_PROOF_KEY,
      'Sem permissão na aba Validação Comprovante da OC'
    );
    return;
  }

  if (newStatus === 'PENDING_NF_ATTACHMENT') {
    await assertUserHasOcModule(
      userId,
      isAdmin,
      OC_TAB_VALIDATE_PROOF_KEY,
      'Sem permissão na aba Validação Comprovante da OC'
    );
    return;
  }

  if (newStatus === 'FINALIZED') {
    await assertUserHasOcModule(
      userId,
      isAdmin,
      OC_TAB_ATTACH_NF_KEY,
      'Sem permissão na aba Anexar NF da OC'
    );
  }
}
