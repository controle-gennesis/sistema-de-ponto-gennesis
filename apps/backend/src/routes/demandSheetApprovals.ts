import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { requireFdApproverAccess, requireModuleAccess, requireAnyModuleAccess } from '../middleware/permissionAuth';
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

router.get(
  '/options/contratos',
  requireModuleAccess(fdModule),
  controller.listContratoOptions.bind(controller)
);

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
// Detalhe da RM na aprovação: mesma visibilidade do GET /material-requests/:id (usuário autenticado).
// Etiqueta "FD" na lista de RMs (só IDs; o acesso às RMs continua pela rota de RMs).
router.get('/material-request-ids', controller.listFdMaterialRequestIds.bind(controller));
// Obra das FDs por orçamento (detalhes da OS em Contratos) — só leitura.
router.get('/obras-por-orcamento', controller.obrasPorOrcamento.bind(controller));
router.get(
  '/by-material-request/:materialRequestId',
  controller.getFdAssociationByMaterialRequest.bind(controller)
);
// Resumo dos itens já pedidos da FD (RM, OC e IdMov TOTVS) — só leitura.
router.get('/:id/pedidos-resumo', controller.getPedidosResumo.bind(controller));
// Custo real dos itens da FD a partir das OCs enviadas ao TOTVS — só leitura.
router.get('/:id/custos-reais', controller.getCustosReais.bind(controller));
// Nome do orçamento que gerou a FD — só leitura.
router.get('/:id/orcamento', controller.getOrcamentoDaFd.bind(controller));
router.get(
  '/aprovadas-compras',
  requireModuleAccess(fdsAprovadasModule),
  controller.listApprovedForPurchasing.bind(controller)
);
router.get('/aprovacoes', requireFdApproverAccess, controller.getManagerApprovals.bind(controller));

const anexoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

router.post(
  '/upload-attachment',
  requireAnyModuleAccess([fdModule, fdsAprovadasModule]),
  (req, res, next) => {
    anexoUpload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            message: 'Arquivo grande demais (máx. 200 MB).',
          });
          return;
        }
        res.status(400).json({ success: false, message: err.message || 'Erro no upload.' });
        return;
      }
      if (err) return next(err);
      return next();
    });
  },
  controller.uploadDraftAttachment.bind(controller)
);

router.post(
  '/:id/material-request',
  requireAnyModuleAccess([fdModule, fdsAprovadasModule]),
  controller.createMaterialRequestFromFd.bind(controller)
);

router.patch(
  '/:id/purchase-status',
  requireModuleAccess(fdsAprovadasModule),
  controller.updatePurchaseStatus.bind(controller)
);
// Espelho do custo real da aba Ficha de demanda (acesso conferido no controller).
router.patch('/:id/custo-real', controller.updateCustoReal.bind(controller));
router.patch(
  '/:id/supplies-edit',
  requireModuleAccess(fdsAprovadasModule),
  controller.updateBySupplies.bind(controller)
);
router.patch(
  '/:id/purchase-refs',
  requireModuleAccess(fdsAprovadasModule),
  controller.updatePurchaseRefs.bind(controller)
);
router.delete(
  '/:id/anexos/:anexoId',
  requireModuleAccess(fdsAprovadasModule),
  controller.removeAnexo.bind(controller)
);
router.patch(
  '/:id/contract-obra',
  requireAnyModuleAccess([fdModule, fdsAprovadasModule]),
  controller.updateContractObra.bind(controller)
);
router.patch(
  '/:id/ficha-demanda-pct',
  requireModuleAccess(fdsAprovadasModule),
  controller.updateFichaDemandaPct.bind(controller)
);
router.patch(
  '/:id/encerrar-pedidos',
  requireModuleAccess(fdsAprovadasModule),
  controller.encerrarPedidos.bind(controller)
);
router.patch(
  '/:id/reabrir-pedidos',
  controller.reabrirPedidos.bind(controller)
);

router.get(
  '/:id',
  requireAnyModuleAccess([fdModule, fdsAprovadasModule]),
  controller.getById.bind(controller)
);

router.post(
  '/:id/anexos',
  requireAnyModuleAccess([fdModule, fdsAprovadasModule]),
  (req, res, next) => {
    anexoUpload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            success: false,
            message: 'Arquivo grande demais (máx. 200 MB).',
          });
          return;
        }
        res.status(400).json({ success: false, message: err.message || 'Erro no upload.' });
        return;
      }
      if (err) return next(err);
      return next();
    });
  },
  controller.uploadAnexo.bind(controller)
);

router.patch('/:id', requireModuleAccess(fdModule), controller.update.bind(controller));
router.delete('/:id', requireModuleAccess(fdModule), controller.remove.bind(controller));
router.put('/:id/manager-approve', requireFdApproverAccess, controller.approveManager.bind(controller));
router.put('/:id/manager-reject', requireFdApproverAccess, controller.rejectManager.bind(controller));

export default router;
