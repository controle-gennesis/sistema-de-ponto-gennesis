import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { ServiceOrderService } from '../services/ServiceOrderService';

const serviceOrderService = new ServiceOrderService();

export class ServiceOrderController {
  async listByCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const costCenterId =
        typeof req.query.costCenterId === 'string' ? req.query.costCenterId.trim() : '';
      if (!costCenterId) {
        throw createError('costCenterId é obrigatório', 400);
      }

      const data = await serviceOrderService.listByCostCenter(costCenterId);
      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Centro de custo')) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
}
