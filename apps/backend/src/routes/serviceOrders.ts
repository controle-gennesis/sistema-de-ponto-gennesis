import { Router } from 'express';
import { ServiceOrderController } from '../controllers/ServiceOrderController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new ServiceOrderController();

router.use(authenticate);

router.get('/', (req, res, next) => controller.list(req, res, next));

export default router;
