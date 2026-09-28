import { Router } from 'express';
import { StockLocationController } from '../controllers/StockLocationController';
import { authenticate } from '../middleware/auth';

const router = Router();
const stockLocationController = new StockLocationController();

router.use(authenticate);

router.get('/', (req, res, next) => stockLocationController.getAll(req, res, next));
router.get('/:id', (req, res, next) => stockLocationController.getById(req, res, next));
router.post('/', (req, res, next) => stockLocationController.create(req, res, next));
router.patch('/:id', (req, res, next) => stockLocationController.update(req, res, next));
router.delete('/:id', (req, res, next) => stockLocationController.delete(req, res, next));

export default router;
