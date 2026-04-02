import express from 'express';
import { PERMISSION_ACCESS_ACTION, PERMISSION_MODULES } from '@sistema-ponto/permission-modules';
import { authenticate, requireAdministrator, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { filterValidPermissionPayload, removeOrphanUserPermissions } from '../lib/permissionRegistrySync';
import { CONTRACTS_MODULE_KEY } from '../lib/contractAccess';

const router = express.Router();

const MODULES = PERMISSION_MODULES.map((m) => ({ key: m.key, name: m.name, href: m.href }));

router.use(authenticate);

router.get('/contracts', requireAdministrator, async (_req, res, next) => {
  try {
    const contracts = await prisma.contract.findMany({
      select: { id: true, name: true, number: true },
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: contracts });
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
        },
      });
    }

    const permissions = await prisma.userPermission.findMany({
      where: { userId: req.user.id, allowed: true, action: PERMISSION_ACCESS_ACTION },
      select: {
        module: true,
        action: true,
      },
    });

    const allowedContractIds = await prisma.userContractPermission.findMany({
      where: { userId: req.user.id },
      select: { contractId: true },
    });

    return res.json({
      success: true,
      data: {
        isAdmin: false,
        permissions,
        allowedContractIds: allowedContractIds.map((r) => r.contractId),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/users', requireAdministrator, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
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

router.get('/users/:userId', requireAdministrator, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
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
          where: { userId, allowed: true, action: PERMISSION_ACCESS_ACTION },
          select: { module: true, action: true },
        });

    const allowedContractIds = isAdmin
      ? []
      : await prisma.userContractPermission.findMany({
          where: { userId },
          select: { contractId: true },
        });

    return res.json({
      success: true,
      data: {
        user: targetUser,
        isAdmin,
        permissions,
        allowedContractIds: allowedContractIds.map((r) => r.contractId),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/users/:userId', requireAdministrator, async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const receivedPermissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const rawContractIds = req.body?.allowedContractIds;
    const shouldSyncContracts = Array.isArray(rawContractIds);

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
    const normalized = Array.from(new Map(rawPayload.map((p) => [p.module, p])).values());

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

    await prisma.$transaction(async (tx) => {
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
            data: contractIdsToSave.map((contractId) => ({
              userId,
              contractId,
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

export default router;
