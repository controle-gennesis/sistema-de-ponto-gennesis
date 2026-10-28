import { NextFunction, Request, Response, Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { BoletoControlController } from '../controllers/BoletoControlController';

const router = Router();
const controller = new BoletoControlController();

router.use(authenticate);
router.use(requireModuleAccess(pathToModuleKey('/ponto/financeiro/controle-boletos')));

router.get('/options', (req, res, next) => controller.options(req, res, next));
router.get('/dashboard', (req, res, next) => controller.dashboard(req, res, next));
router.get('/managers', (req, res, next) => controller.listManagers(req, res, next));
router.put('/managers', (req, res, next) => controller.upsertManager(req, res, next));
router.delete('/managers/:id', (req, res, next) => controller.removeManager(req, res, next));
router.get('/export', (req, res, next) => controller.exportSpreadsheet(req, res, next));
router.get('/', (req, res, next) => controller.list(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.post(
  '/import',
  uploadImport.single('file'),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) => controller.importSpreadsheet(req, res, next)
);
router.patch('/:id/technical-confirm', (req, res, next) => controller.confirmTechnical(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.remove(req, res, next));

export default router;
