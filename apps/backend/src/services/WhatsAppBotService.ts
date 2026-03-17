import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { metaWhatsApp } from './MetaWhatsAppService';

type FlowStatus =
  | 'MENU'
  | 'ASK_NAME'
  | 'ASK_REGISTRATION'
  | 'ATESTADO_ASK_TYPE'
  | 'ATESTADO_ASK_DATES'
  | 'ATESTADO_ASK_FILE'
  | 'ATESTADO_COMPLETE'
  | 'DUVIDAS';

const ATESTADO_TYPES: Record<string, string> = {
  '1': 'MEDICAL',
  '2': 'DENTAL',
  '3': 'PREVENTIVE',
  '4': 'ACCIDENT',
  '5': 'COVID',
  '6': 'OTHER'
};

const ATESTADO_LABELS: Record<string, string> = {
  '1': 'Atestado médico',
  '2': 'Atestado odontológico',
  '3': 'Exame preventivo',
  '4': 'Acidente de trabalho',
  '5': 'COVID-19',
  '6': 'Outros'
};

/** Delay curto (API oficial) — rápido sem parecer “instantâneo” */
const delayNatural = () =>
  new Promise((r) => setTimeout(r, 600 + Math.random() * 700));

/** Escolhe uma opção aleatória de um array */
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

type SendAction =
  | { type: 'text'; text: string }
  | { type: 'buttons'; body: string; buttons: Array<{ id: string; title: string }> }
  | {
      type: 'list';
      body: string;
      buttonText: string;
      sectionTitle: string;
      rows: Array<{ id: string; title: string }>;
    };

export class WhatsAppBotService {
  async processMessage(phone: string, text: string, hasMedia = false): Promise<void> {
    let conversation = await prisma.whatsAppConversation.findUnique({
      where: { phone }
    });

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          phone,
          flowStatus: 'MENU',
          payload: {}
        }
      });
    }

    const payload = (conversation.payload as Record<string, unknown>) || {};
    const content = (text || '').trim().toLowerCase();
    const flowStatus = (conversation.flowStatus || 'MENU') as FlowStatus;

    // Salvar mensagem do usuário
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: hasMedia ? '[Arquivo enviado]' : (text || '[sem texto]')
      }
    });

    let sendAction: SendAction = { type: 'text', text: '' };
    let newStatus = flowStatus;
    const newPayload = { ...payload };

    const menu = (): SendAction => ({
      type: 'buttons',
      body: pick([
        'Olá! Como posso te ajudar hoje?',
        'Oi! Em que posso ajudar?'
      ]),
      buttons: [
        { id: 'ATESTADO', title: 'Enviar atestado' },
        { id: 'DUVIDAS', title: 'Dúvidas' }
      ]
    });

    const tipoAtestado = (): SendAction => ({
      type: 'list',
      body: 'Qual o tipo de atestado?',
      buttonText: 'Escolher',
      sectionTitle: 'Opções',
      rows: Object.entries(ATESTADO_LABELS).map(([k, v]) => ({ id: `TYPE_${k}`, title: v }))
    });

    switch (flowStatus) {
      case 'MENU': {
        if (content === '1' || content.includes('atestado') || content === 'atestato' || content === 'atestados' || content === 'atest' || content === 'atestado' || content === 'atestados' || content === 'atest') {
          newStatus = 'ASK_NAME';
          sendAction = { type: 'text', text: 'Perfeito. Qual seu nome completo?' };
          newPayload.flow = 'ATESTADO';
        } else if (content === '2' || content.includes('dúvida') || content.includes('duvida')) {
          newStatus = 'DUVIDAS';
          sendAction = {
            type: 'buttons',
            body: 'Ainda não temos atendimento de dúvidas aqui. Quer enviar um atestado?',
            buttons: [
              { id: 'ATESTADO', title: 'Enviar atestado' },
              { id: 'MENU', title: 'Voltar' }
            ]
          };
        } else {
          // Preferir botões
          if (content === 'atestato' || content === 'ATESTADO') {
            newStatus = 'ASK_NAME';
            newPayload.flow = 'ATESTADO';
            sendAction = { type: 'text', text: 'Perfeito. Qual seu nome completo?' };
          } else if (content === 'duvidas' || content === 'DUVIDAS') {
            newStatus = 'DUVIDAS';
            sendAction = {
              type: 'buttons',
              body: 'Ainda não temos atendimento de dúvidas aqui. Quer enviar um atestado?',
              buttons: [
                { id: 'ATESTADO', title: 'Enviar atestado' },
                { id: 'MENU', title: 'Voltar' }
              ]
            };
          } else {
            sendAction = menu();
          }
        }
        break;
      }

      case 'ASK_NAME': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          sendAction = menu();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content) {
          newPayload.name = text.trim();
          newStatus = 'ASK_REGISTRATION';
          const nome = String(newPayload.name || '').trim();
          sendAction = {
            type: 'buttons',
            body: `Obrigado, ${nome}! Você prefere informar matrícula/CPF agora?`,
            buttons: [
              { id: 'REG_OK', title: 'Sim' },
              { id: 'REG_SKIP', title: 'Pular' }
            ]
          };
        } else {
          sendAction = { type: 'text', text: 'Pode me dizer seu nome completo?' };
        }
        break;
      }

      case 'ASK_REGISTRATION': {
        if (content === 'voltar' || content === 'menu' || content === 'MENU') {
          newStatus = 'MENU';
          sendAction = menu();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content === 'reg_ok' || content === 'REG_OK') {
          sendAction = { type: 'text', text: 'Me envie sua matrícula ou CPF.' };
        } else if (content === 'reg_skip' || content === 'REG_SKIP' || content === 'pular') {
          newPayload.registration = null;
          newStatus = 'ATESTADO_ASK_TYPE';
          sendAction = tipoAtestado();
        } else {
          // usuário digitou matrícula/CPF
          newPayload.registration = text.trim();
          newStatus = 'ATESTADO_ASK_TYPE';
          sendAction = tipoAtestado();
        }
        break;
      }

      case 'ATESTADO_ASK_TYPE': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          sendAction = menu();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content.startsWith('type_')) {
          const key = content.replace('type_', '').trim();
          if (ATESTADO_TYPES[key]) {
            newPayload.atestadoType = ATESTADO_TYPES[key];
            newPayload.atestadoTypeLabel = ATESTADO_LABELS[key];
            newStatus = 'ATESTADO_ASK_DATES';
            sendAction = {
              type: 'text',
              text: 'Agora me diga o período do atestado.\nEx.: 01/03/2026 - 05/03/2026'
            };
          } else {
            sendAction = tipoAtestado();
          }
        } else {
          // fallback (usuário digitou 1..6)
          if (ATESTADO_TYPES[content]) {
            newPayload.atestadoType = ATESTADO_TYPES[content];
            newPayload.atestadoTypeLabel = ATESTADO_LABELS[content];
            newStatus = 'ATESTADO_ASK_DATES';
            sendAction = {
              type: 'text',
              text: 'Agora me diga o período do atestado.\nEx.: 01/03/2026 - 05/03/2026'
            };
          } else {
            sendAction = tipoAtestado();
          }
        }
        break;
      }

      case 'ATESTADO_ASK_DATES': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          sendAction = menu();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content && content.includes('-')) {
          const [start, end] = content.split('-').map((s) => s.trim());
          newPayload.dataInicio = start;
          newPayload.dataFim = end;
          newStatus = 'ATESTADO_ASK_FILE';
          sendAction = {
            type: 'text',
            text: 'Perfeito. Agora envie a foto ou PDF do atestado (📎).'
          };
        } else {
          sendAction = {
            type: 'text',
            text: 'Me envie no formato: 01/03/2026 - 05/03/2026'
          };
        }
        break;
      }

      case 'ATESTADO_ASK_FILE': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          sendAction = menu();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (hasMedia) {
          // Recebeu arquivo (imagem/documento) - criamos o submission
          newPayload.fileReceived = true;
          newPayload.fileNote = 'Arquivo enviado pelo usuário (visualizar na conversa)';

          await prisma.whatsAppSubmission.create({
            data: {
              conversationId: conversation.id,
              type: 'MEDICAL_CERTIFICATE',
              payload: newPayload as Prisma.InputJsonValue,
              status: 'PENDING',
              fileName: 'arquivo_enviado_whatsapp'
            }
          });

          newStatus = 'MENU';
          sendAction = {
            type: 'buttons',
            body: '✅ Recebido! Seu atestado foi registrado e o DP vai analisar.',
            buttons: [{ id: 'MENU', title: 'Ver opções' }]
          };
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content) {
          sendAction = { type: 'text', text: 'Me envie a foto ou PDF do atestado (📎).' };
        } else {
          sendAction = { type: 'text', text: 'Envie a foto ou PDF do atestado (📎).' };
        }
        break;
      }

      case 'DUVIDAS': {
        if (content === 'voltar' || content === 'menu' || content === 'MENU') {
          newStatus = 'MENU';
          sendAction = menu();
        } else {
          sendAction = {
            type: 'buttons',
            body: 'Ainda não temos dúvidas por aqui. Quer enviar um atestado?',
            buttons: [
              { id: 'ATESTADO', title: 'Enviar atestado' },
              { id: 'MENU', title: 'Voltar' }
            ]
          };
        }
        break;
      }

      default:
        newStatus = 'MENU';
        sendAction = menu();
    }

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        flowStatus: newStatus,
        currentStep: newStatus,
        payload: newPayload as Prisma.InputJsonValue,
        updatedAt: new Date()
      }
    });

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: sendAction.type === 'text' ? sendAction.text : sendAction.body
      }
    });

    await delayNatural();
    if (sendAction.type === 'text') {
      await metaWhatsApp.sendText(phone, sendAction.text);
    } else if (sendAction.type === 'buttons') {
      await metaWhatsApp.sendButtons(phone, sendAction.body, sendAction.buttons);
    } else {
      await metaWhatsApp.sendList(
        phone,
        sendAction.body,
        sendAction.buttonText,
        sendAction.sectionTitle,
        sendAction.rows
      );
    }
  }
}

export const whatsAppBot = new WhatsAppBotService();
