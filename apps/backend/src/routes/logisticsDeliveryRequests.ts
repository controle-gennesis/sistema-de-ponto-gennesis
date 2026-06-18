import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  requireLogisticsDeliveryAccess,
  requireLogisticsDeliveryCompletionAccess,
  requireLogisticsDeliveryReadAccess,
} from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';
import { backendUploadsRoot } from '../lib/uploads';
import { logisticsDeliveryRequestController } from '../controllers/LogisticsDeliveryRequestController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticate);

router.get('/', requireLogisticsDeliveryReadAccess, (req, res, next) =>
  logisticsDeliveryRequestController.list(req, res, next),
);

router.post('/', requireLogisticsDeliveryAccess, (req, res, next) =>
  logisticsDeliveryRequestController.create(req, res, next),
);

router.post('/upload-attachment', requireLogisticsDeliveryReadAccess, (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
    const uploadsDir = path.join(backendUploadsRoot, 'logistics-delivery-requests');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.bin';
    const safeExt = ext.length <= 8 ? ext : '.bin';
    const fileName = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/logistics-delivery-requests/${fileName}`,
        originalName: req.file.originalname || fileName,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pending-count', requireLogisticsDeliveryCompletionAccess, (req, res, next) =>
  logisticsDeliveryRequestController.pendingCount(req, res, next),
);

router.get('/:id', requireLogisticsDeliveryReadAccess, (req, res, next) =>
  logisticsDeliveryRequestController.getById(req, res, next),
);

router.post('/:id/finalize', requireLogisticsDeliveryCompletionAccess, (req, res, next) =>
  logisticsDeliveryRequestController.finalize(req, res, next),
);

router.patch('/:id', requireLogisticsDeliveryAccess, (req, res, next) =>
  logisticsDeliveryRequestController.update(req, res, next),
);

router.delete('/:id', requireLogisticsDeliveryAccess, (req, res, next) =>
  logisticsDeliveryRequestController.delete(req, res, next),
);

export default router;
