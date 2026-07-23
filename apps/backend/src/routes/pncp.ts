import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { PncpController } from '../controllers/PncpController';

const router = Router();
const ctrl = new PncpController();

router.use(authenticate);

router.get('/modalidades', (req, res) => ctrl.listModalidades(req, res));
router.get('/contratacoes', (req, res, next) => ctrl.listContratacoes(req, res, next));

export default router;
