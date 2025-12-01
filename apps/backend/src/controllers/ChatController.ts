import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { ChatService } from '../services/ChatService';
import multer from 'multer';

const prisma = new PrismaClient();
const chatService = new ChatService();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  }
});

export class ChatController {
  /**
   * Cria um novo chat
   */
  async createChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { recipientDepartment, initialMessage } = req.body;

      if (!recipientDepartment || !initialMessage) {
        throw createError('Setor destinatário e mensagem inicial são obrigatórios', 400);
      }

      const attachments: any[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          const uploadResult = await chatService.uploadFile(file, userId);
          attachments.push({
            fileName: file.originalname,
            fileUrl: uploadResult.url,
            fileKey: uploadResult.key,
            fileSize: uploadResult.size,
            mimeType: uploadResult.mimeType
          });
        }
      }

      const chat = await chatService.createChat({
        initiatorId: userId,
        recipientDepartment,
        initialMessage,
        attachments
      });

      res.json({
        success: true,
        message: 'Chat criado com sucesso',
        data: chat
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Aceita um chat pendente
   */
  async acceptChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const chat = await chatService.acceptChat(id, userId);

      res.json({
        success: true,
        message: 'Chat aceito com sucesso',
        data: chat
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Rejeita um chat
   */
  async rejectChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.rejectChat(id, userId);

      res.json({
        success: true,
        message: 'Chat rejeitado'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Deleta uma conversa
   */
  async deleteChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.deleteChat(id, userId);

      res.json({
        success: true,
        message: 'Conversa deletada com sucesso'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Envia mensagem em um chat
   */
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { chatId, content } = req.body;

      if (!chatId || !content) {
        throw createError('ID do chat e conteúdo são obrigatórios', 400);
      }

      const attachments: any[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          const uploadResult = await chatService.uploadFile(file, userId);
          attachments.push({
            fileName: file.originalname,
            fileUrl: uploadResult.url,
            fileKey: uploadResult.key,
            fileSize: uploadResult.size,
            mimeType: uploadResult.mimeType
          });
        }
      }

      const message = await chatService.sendMessage({
        chatId,
        senderId: userId,
        content,
        attachments
      });

      res.json({
        success: true,
        message: 'Mensagem enviada',
        data: message
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista chats pendentes
   */
  async getPendingChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employee: true }
      });

      if (!user?.employee) {
        throw createError('Usuário não possui departamento', 400);
      }

      const chats = await chatService.getPendingChats(user.employee.department);

      res.json({
        success: true,
        data: chats
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista chats ativos
   */
  async getActiveChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const chats = await chatService.getActiveChats(userId);

      res.json({
        success: true,
        data: chats
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista chats encerrados
   */
  async getClosedChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const chats = await chatService.getClosedChats(userId);

      res.json({
        success: true,
        data: chats
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Obtém um chat específico
   */
  async getChatById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      if (!id) {
        throw createError('ID do chat é obrigatório', 400);
      }

      const chat = await chatService.getChatById(id, userId);

      res.json({
        success: true,
        data: chat
      });
    } catch (error: any) {
      console.error('Erro em getChatById controller:', {
        userId: req.user?.id,
        chatId: req.params?.id,
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Marca mensagens como lidas
   */
  async markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.markMessagesAsRead(id, userId);

      res.json({
        success: true,
        message: 'Mensagens marcadas como lidas'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Encerra um chat
   */
  async closeChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.closeChat(id, userId);

      res.json({
        success: true,
        message: 'Chat encerrado'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Conta chats pendentes
   */
  async getPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employee: true }
      });

      if (!user?.employee) {
        throw createError('Usuário não possui departamento', 400);
      }

      const count = await chatService.getPendingChatsCount(user.employee.department);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Conta mensagens não lidas
   */
  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const count = await chatService.getUnreadMessagesCount(userId);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error: any) {
      next(error);
    }
  }

  static uploadFiles() {
    return upload.array('attachments', 5);
  }
}

