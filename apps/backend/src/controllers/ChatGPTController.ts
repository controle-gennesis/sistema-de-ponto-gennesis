import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

interface ChatGPTMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ChatGPTController {
  /**
   * Envia uma mensagem para o ChatGPT e retorna a resposta
   */
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { message, conversationId } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        throw createError('Mensagem é obrigatória', 400);
      }

      // Verificar se a API key do OpenAI está configurada
      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw createError('API do ChatGPT não configurada. Entre em contato com o administrador.', 500);
      }

      // Buscar ou criar conversa
      let conversation;
      if (conversationId) {
        conversation = await prisma.chatGPTConversation.findUnique({
          where: { id: conversationId, userId },
          include: { messages: { orderBy: { createdAt: 'asc' } } }
        });

        if (!conversation) {
          throw createError('Conversa não encontrada', 404);
        }
      } else {
        // Criar nova conversa
        conversation = await prisma.chatGPTConversation.create({
          data: {
            userId,
            title: message.substring(0, 50) + (message.length > 50 ? '...' : '')
          },
          include: { messages: true }
        });
      }

      // Construir histórico de mensagens para o contexto
      const messages: ChatGPTMessage[] = [
        {
          role: 'system',
          content: 'Você é um assistente virtual especializado em ajudar funcionários de uma empresa de engenharia com dúvidas sobre o sistema de controle de ponto, folha de pagamento, férias, banco de horas e outros processos internos. Seja prestativo, claro e objetivo nas respostas.'
        }
      ];

      // Adicionar mensagens anteriores para contexto
      if (conversation.messages.length > 0) {
        conversation.messages.forEach(msg => {
          messages.push({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          });
        });
      }

      // Adicionar a nova mensagem do usuário
      messages.push({
        role: 'user',
        content: message.trim()
      });

      // Salvar mensagem do usuário no banco
      await prisma.chatGPTMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message.trim()
        }
      });

      // Chamar API do OpenAI
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json().catch(() => ({}));
        console.error('Erro na API do OpenAI:', errorData);
        throw createError('Erro ao processar mensagem com ChatGPT. Tente novamente.', 500);
      }

      const data = await openaiResponse.json();
      const assistantMessage = data.choices?.[0]?.message?.content;

      if (!assistantMessage) {
        throw createError('Resposta inválida do ChatGPT', 500);
      }

      // Salvar resposta do assistente no banco
      await prisma.chatGPTMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantMessage
        }
      });

      // Atualizar título da conversa se for a primeira mensagem
      const messageCount = await prisma.chatGPTMessage.count({
        where: { conversationId: conversation.id }
      });
      
      if (messageCount === 2) { // 1 user + 1 assistant = primeira troca completa
        await prisma.chatGPTConversation.update({
          where: { id: conversation.id },
          data: {
            title: message.substring(0, 50) + (message.length > 50 ? '...' : '')
          }
        });
      }

      return res.json({
        success: true,
        data: {
          conversationId: conversation.id,
          message: assistantMessage,
          role: 'assistant'
        }
      });
    } catch (error: any) {
      return next(error);
    }
  }

  /**
   * Obtém o histórico de conversas do usuário
   */
  async getHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const conversations = await prisma.chatGPTConversation.findMany({
        where: { userId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 1 // Apenas a primeira mensagem para preview
          },
          _count: {
            select: { messages: true }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: 50
      });

      return res.json({
        success: true,
        data: conversations.map(conv => ({
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: conv._count.messages,
          lastMessage: conv.messages[0]?.content || ''
        }))
      });
    } catch (error: any) {
      return next(error);
    }
  }

  /**
   * Limpa o histórico de conversas do usuário
   */
  async clearHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { conversationId } = req.body;

      if (conversationId) {
        // Deletar conversa específica
        await prisma.chatGPTConversation.deleteMany({
          where: { id: conversationId, userId }
        });
      } else {
        // Deletar todas as conversas do usuário
        await prisma.chatGPTConversation.deleteMany({
          where: { userId }
        });
      }

      return res.json({
        success: true,
        message: conversationId ? 'Conversa deletada com sucesso' : 'Histórico limpo com sucesso'
      });
    } catch (error: any) {
      return next(error);
    }
  }
}
