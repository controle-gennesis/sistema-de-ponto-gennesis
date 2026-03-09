import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { evolutionApi } from './EvolutionApiService';

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

    let reply = '';
    let newStatus = flowStatus;
    const newPayload = { ...payload };

    switch (flowStatus) {
      case 'MENU': {
        if (content === '1' || content.includes('atestado')) {
          newStatus = 'ASK_NAME';
          reply =
            '📋 *Envio de Atestado*\n\nPara começar, qual é o seu *nome completo*?';
          newPayload.flow = 'ATESTADO';
        } else if (content === '2' || content.includes('dúvida') || content.includes('duvida')) {
          newStatus = 'DUVIDAS';
          reply =
            '💬 Em breve teremos atendimento para dúvidas. Por enquanto, escolha a opção 1 para enviar atestado ou volte ao menu digitando *voltar*.';
        } else {
          reply = this.getMenuMessage();
        }
        break;
      }

      case 'ASK_NAME': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          reply = this.getMenuMessage();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content) {
          newPayload.name = text.trim();
          newStatus = 'ASK_REGISTRATION';
          reply =
            `Obrigado, ${newPayload.name}! Qual é a sua *matrícula* ou *CPF*? (para identificarmos no sistema)\n\nSe não souber, digite *pular* para continuar.`;
        } else {
          reply = 'Por favor, informe seu *nome completo*.';
        }
        break;
      }

      case 'ASK_REGISTRATION': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          reply = this.getMenuMessage();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else {
          newPayload.registration = content === 'pular' ? null : text.trim();
          newStatus = 'ATESTADO_ASK_TYPE';
          reply =
            'Qual o *tipo de atestado*?\n\n' +
            Object.entries(ATESTADO_LABELS)
              .map(([k, v]) => `${k} - ${v}`)
              .join('\n');
        }
        break;
      }

      case 'ATESTADO_ASK_TYPE': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          reply = this.getMenuMessage();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (ATESTADO_TYPES[content]) {
          newPayload.atestadoType = ATESTADO_TYPES[content];
          newPayload.atestadoTypeLabel = ATESTADO_LABELS[content];
          newStatus = 'ATESTADO_ASK_DATES';
          reply =
            'Informe as *datas do atestado* no formato:\n\n`Data início - Data fim`\n\nExemplo: 01/03/2025 - 05/03/2025';
        } else {
          reply =
            'Opção inválida. Escolha um número de 1 a 6:\n\n' +
            Object.entries(ATESTADO_LABELS)
              .map(([k, v]) => `${k} - ${v}`)
              .join('\n');
        }
        break;
      }

      case 'ATESTADO_ASK_DATES': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          reply = this.getMenuMessage();
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content && content.includes('-')) {
          const [start, end] = content.split('-').map((s) => s.trim());
          newPayload.dataInicio = start;
          newPayload.dataFim = end;
          newStatus = 'ATESTADO_ASK_FILE';
          reply =
            'Agora *envie a foto ou o PDF do atestado*.\n\nClique no ícone de anexo (📎) e escolha a imagem ou documento.';
        } else {
          reply =
            'Use o formato: *Data início - Data fim*\n\nExemplo: 01/03/2025 - 05/03/2025';
        }
        break;
      }

      case 'ATESTADO_ASK_FILE': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          reply = this.getMenuMessage();
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
          reply =
            '✅ *Atestado recebido!*\n\nSua solicitação foi registrada e será analisada pelo departamento pessoal. Você pode acompanhar pelo sistema.\n\nDigite *menu* para novas opções.';
          Object.keys(newPayload).forEach((k) => delete newPayload[k]);
        } else if (content) {
          reply =
            'Por favor, *envie a foto ou o PDF do atestado*.\n\nClique no ícone de anexo (📎) e selecione o arquivo.';
        } else {
          reply =
            'Clique no ícone de anexo (📎) e envie a imagem ou documento do atestado.';
        }
        break;
      }

      case 'DUVIDAS': {
        if (content === 'voltar' || content === 'menu') {
          newStatus = 'MENU';
          reply = this.getMenuMessage();
        } else {
          reply =
            'Em breve teremos atendimento para dúvidas. Digite *menu* para voltar.';
        }
        break;
      }

      default:
        newStatus = 'MENU';
        reply = this.getMenuMessage();
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
        content: reply
      }
    });

    await evolutionApi.sendText(phone, reply);
  }

  private getMenuMessage(): string {
    return (
      '👋 *Olá! Sou o assistente da Gennesis Engenharia.*\n\n' +
      'Como posso ajudar?\n\n' +
      '1️⃣ - Enviar atestado médico\n' +
      '2️⃣ - Tirar dúvidas\n\n' +
      'Digite o número da opção desejada.'
    );
  }
}

export const whatsAppBot = new WhatsAppBotService();
