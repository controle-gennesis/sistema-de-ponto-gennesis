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

export type ActivityKind = 'fuel' | 'reservation';

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
  return kind === 'fuel' ? 'Combustível' : 'Frota';
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

export function fuelStatusMessage(status: string, displayCode?: string | null): string {
  const ref = formatRef(displayCode);
  const map = (withId: string, withoutId: string) => (ref ? withId : withoutId);

  switch (status) {
    case 'PENDING_MANAGER':
      return map(
        `A solicitação ${ref} está aguardando o gestor`,
        'A solicitação está aguardando o gestor',
      );
    case 'PENDING_SUPPLIES':
    case 'APPROVED':
      return map(
        `A solicitação ${ref} está aguardando suprimentos`,
        'A solicitação está aguardando suprimentos',
      );
    case 'AWAITING_REFUEL':
      return map(
        `A solicitação ${ref} foi liberada para abastecer`,
        'A solicitação foi liberada para abastecer',
      );
    case 'COMPLETED':
      return map(
        `O abastecimento da solicitação ${ref} foi concluído`,
        'O abastecimento foi concluído',
      );
    case 'REJECTED':
      return map(`A solicitação ${ref} foi rejeitada`, 'A solicitação foi rejeitada');
    case 'CANCELLED':
      return map(`A solicitação ${ref} foi cancelada`, 'A solicitação foi cancelada');
    default:
      return map(`Atualização na solicitação ${ref}`, 'Atualização na solicitação');
  }
}

export function reservationStatusMessage(status: string, displayCode?: string | null): string {
  const ref = formatRef(displayCode);
  const map = (withId: string, withoutId: string) => (ref ? withId : withoutId);

  switch (status) {
    case 'PENDING_SUPPLIES':
      return map(
        `A reserva ${ref} está aguardando aprovação`,
        'A reserva está aguardando aprovação',
      );
    case 'APPROVED':
      return map(`A reserva ${ref} foi aprovada`, 'A reserva foi aprovada');
    case 'COMPLETED':
      return map(
        `A reserva ${ref} está aguardando vistoria`,
        'A reserva está aguardando vistoria',
      );
    case 'INSPECTED':
      return map(
        `A vistoria da reserva ${ref} foi concluída`,
        'A vistoria da reserva foi concluída',
      );
    case 'REJECTED':
      return map(`A reserva ${ref} foi rejeitada`, 'A reserva foi rejeitada');
    case 'CANCELLED':
      return map(`A reserva ${ref} foi cancelada`, 'A reserva foi cancelada');
    default:
      return map(`Atualização na reserva ${ref}`, 'Atualização na reserva');
  }
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
