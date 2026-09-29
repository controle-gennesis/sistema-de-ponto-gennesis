import { FuelRefuelRequestStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { postFuelChatMessage } from './fuelRefuelChatNotify';
import { metaWhatsApp } from '../services/MetaWhatsAppService';
import { fuelRefuelRequestService } from '../services/FuelRefuelRequestService';

/** Prefixo com id da solicitação (botões interativos na janela de 24h). */
export const FUEL_CHECK_YES_PREFIX = 'fuel_chk_y_';
export const FUEL_CHECK_NO_PREFIX = 'fuel_chk_n_';

/**
 * Payloads fixos dos botões do template no Meta Business Manager
 * (WhatsApp Manager → Modelos → botões de resposta rápida).
 * Configure os IDs dos botões exatamente assim (ou ajuste a lista).
 */
export const FUEL_CHECK_YES_TEMPLATE_IDS = ['fuel_chk_yes', 'fuel_check_yes'] as const;
export const FUEL_CHECK_NO_TEMPLATE_IDS = ['fuel_chk_no', 'fuel_check_no'] as const;

const BRAZIL_TZ = 'America/Sao_Paulo';
const TEMPLATE_LANGUAGE = 'pt_BR';

/** Nome do modelo aprovado no Meta. Sobrescreva com WHATSAPP_FUEL_EVENING_CHECK_TEMPLATE. */
export function fuelEveningCheckTemplateName(): string {
  return (
    process.env.WHATSAPP_FUEL_EVENING_CHECK_TEMPLATE?.trim() || 'abastecimento_lembrete_19h'
  );
}

function brazilCalendarDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAZIL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function normalizePhoneDigits(phone: string): string {
  let number = String(phone)
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '');
  if (!number.startsWith('55') && number.length <= 11) {
    number = '55' + number;
  }
  return number;
}

export type FuelEveningCheckReply = {
  kind: 'yes' | 'no';
  /** Presente quando o botão interativo já trouxe o id da solicitação. */
  requestId: string | null;
};

/**
 * Detecta resposta Sim/Não do lembrete (id do botão interativo ou payload fixo do template).
 * Não trata "sim"/"não" soltos — isso fica a cargo do handler com contexto no payload.
 */
export function parseFuelEveningCheckReply(content: string): FuelEveningCheckReply | null {
  const c = content.trim();
  if (!c) return null;
  const lower = c.toLowerCase();

  if (lower.startsWith(FUEL_CHECK_YES_PREFIX)) {
    return { kind: 'yes', requestId: c.slice(FUEL_CHECK_YES_PREFIX.length) || null };
  }
  if (lower.startsWith(FUEL_CHECK_NO_PREFIX)) {
    return { kind: 'no', requestId: c.slice(FUEL_CHECK_NO_PREFIX.length) || null };
  }

  if (FUEL_CHECK_YES_TEMPLATE_IDS.some((id) => lower === id)) {
    return { kind: 'yes', requestId: null };
  }
  if (FUEL_CHECK_NO_TEMPLATE_IDS.some((id) => lower === id)) {
    return { kind: 'no', requestId: null };
  }

  return null;
}

/** Texto Sim/Não após o lembrete (quando o payload da conversa guarda a solicitação). */
export function parseFuelEveningCheckPlainYesNo(content: string): 'yes' | 'no' | null {
  const lower = content.trim().toLowerCase();
  if (/^(sim|s|yes|confirmo|confirmar)$/i.test(lower)) return 'yes';
  if (/^(n[aã]o|nao|n)$/i.test(lower)) return 'no';
  return null;
}

/** @deprecated use parseFuelEveningCheckReply */
export function isFuelCheckYesReply(content: string): string | null {
  const parsed = parseFuelEveningCheckReply(content);
  if (!parsed || parsed.kind !== 'yes') return null;
  return parsed.requestId ?? '';
}

/** @deprecated use parseFuelEveningCheckReply */
export function isFuelCheckNoReply(content: string): string | null {
  const parsed = parseFuelEveningCheckReply(content);
  if (!parsed || parsed.kind !== 'no') return null;
  return parsed.requestId ?? '';
}

function firstNameFrom(fullName: string | null | undefined): string {
  const name = String(fullName || '').trim();
  if (!name) return 'olá';
  return name.split(/\s+/)[0] || name;
}

function buildCheckBody(params: { firstName: string; displayNumber: number }): string {
  return [
    `⛽ Confirmação de abastecimento`,
    '',
    `Olá, ${params.firstName}!`,
    '',
    `Sua solicitação #${params.displayNumber} ainda está pendente de informe.`,
    '',
    'Você já abasteceu?',
    '',
    'O prazo é até *22:00 de hoje* — não é possível adiar para amanhã.',
  ].join('\n');
}

/**
 * Texto sugerido para o modelo no Meta (pt_BR), com botões Sim / Não
 * (IDs: fuel_chk_yes / fuel_chk_no):
 *
 * ⛽ Confirmação de abastecimento
 *
 * Olá, {{1}}!
 *
 * Sua solicitação #{{2}} ainda está pendente de informe.
 *
 * Você já abasteceu? Lembrete: o prazo é até 22:00 de hoje e não pode ser adiado para amanhã.
 */
export const FUEL_EVENING_CHECK_TEMPLATE_BODY_HINT = [
  'Olá, {{1}}!',
  '',
  'Sua solicitação #{{2}} ainda está pendente de informe.',
  '',
  'Você já abasteceu? Lembrete: o prazo é até 22:00 de hoje e não pode ser adiado para amanhã.',
].join('\n');

async function rememberCheckOnConversation(phone: string, requestId: string, displayNumber: number) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return;
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: {
      OR: [{ phone: digits }, { phone: phone.trim() }, { phone: { endsWith: digits.slice(-11) } }],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, payload: true },
  });
  if (!conversation) return;
  const prev = (conversation.payload as Record<string, unknown> | null) || {};
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      payload: {
        ...prev,
        fuelEveningCheckRequestId: requestId,
        fuelEveningCheckDisplayNumber: displayNumber,
        fuelEveningCheckAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Resolve a solicitação do lembrete: id do botão, payload da conversa ou última lembrada no telefone.
 */
export async function resolveFuelEveningCheckRequestId(params: {
  phone: string;
  requestIdFromButton?: string | null;
  payload?: Record<string, unknown>;
}): Promise<string | null> {
  const fromButton = params.requestIdFromButton?.trim();
  if (fromButton) return fromButton;

  const fromPayload = String(params.payload?.fuelEveningCheckRequestId || '').trim();
  if (fromPayload) return fromPayload;

  const digits = normalizePhoneDigits(params.phone);
  if (!digits) return null;

  const since = new Date(Date.now() - 14 * 60 * 60 * 1000);
  const candidates = await prisma.fuelRefuelRequest.findMany({
    where: {
      status: FuelRefuelRequestStatus.AWAITING_REFUEL,
      refuelCheckRemindedAt: { gte: since },
      sourceWhatsAppPhone: { not: null },
    },
    orderBy: { refuelCheckRemindedAt: 'desc' },
    select: { id: true, sourceWhatsAppPhone: true },
    take: 30,
  });

  const match = candidates.find((c) => {
    const p = c.sourceWhatsAppPhone?.trim();
    if (!p) return false;
    const pd = normalizePhoneDigits(p);
    return pd === digits || pd.endsWith(digits.slice(-11)) || digits.endsWith(pd.slice(-11));
  });

  return match?.id ?? null;
}

/**
 * Envia lembrete das 19h (Brasília) via template Meta (fora da janela 24h)
 * e, se falhar, tenta botões interativos (só na janela 24h).
 *
 * Template esperado no Meta (pt_BR), ex.: `abastecimento_lembrete_19h`:
 * Cabeçalho: ⛽ Confirmação de abastecimento
 * Corpo:
 *   Olá, {{1}}!
 *
 *   Sua solicitação #{{2}} ainda está pendente de informe.
 *
 *   Você já abasteceu? Lembrete: o prazo é até 22:00 de hoje e não pode ser adiado para amanhã.
 * Botões: Sim (`fuel_chk_yes`) / Não (`fuel_chk_no`).
 */
export async function sendFuelRefuelEveningChecks(now = new Date()): Promise<{ sent: number }> {
  const todayKey = brazilCalendarDateKey(now);
  const templateName = fuelEveningCheckTemplateName();

  const rows = await prisma.fuelRefuelRequest.findMany({
    where: {
      status: FuelRefuelRequestStatus.AWAITING_REFUEL,
      refuelDeadlineAt: { not: null },
      refuelCheckRemindedAt: null,
      OR: [{ sourceWhatsAppPhone: { not: null } }, { sourceChatId: { not: null } }],
    },
    select: {
      id: true,
      displayNumber: true,
      driverName: true,
      refuelDeadlineAt: true,
      sourceChatId: true,
      sourceWhatsAppPhone: true,
      requester: { select: { name: true } },
    },
    take: 200,
  });

  let sent = 0;
  for (const row of rows) {
    if (!row.refuelDeadlineAt) continue;
    if (brazilCalendarDateKey(row.refuelDeadlineAt) !== todayKey) continue;
    if (row.refuelDeadlineAt.getTime() <= now.getTime()) continue;

    const firstName = firstNameFrom(row.driverName || row.requester?.name);
    const body = buildCheckBody({ firstName, displayNumber: row.displayNumber });
    const phone = row.sourceWhatsAppPhone?.trim() || '';
    let ok = false;

    if (phone) {
      try {
        ok = await metaWhatsApp.sendTemplate(phone, templateName, TEMPLATE_LANGUAGE, [
          firstName,
          String(row.displayNumber),
        ]);
        if (!ok) {
          ok = await metaWhatsApp.sendButtons(phone, body, [
            { id: `${FUEL_CHECK_YES_PREFIX}${row.id}`, title: 'Sim' },
            { id: `${FUEL_CHECK_NO_PREFIX}${row.id}`, title: 'Não' },
          ]);
        }
        if (ok) {
          await rememberCheckOnConversation(phone, row.id, row.displayNumber);
        }
      } catch (err) {
        console.error(`[FuelEveningCheck] WhatsApp #${row.displayNumber}:`, err);
      }
    }

    if (row.sourceChatId) {
      try {
        await postFuelChatMessage(
          row.sourceChatId,
          `${body}\n\nResponda *Sim* ou *Não* (ou use os botões no WhatsApp).`,
        );
        ok = true;
      } catch (err) {
        console.error(`[FuelEveningCheck] Chat #${row.displayNumber}:`, err);
      }
    }

    if (!ok) continue;

    await prisma.fuelRefuelRequest.update({
      where: { id: row.id },
      data: { refuelCheckRemindedAt: now },
    });
    sent += 1;
  }

  return { sent };
}

export async function cancelFuelRequestFromEveningCheck(requestId: string) {
  return fuelRefuelRequestService.cancelAwaitingRefuelBySystem(
    requestId,
    'Cancelada automaticamente: colaborador informou que não abasteceu (lembrete 19h).',
    { silentNotify: true },
  );
}
