import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const storage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
};

export type ActivityKind = 'fuel' | 'reservation' | 'dp' | 'workorder' | 'kanban';

export type ActivityNotification = {
  id: string;
  entityId: string;
  kind: ActivityKind;
  status: string;
  title: string;
  body: string;
  /** Número/código visível (#12, #ABC) */
  displayCode?: string | null;
  updatedAt: string;
  detectedAt: string;
  read: boolean;
};

export type StatusSnapshot = Record<string, { status: string; updatedAt: string }>;

const SNAPSHOT_KEY = '@activity_status_snapshot';
const FEED_KEY = '@activity_notifications_feed';
const MAX_FEED = 60;

export async function loadSnapshot(): Promise<StatusSnapshot> {
  try {
    const raw = await storage.getItem(SNAPSHOT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StatusSnapshot;
  } catch {
    return {};
  }
}

export async function saveSnapshot(snapshot: StatusSnapshot) {
  await storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export async function loadFeed(): Promise<ActivityNotification[]> {
  try {
    const raw = await storage.getItem(FEED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ActivityNotification[];
  } catch {
    return [];
  }
}

export async function saveFeed(items: ActivityNotification[]) {
  await storage.setItem(FEED_KEY, JSON.stringify(items.slice(0, MAX_FEED)));
}

export function activityPageTitle(kind: ActivityKind): string {
  switch (kind) {
    case 'fuel':
      return 'Combustível';
    case 'dp':
      return 'Solicitações';
    case 'workorder':
      return 'Chamados';
    case 'kanban':
      return 'Kanban';
    default:
      return 'Frota';
  }
}

/** Nome da aba (rota) que mostra cada tipo de notificação. */
export function activityTabRoute(kind: ActivityKind): 'Combustivel' | 'Reservas' | 'DpRequests' | 'GestaoOs' {
  switch (kind) {
    // Kanban abre o card direto (ver NotificationsSheet); a aba aqui é só o padrão.
    case 'kanban':
      return 'GestaoOs';
    case 'fuel':
      return 'Combustivel';
    case 'dp':
      return 'DpRequests';
    case 'workorder':
      return 'GestaoOs';
    default:
      return 'Reservas';
  }
}

const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  SAFETY_CHECK: 'Verificação de segurança',
  IN_PROGRESS: 'Em execução',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluída',
  REWORK: 'Em ajuste',
  CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

export function workOrderStatusLabel(status: string): string {
  return WORK_ORDER_STATUS_LABEL[status] || status;
}

export function workOrderStatusTitle(status: string): string {
  return `Chamado ${workOrderStatusLabel(status).toLowerCase()}`;
}

export function workOrderStatusMessage(_status: string, displayCode?: string | null): string {
  const ref = formatRef(displayCode);
  return `Chamado${ref ? ` ${ref}` : ''}`;
}

export function dpStatusTitle(label: string): string {
  const l = label.toLowerCase();
  if (l === 'sua pendência') return 'Você tem uma pendência';
  if (l.startsWith('pendência')) return label;
  return `Solicitação ${l}`;
}

export function dpStatusMessage(_label: string, displayCode?: string | null): string {
  const ref = formatRef(displayCode);
  return `Solicitação${ref ? ` ${ref}` : ''}`;
}

export function fuelStatusTitle(status: string): string {
  const map: Record<string, string> = {
    PENDING_MANAGER: 'Combustível aguardando gestor',
    PENDING_SUPPLIES: 'Combustível aguardando suprimentos',
    APPROVED: 'Combustível aguardando suprimentos',
    AWAITING_REFUEL: 'Combustível liberado para abastecer',
    COMPLETED: 'Abastecimento concluído',
    REJECTED: 'Solicitação de combustível rejeitada',
    CANCELLED: 'Solicitação de combustível cancelada',
  };
  return map[status] || 'Atualização de combustível';
}

export function reservationStatusTitle(status: string): string {
  const map: Record<string, string> = {
    PENDING_SUPPLIES: 'Reserva aguardando aprovação',
    APPROVED: 'Reserva aprovada',
    COMPLETED: 'Reserva aguardando vistoria',
    INSPECTED: 'Vistoria da reserva concluída',
    REJECTED: 'Reserva cancelada',
    CANCELLED: 'Reserva cancelada',
  };
  return map[status] || 'Atualização de reserva';
}

function formatRef(displayCode?: string | null): string | null {
  const raw = displayCode?.trim();
  if (!raw) return null;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

/** Combustível e reserva: o título já diz o que mudou; a mensagem só identifica o pedido. */
export function fuelStatusMessage(_status: string, displayCode?: string | null): string {
  const ref = formatRef(displayCode);
  return `Solicitação de abastecimento${ref ? ` ${ref}` : ''}`;
}

export function reservationStatusMessage(_status: string, displayCode?: string | null): string {
  const ref = formatRef(displayCode);
  return `Reserva${ref ? ` ${ref}` : ''}`;
}

export function fuelStatusBody(status: string, displayCode?: string | null): string {
  return fuelStatusMessage(status, displayCode);
}

export function reservationStatusBody(status: string, displayCode?: string | null): string {
  return reservationStatusMessage(status, displayCode);
}

export function activitySubtitle(item: ActivityNotification): string {
  const code = item.displayCode?.trim() || null;
  if (item.kind === 'fuel') return fuelStatusMessage(item.status, code);
  if (item.kind === 'workorder') return workOrderStatusMessage(item.status, code);
  if (item.kind === 'dp' || item.kind === 'kanban') return item.body;
  return reservationStatusMessage(item.status, code);
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `Há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Ontem';
  if (days < 7) return `Há ${days} dias`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
