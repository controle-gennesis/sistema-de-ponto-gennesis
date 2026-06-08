import { FuelRefuelRequestStatus, FuelVehicleType } from '@prisma/client';
import {
  findEmployeeByCpf,
  isValidCpf,
  onlyDigits,
  resolveFuelRequestContextFromEmployee,
} from '../lib/employeeCpfLookup';
import {
  notifyFuelRequesterWaitingManager,
  notifyFuelRequesterWaitingSupplies,
} from '../lib/fuelRefuelChatNotify';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppFuelFlowStatus =
  | 'FUEL_ASK_REFUEL_DATE'
  | 'FUEL_ASK_ROUTE'
  | 'FUEL_ASK_DRIVER_CPF'
  | 'FUEL_ASK_VEHICLE'
  | 'FUEL_ASK_VEHICLE_TYPE'
  | 'FUEL_ASK_DASHBOARD_PHOTO'
  | 'FUEL_ASK_OBSERVATIONS'
  | 'FUEL_CONFIRM'
  | 'FUEL_COMPLETE';

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;

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

function brDateToIso(input: string): string | null {
  const trimmed = input.trim();
  const m1 = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m1) {
    let y = parseInt(m1[3], 10);
    if (y < 100) y += 2000;
    const d = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const m2 = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return trimmed;
  return null;
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function vehicleTypeLabel(type?: FuelVehicleType): string {
  if (type === FuelVehicleType.PRIVATE) return 'Particular (passa pelo gestor)';
  if (type === FuelVehicleType.COMPANY) return 'Frota / empresa (direto ao Suprimentos)';
  return '—';
}

function buildSummary(payload: Record<string, unknown>): string {
  return [
    'Resumo da solicitação de abastecimento:',
    `• Data: ${payload.refuelDate ? formatBrDate(String(payload.refuelDate)) : '—'}`,
    `• Rota: ${payload.route || '—'}`,
    `• Centro de custo: ${payload.costCenterLabel || payload.costCenter || '—'}`,
    `• Condutor: ${payload.driverName || '—'}${payload.driverCpfMasked ? ` (CPF ${payload.driverCpfMasked})` : ''}`,
    `• Veículo: ${payload.vehiclePlate || '—'}`,
    `• Tipo: ${vehicleTypeLabel(payload.vehicleType as FuelVehicleType | undefined)}`,
    `• Foto do painel: ${payload.dashboardPhotoUrl ? 'enviada' : '—'}`,
    `• Observações: ${String(payload.observations || '').trim() || '—'}`,
    '',
    'Confirma o envio? (sim / não)',
  ].join('\n');
}

export function isWhatsAppFuelFlowStatus(status: string): boolean {
  return status.startsWith('FUEL_') && !status.startsWith('FUEL_REPORT_');
}

export function isWhatsAppFuelMenuSelection(content: string): boolean {
  if (
    content === 'informar_abastecimento' ||
    content.includes('informar abastecimento') ||
    (content.includes('informar') && content.includes('abastec'))
  ) {
    return false;
  }
  return (
    content === 'combustivel' ||
    content.includes('combust') ||
    content.includes('gasolina') ||
    content.includes('diesel') ||
    content.includes('posto')
  );
}

export async function processWhatsAppFuelFlow(params: {
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
  newStatus: WhatsAppFuelFlowStatus | 'MENU';
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

  const startingFromMenu =
    flowStatus === 'MENU' && isWhatsAppFuelMenuSelection(content);
  if (!isWhatsAppFuelFlowStatus(flowStatus) && !startingFromMenu) {
    return null;
  }

  let newPayload: Record<string, unknown> = { ...payload, flow: 'FUEL' };
  let newStatus: WhatsAppFuelFlowStatus | 'MENU' = startingFromMenu
    ? 'FUEL_ASK_REFUEL_DATE'
    : (flowStatus as WhatsAppFuelFlowStatus);

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  if (startingFromMenu) {
    return {
      sendAction: waButtons(
        `Vamos solicitar o abastecimento!\n\nQual a data para abastecer? (DD/MM/AAAA)\nEx.: ${formatBrDate(todayIso())}`,
      ),
      newStatus: 'FUEL_ASK_REFUEL_DATE',
      newPayload,
    };
  }

  switch (newStatus) {
    case 'FUEL_ASK_REFUEL_DATE': {
      const iso = brDateToIso(textRaw);
      if (!iso) {
        return {
          sendAction: waButtons('Data inválida. Informe no formato DD/MM/AAAA (ex.: 08/06/2026).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.refuelDate = iso;
      return {
        sendAction: waButtons('Qual a rota?'),
        newStatus: 'FUEL_ASK_ROUTE',
        newPayload,
      };
    }

    case 'FUEL_ASK_ROUTE': {
      if (textRaw.length < 2) {
        return {
          sendAction: waButtons('Informe a rota (mínimo 2 caracteres).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.route = textRaw.trim();
      return {
        sendAction: waButtons(
          'Qual o CPF do condutor? (somente números — precisa estar cadastrado no sistema)',
        ),
        newStatus: 'FUEL_ASK_DRIVER_CPF',
        newPayload,
      };
    }

    case 'FUEL_ASK_DRIVER_CPF': {
      const cpfDigits = onlyDigits(textRaw);
      if (!cpfDigits || !isValidCpf(cpfDigits)) {
        return {
          sendAction: waButtons('CPF inválido. Envie os 11 dígitos do CPF do condutor.'),
          newStatus,
          newPayload,
        };
      }
      const employee = await findEmployeeByCpf(cpfDigits);
      if (!employee) {
        return {
          sendAction: waButtons(
            'Não encontrei colaborador cadastrado com esse CPF. Verifique o número ou fale com o RH/Suprimentos.',
          ),
          newStatus,
          newPayload,
        };
      }

      newPayload.driverName = employee.name;
      newPayload.driverCpfMasked = employee.cpfMasked;
      newPayload.driverEmployeeId = employee.employeeId;
      newPayload.requesterUserId = employee.userId;
      newPayload.costCenter = employee.costCenter;

      const ctx = await resolveFuelRequestContextFromEmployee(employee);
      if (!ctx.ok) {
        return {
          sendAction: waButtons(ctx.message),
          newStatus,
          newPayload,
        };
      }

      newPayload.contractId = ctx.contractId;
      newPayload.costCenterLabel = ctx.costCenterLabel;
      return {
        sendAction: waButtons(
          [
            `Identifiquei ${employee.name} (CPF ${employee.cpfMasked}).`,
            `Centro de custo: ${ctx.costCenterLabel}`,
            '',
            'Qual o veículo? Informe placa ou identificação (ex.: ABC1D23 — Strada).',
          ].join('\n'),
        ),
        newStatus: 'FUEL_ASK_VEHICLE',
        newPayload,
      };
    }

    case 'FUEL_ASK_VEHICLE': {
      if (textRaw.length < 2) {
        return {
          sendAction: waButtons('Informe a placa ou identificação do veículo.'),
          newStatus,
          newPayload,
        };
      }
      const parts = textRaw.split(/[—\-–]/).map((s) => s.trim());
      newPayload.vehiclePlate = parts[0] || textRaw;
      newPayload.vehicleDescription = parts.slice(1).join(' — ') || undefined;
      return {
        sendAction: {
          type: 'buttons',
          body:
            'É veículo particular (carro próprio do colaborador)?\n\n• Sim → passa pelo gestor\n• Não → vai direto ao Suprimentos',
          buttons: [
            { id: 'SIM', title: 'Sim' },
            { id: 'NAO', title: 'Não' },
            { id: 'MENU', title: 'Menu' },
          ],
        },
        newStatus: 'FUEL_ASK_VEHICLE_TYPE',
        newPayload,
      };
    }

    case 'FUEL_ASK_VEHICLE_TYPE': {
      if (content === 'sim' || content === 's') {
        newPayload.vehicleType = FuelVehicleType.PRIVATE;
      } else if (content === 'nao' || content === 'não' || content === 'n') {
        newPayload.vehicleType = FuelVehicleType.COMPANY;
      } else {
        return {
          sendAction: {
            type: 'buttons',
            body: 'Responda Sim se for veículo particular ou Não se for frota/veículo da empresa.',
            buttons: [
              { id: 'SIM', title: 'Sim' },
              { id: 'NAO', title: 'Não' },
              { id: 'MENU', title: 'Menu' },
            ],
          },
          newStatus,
          newPayload,
        };
      }
      return {
        sendAction: waButtons('Envie a foto do painel atual (odômetro) como imagem nesta conversa.'),
        newStatus: 'FUEL_ASK_DASHBOARD_PHOTO',
        newPayload,
      };
    }

    case 'FUEL_ASK_DASHBOARD_PHOTO': {
      if (!hasMedia || !savedMedia?.fileUrl) {
        return {
          sendAction: waButtons('Preciso da foto do painel. Envie uma imagem (pode mandar só a foto).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.dashboardPhotoUrl = savedMedia.fileUrl;
      newPayload.dashboardPhotoKey = savedMedia.fileKey;
      newPayload.dashboardPhotoName = savedMedia.fileName;
      return {
        sendAction: waButtons(
          'Alguma observação sobre a solicitação? (opcional — digite «não» para pular)',
        ),
        newStatus: 'FUEL_ASK_OBSERVATIONS',
        newPayload,
      };
    }

    case 'FUEL_ASK_OBSERVATIONS': {
      newPayload.observations = SKIP_WORDS.test(textRaw) ? '' : textRaw.trim();
      return {
        sendAction: waButtons(buildSummary(newPayload)),
        newStatus: 'FUEL_CONFIRM',
        newPayload,
      };
    }

    case 'FUEL_CONFIRM': {
      if (NO_WORDS.test(textRaw)) {
        return {
          sendAction: waButtons('Solicitação descartada. Escolha «Solicitar combustível» no menu para recomeçar.'),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
      if (!YES_WORDS.test(textRaw)) {
        return {
          sendAction: {
            type: 'buttons',
            body: 'Responda «sim» para confirmar ou «não» para cancelar.',
            buttons: [
              { id: 'SIM', title: 'Sim' },
              { id: 'NAO', title: 'Não' },
              { id: 'MENU', title: 'Menu' },
            ],
          },
          newStatus,
          newPayload,
        };
      }

      const requesterUserId = String(newPayload.requesterUserId || '');
      if (
        !requesterUserId ||
        !newPayload.refuelDate ||
        !newPayload.route ||
        !newPayload.contractId ||
        !newPayload.driverName ||
        !newPayload.vehiclePlate ||
        !newPayload.vehicleType ||
        !newPayload.dashboardPhotoUrl
      ) {
        return {
          sendAction: waButtons('Faltam dados. Volte ao menu e tente novamente.'),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }

      const created = await fuelRefuelRequestService.create({
        requesterId: requesterUserId,
        refuelDate: new Date(`${newPayload.refuelDate}T12:00:00`),
        route: String(newPayload.route),
        contractId: String(newPayload.contractId),
        driverName: String(newPayload.driverName),
        vehiclePlate: String(newPayload.vehiclePlate),
        vehicleDescription: (newPayload.vehicleDescription as string | undefined) || null,
        vehicleType: newPayload.vehicleType as FuelVehicleType,
        dashboardPhotoUrl: String(newPayload.dashboardPhotoUrl),
        dashboardPhotoKey: (newPayload.dashboardPhotoKey as string | undefined) || null,
        dashboardPhotoName: (newPayload.dashboardPhotoName as string | undefined) || null,
        observations: (newPayload.observations as string | undefined) || null,
        sourceWhatsAppPhone: phone,
      });

      if (created.status === FuelRefuelRequestStatus.PENDING_MANAGER) {
        await notifyFuelRequesterWaitingManager(null, created.displayNumber, phone);
      } else {
        await notifyFuelRequesterWaitingSupplies(null, created.displayNumber, phone);
      }

      return {
        sendAction: {
          type: 'buttons',
          body: [
            `Solicitação #${created.displayNumber} registrada com sucesso!`,
            'Você receberá atualizações aqui no WhatsApp conforme a solicitação avançar.',
          ].join('\n'),
          buttons: [
            { id: 'COMBUSTIVEL', title: 'Nova solicitação' },
            { id: 'MENU', title: 'Menu principal' },
            { id: 'END', title: 'Encerrar' },
          ],
        },
        newStatus: 'FUEL_COMPLETE',
        newPayload: { flow: 'FUEL', lastDisplayNumber: created.displayNumber },
        newConversationStatus: 'COMPLETED',
      };
    }

    case 'FUEL_COMPLETE': {
      if (isWhatsAppFuelMenuSelection(content)) {
        return {
          sendAction: waButtons(
            `Vamos solicitar o abastecimento!\n\nQual a data para abastecer? (DD/MM/AAAA)\nEx.: ${formatBrDate(todayIso())}`,
          ),
          newStatus: 'FUEL_ASK_REFUEL_DATE',
          newPayload: { flow: 'FUEL' },
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
