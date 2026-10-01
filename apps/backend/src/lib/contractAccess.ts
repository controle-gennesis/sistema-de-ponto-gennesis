import { PERMISSION_ACCESS_ACTION, PERMISSION_MODULE_CRUD_ACTIONS } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

/** Igual a pathToModuleKey('/ponto/contratos') no pacote permission-modules. */
export const CONTRACTS_MODULE_KEY = 'ponto_contratos';
/** Igual a pathToModuleKey('/ponto/contratos/socios'). */
export const CONTRACTS_SOCIOS_MODULE_KEY = 'ponto_contratos_socios';
/** Igual a pathToModuleKey('/ponto/metricas/relatorios-contrato'). */
export const RELATORIOS_CONTRATO_MODULE_KEY = 'ponto_metricas_relatorios-contrato';

export type ContractAccessFilter =
  | { filter: 'all' }
  | { filter: 'none' }
  | { filter: 'ids'; ids: string[] };

/**
 * Ficha do contrato (dados sensíveis): módulo Contratos em Acesso + Liberado.
 * Não usar em selects operacionais (Caixinha, FD, OS…) — use `getLiberadoContractAccessForUser`.
 */
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
    where: { userId, accessLiberado: true },
    select: { contractId: true },
  });

  return { filter: 'ids', ids: rows.map((r) => r.contractId) };
}

/**
 * Escopo operacional: só contratos com Liberado (aba Contratos).
 * Não exige o módulo Contratos — a ficha sensível continua em `getContractAccessForUser`.
 */
export async function getLiberadoContractAccessForUser(
  userId: string,
  isAdmin: boolean
): Promise<ContractAccessFilter> {
  if (isAdmin) return { filter: 'all' };

  const rows = await prisma.userContractPermission.findMany({
    where: { userId, accessLiberado: true },
    select: { contractId: true },
  });

  if (rows.length === 0) return { filter: 'none' };
  return { filter: 'ids', ids: rows.map((r) => r.contractId) };
}

export async function assertLiberadoContractAccess(
  req: AuthRequest,
  contractId: string
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);

  const access = await getLiberadoContractAccessForUser(req.user.id, req.user.isAdmin);
  if (access.filter === 'all') return;
  if (access.filter === 'none' || !access.ids.includes(contractId)) {
    throw createError('Sem permissão para este contrato', 403);
  }
}

/** Contratos Liberado + flag Orçamento (lista da página Orçamentos). */
export async function getOrcamentoContractIdsForUser(
  userId: string,
  isAdmin: boolean
): Promise<string[] | null> {
  if (isAdmin) return null;
  const rows = await prisma.userContractPermission.findMany({
    where: { userId, accessLiberado: true, accessOrcamento: true },
    select: { contractId: true },
  });
  return rows.map((r) => r.contractId);
}

/** Centros de custo dos contratos liberados. `null` = sem restrição (admin). `[]` = nenhum. */
export async function getCostCenterIdsForContractAccess(
  userId: string,
  isAdmin: boolean
): Promise<string[] | null> {
  const access = await getContractAccessForUser(userId, isAdmin);
  if (access.filter === 'all') return null;
  if (access.filter === 'none' || access.ids.length === 0) return [];
  const contracts = await prisma.contract.findMany({
    where: { id: { in: access.ids } },
    select: { costCenterId: true },
  });
  return [...new Set(contracts.map((row) => row.costCenterId).filter(Boolean))];
}

/**
 * IDs de contrato com Liberado.
 * `null` = admin (não restringir).
 * `[]` = usuário sem nenhum contrato liberado.
 */
export async function getAssignedContractIds(
  userId: string,
  isAdmin: boolean
): Promise<string[] | null> {
  if (isAdmin) return null;
  const access = await getLiberadoContractAccessForUser(userId, false);
  if (access.filter === 'none') return [];
  return access.ids;
}

/**
 * CCs dos contratos explicitamente liberados.
 * `null` = não restringir (admin ou sem contratos cadastrados).
 */
export async function getExplicitContractCostCenterScope(
  userId: string,
  isAdmin: boolean
): Promise<string[] | null> {
  const ids = await getAssignedContractIds(userId, isAdmin);
  if (ids === null) return null;
  if (ids.length === 0) return [];
  const contracts = await prisma.contract.findMany({
    where: { id: { in: ids } },
    select: { costCenterId: true },
  });
  return [...new Set(contracts.map((row) => row.costCenterId).filter(Boolean))];
}

/**
 * Gastos operacionais (TOTVS) na tela Sócios: libera quem tem Contratos
 * ou só o módulo Contratos Sócios (sem precisar do Contratos geral).
 */
export async function userCanAccessGastosOperacionais(
  userId: string,
  isAdmin: boolean
): Promise<boolean> {
  const access = await getContractAccessForUser(userId, isAdmin);
  if (access.filter !== 'none') return true;

  const hasSociosModule = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_SOCIOS_MODULE_KEY,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    select: { id: true },
  });
  return Boolean(hasSociosModule);
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

/** Leitura básica do contrato (nome/CC): Liberado (operacional) ou ficha (módulo+Liberado). */
export async function assertContractSummaryAccess(
  req: AuthRequest,
  contractId: string
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;

  try {
    await assertLiberadoContractAccess(req, contractId);
    return;
  } catch {
    /* tenta ficha completa */
  }

  await assertContractAccess(req, contractId);
}

/** Flags da aba «Contratos» em permissões (orçamento, relatórios, OS, produção semanal, reuniões). */
export type ContractScopedModuleFlag =
  | 'orcamento'
  | 'relatorios'
  | 'ordemServico'
  | 'producaoSemanal'
  | 'reunioes';

export async function assertRecebimentoEntregasOnContract(
  req: AuthRequest,
  contractId: string | null | undefined
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  if (!contractId) {
    throw createError('Entrega sem contrato vinculado', 403);
  }
  await assertContractAccess(req, contractId);
}

export async function assertContractModulePermission(
  req: AuthRequest,
  contractId: string,
  module: ContractScopedModuleFlag
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;

  // Orçamento: Liberado + flag Orçamento (sem precisar do módulo Contratos / ficha).
  // Demais abas: ficha (módulo Contratos + Liberado) + flag correspondente.
  if (module === 'orcamento') {
    await assertLiberadoContractAccess(req, contractId);
  } else {
    await assertContractAccess(req, contractId);
  }

  const row = await prisma.userContractPermission.findUnique({
    where: {
      userId_contractId: { userId: req.user.id, contractId },
    },
    select: {
      accessOrcamento: true,
      accessRelatorios: true,
      accessOrdemServico: true,
      accessProducaoSemanal: true,
      accessReunioes: true,
    },
  });

  const ok =
    module === 'orcamento'
      ? row?.accessOrcamento === true
      : module === 'relatorios'
        ? row?.accessRelatorios === true
        : module === 'ordemServico'
          ? row?.accessOrdemServico === true
          : module === 'producaoSemanal'
            ? row?.accessProducaoSemanal === true
            : row?.accessReunioes === true;

  if (!ok) {
    const msg =
      module === 'reunioes'
        ? 'Sem permissão da aba Reuniões neste contrato'
        : module === 'producaoSemanal'
          ? 'Sem permissão de Produção Semanal neste contrato'
          : module === 'ordemServico'
            ? 'Sem permissão de Ordem de Serviço neste contrato'
            : module === 'relatorios'
              ? 'Sem permissão de Relatórios neste contrato'
              : 'Sem permissão de Orçamento neste contrato';
    throw createError(msg, 403);
  }
}

async function assertUserHasContractMutation(
  userId: string,
  isAdmin: boolean,
  action: 'criar' | 'editar' | 'excluir',
  message: string,
): Promise<void> {
  if (isAdmin) return;

  // Só a ação explícita libera mutação. «Ver»/`acesso` não basta.
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      action,
      allowed: true,
    },
    select: { id: true },
  });
  if (!row) {
    throw createError(message, 403);
  }
}

/** Contratos: ação granular `criar`. Administradores passam sempre. */
export async function assertUserCanCreateContract(userId: string, isAdmin: boolean): Promise<void> {
  await assertUserHasContractMutation(
    userId,
    isAdmin,
    'criar',
    'Sem permissão para criar contratos',
  );
}

/** Contratos: ação granular `editar`. Administradores passam sempre. */
export async function assertUserCanEditContract(userId: string, isAdmin: boolean): Promise<void> {
  await assertUserHasContractMutation(
    userId,
    isAdmin,
    'editar',
    'Sem permissão para editar contratos',
  );
}

/** Contratos: ação granular `excluir`. Administradores passam sempre. */
export async function assertUserCanDeleteContract(userId: string, isAdmin: boolean): Promise<void> {
  await assertUserHasContractMutation(
    userId,
    isAdmin,
    'excluir',
    'Sem permissão para excluir contratos',
  );
}

export async function userHasContractsModuleAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: CONTRACTS_MODULE_KEY,
      allowed: true,
      action: { in: [PERMISSION_ACCESS_ACTION, ...PERMISSION_MODULE_CRUD_ACTIONS] },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Mutação em reunião/relatório.
 * Excluir: só admin ou quem tem Excluir em Métricas → Relatórios de Contrato.
 * Criar/editar: módulo Contratos (aba do contrato) ou Criar/Editar em Relatórios de Contrato.
 */
export async function assertRelatoriosContratoMutation(
  req: AuthRequest,
  action: 'criar' | 'editar' | 'excluir'
): Promise<void> {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;

  const rows = await prisma.userPermission.findMany({
    where: {
      userId: req.user.id,
      module: RELATORIOS_CONTRATO_MODULE_KEY,
      allowed: true,
    },
    select: { action: true },
  });
  const actions = new Set(rows.map((r) => r.action));

  if (action === 'excluir') {
    if (!actions.has('excluir')) {
      throw createError('Você não tem permissão para excluir reuniões', 403);
    }
    return;
  }

  if (await userHasContractsModuleAccess(req.user.id, false)) return;

  if (!actions.has('editar') && !actions.has('criar')) {
    throw createError('Você só pode visualizar as reuniões quinzenais', 403);
  }
}
