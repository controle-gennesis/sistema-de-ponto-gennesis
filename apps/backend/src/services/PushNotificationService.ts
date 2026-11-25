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
  /** Conjunto de botões de ação (registrado no app): ex. 'fuel-refuel', 'reservation-action'. */
  categoryId?: string;
};

/** Categorias de aviso que a pessoa pode ligar/desligar no Perfil do app. */
export const PUSH_CATEGORIES = [
  { key: 'approvals', label: 'Aprovações pendentes', description: 'Quando chega algo para você aprovar' },
  { key: 'fuel', label: 'Abastecimento', description: 'Andamento das suas solicitações de combustível' },
  { key: 'reservation', label: 'Frota', description: 'Andamento das suas reservas de veículo' },
  { key: 'dp', label: 'Solicitações internas', description: 'Mudanças de status das suas solicitações' },
  { key: 'dp-messages', label: 'Mensagens das solicitações', description: 'Novas mensagens nas solicitações' },
  { key: 'workorder', label: 'Chamados', description: 'Mudanças de status dos chamados' },
  { key: 'kanban', label: 'Tasks', description: 'Quando você é atribuído a um card ou marcado num comentário' },
] as const;

const CATEGORY_KEYS: ReadonlySet<string> = new Set(PUSH_CATEGORIES.map((c) => c.key));

/** Descobre a categoria de um aviso pelo `data` do payload (sem categoria = sempre envia). */
function categoryOfPayload(data?: Record<string, unknown>): string | null {
  const id = String(data?.kind ?? data?.type ?? '');
  switch (id) {
    case 'approval-pending':
      return 'approvals';
    case 'fuel':
      return 'fuel';
    case 'reservation':
      return 'reservation';
    case 'dp':
      return 'dp';
    case 'dp-request-message':
      return 'dp-messages';
    case 'dp-contabilidade':
      return 'accounting';
    case 'workorder':
      return 'workorder';
    case 'kanban-assigned':
    case 'kanban-mention':
      return 'kanban';
    default:
      return null;
  }
}

async function mutedCategories(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ category: string }>>`
    SELECT "category" FROM "push_muted_categories" WHERE "userId" = ${userId}
  `;
  return rows.map((r) => r.category);
}

/** Lista as categorias com o estado (ligada/desligada) do usuário. */
export async function getPushPreferences(userId: string) {
  const muted = new Set(await mutedCategories(userId).catch(() => [] as string[]));
  return PUSH_CATEGORIES.map((c) => ({ ...c, enabled: !muted.has(c.key) }));
}

export async function setPushPreference(userId: string, category: string, enabled: boolean) {
  if (!CATEGORY_KEYS.has(category)) throw new Error('Categoria inválida');
  if (enabled) {
    await prisma.$executeRaw`DELETE FROM "push_muted_categories" WHERE "userId" = ${userId} AND "category" = ${category}`;
  } else {
    await prisma.$executeRaw`
      INSERT INTO "push_muted_categories" ("userId", "category") VALUES (${userId}, ${category})
      ON CONFLICT DO NOTHING
    `;
  }
}

/** Tira dos destinatários quem desativou essa categoria. Se a consulta falhar, envia a todos. */
async function withoutMuted(userIds: string[], category: string | null): Promise<string[]> {
  if (!category || !userIds.length) return userIds;
  try {
    const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT "userId" FROM "push_muted_categories"
      WHERE "category" = ${category} AND "userId" = ANY(${userIds}::text[])
    `;
    if (!rows.length) return userIds;
    const muted = new Set(rows.map((r) => r.userId));
    return userIds.filter((id) => !muted.has(id));
  } catch {
    return userIds;
  }
}

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
    // Atendimento da Contabilidade não vai para o celular (a tela nem existe no app).
    if (payload.data?.type === 'dp-contabilidade') return;
    const ids = await withoutMuted(
      [...new Set(userIds.filter((id): id is string => !!id))],
      categoryOfPayload(payload.data),
    );
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
            ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
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
  AWAITING_REFUEL: ['Liberado para abastecer', 'liberada para abastecer'],
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
  WAITING_MANAGER: 'Aguardando Aprovação',
  PENDING_DP: 'Pendente',
  IN_REVIEW_DP: 'Em Análise',
  IN_FINANCEIRO: 'No Financeiro',
  IN_ACCOUNTING: 'Na Contabilidade',
  WAITING_RETURN: 'Sua Pendência',
  WAITING_RETURN_ACCOUNTING: 'Pendência Contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência Engenharia',
  WAITING_SUPPLIES: 'Aguardando Suprimentos',
  WAITING_PAYMENT: 'Aguardando Pagamento',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

/** Título do aviso de cada etapa da solicitação interna (curto, no mesmo padrão dos demais). */
const DP_TITLE: Record<string, string> = {
  WAITING_MANAGER: 'Solicitação aguardando aprovação',
  PENDING_DP: 'Solicitação pendente',
  IN_REVIEW_DP: 'Solicitação em análise',
  IN_FINANCEIRO: 'Solicitação no Financeiro',
  IN_ACCOUNTING: 'Solicitação na Contabilidade',
  WAITING_RETURN: 'Você tem uma pendência',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência com ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência com a Engenharia',
  WAITING_SUPPLIES: 'Solicitação aguardando Suprimentos',
  WAITING_PAYMENT: 'Solicitação aguardando pagamento',
  CONCLUDED: 'Solicitação finalizada',
  CANCELLED: 'Solicitação cancelada',
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

const ACCOUNTING_DIRECT_TYPES: ReadonlySet<string> = new Set([
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
  'CONTAB_ADMISSAO',
  'CONTAB_AFASTAMENTO',
  'CONTAB_ATESTADO',
  'CONTAB_ALTERACAO_FUNCAO',
  'CONTAB_ALTERACAO_SALARIAL',
  'CONTAB_FERIAS',
  'CONTAB_RESCISAO',
]);

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

/**
 * Corpo do aviso de solicitação interna: primeira linha com o tipo e o número, demais linhas com
 * detalhes extras (ex.: solicitante). «Solicitação ADM/TST · Outros» + 222 vira «Outros #222».
 */
export function dpPushBody(title: unknown, displayNumber: unknown, extras: string[] = []): string {
  const parts = String(title ?? '')
    .split(/\s+[·—–]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Com «categoria · tipo», o tipo é o que identifica a solicitação; sem separador, vale o título todo.
  const tipo = (parts.length > 1 ? parts.slice(1).join(' · ') : parts[0]) || 'Solicitação';
  const numero = displayNumber != null && String(displayNumber).trim() ? ` #${String(displayNumber).trim()}` : '';
  return [`${tipo}${numero}`, ...extras].filter(Boolean).join('\n');
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
          const [title] = FUEL[status] ?? ['Atualização de combustível'];
          await sendPushToUsers([row.requesterId as string], {
            title,
            body: `Solicitação de abastecimento${ref(row.displayNumber)}`,
            data: { kind: 'fuel', entityId, status },
            // Liberado para abastecer: o motorista já vê o botão "Informar abastecido".
            ...(status === 'AWAITING_REFUEL'
              ? { categoryId: 'fuel-refuel' }
              : status === 'COMPLETED' || status === 'REJECTED'
                ? { categoryId: 'view-details' }
                : {}),
          });
          break;
        }
        case 'VehicleReservation': {
          const [title] = RESERVATION[status] ?? ['Atualização de reserva'];
          await sendPushToUsers([row.createdById as string], {
            title,
            body: `Reserva${ref(row.code)}`,
            data: { kind: 'reservation', entityId, status },
            // Aprovada (devolução) ou aguardando vistoria: botão direto para a reserva.
            ...(status === 'APPROVED' || status === 'COMPLETED'
              ? { categoryId: 'reservation-action' }
              : status === 'INSPECTED' || status === 'REJECTED'
                ? { categoryId: 'view-details' }
                : {}),
          });
          break;
        }
        case 'DpRequest': {
          // Solicitações diretas da Contabilidade não geram aviso no celular.
          if (ACCOUNTING_DIRECT_TYPES.has(String(row.requestType ?? ''))) break;
          const employee = await prisma.employee.findUnique({
            where: { id: String(row.employeeId ?? '') },
            select: { userId: true },
          });
          await sendPushToUsers([employee?.userId], {
            title: DP_TITLE[status] ?? `Solicitação ${(DP[status] ?? status).toLowerCase()}`,
            body: dpPushBody(row.title, row.displayNumber),
            data: { kind: 'dp', entityId, status },
          });
          break;
        }
        case 'GestaoOsWorkOrder': {
          const label = WORK_ORDER[status] ?? status;
          const code = row.osNumber != null ? `OS ${row.osNumber}` : row.displayNumber;
          await sendPushToUsers([row.requesterId as string, row.assigneeId as string], {
            title: `Chamado ${label.toLowerCase()}`,
            body: `Chamado${ref(code, '')}`,
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
