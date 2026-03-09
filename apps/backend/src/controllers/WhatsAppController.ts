import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { whatsAppBot } from '../services/WhatsAppBotService';

export class WhatsAppController {
  /**
   * Webhook público - recebe eventos da Evolution API (MESSAGES_UPSERT)
   */
  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(200).send('OK');

      const body = req.body || {};
      const event = (body.event || body.type || '').toLowerCase();

      if (!event.includes('message') && !event.includes('upsert')) {
        return;
      }

      const data = body.data || body;
      const key = data.key || {};
      const fromMe = !!key.fromMe;
      if (fromMe) return; // ignorar mensagens enviadas por nós

      const remoteJid = key.remoteJid || data.remoteJid || '';
      const phone = String(remoteJid).replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '') || '';

      if (!phone) return;

      let text = '';
      let hasMedia = false;

      const msg = data.message || body.message || {};
      if (typeof msg.conversation === 'string') {
        text = msg.conversation;
      } else if (msg.extendedTextMessage?.text) {
        text = msg.extendedTextMessage.text;
      } else if (msg.imageMessage) {
        hasMedia = true;
        text = msg.imageMessage.caption || '';
      } else if (msg.documentMessage) {
        hasMedia = true;
        text = msg.documentMessage.caption || '';
      }

      if (!text && !hasMedia) return;

      // Processar em background (não bloquear resposta do webhook)
      whatsAppBot.processMessage(phone, text || ' ', hasMedia).catch((err) => {
        console.error('[WhatsApp Webhook] Erro ao processar:', err);
      });
    } catch (error) {
      console.error('[WhatsApp Webhook] Erro:', error);
    }
  }
  /**
   * Listar conversas do WhatsApp (para o pessoal ver no sistema)
   */
  async listConversations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const conversations = await prisma.whatsAppConversation.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { messages: true, submissions: true }
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      const data = conversations.map((c) => ({
        id: c.id,
        phone: c.phone,
        flowStatus: c.flowStatus,
        currentStep: c.currentStep,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        messageCount: c._count.messages,
        submissionCount: c._count.submissions,
        lastMessage: c.messages[0]?.content?.substring(0, 80) || null,
        lastMessageAt: c.messages[0]?.createdAt || null
      }));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter uma conversa com todas as mensagens e envios (atestados etc.)
   */
  async getConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          },
          submissions: {
            orderBy: { createdAt: 'asc' }
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
          phone: conversation.phone,
          flowStatus: conversation.flowStatus,
          currentStep: conversation.currentStep,
          payload: conversation.payload,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messages: conversation.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            mediaUrl: m.mediaUrl,
            fileName: m.fileName,
            mimeType: m.mimeType,
            createdAt: m.createdAt
          })),
          submissions: conversation.submissions.map((s) => ({
            id: s.id,
            type: s.type,
            payload: s.payload,
            fileUrl: s.fileUrl,
            fileName: s.fileName,
            status: s.status,
            medicalCertificateId: s.medicalCertificateId,
            createdAt: s.createdAt
          }))
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
