import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { requireFdApproverAccess, requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { DemandSheetApprovalController } from '../controllers/DemandSheetApprovalController';

const router = Router();
const controller = new DemandSheetApprovalController();
const fdModule = pathToModuleKey('/ponto/aprovacao-fds');
const fdsAprovadasModule = pathToModuleKey('/ponto/fds-aprovadas');

const uploadDir = path.join(os.tmpdir(), 'fd-import-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const importUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.bin';
      cb(null, `${Date.now()}-${uuidv4()}${ext}`);
    },
  }),
  limits: {
    fileSize: 8 * 1024 * 1024 * 1024,
    files: 400,
    /** JSON das fichas no campo `payload` — default do multer é 1 MB e estoura fácil. */
    fieldSize: 256 * 1024 * 1024,
    fields: 40,
  },
});

function handleFdImportUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        message:
          'Arquivo ZIP grande demais (máx. 8 GB). Divida em ZIPs menores e tente de novo.',
      });
      return;
    }
    if (err.code === 'LIMIT_FIELD_VALUE') {
      res.status(400).json({
        success: false,
        message:
          'Planilha grande demais no envio. Atualize o sistema ou importe as fichas sem anexos e envie os ZIPs em seguida.',
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: err.message || 'Erro no upload da importação.',
    });
    return;
  }
  next(err);
}

function cleanupUploadedFiles(req: Request) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!files) return;
  for (const list of Object.values(files)) {
    for (const file of list || []) {
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
    }
  }
}

router.use(authenticate);

router.get('/', requireModuleAccess(fdModule), controller.list.bind(controller));
router.post('/', requireModuleAccess(fdModule), controller.create.bind(controller));

router.post(
  '/import',
  requireModuleAccess(fdModule),
  (req, res, next) => {
    importUpload.fields([
      { name: 'anexos', maxCount: 300 },
      { name: 'anexosZip', maxCount: 5 },
    ])(req, res, (err) => {
      if (err) return handleFdImportUploadError(err, req, res, next);
      return next();
    });
  },
  (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      cleanupUploadedFiles(req);
      return originalJson(body);
    }) as typeof res.json;

    const originalNext = next;
    next = ((err?: unknown) => {
      if (err) cleanupUploadedFiles(req);
      return originalNext(err);
    }) as NextFunction;

    return controller.importMany(req, res);
  },
);

router.get('/notification-counts', controller.getNotificationCounts.bind(controller));
router.get(
  '/aprovadas-compras',
  requireModuleAccess(fdsAprovadasModule),
  controller.listApprovedForPurchasing.bind(controller)
);
router.get('/aprovacoes', requireFdApproverAccess, controller.getManagerApprovals.bind(controller));

router.patch(
  '/:id/purchase-status',
  requireModuleAccess(fdsAprovadasModule),
  controller.updatePurchaseStatus.bind(controller)
);
router.patch('/:id', requireModuleAccess(fdModule), controller.update.bind(controller));
router.delete('/:id', requireModuleAccess(fdModule), controller.remove.bind(controller));
router.put('/:id/manager-approve', requireFdApproverAccess, controller.approveManager.bind(controller));
router.put('/:id/manager-reject', requireFdApproverAccess, controller.rejectManager.bind(controller));

export default router;
