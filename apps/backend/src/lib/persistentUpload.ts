import fs from 'fs';
import path from 'path';
import { RequestHandler } from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { backendUploadsRoot } from './uploads';
import { fixMulterOriginalName } from './fixUploadFileName';
import { s3BodyToBuffer } from './awsS3Compat';

type UploadFileInput = {
  folder: string;
  buffer: Buffer;
  originalName?: string;
  mimeType?: string;
  /** Prefixo no nome do arquivo (ex.: `nf-`, `boleto-`). */
  fileNamePrefix?: string;
  /** Inclui o nome original sanitizado no arquivo (ex.: ASO). */
  includeSafeOriginalName?: boolean;
};

type UploadFileResult = {
  /** Caminho público estável (`/uploads/...`) — mesmo formato legado. */
  url: string;
  key: string;
  fileName: string;
  /** Nome original com acentos corrigidos (quando Multer entregou mojibake). */
  originalName: string;
};

function s3Enabled(): boolean {
  return (
    process.env.STORAGE_PROVIDER !== 'local' &&
    !!process.env.AWS_ACCESS_KEY_ID &&
    !!process.env.AWS_SECRET_ACCESS_KEY
  );
}

function getS3(): { client: S3Client; bucket: string } | null {
  if (!s3Enabled()) return null;
  return {
    client: new S3Client({
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      region: process.env.AWS_REGION || 'us-east-1',
    }),
    bucket: process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos',
  };
}

function safeExtFromName(originalName: string | undefined, fallback = '.bin'): string {
  const ext = path.extname(originalName || '') || fallback;
  return ext.length <= 8 ? ext : fallback;
}

function buildFileName(input: UploadFileInput): string {
  const prefix = input.fileNamePrefix || '';
  const ext = safeExtFromName(input.originalName);
  if (input.includeSafeOriginalName) {
    const safeName = (input.originalName || 'arquivo')
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .slice(0, 80);
    return `${prefix}${uuidv4()}-${safeName}`;
  }
  return `${prefix}${uuidv4()}${ext}`;
}

function assertSafeUploadKey(key: string): boolean {
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return false;
  // pastas conhecidas de anexo + uuid/nome
  return /^[a-z0-9][a-z0-9.\-_\/]*$/i.test(key) && key.includes('/');
}

function saveLocally(folder: string, fileName: string, buffer: Buffer): void {
  const uploadsDir = path.join(backendUploadsRoot, folder);
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
}

function saveLocallyFromPath(folder: string, fileName: string, sourcePath: string): void {
  const uploadsDir = path.join(backendUploadsRoot, folder);
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(uploadsDir, fileName));
}

/**
 * Grava anexo de forma persistente (S3, como Tasks/Kanban).
 * Em dev sem AWS, ou se o S3 falhar, grava no disco local.
 * Sempre devolve URL relativa `/uploads/{folder}/{file}` para o front continuar igual.
 */
export async function savePersistentUpload(input: UploadFileInput): Promise<UploadFileResult> {
  const folder = String(input.folder || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '');
  if (!folder) {
    throw new Error('Pasta de upload inválida');
  }

  const originalName = fixMulterOriginalName(input.originalName);
  const normalizedInput: UploadFileInput = { ...input, originalName };
  const fileName = buildFileName(normalizedInput);
  const key = `${folder}/${fileName}`;
  const url = `/uploads/${key}`;
  const contentType = input.mimeType || 'application/octet-stream';

  const s3 = getS3();
  if (s3) {
    try {
      await s3.client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: contentType,
          ACL: 'private',
        })
      );
      return { url, key, fileName, originalName };
    } catch (error) {
      console.warn(`[persistentUpload] Falha S3 em ${key}. Gravando local.`, error);
    }
  }

  saveLocally(folder, fileName, input.buffer);
  return { url, key, fileName, originalName };
}

/** Igual a savePersistentUpload, mas lê do disco (stream) — evita carregar ZIPs grandes na RAM. */
export async function savePersistentUploadFromPath(input: {
  folder: string;
  diskPath: string;
  originalName?: string;
  mimeType?: string;
  includeSafeOriginalName?: boolean;
}): Promise<UploadFileResult> {
  const folder = String(input.folder || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '');
  if (!folder) throw new Error('Pasta de upload inválida');
  if (!input.diskPath || !fs.existsSync(input.diskPath)) {
    throw new Error('Arquivo de origem não encontrado');
  }

  const originalName = fixMulterOriginalName(input.originalName);
  const fileName = buildFileName({
    folder,
    buffer: Buffer.alloc(0),
    originalName,
    includeSafeOriginalName: input.includeSafeOriginalName,
  });
  const key = `${folder}/${fileName}`;
  const url = `/uploads/${key}`;
  const contentType = input.mimeType || 'application/octet-stream';

  const s3 = getS3();
  if (s3) {
    try {
      await s3.client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: fs.createReadStream(input.diskPath),
          ContentType: contentType,
          ACL: 'private',
        })
      );
      return { url, key, fileName, originalName };
    } catch (error) {
      console.warn(`[persistentUpload] Falha S3 em ${key}. Gravando local.`, error);
    }
  }

  saveLocallyFromPath(folder, fileName, input.diskPath);
  return { url, key, fileName, originalName };
}

/** Remove arquivo persistente (disco local e/ou S3). Ignora falhas de storage. */
export async function deletePersistentUpload(keyOrUrl: string | null | undefined): Promise<void> {
  const key = String(keyOrUrl || '')
    .replace(/^\/uploads\//, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  if (!assertSafeUploadKey(key)) return;

  const localPath = path.join(backendUploadsRoot, ...key.split('/'));
  try {
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
  } catch {
    // ignore
  }

  const s3 = getS3();
  if (!s3) return;
  try {
    await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
  } catch {
    // ignore
  }
}

/**
 * Grava buffer já com nome/caminho definidos (ex.: snapshot de mapa de cotação).
 * `keepLocalCopy`: também grava no disco (útil quando o servidor usa sendFile).
 */
export async function savePersistentBuffer(input: {
  folder: string;
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
  keepLocalCopy?: boolean;
}): Promise<UploadFileResult> {
  const folder = String(input.folder || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '');
  const fileName = String(input.fileName || '').replace(/[\\/]/g, '');
  if (!folder || !fileName) {
    throw new Error('Pasta/arquivo de upload inválidos');
  }
  const key = `${folder}/${fileName}`;
  const url = `/uploads/${key}`;
  const s3 = getS3();
  if (s3) {
    try {
      await s3.client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.mimeType || 'application/octet-stream',
          ACL: 'private',
        })
      );
      if (input.keepLocalCopy) {
        saveLocally(folder, fileName, input.buffer);
      }
      return { url, key, fileName, originalName: fileName };
    } catch (error) {
      console.warn(`[persistentUpload] Falha S3 em ${key}. Gravando local.`, error);
    }
  }
  saveLocally(folder, fileName, input.buffer);
  return { url, key, fileName, originalName: fileName };
}

/** Lê arquivo local ou, se sumiu do disco, o objeto no S3. */
export async function readPersistentUpload(keyOrUrl: string): Promise<Buffer | null> {
  const key = String(keyOrUrl || '')
    .replace(/^\/uploads\//, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  if (!assertSafeUploadKey(key)) return null;

  const localPath = path.join(backendUploadsRoot, ...key.split('/'));
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }

  const s3 = getS3();
  if (!s3) return null;
  try {
    const obj = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
    if (!obj.Body) return null;
    return await s3BodyToBuffer(obj.Body);
  } catch {
    return null;
  }
}

/**
 * Fallback depois do `express.static('/uploads')`: se o arquivo não está no disco
 * do container (Railway), tenta buscar no S3 pela mesma key.
 */
export function persistentUploadsS3Fallback(): RequestHandler {
  return async (req, res, next) => {
    try {
      const relative = String(req.path || '')
        .replace(/^\/+/, '')
        .replace(/\\/g, '/');
      if (!assertSafeUploadKey(relative)) {
        next();
        return;
      }

      const localPath = path.join(backendUploadsRoot, ...relative.split('/'));
      if (fs.existsSync(localPath)) {
        next();
        return;
      }

      const s3 = getS3();
      if (!s3) {
        next();
        return;
      }

      const obj = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: relative }));
      if (obj.ContentType) res.setHeader('Content-Type', obj.ContentType);
      if (obj.ContentLength != null) res.setHeader('Content-Length', String(obj.ContentLength));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.status(200).send(await s3BodyToBuffer(obj.Body));
    } catch {
      next();
    }
  };
}
