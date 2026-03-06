import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { OrcamentoController } from '../controllers/OrcamentoController';

const router = Router();
const controller = new OrcamentoController();

router.use(authenticate);

router.get('/composicoes/geral', (req, res, next) => controller.getComposicoesGeral(req as any, res, next));
router.put('/composicoes/geral', (req, res, next) => controller.saveComposicoesGeral(req as any, res, next));
router.get('/:centroCustoId', (req, res, next) => controller.get(req as any, res, next));
router.put('/:centroCustoId', (req, res, next) => controller.save(req as any, res, next));

export default router;
