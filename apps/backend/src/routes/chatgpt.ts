import { Router } from 'express';
import { ChatGPTController } from '../controllers/ChatGPTController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const chatGPTController = new ChatGPTController();

router.use(authenticate);
router.use(requireRole(['EMPLOYEE']));

// Enviar mensagem para o assistente virtual
router.post('/message', (req, res, next) => 
  chatGPTController.sendMessage(req, res, next)
);

// Listar histórico de conversas
router.get('/history', (req, res, next) => 
  chatGPTController.getHistory(req, res, next)
);

// Obter mensagens de uma conversa específica
router.get('/conversation/:id', (req, res, next) => 
  chatGPTController.getConversation(req, res, next)
);

// Deletar conversa específica
router.delete('/conversation/:id', (req, res, next) => 
  chatGPTController.deleteConversation(req, res, next)
);

// Deletar todo o histórico
router.delete('/history', (req, res, next) => 
  chatGPTController.deleteHistory(req, res, next)
);

export default router;

