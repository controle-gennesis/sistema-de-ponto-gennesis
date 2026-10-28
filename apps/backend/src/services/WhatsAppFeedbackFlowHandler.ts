import {
  FEEDBACK_LIKE_OPTIONS,
  saveWhatsAppFeedbackComment,
  saveWhatsAppFeedbackLikes,
  saveWhatsAppFeedbackRating,
} from '../lib/appFeedbackRules';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppFeedbackFlowStatus =
  | 'FEEDBACK_INVITE'
  | 'FEEDBACK_RATING'
  | 'FEEDBACK_LIKES'
  | 'FEEDBACK_COMMENT';

const YES_WORDS = /^(sim|s|bora|vamos|ok|pode|claro|quero|feedback_sim)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|agora n[aã]o|agora nao|depois|finalize|finalizar|feedback_nao)$/i;
const SKIP_WORDS = /^(pular|pula|skip|nada|n[aã]o quero|feedback_pular)$/i;

export function isWhatsAppFeedbackFlowStatus(status: string): boolean {
  return status.startsWith('FEEDBACK_');
}

/** Convite enviado logo depois que a pessoa conclui um atendimento. */
export function feedbackInviteAction(): SendAction {
  return {
    type: 'buttons',
    body:
      'Antes de ir: posso te fazer 3 perguntinhas rápidas sobre o sistema? Leva menos de 1 minuto! 😊',
    buttons: [
      { id: 'FEEDBACK_SIM', title: 'Bora!' },
      { id: 'FEEDBACK_NAO', title: 'Agora não' },
    ],
  };
}

function ratingAction(): SendAction {
  return {
    type: 'list',
    body: 'Primeiro: de 1 a 5 estrelas, o que você está achando do sistema?',
    buttonText: 'Escolher nota',
    sections: [
      {
        title: 'Nota',
        rows: [
          { id: 'FEEDBACK_RATING_5', title: '⭐⭐⭐⭐⭐ (5) Adorei' },
          { id: 'FEEDBACK_RATING_4', title: '⭐⭐⭐⭐ (4) Gostei' },
          { id: 'FEEDBACK_RATING_3', title: '⭐⭐⭐ (3) Mais ou menos' },
          { id: 'FEEDBACK_RATING_2', title: '⭐⭐ (2) Pode melhorar' },
          { id: 'FEEDBACK_RATING_1', title: '⭐ (1) Não gostei' },
        ],
      },
    ],
  };
}

function likesAction(): SendAction {
  const lines = FEEDBACK_LIKE_OPTIONS.map((opt, i) => `${i + 1} - ${opt}`);
  return {
    type: 'buttons',
    body: [
      'Legal! E o que você mais curte por aqui?',
      '',
      ...lines,
      '',
      'Responda com os números, separados por vírgula (ex.: 1, 3). Ou toque em Pular.',
    ].join('\n'),
    buttons: [{ id: 'FEEDBACK_PULAR', title: 'Pular' }],
  };
}

function commentAction(): SendAction {
  return {
    type: 'buttons',
    body: 'Última! Quer me contar o que eu posso melhorar? Escreva sua mensagem ou toque em Pular.',
    buttons: [{ id: 'FEEDBACK_PULAR', title: 'Pular' }],
  };
}

function parseRating(content: string): number | null {
  const m = content.match(/^feedback_rating_([1-5])$/) || content.match(/^([1-5])\b/);
  return m ? Number(m[1]) : null;
}

function parseLikes(raw: string): string[] {
  const picked = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const n = Number(part);
    if (Number.isInteger(n) && n >= 1 && n <= FEEDBACK_LIKE_OPTIONS.length) {
      picked.add(FEEDBACK_LIKE_OPTIONS[n - 1]);
    }
  }
  return [...picked];
}

export async function processWhatsAppFeedbackFlow(params: {
  textRaw: string;
  content: string;
  flowStatus: string;
  payload: Record<string, unknown>;
  isMenuRequest: () => boolean;
  isEndRequest: () => boolean;
  resetToMenu: () => SendAction;
  endConversation: () => SendAction;
}): Promise<{
  sendAction: SendAction;
  newStatus: WhatsAppFeedbackFlowStatus | 'MENU';
  newPayload: Record<string, unknown>;
  newConversationStatus?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  clearPayload?: boolean;
} | null> {
  const { textRaw, content, flowStatus, payload, isMenuRequest, isEndRequest, resetToMenu, endConversation } =
    params;

  if (!isWhatsAppFeedbackFlowStatus(flowStatus)) return null;

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  const feedbackId = String(payload.feedbackId || '').trim();
  const thanks = (): SendAction => ({
    type: 'text',
    text: 'Muito obrigada pela sua opinião! 💜 Ela vai me ajudar a ficar cada vez melhor.',
  });
  const done = {
    newStatus: 'MENU' as const,
    newPayload: {},
    newConversationStatus: 'COMPLETED' as const,
    clearPayload: true,
  };

  // Sem o registro da pergunta (conversa antiga ou reiniciada), encerra sem insistir.
  if (!feedbackId) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  switch (flowStatus) {
    case 'FEEDBACK_INVITE': {
      if (YES_WORDS.test(content)) {
        return { sendAction: ratingAction(), newStatus: 'FEEDBACK_RATING', newPayload: payload };
      }
      if (NO_WORDS.test(content)) {
        return {
          sendAction: { type: 'text', text: 'Tudo bem! Se precisar, é só chamar. 😊' },
          ...done,
        };
      }
      return { sendAction: feedbackInviteAction(), newStatus: 'FEEDBACK_INVITE', newPayload: payload };
    }

    case 'FEEDBACK_RATING': {
      const rating = parseRating(content);
      if (!rating) {
        return { sendAction: ratingAction(), newStatus: 'FEEDBACK_RATING', newPayload: payload };
      }
      await saveWhatsAppFeedbackRating(feedbackId, rating);
      return {
        sendAction: likesAction(),
        newStatus: 'FEEDBACK_LIKES',
        newPayload: { ...payload, feedbackRating: rating },
      };
    }

    case 'FEEDBACK_LIKES': {
      if (!SKIP_WORDS.test(content)) {
        const likes = parseLikes(textRaw);
        if (likes.length === 0) {
          return { sendAction: likesAction(), newStatus: 'FEEDBACK_LIKES', newPayload: payload };
        }
        await saveWhatsAppFeedbackLikes(feedbackId, likes);
      }
      return { sendAction: commentAction(), newStatus: 'FEEDBACK_COMMENT', newPayload: payload };
    }

    case 'FEEDBACK_COMMENT': {
      if (!SKIP_WORDS.test(content) && textRaw.trim()) {
        await saveWhatsAppFeedbackComment(feedbackId, textRaw);
      }
      return { sendAction: thanks(), ...done };
    }

    default:
      return null;
  }
}
