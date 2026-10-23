import { Response } from 'express';
import { z } from 'zod';
import {
  DemandSheetApprovalStatus,
  DemandSheetPurchaseStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { isConcurrentUpdateConflict, CONCURRENT_UPDATE_CONFLICT_MESSAGE } from '../lib/prismaConflict';
import { AuthRequest } from '../middleware/auth';
import {
  assertUserCanApproveFd,
  getFdManagerApprovalVisibilityWhere,
} from '../lib/fdApprovalAccess';
import {
  assertLiberadoContractAccess,
  getLiberadoContractAccessForUser,
} from '../lib/contractAccess';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import {
  importDemandSheets,
  type FdImportRow,
} from '../services/demandSheetImport';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { OrcamentoService } from '../services/OrcamentoService';
import {
  getFdApprovalNotifyUserIds,
  notifyApprovalDecisionWhatsApp,
  notifyNewPendingApprovalWhatsApp,
  notifyRequesterApprovedWhatsApp,
  notifyRequesterCancelledWhatsApp,
  resolveActorName,
} from '../lib/approvalWhatsAppNotify';

const fdModuleKey = pathToModuleKey('/ponto/aprovacao-fds');
const fdsAprovadasModuleKey = pathToModuleKey('/ponto/fds-aprovadas');
const orcamentoService = new OrcamentoService();

const ORCAMENTO_REF_KIND = 'orcamento-ref';
const ORCAMENTO_REF_NAME = '__orcamento_ref__';

function isOrcamentoRefAnexo(a: unknown): boolean {
  if (!a || typeof a !== 'object') return false;
  const row = a as { kind?: unknown; name?: unknown };
  return row.kind === ORCAMENTO_REF_KIND || row.name === ORCAMENTO_REF_NAME;
}

function clampFichaDemandaPct(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractOrcamentoRefFromAnexos(
  anexos: unknown
): { centroCustoId: string; orcamentoId: string; fichaDemandaPct: number | null } | null {
  if (!Array.isArray(anexos)) return null;
  for (const a of anexos) {
    if (!isOrcamentoRefAnexo(a)) continue;
    const row = a as { centroCustoId?: unknown; orcamentoId?: unknown; fichaDemandaPct?: unknown };
    const centroCustoId = String(row.centroCustoId || '').trim();
    const orcamentoId = String(row.orcamentoId || '').trim();
    if (centroCustoId && orcamentoId) {
      return {
        centroCustoId,
        orcamentoId,
        fichaDemandaPct: clampFichaDemandaPct(row.fichaDemandaPct),
      };
    }
  }
  return null;
}

function anexosComFichaDemandaPct(anexos: unknown, pct: number): Prisma.InputJsonValue {
  const list = Array.isArray(anexos) ? anexos : [];
  let found = false;
  const next = list.map((a) => {
    if (!isOrcamentoRefAnexo(a) || !a || typeof a !== 'object') return a;
    found = true;
    return { ...(a as Record<string, unknown>), fichaDemandaPct: pct };
  });
  if (!found) return list as Prisma.InputJsonValue;
  return next as Prisma.InputJsonValue;
}

function publicAnexos(anexos: unknown): unknown[] {
  if (!Array.isArray(anexos)) return [];
  return anexos.filter((a) => !isOrcamentoRefAnexo(a));
}

async function syncOrcamentoStatusFromFd(
  anexos: unknown,
  statusAprovacao: 'aprovado' | 'em_correcao'
): Promise<void> {
  const ref = extractOrcamentoRefFromAnexos(anexos);
  if (!ref) return;
  try {
    await orcamentoService.updateStatusAprovacao(
      ref.centroCustoId,
      ref.orcamentoId,
      statusAprovacao
    );
  } catch (err) {
    console.warn('[DemandSheetApproval] Falha ao sincronizar status do orçamento:', err);
  }
}

const PURCHASE_STATUS_VALUES = [
  'WAREHOUSE_DF',
  'WAREHOUSE_GO',
  'FULLY_FULFILLED_BY_STOCK',
  'PARTIALLY_FULFILLED_BY_STOCK',
  'PURCHASE_REQUEST',
  'QUOTATION',
  'SUPPLIES',
  'FINISHED',
  'CANCELLED',
] as const satisfies readonly DemandSheetPurchaseStatus[];

const anexoSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().optional(),
  kind: z.string().optional(),
  descricao: z.string().max(120).optional(),
  centroCustoId: z.string().optional(),
  orcamentoId: z.string().optional(),
});

const formSchema = z.object({
  numMovRm: z.string().min(1),
  idMovRm: z.string().min(1),
  codigoPedido: z.string().min(1),
  solicitanteId: z.string().optional(),
  contratoId: z.string().min(1),
  obra: z.string().min(1),
  codFichaDemanda: z.string().min(1),
  faturamentoEstimado: z.union([z.number(), z.string()]),
  custoEstimado: z.union([z.number(), z.string()]),
  observacao: z.string().min(1),
  dataHora: z.string().min(1),
  polo: z.enum(['DF', 'GO']),
  anexos: z.array(anexoSchema).optional().default([]),
  orcamentoCentroCustoId: z.string().optional(),
  orcamentoId: z.string().optional(),
});

const managerDecisionSchema = z.object({
  comment: z.string().optional(),
});

const purchaseStatusSchema = z.object({
  purchaseStatus: z.enum(PURCHASE_STATUS_VALUES),
  purchaseCancellationNote: z.string().optional().nullable(),
});

const purchaseRefsSchema = z.object({
  scNumero: z.string().optional().nullable(),
  scId: z.string().optional().nullable(),
  ocId: z.string().optional().nullable(),
});

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

const fichaDemandaPctSchema = z.object({
  fichaDemandaPct: z.number().finite(),
});

function parseMoney(value: string | number): Prisma.Decimal {
  if (typeof value === 'number') {
    return new Prisma.Decimal(value);
  }
  const s = String(value).replace(/[R$\s]/g, '').trim();
  if (!s) return new Prisma.Decimal(0);
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(normalized);
  return new Prisma.Decimal(Number.isFinite(n) ? n : 0);
}

function parseDataHora(value: string): Date {
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const br = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (br) {
    const [, dd, mm, yyyy, hh = '0', mi = '0', ss = '0'] = br;
    return new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss)
    );
  }
  throw createError('Data e hora inválidas', 400);
}

function serializeRow(row: {
  id: string;
  numMovRm: string;
  idMovRm: string;
  scNumero?: string | null;
  scId?: string | null;
  ocId?: string | null;
  codigoPedido: string;
  solicitanteId: string;
  solicitanteNome?: string | null;
  contratoId: string;
  obra: string;
  codFichaDemanda: string;
  faturamentoEstimado: Prisma.Decimal;
  custoEstimado: Prisma.Decimal;
  observacao: string;
  dataHora: Date;
  polo: string;
  anexos: unknown;
  status: DemandSheetApprovalStatus;
  createdBy: string;
  managerApprovedBy: string | null;
  managerApprovedAt: Date | null;
  managerApprovalComment: string | null;
  managerRejectionReason: string | null;
  managerRejectionComment: string | null;
  purchaseStatus: DemandSheetPurchaseStatus | null;
  purchaseStatusUpdatedBy: string | null;
  purchaseStatusUpdatedAt: Date | null;
  purchaseCancellationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  solicitante?: { id: string; name: string } | null;
  contrato?: { id: string; name: string; number: string; costCenterId?: string } | null;
  creator?: { id: string; name: string } | null;
  managerApprover?: { id: string; name: string } | null;
  purchaseStatusUpdater?: { id: string; name: string } | null;
}) {
  const orcRef = extractOrcamentoRefFromAnexos(row.anexos);
  return {
    ...row,
    faturamentoEstimado: Number(row.faturamentoEstimado),
    custoEstimado: Number(row.custoEstimado),
    dataHora: row.dataHora.toLocaleString('pt-BR'),
    solicitanteNome: row.solicitanteNome?.trim() || row.solicitante?.name || '',
    contratoNome: row.contrato ? row.contrato.name : '',
    creatorNome: row.creator?.name ?? '',
    managerApproverNome: row.managerApprover?.name ?? '',
    purchaseStatusUpdaterNome: row.purchaseStatusUpdater?.name ?? '',
    purchaseStatusUpdatedAt: row.purchaseStatusUpdatedAt
      ? row.purchaseStatusUpdatedAt.toLocaleString('pt-BR')
      : null,
    anexos: publicAnexos(row.anexos),
    orcamentoId: orcRef?.orcamentoId ?? null,
    orcamentoCentroCustoId: orcRef?.centroCustoId ?? null,
    contratoCostCenterId: row.contrato?.costCenterId ?? null,
    fichaDemandaPct: orcRef?.fichaDemandaPct ?? null,
  };
}

const includeDefault = {
  solicitante: { select: { id: true, name: true } },
  contrato: { select: { id: true, name: true, number: true, costCenterId: true } },
  creator: { select: { id: true, name: true } },
  managerApprover: { select: { id: true, name: true } },
  purchaseStatusUpdater: { select: { id: true, name: true } },
} as const;

/** Anexo de ordem de compra já enviado (com arquivo). */
function hasOrdemCompraAnexo(anexos: unknown): boolean {
  if (!Array.isArray(anexos)) return false;
  return anexos.some((a) => {
    const item = (a ?? {}) as { url?: string; kind?: string; name?: string };
    if (!item.url) return false;
    if (item.kind === 'oc') return true;
    if (item.kind) return false;
    return /ORDEM\s*DE\s*COMPRA|ANEXO[_-]?OC|(?:^|[_-])OC(?:[_-]|\d)/i.test(String(item.name ?? ''));
  });
}

/**
 * Status de compras automático:
 * Pendente (sem status) + Nº e ID da SC preenchidos → Cotação (várias OCs).
 * Daí em diante é manual: Finalizada (e dela dá pra voltar pra Cotação).
 */
async function advancePurchaseStatusAutomatically<
  T extends {
    id: string;
    status: string;
    purchaseStatus: DemandSheetPurchaseStatus | null;
    scNumero: string | null;
    scId: string | null;
    ocId: string | null;
    anexos: unknown;
  },
>(row: T, userId: string): Promise<T> {
  if (row.status !== 'APPROVED') return row;
  let next: DemandSheetPurchaseStatus | null = row.purchaseStatus;
  if (!next && row.scNumero?.trim() && row.scId?.trim()) next = 'QUOTATION';
  if (next === row.purchaseStatus) return row;
  const updated = await prisma.demandSheetApproval.update({
    where: { id: row.id },
    data: {
      purchaseStatus: next,
      purchaseStatusUpdatedBy: userId,
      purchaseStatusUpdatedAt: new Date(),
      purchaseCancellationNote: null,
    },
    include: includeDefault,
  });
  return updated as unknown as T;
}

async function userCanAccessFdModule(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findFirst({
    where: { userId, module: fdModuleKey, action: PERMISSION_ACCESS_ACTION, allowed: true },
  });
  return !!perm;
}

async function userCanAccessFdsAprovadasModule(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  const perm = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: fdsAprovadasModuleKey,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
  });
  return !!perm;
}

/** Escopo da página Fichas de Demanda: próprias + contratos Liberados. Aprovar FD não lista aqui. */
async function listWhereForUser(userId: string, isAdmin: boolean): Promise<Prisma.DemandSheetApprovalWhereInput> {
  if (isAdmin) return {};

  const or: Prisma.DemandSheetApprovalWhereInput[] = [{ createdBy: userId }];

  const hasModule = await userCanAccessFdModule(userId, isAdmin);
  if (hasModule) {
    const access = await getLiberadoContractAccessForUser(userId, false);
    if (access.filter === 'all') {
      return {};
    }
    if (access.filter === 'ids' && access.ids.length > 0) {
      or.push({ contratoId: { in: access.ids } });
    }
  }

  return { OR: or };
}

export class DemandSheetApprovalController {
  async list(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const search = String(req.query.search ?? '').trim();
      const status = String(req.query.status ?? '').trim();
      const contratoId = String(req.query.contratoId ?? '').trim();

      const where: Prisma.DemandSheetApprovalWhereInput = {
        ...(await listWhereForUser(req.user.id, req.user.isAdmin)),
      };

      if (status && status !== 'ALL') {
        where.status = status as DemandSheetApprovalStatus;
      }
      if (contratoId) {
        where.contratoId = contratoId;
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { codFichaDemanda: { contains: search, mode: 'insensitive' } },
              { codigoPedido: { contains: search, mode: 'insensitive' } },
              { numMovRm: { contains: search, mode: 'insensitive' } },
              { idMovRm: { contains: search, mode: 'insensitive' } },
              { scNumero: { contains: search, mode: 'insensitive' } },
              { scId: { contains: search, mode: 'insensitive' } },
              { ocId: { contains: search, mode: 'insensitive' } },
              { obra: { contains: search, mode: 'insensitive' } },
              { solicitanteNome: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const rows = await prisma.demandSheetApproval.findMany({
        where,
        include: includeDefault,
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar fichas de demanda' });
    }
  }

  async create(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canCreate =
        req.user.isAdmin || (await userCanAccessFdModule(req.user.id, req.user.isAdmin));
      if (!canCreate) {
        throw createError('Sem permissão para cadastrar fichas de demanda', 403);
      }

      const body = formSchema.parse(req.body);
      await assertLiberadoContractAccess(req, body.contratoId);

      const anexos: Array<Record<string, unknown>> = Array.isArray(body.anexos)
        ? body.anexos.map((a) => ({ ...a }))
        : [];
      const centroRef = String(body.orcamentoCentroCustoId || '').trim();
      const orcRef = String(body.orcamentoId || '').trim();
      if (centroRef && orcRef && !extractOrcamentoRefFromAnexos(anexos)) {
        anexos.push({
          id: ORCAMENTO_REF_KIND,
          name: ORCAMENTO_REF_NAME,
          kind: ORCAMENTO_REF_KIND,
          centroCustoId: centroRef,
          orcamentoId: orcRef,
          fichaDemandaPct: 0,
        });
      }

      const row = await prisma.demandSheetApproval.create({
        data: {
          numMovRm: body.numMovRm.trim(),
          idMovRm: body.idMovRm.trim(),
          codigoPedido: body.codigoPedido.trim(),
          solicitanteId: req.user.id,
          contratoId: body.contratoId,
          obra: body.obra.trim(),
          codFichaDemanda: body.codFichaDemanda.trim(),
          faturamentoEstimado: parseMoney(body.faturamentoEstimado),
          custoEstimado: parseMoney(body.custoEstimado),
          observacao: body.observacao.trim(),
          dataHora: parseDataHora(body.dataHora),
          polo: body.polo,
          anexos: anexos as unknown as Prisma.InputJsonValue,
          status: 'WAITING_MANAGER',
          createdBy: req.user.id,
        },
        include: includeDefault,
      });

      const approverIds = await getFdApprovalNotifyUserIds(row.contratoId);
      void notifyNewPendingApprovalWhatsApp(
        approverIds,
        `Ficha de demanda ${row.codFichaDemanda} · Obra: ${row.obra}`
      );

      return res.status(201).json({ success: true, data: serializeRow(row) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao criar ficha de demanda' });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);
      // Edição liberada enquanto aguarda aprovação e na Fila (aprovada, ainda sem status de compras).
      const naFila = existing.status === 'APPROVED' && !existing.purchaseStatus;
      if (existing.status !== 'WAITING_MANAGER' && !naFila) {
        throw createError('A ficha só pode ser editada até a etapa Fila', 400);
      }
      if (!req.user.isAdmin && existing.createdBy !== req.user.id) {
        throw createError('Sem permissão para editar esta ficha', 403);
      }

      const body = formSchema.parse(req.body);
      await assertLiberadoContractAccess(req, body.contratoId);

      const row = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          numMovRm: body.numMovRm.trim(),
          idMovRm: body.idMovRm.trim(),
          codigoPedido: body.codigoPedido.trim(),
          contratoId: body.contratoId,
          obra: body.obra.trim(),
          codFichaDemanda: body.codFichaDemanda.trim(),
          faturamentoEstimado: parseMoney(body.faturamentoEstimado),
          custoEstimado: parseMoney(body.custoEstimado),
          observacao: body.observacao.trim(),
          dataHora: parseDataHora(body.dataHora),
          polo: body.polo,
          anexos: body.anexos,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(row) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar ficha de demanda' });
    }
  }

  /** Suprimentos: edita os dados da ficha em qualquer etapa (não depende de status nem de quem criou). */
  async updateBySupplies(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para editar fichas de demanda', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);

      const body = formSchema.parse(req.body);
      const contract = await prisma.contract.findUnique({ where: { id: body.contratoId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const row = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          numMovRm: body.numMovRm.trim(),
          idMovRm: body.idMovRm.trim(),
          codigoPedido: body.codigoPedido.trim(),
          contratoId: body.contratoId,
          obra: body.obra.trim(),
          codFichaDemanda: body.codFichaDemanda.trim(),
          faturamentoEstimado: parseMoney(body.faturamentoEstimado),
          custoEstimado: parseMoney(body.custoEstimado),
          observacao: body.observacao.trim(),
          dataHora: parseDataHora(body.dataHora),
          polo: body.polo,
          anexos: body.anexos,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(row) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Confira os campos obrigatórios da ficha' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar ficha de demanda' });
    }
  }

  async remove(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);
      if (existing.status !== 'WAITING_MANAGER') {
        throw createError('Somente fichas aguardando aprovação podem ser excluídas', 400);
      }
      if (!req.user.isAdmin && existing.createdBy !== req.user.id) {
        throw createError('Sem permissão para excluir esta ficha', 403);
      }

      await prisma.demandSheetApproval.delete({ where: { id } });
      return res.json({ success: true });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao excluir ficha de demanda' });
    }
  }

  async getManagerApprovals(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const managerScope = await getFdManagerApprovalVisibilityWhere(
        req.user.id,
        req.user.isAdmin,
      );

      const rawPhase = String(req.query.phase ?? 'PENDING').toUpperCase();
      type Phase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
      const phase: Phase = (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).includes(
        rawPhase as Phase
      )
        ? (rawPhase as Phase)
        : 'PENDING';

      const phaseFilter =
        phase === 'PENDING'
          ? { status: 'WAITING_MANAGER' as const }
          : phase === 'APPROVED'
            ? { status: 'APPROVED' as const }
            : phase === 'REJECTED'
              ? { status: 'REJECTED' as const }
              : {
                  status: {
                    in: ['WAITING_MANAGER', 'APPROVED', 'REJECTED'] as DemandSheetApprovalStatus[],
                  },
                };

      const rows = await prisma.demandSheetApproval.findMany({
        where: { ...phaseFilter, ...managerScope },
        include: includeDefault,
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e) {
      return res.status(500).json({ error: 'Erro ao buscar aprovações de FD' });
    }
  }

  async approveManager(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'WAITING_MANAGER') {
        throw createError('A ficha não está aguardando aprovação do gestor', 400);
      }

      await assertUserCanApproveFd(req.user.id, req.user.isAdmin, row.contratoId);

      const payload = managerDecisionSchema.parse(req.body);

      const updated = await prisma.demandSheetApproval.update({
        // Compare-and-swap — ver comentário equivalente em DpRequestController.approveManager.
        where: { id, status: 'WAITING_MANAGER' },
        data: {
          status: 'APPROVED',
          managerApprovedBy: req.user.id,
          managerApprovedAt: new Date(),
          managerApprovalComment: payload.comment?.trim() || null,
          managerRejectionReason: null,
          managerRejectionComment: null,
        },
        include: includeDefault,
      });

      await syncOrcamentoStatusFromFd(updated.anexos, 'aprovado');

      void notifyRequesterApprovedWhatsApp({
        requesterUserId: row.solicitanteId,
        approverUserId: req.user.id,
        subjectLine: `Ficha de demanda ${row.codFichaDemanda}`,
      });

      const approverName = await resolveActorName(req.user.id);
      const notifyIds = await getFdApprovalNotifyUserIds(row.contratoId);
      void notifyApprovalDecisionWhatsApp(
        notifyIds,
        `Ficha de demanda ${row.codFichaDemanda}`,
        `Aprovada pelo gestor (${approverName}).`,
        true
      );

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      if (isConcurrentUpdateConflict(e)) {
        return res.status(409).json({ error: CONCURRENT_UPDATE_CONFLICT_MESSAGE });
      }
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao aprovar ficha de demanda' });
    }
  }

  async rejectManager(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'WAITING_MANAGER') {
        throw createError('A ficha não está aguardando aprovação do gestor', 400);
      }

      await assertUserCanApproveFd(req.user.id, req.user.isAdmin, row.contratoId);

      const payload = managerDecisionSchema.parse(req.body);
      const reason = payload.comment?.trim() || 'Reprovada pelo gestor';

      const updated = await prisma.demandSheetApproval.update({
        where: { id, status: 'WAITING_MANAGER' },
        data: {
          status: 'REJECTED',
          managerApprovedBy: null,
          managerApprovedAt: null,
          managerApprovalComment: null,
          managerRejectionReason: reason,
          managerRejectionComment: payload.comment?.trim() || null,
        },
        include: includeDefault,
      });

      await syncOrcamentoStatusFromFd(updated.anexos, 'em_correcao');

      void notifyRequesterCancelledWhatsApp({
        requesterUserId: row.solicitanteId,
        actorUserId: req.user.id,
        subjectLine: `Ficha de demanda ${row.codFichaDemanda}`,
      });

      const rejecterName = await resolveActorName(req.user.id);
      const notifyIds = await getFdApprovalNotifyUserIds(row.contratoId);
      void notifyApprovalDecisionWhatsApp(
        notifyIds,
        `Ficha de demanda ${row.codFichaDemanda}`,
        `Rejeitada pelo gestor (${rejecterName}).`,
        false
      );

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      if (isConcurrentUpdateConflict(e)) {
        return res.status(409).json({ error: CONCURRENT_UPDATE_CONFLICT_MESSAGE });
      }
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao rejeitar ficha de demanda' });
    }
  }

  async getNotificationCounts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const managerScope = await getFdManagerApprovalVisibilityWhere(
        req.user.id,
        req.user.isAdmin,
      );
      const pendingManager = await prisma.demandSheetApproval.count({
        where: { status: 'WAITING_MANAGER', ...managerScope },
      });

      let pendingPurchase = 0;
      const canPurchase = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (canPurchase) {
        pendingPurchase = await prisma.demandSheetApproval.count({
          where: { status: 'APPROVED', purchaseStatus: null },
        });
      }

      return res.json({
        success: true,
        data: { pendingManager, pendingPurchase },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao buscar notificações de FD' });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({
        where: { id },
        include: includeDefault,
      });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);

      const canFdsAprovadas = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (canFdsAprovadas && row.status === 'APPROVED') {
        return res.json({ success: true, data: serializeRow(row) });
      }

      const scope = await listWhereForUser(req.user.id, req.user.isAdmin);
      const allowed = await prisma.demandSheetApproval.findFirst({
        where: { id, ...scope },
        select: { id: true },
      });
      if (!allowed) throw createError('Sem permissão para ver esta ficha de demanda', 403);

      return res.json({ success: true, data: serializeRow(row) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao buscar ficha de demanda' });
    }
  }

  async listApprovedForPurchasing(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para acessar fichas aprovadas', 403);
      }

      const search = String(req.query.search ?? '').trim();
      const purchaseStatus = String(req.query.purchaseStatus ?? '').trim();

      const where: Prisma.DemandSheetApprovalWhereInput = {
        status: 'APPROVED',
      };

      if (purchaseStatus && purchaseStatus !== 'ALL') {
        if (purchaseStatus === 'NONE') {
          where.purchaseStatus = null;
        } else if (purchaseStatus === 'WAREHOUSE_DF' || purchaseStatus === 'WAREHOUSE_GO') {
          // Almoxarifado é um status só: junta os registros antigos de DF e GO.
          where.purchaseStatus = { in: ['WAREHOUSE_DF', 'WAREHOUSE_GO'] };
        } else if (
          (PURCHASE_STATUS_VALUES as readonly string[]).includes(purchaseStatus)
        ) {
          where.purchaseStatus = purchaseStatus as DemandSheetPurchaseStatus;
        }
      }

      if (search) {
        where.AND = [
          {
            OR: [
              { codFichaDemanda: { contains: search, mode: 'insensitive' } },
              { codigoPedido: { contains: search, mode: 'insensitive' } },
              { numMovRm: { contains: search, mode: 'insensitive' } },
              { idMovRm: { contains: search, mode: 'insensitive' } },
              { scNumero: { contains: search, mode: 'insensitive' } },
              { scId: { contains: search, mode: 'insensitive' } },
              { ocId: { contains: search, mode: 'insensitive' } },
              { obra: { contains: search, mode: 'insensitive' } },
              { solicitanteNome: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const rows = await prisma.demandSheetApproval.findMany({
        where,
        include: includeDefault,
        orderBy: [{ managerApprovedAt: 'desc' }, { createdAt: 'desc' }],
      });

      return res.json({ success: true, data: rows.map(serializeRow) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar fichas aprovadas' });
    }
  }

  async updatePurchaseStatus(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para atualizar status de compras', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'APPROVED') {
        throw createError('Somente fichas aprovadas pelo gestor podem receber status de compras', 400);
      }

      const body = purchaseStatusSchema.parse(req.body);
      // Finalizada pode voltar para Cotação (reabrir); qualquer outra mudança é bloqueada.
      const reopening = row.purchaseStatus === 'FINISHED' && body.purchaseStatus === 'QUOTATION';
      if (!reopening && (row.purchaseStatus === 'FINISHED' || row.purchaseStatus === 'CANCELLED')) {
        throw createError('Ficha finalizada ou cancelada não pode mais ser alterada.', 400);
      }
      if (body.purchaseStatus === 'FINISHED') {
        if (row.purchaseStatus !== 'PURCHASE_REQUEST' && row.purchaseStatus !== 'QUOTATION') {
          throw createError('Só é possível finalizar a partir da Cotação.', 400);
        }
        if (!hasOrdemCompraAnexo(row.anexos)) {
          throw createError('Anexe ao menos uma ordem de compra antes de finalizar.', 400);
        }
      }
      const cancellationNote = String(body.purchaseCancellationNote ?? '').trim();
      if (body.purchaseStatus === 'CANCELLED' && !cancellationNote) {
        throw createError('Informe a observação do cancelamento.', 400);
      }

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          purchaseStatus: body.purchaseStatus,
          purchaseStatusUpdatedBy: req.user.id,
          purchaseStatusUpdatedAt: new Date(),
          purchaseCancellationNote:
            body.purchaseStatus === 'CANCELLED' ? cancellationNote : null,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar status de compras' });
    }
  }

  /** Número da SC, ID da SC e ID da OC preenchidos em Suprimentos. */
  async updatePurchaseRefs(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para atualizar os dados de compra', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'APPROVED') {
        throw createError('Somente fichas aprovadas podem receber número e ID de SC e OC', 400);
      }

      if (row.purchaseStatus === 'FINISHED' || row.purchaseStatus === 'CANCELLED') {
        throw createError('Ficha finalizada ou cancelada não pode mais ser alterada.', 400);
      }

      const body = purchaseRefsSchema.parse(req.body);
      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          scNumero: emptyToNull(body.scNumero),
          scId: emptyToNull(body.scId),
          ocId: emptyToNull(body.ocId),
        },
        include: includeDefault,
      });
      const advanced = await advancePurchaseStatusAutomatically(updated, req.user.id);

      return res.json({ success: true, data: serializeRow(advanced) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao salvar número e ID de SC e OC' });
    }
  }

  /** Administrador corrige contrato e obra de uma ficha (ex.: cadastro com contrato/obra errados). */
  async updateContractObra(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      if (!req.user.isAdmin) {
        throw createError('Somente o administrador pode alterar contrato e obra', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const body = z
        .object({ contratoId: z.string().min(1), obra: z.string().min(1) })
        .parse(req.body);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);

      const contract = await prisma.contract.findUnique({ where: { id: body.contratoId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: { contratoId: body.contratoId, obra: body.obra.trim() },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Informe o contrato e a obra' });
      }
      return res.status(500).json({ error: 'Erro ao alterar contrato e obra' });
    }
  }

  async updateFichaDemandaPct(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para atualizar o progresso da ficha', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({
        where: { id },
        include: includeDefault,
      });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'APPROVED') {
        throw createError('Somente fichas aprovadas podem atualizar o progresso da FD', 400);
      }

      const body = fichaDemandaPctSchema.parse(req.body);
      const pct = clampFichaDemandaPct(body.fichaDemandaPct);
      if (pct == null) throw createError('Percentual inválido', 400);

      const current = extractOrcamentoRefFromAnexos(row.anexos);
      if (!current) {
        return res.json({ success: true, data: serializeRow(row) });
      }
      if (current.fichaDemandaPct === pct) {
        return res.json({ success: true, data: serializeRow(row) });
      }

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: { anexos: anexosComFichaDemandaPct(row.anexos, pct) },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao atualizar progresso da ficha' });
    }
  }

  async importMany(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const canImport =
        req.user.isAdmin || (await userCanAccessFdModule(req.user.id, req.user.isAdmin));
      if (!canImport) {
        throw createError('Sem permissão para importar fichas de demanda', 403);
      }

      let payload: { fichas?: unknown[]; mode?: string } = {};
      const rawPayload = String((req.body as { payload?: unknown })?.payload || '').trim();
      if (rawPayload) {
        try {
          payload = JSON.parse(rawPayload) as { fichas?: unknown[]; mode?: string };
        } catch {
          throw createError('Payload da importação inválido.', 400);
        }
      }

      const rows = Array.isArray(payload.fichas) ? (payload.fichas as FdImportRow[]) : [];
      const linkOnly =
        String(payload.mode || '').trim().toLowerCase() === 'link-anexos' ||
        String((req.body as { mode?: unknown })?.mode || '').trim().toLowerCase() === 'link-anexos';
      const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const result = await importDemandSheets({
        userId: req.user.id,
        rows,
        files,
        linkOnly,
      });

      console.log(
        `[FD import] user=${req.user.id} rows=${rows.length} linkOnly=${linkOnly}` +
          ` created=${result.created} updated=${result.updated} failed=${result.failed}` +
          ` anexos=${result.anexosLinked}` +
          (result.errors[0] ? ` firstError=${result.errors[0].message}` : ''),
      );

      return res.json({
        success: true,
        data: result,
        message: `Importação: ${result.created} nova(s), ${result.updated} atualizada(s), ${result.failed} falha(s).`,
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      console.error('[FD import]', e);
      return res.status(500).json({ error: 'Erro ao importar fichas de demanda' });
    }
  }

  /** Upload de anexo antes de salvar a ficha (rascunho). */
  async uploadDraftAttachment(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const file = (req.file || (Array.isArray(req.files) ? req.files[0] : undefined)) as
        | Express.Multer.File
        | undefined;
      if (!file?.buffer?.length) throw createError('Selecione um arquivo', 400);

      const originalName =
        fixMulterOriginalName(file.originalname) || file.originalname || 'anexo';
      const saved = await savePersistentUpload({
        folder: `demand-sheet-approvals/drafts/${req.user.id}`,
        buffer: file.buffer,
        originalName,
        mimeType: file.mimetype,
        includeSafeOriginalName: true,
      });

      return res.json({
        success: true,
        data: {
          url: saved.url,
          originalName: saved.originalName || originalName,
        },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao enviar anexo da ficha de demanda' });
    }
  }

  /** Remove um anexo (OC, ficha de demanda extra ou outro) enquanto a ficha está em andamento. */
  async removeAnexo(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) throw createError('Sem permissão para remover anexos', 403);

      const id = String(req.params.id || '').trim();
      const anexoId = String(req.params.anexoId || '').trim();
      if (!id || !anexoId) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({
        where: { id },
        select: { id: true, status: true, anexos: true, purchaseStatus: true },
      });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'APPROVED') {
        throw createError('Somente fichas aprovadas permitem remover anexos nesta etapa', 400);
      }
      if (row.purchaseStatus === 'FINISHED' || row.purchaseStatus === 'CANCELLED') {
        throw createError('Ficha finalizada ou cancelada não pode mais ser alterada.', 400);
      }

      type AnexoRow = { id?: string; kind?: string };
      const list: AnexoRow[] = Array.isArray(row.anexos) ? (row.anexos as AnexoRow[]) : [];
      const target = list.find((a) => a?.id === anexoId);
      if (!target) throw createError('Anexo não encontrado', 404);
      if (target.kind === 'orcamento') {
        throw createError('O orçamento não pode ser removido.', 400);
      }

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          anexos: list.filter((a) => a !== target) as unknown as Prisma.InputJsonValue,
        },
        include: includeDefault,
      });
      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao remover anexo' });
    }
  }

  /** Vincula arquivo a um anexo pendente (da planilha) ou adiciona um anexo novo. */
  async uploadAnexo(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({
        where: { id },
        select: {
          id: true,
          externalId: true,
          anexos: true,
          status: true,
          createdBy: true,
          purchaseStatus: true,
        },
      });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);

      if (!req.user.isAdmin) {
        const accessWhere = await listWhereForUser(req.user.id, false);
        const visible = await prisma.demandSheetApproval.findFirst({
          where: { AND: [{ id }, accessWhere] },
          select: { id: true },
        });
        if (!visible) {
          const hasCompras = await userCanAccessFdsAprovadasModule(req.user.id, false);
          if (!(hasCompras && existing.status === 'APPROVED')) {
            throw createError('Ficha de demanda não encontrada', 404);
          }
        }
      }

      const file = (req.file || (Array.isArray(req.files) ? req.files[0] : undefined)) as
        | Express.Multer.File
        | undefined;
      if (!file?.buffer?.length) throw createError('Selecione um arquivo', 400);

      const anexoId = String((req.body as { anexoId?: unknown })?.anexoId ?? '').trim();
      const requestedKind = String((req.body as { kind?: unknown })?.kind ?? '').trim();
      const ocRef = String((req.body as { ocRef?: unknown })?.ocRef ?? '').trim();
      const descricao = String((req.body as { descricao?: unknown })?.descricao ?? '').trim().slice(0, 120);
      const originalName =
        fixMulterOriginalName(file.originalname) || file.originalname || 'anexo';

      const folder = `demand-sheet-approvals/${existing.externalId || existing.id}/anexos`;
      const saved = await savePersistentUpload({
        folder,
        buffer: file.buffer,
        originalName,
        mimeType: file.mimetype,
        includeSafeOriginalName: true,
      });

      type AnexoRow = {
        id?: string;
        name?: string;
        url?: string;
        kind?: string;
        sourcePath?: string;
        ocRef?: string;
        descricao?: string;
      };
      const list: AnexoRow[] = Array.isArray(existing.anexos)
        ? (existing.anexos as AnexoRow[]).map((a) => ({ ...a }))
        : [];

      let updated = false;
      if (anexoId) {
        let idx = list.findIndex((a) => a.id === anexoId);
        if (idx < 0) {
          idx = list.findIndex(
            (a) => !a.url && `${a.name || ''}-${a.sourcePath || ''}` === anexoId,
          );
        }
        if (idx < 0) {
          idx = list.findIndex(
            (a) =>
              !a.url &&
              (a.name || '').toLowerCase() ===
                (saved.originalName || originalName).toLowerCase(),
          );
        }
        if (idx >= 0) {
          list[idx] = {
            ...list[idx]!,
            id: list[idx]!.id || anexoId,
            url: saved.url,
            name: list[idx]!.name || saved.originalName || originalName,
          };
          updated = true;
        }
      }
      if (!updated && !requestedKind) {
        // Preenche o primeiro pendente sem url, se houver.
        const pendingIdx = list.findIndex((a) => !a.url);
        if (pendingIdx >= 0) {
          list[pendingIdx] = {
            ...list[pendingIdx]!,
            url: saved.url,
            name: list[pendingIdx]!.name || saved.originalName || originalName,
          };
          updated = true;
        }
      }
      if (!updated) {
        list.push({
          id: anexoId || saved.key || `anexo-${Date.now()}`,
          name: saved.originalName || originalName,
          url: saved.url,
          kind: requestedKind || 'outro',
          ...(requestedKind === 'oc' && ocRef ? { ocRef } : {}),
          ...(descricao ? { descricao } : {}),
        });
      }

      const row = await prisma.demandSheetApproval.update({
        where: { id: existing.id },
        data: { anexos: list as unknown as Prisma.InputJsonValue },
        include: includeDefault,
      });
      const advanced = await advancePurchaseStatusAutomatically(row, req.user.id);

      return res.json({
        success: true,
        data: serializeRow(advanced),
        message: 'Anexo vinculado com sucesso',
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao enviar anexo da ficha de demanda' });
    }
  }

  /** Contratos com Liberado para vincular na FD. */
  async listContratoOptions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const access = await getLiberadoContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') {
        return res.json({ success: true, data: [] });
      }

      const search = String(req.query.search ?? '').trim();
      const where: {
        id?: { in: string[] };
        OR?: Array<{ name: { contains: string; mode: 'insensitive' }; } | { number: { contains: string; mode: 'insensitive' } }>;
      } = {};
      if (access.filter === 'ids') {
        where.id = { in: access.ids };
      }
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { number: { contains: search, mode: 'insensitive' } },
        ];
      }

      const rows = await prisma.contract.findMany({
        where,
        orderBy: [{ name: 'asc' }, { number: 'asc' }],
        select: { id: true, name: true, number: true },
      });

      return res.json({
        success: true,
        data: rows.map((row) => ({
          id: row.id,
          name: row.name.trim() || row.number,
          number: row.number,
        })),
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao listar contratos' });
    }
  }
}
