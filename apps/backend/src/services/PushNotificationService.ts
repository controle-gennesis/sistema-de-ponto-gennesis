import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';

/**
 * Push (Expo) pra avisar o usuário de mudança de status com o app fechado.
 * Os tokens ficam na tabela `push_tokens` (acesso via SQL direto, independente do client gerado).
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_RE = /^(Exponent|Expo)PushToken\[.+\]$/;
const CHUNK = 100;

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && EXPO_TOKEN_RE.test(token);
}

export async function registerPushToken(userId: string, token: string, platform?: string | null) {
  await prisma.$executeRaw`
    INSERT INTO "push_tokens" ("id", "userId", "token", "platform", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${userId}, ${token}, ${platform ?? null}, NOW(), NOW())
    ON CONFLICT ("token")
    DO UPDATE SET "userId" = EXCLUDED."userId", "platform" = EXCLUDED."platform", "updatedAt" = NOW()
  `;
}

export async function removePushToken(userId: string, token: string) {
  await prisma.$executeRaw`DELETE FROM "push_tokens" WHERE "token" = ${token} AND "userId" = ${userId}`;
}

async function deleteTokens(tokens: string[]) {
  if (!tokens.length) return;
  await prisma.$executeRaw`DELETE FROM "push_tokens" WHERE "token" = ANY(${tokens}::text[])`;
}

async function tokensForUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await prisma.$queryRaw<Array<{ token: string }>>`
    SELECT "token" FROM "push_tokens" WHERE "userId" = ANY(${userIds}::text[])
  `;
  return rows.map((r) => r.token);
}

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

/** Envia pra todos os aparelhos dos usuários. Nunca lança: push não pode derrubar a operação. */
export async function sendPushToUsers(userIds: Array<string | null | undefined>, payload: PushPayload) {
  try {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    const tokens = (await tokensForUsers(ids)).filter(isValidExpoPushToken);
    if (!tokens.length) return;

    const dead: string[] = [];
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const slice = tokens.slice(i, i + CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(
          slice.map((to) => ({
            to,
            title: payload.title,
            body: payload.body,
            data: payload.data ?? {},
            sound: 'default',
            channelId: 'default',
          })),
        ),
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      json?.data?.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(slice[idx]);
        }
      });
    }
    await deleteTokens(dead);
  } catch (err) {
    console.warn('[push] falha ao enviar:', err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------------------------
// Mudança de status → quem avisar e o que dizer
// ---------------------------------------------------------------------------------------------

const FUEL: Record<string, [string, string]> = {
  PENDING_MANAGER: ['Combustível aguardando gestor', 'aguardando o gestor'],
  PENDING_SUPPLIES: ['Combustível aguardando suprimentos', 'aguardando suprimentos'],
  APPROVED: ['Combustível aguardando suprimentos', 'aguardando suprimentos'],
  AWAITING_REFUEL: ['Combustível liberado para abastecer', 'liberada para abastecer'],
  COMPLETED: ['Abastecimento concluído', 'concluída'],
  REJECTED: ['Solicitação de combustível rejeitada', 'rejeitada'],
  CANCELLED: ['Solicitação de combustível cancelada', 'cancelada'],
};

const RESERVATION: Record<string, [string, string]> = {
  PENDING_SUPPLIES: ['Reserva aguardando aprovação', 'aguardando aprovação'],
  APPROVED: ['Reserva aprovada', 'aprovada'],
  COMPLETED: ['Reserva aguardando vistoria', 'aguardando vistoria'],
  INSPECTED: ['Vistoria da reserva concluída', 'com a vistoria concluída'],
  REJECTED: ['Reserva rejeitada', 'rejeitada'],
  CANCELLED: ['Reserva cancelada', 'cancelada'],
};

const DP: Record<string, string> = {
  WAITING_MANAGER: 'Aguardando aprovação',
  IN_REVIEW_DP: 'Em análise',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Sua pendência',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  WAITING_SUPPLIES: 'Aguardando suprimentos',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

const WORK_ORDER: Record<string, string> = {
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

const WATCHED_MODELS = new Set(['FuelRefuelRequest', 'VehicleReservation', 'DpRequest', 'GestaoOsWorkOrder']);

function statusFromArgs(args: unknown): string | null {
  const data = (args as { data?: Record<string, unknown> } | null)?.data;
  const raw = data?.status;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { set?: unknown }).set === 'string') {
    return (raw as { set: string }).set;
  }
  return null;
}

function ref(code: unknown, prefix = '#'): string {
  const raw = code == null ? '' : String(code).trim();
  return raw ? ` ${raw.startsWith('#') ? raw : `${prefix}${raw}`}` : '';
}

/**
 * Chamado depois de cada `update` do Prisma: se o update mexeu no status de uma solicitação,
 * reserva, DP ou chamado, avisa por push o dono. Roda em segundo plano e nunca lança.
 */
export function maybeNotifyStatusChange(model: string, args: unknown, result: unknown) {
  if (!WATCHED_MODELS.has(model)) return;
  const status = statusFromArgs(args);
  const row = result as Record<string, unknown> | null;
  if (!status || !row || row.status !== status) return;

  void (async () => {
    try {
      const entityId = String(row.id ?? '');
      switch (model) {
        case 'FuelRefuelRequest': {
          const [title, what] = FUEL[status] ?? ['Atualização de combustível', 'atualizada'];
          await sendPushToUsers([row.requesterId as string], {
            title,
            body: `A solicitação${ref(row.displayNumber)} está ${what}`,
            data: { kind: 'fuel', entityId, status },
          });
          break;
        }
        case 'VehicleReservation': {
          const [title, what] = RESERVATION[status] ?? ['Atualização de reserva', 'atualizada'];
          await sendPushToUsers([row.createdById as string], {
            title,
            body: `A reserva${ref(row.code)} está ${what}`,
            data: { kind: 'reservation', entityId, status },
          });
          break;
        }
        case 'DpRequest': {
          const employee = await prisma.employee.findUnique({
            where: { id: String(row.employeeId ?? '') },
            select: { userId: true },
          });
          const label = DP[status] ?? status;
          await sendPushToUsers([employee?.userId], {
            title: `Solicitação: ${label.toLowerCase()}`,
            body: `A solicitação${ref(row.displayNumber)} agora está: ${label.toLowerCase()}`,
            data: { kind: 'dp', entityId, status },
          });
          break;
        }
        case 'GestaoOsWorkOrder': {
          const label = WORK_ORDER[status] ?? status;
          const code = row.osNumber != null ? `OS ${row.osNumber}` : row.displayNumber;
          await sendPushToUsers([row.requesterId as string, row.assigneeId as string], {
            title: `Chamado: ${label.toLowerCase()}`,
            body: `O chamado${ref(code, '')} agora está: ${label.toLowerCase()}`,
            data: { kind: 'workorder', entityId, status },
          });
          break;
        }
      }
    } catch (err) {
      console.warn('[push] falha ao preparar aviso:', err instanceof Error ? err.message : err);
    }
  })();
}
