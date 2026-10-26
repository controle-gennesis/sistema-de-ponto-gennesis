import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { decryptTotvsSecret, encryptTotvsSecret } from '../lib/totvsCredentialCrypto';
import { ensureUserTotvsCredentialsTable } from '../lib/ensureProductionSchema';

export type TotvsLinkStatus = {
  linked: boolean;
  totvsUser: string | null;
  linkedAt: string | null;
  /** O TOTVS recusou a senha vinculada: o envio fica bloqueado até vincular de novo. */
  rejectedAt: string | null;
};

export type TotvsUserCredentials = {
  user: string;
  pass: string;
  /** Senha já recusada pelo TOTVS — não pode ser usada até vincular de novo. */
  rejected?: boolean;
};

function newCredentialId(): string {
  return `utc_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

/**
 * Credenciais TOTVS por usuário do Conecta.
 * - Cada userId só lê/grava o próprio vínculo (rotas usam req.user.id).
 * - A senha nunca é devolvida pela API (só status: login + linkedAt).
 * - getCredentialsForUser é só no backend, no momento do envio da OC pelo mesmo userId.
 */
export class UserTotvsCredentialService {
  async getStatus(userId: string): Promise<TotvsLinkStatus> {
    await ensureUserTotvsCredentialsTable(prisma);
    const rows = await prisma.$queryRaw<
      Array<{ totvsUser: string; linkedAt: Date | string | null; rejectedAt: Date | string | null }>
    >`
      SELECT "totvsUser", "linkedAt", "rejectedAt"
      FROM "user_totvs_credentials"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row?.totvsUser) {
      return { linked: false, totvsUser: null, linkedAt: null, rejectedAt: null };
    }
    return {
      linked: true,
      totvsUser: row.totvsUser,
      linkedAt: row.linkedAt ? new Date(row.linkedAt).toISOString() : null,
      rejectedAt: row.rejectedAt ? new Date(row.rejectedAt).toISOString() : null,
    };
  }

  async link(userId: string, totvsUserRaw: string, totvsPasswordRaw: string): Promise<TotvsLinkStatus> {
    await ensureUserTotvsCredentialsTable(prisma);
    const totvsUser = String(totvsUserRaw || '').trim();
    const totvsPassword = String(totvsPasswordRaw || '');
    if (!totvsUser) throw createError('Informe o login do TOTVS', 400);
    if (!totvsPassword.trim()) throw createError('Informe a senha do TOTVS', 400);

    const enc = encryptTotvsSecret(totvsPassword);
    const id = newCredentialId();
    await prisma.$executeRaw`
      INSERT INTO "user_totvs_credentials" ("id", "userId", "totvsUser", "totvsPasswordEnc", "linkedAt", "updatedAt")
      VALUES (${id}, ${userId}, ${totvsUser}, ${enc}, NOW(), NOW())
      ON CONFLICT ("userId") DO UPDATE SET
        "totvsUser" = EXCLUDED."totvsUser",
        "totvsPasswordEnc" = EXCLUDED."totvsPasswordEnc",
        "linkedAt" = NOW(),
        "updatedAt" = NOW(),
        "rejectedAt" = NULL
    `;
    return this.getStatus(userId);
  }

  async unlink(userId: string): Promise<TotvsLinkStatus> {
    await ensureUserTotvsCredentialsTable(prisma);
    await prisma.$executeRaw`
      DELETE FROM "user_totvs_credentials" WHERE "userId" = ${userId}
    `;
    return { linked: false, totvsUser: null, linkedAt: null, rejectedAt: null };
  }

  /**
   * O TOTVS recusou a senha vinculada (401): bloqueia o uso dela até o usuário vincular de novo.
   * Assim cada senha errada gera no máximo uma recusa no RM — várias recusas bloqueiam o usuário lá.
   */
  async markRejected(userId: string): Promise<void> {
    await ensureUserTotvsCredentialsTable(prisma);
    await prisma.$executeRaw`
      UPDATE "user_totvs_credentials" SET "rejectedAt" = NOW(), "updatedAt" = NOW()
      WHERE "userId" = ${userId}
    `;
  }

  /** Somente uso interno no envio da OC — nunca expor em resposta HTTP. */
  async getCredentialsForUser(userId: string): Promise<TotvsUserCredentials | null> {
    if (!userId?.trim()) return null;
    await ensureUserTotvsCredentialsTable(prisma);
    const rows = await prisma.$queryRaw<
      Array<{ totvsUser: string; totvsPasswordEnc: string; rejectedAt: Date | string | null }>
    >`
      SELECT "totvsUser", "totvsPasswordEnc", "rejectedAt"
      FROM "user_totvs_credentials"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row?.totvsUser || !row.totvsPasswordEnc) return null;
    return {
      user: row.totvsUser.trim(),
      pass: decryptTotvsSecret(row.totvsPasswordEnc),
      rejected: !!row.rejectedAt,
    };
  }
}

export const userTotvsCredentialService = new UserTotvsCredentialService();
