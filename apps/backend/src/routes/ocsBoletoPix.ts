import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { OcsBoletoPixController } from '../controllers/OcsBoletoPixController';

const router = Router();
const controller = new OcsBoletoPixController();

router.use(authenticate);
router.use(authorize('EMPLOYEE'));

router.get('/', (req, res, next) => controller.list(req, res, next));
router.put('/extras', (req, res, next) => controller.upsertExtra(req, res, next));

export default router;
