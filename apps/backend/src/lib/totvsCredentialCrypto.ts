import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function secretKey(): Buffer {
  const raw =
    (process.env.TOTVS_CREDENTIALS_SECRET || process.env.JWT_SECRET || 'conecta-totvs-link-dev').trim();
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

/** Criptografa senha TOTVS para gravar no banco (AES-256-GCM). */
export function encryptTotvsSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptTotvsSecret(payload: string): string {
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Credencial TOTVS inválida no cadastro');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv(ALGO, secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
