import { FuelRefuelRequestStatus, FuelVehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  findEmployeeByCpf,
  isValidCpf,
  onlyDigits,
  resolveContractForEmployee,
} from '../lib/employeeCpfLookup';
import {
  notifyFuelRequesterWaitingManager,
  notifyFuelRequesterWaitingSupplies,
} from '../lib/fuelRefuelChatNotify';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';

const FLOW_TYPE = 'FUEL_REFUEL';

type FuelFlowStep =
  | 'MENU'
  | 'ASK_REFUEL_DATE'
  | 'ASK_ROUTE'
  | 'ASK_DRIVER_CPF'
  | 'ASK_CONTRACT'
  | 'ASK_VEHICLE'
  | 'ASK_VEHICLE_TYPE'
  | 'ASK_DASHBOARD_PHOTO'
  | 'ASK_OBSERVATIONS'
  | 'CONFIRM';

type FuelFlowPayload = {
  refuelDate?: string;
  route?: string;
  contractId?: string;
  contractLabel?: string;
  driverName?: string;
  driverCpfMasked?: string;
  driverEmployeeId?: string;
  vehiclePlate?: string;
  vehicleDescription?: string;
  vehicleType?: FuelVehicleType;
  dashboardPhotoUrl?: string;
  dashboardPhotoKey?: string;
  dashboardPhotoName?: string;
  observations?: string;
  contractOptions?: Array<{ id: string; label: string }>;
};

const FUEL_INTENT =
  /\b(combust[ií]vel|abastecer|abastecimento|gasolina|diesel|posto)\b/i;

const CANCEL_WORDS = /^(cancelar|cancela|sair|parar|desistir)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;
const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;

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

async function getActiveSession(chatId: string, userId: string) {
  return prisma.gennecyChatFlowSession.findUnique({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
  });
}

async function upsertSession(
  chatId: string,
  userId: string,
  step: FuelFlowStep,
  payload: FuelFlowPayload,
) {
  return prisma.gennecyChatFlowSession.upsert({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
    create: {
      chatId,
      userId,
      flowType: FLOW_TYPE,
      step,
      payload,
      status: 'ACTIVE',
    },
    update: { step, payload, status: 'ACTIVE' },
  });
}

async function completeSession(chatId: string, userId: string) {
  await prisma.gennecyChatFlowSession.updateMany({
    where: { chatId, userId, flowType: FLOW_TYPE, status: 'ACTIVE' },
    data: { status: 'COMPLETED' },
  });
}

async function cancelSession(chatId: string, userId: string) {
  await prisma.gennecyChatFlowSession.updateMany({
    where: { chatId, userId, flowType: FLOW_TYPE, status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  });
}

async function loadContractOptions(): Promise<Array<{ id: string; label: string }>> {
  const rows = await prisma.contract.findMany({
    select: { id: true, name: true, number: true },
    orderBy: [{ name: 'asc' }],
    take: 30,
  });
  return rows.map((c) => ({
    id: c.id,
    label: `${c.number} — ${c.name}`,
  }));
}

function formatContractList(options: Array<{ id: string; label: string }>): string {
  if (options.length === 0) {
    return 'Nenhum contrato cadastrado no sistema. Informe o número do contrato:';
  }
  const lines = options.map((o, i) => `${i + 1}. ${o.label}`);
  return `Escolha o contrato (digite o número da opção):\n${lines.join('\n')}`;
}

function resolveContractChoice(
  input: string,
  options: Array<{ id: string; label: string }>,
): { id: string; label: string } | null {
  const trimmed = input.trim();
  const asIndex = parseInt(trimmed, 10);
  if (Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= options.length) {
    return options[asIndex - 1];
  }
  const lower = trimmed.toLowerCase();
  const byNumber = options.find((o) => o.label.toLowerCase().startsWith(lower));
  if (byNumber) return byNumber;
  const byContains = options.find(
    (o) => o.label.toLowerCase().includes(lower) || o.id === trimmed,
  );
  return byContains ?? null;
}

function vehicleTypeLabel(type?: FuelVehicleType): string {
  if (type === FuelVehicleType.PRIVATE) return 'Particular (passa pelo gestor)';
  if (type === FuelVehicleType.COMPANY) return 'Frota / empresa (direto ao Suprimentos)';
  return '—';
}

function buildSummary(payload: FuelFlowPayload): string {
  const routing =
    payload.vehicleType === FuelVehicleType.PRIVATE
      ? 'Após confirmar, seguirá para aprovação do gestor e depois Suprimentos.'
      : 'Após confirmar, seguirá direto para a fila do Suprimentos.';

  return [
    '📋 Resumo da solicitação de abastecimento:',
    `• Data para abastecer: ${payload.refuelDate ? formatBrDate(payload.refuelDate) : '—'}`,
    `• Rota: ${payload.route || '—'}`,
    `• Contrato: ${payload.contractLabel || '—'}`,
    `• Condutor: ${payload.driverName || '—'}${payload.driverCpfMasked ? ` (CPF ${payload.driverCpfMasked})` : ''}`,
    `• Veículo: ${payload.vehiclePlate || '—'}`,
    `• Tipo: ${vehicleTypeLabel(payload.vehicleType)}`,
    `• Foto do painel: ${payload.dashboardPhotoUrl ? '✅ enviada' : '—'}`,
    `• Observações: ${payload.observations?.trim() || '—'}`,
    '',
    routing,
    '',
    'Confirma o envio? (sim / não)',
  ].join('\n');
}

export function messageHasFuelIntent(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  if (/^1$/.test(text)) return true;
  return FUEL_INTENT.test(text);
}

export function messageStartsFuelMenu(body: string): boolean {
  const text = body.trim().toLowerCase();
  return text === 'menu' || text === 'opções' || text === 'opcoes' || text === 'ajuda';
}

export const GENNECY_FUEL_MENU_MESSAGE = [
  'Olá! Sou a Gennecy. Como posso ajudar?',
  '',
  'Digite o número da opção:',
  '1 — Solicitar abastecimento de combustível',
  '2 — Criar task no Tasks (ex.: «criar task sobre …»)',
  '3 — Outra pergunta',
  '4 — Informar abastecimento (após aprovação do Suprimentos)',
  '',
  'A qualquer momento, digite «cancelar» para sair de um fluxo.',
].join('\n');

export class GennecyFuelFlowService {
  async hasActiveFlow(chatId: string, userId: string): Promise<boolean> {
    const session = await getActiveSession(chatId, userId);
    return Boolean(session && session.status === 'ACTIVE' && session.step !== 'MENU');
  }

  async processMessage(params: {
    chatId: string;
    userId: string;
    content: string;
    messageId?: string;
  }): Promise<{ handled: boolean; reply: string }> {
    const body = params.content.trim();
    const session = await getActiveSession(params.chatId, params.userId);
    const payload = (session?.payload ?? {}) as FuelFlowPayload;
    const step = (session?.step ?? 'MENU') as FuelFlowStep;

    if (CANCEL_WORDS.test(body)) {
      if (session?.status === 'ACTIVE' && step !== 'MENU') {
        await cancelSession(params.chatId, params.userId);
        return { handled: true, reply: 'Solicitação cancelada. Se precisar, digite «1» para abastecimento ou faça outra pergunta.' };
      }
    }

    if (messageStartsFuelMenu(body)) {
      await upsertSession(params.chatId, params.userId, 'MENU', {});
      return { handled: true, reply: GENNECY_FUEL_MENU_MESSAGE };
    }

    const inActiveFlow = session?.status === 'ACTIVE' && step !== 'MENU';
    const wantsFuel = messageHasFuelIntent(body);

    if (!inActiveFlow && !wantsFuel) {
      if (body === '2') {
        return {
          handled: true,
          reply:
            'Para criar um card no Tasks, digite por exemplo:\n«criar task sobre integração com calendário, urgente, prazo até 30/06/2026»',
        };
      }
      if (body === '3') {
        return { handled: false, reply: '' };
      }
      if (body === '4') {
        return { handled: false, reply: '' };
      }
      return { handled: false, reply: '' };
    }

    if (!inActiveFlow && wantsFuel) {
      await upsertSession(params.chatId, params.userId, 'ASK_REFUEL_DATE', {});
      return {
        handled: true,
        reply: `Vamos solicitar o abastecimento! ⛽\n\nQual a data para abastecer? (ex.: ${formatBrDate(todayIso())})`,
      };
    }

    switch (step) {
      case 'ASK_REFUEL_DATE': {
        const iso = brDateToIso(body);
        if (!iso) {
          return {
            handled: true,
            reply: 'Data inválida. Informe no formato DD/MM/AAAA (ex.: 08/06/2026).',
          };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_ROUTE', {
          ...payload,
          refuelDate: iso,
        });
        return { handled: true, reply: 'Qual a rota?' };
      }

      case 'ASK_ROUTE': {
        if (body.length < 2) {
          return { handled: true, reply: 'Informe a rota (mínimo 2 caracteres).' };
        }
        const contractOptions = await loadContractOptions();
        await upsertSession(params.chatId, params.userId, 'ASK_DRIVER_CPF', {
          ...payload,
          route: body,
        });
        return {
          handled: true,
          reply:
            'Qual o **CPF do condutor**? (somente números — precisa estar cadastrado no sistema)',
        };
      }

      case 'ASK_DRIVER_CPF': {
        const cpfDigits = onlyDigits(body);
        if (!cpfDigits) {
          return {
            handled: true,
            reply: 'Não recebi o CPF. Envie os 11 dígitos (somente números).',
          };
        }
        if (!isValidCpf(cpfDigits)) {
          return {
            handled: true,
            reply: 'CPF inválido. Confira e envie novamente os 11 dígitos.',
          };
        }

        const employee = await findEmployeeByCpf(cpfDigits);
        if (!employee) {
          return {
            handled: true,
            reply:
              'Não encontrei colaborador cadastrado com esse CPF. Verifique o número ou fale com o RH/Suprimentos.',
          };
        }

        const contract = await resolveContractForEmployee(employee.costCenter);
        if (contract) {
          await upsertSession(params.chatId, params.userId, 'ASK_VEHICLE', {
            ...payload,
            driverName: employee.name,
            driverCpfMasked: employee.cpfMasked,
            driverEmployeeId: employee.employeeId,
            contractId: contract.id,
            contractLabel: contract.label,
          });
          return {
            handled: true,
            reply: [
              `✅ Identifiquei **${employee.name}** (CPF ${employee.cpfMasked}).`,
              `Contrato vinculado: **${contract.label}**`,
              employee.costCenter
                ? `(centro de custo: ${employee.costCenter})`
                : '',
              '',
              'Qual o veículo? Informe a placa ou identificação (ex.: ABC1D23 — Strada).',
            ]
              .filter(Boolean)
              .join('\n'),
          };
        }

        const contractOptions = await loadContractOptions();
        await upsertSession(params.chatId, params.userId, 'ASK_CONTRACT', {
          ...payload,
          driverName: employee.name,
          driverCpfMasked: employee.cpfMasked,
          driverEmployeeId: employee.employeeId,
          contractOptions,
        });
        return {
          handled: true,
          reply: [
            `✅ Identifiquei **${employee.name}** (CPF ${employee.cpfMasked}).`,
            employee.costCenter
              ? `Não encontrei contrato vinculado ao centro de custo **${employee.costCenter}**.`
              : 'Este colaborador não tem centro de custo cadastrado.',
            '',
            formatContractList(contractOptions),
          ].join('\n'),
        };
      }

      case 'ASK_CONTRACT': {
        const options = payload.contractOptions ?? (await loadContractOptions());
        const chosen = resolveContractChoice(body, options);
        if (!chosen) {
          return {
            handled: true,
            reply: `Opção inválida. ${formatContractList(options)}`,
          };
        }
        await upsertSession(params.chatId, params.userId, 'ASK_VEHICLE', {
          ...payload,
          contractId: chosen.id,
          contractLabel: chosen.label,
        });
        return {
          handled: true,
          reply: `Contrato **${chosen.label}** selecionado.\n\nQual o veículo? Informe a placa ou identificação (ex.: ABC1D23 — Strada).`,
        };
      }

      case 'ASK_VEHICLE': {
        if (body.length < 2) {
          return { handled: true, reply: 'Informe a placa ou identificação do veículo.' };
        }
        const parts = body.split(/[—\-–]/).map((s) => s.trim());
        const plate = parts[0] || body;
        const description = parts.slice(1).join(' — ') || undefined;
        await upsertSession(params.chatId, params.userId, 'ASK_VEHICLE_TYPE', {
          ...payload,
          vehiclePlate: plate,
          vehicleDescription: description,
        });
        return {
          handled: true,
          reply:
            'É veículo particular (carro próprio do colaborador)?\nDigite «sim» ou «não».\n\n• Sim → a solicitação passa pelo gestor antes do Suprimentos.\n• Não → vai direto para o Suprimentos.',
        };
      }

      case 'ASK_VEHICLE_TYPE': {
        if (YES_WORDS.test(body)) {
          await upsertSession(params.chatId, params.userId, 'ASK_DASHBOARD_PHOTO', {
            ...payload,
            vehicleType: FuelVehicleType.PRIVATE,
          });
        } else if (NO_WORDS.test(body)) {
          await upsertSession(params.chatId, params.userId, 'ASK_DASHBOARD_PHOTO', {
            ...payload,
            vehicleType: FuelVehicleType.COMPANY,
          });
        } else {
          return {
            handled: true,
            reply: 'Responda «sim» se for veículo particular ou «não» se for frota/veículo da empresa.',
          };
        }
        return {
          handled: true,
          reply: 'Envie a foto do painel atual (odômetro) como anexo nesta conversa.',
        };
      }

      case 'ASK_DASHBOARD_PHOTO': {
        let photoUrl: string | null = null;
        let photoKey: string | null = null;
        let photoName: string | null = null;

        if (params.messageId) {
          const msg = await prisma.message.findUnique({
            where: { id: params.messageId },
            include: {
              attachments: {
                where: {
                  OR: [
                    { mimeType: { startsWith: 'image/' } },
                    { fileName: { endsWith: '.jpg' } },
                    { fileName: { endsWith: '.jpeg' } },
                    { fileName: { endsWith: '.png' } },
                    { fileName: { endsWith: '.webp' } },
                  ],
                },
                take: 1,
              },
            },
          });
          const att = msg?.attachments?.[0];
          if (att) {
            photoUrl = att.fileUrl;
            photoKey = att.fileKey;
            photoName = att.fileName;
          }
        }

        if (!photoUrl) {
          return {
            handled: true,
            reply: 'Preciso da foto do painel. Envie uma imagem como anexo (pode enviar só a foto, sem texto).',
          };
        }

        await upsertSession(params.chatId, params.userId, 'ASK_OBSERVATIONS', {
          ...payload,
          dashboardPhotoUrl: photoUrl,
          dashboardPhotoKey: photoKey ?? undefined,
          dashboardPhotoName: photoName ?? undefined,
        });
        return {
          handled: true,
          reply: 'Alguma observação sobre a solicitação? (opcional — digite «não» para pular)',
        };
      }

      case 'ASK_OBSERVATIONS': {
        const observations = SKIP_WORDS.test(body) ? '' : body;
        const nextPayload: FuelFlowPayload = { ...payload, observations };
        await upsertSession(params.chatId, params.userId, 'CONFIRM', nextPayload);
        return { handled: true, reply: buildSummary(nextPayload) };
      }

      case 'CONFIRM': {
        if (NO_WORDS.test(body)) {
          await cancelSession(params.chatId, params.userId);
          return {
            handled: true,
            reply: 'Solicitação descartada. Digite «1» se quiser começar de novo.',
          };
        }
        if (!YES_WORDS.test(body)) {
          return { handled: true, reply: 'Responda «sim» para confirmar ou «não» para cancelar.' };
        }

        if (
          !payload.refuelDate ||
          !payload.route ||
          !payload.contractId ||
          !payload.driverName ||
          !payload.vehiclePlate ||
          !payload.vehicleType ||
          !payload.dashboardPhotoUrl
        ) {
          await cancelSession(params.chatId, params.userId);
          return {
            handled: true,
            reply: 'Faltam dados na solicitação. Digite «1» para recomeçar.',
          };
        }

        const created = await fuelRefuelRequestService.create({
          requesterId: params.userId,
          refuelDate: new Date(`${payload.refuelDate}T12:00:00`),
          route: payload.route,
          contractId: payload.contractId,
          driverName: payload.driverName,
          vehiclePlate: payload.vehiclePlate,
          vehicleDescription: payload.vehicleDescription,
          vehicleType: payload.vehicleType,
          dashboardPhotoUrl: payload.dashboardPhotoUrl,
          dashboardPhotoKey: payload.dashboardPhotoKey,
          dashboardPhotoName: payload.dashboardPhotoName,
          observations: payload.observations,
          sourceChatId: params.chatId,
        });

        await completeSession(params.chatId, params.userId);

        if (created.status === FuelRefuelRequestStatus.PENDING_MANAGER) {
          await notifyFuelRequesterWaitingManager(created.sourceChatId, created.displayNumber);
        } else {
          await notifyFuelRequesterWaitingSupplies(created.sourceChatId, created.displayNumber);
        }

        return {
          handled: true,
          reply: [
            `✅ Solicitação #${created.displayNumber} registrada com sucesso!`,
            'Você receberá atualizações aqui conforme a solicitação avançar.',
            '',
            'Precisa de mais alguma coisa?',
          ].join('\n'),
        };
      }

      default:
        return { handled: false, reply: '' };
    }
  }
}

export const gennecyFuelFlowService = new GennecyFuelFlowService();
