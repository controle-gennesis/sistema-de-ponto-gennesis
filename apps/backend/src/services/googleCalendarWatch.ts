import crypto from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { notifyAgendaChanged } from '../realtime/agendaPush';
import {
  autoSyncWindow,
  getValidAccessToken,
  isGoogleCalendarConfigured,
  listGoogleCalendars,
  syncGoogleCalendarEvents,
} from './googleCalendarSync';

/**
 * Aviso instantâneo do Google Agenda (push): o servidor pede ao Google para chamar
 * `GOOGLE_CALENDAR_WEBHOOK_URL` quando um evento muda, e então sincroniza aquela pessoa na hora.
 * Sem a variável configurada, o recurso fica desligado e a sincronização periódica continua.
 */

const WATCH_TTL_SECONDS = 7 * 24 * 60 * 60;
const RENEW_BEFORE_MS = 2 * 24 * 60 * 60 * 1000;
const STOP_URL = 'https://www.googleapis.com/calendar/v3/channels/stop';

export function getGoogleWebhookUrl(): string | null {
  const url = process.env.GOOGLE_CALENDAR_WEBHOOK_URL?.trim();
  return url && url.startsWith('https://') ? url : null;
}

export function isGoogleWatchEnabled(): boolean {
  return isGoogleCalendarConfigured() && !!getGoogleWebhookUrl();
}

/** Senha do canal: só o servidor sabe gerar, então só ele aceita avisos genuínos. */
function channelToken(channelId: string): string {
  const secret = process.env.JWT_SECRET || 'sem-segredo';
  return crypto.createHmac('sha256', secret).update(`gcal-watch:${channelId}`).digest('hex');
}

function watchUrl(calendarId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`;
}

async function stopChannel(accessToken: string, channelId: string, resourceId: string): Promise<void> {
  try {
    await fetch(STOP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: channelId, resourceId }),
    });
  } catch {
    /* o canal vence sozinho em alguns dias */
  }
}

/** Garante um canal de aviso por agenda da pessoa (cria os que faltam e renova os que vão vencer). */
export async function ensureWatchesForUser(userId: string): Promise<{ created: number; failed: number }> {
  const address = getGoogleWebhookUrl();
  if (!address || !isGoogleCalendarConfigured()) return { created: 0, failed: 0 };

  const accessToken = await getValidAccessToken(userId);
  const calendars = (await listGoogleCalendars(accessToken)).filter((c) => !!c.id);
  const existing = await prisma.googleCalendarWatch.findMany({ where: { userId } });

  let created = 0;
  let failed = 0;
  for (const calendar of calendars) {
    const calendarId = calendar.id!;
    const current = existing.find((w) => w.calendarId === calendarId);
    if (current && current.expiration.getTime() > Date.now() + RENEW_BEFORE_MS) continue;

    const channelId = crypto.randomUUID();
    try {
      const res = await fetch(watchUrl(calendarId), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address,
          token: channelToken(channelId),
          params: { ttl: String(WATCH_TTL_SECONDS) },
        }),
      });
      const data = (await res.json()) as {
        resourceId?: string;
        expiration?: string;
        error?: { message?: string };
      };
      if (!res.ok || !data.resourceId) {
        failed += 1;
        console.warn(`[google-watch] agenda ${calendarId}:`, data.error?.message || res.status);
        continue;
      }
      const expiration = new Date(Number(data.expiration) || Date.now() + WATCH_TTL_SECONDS * 1000);
      await prisma.googleCalendarWatch.create({
        data: { userId, calendarId, channelId, resourceId: data.resourceId, expiration },
      });
      created += 1;
      if (current) {
        await stopChannel(accessToken, current.channelId, current.resourceId);
        await prisma.googleCalendarWatch.deleteMany({ where: { id: current.id } });
      }
    } catch (e) {
      failed += 1;
      console.warn(`[google-watch] agenda ${calendarId} falhou:`, e instanceof Error ? e.message : e);
    }
  }
  return { created, failed };
}

/** Desliga os avisos da pessoa (ao desconectar o Google). */
export async function stopWatchesForUser(userId: string): Promise<void> {
  const rows = await prisma.googleCalendarWatch.findMany({ where: { userId } });
  if (rows.length === 0) return;
  try {
    const accessToken = await getValidAccessToken(userId);
    for (const row of rows) await stopChannel(accessToken, row.channelId, row.resourceId);
  } catch {
    /* sem acesso válido: os canais vencem sozinhos */
  }
  await prisma.googleCalendarWatch.deleteMany({ where: { userId } });
}

/** Sincroniza uma pessoa por vez; se chegar outro aviso no meio, roda mais uma vez depois. */
const syncing = new Set<string>();
const dirty = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function syncUserNow(userId: string): Promise<void> {
  if (syncing.has(userId)) {
    dirty.add(userId);
    return;
  }
  syncing.add(userId);
  try {
    const { from, to } = autoSyncWindow();
    await syncGoogleCalendarEvents(userId, from, to);
    notifyAgendaChanged(userId);
  } catch (e) {
    console.warn(`[google-watch] sync user=${userId} falhou:`, e instanceof Error ? e.message : e);
  } finally {
    syncing.delete(userId);
    if (dirty.delete(userId)) void syncUserNow(userId);
  }
}

function scheduleUserSync(userId: string): void {
  // Junta avisos seguidos (o Google costuma mandar vários de uma vez).
  if (timers.has(userId)) return;
  timers.set(
    userId,
    setTimeout(() => {
      timers.delete(userId);
      void syncUserNow(userId);
    }, 800)
  );
}

/** Rota que o Google chama: confere a senha do canal, responde logo e sincroniza em seguida. */
export async function handleGoogleCalendarWebhook(req: Request, res: Response): Promise<void> {
  const channelId = String(req.header('x-goog-channel-id') || '');
  const token = String(req.header('x-goog-channel-token') || '');
  const state = String(req.header('x-goog-resource-state') || '');

  const expected = channelId ? channelToken(channelId) : '';
  const valid =
    !!expected &&
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!valid) {
    res.status(403).end();
    return;
  }
  // O Google só precisa de um 200 rápido.
  res.status(200).end();

  // "sync" é só a confirmação de que o canal foi criado.
  if (state === 'sync') return;
  try {
    const row = await prisma.googleCalendarWatch.findUnique({
      where: { channelId },
      select: { userId: true },
    });
    if (row) scheduleUserSync(row.userId);
  } catch {
    /* sem problema: a sincronização periódica cobre */
  }
}

let started = false;

/** Cria/renova os canais de todas as contas conectadas: ao subir e a cada 6 horas. */
export function startGoogleCalendarWatchScheduler(): void {
  if (started) return;
  if (!isGoogleWatchEnabled()) {
    console.log('[google-watch] desligado (falta GOOGLE_CALENDAR_WEBHOOK_URL)');
    return;
  }
  started = true;

  const run = async () => {
    try {
      const connections = await prisma.googleCalendarConnection.findMany({ select: { userId: true } });
      for (const { userId } of connections) {
        try {
          const r = await ensureWatchesForUser(userId);
          if (r.created || r.failed) {
            console.log(`[google-watch] user=${userId}: +${r.created} canais, ${r.failed} falha(s)`);
          }
        } catch (e) {
          console.warn(`[google-watch] user=${userId}:`, e instanceof Error ? e.message : e);
        }
      }
      await prisma.googleCalendarWatch.deleteMany({ where: { expiration: { lt: new Date() } } });
    } catch (e) {
      console.warn('[google-watch] rodada falhou:', e instanceof Error ? e.message : e);
    }
  };

  console.log('[google-watch] ligado: avisos instantâneos do Google Agenda');
  const boot = setTimeout(() => void run(), 60_000);
  boot.unref?.();
  const timer = setInterval(() => void run(), 6 * 60 * 60 * 1000);
  timer.unref?.();
}
