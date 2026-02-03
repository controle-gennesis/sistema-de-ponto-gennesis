import { Router } from 'express';
import { ChatGPTController } from '../controllers/ChatGPTController';
import { authenticate } from '../middleware/auth';

const router = Router();
const chatGPTController = new ChatGPTController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Enviar mensagem para ChatGPT
router.post('/message', (req, res, next) => 
  chatGPTController.sendMessage(req, res, next)
);

// Obter histórico de conversas
router.get('/history', (req, res, next) => 
  chatGPTController.getHistory(req, res, next)
);

// Limpar histórico
router.delete('/history', (req, res, next) => 
  chatGPTController.clearHistory(req, res, next)
);

export default router;
