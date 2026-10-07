import {
  findEmployeeByCpf,
  isValidCpf,
  onlyDigits,
} from '../lib/employeeCpfLookup';
import { prisma } from '../lib/prisma';
import { vehicleReservationService } from './VehicleReservationService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppVehicleReservationFlowStatus =
  | 'VR_ASK_DRIVER_CPF'
  | 'VR_ASK_ATIVIDADE'
  | 'VR_ASK_DESTINO'
  | 'VR_ASK_START_DATE'
  | 'VR_ASK_START_TIME'
  | 'VR_ASK_END_DATE'
  | 'VR_ASK_END_TIME'
  | 'VR_ASK_POLO'
  | 'VR_ASK_CONTRATO'
  | 'VR_ASK_OBSERVATIONS'
  | 'VR_CONFIRM'
  | 'VR_COMPLETE';

type ContractOptionPayload = {
  id: string;
  name: string;
  number: string;
};

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;
const DATE_TODAY_ID = 'vr_date_today';
const DATE_SAME_ID = 'vr_date_same';
const POLO_DF_ID = 'vr_polo_df';
const POLO_GO_ID = 'vr_polo_go';
const POLO_SKIP_ID = 'vr_polo_skip';
/** WhatsApp lista no máx. 10 linhas; reserva 2 para «Pular» e «Mais contratos». */
const CONTRACT_LIST_PAGE_SIZE = 8;
const CONTRACT_OTHERS_ID = 'vr_contract_others';
const CONTRACT_SKIP_ID = 'vr_contract_skip';

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

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function brDateToIso(input: string): string | null {
  const trimmed = input.trim();
  if (/^hoje$/i.test(trimmed)) return todayIso();
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

function parseTimeHm(input: string): { hour: number; minute: number } | null {
  const m = input.trim().match(/^(\d{1,2})[:hH](\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function combineLocalDateTime(isoDate: string, hour: number, minute: number): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
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

function askStartDateAction(body: string): SendAction {
  return waButtons(body, [
    { id: DATE_TODAY_ID, title: 'Hoje' },
    { id: 'MENU', title: 'Menu' },
    { id: 'END', title: 'Encerrar' },
  ]);
}

function askEndDateAction(body: string): SendAction {
  return waButtons(body, [
    { id: DATE_SAME_ID, title: 'Mesmo dia' },
    { id: DATE_TODAY_ID, title: 'Hoje' },
    { id: 'MENU', title: 'Menu' },
  ]);
}

function askPoloAction(): SendAction {
  return waButtons('Qual o polo? (opcional)', [
    { id: POLO_DF_ID, title: 'DF' },
    { id: POLO_GO_ID, title: 'GO' },
    { id: POLO_SKIP_ID, title: 'Pular' },
  ]);
}

function buildSummary(payload: Record<string, unknown>): string {
  const start = payload.startAt instanceof Date ? payload.startAt : null;
  const end = payload.endAt instanceof Date ? payload.endAt : null;
  return [
    'Resumo da reserva de veículo:',
    `• Motorista: ${payload.motorista || '—'}${
      payload.driverCpfMasked ? ` (CPF ${payload.driverCpfMasked})` : ''
    }`,
    `• Atividade: ${payload.atividade || '—'}`,
    `• Destino: ${payload.localDestino || '—'}`,
    `• Início: ${start ? formatBrDateTime(start) : '—'}`,
    `• Fim: ${end ? formatBrDateTime(end) : '—'}`,
    `• Polo: ${payload.polo || '—'}`,
    `• Contrato: ${payload.contrato || '—'}`,
    `• Observações: ${String(payload.observacaoCapacidadeVeiculo || '').trim() || '—'}`,
    '',
    'O veículo será definido pelo Suprimentos na aprovação.',
    '',
    'Confirma o envio?',
  ].join('\n');
}

async function listContracts(): Promise<ContractOptionPayload[]> {
  const rows = await prisma.contract.findMany({
    select: { id: true, name: true, number: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name.trim() || row.number,
    number: row.number,
  }));
}

function contractListAction(
  contracts: ContractOptionPayload[],
  page: number,
): SendAction {
  const start = page * CONTRACT_LIST_PAGE_SIZE;
  const slice = contracts.slice(start, start + CONTRACT_LIST_PAGE_SIZE);
  const rows: Array<{ id: string; title: string }> = slice.map((c) => ({
    id: c.id,
    title: truncateWaTitle(c.name || c.number),
  }));
  rows.push({ id: CONTRACT_SKIP_ID, title: 'Pular contrato' });
  if (start + CONTRACT_LIST_PAGE_SIZE < contracts.length) {
    rows.push({ id: CONTRACT_OTHERS_ID, title: 'Mais contratos' });
  }
  return waList(
    page === 0
      ? 'Selecione o contrato (opcional) ou pule:'
      : `Mais contratos (página ${page + 1}):`,
    rows.slice(0, 10),
    'Contratos',
  );
}

export function isWhatsAppVehicleReservationFlowStatus(status: string): boolean {
  return status.startsWith('VR_');
}

export function isWhatsAppVehicleReservationMenuSelection(content: string): boolean {
  return (
    content === 'reservar_carro' ||
    content === 'reserva_carro' ||
    content === 'frota' ||
    content.includes('reservar carro') ||
    content.includes('reserva de carro') ||
    content.includes('reserva veiculo') ||
    content.includes('reserva veículo') ||
    (content.includes('reserv') && (content.includes('carro') || content.includes('veic') || content.includes('frota')))
  );
}

export async function processWhatsAppVehicleReservationFlow(params: {
  phone: string;
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
  newStatus: WhatsAppVehicleReservationFlowStatus | 'MENU';
  newPayload: Record<string, unknown>;
  newConversationStatus?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  clearPayload?: boolean;
} | null> {
  const {
    textRaw,
    content,
    flowStatus,
    payload,
    isMenuRequest,
    isEndRequest,
    resetToMenu,
    endConversation,
  } = params;

  const startingFromMenu =
    flowStatus === 'MENU' && isWhatsAppVehicleReservationMenuSelection(content);
  if (!isWhatsAppVehicleReservationFlowStatus(flowStatus) && !startingFromMenu) {
    return null;
  }

  let newPayload: Record<string, unknown> = { ...payload, flow: 'VEHICLE_RESERVATION' };
  let newStatus: WhatsAppVehicleReservationFlowStatus | 'MENU' = startingFromMenu
    ? 'VR_ASK_DRIVER_CPF'
    : (flowStatus as WhatsAppVehicleReservationFlowStatus);

  // Revive Date objects lost when payload is plain JSON
  if (typeof newPayload.startAt === 'string') {
    newPayload.startAt = new Date(String(newPayload.startAt));
  }
  if (typeof newPayload.endAt === 'string') {
    newPayload.endAt = new Date(String(newPayload.endAt));
  }

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  if (startingFromMenu) {
    return {
      sendAction: waButtons('Vamos reservar um veículo.\n\nQual o CPF do motorista?'),
      newStatus: 'VR_ASK_DRIVER_CPF',
      newPayload,
    };
  }

  switch (newStatus) {
    case 'VR_ASK_DRIVER_CPF': {
      const cpfDigits = onlyDigits(textRaw);
      if (!cpfDigits || !isValidCpf(cpfDigits)) {
        return {
          sendAction: waButtons('CPF inválido. Envie o CPF do motorista (com ou sem pontuação).'),
          newStatus,
          newPayload,
        };
      }

      const employee = await findEmployeeByCpf(cpfDigits);
      if (!employee) {
        return {
          sendAction: waButtons(
            'Não encontrei colaborador cadastrado com esse CPF. Verifique o número e envie novamente.',
          ),
          newStatus,
          newPayload,
        };
      }

      newPayload.motorista = employee.name;
      newPayload.solicitante = employee.name;
      newPayload.driverCpfMasked = employee.cpfMasked;
      newPayload.createdById = employee.userId;
      return {
        sendAction: waButtons('Qual a atividade / motivo da reserva?'),
        newStatus: 'VR_ASK_ATIVIDADE',
        newPayload,
      };
    }

    case 'VR_ASK_ATIVIDADE': {
      const atividade = textRaw.trim();
      if (atividade.length < 2) {
        return {
          sendAction: waButtons('Informe a atividade (mínimo 2 caracteres).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.atividade = atividade;
      return {
        sendAction: waButtons('Qual o local de destino?'),
        newStatus: 'VR_ASK_DESTINO',
        newPayload,
      };
    }

    case 'VR_ASK_DESTINO': {
      const destino = textRaw.trim();
      if (destino.length < 2) {
        return {
          sendAction: waButtons('Informe o local de destino (mínimo 2 caracteres).'),
          newStatus,
          newPayload,
        };
      }
      newPayload.localDestino = destino;
      return {
        sendAction: askStartDateAction(
          `Qual a data de início do uso?\nEx.: ${formatBrDate(todayIso())}`,
        ),
        newStatus: 'VR_ASK_START_DATE',
        newPayload,
      };
    }

    case 'VR_ASK_START_DATE': {
      const iso =
        content === DATE_TODAY_ID || content === 'hoje' || /^hoje$/i.test(textRaw.trim())
          ? todayIso()
          : brDateToIso(textRaw);
      if (!iso) {
        return {
          sendAction: askStartDateAction(
            'Data inválida. Use DD/MM/AAAA ou toque em «Hoje».',
          ),
          newStatus,
          newPayload,
        };
      }
      newPayload.startDateIso = iso;
      return {
        sendAction: waButtons(
          'Qual o horário de início?\nEx.: 08:00',
        ),
        newStatus: 'VR_ASK_START_TIME',
        newPayload,
      };
    }

    case 'VR_ASK_START_TIME': {
      const time = parseTimeHm(textRaw);
      if (!time) {
        return {
          sendAction: waButtons('Horário inválido. Informe no formato HH:MM (ex.: 08:00).'),
          newStatus,
          newPayload,
        };
      }
      const startDateIso = String(newPayload.startDateIso || '');
      if (!startDateIso) {
        return {
          sendAction: askStartDateAction('Vamos de novo: qual a data de início?'),
          newStatus: 'VR_ASK_START_DATE',
          newPayload,
        };
      }
      newPayload.startAt = combineLocalDateTime(startDateIso, time.hour, time.minute);
      return {
        sendAction: askEndDateAction(
          `Qual a data de fim do uso?\nEx.: ${formatBrDate(startDateIso)}`,
        ),
        newStatus: 'VR_ASK_END_DATE',
        newPayload,
      };
    }

    case 'VR_ASK_END_DATE': {
      let iso: string | null = null;
      if (content === DATE_SAME_ID || content === 'mesmo_dia' || /mesmo\s*dia/i.test(textRaw)) {
        iso = String(newPayload.startDateIso || '') || null;
      } else if (content === DATE_TODAY_ID || content === 'hoje' || /^hoje$/i.test(textRaw.trim())) {
        iso = todayIso();
      } else {
        iso = brDateToIso(textRaw);
      }
      if (!iso) {
        return {
          sendAction: askEndDateAction('Data inválida. Use DD/MM/AAAA, «Mesmo dia» ou «Hoje».'),
          newStatus,
          newPayload,
        };
      }
      newPayload.endDateIso = iso;
      return {
        sendAction: waButtons('Qual o horário de fim?\nEx.: 18:00'),
        newStatus: 'VR_ASK_END_TIME',
        newPayload,
      };
    }

    case 'VR_ASK_END_TIME': {
      const time = parseTimeHm(textRaw);
      if (!time) {
        return {
          sendAction: waButtons('Horário inválido. Informe no formato HH:MM (ex.: 18:00).'),
          newStatus,
          newPayload,
        };
      }
      const endDateIso = String(newPayload.endDateIso || '');
      const startAt = newPayload.startAt instanceof Date ? newPayload.startAt : null;
      if (!endDateIso || !startAt) {
        return {
          sendAction: askStartDateAction('Faltam dados. Qual a data de início?'),
          newStatus: 'VR_ASK_START_DATE',
          newPayload,
        };
      }
      const endAt = combineLocalDateTime(endDateIso, time.hour, time.minute);
      if (endAt < startAt) {
        return {
          sendAction: askEndDateAction(
            'O fim não pode ser antes do início. Informe a data de fim novamente:',
          ),
          newStatus: 'VR_ASK_END_DATE',
          newPayload,
        };
      }
      newPayload.endAt = endAt;
      return {
        sendAction: askPoloAction(),
        newStatus: 'VR_ASK_POLO',
        newPayload,
      };
    }

    case 'VR_ASK_POLO': {
      if (content === POLO_SKIP_ID || SKIP_WORDS.test(textRaw)) {
        newPayload.polo = null;
      } else if (content === POLO_DF_ID || /^df$/i.test(textRaw.trim())) {
        newPayload.polo = 'DF';
      } else if (content === POLO_GO_ID || /^go$/i.test(textRaw.trim())) {
        newPayload.polo = 'GO';
      } else {
        return {
          sendAction: askPoloAction(),
          newStatus,
          newPayload,
        };
      }

      const contracts = await listContracts();
      newPayload.contractOptions = contracts;
      newPayload.contractListPage = 0;
      if (!contracts.length) {
        return {
          sendAction: waButtons(
            'Alguma observação sobre o veículo necessário? (capacidade, tipo…)\nEnvie o texto ou toque em «Não».',
            [
              { id: 'NAO', title: 'Não' },
              { id: 'MENU', title: 'Menu' },
              { id: 'END', title: 'Encerrar' },
            ],
          ),
          newStatus: 'VR_ASK_OBSERVATIONS',
          newPayload,
        };
      }
      return {
        sendAction: contractListAction(contracts, 0),
        newStatus: 'VR_ASK_CONTRATO',
        newPayload,
      };
    }

    case 'VR_ASK_CONTRATO': {
      const contracts =
        (newPayload.contractOptions as ContractOptionPayload[] | undefined) ?? [];
      let page = Number(newPayload.contractListPage || 0);

      if (content === CONTRACT_SKIP_ID || SKIP_WORDS.test(textRaw)) {
        newPayload.contrato = null;
      } else if (content === CONTRACT_OTHERS_ID) {
        page += 1;
        newPayload.contractListPage = page;
        return {
          sendAction: contractListAction(contracts, page),
          newStatus,
          newPayload,
        };
      } else {
        const selected = contracts.find((c) => c.id === content);
        if (selected) {
          newPayload.contrato = selected.name || selected.number;
        } else {
          const typed = textRaw.trim();
          if (typed.length >= 2) {
            newPayload.contrato = typed;
          } else {
            return {
              sendAction: contractListAction(contracts, page),
              newStatus,
              newPayload,
            };
          }
        }
      }

      return {
        sendAction: waButtons(
          'Alguma observação sobre o veículo necessário? (capacidade, tipo…)\nEnvie o texto ou toque em «Não».',
          [
            { id: 'NAO', title: 'Não' },
            { id: 'MENU', title: 'Menu' },
            { id: 'END', title: 'Encerrar' },
          ],
        ),
        newStatus: 'VR_ASK_OBSERVATIONS',
        newPayload,
      };
    }

    case 'VR_ASK_OBSERVATIONS': {
      newPayload.observacaoCapacidadeVeiculo = SKIP_WORDS.test(textRaw)
        ? ''
        : textRaw.trim();
      return {
        sendAction: waButtons(buildSummary(newPayload), [
          { id: 'SIM', title: 'Sim' },
          { id: 'NAO', title: 'Não' },
        ]),
        newStatus: 'VR_CONFIRM',
        newPayload,
      };
    }

    case 'VR_CONFIRM': {
      if (NO_WORDS.test(textRaw)) {
        return {
          sendAction: waButtons(
            'Reserva descartada. Escolha «Reservar carro» no menu para recomeçar.',
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

      const motorista = String(newPayload.motorista || '').trim();
      const solicitante = String(newPayload.solicitante || motorista).trim();
      const atividade = String(newPayload.atividade || '').trim();
      const localDestino = String(newPayload.localDestino || '').trim();
      const startAt = newPayload.startAt instanceof Date ? newPayload.startAt : null;
      const endAt = newPayload.endAt instanceof Date ? newPayload.endAt : null;

      if (!motorista || !atividade || !localDestino || !startAt || !endAt) {
        return {
          sendAction: waButtons('Faltam dados. Volte ao menu e tente novamente.'),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }

      try {
        const created = await vehicleReservationService.create({
          solicitante,
          motorista,
          atividade,
          localDestino,
          dataUsoInicio: startAt,
          dataUsoFim: endAt,
          periodoUso: [],
          polo: (newPayload.polo as string | null | undefined) || null,
          contrato: (newPayload.contrato as string | null | undefined) || null,
          observacaoCapacidadeVeiculo:
            String(newPayload.observacaoCapacidadeVeiculo || '').trim() || null,
          assinatura: '',
          createdById: (newPayload.createdById as string | undefined) || null,
        });

        return {
          sendAction: {
            type: 'buttons',
            body: [
              `✅ Reserva #${created.code} registrada com sucesso!`,
              'Status: aguardando aprovação do Suprimentos.',
              'O veículo será definido na aprovação.',
              '',
              'Você pode acompanhar em Frota no Conecta.',
            ].join('\n'),
            buttons: [
              { id: 'RESERVAR_CARRO', title: 'Nova reserva' },
              { id: 'MENU', title: 'Menu principal' },
              { id: 'END', title: 'Encerrar' },
            ],
          },
          newStatus: 'VR_COMPLETE',
          newPayload: { flow: 'VEHICLE_RESERVATION', lastCode: created.code },
          newConversationStatus: 'COMPLETED',
        };
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível criar a reserva. Tente novamente.';
        return {
          sendAction: waButtons(message),
          newStatus: 'MENU',
          newPayload: {},
          clearPayload: true,
        };
      }
    }

    case 'VR_COMPLETE': {
      if (isWhatsAppVehicleReservationMenuSelection(content)) {
        return {
          sendAction: waButtons('Vamos reservar um veículo.\n\nQual o CPF do motorista?'),
          newStatus: 'VR_ASK_DRIVER_CPF',
          newPayload: { flow: 'VEHICLE_RESERVATION' },
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
