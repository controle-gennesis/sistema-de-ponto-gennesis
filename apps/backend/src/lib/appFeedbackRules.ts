import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Dias de uso (desde o cadastro) antes de a Gennecy perguntar pela primeira vez. */
export const DIAS_ANTES_DA_PRIMEIRA_PERGUNTA = 3;
/** Depois de responder ou dispensar, só volta a perguntar depois deste prazo. */
export const DIAS_ENTRE_PERGUNTAS = 90;

export const FEEDBACK_LIKE_OPTIONS = [
  'Facilidade de uso',
  'Velocidade',
  'Visual',
  'Funcionalidades',
  'Relatórios',
  'Aprovações',
  'A Gennecy',
];

const DIA_MS = 24 * 60 * 60 * 1000;

/** Pessoa dona do número de WhatsApp (pelo celular do cadastro do funcionário), se houver. */
export async function findUserByWhatsAppPhone(
  phone: string,
): Promise<{ id: string; createdAt: Date; isAdmin: boolean } | null> {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const rows = await prisma.$queryRaw<
    Array<{ id: string; createdAt: Date; position: string | null }>
  >`
    SELECT u."id", u."createdAt", e."position"
    FROM "employees" e
    JOIN "users" u ON u."id" = e."userId"
    WHERE e."phone" IS NOT NULL
      AND RIGHT(REGEXP_REPLACE(e."phone", '\\D', '', 'g'), 11) = RIGHT(${digits}, 11)
    LIMIT 2
  `;
  // Número repetido em mais de um cadastro: não dá para saber quem é.
  if (rows.length !== 1) return null;
  const r = rows[0];
  return {
    id: r.id,
    createdAt: r.createdAt,
    isAdmin: (r.position || '').trim().toLowerCase() === 'administrador',
  };
}

/**
 * O bot deve convidar este número para avaliar agora? Mesmas regras do balão no sistema:
 * nunca para administradores, só depois de alguns dias de uso e uma vez a cada 90 dias
 * (conta a última pergunta feita por qualquer canal, respondida ou não).
 */
export async function shouldAskWhatsAppFeedback(phone: string): Promise<boolean> {
  const user = await findUserByWhatsAppPhone(phone);
  if (user?.isAdmin) return false;
  if (
    user &&
    (Date.now() - new Date(user.createdAt).getTime()) / DIA_MS < DIAS_ANTES_DA_PRIMEIRA_PERGUNTA
  ) {
    return false;
  }
  const porPessoa = user ? Prisma.sql` OR f."userId" = ${user.id}` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ ultimo: Date | null }>>`
    SELECT MAX(f."createdAt") AS ultimo
    FROM "app_feedback" f
    WHERE f."phone" = ${phone}${porPessoa}
  `;
  const ultimo = rows[0]?.ultimo;
  if (!ultimo) return true;
  return (Date.now() - new Date(ultimo).getTime()) / DIA_MS >= DIAS_ENTRE_PERGUNTAS;
}

/**
 * Registra que a pergunta foi feita (como "dispensada"). Se a pessoa responder, a mesma linha
 * é atualizada; se ignorar, o convite já conta e não volta a ser feito antes do prazo.
 */
export async function registerWhatsAppFeedbackAsk(phone: string): Promise<string> {
  const user = await findUserByWhatsAppPhone(phone);
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "app_feedback" ("id", "userId", "source", "phone", "dismissed")
    VALUES (${id}, ${user?.id ?? null}, 'WHATSAPP', ${phone}, true)
  `;
  return id;
}

export async function saveWhatsAppFeedbackRating(id: string, rating: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "app_feedback" SET "rating" = ${rating}, "dismissed" = false WHERE "id" = ${id}
  `;
}

export async function saveWhatsAppFeedbackLikes(id: string, likes: string[]): Promise<void> {
  const text = likes.join(', ').slice(0, 300);
  await prisma.$executeRaw`
    UPDATE "app_feedback" SET "likes" = ${text || null} WHERE "id" = ${id}
  `;
}

export async function saveWhatsAppFeedbackComment(id: string, comment: string): Promise<void> {
  const text = comment.trim().slice(0, 1000);
  await prisma.$executeRaw`
    UPDATE "app_feedback" SET "comment" = ${text || null} WHERE "id" = ${id}
  `;
}
