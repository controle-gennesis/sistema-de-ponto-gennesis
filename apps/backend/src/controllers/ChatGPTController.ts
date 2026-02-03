import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class ChatGPTController {
  /**
   * Enviar mensagem para o assistente virtual
   */
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { message, conversationId } = req.body;

      if (!message || !message.trim()) {
        throw createError('Mensagem é obrigatória', 400);
      }

      let conversation;

      // Se não há conversationId, criar nova conversa
      if (!conversationId) {
        conversation = await prisma.chatGPTConversation.create({
          data: {
            userId,
            title: message.substring(0, 50) // Primeiros 50 caracteres como título
          }
        });
      } else {
        // Verificar se a conversa existe e pertence ao usuário
        conversation = await prisma.chatGPTConversation.findFirst({
          where: {
            id: conversationId,
            userId
          }
        });

        if (!conversation) {
          throw createError('Conversa não encontrada', 404);
        }
      }

      // Salvar mensagem do usuário
      await prisma.chatGPTMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message.trim()
        }
      });

      // Buscar histórico de mensagens da conversa
      const previousMessages = await prisma.chatGPTMessage.findMany({
        where: {
          conversationId: conversation.id
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Preparar contexto do sistema
      const systemContext = `Você é um assistente virtual do sistema de controle de ponto da Gennesis Engenharia. 
      Sua função é ajudar os funcionários com dúvidas sobre:
      - Como bater ponto no sistema
      - Como solicitar férias
      - Como funciona o banco de horas
      - Como consultar folha de pagamento
      - Como registrar atestados médicos
      - Horários de trabalho
      - Outros processos internos da empresa
      
      Seja sempre educado, objetivo e forneça informações úteis. Se não souber algo, seja honesto.`;

      // Preparar mensagens para o contexto (formato para API do OpenAI ou similar)
      const messagesForContext = [
        { role: 'system', content: systemContext },
        ...previousMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      // Por enquanto, retornar uma resposta simples
      // TODO: Integrar com API do OpenAI ou outro serviço de IA
      let assistantResponse = '';
      
      const lowerMessage = message.toLowerCase();
      
      if (lowerMessage.includes('bater ponto') || lowerMessage.includes('ponto')) {
        assistantResponse = `Para bater ponto no sistema:
1. Acesse a página principal do sistema
2. Clique no botão "Bater Ponto"
3. Autorize o acesso à localização (se necessário)
4. Tire uma foto (se solicitado)
5. Confirme o registro

O sistema registra automaticamente a data e hora do seu ponto.`;
      } else if (lowerMessage.includes('férias') || lowerMessage.includes('ferias')) {
        assistantResponse = `Para solicitar férias:
1. Acesse o menu "Departamento Pessoal"
2. Vá em "Férias"
3. Clique em "Solicitar Férias"
4. Preencha as datas desejadas
5. Envie a solicitação

A solicitação será analisada pelo departamento pessoal.`;
      } else if (lowerMessage.includes('banco de horas') || lowerMessage.includes('banco horas')) {
        assistantResponse = `O banco de horas funciona assim:
- Horas extras trabalhadas são acumuladas no seu banco
- Você pode usar essas horas para compensar faltas ou sair mais cedo
- Acesse "Banco de Horas" no menu para consultar seu saldo
- O saldo é calculado automaticamente com base nos seus registros de ponto`;
      } else if (lowerMessage.includes('folha') || lowerMessage.includes('pagamento') || lowerMessage.includes('salário')) {
        assistantResponse = `Para consultar sua folha de pagamento:
1. Acesse o menu "Financeiro"
2. Clique em "Folha de Pagamento"
3. Selecione o mês e ano desejados
4. Visualize todos os detalhes da sua folha

A folha mostra salário base, descontos, adicionais e valores líquidos.`;
      } else if (lowerMessage.includes('atestado') || lowerMessage.includes('médico')) {
        assistantResponse = `Para registrar um atestado médico:
1. Acesse "Atestados" no menu
2. Clique em "Novo Atestado"
3. Faça upload do arquivo do atestado
4. Preencha as datas de validade
5. Envie para aprovação

O atestado será analisado pelo departamento pessoal.`;
      } else if (lowerMessage.includes('horário') || lowerMessage.includes('horario') || lowerMessage.includes('trabalho')) {
        assistantResponse = `Os horários de trabalho padrão são:
- Início: 07:00
- Fim: 17:00
- Almoço: 12:00 às 13:00

Esses horários podem variar conforme seu departamento. Consulte seu gestor para horários específicos.`;
      } else {
        assistantResponse = `Olá! Sou o assistente virtual da Gennesis Engenharia. 

Posso ajudar você com:
- Como bater ponto no sistema
- Como solicitar férias
- Como funciona o banco de horas
- Como consultar folha de pagamento
- Como registrar atestados
- Horários de trabalho

Faça uma pergunta específica e eu te ajudo!`;
      }

      // Salvar resposta do assistente
      await prisma.chatGPTMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: assistantResponse
        }
      });

      // Atualizar título da conversa se for a primeira mensagem
      if (previousMessages.length === 0) {
        await prisma.chatGPTConversation.update({
          where: { id: conversation.id },
          data: {
            title: message.substring(0, 50)
          }
        });
      }

      res.json({
        success: true,
        data: {
          message: assistantResponse,
          conversationId: conversation.id
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar histórico de conversas do usuário
   */
  async getHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const conversations = await prisma.chatGPTConversation.findMany({
        where: {
          userId
        },
        orderBy: {
          updatedAt: 'desc'
        },
        include: {
          _count: {
            select: {
              messages: true
            }
          },
          messages: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1 // Pegar apenas a última mensagem para preview
          }
        }
      });

      const formattedConversations = conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        messageCount: conv._count.messages,
        lastMessage: conv.messages[0]?.content || ''
      }));

      res.json({
        success: true,
        data: formattedConversations
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter mensagens de uma conversa específica
   */
  async getConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      const conversation = await prisma.chatGPTConversation.findFirst({
        where: {
          id,
          userId
        },
        include: {
          messages: {
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!conversation) {
        throw createError('Conversa não encontrada', 404);
      }

      res.json({
        success: true,
        data: {
          id: conversation.id,
          title: conversation.title,
          messages: conversation.messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar conversa
   */
  async deleteConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se a conversa pertence ao usuário
      const conversation = await prisma.chatGPTConversation.findFirst({
        where: {
          id,
          userId
        }
      });

      if (!conversation) {
        throw createError('Conversa não encontrada', 404);
      }

      // Deletar conversa (mensagens serão deletadas em cascade)
      await prisma.chatGPTConversation.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Conversa deletada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar todo o histórico de conversas do usuário
   */
  async deleteHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      // Deletar todas as conversas do usuário (mensagens serão deletadas em cascade)
      await prisma.chatGPTConversation.deleteMany({
        where: {
          userId
        }
      });

      res.json({
        success: true,
        message: 'Histórico deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}

