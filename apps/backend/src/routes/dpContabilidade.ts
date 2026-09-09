import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireDpContabilidadeAccess } from '../lib/dpContabilidadeAccess';
import { DpContabilidadeController } from '../controllers/DpContabilidadeController';

const router = Router();
const controller = new DpContabilidadeController();

router.use(authenticate);
router.use(requireDpContabilidadeAccess);

router.get('/', controller.list.bind(controller));
router.post('/', controller.create.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.post('/:id/comments', controller.addComment.bind(controller));
router.put('/:id/status', controller.updateStatus.bind(controller));

export default router;
