import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAnyModuleAccess } from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { caixinhaPurchaseController } from '../controllers/CaixinhaPurchaseController';

const router = Router();
const CAIXINHA_MODULE_KEY = pathToModuleKey('/ponto/caixinha');
const requireCaixinha = requireAnyModuleAccess([CAIXINHA_MODULE_KEY]);

const CAIXINHA_ANEXO_MAX_BYTES = 200 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CAIXINHA_ANEXO_MAX_BYTES },
});

router.use(authenticate);
router.use(requireCaixinha);

router.get('/', (req, res, next) => caixinhaPurchaseController.list(req, res, next));
router.get('/options', (req, res, next) => caixinhaPurchaseController.options(req, res, next));
router.post('/accounts', (req, res, next) => caixinhaPurchaseController.createAccount(req, res, next));
router.post(
  '/upload-invoice',
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ success: false, message: 'Arquivo grande demais (máx. 200 MB).' });
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
        folder: 'caixinha-invoices',
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
router.get('/:id', (req, res, next) => caixinhaPurchaseController.getById(req, res, next));
router.post('/', (req, res, next) => caixinhaPurchaseController.create(req, res, next));
router.patch('/:id', (req, res, next) => caixinhaPurchaseController.update(req, res, next));
router.delete('/:id', (req, res, next) => caixinhaPurchaseController.remove(req, res, next));

export default router;
