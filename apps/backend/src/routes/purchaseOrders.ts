import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { PurchaseOrderService } from '../services/PurchaseOrderService';
import { createError } from '../middleware/errorHandler';
import { backendUploadsRoot } from '../lib/uploads';

const router = Router();
const service = new PurchaseOrderService();

const boletoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF ou imagem (PNG, JPG, WEBP)'));
  }
});

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

router.post('/upload-boleto', (req: AuthRequest, res: Response, next: NextFunction) => {
  boletoUpload.single('boleto')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError('Selecione um arquivo (PDF ou imagem)', 400);
    }
    const uploadsDir = path.join(backendUploadsRoot, 'purchase-orders');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.pdf';
    const safeExt = ext.length <= 8 ? ext : '.pdf';
    const fileName = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/purchase-orders/${fileName}`,
        originalName: req.file.originalname || fileName
      }
    });
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

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await service.getById(req.params.id);
    if (!order) throw createError('Ordem de compra não encontrada', 404);
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!status) throw createError('Status é obrigatório', 400);
    const order = await service.updateStatus(req.params.id, status, req.user?.id, {
      rejectionReason: typeof rejectionReason === 'string' ? rejectionReason : undefined
    });
    res.json({ success: true, data: order, message: 'Status atualizado com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Apenas |Status atual não permite/.test(error.message)) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.patch('/:id/details', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await service.updateDetails(req.params.id, req.body, req.user?.id);
    res.json({ success: true, data: order, message: 'Ordem de compra atualizada com sucesso' });
  } catch (error) {
    if (error instanceof Error && /Apenas |Ordem de compra não encontrada|OC só pode/.test(error.message)) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

export default router;
