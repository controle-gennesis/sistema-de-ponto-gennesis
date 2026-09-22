import { FuelRefuelRequestStatus, FuelVehicleType, VehicleUsageType } from '@prisma/client';
import {
  findEmployeeByCpf,
  isValidCpf,
  onlyDigits,
} from '../lib/employeeCpfLookup';
import { prisma } from '../lib/prisma';
import {
  findActiveVehicleByPlate,
  mapVehicleUsageToFuelType,
} from '../lib/fuelAdministrativeRegions';
import { buildFuelSubmissionSlaLine } from '../lib/fuelRefuelChatNotify';
import {
  buildFuelFlowStartMessage,
  formatFuelAttendanceHoursShort,
  formatFuelOutsideHoursWarning,
} from '../lib/fuelAttendanceHours';
import { hasStoredPhoto, isWhatsAppSavedMediaReady } from '../lib/flowMedia';
import {
  findActiveVehiclesByPlateSuffix,
  formatVehiclePlateOptionLabel,
} from '../lib/fuelVehiclePlateLookup';
import { formatPlacaDisplay } from '../lib/brazilianVehiclePlate';
import { fuelRefuelRequestService } from './FuelRefuelRequestService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppFuelFlowStatus =
  | 'FUEL_ASK_REFUEL_DATE'
  | 'FUEL_ASK_ROUTE'
  | 'FUEL_ASK_DRIVER_CPF'
  | 'FUEL_SELECT_CONTRACT'
  | 'FUEL_ASK_PLATE_SUFFIX'
  | 'FUEL_SELECT_VEHICLE'
  | 'FUEL_ASK_VEHICLE_MANUAL'
  | 'FUEL_ASK_DASHBOARD_PHOTO'
  | 'FUEL_ASK_OBSERVATIONS'
  | 'FUEL_CONFIRM'
  | 'FUEL_COMPLETE';

type VehicleOptionPayload = {
  id: string;
  plate: string;
  description?: string;
  frotaPartic: VehicleUsageType | null;
};

type ContractOptionPayload = {
  id: string;
  name: string;
  number: string;
};

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;
/** WhatsApp lista no máx. 10 linhas; 1 reservada para “Mais contratos”. */
const CONTRACT_LIST_PAGE_SIZE = 9;
const CONTRACT_OTHERS_ID = 'fuel_contract_others';
const FUEL_DATE_TODAY_ID = 'fuel_date_today';

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

function askRefuelDateAction(body: string): SendAction {
  return waButtons(body, [
    { id: FUEL_DATE_TODAY_ID, title: 'Hoje' },
    { id: 'MENU', title: 'Menu' },
    { id: 'END', title: 'Encerrar' },
  ]);
}

function isFuelDateTodaySelection(content: string, textRaw: string): boolean {
  if (content === FUEL_DATE_TODAY_ID || content === 'hoje') return true;
  return /^hoje$/i.test(textRaw.trim());
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
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function vehicleTypeLabel(type?: FuelVehicleType): string {
  if (type === FuelVehicleType.PRIVATE) return 'Particular';
  if (type === FuelVehicleType.COMPANY) return 'Frota';
  return '—';
}

function buildSummary(payload: Record<string, unknown>): string {
  const vehicleDescription = String(payload.vehicleDescription || '').trim();

  return [
    'Resumo da solicitação de abastecimento:',
    `• Data: ${payload.refuelDate ? formatBrDate(String(payload.refuelDate)) : '—'}`,
    `• Rota: ${payload.route || '—'}`,
    `• Contrato: ${payload.costCenterLabel || payload.costCenter || '—'}`,
    `• Condutor: ${payload.driverName || '—'}${payload.driverCpfMasked ? ` (CPF ${payload.driverCpfMasked})` : ''}`,
    `• Veículo: ${payload.vehiclePlate || '—'}`,
    ...(vehicleDescription ? [`• Modelo: ${vehicleDescription}`] : []),
    `• Tipo: ${vehicleTypeLabel(payload.vehicleType as FuelVehicleType | undefined)}`,
    `• Foto do painel: ${hasStoredPhoto(payload.dashboardPhotoUrl, payload.dashboardPhotoKey) ? 'enviada' : '—'}`,
    `• Observações: ${String(payload.observations || '').trim() || '—'}`,
    '',
    'Confirma o envio? (sim / não)',
  ].join('\n');
}

function getVehicleOptions(payload: Record<string, unknown>): VehicleOptionPayload[] {
  return (payload.vehicleOptions as VehicleOptionPayload[] | undefined) ?? [];
}

function truncateWaTitle(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 21)}...`;
}

function toContractOption(row: {
  id: string;
  name: string;
  number: string;
}): ContractOptionPayload {
  return {
    id: row.id,
    name: row.name.trim() || row.number,
    number: row.number,
  };
}

/** Contratos ordenados pelos que mais têm abastecimentos (depois por nome). */
async function listContractsByRefuelFrequency(): Promise<ContractOptionPayload[]> {
  const [rows, counts] = await Promise.all([
    prisma.contract.findMany({
      select: { id: true, name: true, number: true },
    }),
    prisma.fuelRefuelRequest.groupBy({
      by: ['contractId'],
      where: { contractId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countById = new Map<string, number>();
  for (const row of counts) {
    if (!row.contractId) continue;
    countById.set(row.contractId, row._count._all);
  }

  return rows
    .map((row) => ({
      ...toContractOption(row),
      refuelCount: countById.get(row.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.refuelCount !== a.refuelCount) return b.refuelCount - a.refuelCount;
      return a.name.localeCompare(b.name, 'pt-BR');
    })
    .map(({ id, name, number }) => ({ id, name, number }));
}

/** Último contrato usado por este colaborador (user) ou por este WhatsApp. */
async function findLastUsedContract(params: {
  requesterUserId?: string | null;
  phone?: string | null;
}): Promise<ContractOptionPayload | null> {
  const or: Array<{ requesterId?: string; sourceWhatsAppPhone?: string }> = [];
  if (params.requesterUserId) {
    or.push({ requesterId: params.requesterUserId });
  }
  if (params.phone) {
    or.push({ sourceWhatsAppPhone: params.phone });
  }
  if (!or.length) return null;

  const last = await prisma.fuelRefuelRequest.findFirst({
    where: {
      contractId: { not: null },
      status: { not: FuelRefuelRequestStatus.CANCELLED },
      OR: or,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      contract: { select: { id: true, name: true, number: true } },
    },
  });

  return last?.contract ? toContractOption(last.contract) : null;
}

function getContractOptions(payload: Record<string, unknown>): ContractOptionPayload[] {
  return (payload.contractOptions as ContractOptionPayload[] | undefined) ?? [];
}

function getSuggestedContract(payload: Record<string, unknown>): ContractOptionPayload | null {
  const suggested = payload.suggestedContract as ContractOptionPayload | undefined;
  if (suggested?.id) return suggested;
  const options = getContractOptions(payload);
  const suggestedId = String(payload.suggestedContractId || '').trim();
  if (!suggestedId) return null;
  return options.find((item) => item.id === suggestedId) ?? null;
}

function buildLastContractSuggestionAction(
  last: ContractOptionPayload,
  driverName: string,
): SendAction {
  return waButtons(
    [
      `Identifiquei ${driverName}.`,
      `Último contrato usado: ${last.name}`,
      '',
      'Confirma este contrato ou deseja ver outros?',
    ].join('\n'),
    [
      { id: `fuel_contract_${last.id}`, title: 'Usar este' },
      { id: CONTRACT_OTHERS_ID, title: 'Outros contratos' },
      { id: 'MENU', title: 'Menu' },
    ],
  );
}

function buildContractListAction(
  options: ContractOptionPayload[],
  page: number,
  driverName: string,
): SendAction {
  const start = Math.max(0, page) * CONTRACT_LIST_PAGE_SIZE;
  const slice = options.slice(start, start + CONTRACT_LIST_PAGE_SIZE);
  const hasMore = start + CONTRACT_LIST_PAGE_SIZE < options.length;
  const rows = slice.map((contract) => ({
    id: `fuel_contract_${contract.id}`,
    title: truncateWaTitle(contract.name),
  }));
  if (hasMore) {
    rows.push({
      id: `fuel_contract_more_${page + 1}`,
      title: 'Mais contratos…',
    });
  }
  const intro =
    page === 0
      ? [`Identifiquei ${driverName}.`, 'Selecione o contrato desta solicitação:']
      : ['Mais contratos — selecione:'];
  return waList(intro.join('\n'), rows, 'Ver contratos');
}

function isContractOthersSelection(content: string, textRaw: string): boolean {
  if (content === CONTRACT_OTHERS_ID) return true;
  const normalized = textRaw.trim().toLowerCase();
  return (
    normalized === 'outros contratos' ||
    normalized === 'outros' ||
    normalized === 'outro contrato'
  );
}

function parseContractSelection(
  content: string,
  textRaw: string,
  payload: Record<string, unknown>,
): ContractOptionPayload | null {
  if (isContractOthersSelection(content, textRaw)) return null;

  const options = getContractOptions(payload);
  const fromId = content.match(/^fuel_contract_(?!more_|others$)(.+)$/i);
  if (fromId) {
    const id = fromId[1].trim();
    const fromOptions = options.find((item) => item.id === id);
    if (fromOptions) return fromOptions;
    const suggested = getSuggestedContract(payload);
    return suggested?.id === id ? suggested : null;
  }

  const nameCandidate = textRaw.trim().toLowerCase();
  if (!nameCandidate) return null;
  const suggested = getSuggestedContract(payload);
  if (suggested && suggested.name.trim().toLowerCase() === nameCandidate) {
    return suggested;
  }
  return (
    options.find((item) => item.name.trim().toLowerCase() === nameCandidate) ||
    options.find((item) => item.number.trim().toLowerCase() === nameCandidate) ||
    null
  );
}

function parseContractMorePage(content: string): number | null {
  const m = content.match(/^fuel_contract_more_(\d+)$/i);
  if (!m) return null;
  const page = parseInt(m[1], 10);
  return Number.isFinite(page) && page >= 0 ? page : null;
}

function parseVehicleSelection(
  content: string,
  payload: Record<string, unknown>,
): VehicleOptionPayload | null {
  const fromId = content.match(/^fuel_vehicle_(.+)$/);
  if (!fromId) return null;
  return getVehicleOptions(payload).find((item) => item.id === fromId[1]) ?? null;
}

function applyVehicleToPayload(
  payload: Record<string, unknown>,
  option: VehicleOptionPayload,
): Record<string, unknown> {
  return {
    ...payload,
    vehiclePlate: option.plate,
    vehicleDescription: option.description,
    vehicleType: mapVehicleUsageToFuelType(option.frotaPartic),
    vehicleId: option.id,
  };
}

function askDashboardPhoto(payload: Record<string, unknown>) {
  return {
    sendAction: waButtons('Envie a foto do painel atual (odômetro) como imagem nesta conversa.'),
    newStatus: 'FUEL_ASK_DASHBOARD_PHOTO' as const,
    newPayload: payload,
  };
}

function buildVehicleListAction(
  matches: VehicleOptionPayload[],
  suffix: string,
): SendAction {
  return waList(
    matches.length === 1
      ? 'Encontrei este veículo com esse final de placa. Confirme a seleção:'
      : `Encontrei ${matches.length} veículos com final ${suffix}. Selecione o correto:`,
    matches.map((vehicle) => ({
      id: `fuel_vehicle_${vehicle.id}`,
      title: formatVehiclePlateOptionLabel(vehicle.plate, vehicle.description),
    })),
    'Ver veículos',
  );
}

function mapMatchesToOptions(
  matches: Awaited<ReturnType<typeof findActiveVehiclesByPlateSuffix>>,
): VehicleOptionPayload[] {
  return matches.map((vehicle) => ({
    id: vehicle.id,
    plate: formatPlacaDisplay(vehicle.placaVeic),
    description: [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim() || undefined,
    frotaPartic: vehicle.frotaPartic,
  }));
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
      sendAction: askRefuelDateAction(
        buildFuelFlowStartMessage(
          `Qual a data para abastecer?\nEx.: ${formatBrDate(todayIso())}`,
        ),
      ),
      newStatus: 'FUEL_ASK_REFUEL_DATE',
      newPayload,
    };
  }

  switch (newStatus) {
    case 'FUEL_ASK_REFUEL_DATE': {
      const iso = isFuelDateTodaySelection(content, textRaw)
        ? todayIso()
        : brDateToIso(textRaw);
      if (!iso) {
        return {
          sendAction: askRefuelDateAction(
            'Data inválida. Informe no formato DD/MM/AAAA (ex.: 08/06/2026) ou toque em «Hoje».',
          ),
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
        sendAction: waButtons('Qual o CPF do condutor?'),
        newStatus: 'FUEL_ASK_DRIVER_CPF',
        newPayload,
      };
    }

    case 'FUEL_ASK_DRIVER_CPF': {
      const cpfDigits = onlyDigits(textRaw);
      if (!cpfDigits || !isValidCpf(cpfDigits)) {
        return {
          sendAction: waButtons(
            'CPF inválido. Envie o CPF do condutor (com ou sem pontuação).',
          ),
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

      const contracts = await listContractsByRefuelFrequency();
      if (!contracts.length) {
        return {
          sendAction: waButtons(
            'Não há contratos cadastrados no sistema. Fale com o Suprimentos/Administração.',
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
      newPayload.contractOptions = contracts;
      newPayload.contractListPage = 0;
      delete newPayload.contractId;
      delete newPayload.costCenterLabel;
      delete newPayload.suggestedContractId;
      delete newPayload.suggestedContract;

      const lastContract = await findLastUsedContract({
        requesterUserId: employee.userId,
        phone,
      });

      if (lastContract) {
        newPayload.suggestedContractId = lastContract.id;
        newPayload.suggestedContract = lastContract;
        newPayload.contractSelectMode = 'suggest';
        return {
          sendAction: buildLastContractSuggestionAction(lastContract, employee.name),
          newStatus: 'FUEL_SELECT_CONTRACT',
          newPayload,
        };
      }

      newPayload.contractSelectMode = 'list';
      return {
        sendAction: buildContractListAction(contracts, 0, employee.name),
        newStatus: 'FUEL_SELECT_CONTRACT',
        newPayload,
      };
    }

    case 'FUEL_SELECT_CONTRACT': {
      const driverName = String(newPayload.driverName || 'condutor');
      const options = getContractOptions(newPayload);

      if (isContractOthersSelection(content, textRaw)) {
        if (!options.length) {
          return {
            sendAction: waButtons('Envie novamente o CPF do condutor.'),
            newStatus: 'FUEL_ASK_DRIVER_CPF',
            newPayload,
          };
        }
        newPayload.contractSelectMode = 'list';
        newPayload.contractListPage = 0;
        return {
          sendAction: buildContractListAction(options, 0, driverName),
          newStatus,
          newPayload,
        };
      }

      const morePage = parseContractMorePage(content);
      if (morePage != null) {
        if (!options.length) {
          return {
            sendAction: waButtons('Envie novamente o CPF do condutor.'),
            newStatus: 'FUEL_ASK_DRIVER_CPF',
            newPayload,
          };
        }
        newPayload.contractSelectMode = 'list';
        newPayload.contractListPage = morePage;
        return {
          sendAction: buildContractListAction(options, morePage, driverName),
          newStatus,
          newPayload,
        };
      }

      const selected = parseContractSelection(content, textRaw, newPayload);
      if (!selected) {
        if (newPayload.contractSelectMode === 'suggest') {
          const suggested = getSuggestedContract(newPayload);
          if (suggested) {
            return {
              sendAction: buildLastContractSuggestionAction(suggested, driverName),
              newStatus,
              newPayload,
            };
          }
        }
        const page = Number(newPayload.contractListPage || 0);
        if (!options.length) {
          return {
            sendAction: waButtons('Envie novamente o CPF do condutor.'),
            newStatus: 'FUEL_ASK_DRIVER_CPF',
            newPayload,
          };
        }
        return {
          sendAction: buildContractListAction(options, page, driverName),
          newStatus,
          newPayload,
        };
      }

      newPayload.contractId = selected.id;
      newPayload.costCenterLabel = selected.name;
      return {
        sendAction: waButtons(
          [
            `Contrato selecionado: ${selected.name}.`,
            '',
            'Informe os 2 últimos dígitos da placa do veículo.',
          ].join('\n'),
        ),
        newStatus: 'FUEL_ASK_PLATE_SUFFIX',
        newPayload,
      };
    }

    case 'FUEL_ASK_PLATE_SUFFIX': {
      const suffix = onlyDigits(textRaw);
      if (suffix.length !== 2) {
        return {
          sendAction: waButtons('Informe exatamente os 2 últimos dígitos da placa (ex.: 23).'),
          newStatus,
          newPayload,
        };
      }

      const matches = mapMatchesToOptions(await findActiveVehiclesByPlateSuffix(suffix));
      if (!matches.length) {
        return {
          sendAction: waButtons(
            'Não encontrei veículo da frota com esse final de placa.\n\nInforme a placa completa do veículo (ex.: ABC1D23).',
          ),
          newStatus: 'FUEL_ASK_VEHICLE_MANUAL',
          newPayload,
        };
      }

      newPayload.vehicleOptions = matches;
      newPayload.plateSuffix = suffix;
      return {
        sendAction: buildVehicleListAction(matches, suffix),
        newStatus: 'FUEL_SELECT_VEHICLE',
        newPayload,
      };
    }

    case 'FUEL_SELECT_VEHICLE': {
      const selected = parseVehicleSelection(content, newPayload);
      if (!selected) {
        const options = getVehicleOptions(newPayload);
        if (!options.length) {
          return {
            sendAction: waButtons('Informe novamente os 2 últimos dígitos da placa.'),
            newStatus: 'FUEL_ASK_PLATE_SUFFIX',
            newPayload,
          };
        }
        const suffix = String(newPayload.plateSuffix || '');
        return {
          sendAction: buildVehicleListAction(options, suffix),
          newStatus,
          newPayload,
        };
      }

      return askDashboardPhoto(applyVehicleToPayload(newPayload, selected));
    }

    case 'FUEL_ASK_VEHICLE_MANUAL': {
      if (textRaw.length < 5) {
        return {
          sendAction: waButtons('Informe a placa completa do veículo (ex.: ABC1D23).'),
          newStatus,
          newPayload,
        };
      }
      const parts = textRaw.split(/[—\-–]/).map((s) => s.trim());
      const plateRaw = parts[0] || textRaw;
      const description = parts.slice(1).join(' — ') || undefined;

      const registered = await findActiveVehicleByPlate(plateRaw);
      if (registered) {
        const option: VehicleOptionPayload = {
          id: registered.id,
          plate: formatPlacaDisplay(registered.placaVeic),
          description:
            [registered.marcaVeic, registered.modeloVeic].filter(Boolean).join(' ').trim() ||
            description,
          frotaPartic: registered.frotaPartic,
        };
        return askDashboardPhoto(applyVehicleToPayload(newPayload, option));
      }

      newPayload.vehiclePlate = plateRaw.toUpperCase();
      newPayload.vehicleDescription = description;
      newPayload.vehicleType = FuelVehicleType.PRIVATE;
      return askDashboardPhoto(newPayload);
    }

    case 'FUEL_ASK_DASHBOARD_PHOTO': {
      if (!isWhatsAppSavedMediaReady(hasMedia, savedMedia)) {
        return {
          sendAction: waButtons('Preciso da foto do painel. Envie uma imagem (pode mandar só a foto).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.dashboardPhotoUrl = savedMedia!.fileUrl || null;
      newPayload.dashboardPhotoKey = savedMedia!.fileKey;
      newPayload.dashboardPhotoName = savedMedia!.fileName;
      return {
        sendAction: waButtons(
          'Alguma observação sobre a solicitação? (opcional — digite «não» para pular)',
          [
            { id: 'NAO', title: 'Não' },
            { id: 'MENU', title: 'Menu' },
            { id: 'END', title: 'Encerrar' },
          ],
        ),
        newStatus: 'FUEL_ASK_OBSERVATIONS',
        newPayload,
      };
    }

    case 'FUEL_ASK_OBSERVATIONS': {
      newPayload.observations = SKIP_WORDS.test(textRaw) ? '' : textRaw.trim();
      return {
        sendAction: waButtons(buildSummary(newPayload), [
          { id: 'SIM', title: 'Sim' },
          { id: 'NAO', title: 'Não' },
          { id: 'MENU', title: 'Menu' },
        ]),
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
        !hasStoredPhoto(newPayload.dashboardPhotoUrl, newPayload.dashboardPhotoKey)
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
        costCenter: String(newPayload.costCenterLabel || newPayload.costCenter || ''),
        driverName: String(newPayload.driverName),
        vehiclePlate: String(newPayload.vehiclePlate),
        vehicleDescription: (newPayload.vehicleDescription as string | undefined) || null,
        vehicleType: newPayload.vehicleType as FuelVehicleType,
        dashboardPhotoUrl: String(newPayload.dashboardPhotoUrl || '').trim() || null,
        dashboardPhotoKey: (newPayload.dashboardPhotoKey as string | undefined) || null,
        dashboardPhotoName: (newPayload.dashboardPhotoName as string | undefined) || null,
        observations: (newPayload.observations as string | undefined) || null,
        sourceWhatsAppPhone: phone,
      });

      const slaLine = await buildFuelSubmissionSlaLine();
      const statusLine =
        created.status === FuelRefuelRequestStatus.PENDING_MANAGER
          ? 'Aguardando aprovação do gestor. Em seguida seguirá ao Suprimentos.'
          : 'Aguardando aprovação do Suprimentos.';
      const outsideWarn = formatFuelOutsideHoursWarning();

      return {
        sendAction: {
          type: 'buttons',
          body: [
            `⏳ Solicitação #${created.displayNumber} registrada com sucesso!`,
            statusLine,
            '',
            slaLine,
            formatFuelAttendanceHoursShort(),
            ...(outsideWarn ? ['', outsideWarn] : []),
            '',
            'Você receberá uma mensagem aqui quando for liberada para abastecer.',
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
          sendAction: askRefuelDateAction(
            buildFuelFlowStartMessage(
              `Qual a data para abastecer?\nEx.: ${formatBrDate(todayIso())}`,
            ),
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
