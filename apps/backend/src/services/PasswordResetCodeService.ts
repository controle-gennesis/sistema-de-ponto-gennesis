import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { hashPassword } from '../lib/passwordHash';
import { findUserByLoginIdentifier, normalizeLoginIdentifier } from '../lib/loginIdentifier';
import { recordAuditEvent } from '../lib/auditLog';
import { emailService } from './EmailService';

/**
 * Redefinição de senha por código de 6 dígitos enviado por e-mail (o usuário digita no app).
 * - Código de 6 dígitos, validade de 10 min, no máx. 5 tentativas erradas, uso único.
 * - Só o hash do código fica no banco (tabela `password_reset_codes`, via SQL direto).
 * - Pedidos repetidos em menos de 60 s não geram novo envio.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string): string {
  return crypto.createHash('sha256').update(`pwd-reset-code:${userId}:${code}`).digest('hex');
}

function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** jo***@gmail.com */
export function maskEmail(email: string): string {
  const [user, domain] = String(email).split('@');
  if (!user || !domain) return '••••';
  return `${user.slice(0, 2)}***@${domain}`;
}

async function sendCode(email: string, name: string, code: string): Promise<boolean> {
  try {
    await emailService.sendPasswordResetCodeEmail(email, name, code);
    return true;
  } catch (err) {
    console.error('Falha ao enviar o código por e-mail:', err instanceof Error ? err.message : err);
    return false;
  }
}

export type RequestCodeResult = { sent: boolean; maskedEmail: string | null };

/** Pede o código. Nunca revela se a conta existe: sem conta/e-mail, devolve `sent: false`. */
export async function requestResetCode(identifierRaw: unknown): Promise<RequestCodeResult> {
  const identifier = normalizeLoginIdentifier(identifierRaw);
  if (!identifier) throw createError('Informe o e-mail ou CPF cadastrado', 400);

  const user = await findUserByLoginIdentifier(identifier);
  const email = user?.email?.trim() || '';
  if (!user || !user.isActive || !email) {
    return { sent: false, maskedEmail: null };
  }

  const recent = await prisma.$queryRaw<Array<{ createdAt: Date }>>`
    SELECT "createdAt" FROM "password_reset_codes"
    WHERE "userId" = ${user.id} AND "used" = false
    ORDER BY "createdAt" DESC LIMIT 1
  `;
  if (recent[0] && Date.now() - new Date(recent[0].createdAt).getTime() < RESEND_COOLDOWN_MS) {
    // Já enviado agora há pouco: não reenvia (evita spam), mas a tela segue pro passo do código.
    return { sent: true, maskedEmail: maskEmail(email) };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // Invalida códigos anteriores e grava o novo.
  await prisma.$executeRaw`UPDATE "password_reset_codes" SET "used" = true WHERE "userId" = ${user.id} AND "used" = false`;
  await prisma.$executeRaw`
    INSERT INTO "password_reset_codes" ("id", "userId", "codeHash", "expiresAt", "attempts", "used", "createdAt")
    VALUES (${randomUUID()}, ${user.id}, ${hashCode(user.id, code)}, ${new Date(Date.now() + CODE_TTL_MS)}, 0, false, NOW())
  `;

  const delivered = await sendCode(email, user.name, code);
  if (!delivered) {
    await prisma.$executeRaw`UPDATE "password_reset_codes" SET "used" = true WHERE "userId" = ${user.id} AND "used" = false`;
    throw createError(
      'Não foi possível enviar o e-mail com o código agora. Tente de novo em instantes ou fale com o suporte.',
      503
    );
  }

  recordAuditEvent({
    action: 'CREATE',
    entity: 'PasswordResetCode',
    entityId: user.id,
    summary: 'Solicitou código de redefinição de senha por e-mail',
    userId: user.id,
  });

  return { sent: true, maskedEmail: maskEmail(email) };
}

/** Confere o código e troca a senha. Mensagem de erro é a mesma pra código errado/expirado/inexistente. */
export async function resetPasswordWithCode(
  identifierRaw: unknown,
  codeRaw: unknown,
  newPasswordRaw: unknown
) {
  const identifier = normalizeLoginIdentifier(identifierRaw);
  const code = digitsOnly(String(codeRaw ?? ''));
  const newPassword = String(newPasswordRaw ?? '');

  if (newPassword.length < 8) {
    throw createError('A nova senha deve ter ao menos 8 caracteres', 400);
  }
  const invalid = () => createError('Código inválido ou expirado. Solicite um novo.', 400);
  if (!identifier || code.length !== 6) throw invalid();

  const user = await findUserByLoginIdentifier(identifier);
  if (!user) throw invalid();

  const rows = await prisma.$queryRaw<
    Array<{ id: string; codeHash: string; attempts: number; expiresAt: Date }>
  >`
    SELECT "id", "codeHash", "attempts", "expiresAt" FROM "password_reset_codes"
    WHERE "userId" = ${user.id} AND "used" = false
    ORDER BY "createdAt" DESC LIMIT 1
  `;
  const record = rows[0];
  if (!record || new Date(record.expiresAt).getTime() < Date.now() || record.attempts >= MAX_ATTEMPTS) {
    throw invalid();
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(record.codeHash, 'hex'),
    Buffer.from(hashCode(user.id, code), 'hex')
  );
  if (!matches) {
    await prisma.$executeRaw`UPDATE "password_reset_codes" SET "attempts" = "attempts" + 1 WHERE "id" = ${record.id}`;
    throw invalid();
  }

  const hashedPassword = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      // tokenVersion++ derruba as sessões abertas, como nos outros fluxos de troca de senha.
      data: { password: hashedPassword, isFirstLogin: false, tokenVersion: { increment: 1 } },
    }),
    prisma.$executeRaw`UPDATE "password_reset_codes" SET "used" = true WHERE "userId" = ${user.id} AND "used" = false`,
  ]);

  recordAuditEvent({
    action: 'CREATE',
    entity: 'PasswordResetCode',
    entityId: record.id,
    summary: 'Redefiniu a senha pelo código enviado por e-mail',
    userId: user.id,
  });
}
