import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { getContractAccessForUser } from './contractAccess';
import { AuthRequest } from '../middleware/auth';
import { isAdmTstDpRequestType } from './dpRequestAdmTst';
import {
  isDfAdmLocalLabel,
  sanitizeDpApprovalSectors,
  sectorSolicitanteMatches,
} from './dpApprovalSectors';

export const DP_APPROVE_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-solicitacoes-dp');
export const DP_RESTRICTED_APPROVE_MODULE_KEY = pathToModuleKey(
  '/ponto/controle/aprovar-solicitacoes-restritas-dp'
);
export const DP_MANAGE_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
export const ADM_TST_MANAGE_MODULE_KEY = pathToModuleKey('/ponto/gerenciar-solicitacoes-adm-tst');
export const DP_SOLICITACOES_MODULE_KEY = pathToModuleKey('/ponto/solicitacoes-dp');
/** Controle: rescisão e alteração de função/salário (além de admin, gerenciar DP ou Gestor DP no contrato). */
export const DP_SENSITIVE_CREATE_MODULE_KEY = pathToModuleKey('/ponto/controle/criar-tipos-restritos-dp');
export const DP_REQUEST_VIEW_CC_MODULE_KEY = pathToModuleKey(
  '/ponto/controle/ver-solicitacoes-internas-cc'
);

export const SENSITIVE_DP_REQUEST_TYPES = ['RESCISAO', 'ALTERACAO_FUNCAO_SALARIO'] as const;

export function isSensitiveDpRequestType(requestType: string): boolean {
  return (SENSITIVE_DP_REQUEST_TYPES as readonly string[]).includes(requestType);
}

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

export async function userHasRestrictedDpApprovePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: DP_RESTRICTED_APPROVE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

export async function userHasDpRequestViewCostCenterPermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: DP_REQUEST_VIEW_CC_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

/** Centros de custo cujas solicitações internas o usuário pode ver além das próprias. */
export async function getDpRequestViewCostCenterIds(userId: string): Promise<string[]> {
  const hasPerm = await userHasDpRequestViewCostCenterPermission(userId);
  if (!hasPerm) return [];
  const rows = await prisma.userDpRequestViewCostCenter.findMany({
    where: { userId },
    select: { costCenterId: true },
  });
  return rows.map((r) => r.costCenterId);
}

export async function getRestrictedDpApprovalCostCenterIds(
  userId: string,
  isAdmin: boolean
): Promise<string[] | null> {
  if (isAdmin) return null;
  const hasPerm = await userHasRestrictedDpApprovePermission(userId);
  if (!hasPerm) return [];
  const rows = await prisma.userRestrictedDpApprovalCostCenter.findMany({
    where: { userId },
    select: { costCenterId: true },
  });
  return rows.map((r) => r.costCenterId);
}

async function resolveDpRequestCostCenterId(
  contractId: string | null | undefined,
  costCenterId?: string | null
): Promise<string | null> {
  if (costCenterId) return costCenterId;
  if (!contractId) return null;
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { costCenterId: true },
  });
  return contract?.costCenterId ?? null;
}

type RestrictedDpAssignment = {
  costCenterId: string;
  isDfAdmLocal: boolean;
  allowedSectors: string[];
};

async function getRestrictedDpAssignments(userId: string): Promise<RestrictedDpAssignment[]> {
  const rows = await prisma.userRestrictedDpApprovalCostCenter.findMany({
    where: { userId },
    select: {
      costCenterId: true,
      allowedSectors: true,
      costCenter: { select: { name: true, code: true } },
    },
  });
  return rows.map((row) => ({
    costCenterId: row.costCenterId,
    isDfAdmLocal: isDfAdmLocalLabel(row.costCenter?.name, row.costCenter?.code),
    allowedSectors: sanitizeDpApprovalSectors(row.allowedSectors),
  }));
}

async function userHasRestrictedApproveForCostCenter(
  userId: string,
  costCenterId: string | null | undefined
): Promise<boolean> {
  if (!costCenterId) return false;
  const hasPerm = await userHasRestrictedDpApprovePermission(userId);
  if (!hasPerm) return false;
  const ok = await prisma.userRestrictedDpApprovalCostCenter.findFirst({
    where: { userId, costCenterId },
    select: { id: true },
  });
  return !!ok;
}

async function userHasRestrictedApproveForRequest(
  userId: string,
  costCenterId: string | null | undefined,
  sectorSolicitante?: string | null
): Promise<boolean> {
  if (!costCenterId) return false;
  const assignments = await getRestrictedDpAssignments(userId);
  const match = assignments.find((a) => a.costCenterId === costCenterId);
  if (!match) return false;
  if (!match.isDfAdmLocal || match.allowedSectors.length === 0) return true;
  return sectorSolicitanteMatches(match.allowedSectors, sectorSolicitante);
}

/** Pedidos dos CCs liberados — com ou sem contrato cadastrado. */
async function restrictedDpApprovalVisibilityWhere(
  assignments: RestrictedDpAssignment[]
): Promise<Record<string, unknown>> {
  if (assignments.length === 0) return { id: { in: [] } };

  const unrestrictedIds: string[] = [];
  const orParts: Record<string, unknown>[] = [];

  for (const assignment of assignments) {
    if (assignment.isDfAdmLocal && assignment.allowedSectors.length > 0) {
      const contracts = await prisma.contract.findMany({
        where: { costCenterId: assignment.costCenterId },
        select: { id: true },
      });
      const contractIds = contracts.map((c) => c.id);
      const ccScope =
        contractIds.length === 0
          ? { costCenterId: assignment.costCenterId }
          : {
              OR: [
                { costCenterId: assignment.costCenterId },
                { contractId: { in: contractIds } },
              ],
            };
      orParts.push({
        AND: [ccScope, sectorWhere(assignment.allowedSectors)],
      });
      continue;
    }
    unrestrictedIds.push(assignment.costCenterId);
  }

  if (unrestrictedIds.length > 0) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId: { in: unrestrictedIds } },
      select: { id: true },
    });
    const contractIds = contracts.map((c) => c.id);
    if (contractIds.length === 0) {
      orParts.push({ costCenterId: { in: unrestrictedIds } });
    } else {
      orParts.push({
        OR: [{ costCenterId: { in: unrestrictedIds } }, { contractId: { in: contractIds } }],
      });
    }
  }

  if (orParts.length === 0) return { id: { in: [] } };
  if (orParts.length === 1) return orParts[0];
  return { OR: orParts };
}

/** Gestor DP comum ou aprovador de solicitações restritas (para entrar na API de aprovações). */
export async function userHasAnyDpApproverAccess(userId: string): Promise<boolean> {
  if (await userHasDpApprovePermission(userId)) return true;
  return userHasRestrictedDpApprovePermission(userId);
}

export async function userHasDpManagePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: { userId, module: DP_MANAGE_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!row;
}

export async function userHasAdmTstManagePermission(userId: string): Promise<boolean> {
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: ADM_TST_MANAGE_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!row;
}

/** Gestor da fila DP ou ADM/TST conforme o tipo da solicitação. */
export async function assertUserCanManageDpRequest(
  userId: string,
  isAdmin: boolean,
  requestType: string
): Promise<void> {
  if (isAdmin) return;
  const isAdm = isAdmTstDpRequestType(requestType);
  const allowed = isAdm
    ? await userHasAdmTstManagePermission(userId)
    : await userHasDpManagePermission(userId);
  if (!allowed) {
    throw createError(
      isAdm
        ? 'Sem permissão para gerenciar solicitações ADM/TST'
        : 'Sem permissão para gerenciar solicitações do Departamento Pessoal',
      403
    );
  }
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

type DpApprovalAssignment = {
  contractId: string;
  costCenterId: string | null;
  isDfAdmLocal: boolean;
  allowedSectors: string[];
};

function sectorWhere(allowedSectors: string[]): Record<string, unknown> {
  if (allowedSectors.length === 1) {
    return { sectorSolicitante: { equals: allowedSectors[0], mode: 'insensitive' } };
  }
  return {
    OR: allowedSectors.map((setor) => ({
      sectorSolicitante: { equals: setor, mode: 'insensitive' },
    })),
  };
}

function contractOrCostCenterWhere(contractId: string, costCenterId: string | null): Record<string, unknown> {
  if (!costCenterId) return { contractId };
  return { OR: [{ contractId }, { costCenterId }] };
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

async function getDpApprovalAssignments(userId: string): Promise<DpApprovalAssignment[]> {
  const rows = await prisma.userDpApprovalContract.findMany({
    where: { userId },
    select: {
      contractId: true,
      allowedSectors: true,
      contract: {
        select: {
          name: true,
          costCenterId: true,
          costCenter: { select: { name: true, code: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    contractId: row.contractId,
    costCenterId: row.contract.costCenterId,
    isDfAdmLocal: isDfAdmLocalLabel(
      row.contract.name,
      row.contract.costCenter?.name,
      row.contract.costCenter?.code
    ),
    allowedSectors: sanitizeDpApprovalSectors(row.allowedSectors),
  }));
}

async function buildManagerDpScopeFromAssignments(
  assignments: DpApprovalAssignment[]
): Promise<Record<string, unknown>> {
  if (assignments.length === 0) return { contractId: { in: [] } };

  const unrestrictedContractIds: string[] = [];
  const unrestrictedCostCenterIds: string[] = [];
  const orParts: Record<string, unknown>[] = [];

  for (const assignment of assignments) {
    if (assignment.isDfAdmLocal && assignment.allowedSectors.length > 0) {
      orParts.push({
        AND: [
          contractOrCostCenterWhere(assignment.contractId, assignment.costCenterId),
          sectorWhere(assignment.allowedSectors),
        ],
      });
      continue;
    }
    unrestrictedContractIds.push(assignment.contractId);
    if (assignment.costCenterId) unrestrictedCostCenterIds.push(assignment.costCenterId);
  }

  if (unrestrictedContractIds.length > 0) {
    const uniqueCcIds = [...new Set(unrestrictedCostCenterIds)];
    if (uniqueCcIds.length === 0) {
      orParts.push({ contractId: { in: unrestrictedContractIds } });
    } else {
      orParts.push({
        OR: [
          { contractId: { in: unrestrictedContractIds } },
          { costCenterId: { in: uniqueCcIds } },
        ],
      });
    }
  }

  if (orParts.length === 0) return { contractId: { in: [] } };
  if (orParts.length === 1) return orParts[0];
  return { OR: orParts };
}

function assignmentCoversSector(
  assignments: DpApprovalAssignment[],
  contractId: string | null,
  costCenterId: string | null,
  sectorSolicitante: string | null | undefined
): boolean {
  const relevant = assignments.filter(
    (a) =>
      (contractId && a.contractId === contractId) ||
      (costCenterId && a.costCenterId === costCenterId)
  );
  if (relevant.length === 0) return true;
  const unrestricted = relevant.filter((a) => !a.isDfAdmLocal || a.allowedSectors.length === 0);
  if (unrestricted.length > 0) return true;
  return relevant.some(
    (a) => a.isDfAdmLocal && sectorSolicitanteMatches(a.allowedSectors, sectorSolicitante)
  );
}

export async function getDpManagerApprovalVisibilityWhere(
  userId: string,
  isAdmin: boolean
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  const regularScope = await getManagerDpApprovalContractScope(userId, false);
  const hasRestricted = await userHasRestrictedDpApprovePermission(userId);
  const restrictedAssignments = hasRestricted ? await getRestrictedDpAssignments(userId) : [];
  const orParts: Record<string, unknown>[] = [];
  if (regularScope) {
    orParts.push({
      AND: [regularScope, { requestType: { notIn: [...SENSITIVE_DP_REQUEST_TYPES] } }],
    });
  }
  if (hasRestricted && restrictedAssignments.length > 0) {
    orParts.push(await restrictedDpApprovalVisibilityWhere(restrictedAssignments));
  }
  if (orParts.length === 0) return null;
  return { OR: orParts };
}

export async function getManagerDpApprovalContractScope(
  userId: string,
  isAdmin: boolean
): Promise<Record<string, unknown> | null> {
  if (isAdmin) return {};
  const hasApprove = await userHasDpApprovePermission(userId);
  if (!hasApprove) return null;
  const assignments = await getDpApprovalAssignments(userId);
  if (assignments.length > 0) return buildManagerDpScopeFromAssignments(assignments);
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

export async function assertManagerCanApproveDpRequest(
  userId: string,
  isAdmin: boolean,
  requestType: string,
  contractId: string | null,
  costCenterId?: string | null,
  sectorSolicitante?: string | null
): Promise<void> {
  if (isAdmin) return;

  const resolvedCostCenterId = await resolveDpRequestCostCenterId(contractId, costCenterId);
  const restrictedOk = await userHasRestrictedApproveForRequest(
    userId,
    resolvedCostCenterId,
    sectorSolicitante
  );

  if (isSensitiveDpRequestType(requestType)) {
    if (!restrictedOk) {
      throw createError(
        resolvedCostCenterId
          ? 'Sem permissão para aprovar solicitações restritas deste centro de custo'
          : 'Solicitação sem centro de custo para aprovação restrita',
        403
      );
    }
    return;
  }

  if (restrictedOk) return;

  await assertManagerCanActOnDpContract(userId, isAdmin, contractId, resolvedCostCenterId);

  const assignments = await getDpApprovalAssignments(userId);
  if (!assignmentCoversSector(assignments, contractId, resolvedCostCenterId, sectorSolicitante)) {
    throw createError('Sem permissão para aprovar solicitações deste setor', 403);
  }
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

/** Pode vincular contrato ao formulário de solicitação geral. */
export async function assertCanAttachContractToDpRequest(
  req: AuthRequest,
  contractId: string
): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, costCenterId: true },
  });
  if (!contract) throw createError('Contrato não encontrado', 404);
  await assertCanAttachCostCenterToDpRequest(req, contract.costCenterId);
}

async function userIsGestorDpOnContract(userId: string, contractId: string): Promise<boolean> {
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

export async function userMayCreateSensitiveDpRequest(
  userId: string,
  isAdmin: boolean,
  contractId?: string | null,
  costCenterId?: string | null
): Promise<boolean> {
  if (isAdmin) return true;
  if (await userHasDpManagePermission(userId)) return true;
  if (await userHasSensitiveDpCreateControlePermission(userId)) return true;
  if (contractId && (await userIsGestorDpOnContract(userId, contractId))) return true;
  if (costCenterId) {
    const contracts = await prisma.contract.findMany({
      where: { costCenterId },
      select: { id: true },
    });
    for (const c of contracts) {
      if (await userIsGestorDpOnContract(userId, c.id)) return true;
    }
  }
  return false;
}
