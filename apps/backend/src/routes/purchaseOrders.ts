import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { PurchaseOrderService } from '../services/PurchaseOrderService';
import { createError } from '../middleware/errorHandler';

const router = Router();
const service = new PurchaseOrderService();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, supplierId, materialRequestId, page, limit } = req.query;
    const result = await service.list({
      status: status as string,
      supplierId: supplierId as string,
      materialRequestId: materialRequestId as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 20
    });
    res.json({ success: true, data: result.orders, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await service.getById(req.params.id);
    if (!order) throw createError('Ordem de compra não encontrada', 404);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const order = await service.create(req.body, req.user.id);
    res.status(201).json({ success: true, data: order, message: 'Ordem de compra criada com sucesso' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!status) throw createError('Status é obrigatório', 400);
    const order = await service.updateStatus(req.params.id, status, req.user?.id);
    res.json({ success: true, data: order, message: 'Status atualizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export default router;
