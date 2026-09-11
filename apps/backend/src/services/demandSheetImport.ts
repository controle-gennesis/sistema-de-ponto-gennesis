import fs from 'fs';
import path from 'path';
import {
  DemandSheetApprovalStatus,
  DemandSheetPurchaseStatus,
  Prisma,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload, savePersistentUploadFromPath } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { extractZipArchive, walkFilesRecursive } from '../lib/extractZipArchive';
import { fdContratoName } from '../data/fdContratoNames';

export type FdAnexoImportMeta = {
  id?: string;
  name?: string;
  sourcePath?: string;
  kind?: string;
};

export type FdImportRow = {
  externalId?: string;
  numMovRm?: string;
  idMovRm?: string;
  codigoPedido?: string;
  solicitanteRef?: string;
  /** Nome do colaborador da planilha (não precisa ser User do sistema). */
  solicitanteNome?: string;
  contratoExternalId?: string;
  /** Nome amigável do contrato (aba CONTRATOS). */
  contratoNome?: string;
  obraExternalId?: string;
  obraNome?: string;
  codFichaDemanda?: string;
  faturamentoEstimado?: number | string;
  custoEstimado?: number | string;
  observacao?: string;
  dataHora?: string;
  polo?: string;
  statusFd?: string;
  statusCompras?: string;
  anexos?: FdAnexoImportMeta[];
};

type AnexoJson = {
  id: string;
  name: string;
  url?: string;
  kind?: string;
  sourcePath?: string;
};

type IndexedFile = {
  name: string;
  mimeType: string;
  read: () => Buffer;
  /** Caminho em disco quando veio de ZIP extraído — evita buffer na RAM. */
  diskPath?: string;
};

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function opt(value: unknown): string | null {
  const v = str(value);
  if (!v || v === '-' || v === '—') return null;
  return v;
}

function basename(pathLike: string): string {
  return pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop() || pathLike;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mimeFromName(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

function indexFiles(files: IndexedFile[]) {
  const byName = new Map<string, IndexedFile>();
  const byStem = new Map<string, IndexedFile[]>();
  for (const file of files) {
    const base = normalizeKey(basename(file.name));
    if (!base) continue;
    if (!byName.has(base)) byName.set(base, file);
    const stem = base.replace(/\.[a-z0-9]+$/, '');
    const list = byStem.get(stem) || [];
    list.push(file);
    byStem.set(stem, list);
  }
  return { byName, byStem, all: files };
}

function matchFile(
  index: ReturnType<typeof indexFiles>,
  sourcePath: string | null | undefined,
  externalId: string | null | undefined,
): IndexedFile | null {
  const source = sourcePath ? normalizeKey(basename(sourcePath)) : '';
  if (source && index.byName.has(source)) return index.byName.get(source)!;
  if (source) {
    const stem = source.replace(/\.[a-z0-9]+$/, '');
    const byStem = index.byStem.get(stem);
    if (byStem?.[0]) return byStem[0];
  }
  const id = normalizeKey(externalId || '');
  if (id) {
    // Evita scan O(n) em ZIPs gigantes: só tenta pelo stem/nome exato.
    const byStem = index.byStem.get(id);
    if (byStem?.[0]) return byStem[0];
    if (index.byName.has(id)) return index.byName.get(id)!;
  }
  return null;
}

function collectUploadedFiles(
  files: Express.Multer.File[] | undefined,
  cleanups: Array<() => void>,
): IndexedFile[] {
  if (!files?.length) return [];
  const out: IndexedFile[] = [];

  for (const file of files) {
    const originalName = fixMulterOriginalName(file.originalname) || file.originalname;
    const diskPath = file.path;
    const looksZip =
      /\.zip$/i.test(originalName) ||
      /zip/.test(file.mimetype || '') ||
      (!!diskPath && /\.zip$/i.test(diskPath));

    if (looksZip && diskPath) {
      const extracted = extractZipArchive(diskPath);
      cleanups.push(extracted.cleanup);
      const filePaths = walkFilesRecursive(extracted.dir);
      if (!filePaths.length) {
        throw createError(
          `Não foi possível extrair arquivos do ZIP "${originalName}".`,
          400,
        );
      }
      for (const abs of filePaths) {
        const rel = path.relative(extracted.dir, abs).replace(/\\/g, '/');
        out.push({
          name: rel || path.basename(abs),
          mimeType: mimeFromName(abs),
          diskPath: abs,
          read: () => fs.readFileSync(abs),
        });
      }
      continue;
    }

    if (diskPath) {
      out.push({
        name: originalName,
        mimeType: file.mimetype || mimeFromName(originalName),
        read: () => fs.readFileSync(diskPath),
      });
      continue;
    }

    if (file.buffer?.length) {
      const buf = file.buffer;
      out.push({
        name: originalName,
        mimeType: file.mimetype || mimeFromName(originalName),
        read: () => buf,
      });
    }
  }

  return out;
}

function parseMoney(value: unknown): Prisma.Decimal {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Prisma.Decimal(value);
  }
  const s = str(value).replace(/[R$\s]/g, '');
  if (!s) return new Prisma.Decimal(0);
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(normalized);
  return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
}

function parseDataHora(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = str(value);
  if (!raw) return new Date();
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 100000) {
    // Excel serial date
    const ms = Math.round((asNum - 25569) * 86400 * 1000);
    return new Date(ms);
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const br = raw.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (br) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = br;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  }
  return new Date();
}

function mapStatusFd(raw: unknown): DemandSheetApprovalStatus {
  const v = str(raw).toUpperCase();
  if (v.includes('REPROV')) return 'REJECTED';
  if (v.includes('CANCEL')) return 'CANCELLED';
  if (v.includes('APROV')) return 'APPROVED';
  if (v.includes('AGUARD') || v.includes('PENDENTE')) return 'WAITING_MANAGER';
  return 'WAITING_MANAGER';
}

function mapPurchaseStatus(raw: unknown): DemandSheetPurchaseStatus | null {
  const v = str(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (!v || v === 'CANCELADO') return null;
  if (v.includes('FINALIZ')) return 'FINISHED';
  if (v.includes('SOLICIT')) return 'PURCHASE_REQUEST';
  if (v.includes('SUPRIMENT')) return 'SUPPLIES';
  if (v.includes('TOTALMENTE') && v.includes('ESTOQUE')) return 'FULLY_FULFILLED_BY_STOCK';
  if (v.includes('PARCIAL') && v.includes('ESTOQUE')) return 'PARTIALLY_FULFILLED_BY_STOCK';
  if (v.includes('ALMOX') && v.includes('DF')) return 'WAREHOUSE_DF';
  if (v.includes('ALMOX') && v.includes('GO')) return 'WAREHOUSE_GO';
  return null;
}

function mapPolo(raw: unknown): 'DF' | 'GO' {
  const v = str(raw).toUpperCase();
  return v === 'GO' ? 'GO' : 'DF';
}

function cpfDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function mergeAnexos(existing: unknown, incoming: AnexoJson[]): AnexoJson[] {
  const map = new Map<string, AnexoJson>();
  const push = (item: AnexoJson) => {
    const key = item.id || `${item.sourcePath || ''}|${item.name}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      return;
    }
    map.set(key, {
      ...prev,
      ...item,
      url: item.url || prev.url,
    });
  };
  if (Array.isArray(existing)) {
    for (const row of existing) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const name = str(r.name);
      if (!name) continue;
      push({
        id: str(r.id) || uuidv4(),
        name,
        url: opt(r.url) || undefined,
        kind: opt(r.kind) || undefined,
        sourcePath: opt(r.sourcePath) || undefined,
      });
    }
  }
  for (const item of incoming) push(item);
  return Array.from(map.values());
}

/** Vincula arquivos enviados aos anexos já gravados (sourcePath) sem URL. */
async function linkPendingAnexosFromIndex(
  fileIndex: ReturnType<typeof indexFiles>,
): Promise<{ updated: number; anexosLinked: number; warnings: number }> {
  const rows = await prisma.demandSheetApproval.findMany({
    select: { id: true, externalId: true, anexos: true },
  });

  type Job = {
    rowId: string;
    externalId: string | null;
    anexo: AnexoJson;
    matched: IndexedFile;
  };

  const jobs: Job[] = [];
  const rowAnexos = new Map<string, AnexoJson[]>();

  for (const row of rows) {
    const existing = Array.isArray(row.anexos) ? ([...row.anexos] as AnexoJson[]) : [];
    if (!existing.length) continue;
    rowAnexos.set(row.id, existing);

    for (const anexo of existing) {
      if (anexo.url) continue;
      const sourcePath = opt(anexo.sourcePath);
      const matched = matchFile(fileIndex, sourcePath, anexo.id || row.externalId);
      if (!matched) continue;
      jobs.push({
        rowId: row.id,
        externalId: row.externalId,
        anexo,
        matched,
      });
    }
  }

  let anexosLinked = 0;
  let warnings = 0;
  const CONCURRENCY = 8;
  let cursor = 0;
  const changedRows = new Set<string>();

  console.log(`[FD import] vinculando ${jobs.length} anexo(s) (concorrência ${CONCURRENCY})…`);

  async function runOne(job: Job) {
    try {
      const folder = `demand-sheet-approvals/${job.externalId || job.rowId}/anexos`;
      const saved = job.matched.diskPath
        ? await savePersistentUploadFromPath({
            folder,
            diskPath: job.matched.diskPath,
            originalName: basename(job.matched.name),
            mimeType: job.matched.mimeType,
            includeSafeOriginalName: true,
          })
        : await savePersistentUpload({
            folder,
            buffer: job.matched.read(),
            originalName: basename(job.matched.name),
            mimeType: job.matched.mimeType,
            includeSafeOriginalName: true,
          });

      const list = rowAnexos.get(job.rowId);
      if (!list) return;
      const idx = list.findIndex(
        (a) => a.id === job.anexo.id || a.sourcePath === job.anexo.sourcePath,
      );
      if (idx < 0) return;
      list[idx] = {
        ...list[idx]!,
        url: saved.url,
        name: list[idx]!.name || basename(job.matched.name),
      };
      anexosLinked += 1;
      changedRows.add(job.rowId);
    } catch {
      warnings += 1;
    }
  }

  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor;
      cursor += 1;
      const job = jobs[i];
      if (!job) break;
      await runOne(job);
      if (anexosLinked > 0 && anexosLinked % 50 === 0) {
        console.log(`[FD import] anexos vinculados: ${anexosLinked}/${jobs.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, jobs.length)) }, () => worker()));

  let updated = 0;
  for (const rowId of changedRows) {
    const anexos = rowAnexos.get(rowId);
    if (!anexos) continue;
    await prisma.demandSheetApproval.update({
      where: { id: rowId },
      data: { anexos },
    });
    updated += 1;
  }

  console.log(
    `[FD import] vínculo concluído: linked=${anexosLinked} rows=${updated} warnings=${warnings}`,
  );
  return { updated, anexosLinked, warnings };
}

export async function importDemandSheets(params: {
  userId: string;
  rows: FdImportRow[];
  files: Record<string, Express.Multer.File[]>;
  /** Só vincula arquivos aos anexos já salvos (sem reprocessar a planilha). */
  linkOnly?: boolean;
}): Promise<{
  created: number;
  updated: number;
  failed: number;
  anexosLinked: number;
  warnings: number;
  errors: { index: number; message: string }[];
}> {
  const { userId, rows, files, linkOnly = false } = params;

  const cleanups: Array<() => void> = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  let anexosLinked = 0;
  let warnings = 0;
  const errors: { index: number; message: string }[] = [];

  try {
    const fileIndex = indexFiles([
      ...collectUploadedFiles(files.anexos, cleanups),
      ...collectUploadedFiles(files.anexosZip, cleanups),
    ]);
    const hasFiles = fileIndex.all.length > 0;

    if (linkOnly || (!rows.length && hasFiles)) {
      if (!hasFiles) {
        throw createError('Nenhum arquivo de anexo enviado para vincular.', 400);
      }
      const linked = await linkPendingAnexosFromIndex(fileIndex);
      return {
        created: 0,
        updated: linked.updated,
        failed: 0,
        anexosLinked: linked.anexosLinked,
        warnings: linked.warnings,
        errors: [],
      };
    }

    if (!rows.length) throw createError('Nenhuma ficha encontrada na planilha.', 400);

    const users = await prisma.user.findMany({
      select: { id: true, cpf: true },
    });
    const userByCpf = new Map<string, string>();
    const userById = new Map<string, string>();
    for (const u of users) {
      userById.set(u.id, u.id);
      const digits = cpfDigits(u.cpf || '');
      if (digits) userByCpf.set(digits, u.id);
    }

    const contracts = await prisma.contract.findMany({
      select: { id: true, name: true, number: true, externalId: true },
    });
    const contractByExternal = new Map<string, string>();
    const contractByKey = new Map<string, string>();
    const normKey = (s: string) => s.trim().toLowerCase();
    for (const c of contracts) {
      contractByKey.set(c.id, c.id);
      if (c.name?.trim()) contractByKey.set(normKey(c.name), c.id);
      if (c.number?.trim()) contractByKey.set(normKey(c.number), c.id);
      if (c.externalId?.trim()) {
        contractByExternal.set(c.externalId.trim(), c.id);
        contractByKey.set(normKey(c.externalId), c.id);
      }
    }

    const obras = await prisma.obra.findMany({
      select: { id: true, name: true, externalId: true, contratoId: true },
    });
    const obraByExternal = new Map<string, { id: string; name: string; contratoId: string }>();
    const obraByName = new Map<string, { id: string; name: string; contratoId: string }>();
    for (const o of obras) {
      if (o.externalId) obraByExternal.set(o.externalId, o);
      if (o.name?.trim()) obraByName.set(normKey(o.name), o);
    }

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      try {
        const externalId = opt(row.externalId);
        if (!externalId) throw new Error('ID_FICHA_DEMANDA ausente');

        const contratoRef = opt(row.contratoExternalId);
        const contratoNomePlanilha = opt(row.contratoNome) || fdContratoName(contratoRef) || '';
        if (!contratoRef && !contratoNomePlanilha) throw new Error('CONTRATO ausente');
        const contratoId =
          (contratoRef
            ? contractByExternal.get(contratoRef) || contractByKey.get(normKey(contratoRef))
            : null) ||
          (contratoNomePlanilha ? contractByKey.get(normKey(contratoNomePlanilha)) : null) ||
          null;
        if (!contratoId) {
          throw new Error(
            `Contrato "${contratoNomePlanilha || contratoRef}" não cadastrado no sistema. Cadastre em Engenharia > Contratos antes de importar.`,
          );
        }

        const solicitanteRef = opt(row.solicitanteRef) || '';
        const solicitanteNomePlanilha = opt(row.solicitanteNome);
        let solicitanteId =
          userById.get(solicitanteRef) ||
          userByCpf.get(cpfDigits(solicitanteRef)) ||
          null;
        if (!solicitanteId) {
          // Colaboradores da planilha não são Users do sistema — mantém FK no importador.
          solicitanteId = userId;
          if (!solicitanteNomePlanilha) warnings += 1;
        }

        // Obra na FD é só texto — NÃO cria cadastro em Obras.
        const obraRef = opt(row.obraExternalId) || opt(row.obraNome) || 'Sem obra';
        let obraName = opt(row.obraNome) || obraRef;
        const existingObra =
          obraByExternal.get(obraRef) ||
          obraByName.get(normKey(obraRef)) ||
          (opt(row.obraNome) ? obraByName.get(normKey(opt(row.obraNome)!)) : null);
        if (existingObra) {
          obraName = existingObra.name;
        }

        const status = mapStatusFd(row.statusFd);
        const purchaseStatus = mapPurchaseStatus(row.statusCompras);
        const polo = mapPolo(row.polo);
        const dataHora = parseDataHora(row.dataHora);

        const baseData = {
          numMovRm: opt(row.numMovRm) || '-',
          idMovRm: opt(row.idMovRm) || '-',
          codigoPedido: opt(row.codigoPedido) || '-',
          solicitanteId,
          solicitanteNome: solicitanteNomePlanilha || null,
          contratoId,
          obra: obraName,
          codFichaDemanda: opt(row.codFichaDemanda) || externalId,
          faturamentoEstimado: parseMoney(row.faturamentoEstimado),
          custoEstimado: parseMoney(row.custoEstimado),
          observacao: opt(row.observacao) || '-',
          dataHora,
          polo,
          status,
          purchaseStatus: status === 'APPROVED' ? purchaseStatus : null,
          purchaseStatusUpdatedAt:
            status === 'APPROVED' && purchaseStatus ? dataHora : null,
          purchaseStatusUpdatedBy:
            status === 'APPROVED' && purchaseStatus ? userId : null,
          managerApprovedAt: status === 'APPROVED' ? dataHora : null,
          managerApprovedBy: status === 'APPROVED' ? userId : null,
        };

        const existing = await prisma.demandSheetApproval.findUnique({
          where: { externalId },
          select: { id: true, anexos: true },
        });

        const metaAnexos = Array.isArray(row.anexos) ? row.anexos : [];
        const linked: AnexoJson[] = [];
        for (const anexo of metaAnexos) {
          const sourcePath = opt(anexo.sourcePath);
          const anexoId = opt(anexo.id) || `${externalId}-${opt(anexo.kind) || 'ANEXO'}`;
          const originalName =
            opt(anexo.name) || (sourcePath ? basename(sourcePath) : null) || 'anexo';
          let url: string | undefined;
          if (hasFiles && sourcePath) {
            const matched = matchFile(fileIndex, sourcePath, anexoId);
            if (matched) {
              const buffer = matched.read();
              const saved = await savePersistentUpload({
                folder: `demand-sheet-approvals/${externalId}/anexos`,
                buffer,
                originalName: basename(matched.name),
                mimeType: matched.mimeType,
                includeSafeOriginalName: true,
              });
              url = saved.url;
              anexosLinked += 1;
            }
          }
          linked.push({
            id: anexoId,
            name: originalName,
            url,
            kind: opt(anexo.kind) || undefined,
            sourcePath: sourcePath || undefined,
          });
        }

        const anexos = mergeAnexos(existing?.anexos, linked);

        if (existing) {
          await prisma.demandSheetApproval.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              anexos,
            },
          });
          updated += 1;
        } else {
          await prisma.demandSheetApproval.create({
            data: {
              externalId,
              ...baseData,
              anexos,
              createdBy: userId,
            },
          });
          created += 1;
        }
      } catch (err) {
        failed += 1;
        errors.push({
          index: i + 1,
          message: err instanceof Error ? err.message : 'Erro ao importar linha',
        });
      }
    }

    return { created, updated, failed, anexosLinked, warnings, errors: errors.slice(0, 50) };
  } finally {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // ignore
      }
    }
  }
}
