import { hasStoredPhoto, isWhatsAppSavedMediaReady } from '../lib/flowMedia';
import { parseVehicleBaixaReminderReply } from '../lib/vehicleReservationBaixaReminder';
import { prisma } from '../lib/prisma';
import { VehicleReservationStatus } from '@prisma/client';
import { vehicleReservationService } from './VehicleReservationService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppVehicleReservationReturnFlowStatus =
  | 'VRR_SELECT_RESERVATION'
  | 'VRR_ASK_DEVOLUCAO_AT'
  | 'VRR_ASK_PHOTO'
  | 'VRR_ASK_OBSERVATIONS'
  | 'VRR_CONFIRM'
  | 'VRR_COMPLETE';

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;
const DEVOLUCAO_NOW_ID = 'vrr_devolucao_now';

type ReservationOption = {
  id: string;
  code: string;
  label: string;
};

function waButtons(body: string, extra?: Array<{ id: string; title: string }>): SendAction {
  return {
    type: 'buttons',
    body,
    buttons: extra ?? [
      { id: 'MENU', title: 'Menu' },
      { id: 'END', title: 'Encerrar' },
    ],
  };
}

function waList(
  body: string,
  rows: Array<{ id: string; title: string }>,
  buttonText = 'Escolher',
): SendAction {
  return {
    type: 'list',
    body,
    buttonText,
    sections: [{ title: 'Opções', rows: rows.slice(0, 10) }],
  };
}

function truncateWaTitle(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 21)}...`;
}

function formatVehicleLabel(vehicle?: {
  code?: string | null;
  marcaVeic?: string | null;
  modeloVeic?: string | null;
  placaVeic?: string | null;
} | null): string {
  if (!vehicle) return '—';
  const parts = [
    vehicle.placaVeic?.trim(),
    [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim() || null,
  ].filter(Boolean);
  return parts.join(' · ') || vehicle.code || '—';
}

function formatBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function nowSaoPaulo(): Date {
  return new Date();
}

function parseBrDateTime(input: string): Date | null {
  const trimmed = input.trim();
  const m = trimmed.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2})[:hH](\d{2})$/,
  );
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);
  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const date = new Date(y, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

function reservationListAction(
  options: ReservationOption[],
  body = 'Selecione a reserva para dar baixa:',
): SendAction {
  return waList(
    body,
    options.slice(0, 10).map((o) => ({
      id: o.id,
      title: truncateWaTitle(`#${o.code} ${o.label}`),
    })),
    'Ver reservas',
  );
}

function askDevolucaoAtAction(body?: string): SendAction {
  return waButtons(
    body ||
      'Qual a data e hora da devolução?\nToque em «Agora» ou envie no formato 07/10/2026 16:20.',
    [
      { id: DEVOLUCAO_NOW_ID, title: 'Agora' },
      { id: 'MENU', title: 'Menu' },
      { id: 'END', title: 'Encerrar' },
    ],
  );
}

function buildSummary(payload: Record<string, unknown>): string {
  const devolucaoAt =
    payload.devolucaoAt instanceof Date
      ? payload.devolucaoAt
      : payload.devolucaoAt
        ? new Date(String(payload.devolucaoAt))
        : null;
  return [
    'Resumo da baixa:',
    `• Reserva: #${payload.code ?? '—'}`,
    `• Veículo: ${payload.vehicleLabel ?? '—'}`,
    `• Devolução: ${devolucaoAt && !Number.isNaN(devolucaoAt.getTime()) ? formatBrDateTime(devolucaoAt) : '—'}`,
    `• Foto: ${hasStoredPhoto(payload.baixaFotoUrl, payload.baixaFotoKey) ? 'enviada' : '—'}`,
    `• Observação: ${String(payload.baixaObservacao || '').trim() || '—'}`,
    '',
    'Confirma o envio?',
  ].join('\n');
}

function resolveReservationChoice(
  content: string,
  textRaw: string,
  options: ReservationOption[],
): ReservationOption | null {
  const trimmed = (content || textRaw).trim();
  if (!trimmed) return null;
  const byId = options.find((o) => o.id === trimmed);
  if (byId) return byId;
  const asIndex = parseInt(trimmed, 10);
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1];
  }
  const code = trimmed.replace(/^#/, '');
  return options.find((o) => o.code === code) ?? null;
}

function toReservationOptions(
  rows: Awaited<ReturnType<typeof vehicleReservationService.listApprovedForWhatsAppPhone>>,
): ReservationOption[] {
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: formatVehicleLabel(r.vehicle),
  }));
}

export function isWhatsAppVehicleReservationReturnFlowStatus(status: string): boolean {
  return status.startsWith('VRR_');
}

export function isWhatsAppVehicleReservationReturnMenuSelection(content: string): boolean {
  if (parseVehicleBaixaReminderReply(content)) return true;
  return (
    content === 'dar_baixa_veiculo' ||
    content === 'dar_baixa' ||
    content === 'baixa_veiculo' ||
    content.includes('dar baixa') ||
    content.includes('baixa do veículo') ||
    content.includes('baixa do veiculo') ||
    (content.includes('baixa') && (content.includes('carro') || content.includes('veic') || content.includes('reserva')))
  );
}

async function loadApprovedReservationForPhone(reservationId: string, phone: string) {
  return prisma.vehicleReservation.findFirst({
    where: {
      id: reservationId,
      status: VehicleReservationStatus.APPROVED,
      sourceWhatsAppPhone: phone.trim(),
    },
    select: {
      id: true,
      code: true,
      vehicle: {
        select: {
          code: true,
          marcaVeic: true,
          modeloVeic: true,
          placaVeic: true,
        },
      },
    },
  });
}

export async function processWhatsAppVehicleReservationReturnFlow(params: {
  phone: string;
  textRaw: string;
  content: string;
  flowStatus: string;
  payload: Record<string, unknown>;
  hasMedia?: boolean;
  savedMedia?: { fileUrl: string; fileName: string; fileKey?: string } | null;
  isMenuRequest: () => boolean;
  isEndRequest: () => boolean;
  resetToMenu: () => SendAction;
  endConversation: () => SendAction;
}): Promise<{
  sendAction: SendAction;
  newStatus: WhatsAppVehicleReservationReturnFlowStatus | 'MENU';
  newPayload: Record<string, unknown>;
  newConversationStatus?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  clearPayload?: boolean;
} | null> {
  const {
    phone,
    textRaw,
    content,
    flowStatus,
    payload,
    hasMedia = false,
    savedMedia = null,
    isMenuRequest,
    isEndRequest,
    resetToMenu,
    endConversation,
  } = params;

  const reminderReply = parseVehicleBaixaReminderReply(content);
  const startingFromMenu =
    flowStatus === 'MENU' && isWhatsAppVehicleReservationReturnMenuSelection(content);
  if (
    !isWhatsAppVehicleReservationReturnFlowStatus(flowStatus) &&
    !startingFromMenu &&
    !reminderReply
  ) {
    return null;
  }

  let newStatus = (
    startingFromMenu || reminderReply ? 'VRR_SELECT_RESERVATION' : flowStatus
  ) as WhatsAppVehicleReservationReturnFlowStatus;
  let newPayload: Record<string, unknown> =
    startingFromMenu || reminderReply
      ? { flow: 'VEHICLE_RESERVATION_RETURN' }
      : { ...payload };

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  if (reminderReply) {
    if (reminderReply.kind === 'no') {
      return {
        sendAction: waButtons(
          'Ok. Quando puder, abra o menu e escolha «Dar baixa do veículo».',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }
    const reservationId = reminderReply.reservationId?.trim() || '';
    if (!reservationId) {
      return {
        sendAction: waButtons(
          'Não identifiquei a reserva. Abra o menu e escolha «Dar baixa do veículo».',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }
    const row = await loadApprovedReservationForPhone(reservationId, phone);
    if (!row) {
      return {
        sendAction: waButtons(
          'Essa reserva não está mais aguardando baixa (já concluída ou não encontrada).',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }
    return {
      sendAction: askDevolucaoAtAction(
        `Baixa da reserva #${row.code} (${formatVehicleLabel(row.vehicle)}).\n\nQual a data e hora da devolução?\nToque em «Agora» ou envie no formato 07/10/2026 16:20.`,
      ),
      newStatus: 'VRR_ASK_DEVOLUCAO_AT',
      newPayload: {
        flow: 'VEHICLE_RESERVATION_RETURN',
        reservationId: row.id,
        code: row.code,
        vehicleLabel: formatVehicleLabel(row.vehicle),
      },
      newConversationStatus: 'PENDING',
    };
  }

  if (startingFromMenu || newStatus === 'VRR_SELECT_RESERVATION') {
    const rows = await vehicleReservationService.listApprovedForWhatsAppPhone(phone);
    if (rows.length === 0) {
      return {
        sendAction: waButtons(
          'Não há reserva de veículo em uso para dar baixa neste WhatsApp.\nReservas aprovadas pedidas por aqui aparecem nesta lista.',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    const options = toReservationOptions(rows);
    if (startingFromMenu && rows.length === 1) {
      const only = rows[0];
      newPayload = {
        flow: 'VEHICLE_RESERVATION_RETURN',
        reservationId: only.id,
        code: only.code,
        vehicleLabel: formatVehicleLabel(only.vehicle),
      };
      return {
        sendAction: askDevolucaoAtAction(
          `Baixa da reserva #${only.code} (${formatVehicleLabel(only.vehicle)}).\n\nQual a data e hora da devolução?\nToque em «Agora» ou envie no formato 07/10/2026 16:20.`,
        ),
        newStatus: 'VRR_ASK_DEVOLUCAO_AT',
        newPayload,
        newConversationStatus: 'PENDING',
      };
    }

    if (startingFromMenu) {
      newPayload = { flow: 'VEHICLE_RESERVATION_RETURN', reservationOptions: options };
      return {
        sendAction: reservationListAction(options),
        newStatus: 'VRR_SELECT_RESERVATION',
        newPayload,
        newConversationStatus: 'PENDING',
      };
    }
  }

  switch (newStatus) {
    case 'VRR_SELECT_RESERVATION': {
      const options = (newPayload.reservationOptions as ReservationOption[]) ?? [];
      const chosen = resolveReservationChoice(content, textRaw, options);
      if (!chosen) {
        return {
          sendAction: reservationListAction(options, 'Opção inválida. Selecione a reserva:'),
          newStatus,
          newPayload,
        };
      }
      newPayload.reservationId = chosen.id;
      newPayload.code = chosen.code;
      newPayload.vehicleLabel = chosen.label;
      return {
        sendAction: askDevolucaoAtAction(
          `Reserva #${chosen.code} selecionada.\n\nQual a data e hora da devolução?\nToque em «Agora» ou envie no formato 07/10/2026 16:20.`,
        ),
        newStatus: 'VRR_ASK_DEVOLUCAO_AT',
        newPayload,
      };
    }

    case 'VRR_ASK_DEVOLUCAO_AT': {
      let devolucaoAt: Date | null = null;
      if (content === DEVOLUCAO_NOW_ID || /^agora$/i.test(textRaw.trim())) {
        devolucaoAt = nowSaoPaulo();
      } else {
        devolucaoAt = parseBrDateTime(textRaw);
      }
      if (!devolucaoAt) {
        return {
          sendAction: askDevolucaoAtAction(
            'Data/hora inválida. Toque em «Agora» ou envie no formato 07/10/2026 16:20.',
          ),
          newStatus,
          newPayload,
        };
      }
      newPayload.devolucaoAt = devolucaoAt;
      return {
        sendAction: waButtons('Envie a foto do veículo como imagem nesta conversa.'),
        newStatus: 'VRR_ASK_PHOTO',
        newPayload,
      };
    }

    case 'VRR_ASK_PHOTO': {
      if (!isWhatsAppSavedMediaReady(hasMedia, savedMedia)) {
        return {
          sendAction: waButtons(
            'Preciso da foto do veículo. Envie uma imagem (pode mandar só a foto).',
          ),
          newStatus,
          newPayload,
        };
      }
      newPayload.baixaFotoUrl = savedMedia!.fileUrl || null;
      newPayload.baixaFotoKey = savedMedia!.fileKey || null;
      return {
        sendAction: waButtons(
          'Alguma observação sobre a devolução?\nEnvie o texto ou toque em «Não».',
          [
            { id: 'NAO', title: 'Não' },
            { id: 'MENU', title: 'Menu' },
            { id: 'END', title: 'Encerrar' },
          ],
        ),
        newStatus: 'VRR_ASK_OBSERVATIONS',
        newPayload,
      };
    }

    case 'VRR_ASK_OBSERVATIONS': {
      newPayload.baixaObservacao = SKIP_WORDS.test(textRaw) ? '' : textRaw.trim();
      return {
        sendAction: waButtons(buildSummary(newPayload), [
          { id: 'SIM', title: 'Sim' },
          { id: 'NAO', title: 'Não' },
        ]),
        newStatus: 'VRR_CONFIRM',
        newPayload,
      };
    }

    case 'VRR_CONFIRM': {
      if (NO_WORDS.test(textRaw) || content === 'nao') {
        return {
          sendAction: waButtons(
            'Baixa descartada. Escolha «Dar baixa do veículo» no menu para tentar novamente.',
          ),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
      if (!YES_WORDS.test(textRaw) && content !== 'sim') {
        return {
          sendAction: waButtons('Confirma o envio?', [
            { id: 'SIM', title: 'Sim' },
            { id: 'NAO', title: 'Não' },
          ]),
          newStatus,
          newPayload,
        };
      }

      const reservationId = String(newPayload.reservationId || '');
      const devolucaoAt =
        newPayload.devolucaoAt instanceof Date
          ? newPayload.devolucaoAt
          : newPayload.devolucaoAt
            ? new Date(String(newPayload.devolucaoAt))
            : null;

      if (
        !reservationId ||
        !devolucaoAt ||
        Number.isNaN(devolucaoAt.getTime()) ||
        !hasStoredPhoto(newPayload.baixaFotoUrl, newPayload.baixaFotoKey)
      ) {
        return {
          sendAction: waButtons('Faltam dados. Volte ao menu e tente novamente.'),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }

      try {
        const updated = await vehicleReservationService.submitReturnFromWhatsApp({
          reservationId,
          phone,
          devolucaoAt,
          baixaFotoUrl: String(newPayload.baixaFotoUrl || '').trim() || null,
          baixaFotoKey: (newPayload.baixaFotoKey as string | undefined) || null,
          baixaObservacao: String(newPayload.baixaObservacao || '').trim() || null,
        });

        return {
          sendAction: {
            type: 'buttons',
            body: [
              `✅ Baixa da reserva #${updated.code} registrada!`,
              'Aguardando vistoria do Suprimentos.',
            ].join('\n'),
            buttons: [
              { id: 'DAR_BAIXA_VEICULO', title: 'Outra baixa' },
              { id: 'MENU', title: 'Menu principal' },
              { id: 'END', title: 'Encerrar' },
            ],
          },
          newStatus: 'VRR_COMPLETE',
          newPayload: { flow: 'VEHICLE_RESERVATION_RETURN', lastCode: updated.code },
          newConversationStatus: 'COMPLETED',
        };
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível registrar a baixa. Tente novamente.';
        return {
          sendAction: waButtons(message),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
    }

    case 'VRR_COMPLETE': {
      if (isWhatsAppVehicleReservationReturnMenuSelection(content)) {
        const rows = await vehicleReservationService.listApprovedForWhatsAppPhone(phone);
        if (rows.length === 0) {
          return {
            sendAction: waButtons('Não há mais reservas em uso para dar baixa.'),
            newStatus: 'MENU',
            newPayload: {},
            clearPayload: true,
          };
        }
        if (rows.length === 1) {
          const only = rows[0];
          return {
            sendAction: askDevolucaoAtAction(
              `Baixa da reserva #${only.code} (${formatVehicleLabel(only.vehicle)}).\n\nQual a data e hora da devolução?\nToque em «Agora» ou envie no formato 07/10/2026 16:20.`,
            ),
            newStatus: 'VRR_ASK_DEVOLUCAO_AT',
            newPayload: {
              flow: 'VEHICLE_RESERVATION_RETURN',
              reservationId: only.id,
              code: only.code,
              vehicleLabel: formatVehicleLabel(only.vehicle),
            },
            newConversationStatus: 'PENDING',
          };
        }
        const options = toReservationOptions(rows);
        return {
          sendAction: reservationListAction(options),
          newStatus: 'VRR_SELECT_RESERVATION',
          newPayload: { flow: 'VEHICLE_RESERVATION_RETURN', reservationOptions: options },
          newConversationStatus: 'PENDING',
        };
      }
      return {
        sendAction: resetToMenu(),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    default:
      return {
        sendAction: resetToMenu(),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
  }
}
