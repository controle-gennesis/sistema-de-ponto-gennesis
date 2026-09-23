/** Helpers de compatibilidade AWS SDK v2 → v3 (client-s3 não tem mais `.Location` nem Body como Buffer). */

/** Mesmo formato de URL que o AWS SDK v2 devolvia em `.upload(...).Location`. */
export function buildS3Location(bucket: string, region: string, key: string): string {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** No SDK v2 o erro de chave inexistente vinha em `err.code`; no v3 vem em `err.name`. */
export function isS3NoSuchKey(error: unknown): boolean {
  const e = error as { code?: string; name?: string } | null | undefined;
  return e?.code === 'NoSuchKey' || e?.name === 'NoSuchKey';
}

/** GetObjectCommand devolve `Body` como stream (Node.Readable) em vez do Buffer que o v2 dava. */
export async function s3BodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  const withByteArray = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withByteArray.transformToByteArray === 'function') {
    const bytes = await withByteArray.transformToByteArray();
    return Buffer.from(bytes);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function s3BodyToString(body: unknown, encoding: BufferEncoding = 'utf-8'): Promise<string> {
  const buf = await s3BodyToBuffer(body);
  return buf.toString(encoding);
}
