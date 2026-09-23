import crypto from 'crypto';

/**
 * Confere se um POST no webhook da Meta (WhatsApp Cloud API) realmente veio da Meta,
 * comparando o header `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto, usando o App
 * Secret) — sem isso, qualquer um que descubra a URL do webhook consegue forjar eventos
 * (criar solicitações via bot em nome de números de telefone arbitrários).
 *
 * Se `appSecret` não estiver configurado, retorna `true` (não bloqueia) para não quebrar
 * o bot antes de o App Secret ser cadastrado no Railway — mas registra um aviso.
 */
export function verifyMetaWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | string[] | undefined,
  appSecret: string | undefined
): boolean {
  if (!appSecret) {
    console.warn(
      '[WhatsApp Webhook] WHATSAPP_APP_SECRET não configurado — assinatura do webhook NÃO está sendo validada.'
    );
    return true;
  }

  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature || !rawBody) return false;

  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
