import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ExtratoCaixaController } from '../controllers/ExtratoCaixaController';

const router = Router();
const controller = new ExtratoCaixaController();

router.use(authenticate);
router.get('/', (req, res, next) => controller.list(req, res, next));

export default router;
