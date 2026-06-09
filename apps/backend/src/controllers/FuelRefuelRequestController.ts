import { Response, NextFunction } from 'express';
import { FuelRefuelRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { fuelRefuelRequestService } from '../services/FuelRefuelRequestService';
import {
  assertManagerCanActOnFuelContract,
  getManagerFuelApprovalContractScope,
} from '../lib/fuelApprovalAccess';
import { assertUserHasFuelSuppliesAccess } from '../lib/fuelSuppliesAccess';

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.nativeEnum(FuelRefuelRequestStatus).optional(),
  queue: z.enum(['supplies', 'all']).optional(),
  mine: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

const approveSchema = z.object({
  comment: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1, 'Informe o motivo da rejeição'),
  comment: z.string().optional(),
});

function mapManagerScopeToFuelWhere(
  scope: Record<string, unknown>,
): { contractId?: { in: string[] } } {
  const contractId = scope.contractId as { in: string[] } | undefined;
  if (contractId?.in?.length) return { contractId };
  return {};
}

export class FuelRefuelRequestController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const parsed = listQuerySchema.parse(req.query);
      const rows = await fuelRefuelRequestService.listForSupplies({
        search: parsed.search,
        status: parsed.status,
        queue: parsed.queue,
        requesterId: parsed.mine ? user.id : undefined,
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async listManagerApprovals(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerFuelApprovalContractScope(user.id, user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: [] });
      }

      const rawPhase = String(req.query.phase ?? 'PENDING').toUpperCase();
      type Phase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
      const phase: Phase = (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).includes(
        rawPhase as Phase,
      )
        ? (rawPhase as Phase)
        : 'PENDING';

      const rows = await fuelRefuelRequestService.listForManagerApprovals({
        phase,
        contractScope: mapManagerScopeToFuelWhere(scope),
      });

      return res.json({ success: true, data: rows });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const row = await fuelRefuelRequestService.getByIdForApi(req.params.id);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  private async assertCanDecide(req: AuthRequest, contractId: string | null) {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    await assertManagerCanActOnFuelContract(req.user.id, req.user.isAdmin, contractId);
  }

  async approve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      await this.assertCanDecide(req, existing.contractId);

      const body = approveSchema.parse(req.body);
      const row = await fuelRefuelRequestService.managerApprove(
        req.params.id,
        userId,
        body.comment,
      );
      res.json({ success: true, data: row, message: 'Solicitação aprovada' });
    } catch (error) {
      next(error);
    }
  }

  async reject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      await this.assertCanDecide(req, existing.contractId);

      const body = rejectSchema.parse(req.body);
      const reason = body.reason?.trim() || body.comment?.trim() || '';
      const row = await fuelRefuelRequestService.managerReject(req.params.id, userId, reason);
      res.json({ success: true, data: row, message: 'Solicitação rejeitada' });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const row = await fuelRefuelRequestService.cancel(req.params.id, userId);
      res.json({ success: true, data: row, message: 'Solicitação cancelada' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesApprove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = approveSchema.parse(req.body);
      const row = await fuelRefuelRequestService.suppliesApprove(
        req.params.id,
        user.id,
        body.comment,
      );
      res.json({ success: true, data: row, message: 'Solicitação aprovada — colaborador pode abastecer' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = rejectSchema.parse(req.body);
      const reason = body.reason?.trim() || body.comment?.trim() || '';
      const row = await fuelRefuelRequestService.suppliesReject(req.params.id, user.id, reason);
      res.json({ success: true, data: row, message: 'Solicitação rejeitada' });
    } catch (error) {
      next(error);
    }
  }

  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerFuelApprovalContractScope(user.id, user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: { count: 0 } });
      }

      const count = await fuelRefuelRequestService.countPendingManager(
        mapManagerScopeToFuelWhere(scope),
      );
      return res.json({ success: true, data: { count } });
    } catch (error) {
      return next(error);
    }
  }

  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const count = await fuelRefuelRequestService.countPendingSupplies();
      return res.json({ success: true, data: { count } });
    } catch (error) {
      return next(error);
    }
  }
}

export const fuelRefuelRequestController = new FuelRefuelRequestController();
