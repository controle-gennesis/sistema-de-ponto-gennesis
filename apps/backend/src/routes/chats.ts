import { Router } from 'express';
import { ChatController } from '../controllers/ChatController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const chatController = new ChatController();

router.use(authenticate);
router.use(requireRole(['EMPLOYEE']));

// Criar novo chat
router.post('/',
  ChatController.uploadFiles(),
  (req, res, next) => chatController.createChat(req, res, next)
);

// Aceitar chat
router.post('/:id/accept', (req, res, next) => 
  chatController.acceptChat(req, res, next)
);

// Rejeitar chat
router.delete('/:id/reject', (req, res, next) => 
  chatController.rejectChat(req, res, next)
);

// Deletar chat (iniciador ou destinatário)
router.delete('/:id', (req, res, next) => 
  chatController.deleteChat(req, res, next)
);

// Enviar mensagem (chatId vem no body)
router.post('/messages',
  ChatController.uploadFiles(),
  (req, res, next) => chatController.sendMessage(req, res, next)
);

// Listar chats pendentes
router.get('/pending', (req, res, next) => 
  chatController.getPendingChats(req, res, next)
);

// Listar chats ativos
router.get('/active', (req, res, next) => 
  chatController.getActiveChats(req, res, next)
);

// Listar chats encerrados
router.get('/closed', (req, res, next) => 
  chatController.getClosedChats(req, res, next)
);

// Obter chat específico
router.get('/:id', (req, res, next) => 
  chatController.getChatById(req, res, next)
);

// Marcar como lido
router.patch('/:id/read', (req, res, next) => 
  chatController.markAsRead(req, res, next)
);

// Encerrar chat
router.patch('/:id/close', (req, res, next) => 
  chatController.closeChat(req, res, next)
);

// Contagem de pendentes
router.get('/pending/count', (req, res, next) => 
  chatController.getPendingCount(req, res, next)
);

// Contagem de não lidas
router.get('/unread/count', (req, res, next) => 
  chatController.getUnreadCount(req, res, next)
);

export default router;

