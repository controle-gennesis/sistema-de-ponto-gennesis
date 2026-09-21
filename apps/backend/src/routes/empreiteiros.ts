import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { EmpreiteiroController } from '../controllers/EmpreiteiroController';

const router = Router();
const controller = new EmpreiteiroController();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const TEAM_FILE_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];

function isAllowedTeamFile(originalName: string, mimeType: string): boolean {
  const name = originalName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (TEAM_FILE_EXT.some((ext) => name.endsWith(ext))) return true;
  if (mime.includes('pdf') || mime.startsWith('image/') || mime.includes('msword') || mime.includes('officedocument')) {
    return true;
  }
  return false;
}

router.use(authenticate);

router.post(
  '/upload-file',
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
      const originalName = fixMulterOriginalName(req.file.originalname);
      if (!isAllowedTeamFile(originalName, req.file.mimetype || '')) {
        throw createError('Envie PDF, imagem ou documento (DOC/DOCX)', 400);
      }
      const saved = await savePersistentUpload({
        folder: 'empreiteiro-files',
        buffer: req.file.buffer,
        originalName,
        mimeType: req.file.mimetype || 'application/octet-stream',
        includeSafeOriginalName: true,
      });
      res.json({
        success: true,
        data: {
          url: saved.url,
          key: saved.key,
          name: originalName || saved.originalName || saved.fileName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', (req, res, next) => controller.getAll(req as any, res as any, next));
router.get('/:id/daily-measurements', (req, res, next) =>
  controller.listDailyMeasurements(req as any, res as any, next)
);
router.post('/:id/daily-measurements', (req, res, next) =>
  controller.createDailyMeasurement(req as any, res as any, next)
);
router.patch('/:id/daily-measurements/:measurementId', (req, res, next) =>
  controller.updateDailyMeasurement(req as any, res as any, next)
);
router.delete('/:id/daily-measurements/:measurementId', (req, res, next) =>
  controller.deleteDailyMeasurement(req as any, res as any, next)
);
router.get('/:id', (req, res, next) => controller.getById(req as any, res as any, next));
router.post('/', (req, res, next) => controller.create(req as any, res as any, next));
router.post('/:id/unlink', (req, res, next) => controller.unlink(req as any, res as any, next));
router.patch('/:id', (req, res, next) => controller.update(req as any, res as any, next));
router.delete('/:id', (req, res, next) => controller.delete(req as any, res as any, next));

export default router;
