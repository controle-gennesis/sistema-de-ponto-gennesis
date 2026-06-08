import { FuelRefuelRequestStatus } from '@prisma/client';
import { prisma } from './prisma';
import { getGennecyBotUserId } from '../services/GennecyChatAssistantService';

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

const STATUS_WAITING_LABEL: Partial<Record<FuelRefuelRequestStatus, string>> = {
  PENDING_MANAGER: 'aguardando aprovação do gestor',
  PENDING_SUPPLIES: 'aguardando aprovação do Suprimentos',
  AWAITING_REFUEL: 'aprovada — pode abastecer e depois informar os dados (opção 4)',
};

export function formatFuelWaitingLine(displayNumber: number, status: FuelRefuelRequestStatus): string {
  const label = STATUS_WAITING_LABEL[status] ?? status;
  return `• Solicitação #${displayNumber}: ${label}`;
}

export async function notifyFuelRequesterWaitingManager(
  sourceChatId: string | null | undefined,
  displayNumber: number,
) {
  await postFuelChatMessage(
    sourceChatId,
    [
      `⏳ Solicitação #${displayNumber} registrada.`,
      'Aguardando aprovação do **gestor**.',
      '',
      'Você receberá uma mensagem aqui quando for encaminhada ao Suprimentos.',
    ].join('\n'),
  );
}

export async function notifyFuelRequesterWaitingSupplies(
  sourceChatId: string | null | undefined,
  displayNumber: number,
) {
  await postFuelChatMessage(
    sourceChatId,
    [
      `⏳ Solicitação #${displayNumber} registrada.`,
      'Aguardando aprovação do **Suprimentos**.',
      '',
      'Você receberá uma mensagem aqui quando for aprovada.',
    ].join('\n'),
  );
}

export async function notifyFuelRequesterApprovedBySupplies(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  comment?: string | null,
) {
  const lines = [
    `✅ Solicitação #${displayNumber} **aprovada pelo Suprimentos**!`,
    'Você já pode abastecer.',
    '',
    'Depois do abastecimento, digite **4** ou «informar abastecimento» para enviar:',
    'hodômetro, nível do tanque, litros, valor por litro e foto do cupom fiscal.',
  ];
  if (comment?.trim()) {
    lines.push('', `Observação do Suprimentos: ${comment.trim()}`);
  }
  await postFuelChatMessage(sourceChatId, lines.join('\n'));
}

export async function notifyFuelRequesterRejectedBySupplies(
  sourceChatId: string | null | undefined,
  displayNumber: number,
  reason: string,
) {
  await postFuelChatMessage(
    sourceChatId,
    [
      `❌ Solicitação #${displayNumber} **não aprovada** pelo Suprimentos.`,
      reason.trim() ? `Motivo: ${reason.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export async function notifyFuelRequesterReportCompleted(
  sourceChatId: string | null | undefined,
  displayNumber: number,
) {
  await postFuelChatMessage(
    sourceChatId,
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
