import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ObraController } from '../controllers/ObraController';

const router = Router();
const controller = new ObraController();

router.use(authenticate);

router.get('/', (req, res, next) => controller.getAll(req as any, res as any, next));
router.post('/import', (req, res, next) => controller.importMany(req as any, res as any, next));
router.get('/:id', (req, res, next) => controller.getById(req as any, res as any, next));
router.post('/', (req, res, next) => controller.create(req as any, res as any, next));
router.patch('/:id', (req, res, next) => controller.update(req as any, res as any, next));
router.delete('/:id', (req, res, next) => controller.delete(req as any, res as any, next));

export default router;
