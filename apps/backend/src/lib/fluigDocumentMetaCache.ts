import { prisma } from './prisma';
import { ensureFluigDocumentFileMetaTable } from './ensureFluigDatasetMirrorSchema';
import type { FluigService } from '../services/FluigService';

/** Reabre a solicitação sem ir ao Fluig de novo durante este prazo. */
const META_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** O link de download do Fluig é temporário; só reaproveita por alguns minutos. */
const URL_TTL_MS = 15 * 60 * 1000;
/** Quantos anexos novos consultar ao mesmo tempo. O restante espera a vez. */
const FETCH_CONCURRENCY = 2;

export type FluigDocumentMeta = {
  documentId: string;
  filename: string | null;
  empty: boolean;
  url: string | null;
};

let schemaReady: Promise<void> | null = null;
const inflight = new Map<string, Promise<FluigDocumentMeta>>();

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = ensureFluigDocumentFileMetaTable(prisma).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function readFresh(ids: string[]): Promise<Map<string, FluigDocumentMeta>> {
  const cutoff = new Date(Date.now() - META_TTL_MS);
  const rows = await prisma.fluigDocumentFileMeta.findMany({
    where: { documentId: { in: ids }, checkedAt: { gte: cutoff } },
  });
  const map = new Map<string, FluigDocumentMeta>();
  for (const row of rows) {
    map.set(row.documentId, {
      documentId: row.documentId,
      filename: row.filename,
      empty: row.empty,
      url: row.downloadUrl,
    });
  }
  return map;
}

async function remember(items: FluigDocumentMeta[]): Promise<void> {
  const definitive = items.filter((item) => item.url);
  if (definitive.length === 0) return;
  const now = new Date();
  await prisma.$transaction(
    definitive.map((item) =>
      prisma.fluigDocumentFileMeta.upsert({
        where: { documentId: item.documentId },
        create: {
          documentId: item.documentId,
          filename: item.filename,
          downloadUrl: item.url,
          empty: item.empty,
          checkedAt: now,
        },
        update: {
          filename: item.filename,
          downloadUrl: item.url,
          empty: item.empty,
          checkedAt: now,
        },
      })
    )
  );
}

async function fetchOne(fluig: FluigService, id: string): Promise<FluigDocumentMeta> {
  const pending = inflight.get(id);
  if (pending) return pending;
  const job = fluig.getDocumentFileMeta(id).finally(() => {
    inflight.delete(id);
  });
  inflight.set(id, job);
  return job;
}

async function fetchMissing(fluig: FluigService, ids: string[]): Promise<FluigDocumentMeta[]> {
  const out: FluigDocumentMeta[] = new Array(ids.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, ids.length) }, async () => {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fetchOne(fluig, ids[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Devolve metadados já guardados e só consulta o Fluig para os ids que ainda não temos. */
export async function resolveFluigDocumentMetas(
  fluig: FluigService,
  ids: string[]
): Promise<FluigDocumentMeta[]> {
  await ensureSchema();
  const cached = await readFresh(ids);
  const missing = ids.filter((id) => !cached.has(id));
  const fetched = missing.length > 0 ? await fetchMissing(fluig, missing) : [];
  await remember(fetched);
  const byId = new Map<string, FluigDocumentMeta>(cached);
  for (const item of fetched) byId.set(item.documentId, item);
  return ids.map(
    (id) =>
      byId.get(id) ?? {
        documentId: id,
        filename: null,
        empty: false,
        url: null,
      }
  );
}

/** Link recente do mesmo anexo, para o download não resolver a URL de novo. */
export async function freshFluigDownloadUrl(documentId: string): Promise<string | null> {
  await ensureSchema();
  const cutoff = new Date(Date.now() - URL_TTL_MS);
  const row = await prisma.fluigDocumentFileMeta.findUnique({
    where: { documentId },
  });
  if (!row || row.empty || !row.downloadUrl || row.checkedAt < cutoff) return null;
  return row.downloadUrl;
}
