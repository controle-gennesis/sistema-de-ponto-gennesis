import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { MaterialDeliveryController } from '../controllers/MaterialDeliveryController';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';

const router = Router();
const controller = new MaterialDeliveryController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(authenticate);

router.get('/summary', (req, res, next) => controller.getSummary(req, res, next));
router.get('/resolve-shortfall-type', (req, res, next) => controller.resolveShortfallType(req, res, next));
router.post('/geral-lookups', (req, res, next) => controller.upsertGeralLookups(req, res, next));
router.post(
  '/upload-receipt-file',
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, message: 'Arquivo grande demais (máx. 50 MB).' });
        return;
      }
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
      const originalName = fixMulterOriginalName(req.file.originalname);
      const saved = await savePersistentUpload({
        folder: 'material-delivery-receipts',
        buffer: req.file.buffer,
        originalName,
        mimeType: req.file.mimetype || 'application/octet-stream',
      });
      res.json({
        success: true,
        data: {
          url: saved.url,
          originalName: originalName || saved.originalName || saved.fileName,
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
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.patch('/:id/receive', (req, res, next) => controller.markReceivedByEngineering(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
