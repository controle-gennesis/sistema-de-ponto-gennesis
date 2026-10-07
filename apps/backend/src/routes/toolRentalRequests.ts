import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolRentalSuppliesAccess } from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { ToolRentalRequestController } from '../controllers/ToolRentalRequestController';

const router = Router();
const controller = new ToolRentalRequestController();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticate);

router.get('/supplies-pending-count', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.suppliesPendingCount(req, res, next)
);
router.get('/supplies-summary', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.suppliesSummary(req, res, next)
);
router.get('/receipt-users', (req, res, next) => controller.listReceiptUsers(req, res, next));

router.post(
  '/upload-attachment',
  requireToolRentalSuppliesAccess,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Erro no upload';
        res.status(400).json({ success: false, message: msg });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
      const saved = await savePersistentUpload({
        folder: 'tool-rental-requests',
        buffer: req.file.buffer,
        originalName: fixMulterOriginalName(req.file.originalname),
        mimeType: req.file.mimetype,
      });
      res.json({
        success: true,
        data: {
          url: saved.url,
          originalName: fixMulterOriginalName(req.file.originalname) || saved.originalName || saved.fileName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/** Upload de anexo de recebimento (Engenharia — sem exigir acesso Suprimentos). */
router.post(
  '/upload-receipt-file',
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Erro no upload';
        res.status(400).json({ success: false, message: msg });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
      const saved = await savePersistentUpload({
        folder: 'tool-rental-requests/receipts',
        buffer: req.file.buffer,
        originalName: fixMulterOriginalName(req.file.originalname),
        mimeType: req.file.mimetype,
      });
      res.json({
        success: true,
        data: {
          url: saved.url,
          originalName:
            fixMulterOriginalName(req.file.originalname) || saved.originalName || saved.fileName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.put('/:id/sc-number', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.updateScNumber(req, res, next)
);
router.put('/:id/to-supplier-relation', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.moveToSupplierRelation(req, res, next)
);
router.put('/:id/to-quotation', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.moveToQuotation(req, res, next)
);
router.put('/:id/to-awaiting-payment', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.moveToAwaitingPayment(req, res, next)
);
router.put('/:id/complete', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.complete(req, res, next)
);
router.put('/:id/confirm-receipt', (req, res, next) =>
  controller.confirmReceipt(req, res, next)
);
router.post('/:id/renew', (req, res, next) =>
  controller.renew(req, res, next)
);
router.post('/:id/request-devolution', (req, res, next) =>
  controller.requestDevolution(req, res, next)
);
router.post(
  '/:id/anexos',
  requireToolRentalSuppliesAccess,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Erro no upload';
        res.status(400).json({ success: false, message: msg });
        return;
      }
      next();
    });
  },
  (req, res, next) => controller.uploadAnexo(req, res, next)
);
router.delete('/:id/anexos/:anexoId', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.deleteAnexo(req, res, next)
);
router.put('/:id/supplies-reject', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.suppliesReject(req, res, next)
);
router.put('/:id/cancel', (req, res, next) => controller.cancel(req, res, next));

export default router;
