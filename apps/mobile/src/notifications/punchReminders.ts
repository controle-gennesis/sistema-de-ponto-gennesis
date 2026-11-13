import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import type { User, WorkSchedule } from '../types';
import {
  cancelPunchReminders,
  punchRemindersSupported,
  replacePunchReminders,
  type PunchReminderItem,
} from './systemNotifications';

/**
 * Lembretes para bater o ponto: o app agenda, no próprio aparelho, um aviso para cada batida do
 * horário de trabalho da pessoa (entrada, saída para o almoço, volta e saída), na hora ou alguns
 * minutos antes. Funciona sem internet e sem depender do servidor.
 */

export type PunchReminderPrefs = {
  enabled: boolean;
  /** 0 = na hora; senão, quantos minutos antes. */
  leadMinutes: number;
  entry: boolean;
  lunchStart: boolean;
  lunchEnd: boolean;
  exit: boolean;
};

export const DEFAULT_PUNCH_REMINDER_PREFS: PunchReminderPrefs = {
  enabled: false,
  leadMinutes: 5,
  entry: true,
  lunchStart: true,
  lunchEnd: true,
  exit: true,
};

export const LEAD_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Na hora' },
  { value: 5, label: '5 min antes' },
  { value: 10, label: '10 min antes' },
  { value: 15, label: '15 min antes' },
  { value: 30, label: '30 min antes' },
];

export const PUNCH_KINDS = [
  { type: 'ENTRY', pref: 'entry', label: 'Entrada', scheduleKey: 'startTime' },
  { type: 'LUNCH_START', pref: 'lunchStart', label: 'Saída para o almoço', scheduleKey: 'lunchStartTime' },
  { type: 'LUNCH_END', pref: 'lunchEnd', label: 'Volta do almoço', scheduleKey: 'lunchEndTime' },
  { type: 'EXIT', pref: 'exit', label: 'Saída', scheduleKey: 'endTime' },
] as const;

/** Quantos dias à frente ficam agendados (o app renova a cada vez que é aberto). */
const DAYS_AHEAD = 7;

const key = (userId: string) => `punch-reminders:${userId}`;

export async function readPunchReminderPrefs(userId: string): Promise<PunchReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return DEFAULT_PUNCH_REMINDER_PREFS;
    return { ...DEFAULT_PUNCH_REMINDER_PREFS, ...(JSON.parse(raw) as Partial<PunchReminderPrefs>) };
  } catch {
    return DEFAULT_PUNCH_REMINDER_PREFS;
  }
}

export async function writePunchReminderPrefs(userId: string, prefs: PunchReminderPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/** "07:30" -> [7, 30]; devolve null se o horário não for válido. */
function parseHm(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return [h, min];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Monta a lista de lembretes dos próximos dias a partir do horário de trabalho. */
export function buildPunchReminders(
  schedule: WorkSchedule | null | undefined,
  prefs: PunchReminderPrefs,
  doneToday: Set<string>,
  now = new Date(),
): PunchReminderItem[] {
  if (!schedule) return [];
  const workDays =
    Array.isArray(schedule.workDays) && schedule.workDays.length > 0 ? schedule.workDays : [1, 2, 3, 4, 5];
  const items: PunchReminderItem[] = [];

  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!workDays.includes(day.getDay())) continue;

    for (const kind of PUNCH_KINDS) {
      if (!prefs[kind.pref]) continue;
      if (offset === 0 && doneToday.has(kind.type)) continue;
      const hm = parseHm(schedule[kind.scheduleKey]);
      if (!hm) continue;

      const punchAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm[0], hm[1]);
      const at = new Date(punchAt.getTime() - prefs.leadMinutes * 60_000);
      if (at.getTime() <= now.getTime() + 5_000) continue;

      const clock = `${pad(hm[0])}:${pad(hm[1])}`;
      items.push({
        at,
        punchType: kind.type,
        title: prefs.leadMinutes === 0 ? 'Hora de bater o ponto' : 'Daqui a pouco é hora do ponto',
        body:
          prefs.leadMinutes === 0
            ? `${kind.label} às ${clock}. Toque para registrar.`
            : `${kind.label} às ${clock}, em ${prefs.leadMinutes} minutos.`,
      });
    }
  }
  return items;
}

async function fetchDoneToday(): Promise<Set<string>> {
  try {
    const res = await api.get('/api/time-records/my-records/today');
    if (!res.ok) return new Set();
    const json = await res.json();
    const records = (json?.data?.records ?? []) as Array<{ type?: string }>;
    return new Set(records.map((r) => String(r.type)));
  } catch {
    return new Set();
  }
}

/**
 * Reagenda os lembretes conforme as preferências. Chame ao abrir a tela inicial e ao mudar
 * as preferências. Quem não precisa bater ponto, ou desligou os lembretes, fica sem nenhum agendado.
 * Devolve false só quando o sistema negou a permissão de notificações.
 */
export async function syncPunchReminders(user: User | null | undefined): Promise<boolean> {
  if (!punchRemindersSupported() || !user?.id) return true;
  const prefs = await readPunchReminderPrefs(user.id);
  const needsPunch = user.employee?.requiresTimeClock !== false && !user.empreiteiro;
  if (!prefs.enabled || !needsPunch) {
    await cancelPunchReminders();
    return true;
  }
  const doneToday = await fetchDoneToday();
  const items = buildPunchReminders(user.employee?.workSchedule, prefs, doneToday);
  return replacePunchReminders(items);
}
