import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { getContractAccessForUser } from './contractAccess';
import { AuthRequest } from '../middleware/auth';

export const DP_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp');
export const DP_MANAGE_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
export const DP_SOLICITACOES_MODULE_KEY = pathToModuleKey('/ponto/solicitacoes-dp');
/** Controle: rescisão e alteração de função/salário (além de admin, gerenciar DP ou Gestor DP no contrato). */
export const DP_SENSITIVE_CREATE_MODULE_KEY = pathToModuleKey('/ponto/controle/criar-tipos-restritos-dp');

/**
 * Pode atuar como gestor nas rotas de aprovação DP: vínculo em `user_dp_approval_contracts`
 * ou permissão legada (antes da coluna «Gestor DP» na aba Contratos).
 */
export async function userHasDpApprovePermission(userId: string): Promise<boolean> {
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (legacy) return true;
  const row = await prisma.userDpApprovalContract.findFirst({
    where: { userId },
    select: { id: true },
  });
  return !!row;
}

export async function userHasDpManagePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: DP_MANAGE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

export async function userHasSolicitacoesDpModule(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: DP_SOLICITACOES_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

export async function userHasSensitiveDpCreateControlePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: DP_SENSITIVE_CREATE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

/**
 * `null` = usuário não é gestor DP (sem permissão ou sem contratos vinculados).
 * `{}` = admin (sem filtro de contrato).
 */
async function buildManagerDpScopeFromContractIds(contractIds: string[]): Promise<Record<string, unknown>> {
  if (contractIds.length === 0) return { contractId: { in: [] } };
  const rows = await prisma.contract.findMany({
    where: { id: { in: contractIds } },
    select: { costCenterId: true },
    distinct: ['costCenterId'],
  });
  const costCenterIds = rows.map((r) => r.costCenterId).filter(Boolean);
  if (costCenterIds.length === 0) return { contractId: { in: contractIds } };
  return {
    OR: [{ contractId: { in: contractIds } }, { costCenterId: { in: costCenterIds } }],
  };
}

export async function getManagerDpApprovalContractScope(
  userId: string,
  isAdmin: boolean
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  const hasApprove = await userHasDpApprovePermission(userId);
  if (!hasApprove) return null;
  const ids = await prisma.userDpApprovalContract.findMany({
    where: { userId },
    select: { contractId: true },
  });
  const list = ids.map((r) => r.contractId);
  if (list.length > 0) return buildManagerDpScopeFromContractIds(list);
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (!legacy) return null;
  const access = await getContractAccessForUser(userId, false);
  if (access.filter === 'ids' && access.ids.length > 0) {
    return buildManagerDpScopeFromContractIds(access.ids);
  }
  return null;
}

export async function assertManagerCanActOnDpContract(
  userId: string,
  isAdmin: boolean,
  contractId: string | null,
  costCenterId?: string | null
): Promise<void> {
  if (isAdmin) return;
  const hasApprove = await userHasDpApprovePermission(userId);
  if (!hasApprove) {
    throw createError('Sem permissão para aprovar solicitações DP', 403);
  }

  if (contractId) {
    const ok = await prisma.userDpApprovalContract.findFirst({
      where: { userId, contractId },
      select: { id: true },
    });
    if (ok) return;
    const legacy = await prisma.userPermission.findFirst({
      where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
    });
    if (legacy) {
      const access = await getContractAccessForUser(userId, false);
      if (access.filter === 'ids' && access.ids.includes(contractId)) return;
    }
  }

  if (costCenterId) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId },
      select: { id: true },
    });
    for (const c of contracts) {
      try {
        await assertManagerCanActOnDpContract(userId, false, c.id);
        return;
      } catch {
        // tenta próximo contrato do mesmo centro de custo
      }
    }
  }

  throw createError('Sem permissão para aprovar solicitações deste contrato', 403);
}

/** Pode vincular centro de custo ao formulário de solicitação DP. */
export async function assertCanAttachCostCenterToDpRequest(
  req: AuthRequest,
  costCenterId: string
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  if (await userHasDpManagePermission(req.user.id)) return;
  if (await userHasSolicitacoesDpModule(req.user.id)) return;

  const cc = await prisma.costCenter.findFirst({
    where: { id: costCenterId, isActive: true },
    select: { id: true },
  });
  if (!cc) throw createError('Centro de custo não encontrado', 404);

  const access = await getContractAccessForUser(req.user.id, false);
  if (access.filter === 'ids') {
    const linked = await prisma.contract.findFirst({
      where: { costCenterId, id: { in: access.ids } },
      select: { id: true },
    });
    if (linked) return;
  }

  if (await userHasDpApprovePermission(req.user.id)) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId },
      select: { id: true },
    });
    for (const c of contracts) {
      const row = await prisma.userDpApprovalContract.findFirst({
        where: { userId: req.user.id, contractId: c.id },
        select: { id: true },
      });
      if (row) return;
    }
  }

  throw createError('Sem permissão para usar este centro de custo na solicitação', 403);
}

/** @deprecated mantido para compatibilidade interna */
export async function assertCanAttachContractToDpRequest(req: AuthRequest, contractId: string): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  if (await userHasDpManagePermission(req.user.id)) return;
  if (await userHasSolicitacoesDpModule(req.user.id)) return;

  const access = await getContractAccessForUser(req.user.id, false);
  if (access.filter === 'ids' && access.ids.includes(contractId)) {
    return;
  }

  if (await userHasDpApprovePermission(req.user.id)) {
    const row = await prisma.userDpApprovalContract.findFirst({
      where: { userId: req.user.id, contractId },
      select: { id: true },
    });
    if (row) return;
    const legacy = await prisma.userPermission.findFirst({
      where: {
        userId: req.user.id,
        module: DP_APPROVE_MODULE_KEY,
        action: PERMISSION_ACCESS_ACTION,
        allowed: true,
      },
    });
    if (legacy && access.filter === 'ids' && access.ids.includes(contractId)) return;
  }

  throw createError('Sem permissão para usar este contrato na solicitação', 403);
}

export async function userMayCreateSensitiveDpRequest(
  userId: string,
  isAdmin: boolean,
  contractId: string
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasDpManagePermission(userId)) return true;
  if (await userHasSensitiveDpCreateControlePermission(userId)) return true;
  if (!(await userHasDpApprovePermission(userId))) return false;
  const row = await prisma.userDpApprovalContract.findFirst({
    where: { userId, contractId },
    select: { id: true },
  });
  if (row) return true;
  const legacy = await prisma.userPermission.findFirst({
    where: { userId, module: DP_APPROVE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  if (!legacy) return false;
  const access = await getContractAccessForUser(userId, false);
  return access.filter === 'ids' && access.ids.includes(contractId);
}
