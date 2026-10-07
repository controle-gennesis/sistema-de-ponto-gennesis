import { randomUUID } from 'crypto';
import { Response, NextFunction } from 'express';
import {
  ToolRentalDemandType,
  ToolRentalLogisticsMode,
  ToolRentalPriority,
  ToolRentalRequestStatus,
} from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { assertUserHasToolRentalSuppliesAccess } from '../lib/toolRentalSuppliesAccess';
import {
  assertLiberadoContractAccess,
  getLiberadoContractAccessForUser,
} from '../lib/contractAccess';
import { findUserIdsMatchingSearch } from '../lib/normalizeSearchText';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';

async function canAccessToolRentalRequest(
  user: { id: string; isAdmin?: boolean },
  row: {
    createdById?: string | null;
    assignedUserId?: string | null;
    contractId?: string | null;
  },
): Promise<boolean> {
  if (user.isAdmin) return true;
  if (row.createdById === user.id || row.assignedUserId === user.id) return true;
  if (row.contractId) {
    const access = await getLiberadoContractAccessForUser(user.id, false);
    if (access.filter === 'all') return true;
    if (access.filter === 'ids' && access.ids.includes(row.contractId)) return true;
  }
  return false;
}

type ToolRentalAnexo = {
  id: string;
  name: string;
  url: string;
  kind?: string;
};

function parseToolRentalAttachments(value: unknown): ToolRentalAnexo[] {
  if (!Array.isArray(value)) return [];
  const out: ToolRentalAnexo[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const url = String(row.url || '').trim();
    const name = String(row.name || '').trim();
    const id = String(row.id || '').trim();
    if (!url || !name) continue;
    out.push({
      id: id || randomUUID(),
      name,
      url,
      kind: String(row.kind || 'outro').trim() || 'outro',
    });
  }
  return out;
}

function legacyAttachmentsFromRow(row: {
  ocMirrorUrl?: string | null;
  ocMirrorName?: string | null;
  paymentProofUrl?: string | null;
  paymentProofName?: string | null;
  attachments?: unknown;
}): ToolRentalAnexo[] {
  const list = parseToolRentalAttachments(row.attachments);
  if (list.length > 0) return list;
  const legacy: ToolRentalAnexo[] = [];
  if (row.ocMirrorUrl?.trim()) {
    legacy.push({
      id: 'legacy-oc',
      name: row.ocMirrorName?.trim() || 'Espelho OC',
      url: row.ocMirrorUrl.trim(),
      kind: 'oc',
    });
  }
  if (row.paymentProofUrl?.trim()) {
    legacy.push({
      id: 'legacy-payment',
      name: row.paymentProofName?.trim() || 'Comprovante',
      url: row.paymentProofUrl.trim(),
      kind: 'payment',
    });
  }
  return legacy;
}

async function loadAttachmentsMap(ids: string[]): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>();
  if (ids.length === 0) return map;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; attachments: unknown }>>(
    `SELECT "id", "attachments" FROM "tool_rental_requests" WHERE "id" IN (${ids
      .map((_, i) => `$${i + 1}`)
      .join(',')})`,
    ...ids,
  );
  for (const row of rows) map.set(row.id, row.attachments);
  return map;
}

const include = {
  assignedUser: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  suppliesApprovedBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  renewedFrom: { select: { id: true, code: true } },
  supplier: { select: { id: true, name: true, tradeName: true, code: true } },
  events: {
    orderBy: { createdAt: 'asc' as const },
    include: { actor: { select: { id: true, name: true } } },
  },
} as const;

async function appendStatusEvent(
  tx: {
    toolRentalRequestEvent: {
      create: (args: {
        data: {
          requestId: string;
          fromStatus: ToolRentalRequestStatus | null;
          toStatus: ToolRentalRequestStatus;
          actorId: string | null;
          note: string | null;
        };
      }) => Promise<unknown>;
    };
  },
  data: {
    requestId: string;
    fromStatus?: ToolRentalRequestStatus | null;
    toStatus: ToolRentalRequestStatus;
    actorId?: string | null;
    note?: string | null;
  }
) {
  await tx.toolRentalRequestEvent.create({
    data: {
      requestId: data.requestId,
      fromStatus: data.fromStatus ?? null,
      toStatus: data.toStatus,
      actorId: data.actorId ?? null,
      note: data.note ?? null,
    },
  });
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

type ToolRentalEquipamentoItem = {
  nome: string;
  quantidade: number;
  linkSugestao?: string | null;
};

function normalizeEquipamentoLink(value: unknown): string | null {
  let link = normalizeOptionalString(value);
  if (!link) return null;
  if (!/^https?:\/\//i.test(link)) {
    link = `https://${link}`;
  }
  return link;
}

function parseEquipamentosInput(value: unknown, fallbackEquipamento?: unknown): ToolRentalEquipamentoItem[] {
  if (Array.isArray(value)) {
    const items: ToolRentalEquipamentoItem[] = [];
    for (const raw of value) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const nome = String(row.nome ?? row.equipamento ?? row.name ?? '').trim();
      const qtdRaw = Number(row.quantidade ?? row.quantity ?? row.qtd);
      const quantidade = Number.isFinite(qtdRaw) && qtdRaw > 0 ? Math.floor(qtdRaw) : 0;
      if (!nome || quantidade <= 0) continue;
      const linkSugestao = normalizeEquipamentoLink(
        row.linkSugestao ?? row.link ?? row.url,
      );
      items.push({
        nome,
        quantidade,
        ...(linkSugestao ? { linkSugestao } : {}),
      });
    }
    if (items.length) return items;
  }
  const single = normalizeOptionalString(fallbackEquipamento);
  if (single) return [{ nome: single, quantidade: 1 }];
  return [];
}

function formatEquipamentoSummary(items: ToolRentalEquipamentoItem[]): string {
  return items.map((item) => `${item.nome} (${item.quantidade})`).join(', ');
}

async function persistEquipamentos(requestId: string, items: ToolRentalEquipamentoItem[]) {
  await prisma.$executeRaw`
    UPDATE "tool_rental_requests"
    SET "equipamentos" = ${JSON.stringify(items)}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${requestId}
  `;
}

async function loadEquipamentosMap(ids: string[]): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>();
  if (ids.length === 0) return map;
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; equipamentos: unknown }>>(
    `SELECT "id", "equipamentos" FROM "tool_rental_requests" WHERE "id" IN (${ids
      .map((_, i) => `$${i + 1}`)
      .join(',')})`,
    ...ids,
  );
  for (const row of rows) map.set(row.id, row.equipamentos);
  return map;
}

function resolveEquipamentosForRow(
  row: { equipamento?: string | null; equipamentos?: unknown },
): ToolRentalEquipamentoItem[] {
  return parseEquipamentosInput(row.equipamentos, row.equipamento);
}

function requireString(value: unknown, label: string): string {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) throw createError(`${label} é obrigatório`, 400);
  return trimmed;
}

function parseDateOnly(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw createError(`${fieldLabel} é obrigatório`, 400);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw createError(`${fieldLabel} inválido`, 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createError(`${fieldLabel} inválido`, 400);
  }
  return date;
}

function parseDemandType(value: unknown): ToolRentalDemandType {
  const raw = String(value ?? '').trim().toUpperCase();
  if (Object.values(ToolRentalDemandType).includes(raw as ToolRentalDemandType)) {
    return raw as ToolRentalDemandType;
  }
  throw createError('Tipo de demanda inválido', 400);
}

function parsePriority(value: unknown): ToolRentalPriority {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return ToolRentalPriority.NORMAL;
  if (Object.values(ToolRentalPriority).includes(raw as ToolRentalPriority)) {
    return raw as ToolRentalPriority;
  }
  throw createError('Prioridade inválida', 400);
}

function parseLogisticsMode(value: unknown): ToolRentalLogisticsMode {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return ToolRentalLogisticsMode.RETIRADA_LOGISTICA;
  if (Object.values(ToolRentalLogisticsMode).includes(raw as ToolRentalLogisticsMode)) {
    return raw as ToolRentalLogisticsMode;
  }
  throw createError('Modalidade logística inválida', 400);
}

function parseStatusFilter(value: unknown): ToolRentalRequestStatus[] | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return undefined;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const statuses: ToolRentalRequestStatus[] = [];
  for (const part of parts) {
    if (Object.values(ToolRentalRequestStatus).includes(part as ToolRentalRequestStatus)) {
      statuses.push(part as ToolRentalRequestStatus);
    } else {
      throw createError('Status de filtro inválido', 400);
    }
  }
  return statuses.length ? statuses : undefined;
}

async function reserveCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];
  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER) END
    ) AS max
    FROM tool_rental_requests
  `;
  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

export class ToolRentalRequestController {
  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
      const count = await prisma.toolRentalRequest.count({
        where: {
          status: {
            in: [
              ToolRentalRequestStatus.OPEN,
              ToolRentalRequestStatus.SUPPLIER_RELATION,
              ToolRentalRequestStatus.QUOTATION,
              ToolRentalRequestStatus.AWAITING_PAYMENT,
            ],
          },
        },
      });
      res.json({ success: true, data: { count } });
    } catch (error) {
      // Tabela ainda não migrada no ambiente local — não derruba o polling do layout.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2021'
      ) {
        res.json({ success: true, data: { count: 0 } });
        return;
      }
      next(error);
    }
  }

  async suppliesSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const grouped = await prisma.toolRentalRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      });

      const byStatus: Record<string, number> = {};
      let total = 0;
      for (const row of grouped) {
        const n = row._count._all;
        byStatus[row.status] = n;
        total += n;
      }

      const open = byStatus[ToolRentalRequestStatus.OPEN] ?? 0;
      const supplierRelation = byStatus[ToolRentalRequestStatus.SUPPLIER_RELATION] ?? 0;
      const quotation = byStatus[ToolRentalRequestStatus.QUOTATION] ?? 0;
      const awaitingPayment = byStatus[ToolRentalRequestStatus.AWAITING_PAYMENT] ?? 0;
      const inUse = byStatus[ToolRentalRequestStatus.IN_USE] ?? 0;
      const completed = byStatus[ToolRentalRequestStatus.COMPLETED] ?? 0;
      // Legado: pedidos antigos em AWAITING_RECEIPT contam como aguardando recebimento no fluxo
      const legacyAwaitingReceipt = byStatus[ToolRentalRequestStatus.AWAITING_RECEIPT] ?? 0;
      const rejected = byStatus[ToolRentalRequestStatus.REJECTED] ?? 0;
      const cancelled = byStatus[ToolRentalRequestStatus.CANCELLED] ?? 0;

      res.json({
        success: true,
        data: {
          open,
          supplierRelation,
          quotation,
          awaitingPayment,
          inUse,
          pending: open + supplierRelation + quotation + awaitingPayment,
          completed,
          awaitingReceipt: legacyAwaitingReceipt,
          rejected,
          cancelled,
          total,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** Lista enxuta de funcionários ativos para o select "Quem recebeu" (foto + CPF). */
  async listReceiptUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          role: 'EMPLOYEE',
          employee: { isNot: null },
        },
        select: {
          id: true,
          name: true,
          cpf: true,
          profilePhotoUrl: true,
          employee: { select: { id: true, position: true } },
        },
        orderBy: { name: 'asc' },
        take: 2000,
      });
      const data = users
        .filter((u) => {
          if (!u.employee?.id) return false;
          if (u.employee.position === 'Administrador') return false;
          const name = String(u.name || '').trim();
          if (!u.id || !name) return false;
          if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) {
            return false;
          }
          return true;
        })
        .map((u) => {
          const cpfDigits = (u.cpf || '').replace(/\D/g, '');
          const cpfMasked =
            cpfDigits.length === 11
              ? `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`
              : u.cpf || null;
          return {
            id: u.id,
            name: String(u.name || '').trim(),
            cpf: cpfMasked,
            profilePhotoUrl: u.profilePhotoUrl || null,
          };
        })
        .filter((row) => row.id && row.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { search, page = 1, limit = 20, status, scope } = req.query;
      const where: Record<string, unknown> = {};

      const statusFilter = parseStatusFilter(status);
      if (statusFilter?.length === 1) {
        where.status = statusFilter[0];
      } else if (statusFilter && statusFilter.length > 1) {
        where.status = { in: statusFilter };
      }

      // Engenharia: próprias + contratos liberados. Suprimentos usa scope=all.
      const scopeAll = String(scope ?? '').toLowerCase() === 'all';
      if (scopeAll) {
        await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
      } else if (!req.user.isAdmin) {
        const access = await getLiberadoContractAccessForUser(req.user.id, false);
        const or: Record<string, unknown>[] = [
          { createdById: req.user.id },
          { assignedUserId: req.user.id },
        ];
        if (access.filter === 'ids' && access.ids.length > 0) {
          or.push({ contractId: { in: access.ids } });
        }
        where.OR = or;
      }

      if (search) {
        const term = String(search);
        const matchedUserIds = await findUserIdsMatchingSearch(term);
        const searchOr: Record<string, unknown>[] = [
          { code: { contains: term, mode: 'insensitive' } },
          { titulo: { contains: term, mode: 'insensitive' } },
          { obra: { contains: term, mode: 'insensitive' } },
          { contrato: { contains: term, mode: 'insensitive' } },
          { equipamento: { contains: term, mode: 'insensitive' } },
          { supplierName: { contains: term, mode: 'insensitive' } },
          {
            assignedUserId: {
              in: matchedUserIds.length > 0 ? matchedUserIds : ['__none__'],
            },
          },
        ];
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: searchOr }];
          delete where.OR;
        } else {
          where.OR = searchOr;
        }
      }

      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;

      const [rows, total] = await Promise.all([
        prisma.toolRentalRequest.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ createdAt: 'desc' }],
          include,
        }),
        prisma.toolRentalRequest.count({ where }),
      ]);
      const ids = rows.map((row) => row.id);
      const [attachmentsMap, equipamentosMap] = await Promise.all([
        loadAttachmentsMap(ids),
        loadEquipamentosMap(ids),
      ]);

      res.json({
        success: true,
        data: rows.map((row) => ({
          ...row,
          attachments: legacyAttachmentsFromRow({
            ...row,
            attachments: attachmentsMap.get(row.id),
          }),
          equipamentos: resolveEquipamentosForRow({
            equipamento: row.equipamento,
            equipamentos: equipamentosMap.get(row.id),
          }),
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const row = await prisma.toolRentalRequest.findUnique({
        where: { id: req.params.id },
        include,
      });
      if (!row) throw createError('Solicitação não encontrada', 404);

      const canAccess = await canAccessToolRentalRequest(req.user, row);
      if (!canAccess) {
        try {
          await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
        } catch {
          throw createError('Solicitação não encontrada', 404);
        }
      }

      const [attachmentsMap, equipamentosMap] = await Promise.all([
        loadAttachmentsMap([row.id]),
        loadEquipamentosMap([row.id]),
      ]);
      res.json({
        success: true,
        data: {
          ...row,
          attachments: legacyAttachmentsFromRow({
            ...row,
            attachments: attachmentsMap.get(row.id),
          }),
          equipamentos: resolveEquipamentosForRow({
            equipamento: row.equipamento,
            equipamentos: equipamentosMap.get(row.id),
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const body = (req.body || {}) as Record<string, unknown>;

      const poloRaw = String(body.polo ?? '').trim().toUpperCase();
      const polo = poloRaw === 'GO' || poloRaw === 'DF' ? poloRaw : 'DF';

      const contractId = requireString(body.contractId, 'Contrato');
      await assertLiberadoContractAccess(req, contractId);
      const contractRow = await prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true, name: true },
      });
      if (!contractRow) throw createError('Contrato inválido', 400);
      const contrato = contractRow.name;

      const obra = requireString(body.obra, 'Obra');
      const titulo = requireString(body.titulo, 'Título da locação');
      const equipamentos = parseEquipamentosInput(body.equipamentos, body.equipamento);
      if (equipamentos.length === 0) {
        throw createError('Informe ao menos um equipamento com quantidade', 400);
      }
      const equipamento = formatEquipamentoSummary(equipamentos);
      const demandType = parseDemandType(body.demandType);
      const priority = parsePriority(body.priority);
      const logisticsMode = parseLogisticsMode(body.logisticsMode);
      const periodoInicio = parseDateOnly(body.periodoInicio, 'Data de início');
      const periodoFim = parseDateOnly(body.periodoFim, 'Data de fim');
      if (periodoFim < periodoInicio) {
        throw createError('Data final não pode ser anterior à data inicial', 400);
      }

      const assignedUserId = req.user.id;

      let supplierId: string | null = normalizeOptionalString(body.supplierId);
      let supplierName: string | null = normalizeOptionalString(body.supplierName);
      if (supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, name: true, tradeName: true, isActive: true },
        });
        if (!supplier || !supplier.isActive) {
          throw createError('Fornecedor inválido', 400);
        }
        supplierName = supplier.tradeName || supplier.name;
      }

      // Compat: coluna legada guarda o 1º link; cada item também leva o próprio no JSON
      const linkSugestao =
        normalizeEquipamentoLink(body.linkSugestao) ||
        equipamentos.find((item) => item.linkSugestao)?.linkSugestao ||
        null;

      const [code] = await reserveCodes(1);
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.toolRentalRequest.create({
          data: {
            code,
            polo,
            contrato,
            contractId,
            obra,
            titulo,
            assignedUserId,
            supplierId,
            supplierName,
            priority,
            logisticsMode,
            demandType,
            equipamento,
            periodoInicio,
            periodoFim,
            linkSugestao,
            createdById: req.user!.id,
            status: ToolRentalRequestStatus.OPEN,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: null,
          toStatus: ToolRentalRequestStatus.OPEN,
          actorId: req.user!.id,
          note: 'Solicitação aberta pela Engenharia',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      await persistEquipamentos(created.id, equipamentos);

      res.status(201).json({
        success: true,
        data: { ...created, equipamentos },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateScNumber(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (
        row.status !== ToolRentalRequestStatus.OPEN &&
        row.status !== ToolRentalRequestStatus.SUPPLIER_RELATION &&
        row.status !== ToolRentalRequestStatus.QUOTATION
      ) {
        throw createError(
          'Número da SC só pode ser informado em Aberta, Em análise ou Cotação',
          400,
        );
      }

      const scNumber = requireString(
        req.body?.scNumber ?? req.body?.numeroSc ?? req.body?.sc,
        'Número da SC',
      );

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: { scNumber },
        });
        if (row.scNumber !== scNumber) {
          await appendStatusEvent(tx, {
            requestId: row.id,
            fromStatus: row.status,
            toStatus: row.status,
            actorId: req.user!.id,
            note: row.scNumber
              ? `Número da SC atualizado: ${scNumber}`
              : `Número da SC informado: ${scNumber}`,
          });
        }
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async moveToSupplierRelation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.OPEN) {
        throw createError('Somente solicitações abertas podem ir para Em análise', 400);
      }

      const comment = normalizeOptionalString(req.body?.comment ?? req.body?.suppliesApprovalComment);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id, status: row.status },
          data: {
            status: ToolRentalRequestStatus.SUPPLIER_RELATION,
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
            suppliesApprovalComment: comment,
            suppliesRejectionReason: null,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.OPEN,
          toStatus: ToolRentalRequestStatus.SUPPLIER_RELATION,
          actorId: req.user!.id,
          note: comment || 'Encaminhada para Em análise',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async moveToQuotation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.SUPPLIER_RELATION) {
        throw createError('Somente solicitações em Em análise podem ir para Cotação', 400);
      }

      const scNumberFromBody = normalizeOptionalString(
        req.body?.scNumber ?? req.body?.numeroSc ?? req.body?.sc,
      );
      const scNumber = scNumberFromBody || normalizeOptionalString(row.scNumber);
      if (!scNumber) {
        throw createError('Informe o número da SC antes de encaminhar para Cotação', 400);
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id, status: row.status },
          data: {
            status: ToolRentalRequestStatus.QUOTATION,
            scNumber,
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.SUPPLIER_RELATION,
          toStatus: ToolRentalRequestStatus.QUOTATION,
          actorId: req.user!.id,
          note: `Encaminhada para Cotação (SC ${scNumber})`,
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async moveToAwaitingPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.QUOTATION) {
        throw createError(
          'Somente solicitações em Cotação podem ir para Aguardando Pagamento',
          400
        );
      }

      const ocMirrorUrl = normalizeOptionalString(req.body?.ocMirrorUrl);
      const ocMirrorName = normalizeOptionalString(req.body?.ocMirrorName);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id, status: row.status },
          data: {
            status: ToolRentalRequestStatus.AWAITING_PAYMENT,
            ...(ocMirrorUrl
              ? {
                  ocMirrorUrl,
                  ocMirrorName: ocMirrorName || 'espelho-oc',
                }
              : {}),
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.QUOTATION,
          toStatus: ToolRentalRequestStatus.AWAITING_PAYMENT,
          actorId: req.user!.id,
          note: ocMirrorUrl
            ? 'Espelho da OC anexado — aguardando pagamento'
            : 'Encaminhada para Aguardando Pagamento',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async complete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.AWAITING_PAYMENT) {
        throw createError(
          'Somente solicitações aguardando pagamento podem ser finalizadas',
          400
        );
      }

      const paymentProofUrl = normalizeOptionalString(req.body?.paymentProofUrl);
      const paymentProofName = normalizeOptionalString(req.body?.paymentProofName);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id, status: row.status },
          data: {
            status: ToolRentalRequestStatus.COMPLETED,
            ...(paymentProofUrl
              ? {
                  paymentProofUrl,
                  paymentProofName: paymentProofName || 'comprovante-pagamento',
                }
              : {}),
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.AWAITING_PAYMENT,
          toStatus: ToolRentalRequestStatus.COMPLETED,
          actorId: req.user!.id,
          note: paymentProofUrl
            ? 'Comprovante de pagamento anexado — solicitação finalizada (aguardando confirmação de recebimento)'
            : 'Solicitação finalizada — aguardando confirmação de recebimento pela Engenharia',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async confirmReceipt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);

      // Legado: AWAITING_RECEIPT vira COMPLETED sem mexer no recebimento
      const statusOk =
        row.status === ToolRentalRequestStatus.COMPLETED ||
        row.status === ToolRentalRequestStatus.AWAITING_RECEIPT;
      if (!statusOk) {
        throw createError(
          'Somente solicitações finalizadas podem ter o recebimento confirmado',
          400
        );
      }
      if (row.receivedAt) {
        throw createError('Recebimento já foi confirmado nesta solicitação', 400);
      }

      if (!(await canAccessToolRentalRequest(req.user, row))) {
        throw createError('Sem permissão para confirmar o recebimento desta solicitação', 403);
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const receivedById = requireString(body.receivedById, 'Quem recebeu');
      const receiver = await prisma.user.findUnique({
        where: { id: receivedById },
        select: { id: true, name: true, isActive: true },
      });
      if (!receiver || receiver.isActive === false) {
        throw createError('Funcionário inválido', 400);
      }

      let receivedAt = new Date();
      const receivedAtRaw = normalizeOptionalString(body.receivedAt);
      if (receivedAtRaw) {
        const parsed = new Date(receivedAtRaw);
        if (Number.isNaN(parsed.getTime())) {
          throw createError('Data e hora do recebimento inválidas', 400);
        }
        receivedAt = parsed;
      }

      const receiptObservation = normalizeOptionalString(
        body.receiptObservation ?? body.observation ?? body.observacao,
      );
      const receiptAttachments = parseToolRentalAttachments(
        body.receiptAttachments ?? body.attachments,
      ).map((a) => ({ ...a, kind: a.kind || 'receipt' }));

      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id },
          data: {
            status: ToolRentalRequestStatus.IN_USE,
            receivedById: receiver.id,
            receivedAt,
            receiptObservation,
            receiptAttachments: receiptAttachments.length
              ? (receiptAttachments as object)
              : undefined,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: row.status,
          toStatus: ToolRentalRequestStatus.IN_USE,
          actorId: req.user!.id,
          note:
            `Recebimento confirmado por ${receiver.name} — equipamento em uso` +
            (receiptObservation ? ` — ${receiptObservation}` : ''),
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async renew(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const origin = await prisma.toolRentalRequest.findUnique({
        where: { id: req.params.id },
      });
      if (!origin) throw createError('Solicitação não encontrada', 404);

      if (!(await canAccessToolRentalRequest(req.user, origin))) {
        throw createError('Sem permissão para renovar esta solicitação', 403);
      }

      const canRenewFromInUse = origin.status === ToolRentalRequestStatus.IN_USE;
      const canRenewLegacy =
        origin.status === ToolRentalRequestStatus.COMPLETED && Boolean(origin.receivedAt);
      if (!canRenewFromInUse && !canRenewLegacy) {
        throw createError(
          'Somente solicitações em uso (com recebimento confirmado) podem ser renovadas',
          400
        );
      }
      if (
        origin.demandType !== ToolRentalDemandType.NOVA_LOCACAO &&
        origin.demandType !== ToolRentalDemandType.RENOVACAO
      ) {
        throw createError('Apenas locações podem ser renovadas', 400);
      }
      if (origin.contractId) {
        await assertLiberadoContractAccess(req, origin.contractId);
      }

      const periodoInicio = parseDateOnly(req.body?.periodoInicio, 'Data de início');
      const periodoFim = parseDateOnly(req.body?.periodoFim, 'Data de fim');
      if (periodoFim < periodoInicio) {
        throw createError('Data final não pode ser anterior à data inicial', 400);
      }

      const observacao = normalizeOptionalString(req.body?.observacao);

      const equipamentosMap = await loadEquipamentosMap([origin.id]);
      const equipamentos = resolveEquipamentosForRow({
        equipamento: origin.equipamento,
        equipamentos: equipamentosMap.get(origin.id),
      });

      const [code] = await reserveCodes(1);
      const created = await prisma.$transaction(async (tx) => {
        if (origin.status === ToolRentalRequestStatus.IN_USE) {
          await tx.toolRentalRequest.update({
            where: { id: origin.id },
            data: { status: ToolRentalRequestStatus.COMPLETED },
          });
          await appendStatusEvent(tx, {
            requestId: origin.id,
            fromStatus: ToolRentalRequestStatus.IN_USE,
            toStatus: ToolRentalRequestStatus.COMPLETED,
            actorId: req.user!.id,
            note: 'Encerrada por renovação',
          });
        }

        const row = await tx.toolRentalRequest.create({
          data: {
            code,
            polo: origin.polo,
            contrato: origin.contrato,
            contractId: origin.contractId,
            obra: origin.obra,
            titulo: origin.titulo,
            assignedUserId: req.user!.id,
            supplierId: origin.supplierId,
            supplierName: origin.supplierName,
            priority: origin.priority,
            logisticsMode: origin.logisticsMode,
            demandType: ToolRentalDemandType.RENOVACAO,
            equipamento: origin.equipamento,
            periodoInicio,
            periodoFim,
            linkSugestao: origin.linkSugestao,
            renewedFromId: origin.id,
            createdById: req.user!.id,
            status: ToolRentalRequestStatus.OPEN,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: null,
          toStatus: ToolRentalRequestStatus.OPEN,
          actorId: req.user!.id,
          note:
            `Renovação da solicitação #${origin.code}` +
            (observacao ? ` — ${observacao}` : ''),
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      await persistEquipamentos(created.id, equipamentos);

      res.status(201).json({
        success: true,
        data: { ...created, equipamentos },
      });
    } catch (error) {
      next(error);
    }
  }

  async requestDevolution(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const origin = await prisma.toolRentalRequest.findUnique({
        where: { id: req.params.id },
      });
      if (!origin) throw createError('Solicitação não encontrada', 404);

      if (!(await canAccessToolRentalRequest(req.user, origin))) {
        throw createError('Sem permissão para solicitar devolução desta solicitação', 403);
      }

      const canDevolveFromInUse = origin.status === ToolRentalRequestStatus.IN_USE;
      const canDevolveLegacy =
        origin.status === ToolRentalRequestStatus.COMPLETED && Boolean(origin.receivedAt);
      if (!canDevolveFromInUse && !canDevolveLegacy) {
        throw createError(
          'Somente solicitações em uso (com recebimento confirmado) podem solicitar devolução',
          400
        );
      }
      if (
        origin.demandType !== ToolRentalDemandType.NOVA_LOCACAO &&
        origin.demandType !== ToolRentalDemandType.RENOVACAO
      ) {
        throw createError('Apenas locações podem solicitar devolução por este fluxo', 400);
      }
      if (origin.contractId) {
        await assertLiberadoContractAccess(req, origin.contractId);
      }

      const periodoInicio = parseDateOnly(
        req.body?.periodoInicio ?? origin.periodoInicio,
        'Data de início',
      );
      const periodoFim = parseDateOnly(
        req.body?.periodoFim ?? new Date().toISOString().slice(0, 10),
        'Data de fim',
      );
      if (periodoFim < periodoInicio) {
        throw createError('Data final não pode ser anterior à data inicial', 400);
      }

      const observacao = normalizeOptionalString(req.body?.observacao);

      const equipamentosMap = await loadEquipamentosMap([origin.id]);
      const equipamentos = resolveEquipamentosForRow({
        equipamento: origin.equipamento,
        equipamentos: equipamentosMap.get(origin.id),
      });

      const [code] = await reserveCodes(1);
      const created = await prisma.$transaction(async (tx) => {
        if (origin.status === ToolRentalRequestStatus.IN_USE) {
          await tx.toolRentalRequest.update({
            where: { id: origin.id },
            data: { status: ToolRentalRequestStatus.COMPLETED },
          });
          await appendStatusEvent(tx, {
            requestId: origin.id,
            fromStatus: ToolRentalRequestStatus.IN_USE,
            toStatus: ToolRentalRequestStatus.COMPLETED,
            actorId: req.user!.id,
            note: 'Encerrada por devolução',
          });
        }

        const row = await tx.toolRentalRequest.create({
          data: {
            code,
            polo: origin.polo,
            contrato: origin.contrato,
            contractId: origin.contractId,
            obra: origin.obra,
            titulo: origin.titulo,
            assignedUserId: req.user!.id,
            supplierId: origin.supplierId,
            supplierName: origin.supplierName,
            priority: origin.priority,
            logisticsMode: origin.logisticsMode,
            demandType: ToolRentalDemandType.DEVOLUCAO,
            equipamento: origin.equipamento,
            periodoInicio,
            periodoFim,
            linkSugestao: origin.linkSugestao,
            renewedFromId: origin.id,
            createdById: req.user!.id,
            status: ToolRentalRequestStatus.OPEN,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: null,
          toStatus: ToolRentalRequestStatus.OPEN,
          actorId: req.user!.id,
          note:
            `Devolução da solicitação #${origin.code}` +
            (observacao ? ` — ${observacao}` : ''),
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      await persistEquipamentos(created.id, equipamentos);

      res.status(201).json({
        success: true,
        data: { ...created, equipamentos },
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadAnexo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.QUOTATION) {
        throw createError('Ordem de compra só pode ser anexada na etapa Cotação', 400);
      }

      const file = req.file;
      if (!file?.buffer?.length) throw createError('Selecione um arquivo', 400);

      const kindRaw = String(req.body?.kind || 'oc').trim().toLowerCase();
      if (kindRaw === 'payment') {
        throw createError(
          'Neste fluxo só é permitido anexar Ordem de compra. Comprovante de pagamento não é utilizado.',
          400,
        );
      }
      const kind = kindRaw === 'outro' ? 'outro' : 'oc';

      const originalName =
        fixMulterOriginalName(file.originalname) || file.originalname || 'anexo';
      const saved = await savePersistentUpload({
        folder: `tool-rental-requests/${row.id}/anexos`,
        buffer: file.buffer,
        originalName,
        mimeType: file.mimetype,
        includeSafeOriginalName: true,
      });

      const attachmentsMap = await loadAttachmentsMap([row.id]);
      const list = legacyAttachmentsFromRow({
        ...row,
        attachments: attachmentsMap.get(row.id),
      });
      list.push({
        id: randomUUID(),
        name: saved.originalName || originalName,
        url: saved.url,
        kind,
      });

      const note =
        kind === 'payment'
          ? 'Comprovante de pagamento anexado'
          : kind === 'oc'
            ? 'Ordem de compra anexada'
            : 'Anexo adicionado';

      const updated = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "tool_rental_requests"
          SET "attachments" = ${JSON.stringify(list)}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${row.id}
        `;
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: row.status,
          toStatus: row.status,
          actorId: req.user!.id,
          note,
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });

      res.json({
        success: true,
        data: { ...updated, attachments: list },
        message: 'Anexo vinculado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteAnexo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.QUOTATION) {
        throw createError('Ordem de compra só pode ser removida na etapa Cotação', 400);
      }

      const anexoId = String(req.params.anexoId || '').trim();
      if (!anexoId) throw createError('Anexo inválido', 400);

      const attachmentsMap = await loadAttachmentsMap([row.id]);
      const list = legacyAttachmentsFromRow({
        ...row,
        attachments: attachmentsMap.get(row.id),
      }).filter((a) => a.id !== anexoId);
      await prisma.$executeRaw`
        UPDATE "tool_rental_requests"
        SET "attachments" = ${JSON.stringify(list)}::jsonb, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${row.id}
      `;
      const updated = await prisma.toolRentalRequest.findUniqueOrThrow({
        where: { id: row.id },
        include,
      });

      res.json({
        success: true,
        data: { ...updated, attachments: list },
        message: 'Anexo removido',
      });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);

      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (
        row.status !== ToolRentalRequestStatus.OPEN &&
        row.status !== ToolRentalRequestStatus.SUPPLIER_RELATION &&
        row.status !== ToolRentalRequestStatus.QUOTATION
      ) {
        throw createError('Somente solicitações abertas, em análise ou em cotação podem ser rejeitadas', 400);
      }

      const reason = requireString(
        req.body?.reason ?? req.body?.suppliesRejectionReason,
        'Motivo da rejeição'
      );
      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id, status: row.status },
          data: {
            status: ToolRentalRequestStatus.REJECTED,
            suppliesApprovedById: req.user!.id,
            suppliesApprovedAt: new Date(),
            suppliesRejectionReason: reason,
            suppliesApprovalComment: null,
          },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: row.status,
          toStatus: ToolRentalRequestStatus.REJECTED,
          actorId: req.user!.id,
          note: reason,
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const row = await prisma.toolRentalRequest.findUnique({ where: { id: req.params.id } });
      if (!row) throw createError('Solicitação não encontrada', 404);
      if (row.status !== ToolRentalRequestStatus.OPEN) {
        throw createError('Somente solicitações abertas podem ser canceladas', 400);
      }
      const isOwner = row.createdById === req.user.id;
      if (!req.user.isAdmin && !isOwner) {
        throw createError('Sem permissão para cancelar esta solicitação', 403);
      }
      const updated = await prisma.$transaction(async (tx) => {
        await tx.toolRentalRequest.update({
          where: { id: row.id, status: row.status },
          data: { status: ToolRentalRequestStatus.CANCELLED },
        });
        await appendStatusEvent(tx, {
          requestId: row.id,
          fromStatus: ToolRentalRequestStatus.OPEN,
          toStatus: ToolRentalRequestStatus.CANCELLED,
          actorId: req.user!.id,
          note: 'Solicitação cancelada',
        });
        return tx.toolRentalRequest.findUniqueOrThrow({
          where: { id: row.id },
          include,
        });
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
