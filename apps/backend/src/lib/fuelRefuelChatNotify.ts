import { FuelRefuelRequestStatus } from '@prisma/client';
import { prisma } from './prisma';
import { getGennecyBotUserId } from '../services/GennecyChatAssistantService';
import { metaWhatsApp } from '../services/MetaWhatsAppService';

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '');
}

export async function postFuelChatMessage(chatId: string | null | undefined, text: string) {
  if (!chatId?.trim()) return;
  const senderId = await getGennecyBotUserId();
  await prisma.message.create({
    data: {
      chatId,
      senderId,
      content: text.trim(),
      isSystem: false,
      isRead: false,
    },
  });
  await prisma.chat.update({
    where: { id: chatId },
    data: { lastMessageAt: new Date() },
  });
}

export async function postFuelWhatsAppMessage(phone: string | null | undefined, text: string) {
  if (!phone?.trim()) return;
  try {
    await metaWhatsApp.sendText(phone.trim(), stripMarkdown(text));
  } catch (err) {
    console.error('[FuelRefuel] Falha ao enviar WhatsApp:', err);
  }
}

async function notifyFuelRequester(
  sourceChatId: string | null | undefined,
  sourceWhatsAppPhone: string | null | undefined,
  text: string,
) {
  await postFuelChatMessage(sourceChatId, text);
  await postFuelWhatsAppMessage(sourceWhatsAppPhone, text);
}

const STATUS_WAITING_LABEL: Partial<Record<FuelRefuelRequestStatus, string>> = {
  PENDING_MANAGER: 'aguardando aprovação do gestor',
  PENDING_SUPPLIES: 'aguardando aprovação do Suprimentos',
  AWAITING_REFUEL: 'aprovada — pode abastecer',
};

export function formatFuelWaitingLine(displayNumber: number, status: FuelRefuelRequestStatus): string {
  const label = STATUS_WAITING_LABEL[status] ?? status;
  return `• Solicitação #${displayNumber}: ${label}`;
}

export async function notifyFuelRequesterWaitingManager(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  sourceWhatsAppPhone?: string | null,
) {
  await notifyFuelRequester(
    sourceChatId,
    sourceWhatsAppPhone,
    [
      `⏳ Solicitação #${displayNumber} registrada.`,
      'Aguardando aprovação do gestor.',
      '',
      'Você receberá uma mensagem quando for encaminhada ao Suprimentos.',
    ].join('\n'),
  );
}

export async function notifyFuelRequesterWaitingSupplies(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  sourceWhatsAppPhone?: string | null,
) {
  await notifyFuelRequester(
    sourceChatId,
    sourceWhatsAppPhone,
    [
      `⏳ Solicitação #${displayNumber} registrada.`,
      'Aguardando aprovação do Suprimentos.',
      '',
      'Você receberá uma mensagem aqui quando for aprovada.',
    ].join('\n'),
  );
}

export async function notifyFuelRequesterApprovedBySupplies(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  comment?: string | null,
  sourceWhatsAppPhone?: string | null,
) {
  const lines = [
    `✅ Solicitação #${displayNumber} aprovada pelo Suprimentos!`,
    'Você já pode abastecer.',
    '',
    'Depois do abastecimento, abra o menu aqui no WhatsApp e escolha «Informar abastecimento» para enviar hodômetro, litros, valor e cupom fiscal.',
  ];
  if (comment?.trim()) {
    lines.push('', `Observação do Suprimentos: ${comment.trim()}`);
  }
  await notifyFuelRequester(sourceChatId, sourceWhatsAppPhone, lines.join('\n'));
}

export async function notifyFuelRequesterRejectedBySupplies(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  reason: string,
  sourceWhatsAppPhone?: string | null,
) {
  await notifyFuelRequester(
    sourceChatId,
    sourceWhatsAppPhone,
    [
      `❌ Solicitação #${displayNumber} não aprovada pelo Suprimentos.`,
      reason.trim() ? `Motivo: ${reason.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export async function notifyFuelRequesterReportCompleted(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  sourceWhatsAppPhone?: string | null,
) {
  await notifyFuelRequester(
    sourceChatId,
    sourceWhatsAppPhone,
    `✅ Dados do abastecimento da solicitação #${displayNumber} recebidos. Obrigado!`,
  );
}

export async function buildFuelOpenRequestsStatusMessage(requesterId: string): Promise<string | null> {
  const rows = await prisma.fuelRefuelRequest.findMany({
    where: {
      requesterId,
      status: {
        in: [
          FuelRefuelRequestStatus.PENDING_MANAGER,
          FuelRefuelRequestStatus.PENDING_SUPPLIES,
          FuelRefuelRequestStatus.AWAITING_REFUEL,
        ],
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { displayNumber: true, status: true },
  });
  if (rows.length === 0) return null;
  return ['⏳ Suas solicitações de combustível em andamento:', ...rows.map((r) => formatFuelWaitingLine(r.displayNumber, r.status))].join('\n');
}
