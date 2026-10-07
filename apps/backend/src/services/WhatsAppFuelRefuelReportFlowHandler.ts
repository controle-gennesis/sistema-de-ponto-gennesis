import { FuelTankLevelAfter } from '@prisma/client';
import { hasStoredPhoto, isWhatsAppSavedMediaReady } from '../lib/flowMedia';
import { FUEL_LITERS_MAX, parseFlexibleDecimal } from '../lib/parseFlexibleDecimal';
import {
  cancelFuelRequestFromEveningCheck,
  parseFuelEveningCheckPlainYesNo,
  parseFuelEveningCheckReply,
  resolveFuelEveningCheckRequestId,
} from '../lib/fuelRefuelEveningCheck';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppFuelReportFlowStatus =
  | 'FUEL_REPORT_SELECT_REQUEST'
  | 'FUEL_REPORT_ASK_ODOMETER'
  | 'FUEL_REPORT_ASK_TANK'
  | 'FUEL_REPORT_ASK_LITERS'
  | 'FUEL_REPORT_ASK_PRICE'
  | 'FUEL_REPORT_ASK_RECEIPT'
  | 'FUEL_REPORT_ASK_OBSERVATIONS'
  | 'FUEL_REPORT_CONFIRM'
  | 'FUEL_REPORT_COMPLETE';

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;

const TANK_OPTIONS: Array<{ level: FuelTankLevelAfter; label: string }> = [
  { level: FuelTankLevelAfter.RESERVE, label: 'Reserva' },
  { level: FuelTankLevelAfter.QUARTER, label: '1/4 do tanque' },
  { level: FuelTankLevelAfter.HALF, label: '1/2 do tanque' },
  { level: FuelTankLevelAfter.THREE_QUARTERS, label: '3/4 do tanque' },
  { level: FuelTankLevelAfter.FULL, label: 'Tanque cheio' },
];

const TANK_OPTION_ID_PREFIX = 'fuel_tank_';

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

function tankOptionId(level: FuelTankLevelAfter): string {
  return `${TANK_OPTION_ID_PREFIX}${level}`;
}

function tankListAction(body = 'Qual o nível do tanque após o abastecimento?'): SendAction {
  return waList(
    body,
    TANK_OPTIONS.map((o) => ({
      id: tankOptionId(o.level),
      title: o.label.slice(0, 24),
    })),
    'Ver opções',
  );
}

function resolveTankChoice(content: string, textRaw: string): (typeof TANK_OPTIONS)[number] | null {
  // Preferir textRaw: o bot lowercasa `content`, e os IDs da lista Meta são
  // `fuel_tank_HALF` — com lowercasing quebrava o match com o enum Prisma.
  const raw = (textRaw || content || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  if (lower.startsWith(TANK_OPTION_ID_PREFIX)) {
    const levelToken = lower
      .slice(TANK_OPTION_ID_PREFIX.length)
      .toUpperCase()
      .replace(/-/g, '_');
    return TANK_OPTIONS.find((o) => o.level === levelToken) ?? null;
  }

  const byExactLabel = TANK_OPTIONS.find((o) => o.label.toLowerCase() === lower);
  if (byExactLabel) return byExactLabel;

  // Índice numérico puro (1–5) antes de includes — senão "1" casa em "1/4 do tanque".
  if (/^\d+$/.test(raw)) {
    const asIndex = parseInt(raw, 10);
    if (asIndex >= 1 && asIndex <= TANK_OPTIONS.length) {
      return TANK_OPTIONS[asIndex - 1];
    }
  }

  // Aliases comuns (texto livre / atalho); evitar parseInt("1/2…") → 1 (Reserva).
  const aliases: Array<{ re: RegExp; level: FuelTankLevelAfter }> = [
    { re: /^(reserva|reserve)$/i, level: FuelTankLevelAfter.RESERVE },
    { re: /^(1\s*\/\s*4|1\/4|¼|um\s*quarto|quarto)$/i, level: FuelTankLevelAfter.QUARTER },
    { re: /^(1\s*\/\s*2|1\/2|½|meio|metade)$/i, level: FuelTankLevelAfter.HALF },
    {
      re: /^(3\s*\/\s*4|3\/4|¾|tres\s*quartos|três\s*quartos)$/i,
      level: FuelTankLevelAfter.THREE_QUARTERS,
    },
    { re: /^(cheio|full|tanque\s*cheio)$/i, level: FuelTankLevelAfter.FULL },
  ];
  for (const alias of aliases) {
    const withoutTankSuffix = lower.replace(/\s+do\s+tanque$/, '');
    if (alias.re.test(lower) || alias.re.test(withoutTankSuffix)) {
      return TANK_OPTIONS.find((o) => o.level === alias.level) ?? null;
    }
  }

  // Includes só com trecho razoável (evita "1" → "1/4…")
  if (lower.length >= 3) {
    const byIncludes = TANK_OPTIONS.find((o) => o.label.toLowerCase().includes(lower));
    if (byIncludes) return byIncludes;
  }

  return null;
}

function requestListAction(
  options: Array<{ id: string; displayNumber: number; label: string }>,
  body = 'Selecione a solicitação do abastecimento:',
): SendAction {
  return waList(
    body,
    options.slice(0, 10).map((o) => ({
      id: o.id,
      title: `#${o.displayNumber} ${o.label}`.slice(0, 24),
    })),
    'Ver solicitações',
  );
}

function tankLabel(level?: FuelTankLevelAfter): string {
  return TANK_OPTIONS.find((o) => o.level === level)?.label ?? '—';
}

function parseInteger(input: string): number | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type RequestOption = {
  id: string;
  displayNumber: number;
  label: string;
  requesterId: string;
};

function resolveRequestChoice(
  content: string,
  textRaw: string,
  options: RequestOption[],
): RequestOption | null {
  const trimmed = (content || textRaw).trim();
  if (!trimmed) return null;

  const byId = options.find((o) => o.id === trimmed);
  if (byId) return byId;

  const asIndex = parseInt(trimmed, 10);
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1];
  }
  const asNumber = parseInt(trimmed.replace(/^#/, ''), 10);
  if (Number.isFinite(asNumber)) {
    return options.find((o) => o.displayNumber === asNumber) ?? null;
  }
  return null;
}

function buildSummary(payload: Record<string, unknown>): string {
  return [
    'Resumo do abastecimento:',
    `• Solicitação: #${payload.displayNumber ?? '—'}`,
    `• Veículo: ${payload.vehiclePlate ?? '—'}`,
    `• Hodômetro: ${payload.odometerKm != null ? Number(payload.odometerKm).toLocaleString('pt-BR') : '—'} km`,
    `• Tanque após abastecimento: ${tankLabel(payload.tankLevelAfter as FuelTankLevelAfter | undefined)}`,
    `• Litros: ${
      payload.litersRefueled != null
        ? Number(payload.litersRefueled).toLocaleString('pt-BR', {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          })
        : '—'
    }`,
    `• Valor por litro: ${
      payload.pricePerLiter != null ? formatMoney(Number(payload.pricePerLiter)) : '—'
    }`,
    `• Cupom fiscal: ${hasStoredPhoto(payload.receiptPhotoUrl, payload.receiptPhotoKey) ? 'enviado' : '—'}`,
    `• Observações: ${String(payload.observations || '').trim() || '—'}`,
    '',
    'Confirma o envio?',
  ].join('\n');
}

const CONFIRM_YES_NO_BUTTONS = [
  { id: 'SIM', title: 'Sim' },
  { id: 'NAO', title: 'Não' },
];

const OBSERVATIONS_BUTTONS = [
  { id: 'NAO', title: 'Não' },
  { id: 'MENU', title: 'Menu' },
  { id: 'END', title: 'Encerrar' },
];

export function isWhatsAppFuelReportFlowStatus(status: string): boolean {
  return status.startsWith('FUEL_REPORT_');
}

export function isWhatsAppFuelReportMenuSelection(content: string): boolean {
  return (
    content === 'informar_abastecimento' ||
    content.includes('informar abastecimento') ||
    (content.includes('informar') && content.includes('abastec'))
  );
}

export async function processWhatsAppFuelRefuelReportFlow(params: {
  phone: string;
  textRaw: string;
  content: string;
  flowStatus: string;
  payload: Record<string, unknown>;
  hasMedia: boolean;
  savedMedia: { fileUrl: string; fileName: string; fileKey?: string } | null;
  isMenuRequest: () => boolean;
  isEndRequest: () => boolean;
  resetToMenu: () => SendAction;
  endConversation: () => SendAction;
}): Promise<{
  sendAction: SendAction;
  newStatus: WhatsAppFuelReportFlowStatus | 'MENU';
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
    hasMedia,
    savedMedia,
    isMenuRequest,
    isEndRequest,
    resetToMenu,
    endConversation,
  } = params;

  let checkParsed =
    parseFuelEveningCheckReply(content) || parseFuelEveningCheckReply(textRaw);

  if (!checkParsed && !isWhatsAppFuelReportFlowStatus(flowStatus)) {
    const plain =
      parseFuelEveningCheckPlainYesNo(content) || parseFuelEveningCheckPlainYesNo(textRaw);
    if (plain) {
      const fromPayload = String(payload.fuelEveningCheckRequestId || '').trim();
      if (fromPayload) {
        checkParsed = { kind: plain, requestId: fromPayload };
      } else {
        // Template Meta costuma devolver o título do botão ("Sim"/"Não"); resolve pelo telefone.
        const resolved = await resolveFuelEveningCheckRequestId({ phone, payload });
        if (resolved) checkParsed = { kind: plain, requestId: resolved };
      }
    }
  }

  if (checkParsed) {
    const requestId = await resolveFuelEveningCheckRequestId({
      phone,
      requestIdFromButton: checkParsed.requestId,
      payload,
    });
    if (!requestId) {
      return {
        sendAction: waButtons(
          'Não encontrei a solicitação deste lembrete. Use o menu «Informar abastecimento» se ainda precisar.',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    const row = await fuelRefuelRequestService.getById(requestId).catch(() => null);
    if (!row || row.status !== 'AWAITING_REFUEL') {
      return {
        sendAction: waButtons(
          'Essa solicitação não está mais aguardando abastecimento. Use o menu se precisar de outra opção.',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    if (checkParsed.kind === 'no') {
      try {
        await cancelFuelRequestFromEveningCheck(requestId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Não foi possível cancelar.';
        return {
          sendAction: waButtons(msg),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
      return {
        sendAction: waButtons(
          `Solicitação #${row.displayNumber} cancelada. Se precisar abastecer, faça uma nova solicitação pelo menu.`,
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    // Sim → inicia informe do abastecimento direto no hodômetro
    return {
      sendAction: waButtons(
        `Ótimo! Vamos registrar o abastecimento da solicitação #${row.displayNumber}.\n\nQual o hodômetro atual (km)?`,
      ),
      newStatus: 'FUEL_REPORT_ASK_ODOMETER',
      newPayload: {
        flow: 'FUEL_REPORT',
        requestId: row.id,
        requesterId: row.requesterId,
        displayNumber: row.displayNumber,
        vehiclePlate: row.vehiclePlate,
      },
    };
  }

  const startingFromMenu =
    isWhatsAppFuelReportMenuSelection(content) && !isWhatsAppFuelReportFlowStatus(flowStatus);
  if (!isWhatsAppFuelReportFlowStatus(flowStatus) && !startingFromMenu) {
    return null;
  }

  let newPayload: Record<string, unknown> = { ...payload, flow: 'FUEL_REPORT' };
  let newStatus: WhatsAppFuelReportFlowStatus | 'MENU' = startingFromMenu
    ? 'FUEL_REPORT_SELECT_REQUEST'
    : (flowStatus as WhatsAppFuelReportFlowStatus);

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  if (startingFromMenu) {
    const rows = await fuelRefuelRequestService.listAwaitingRefuelForWhatsAppPhone(phone, {
      requestId: String(payload.blockedAwaitingRequestId || ''),
    });
    const requestOptions = rows.map((r) => ({
      id: r.id,
      displayNumber: r.displayNumber,
      label: `${r.vehiclePlate} — ${r.driverName}`,
      requesterId: r.requesterId,
    }));

    if (requestOptions.length === 0) {
      return {
        sendAction: waButtons(
          'Não encontrei solicitações aprovadas aguardando informe de abastecimento. Aguarde a aprovação do Suprimentos.',
        ),
        newStatus: 'MENU',
        newPayload: {},
        clearPayload: true,
      };
    }

    if (requestOptions.length === 1) {
      const only = requestOptions[0];
      newPayload = {
        flow: 'FUEL_REPORT',
        requestId: only.id,
        requesterId: only.requesterId,
        displayNumber: only.displayNumber,
        vehiclePlate: rows[0].vehiclePlate,
      };
      return {
        sendAction: waButtons(
          `Vamos registrar o abastecimento da solicitação #${only.displayNumber}.\n\nQual o hodômetro atual (km)?`,
        ),
        newStatus: 'FUEL_REPORT_ASK_ODOMETER',
        newPayload,
      };
    }

    newPayload.requestOptions = requestOptions;
    return {
      sendAction: requestListAction(requestOptions),
      newStatus: 'FUEL_REPORT_SELECT_REQUEST',
      newPayload,
    };
  }

  switch (newStatus) {
    case 'FUEL_REPORT_SELECT_REQUEST': {
      const options = (newPayload.requestOptions as RequestOption[]) ?? [];
      const chosen = resolveRequestChoice(content, textRaw, options);
      if (!chosen) {
        return {
          sendAction: requestListAction(options, 'Opção inválida. Selecione a solicitação:'),
          newStatus,
          newPayload,
        };
      }
      const plate = chosen.label.split(' — ')[0] ?? chosen.label;
      newPayload.requestId = chosen.id;
      newPayload.requesterId = chosen.requesterId;
      newPayload.displayNumber = chosen.displayNumber;
      newPayload.vehiclePlate = plate;
      return {
        sendAction: waButtons(
          `Solicitação #${chosen.displayNumber} selecionada.\n\nQual o hodômetro atual (km)?`,
        ),
        newStatus: 'FUEL_REPORT_ASK_ODOMETER',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_ODOMETER': {
      const km = parseInteger(textRaw);
      if (km == null || km <= 0) {
        return {
          sendAction: waButtons('Informe o hodômetro em km (somente números, ex.: 45230).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.odometerKm = km;
      return {
        sendAction: tankListAction(),
        newStatus: 'FUEL_REPORT_ASK_TANK',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_TANK': {
      const chosen = resolveTankChoice(content, textRaw);
      if (!chosen) {
        return {
          sendAction: tankListAction('Opção inválida. Selecione o nível do tanque:'),
          newStatus,
          newPayload,
        };
      }
      newPayload.tankLevelAfter = chosen.level;
      return {
        sendAction: waButtons('Quantos litros foram abastecidos?'),
        newStatus: 'FUEL_REPORT_ASK_LITERS',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_LITERS': {
      const liters = parseFlexibleDecimal(textRaw);
      if (liters == null || liters <= 0) {
        return {
          sendAction: waButtons('Informe os litros abastecidos (ex.: 45,5 ou 45.5).'),
          newStatus,
          newPayload,
        };
      }
      if (liters > FUEL_LITERS_MAX) {
        return {
          sendAction: waButtons(
            `Litros inválidos (máximo ${FUEL_LITERS_MAX} L). Use ponto ou vírgula como decimal (ex.: 14,947).`,
          ),
          newStatus,
          newPayload,
        };
      }
      newPayload.litersRefueled = liters;
      return {
        sendAction: waButtons('Qual o valor por litro?'),
        newStatus: 'FUEL_REPORT_ASK_PRICE',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_PRICE': {
      const price = parseFlexibleDecimal(textRaw);
      if (price == null || price <= 0) {
        return {
          sendAction: waButtons('Informe o valor por litro (ex.: 5,89 ou R$ 5,89).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.pricePerLiter = price;
      return {
        sendAction: waButtons('Envie a foto do cupom fiscal como imagem nesta conversa.'),
        newStatus: 'FUEL_REPORT_ASK_RECEIPT',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_RECEIPT': {
      if (!isWhatsAppSavedMediaReady(hasMedia, savedMedia)) {
        return {
          sendAction: waButtons('Preciso da foto do cupom fiscal. Envie uma imagem (pode mandar só a foto).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.receiptPhotoUrl = savedMedia!.fileUrl || null;
      newPayload.receiptPhotoKey = savedMedia!.fileKey;
      newPayload.receiptPhotoName = savedMedia!.fileName;
      return {
        sendAction: waButtons(
          'Alguma observação sobre o abastecimento?',
          OBSERVATIONS_BUTTONS,
        ),
        newStatus: 'FUEL_REPORT_ASK_OBSERVATIONS',
        newPayload,
      };
    }

    case 'FUEL_REPORT_ASK_OBSERVATIONS': {
      newPayload.observations = SKIP_WORDS.test(textRaw) ? '' : textRaw.trim();
      return {
        sendAction: waButtons(buildSummary(newPayload), CONFIRM_YES_NO_BUTTONS),
        newStatus: 'FUEL_REPORT_CONFIRM',
        newPayload,
      };
    }

    case 'FUEL_REPORT_CONFIRM': {
      if (NO_WORDS.test(textRaw)) {
        return {
          sendAction: waButtons(
            'Informe descartado. Escolha «Informar abastecimento» no menu para tentar novamente.',
          ),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
      if (!YES_WORDS.test(textRaw)) {
        return {
          sendAction: waButtons('Confirma o envio?', CONFIRM_YES_NO_BUTTONS),
          newStatus,
          newPayload,
        };
      }

      const requestId = String(newPayload.requestId || '');
      const requesterId = String(newPayload.requesterId || '');
      if (
        !requestId ||
        !requesterId ||
        newPayload.odometerKm == null ||
        !newPayload.tankLevelAfter ||
        newPayload.litersRefueled == null ||
        newPayload.pricePerLiter == null ||
        !hasStoredPhoto(newPayload.receiptPhotoUrl, newPayload.receiptPhotoKey)
      ) {
        return {
          sendAction: waButtons('Faltam dados. Volte ao menu e tente novamente.'),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }

      const updated = await fuelRefuelRequestService.submitRefuelReport({
        requesterId,
        requestId,
        odometerKm: Number(newPayload.odometerKm),
        tankLevelAfter: newPayload.tankLevelAfter as FuelTankLevelAfter,
        litersRefueled: Number(newPayload.litersRefueled),
        pricePerLiter: Number(newPayload.pricePerLiter),
        receiptPhotoUrl: String(newPayload.receiptPhotoUrl || '').trim() || null,
        receiptPhotoKey: (newPayload.receiptPhotoKey as string | undefined) || null,
        receiptPhotoName: (newPayload.receiptPhotoName as string | undefined) || null,
        observations: (newPayload.observations as string | undefined) || null,
        skipRequesterNotify: true,
      });

      return {
        sendAction: {
          type: 'buttons',
          body: [
            `Abastecimento da solicitação #${updated.displayNumber} registrado com sucesso!`,
            'Obrigado por informar os dados.',
          ].join('\n'),
          buttons: [
            { id: 'INFORMAR_ABASTECIMENTO', title: 'Informar outro' },
            { id: 'MENU', title: 'Menu principal' },
            { id: 'END', title: 'Encerrar' },
          ],
        },
        newStatus: 'FUEL_REPORT_COMPLETE',
        newPayload: { flow: 'FUEL_REPORT', lastDisplayNumber: updated.displayNumber },
        newConversationStatus: 'COMPLETED',
      };
    }

    case 'FUEL_REPORT_COMPLETE': {
      if (isWhatsAppFuelReportMenuSelection(content)) {
        const rows = await fuelRefuelRequestService.listAwaitingRefuelForWhatsAppPhone(phone);
        if (rows.length === 0) {
          return {
            sendAction: waButtons('Não há mais solicitações aguardando informe de abastecimento.'),
            newStatus: 'MENU',
            newPayload: {},
            clearPayload: true,
          };
        }
        if (rows.length === 1) {
          const only = rows[0];
          return {
            sendAction: waButtons(
              `Vamos registrar o abastecimento da solicitação #${only.displayNumber}.\n\nQual o hodômetro atual (km)?`,
            ),
            newStatus: 'FUEL_REPORT_ASK_ODOMETER',
            newPayload: {
              flow: 'FUEL_REPORT',
              requestId: only.id,
              requesterId: only.requesterId,
              displayNumber: only.displayNumber,
              vehiclePlate: only.vehiclePlate,
            },
            newConversationStatus: 'PENDING',
          };
        }
        const requestOptions = rows.map((r) => ({
          id: r.id,
          displayNumber: r.displayNumber,
          label: `${r.vehiclePlate} — ${r.driverName}`,
          requesterId: r.requesterId,
        }));
        return {
          sendAction: requestListAction(requestOptions),
          newStatus: 'FUEL_REPORT_SELECT_REQUEST',
          newPayload: { flow: 'FUEL_REPORT', requestOptions },
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
