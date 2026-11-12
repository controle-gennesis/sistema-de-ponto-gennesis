import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { ContractRegistryController } from '../controllers/ContractRegistryController';

const router = Router();
const controller = new ContractRegistryController();

router.use(authenticate);
router.use(requireModuleAccess(pathToModuleKey('/ponto/controle-contratos')));

router.get('/', (req, res, next) => controller.list(req, res, next));
router.get('/art-options', (req, res, next) => controller.artOptions(req, res, next));
router.post('/pdf', (req, res, next) => controller.pdf(req, res, next));
router.post('/:id/tap-pdf', (req, res, next) => controller.tapPdf(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.post('/:id/addenda', (req, res, next) => controller.addAddendum(req, res, next));
router.post('/:id/cats', (req, res, next) => controller.addCat(req, res, next));
router.patch('/:id/cats/:catId', (req, res, next) => controller.updateCat(req, res, next));
router.delete('/:id/cats/:catId', (req, res, next) => controller.removeCat(req, res, next));
router.post('/:id/loose-arts', (req, res, next) => controller.addLooseArt(req, res, next));
router.patch('/:id/loose-arts/:looseArtId', (req, res, next) => controller.updateLooseArt(req, res, next));
router.delete('/:id/loose-arts/:looseArtId', (req, res, next) => controller.removeLooseArt(req, res, next));
router.patch('/:id/addenda/:addendumId', (req, res, next) => controller.updateAddendum(req, res, next));
router.delete('/:id/addenda/:addendumId', (req, res, next) => controller.removeAddendum(req, res, next));
router.delete('/:id', (req, res, next) => controller.remove(req, res, next));

export default router;
