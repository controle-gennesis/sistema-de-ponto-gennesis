import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { FinancialControlController } from '../controllers/FinancialControlController';

const router = Router();
const controller = new FinancialControlController();

router.use(authenticate);

router.get('/months', (req, res, next) => controller.getMonths(req, res, next));
router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.post(
  '/import',
  uploadImport.single('file'),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    controller.importSpreadsheet(req, res, next)
);
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
