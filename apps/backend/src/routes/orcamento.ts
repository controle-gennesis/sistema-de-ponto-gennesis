import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { OrcamentoController } from '../controllers/OrcamentoController';
import { userCanAccessOrcamentoCostCenter } from '../lib/orcamentoAcesso';

const router = Router();
const controller = new OrcamentoController();

router.use(authenticate);

// Toda rota com centro de custo: só administrador ou quem tem contrato Liberado nesse centro de custo.
router.param('centroCustoId', async (req: AuthRequest, _res: Response, next: NextFunction, centroCustoId: string) => {
  try {
    if (!req.user) return next(createError('Usuário não autenticado', 401));
    const ok = await userCanAccessOrcamentoCostCenter(req.user.id, req.user.isAdmin, String(centroCustoId || ''));
    if (!ok) return next(createError('Você não tem acesso aos orçamentos deste contrato.', 403));
    next();
  } catch (error) {
    next(error);
  }
});

const uploadMapaCotacao = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** Print/imagem de uma proposta do Mapa de Cotação (composições próprias com "COMP. COTAÇÃO"). */
router.post(
  '/mapa-cotacao/anexo',
  (req: AuthRequest, res: Response, next: NextFunction) => {
    uploadMapaCotacao.single('file')(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Erro no upload' });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) throw createError('Selecione uma imagem', 400);
      if (!/^image\//i.test(req.file.mimetype || '')) throw createError('Envie um arquivo de imagem', 400);
      const saved = await savePersistentUpload({
        folder: 'orcamento/mapa-cotacao',
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      res.json({
        success: true,
        data: { url: saved.url, name: req.file.originalname || saved.fileName, mimeType: req.file.mimetype },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/composicoes/geral', (req, res, next) => controller.getComposicoesGeral(req as any, res, next));
router.put('/composicoes/geral', (req, res, next) => controller.saveComposicoesGeral(req as any, res, next));

router.post('/:centroCustoId/orcamentos', (req, res, next) => controller.createOrcamento(req as any, res, next));
router.post('/:centroCustoId/orcamentos/:orcamentoId/versoes', (req, res, next) =>
  controller.createVersao(req as any, res, next)
);
router.post('/:centroCustoId/orcamentos/:orcamentoId/destrancar', (req, res, next) =>
  controller.destrancarOrcamento(req as any, res, next)
);
router.patch('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.renameOrcamento(req as any, res, next)
);
router.get('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.getOrcamento(req as any, res, next)
);
router.put('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.saveOrcamento(req as any, res, next)
);
router.post('/:centroCustoId/orcamentos/:orcamentoId/cronograma/gerar-sub-servicos', (req, res, next) =>
  controller.gerarSubServicosCronograma(req as any, res, next)
);
router.post('/:centroCustoId/orcamentos/:orcamentoId/cronograma/estimar-prazos', (req, res, next) =>
  controller.estimarPrazosCronograma(req as any, res, next)
);
router.delete('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.deleteOrcamento(req as any, res, next)
);

router.get('/:centroCustoId/servicos-padrao', (req, res, next) =>
  controller.getServicosPadrao(req as any, res, next)
);
router.put('/:centroCustoId/servicos-padrao', (req, res, next) =>
  controller.saveServicosPadrao(req as any, res, next)
);

router.get('/:centroCustoId', (req, res, next) => controller.getList(req as any, res, next));
router.put('/:centroCustoId', (req, res, next) => controller.save(req as any, res, next));

export default router;
