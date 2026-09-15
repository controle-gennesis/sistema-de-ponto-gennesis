import express from 'express';
import { Prisma } from '@prisma/client';
import { PERMISSION_ACCESS_ACTION, PERMISSION_MODULES } from '@sistema-ponto/permission-modules';
import {
  authenticate,
  requireAdministrator,
  requirePermissionManagerOrAdministrator,
  AuthRequest,
} from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { getContractGestorCostCenterIds } from '../lib/contractGestorApprovalAccess';
import { getUserUnbCostCenterScope } from '../lib/unbCostCenterScope';
import { getFluigApproverAccessForUser, userCanManageFluigApproverViewers } from '../lib/fluigApproverAccess';
import { filterValidPermissionPayload, removeOrphanUserPermissions } from '../lib/permissionRegistrySync';
import { CONTRACTS_MODULE_KEY } from '../lib/contractAccess';
import {
  DP_RESTRICTED_APPROVE_MODULE_KEY,
  DP_REQUEST_VIEW_CC_MODULE_KEY,
} from '../lib/dpApprovalAccess';
import { isDfAdmLocalLabel, parseDpApprovalSectorsMap, sanitizeDpApprovalSectors } from '../lib/dpApprovalSectors';
import { FD_APPROVE_MODULE_KEY } from '../lib/fdApprovalAccess';
import { FUEL_APPROVE_MODULE_KEY } from '../lib/fuelApprovalAccess';

function asStringIdArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function safePermissionRows<T>(label: string, query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch (err) {
    console.warn(`[permissions] ${label}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function publicTableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  return (rows[0]?.c ?? BigInt(0)) > BigInt(0);
}

function hasPrismaDelegate(name: string): boolean {
  return typeof (prisma as any)[name]?.deleteMany === 'function';
}

function prismaModelHasField(modelName: string, fieldName: string): boolean {
  return (
    Prisma.dmmf.datamodel.models
      .find((m) => m.name === modelName)
      ?.fields.some((f) => f.name === fieldName) === true
  );
}

function toDpApprovalSectorsMap(
  rows: Array<{ contractId: string; allowedSectors?: unknown }>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const sectors = sanitizeDpApprovalSectors(row.allowedSectors);
    if (sectors.length > 0) out[row.contractId] = sectors;
  }
  return out;
}

function toRestrictedSectorsMap(
  rows: Array<{ costCenterId: string; allowedSectors?: unknown }>
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const sectors = sanitizeDpApprovalSectors(row.allowedSectors);
    if (sectors.length > 0) out[row.costCenterId] = sectors;
  }
  return out;
}

function parseSectorsJson(raw: unknown): Record<string, string[]> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return parseDpApprovalSectorsMap(raw);
  }
  return {};
}

async function filterSectorsToDfAdmLocalContracts(
  contractIds: string[],
  sectorsMap: Record<string, string[]>
): Promise<Record<string, string[]>> {
  if (contractIds.length === 0) return {};
  const rows = await prisma.contract.findMany({
    where: { id: { in: contractIds } },
    select: {
      id: true,
      name: true,
      costCenter: { select: { name: true, code: true } },
    },
  });
  const dfIds = new Set(
    rows
      .filter((r) => isDfAdmLocalLabel(r.name, r.costCenter?.name, r.costCenter?.code))
      .map((r) => r.id)
  );
  const out: Record<string, string[]> = {};
  for (const id of contractIds) {
    if (!dfIds.has(id)) continue;
    const sectors = sectorsMap[id] ?? [];
    if (sectors.length > 0) out[id] = sectors;
  }
  return out;
}

async function filterSectorsToDfAdmLocalCostCenters(
  costCenterIds: string[],
  sectorsMap: Record<string, string[]>
): Promise<Record<string, string[]>> {
  if (costCenterIds.length === 0) return {};
  const rows = await prisma.costCenter.findMany({
    where: { id: { in: costCenterIds } },
    select: { id: true, name: true, code: true },
  });
  const dfIds = new Set(
    rows.filter((r) => isDfAdmLocalLabel(r.name, r.code)).map((r) => r.id)
  );
  const out: Record<string, string[]> = {};
  for (const id of costCenterIds) {
    if (!dfIds.has(id)) continue;
    const sectors = sectorsMap[id] ?? [];
    if (sectors.length > 0) out[id] = sectors;
  }
  return out;
}

const router = express.Router();

const MODULES = PERMISSION_MODULES.map((m) => ({ key: m.key, name: m.name, href: m.href }));

type PositionTemplateDelegate = {
  findMany: (args: any) => Promise<any[]>;
  findUnique: (args: any) => Promise<any | null>;
  upsert: (args: any) => Promise<any>;
};

function getPositionTemplateDelegate(): PositionTemplateDelegate | null {
  const delegate = (prisma as any).positionPermissionTemplate as PositionTemplateDelegate | undefined;
  return delegate ?? null;
}

router.use(authenticate);

router.get('/contracts', requirePermissionManagerOrAdministrator, async (_req, res, next) => {
  try {
    const contracts = await prisma.contract.findMany({
      select: {
        id: true,
        name: true,
        number: true,
        costCenter: { select: { name: true, code: true } },
      },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: contracts });
  } catch (e) {
    return next(e);
  }
});

router.get('/cost-centers', requirePermissionManagerOrAdministrator, async (_req, res, next) => {
  try {
    const costCenters = await prisma.costCenter.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: costCenters });
  } catch (e) {
    return next(e);
  }
});

router.get('/modules', async (_req, res, next) => {
  try {
    await removeOrphanUserPermissions();
    return res.json({
      success: true,
      data: {
        modules: MODULES,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.get('/me', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      throw createError('Usuário não autenticado', 401);
    }

    if (req.user.isAdmin) {
      return res.json({
        success: true,
        data: {
          isAdmin: true,
          permissions: [],
          allowedContractIds: [],
          dpApprovalContractIds: [],
          dpApprovalContractSectors: {},
          restrictedDpApprovalCostCenterIds: [],
          restrictedDpApprovalCostCenterSectors: {},
          fdApprovalContractIds: [],
          fuelApprovalContractIds: [],
          dpRequestViewCostCenterIds: [],
          gestorCostCenterIds: [],
          isUnbUser: false,
          unbCostCenterIds: [],
          contractModuleFlags: {},
          fluigApproverFullAccess: true,
          fluigApproverNameKeys: [],
          canManageFluigApproverViewers: true,
        },
      });
    }

    const meUserId = req.user.id;

    const permissions = await prisma.userPermission.findMany({
      where: { userId: meUserId, allowed: true },
      select: {
        module: true,
        action: true,
      },
    });

    const allowedContractIds = await (async () => {
      const withReunioes = await safePermissionRows('me/userContractPermission+reunioes', () =>
        prisma.userContractPermission.findMany({
          where: { userId: meUserId },
          select: {
            contractId: true,
            accessOrcamento: true,
            accessRelatorios: true,
            accessOrdemServico: true,
            accessProducaoSemanal: true,
            accessReunioes: true,
          },
        })
      );
      if (withReunioes.length > 0) return withReunioes;
      const withoutReunioes = await safePermissionRows('me/userContractPermission', () =>
        prisma.userContractPermission.findMany({
          where: { userId: meUserId },
          select: {
            contractId: true,
            accessOrcamento: true,
            accessRelatorios: true,
            accessOrdemServico: true,
            accessProducaoSemanal: true,
          },
        })
      );
      return withoutReunioes.map((r) => ({ ...r, accessReunioes: false }));
    })();

    const canReadDpSectors = prismaModelHasField('UserDpApprovalContract', 'allowedSectors');
    const dpApprovalRows = await safePermissionRows<{ contractId: string; allowedSectors?: unknown }>(
      'me/userDpApprovalContract',
      () =>
        prisma.userDpApprovalContract.findMany({
          where: { userId: meUserId },
          select: {
            contractId: true,
            ...(canReadDpSectors ? { allowedSectors: true } : {}),
          },
        })
    );

    const restrictedDpApprovalRows = await safePermissionRows<{
      costCenterId: string;
      allowedSectors?: unknown;
    }>('me/userRestrictedDpApprovalCostCenter', async () => {
      const delegate = (prisma as any).userRestrictedDpApprovalCostCenter;
      if (!delegate?.findMany) return [];
      const canRead = prismaModelHasField('UserRestrictedDpApprovalCostCenter', 'allowedSectors');
      return delegate.findMany({
        where: { userId: meUserId },
        select: {
          costCenterId: true,
          ...(canRead ? { allowedSectors: true } : {}),
        },
      });
    });

    const fdApprovalContractIds = await safePermissionRows<{ contractId: string }>(
      'me/userFdApprovalContract',
      async () => {
        const delegate = (prisma as any).userFdApprovalContract;
        if (!delegate?.findMany) return [];
        return delegate.findMany({
          where: { userId: meUserId },
          select: { contractId: true },
        });
      }
    );

    const fuelApprovalContractIds = await safePermissionRows<{ contractId: string }>(
      'me/userFuelApprovalContract',
      async () => {
        const delegate = (prisma as any).userFuelApprovalContract;
        if (!delegate?.findMany) return [];
        return delegate.findMany({
          where: { userId: meUserId },
          select: { contractId: true },
        });
      }
    );

    const dpRequestViewCostCenterIds = await safePermissionRows<{ costCenterId: string }>(
      'me/userDpRequestViewCostCenter',
      async () => {
        const delegate = (prisma as any).userDpRequestViewCostCenter;
        if (!delegate?.findMany) return [];
        return delegate.findMany({
          where: { userId: meUserId },
          select: { costCenterId: true },
        });
      }
    );

    const gestorCostCenterIds = await getContractGestorCostCenterIds(meUserId);
    const unbCostCenterScope = await getUserUnbCostCenterScope(meUserId, false);
    const isUnbUser = unbCostCenterScope !== null;
    const unbCostCenterIds = unbCostCenterScope ?? [];
    const fluigApproverAccess = await getFluigApproverAccessForUser(meUserId, false);
    const canManageFluigApproverViewers = await userCanManageFluigApproverViewers(meUserId, false);

    const contractModuleFlags: Record<
      string,
      {
        orcamento: boolean;
        relatorios: boolean;
        ordemServico: boolean;
        producaoSemanal: boolean;
        reunioes: boolean;
      }
    > = {};
    for (const r of allowedContractIds) {
      contractModuleFlags[r.contractId] = {
        orcamento: r.accessOrcamento,
        relatorios: r.accessRelatorios,
        ordemServico: r.accessOrdemServico,
        producaoSemanal: r.accessProducaoSemanal,
        reunioes: Boolean((r as { accessReunioes?: boolean }).accessReunioes),
      };
    }

    return res.json({
      success: true,
      data: {
        isAdmin: false,
        permissions,
        allowedContractIds: allowedContractIds.map((r) => r.contractId),
        dpApprovalContractIds: dpApprovalRows.map((r) => r.contractId),
        dpApprovalContractSectors: toDpApprovalSectorsMap(dpApprovalRows),
        restrictedDpApprovalCostCenterIds: restrictedDpApprovalRows.map((r) => r.costCenterId),
        restrictedDpApprovalCostCenterSectors: toRestrictedSectorsMap(restrictedDpApprovalRows),
        fdApprovalContractIds: fdApprovalContractIds.map((r) => r.contractId),
        fuelApprovalContractIds: fuelApprovalContractIds.map((r) => r.contractId),
        dpRequestViewCostCenterIds: dpRequestViewCostCenterIds.map((r) => r.costCenterId),
        gestorCostCenterIds,
        isUnbUser,
        unbCostCenterIds,
        contractModuleFlags,
        fluigApproverFullAccess: fluigApproverAccess.fullAccess,
        fluigApproverNameKeys: fluigApproverAccess.nameKeys,
        canManageFluigApproverViewers,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', requirePermissionManagerOrAdministrator, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        profilePhotoUrl: true,
        employee: {
          select: {
            position: true,
            department: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/contract-users', requirePermissionManagerOrAdministrator, async (req, res, next) => {
  try {
    const contractId = String(req.query?.contractId || '').trim();
    if (!contractId) {
      throw createError('Parâmetro contractId é obrigatório', 400);
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) {
      throw createError('Contrato não encontrado', 404);
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        employee: { is: { position: { not: 'Administrador' } } },
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        cpf: true,
        email: true,
        employee: {
          select: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (users.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const userIds = users.map((u) => u.id);
    const contractsModuleRows = await prisma.userPermission.findMany({
      where: {
        userId: { in: userIds },
        module: CONTRACTS_MODULE_KEY,
        allowed: true,
      },
      select: { userId: true, action: true },
    });
    const contractAccessRows = await prisma.userContractPermission.findMany({
      where: {
        userId: { in: userIds },
        contractId,
      },
      select: { userId: true },
    });

    const hasContractsModuleByUser = new Set<string>(
      contractsModuleRows.filter((r) => r.action === PERMISSION_ACCESS_ACTION).map((r) => r.userId)
    );
    const hasContractAccessByUser = new Set<string>(contractAccessRows.map((r) => r.userId));

    return res.json({
      success: true,
      data: users.map((u) => ({
        ...u,
        hasContractsModule: hasContractsModuleByUser.has(u.id),
        hasContractAccess: hasContractAccessByUser.has(u.id),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users/:userId', requirePermissionManagerOrAdministrator, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        profilePhotoUrl: true,
        employee: {
          select: {
            position: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw createError('Usuário não encontrado', 404);
    }

    const isAdmin = (targetUser.employee?.position || '').toLowerCase() === 'administrador';

    const permissions = isAdmin
      ? []
      : await prisma.userPermission.findMany({
          where: { userId, allowed: true },
          select: { module: true, action: true },
        });

    const contractPermRows = isAdmin
      ? []
      : await (async () => {
          const withReunioes = await safePermissionRows('userContractPermission+reunioes', () =>
            prisma.userContractPermission.findMany({
              where: { userId },
              select: {
                contractId: true,
                accessOrcamento: true,
                accessRelatorios: true,
                accessOrdemServico: true,
                accessProducaoSemanal: true,
                accessReunioes: true,
              },
            })
          );
          if (withReunioes.length > 0) return withReunioes;
          const withoutReunioes = await safePermissionRows('userContractPermission', () =>
            prisma.userContractPermission.findMany({
              where: { userId },
              select: {
                contractId: true,
                accessOrcamento: true,
                accessRelatorios: true,
                accessOrdemServico: true,
                accessProducaoSemanal: true,
              },
            })
          );
          return withoutReunioes.map((r) => ({ ...r, accessReunioes: false }));
        })();

    const canReadDpSectorsUser = prismaModelHasField('UserDpApprovalContract', 'allowedSectors');
    const dpApprovalRows = isAdmin
      ? []
      : await safePermissionRows<{ contractId: string; allowedSectors?: unknown }>(
          'userDpApprovalContract',
          () =>
            prisma.userDpApprovalContract.findMany({
              where: { userId },
              select: {
                contractId: true,
                ...(canReadDpSectorsUser ? { allowedSectors: true } : {}),
              },
            })
        );

    const canReadRestrictedSectors = prismaModelHasField(
      'UserRestrictedDpApprovalCostCenter',
      'allowedSectors'
    );
    const restrictedDpApprovalRows = isAdmin
      ? []
      : await safePermissionRows<{ costCenterId: string; allowedSectors?: unknown }>(
          'userRestrictedDpApprovalCostCenter',
          async () => {
            const delegate = (prisma as any).userRestrictedDpApprovalCostCenter;
            if (!delegate?.findMany) return [];
            return delegate.findMany({
              where: { userId },
              select: {
                costCenterId: true,
                ...(canReadRestrictedSectors ? { allowedSectors: true } : {}),
              },
            });
          }
        );

    const fdApprovalContractIds = isAdmin
      ? []
      : await safePermissionRows<{ contractId: string }>('userFdApprovalContract', async () => {
          const delegate = (prisma as any).userFdApprovalContract;
          if (!delegate?.findMany) return [];
          return delegate.findMany({
            where: { userId },
            select: { contractId: true },
          });
        });

    const fuelApprovalContractIds = isAdmin
      ? []
      : await safePermissionRows<{ contractId: string }>('userFuelApprovalContract', async () => {
          const delegate = (prisma as any).userFuelApprovalContract;
          if (!delegate?.findMany) return [];
          return delegate.findMany({
            where: { userId },
            select: { contractId: true },
          });
        });

    const dpRequestViewCostCenterIds = isAdmin
      ? []
      : await safePermissionRows<{ costCenterId: string }>('userDpRequestViewCostCenter', async () => {
          const delegate = (prisma as any).userDpRequestViewCostCenter;
          if (!delegate?.findMany) return [];
          return delegate.findMany({
            where: { userId },
            select: { costCenterId: true },
          });
        });

    const contractModuleFlags: Record<string, {
      orcamento: boolean; relatorios: boolean; ordemServico: boolean; producaoSemanal: boolean; reunioes: boolean;
    }> = {};
    for (const r of contractPermRows) {
      contractModuleFlags[r.contractId] = {
        orcamento: r.accessOrcamento,
        relatorios: r.accessRelatorios,
        ordemServico: r.accessOrdemServico,
        producaoSemanal: r.accessProducaoSemanal,
        reunioes: Boolean((r as { accessReunioes?: boolean }).accessReunioes),
      };
    }

    return res.json({
      success: true,
      data: {
        user: targetUser,
        isAdmin,
        permissions,
        allowedContractIds: contractPermRows.map((r) => r.contractId),
        dpApprovalContractIds: dpApprovalRows.map((r) => r.contractId),
        dpApprovalContractSectors: toDpApprovalSectorsMap(dpApprovalRows),
        restrictedDpApprovalCostCenterIds: restrictedDpApprovalRows.map((r) => r.costCenterId),
        restrictedDpApprovalCostCenterSectors: toRestrictedSectorsMap(restrictedDpApprovalRows),
        fdApprovalContractIds: fdApprovalContractIds.map((r) => r.contractId),
        fuelApprovalContractIds: fuelApprovalContractIds.map((r) => r.contractId),
        dpRequestViewCostCenterIds: dpRequestViewCostCenterIds.map((r) => r.costCenterId),
        contractModuleFlags,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/users/:userId', requirePermissionManagerOrAdministrator, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const receivedPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const rawContractIds = req.body?.allowedContractIds;
    const shouldSyncContracts = Array.isArray(rawContractIds);
    const rawDpApproval = req.body?.dpApprovalContractIds;
    const shouldSyncDpApproval = Array.isArray(rawDpApproval);
    const rawDpApprovalSectors = parseDpApprovalSectorsMap(req.body?.dpApprovalContractSectors);
    const rawRestrictedCc = req.body?.restrictedDpApprovalCostCenterIds;
    const shouldSyncRestrictedCc = Array.isArray(rawRestrictedCc);
    const rawRestrictedCcSectors = parseDpApprovalSectorsMap(
      req.body?.restrictedDpApprovalCostCenterSectors
    );
    const rawFdContracts = req.body?.fdApprovalContractIds;
    const shouldSyncFdContracts = Array.isArray(rawFdContracts);
    const rawFuelContracts = req.body?.fuelApprovalContractIds;
    const shouldSyncFuelContracts = Array.isArray(rawFuelContracts);
    const rawViewCc = req.body?.dpRequestViewCostCenterIds;
    const shouldSyncViewCc = Array.isArray(rawViewCc);
    type ContractFlags = {
      orcamento?: boolean;
      relatorios?: boolean;
      ordemServico?: boolean;
      producaoSemanal?: boolean;
      reunioes?: boolean;
    };
    const rawModuleFlags: Record<string, ContractFlags> =
      req.body?.contractModuleFlags && typeof req.body.contractModuleFlags === 'object'
        ? (req.body.contractModuleFlags as Record<string, ContractFlags>)
        : {};

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employee: {
          select: {
            position: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw createError('Usuário não encontrado', 404);
    }

    const isAdmin = (targetUser.employee?.position || '').toLowerCase() === 'administrador';
    if (isAdmin) {
      throw createError('Administrador possui acesso total automático e não pode ser editado', 400);
    }

    const rawPayload = filterValidPermissionPayload(
      receivedPermissions
        .map((p: any) => {
          if (typeof p === 'string') return { module: p };
          if (typeof p?.module === 'string') return { module: p.module, action: p.action };
          return null;
        })
        .filter(Boolean) as Array<{ module: string; action?: string }>
    );
    const normalized = Array.from(
      new Map(rawPayload.map((p) => [`${p.module}:${p.action}`, p])).values()
    );

    const existingCount = await prisma.userPermission.count({ where: { userId } });
    const confirmClear = req.body?.confirmClear === true;
    if (existingCount > 0 && normalized.length === 0 && !confirmClear) {
      throw createError(
        'Recusado: isso apagaria todas as permissões deste usuário. Confirme se for intencional.',
        400
      );
    }

    let contractIdsToSave: string[] = [];
    if (shouldSyncContracts) {
      contractIdsToSave = rawContractIds.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      const hasContractsModule = normalized.some((p) => p.module === CONTRACTS_MODULE_KEY);
      if (contractIdsToSave.length > 0 && !hasContractsModule) {
        throw createError(
          'Marque a permissão do módulo Contratos antes de autorizar contratos específicos',
          400
        );
      }
      if (contractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: contractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        contractIdsToSave = contractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let dpApprovalIdsToSave: string[] = [];
    if (shouldSyncDpApproval) {
      dpApprovalIdsToSave = rawDpApproval.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      if (dpApprovalIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: dpApprovalIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => ok.has(id));
      }
      let allowedContractSet: Set<string>;
      if (shouldSyncContracts) {
        allowedContractSet = new Set(contractIdsToSave);
      } else {
        const cur = await prisma.userContractPermission.findMany({
          where: { userId },
          select: { contractId: true },
        });
        allowedContractSet = new Set(cur.map((r) => r.contractId));
      }
      dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => allowedContractSet.has(id));
    }

    const dpApprovalSectorsToSave = shouldSyncDpApproval
      ? await filterSectorsToDfAdmLocalContracts(dpApprovalIdsToSave, rawDpApprovalSectors)
      : {};
    const canWriteDpSectors = prismaModelHasField('UserDpApprovalContract', 'allowedSectors');

    let restrictedCcIdsToSave: string[] = [];
    if (shouldSyncRestrictedCc) {
      const hasRestrictedPerm = normalized.some((p) => p.module === DP_RESTRICTED_APPROVE_MODULE_KEY);
      restrictedCcIdsToSave = hasRestrictedPerm ? asStringIdArray(rawRestrictedCc) : [];
      if (restrictedCcIdsToSave.length > 0) {
        const existing = await prisma.costCenter.findMany({
          where: { id: { in: restrictedCcIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        restrictedCcIdsToSave = restrictedCcIdsToSave.filter((id) => ok.has(id));
      }
    }

    const restrictedCcSectorsToSave = shouldSyncRestrictedCc
      ? await filterSectorsToDfAdmLocalCostCenters(restrictedCcIdsToSave, rawRestrictedCcSectors)
      : {};
    const canWriteRestrictedSectors = prismaModelHasField(
      'UserRestrictedDpApprovalCostCenter',
      'allowedSectors'
    );

    let fdContractIdsToSave: string[] = [];
    if (shouldSyncFdContracts) {
      const hasFdPerm = normalized.some((p) => p.module === FD_APPROVE_MODULE_KEY);
      fdContractIdsToSave = hasFdPerm ? asStringIdArray(rawFdContracts) : [];
      if (fdContractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: fdContractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        fdContractIdsToSave = fdContractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let fuelContractIdsToSave: string[] = [];
    if (shouldSyncFuelContracts) {
      const hasFuelPerm = normalized.some((p) => p.module === FUEL_APPROVE_MODULE_KEY);
      fuelContractIdsToSave = hasFuelPerm ? asStringIdArray(rawFuelContracts) : [];
      if (fuelContractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: fuelContractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        fuelContractIdsToSave = fuelContractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let viewCcIdsToSave: string[] = [];
    if (shouldSyncViewCc) {
      const hasViewPerm = normalized.some((p) => p.module === DP_REQUEST_VIEW_CC_MODULE_KEY);
      viewCcIdsToSave = hasViewPerm ? asStringIdArray(rawViewCc) : [];
      if (viewCcIdsToSave.length > 0) {
        const existing = await prisma.costCenter.findMany({
          where: { id: { in: viewCcIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        viewCcIdsToSave = viewCcIdsToSave.filter((id) => ok.has(id));
      }
    }

    const canWriteReunioes = prismaModelHasField('UserContractPermission', 'accessReunioes');
    const canSyncRestrictedCcTable =
      shouldSyncRestrictedCc &&
      hasPrismaDelegate('userRestrictedDpApprovalCostCenter') &&
      (await publicTableExists('user_restricted_dp_approval_cost_centers'));
    const canSyncFdContractsTable =
      shouldSyncFdContracts &&
      hasPrismaDelegate('userFdApprovalContract') &&
      (await publicTableExists('user_fd_approval_contracts'));
    const canSyncFuelContractsTable =
      shouldSyncFuelContracts &&
      hasPrismaDelegate('userFuelApprovalContract') &&
      (await publicTableExists('user_fuel_approval_contracts'));
    const canSyncViewCcTable =
      shouldSyncViewCc &&
      hasPrismaDelegate('userDpRequestViewCostCenter') &&
      (await publicTableExists('user_dp_request_view_cost_centers'));

    await prisma.$transaction(async (tx) => {
      // Serializa saves concorrentes do mesmo usuário (auto-save com debounce no front).
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

      await tx.userPermission.deleteMany({
        where: { userId },
      });

      if (normalized.length > 0) {
        await tx.userPermission.createMany({
          data: normalized.map((p) => ({
            userId,
            module: p.module,
            action: p.action,
            allowed: true,
            updatedBy: req.user!.id,
          })),
        });
      }

      if (shouldSyncContracts) {
        await tx.userContractPermission.deleteMany({ where: { userId } });
        if (contractIdsToSave.length > 0) {
          await tx.userContractPermission.createMany({
            data: contractIdsToSave.map((contractId) => {
              const flags = rawModuleFlags[contractId] ?? {};
              return {
                userId,
                contractId,
                updatedBy: req.user!.id,
                accessOrcamento: flags.orcamento !== false,
                accessRelatorios: flags.relatorios !== false,
                accessOrdemServico: flags.ordemServico !== false,
                accessProducaoSemanal: flags.producaoSemanal !== false,
                ...(canWriteReunioes ? { accessReunioes: flags.reunioes === true } : {}),
              };
            }),
          });
        }
      }

      if (shouldSyncDpApproval) {
        await tx.userDpApprovalContract.deleteMany({ where: { userId } });
        if (dpApprovalIdsToSave.length > 0) {
          await tx.userDpApprovalContract.createMany({
            data: dpApprovalIdsToSave.map((contractId) => ({
              userId,
              contractId,
              updatedBy: req.user!.id,
              ...(canWriteDpSectors
                ? { allowedSectors: (dpApprovalSectorsToSave[contractId] ?? []) as Prisma.InputJsonValue }
                : {}),
            })),
          });
        }
      }

      if (canSyncRestrictedCcTable) {
        await tx.userRestrictedDpApprovalCostCenter.deleteMany({ where: { userId } });
        if (restrictedCcIdsToSave.length > 0) {
          await tx.userRestrictedDpApprovalCostCenter.createMany({
            data: restrictedCcIdsToSave.map((costCenterId) => ({
              userId,
              costCenterId,
              updatedBy: req.user!.id,
              ...(canWriteRestrictedSectors
                ? {
                    allowedSectors: (restrictedCcSectorsToSave[costCenterId] ??
                      []) as Prisma.InputJsonValue,
                  }
                : {}),
            })),
          });
        }
      }

      if (canSyncFdContractsTable) {
        await tx.userFdApprovalContract.deleteMany({ where: { userId } });
        if (fdContractIdsToSave.length > 0) {
          await tx.userFdApprovalContract.createMany({
            data: fdContractIdsToSave.map((contractId) => ({
              userId,
              contractId,
              updatedBy: req.user!.id,
            })),
          });
        }
      }

      if (canSyncFuelContractsTable) {
        await tx.userFuelApprovalContract.deleteMany({ where: { userId } });
        if (fuelContractIdsToSave.length > 0) {
          await tx.userFuelApprovalContract.createMany({
            data: fuelContractIdsToSave.map((contractId) => ({
              userId,
              contractId,
              updatedBy: req.user!.id,
            })),
          });
        }
      }

      if (canSyncViewCcTable) {
        await tx.userDpRequestViewCostCenter.deleteMany({ where: { userId } });
        if (viewCcIdsToSave.length > 0) {
          await tx.userDpRequestViewCostCenter.createMany({
            data: viewCcIdsToSave.map((costCenterId) => ({
              userId,
              costCenterId,
              updatedBy: req.user!.id,
            })),
          });
        }
      }
    });

    return res.json({
      success: true,
      message: 'Permissões atualizadas com sucesso',
    });
  } catch (error) {
    return next(error);
  }
});

function slugifyPositionLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Cargos distintos cadastrados (exceto Administrador), para templates por cargo. */
router.get('/positions', requireAdministrator, async (_req, res, next) => {
  try {
    const rows = await prisma.employee.findMany({
      select: { position: true },
      where: { position: { not: 'Administrador' } },
    });
    const uniq = [...new Set(rows.map((r) => r.position).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    return res.json({ success: true, data: uniq });
  } catch (e) {
    return next(e);
  }
});

/** Lista de cargos com contagem de permissões no template (para tabela na UI). */
router.get('/position-summaries', requireAdministrator, async (_req, res, next) => {
  try {
    const rows = await prisma.employee.findMany({
      select: { position: true },
      where: { position: { not: 'Administrador' } },
    });
    const positions = [...new Set(rows.map((r) => r.position).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    const positionTemplates = getPositionTemplateDelegate();
    if (!positionTemplates) {
      return res.json({ success: true, data: positions.map((position) => ({
        position,
        slug: slugifyPositionLabel(position) || 'cargo',
        permissionCount: 0,
        contractsAllowed: 0,
      })) });
    }
    const templates = await positionTemplates.findMany({
      select: { position: true, permissions: true, allowedContractIds: true },
    });
    const byPos = new Map(templates.map((t) => [t.position, t]));
    const data = positions.map((position) => {
      const t = byPos.get(position);
      const perms = t?.permissions;
      const permissionCount = Array.isArray(perms) ? perms.length : 0;
      const idsRaw = t?.allowedContractIds;
      const contractsAllowed = Array.isArray(idsRaw) ? idsRaw.filter((x): x is string => typeof x === 'string').length : 0;
      return {
        position,
        slug: slugifyPositionLabel(position) || 'cargo',
        permissionCount,
        contractsAllowed,
      };
    });
    return res.json({ success: true, data });
  } catch (e) {
    return next(e);
  }
});

router.get('/position-template', requireAdministrator, async (req, res, next) => {
  try {
    const position = String(req.query.position ?? '').trim();
    if (!position) {
      throw createError('Parâmetro position é obrigatório', 400);
    }
    const positionTemplates = getPositionTemplateDelegate();
    if (!positionTemplates) {
      return res.json({
        success: true,
        data: {
          position,
          permissions: [],
          allowedContractIds: [],
          dpApprovalContractIds: [],
          dpApprovalContractSectors: {},
          restrictedDpApprovalCostCenterIds: [],
          restrictedDpApprovalCostCenterSectors: {},
          fdApprovalContractIds: [],
          fuelApprovalContractIds: [],
          dpRequestViewCostCenterIds: [],
          contractModuleFlags: {},
        },
      });
    }
    const row = await positionTemplates.findUnique({
      where: { position },
    });
    if (!row) {
      return res.json({
        success: true,
        data: {
          position,
          permissions: [],
          allowedContractIds: [],
          dpApprovalContractIds: [],
          dpApprovalContractSectors: {},
          restrictedDpApprovalCostCenterIds: [],
          restrictedDpApprovalCostCenterSectors: {},
          fdApprovalContractIds: [],
          fuelApprovalContractIds: [],
          dpRequestViewCostCenterIds: [],
          contractModuleFlags: {},
        },
      });
    }
    const perms = row.permissions;
    const permissions = Array.isArray(perms) ? perms : [];
    const idsRaw = row.allowedContractIds;
    const allowedContractIds = Array.isArray(idsRaw)
      ? idsRaw.filter((x): x is string => typeof x === 'string')
      : [];
    const idsRawDp = (row as { dpApprovalContractIds?: unknown }).dpApprovalContractIds;
    const dpApprovalContractIds = Array.isArray(idsRawDp)
      ? idsRawDp.filter((x): x is string => typeof x === 'string')
      : [];
    const dpApprovalContractSectors = parseSectorsJson(
      (row as { dpApprovalContractSectors?: unknown }).dpApprovalContractSectors
    );
    const idsRawRestricted = (row as { restrictedDpApprovalCostCenterIds?: unknown })
      .restrictedDpApprovalCostCenterIds;
    const restrictedDpApprovalCostCenterIds = Array.isArray(idsRawRestricted)
      ? idsRawRestricted.filter((x): x is string => typeof x === 'string')
      : [];
    const restrictedDpApprovalCostCenterSectors = parseSectorsJson(
      (row as { restrictedDpApprovalCostCenterSectors?: unknown }).restrictedDpApprovalCostCenterSectors
    );
    const idsRawFdContracts = (row as { fdApprovalContractIds?: unknown }).fdApprovalContractIds;
    const fdApprovalContractIds = Array.isArray(idsRawFdContracts)
      ? idsRawFdContracts.filter((x): x is string => typeof x === 'string')
      : [];
    const idsRawFuelContracts = (row as { fuelApprovalContractIds?: unknown }).fuelApprovalContractIds;
    const fuelApprovalContractIds = Array.isArray(idsRawFuelContracts)
      ? idsRawFuelContracts.filter((x): x is string => typeof x === 'string')
      : [];
    const idsRawView = (row as { dpRequestViewCostCenterIds?: unknown }).dpRequestViewCostCenterIds;
    const dpRequestViewCostCenterIds = Array.isArray(idsRawView)
      ? idsRawView.filter((x): x is string => typeof x === 'string')
      : [];
    const rawFlags = (row as { contractModuleFlags?: unknown }).contractModuleFlags;
    const contractModuleFlags =
      rawFlags && typeof rawFlags === 'object' && !Array.isArray(rawFlags)
        ? (rawFlags as Record<string, unknown>)
        : {};
    return res.json({
      success: true,
      data: {
        position,
        permissions,
        allowedContractIds,
        dpApprovalContractIds,
        dpApprovalContractSectors,
        restrictedDpApprovalCostCenterIds,
        restrictedDpApprovalCostCenterSectors,
        fdApprovalContractIds,
        fuelApprovalContractIds,
        dpRequestViewCostCenterIds,
        contractModuleFlags,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.put('/position-template', requireAdministrator, async (req: AuthRequest, res, next) => {
  try {
    const positionTemplates = getPositionTemplateDelegate();
    if (!positionTemplates) {
      throw createError(
        'Modelo de template por cargo indisponível. Rode as migrações e gere o Prisma Client.',
        500
      );
    }
    const position = String(req.body?.position ?? '').trim();
    if (!position) {
      throw createError('Cargo (position) é obrigatório', 400);
    }
    if (position.toLowerCase() === 'administrador') {
      throw createError('Não é possível definir template para o cargo Administrador', 400);
    }
    const receivedPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const rawContractIds = req.body?.allowedContractIds;
    const shouldSyncContracts = Array.isArray(rawContractIds);
    const rawDpApproval = req.body?.dpApprovalContractIds;
    const shouldSyncDpApproval = Array.isArray(rawDpApproval);
    const rawDpApprovalSectorsPos = parseDpApprovalSectorsMap(req.body?.dpApprovalContractSectors);
    const rawRestrictedCc = req.body?.restrictedDpApprovalCostCenterIds;
    const shouldSyncRestrictedCc = Array.isArray(rawRestrictedCc);
    const rawRestrictedCcSectorsPos = parseDpApprovalSectorsMap(
      req.body?.restrictedDpApprovalCostCenterSectors
    );
    const rawFdContracts = req.body?.fdApprovalContractIds;
    const shouldSyncFdContracts = Array.isArray(rawFdContracts);
    const rawFuelContracts = req.body?.fuelApprovalContractIds;
    const shouldSyncFuelContracts = Array.isArray(rawFuelContracts);
    const rawViewCc = req.body?.dpRequestViewCostCenterIds;
    const shouldSyncViewCc = Array.isArray(rawViewCc);
    type PosContractFlags = {
      orcamento?: boolean;
      relatorios?: boolean;
      ordemServico?: boolean;
      producaoSemanal?: boolean;
      reunioes?: boolean;
    };
    const rawModuleFlagsPos: Record<string, PosContractFlags> =
      req.body?.contractModuleFlags && typeof req.body.contractModuleFlags === 'object'
        ? (req.body.contractModuleFlags as Record<string, PosContractFlags>)
        : {};

    const rawPayload = filterValidPermissionPayload(
      receivedPermissions
        .map((p: any) => {
          if (typeof p === 'string') return { module: p };
          if (typeof p?.module === 'string') return { module: p.module, action: p.action };
          return null;
        })
        .filter(Boolean) as Array<{ module: string; action?: string }>
    );
    const normalized = Array.from(
      new Map(rawPayload.map((p) => [`${p.module}:${p.action}`, p])).values()
    );

    let contractIdsToSave: string[] = [];
    if (shouldSyncContracts) {
      contractIdsToSave = rawContractIds.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      const hasContractsModule = normalized.some((p) => p.module === CONTRACTS_MODULE_KEY);
      if (contractIdsToSave.length > 0 && !hasContractsModule) {
        throw createError(
          'Marque a permissão do módulo Contratos antes de autorizar contratos específicos',
          400
        );
      }
      if (contractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: contractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        contractIdsToSave = contractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let dpApprovalIdsToSave: string[] = [];
    if (shouldSyncDpApproval) {
      dpApprovalIdsToSave = rawDpApproval.filter((id: unknown) => typeof id === 'string' && id.length > 0);
      if (dpApprovalIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: dpApprovalIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => ok.has(id));
      }
      let allowedTemplateContracts: Set<string>;
      if (shouldSyncContracts) {
        allowedTemplateContracts = new Set(contractIdsToSave);
      } else {
        const row = await positionTemplates.findUnique({
          where: { position },
          select: { allowedContractIds: true },
        });
        const raw = row?.allowedContractIds;
        allowedTemplateContracts = new Set(
          Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
        );
      }
      dpApprovalIdsToSave = dpApprovalIdsToSave.filter((id) => allowedTemplateContracts.has(id));
    }

    const dpApprovalSectorsToSavePos = shouldSyncDpApproval
      ? await filterSectorsToDfAdmLocalContracts(dpApprovalIdsToSave, rawDpApprovalSectorsPos)
      : {};
    const canWriteTemplateSectors = prismaModelHasField('PositionPermissionTemplate', 'dpApprovalContractSectors');
    const canWriteTemplateRestrictedSectors = prismaModelHasField(
      'PositionPermissionTemplate',
      'restrictedDpApprovalCostCenterSectors'
    );

    let restrictedCcIdsToSave: string[] = [];
    if (shouldSyncRestrictedCc) {
      const hasRestrictedPerm = normalized.some((p) => p.module === DP_RESTRICTED_APPROVE_MODULE_KEY);
      restrictedCcIdsToSave = hasRestrictedPerm ? asStringIdArray(rawRestrictedCc) : [];
      if (restrictedCcIdsToSave.length > 0) {
        const existing = await prisma.costCenter.findMany({
          where: { id: { in: restrictedCcIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        restrictedCcIdsToSave = restrictedCcIdsToSave.filter((id) => ok.has(id));
      }
    }

    const restrictedCcSectorsToSavePos = shouldSyncRestrictedCc
      ? await filterSectorsToDfAdmLocalCostCenters(restrictedCcIdsToSave, rawRestrictedCcSectorsPos)
      : {};

    let fdContractIdsToSave: string[] = [];
    if (shouldSyncFdContracts) {
      const hasFdPerm = normalized.some((p) => p.module === FD_APPROVE_MODULE_KEY);
      fdContractIdsToSave = hasFdPerm ? asStringIdArray(rawFdContracts) : [];
      if (fdContractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: fdContractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        fdContractIdsToSave = fdContractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let fuelContractIdsToSave: string[] = [];
    if (shouldSyncFuelContracts) {
      const hasFuelPerm = normalized.some((p) => p.module === FUEL_APPROVE_MODULE_KEY);
      fuelContractIdsToSave = hasFuelPerm ? asStringIdArray(rawFuelContracts) : [];
      if (fuelContractIdsToSave.length > 0) {
        const existing = await prisma.contract.findMany({
          where: { id: { in: fuelContractIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        fuelContractIdsToSave = fuelContractIdsToSave.filter((id) => ok.has(id));
      }
    }

    let viewCcIdsToSave: string[] = [];
    if (shouldSyncViewCc) {
      const hasViewPerm = normalized.some((p) => p.module === DP_REQUEST_VIEW_CC_MODULE_KEY);
      viewCcIdsToSave = hasViewPerm ? asStringIdArray(rawViewCc) : [];
      if (viewCcIdsToSave.length > 0) {
        const existing = await prisma.costCenter.findMany({
          where: { id: { in: viewCcIdsToSave } },
          select: { id: true },
        });
        const ok = new Set(existing.map((c) => c.id));
        viewCcIdsToSave = viewCcIdsToSave.filter((id) => ok.has(id));
      }
    }

    // Monta flags de módulo por contrato para salvar no JSON
    const builtModuleFlags: Record<string, {
      orcamento: boolean;
      relatorios: boolean;
      ordemServico: boolean;
      producaoSemanal: boolean;
      reunioes: boolean;
    }> = {};
    for (const contractId of contractIdsToSave) {
      const f = rawModuleFlagsPos[contractId] ?? {};
      builtModuleFlags[contractId] = {
        orcamento: f.orcamento !== false,
        relatorios: f.relatorios !== false,
        ordemServico: f.ordemServico !== false,
        producaoSemanal: f.producaoSemanal !== false,
        reunioes: f.reunioes === true,
      };
    }

    const permissionsJson = normalized as unknown as Prisma.InputJsonValue;
    const contractIdsJson = (shouldSyncContracts ? contractIdsToSave : []) as unknown as Prisma.InputJsonValue;
    const dpApprovalJson = (shouldSyncDpApproval ? dpApprovalIdsToSave : []) as unknown as Prisma.InputJsonValue;
    const dpApprovalSectorsJson = (
      shouldSyncDpApproval ? dpApprovalSectorsToSavePos : {}
    ) as unknown as Prisma.InputJsonValue;
    const restrictedCcJson = (
      shouldSyncRestrictedCc ? restrictedCcIdsToSave : []
    ) as unknown as Prisma.InputJsonValue;
    const restrictedCcSectorsJson = (
      shouldSyncRestrictedCc ? restrictedCcSectorsToSavePos : {}
    ) as unknown as Prisma.InputJsonValue;
    const fdContractsJson = (shouldSyncFdContracts ? fdContractIdsToSave : []) as unknown as Prisma.InputJsonValue;
    const fuelContractsJson = (
      shouldSyncFuelContracts ? fuelContractIdsToSave : []
    ) as unknown as Prisma.InputJsonValue;
    const viewCcJson = (shouldSyncViewCc ? viewCcIdsToSave : []) as unknown as Prisma.InputJsonValue;
    const moduleFlagsJson = builtModuleFlags as unknown as Prisma.InputJsonValue;

    await positionTemplates.upsert({
      where: { position },
      create: {
        position,
        permissions: permissionsJson,
        allowedContractIds: contractIdsJson,
        dpApprovalContractIds: dpApprovalJson,
        ...(canWriteTemplateSectors ? { dpApprovalContractSectors: dpApprovalSectorsJson } : {}),
        restrictedDpApprovalCostCenterIds: restrictedCcJson,
        ...(canWriteTemplateRestrictedSectors
          ? { restrictedDpApprovalCostCenterSectors: restrictedCcSectorsJson }
          : {}),
        fdApprovalContractIds: fdContractsJson,
        fuelApprovalContractIds: fuelContractsJson,
        dpRequestViewCostCenterIds: viewCcJson,
        contractModuleFlags: moduleFlagsJson,
      },
      update: {
        permissions: permissionsJson,
        allowedContractIds: contractIdsJson,
        ...(shouldSyncDpApproval ? { dpApprovalContractIds: dpApprovalJson } : {}),
        ...(shouldSyncDpApproval && canWriteTemplateSectors
          ? { dpApprovalContractSectors: dpApprovalSectorsJson }
          : {}),
        ...(shouldSyncRestrictedCc ? { restrictedDpApprovalCostCenterIds: restrictedCcJson } : {}),
        ...(shouldSyncRestrictedCc && canWriteTemplateRestrictedSectors
          ? { restrictedDpApprovalCostCenterSectors: restrictedCcSectorsJson }
          : {}),
        ...(shouldSyncFdContracts ? { fdApprovalContractIds: fdContractsJson } : {}),
        ...(shouldSyncFuelContracts ? { fuelApprovalContractIds: fuelContractsJson } : {}),
        ...(shouldSyncViewCc ? { dpRequestViewCostCenterIds: viewCcJson } : {}),
        ...(shouldSyncContracts ? { contractModuleFlags: moduleFlagsJson } : {}),
      },
    });

    return res.json({
      success: true,
      message: 'Template de cargo atualizado',
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
