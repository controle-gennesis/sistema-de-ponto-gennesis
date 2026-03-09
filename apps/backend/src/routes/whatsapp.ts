import { Router } from 'express';
import { WhatsAppController } from '../controllers/WhatsAppController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const controller = new WhatsAppController();

// Webhook PÚBLICO - Evolution API chama sem autenticação (antes do authenticate)
router.post('/webhook', (req, res, next) => controller.handleWebhook(req, res, next));

router.use(authenticate);
router.use(requireRole(['EMPLOYEE'])); // Apenas quem tem role EMPLOYEE (inclui admin, DP etc.) vê as conversas

router.get('/conversations', (req, res, next) =>
  controller.listConversations(req as any, res, next)
);

router.get('/conversations/:id', (req, res, next) =>
  controller.getConversation(req as any, res, next)
);

export default router;
