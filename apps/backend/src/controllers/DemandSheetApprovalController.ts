import { Response } from 'express';
import { z } from 'zod';
import {
  DemandSheetApprovalStatus,
  DemandSheetPurchaseStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { idMovsValidadosComprasG4 } from '../lib/fluigG4Validacao';
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
import { MaterialRequestService } from '../services/MaterialRequestService';
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

/** Grava no anexo-ref do orçamento o custo real calculado na aba Ficha de demanda (espelho para a lista). */
function anexosComCustoReal(anexos: unknown, custoReal: number): Prisma.InputJsonValue {
  const list = Array.isArray(anexos) ? anexos : [];
  return list.map((a) =>
    isOrcamentoRefAnexo(a) && a && typeof a === 'object'
      ? { ...(a as Record<string, unknown>), custoReal }
      : a
  ) as Prisma.InputJsonValue;
}

/** Custo real espelhado da aba Ficha de demanda (null quando a FD nunca foi aberta com custo). */
function custoRealEspelhado(anexos: unknown): number | null {
  if (!Array.isArray(anexos)) return null;
  for (const a of anexos) {
    if (!isOrcamentoRefAnexo(a)) continue;
    const n = Number((a as { custoReal?: unknown }).custoReal);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function publicAnexos(anexos: unknown): unknown[] {
  if (!Array.isArray(anexos)) return [];
  return anexos.filter((a) => !isOrcamentoRefAnexo(a));
}

type FdItemPedido = {
  fdItemKey: string;
  fdItem: string;
  descricao: string;
  requestNumber: string;
  materialRequestId: string;
  requestedAt: string;
  requestedBy: string;
  /** Soma das quantidades dos materiais pedidos para o item nesta RM. */
  quantidade: number;
  /** Quantidade do item no orçamento/FD no momento do pedido. */
  quantidadeFd: number | null;
  /** Unidade do item na FD. */
  unidadeFd: string;
  /** Soma só dos materiais pedidos na unidade da FD (base do saldo). */
  quantidadeNaUnidadeFd: number;
  /** Materiais associados ao item neste pedido (1 item → N materiais). */
  materiais: { materialId: string; materialLabel: string; quantity: number; unit: string }[];
  /** Motivos de atenção para o gestor: '1:N' (vários materiais) e/ou 'unidade' (unidade diferente da FD). */
  alertas: string[];
};

const FD_QTD_EPS = 1e-6;

function parseItensPedidos(raw: unknown): FdItemPedido[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      fdItemKey: String(r.fdItemKey || ''),
      fdItem: String(r.fdItem || ''),
      descricao: String(r.descricao || ''),
      requestNumber: String(r.requestNumber || ''),
      materialRequestId: String(r.materialRequestId || ''),
      requestedAt: String(r.requestedAt || ''),
      requestedBy: String(r.requestedBy || ''),
      quantidade: Number.isFinite(Number(r.quantidade)) ? Number(r.quantidade) : 0,
      quantidadeFd: Number.isFinite(Number(r.quantidadeFd)) && r.quantidadeFd != null ? Number(r.quantidadeFd) : null,
      unidadeFd: String(r.unidadeFd || ''),
      // Registros antigos não tinham este campo: a quantidade era na unidade da FD.
      quantidadeNaUnidadeFd: Number.isFinite(Number(r.quantidadeNaUnidadeFd))
        ? Number(r.quantidadeNaUnidadeFd)
        : Number.isFinite(Number(r.quantidade)) ? Number(r.quantidade) : 0,
      materiais: Array.isArray(r.materiais)
        ? (r.materiais as Record<string, unknown>[]).map((m) => ({
            materialId: String(m?.materialId || ''),
            materialLabel: String(m?.materialLabel || ''),
            quantity: Number(m?.quantity) || 0,
            unit: String(m?.unit || ''),
          }))
        : [],
      alertas: Array.isArray(r.alertas) ? (r.alertas as unknown[]).map(String) : [],
    }))
    .filter((r) => r.fdItemKey);
}

/**
 * IDs de RMs que batem com a busca da lista de FDs: número da RM, número da OC ou IdMov/Nº movimento
 * TOTVS da OC. Aceita "RM 10", "OC 10", "IdMov 65964" ou só o número. Limitado para não pesar a busca.
 */
async function materialRequestIdsForFdSearch(search: string): Promise<string[]> {
  const termo = search.replace(/^\s*(rm|req|oc|id\s*mov|idmov)\s*[-:#nº°]*\s*/i, '').trim();
  if (!termo) return [];
  const numero = /^\d+$/.test(termo) ? Number(termo) : null;

  const [rms, ocs] = await Promise.all([
    prisma.materialRequest.findMany({
      where: { requestNumber: { contains: termo, mode: 'insensitive' } },
      select: { id: true },
      take: 200,
    }),
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { orderNumber: { contains: termo, mode: 'insensitive' } },
          { totvsNumMovimento: { contains: termo, mode: 'insensitive' } },
          ...(numero !== null && numero <= 2147483647 ? [{ totvsIdMov: numero }] : []),
        ],
      },
      select: {
        materialRequestId: true,
        items: { select: { materialRequestItem: { select: { materialRequestId: true } } } },
      },
      take: 200,
    }),
  ]);

  const ids = new Set<string>(rms.map((r) => r.id));
  for (const oc of ocs) {
    if (oc.materialRequestId) ids.add(oc.materialRequestId);
    for (const it of oc.items) {
      if (it.materialRequestItem?.materialRequestId) ids.add(it.materialRequestItem.materialRequestId);
    }
  }
  return [...ids].slice(0, 300);
}

type FdMaterialCustoReal = {
  materialId: string;
  materialLabel: string;
  unit: string;
  quantidade: number;
  valorUnitario: number;
  total: number;
  ocs: { orderNumber: string; totvsIdMov: number }[];
};

/**
 * Custo real dos itens da FD a partir das OCs validadas pelo compras no G4 (IdMov em Anexar Nota Fiscal
 * ou Finalizada no espelho do Fluig; não canceladas/reprovadas).
 * Material juntado em uma linha da RM para vários itens da FD é rateado pela quantidade pedida. Só leitura.
 */
type ItemOcDaRm = {
  poItemId: string;
  quantidade: number;
  total: number;
  oc: {
    id: string;
    orderNumber: string;
    status: string;
    totvsIdMov: number | null;
    totvsNumMovimento: string | null;
    /** Total da OC (itens + frete). */
    amountToPay: number;
  };
};

/**
 * Itens de OC por (RM, material). Liga de dois jeitos: pelo item da RM (materialRequestItemId) e,
 * quando a OC não guardou esse vínculo (ex.: gerada pelo mapa de cotação), pela RM do cabeçalho
 * da OC + mesmo material. Só leitura.
 */
async function itensOcPorRmMaterial(rmIds: string[]): Promise<Map<string, ItemOcDaRm[]>> {
  const mapa = new Map<string, ItemOcDaRm[]>();
  if (!rmIds.length) return mapa;
  const ocSelect = {
    id: true,
    orderNumber: true,
    status: true,
    totvsIdMov: true,
    totvsNumMovimento: true,
    materialRequestId: true,
    amountToPay: true,
  } as const;
  const [porItemRm, porCabecalho] = await Promise.all([
    prisma.purchaseOrderItem.findMany({
      where: { materialRequestItem: { materialRequestId: { in: rmIds } } },
      select: {
        id: true,
        materialId: true,
        quantity: true,
        totalPrice: true,
        materialRequestItem: { select: { materialRequestId: true } },
        purchaseOrder: { select: ocSelect },
      },
    }),
    prisma.purchaseOrderItem.findMany({
      where: { materialRequestItemId: null, purchaseOrder: { materialRequestId: { in: rmIds } } },
      select: { id: true, materialId: true, quantity: true, totalPrice: true, purchaseOrder: { select: ocSelect } },
    }),
  ]);
  const adicionar = (rmId: string | null | undefined, poi: {
    id: string;
    materialId: string;
    quantity: unknown;
    totalPrice: unknown;
    purchaseOrder: {
      id: string;
      orderNumber: string;
      status: string;
      totvsIdMov: number | null;
      totvsNumMovimento: string | null;
      amountToPay: unknown;
    };
  }) => {
    if (!rmId) return;
    const k = `${rmId}|${poi.materialId}`;
    const lista = mapa.get(k) ?? [];
    if (lista.some((x) => x.poItemId === poi.id)) return;
    const { id, orderNumber, status, totvsIdMov, totvsNumMovimento, amountToPay } = poi.purchaseOrder;
    lista.push({
      poItemId: poi.id,
      quantidade: Number(poi.quantity) || 0,
      total: Number(poi.totalPrice) || 0,
      oc: {
        id,
        orderNumber,
        status: String(status),
        totvsIdMov,
        totvsNumMovimento,
        amountToPay: Number(amountToPay) || 0,
      },
    });
    mapa.set(k, lista);
  };
  for (const poi of porItemRm) adicionar(poi.materialRequestItem?.materialRequestId, poi);
  for (const poi of porCabecalho) adicionar(poi.purchaseOrder.materialRequestId, poi);
  return mapa;
}

async function calcularCustosReaisFd(
  itensPedidosRaw: unknown
): Promise<Record<string, { materiais: FdMaterialCustoReal[]; total: number }>> {
  const pedidos = parseItensPedidos(itensPedidosRaw).filter((p) => p.materiais.length > 0);
  const rmIds = [...new Set(pedidos.map((p) => p.materialRequestId).filter(Boolean))];
  const itensOc = await itensOcPorRmMaterial(rmIds);
  // Só entram OCs já validadas pelo compras no G4 (Anexar Nota Fiscal ou Finalizada), pelo IdMov.
  const validadasG4 = await idMovsValidadosComprasG4();

  // O que foi comprado por (RM, material), só de OCs validadas no G4.
  type Compra = { quantidade: number; total: number; ocs: { orderNumber: string; totvsIdMov: number }[] };
  const compraPorRmMaterial = new Map<string, Compra>();
  for (const [k, lista] of itensOc) {
    const compra: Compra = { quantidade: 0, total: 0, ocs: [] };
    for (const it of lista) {
      const po = it.oc;
      if (po.totvsIdMov == null || po.status === 'CANCELLED' || po.status === 'REJECTED') continue;
      if (!validadasG4.has(po.totvsIdMov)) continue;
      compra.quantidade += it.quantidade;
      compra.total += it.total;
      if (!compra.ocs.some((o) => o.orderNumber === po.orderNumber)) {
        compra.ocs.push({ orderNumber: po.orderNumber, totvsIdMov: po.totvsIdMov });
      }
    }
    if (compra.quantidade > 0) compraPorRmMaterial.set(k, compra);
  }

  // Quanto cada item da FD pediu de cada material na mesma RM (base do rateio).
  const pedidoPorRmMaterial = new Map<string, number>();
  for (const p of pedidos) {
    for (const m of p.materiais) {
      const k = `${p.materialRequestId}|${m.materialId}`;
      pedidoPorRmMaterial.set(k, (pedidoPorRmMaterial.get(k) || 0) + m.quantity);
    }
  }

  const itens: Record<string, { materiais: FdMaterialCustoReal[]; total: number }> = {};
  for (const p of pedidos) {
    for (const m of p.materiais) {
      const k = `${p.materialRequestId}|${m.materialId}`;
      const compra = compraPorRmMaterial.get(k);
      if (!compra) continue;
      const pedidoTotal = pedidoPorRmMaterial.get(k) || m.quantity;
      const fator = pedidoTotal > 0 ? m.quantity / pedidoTotal : 1;
      const quantidade = compra.quantidade * fator;
      const total = compra.total * fator;
      const item = (itens[p.fdItemKey] ??= { materiais: [], total: 0 });
      item.materiais.push({
        materialId: m.materialId,
        materialLabel: m.materialLabel,
        unit: m.unit,
        quantidade,
        valorUnitario: quantidade > 0 ? total / quantidade : 0,
        total,
        ocs: compra.ocs,
      });
      item.total += total;
    }
  }
  return itens;
}

/** RM preenchida à mão no formulário da FD (import usa "-" como vazio). */
function hasManualRm(numMovRm: string | null | undefined): boolean {
  const v = String(numMovRm || '').trim();
  return v !== '' && v !== '-';
}

async function syncOrcamentoStatusFromFd(
  anexos: unknown,
  statusAprovacao: 'aprovado' | 'em_correcao',
  fichaDemandaApprovalId?: string
): Promise<void> {
  const ref = extractOrcamentoRefFromAnexos(anexos);
  if (!ref) return;
  try {
    await orcamentoService.updateStatusAprovacao(
      ref.centroCustoId,
      ref.orcamentoId,
      statusAprovacao,
      fichaDemandaApprovalId
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
  numMovRm: z.string().default(''),
  idMovRm: z.string().default(''),
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
  pedidosEncerrados: boolean;
  pedidosEncerradosBy: string | null;
  pedidosEncerradosAt: Date | null;
  itensPedidos: unknown;
  createdAt: Date;
  updatedAt: Date;
  solicitante?: { id: string; name: string } | null;
  contrato?: {
    id: string;
    name: string;
    number: string;
    costCenterId?: string;
    costCenter?: { name: string | null } | null;
  } | null;
  creator?: { id: string; name: string } | null;
  managerApprover?: { id: string; name: string } | null;
  purchaseStatusUpdater?: { id: string; name: string } | null;
}) {
  const orcRef = extractOrcamentoRefFromAnexos(row.anexos);
  const parsedItens = parseItensPedidos(row.itensPedidos);
  const pedidosStatus: 'PENDENTE' | 'PARCIAL' | 'COMPLETO' = row.pedidosEncerrados
    ? 'COMPLETO'
    : parsedItens.length > 0
      ? 'PARCIAL'
      : 'PENDENTE';
  return {
    ...row,
    pedidosStatus,
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
    /** Centro de custo da FD (o do contrato) — agrupamento da lista de FDs. */
    centroCustoNome: row.contrato?.costCenter?.name?.trim() || null,
    fichaDemandaPct: orcRef?.fichaDemandaPct ?? null,
  };
}

const includeDefault = {
  solicitante: { select: { id: true, name: true } },
  contrato: {
    select: { id: true, name: true, number: true, costCenterId: true, costCenter: { select: { name: true } } },
  },
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

/**
 * OS e nº da pasta de cada FD (vindos da importação do orçamento de origem), no formato "OS - Nº123".
 * Lê o índice de orçamentos uma vez por centro de custo. Só leitura.
 */
async function osNumeroPastaPorFd(
  rows: Array<{ id: string; anexos: unknown }>
): Promise<{ os: Map<string, string>; orcamentoExiste: Map<string, boolean> }> {
  const refPorFd = new Map<string, { centroCustoId: string; orcamentoId: string }>();
  for (const r of rows) {
    const ref = extractOrcamentoRefFromAnexos(r.anexos);
    if (ref) refPorFd.set(r.id, { centroCustoId: ref.centroCustoId, orcamentoId: ref.orcamentoId });
  }
  const ccs = [...new Set([...refPorFd.values()].map((r) => r.centroCustoId))];
  const osPorOrcamento = new Map<string, string>();
  const orcamentosExistentes = new Set<string>();
  const ccsLidos = new Set<string>();
  await Promise.all(
    ccs.map(async (cc) => {
      try {
        const index = await orcamentoService.getIndex(cc);
        ccsLidos.add(cc);
        for (const o of index.orcamentos) {
          orcamentosExistentes.add(`${cc}|${o.id}`);
          const os = String(o.osCodigo || '').trim();
          const pasta = String(o.numeroPasta || '').trim();
          const label = os && pasta ? `${os} - Nº${pasta}` : os || pasta;
          if (label) osPorOrcamento.set(`${cc}|${o.id}`, label);
        }
      } catch {
        /* índice indisponível: a FD fica em "Sem OS" */
      }
    })
  );
  const out = new Map<string, string>();
  // Orçamento de origem excluído: a FD não entra nos resultados (índice lido e orçamento ausente).
  const orcamentoExiste = new Map<string, boolean>();
  for (const [fdId, ref] of refPorFd) {
    const chave = `${ref.centroCustoId}|${ref.orcamentoId}`;
    const label = osPorOrcamento.get(chave);
    if (label) out.set(fdId, label);
    if (ccsLidos.has(ref.centroCustoId)) orcamentoExiste.set(fdId, orcamentosExistentes.has(chave));
  }
  return { os: out, orcamentoExiste };
}

/**
 * Total pago em OCs por FD: OCs das RMs da FD validadas pelo compras no G4 (Anexar Nota Fiscal ou
 * Finalizada), cada OC uma vez, pelo total da OC. Só leitura.
 */
async function totalPagoOcsPorFd(rows: Array<{ id: string; itensPedidos: unknown }>): Promise<Map<string, number>> {
  const rmsPorFd = new Map<string, Set<string>>();
  for (const r of rows) {
    const rms = new Set(parseItensPedidos(r.itensPedidos).map((p) => p.materialRequestId).filter(Boolean));
    if (rms.size) rmsPorFd.set(r.id, rms);
  }
  const out = new Map<string, number>();
  if (!rmsPorFd.size) return out;
  const todasRms = [...new Set([...rmsPorFd.values()].flatMap((s) => [...s]))];
  const [itensOc, validadasG4] = await Promise.all([itensOcPorRmMaterial(todasRms), idMovsValidadosComprasG4()]);
  // OCs pagas por RM (cada OC uma vez).
  const ocsPagasPorRm = new Map<string, Map<string, number>>();
  for (const [k, lista] of itensOc) {
    const rmId = k.split('|')[0];
    for (const { oc } of lista) {
      if (oc.totvsIdMov == null || oc.status === 'CANCELLED' || oc.status === 'REJECTED') continue;
      if (!validadasG4.has(oc.totvsIdMov)) continue;
      const m = ocsPagasPorRm.get(rmId) ?? new Map<string, number>();
      m.set(oc.id, oc.amountToPay);
      ocsPagasPorRm.set(rmId, m);
    }
  }
  for (const [fdId, rms] of rmsPorFd) {
    const ocs = new Map<string, number>();
    for (const rmId of rms) for (const [ocId, valor] of ocsPagasPorRm.get(rmId) ?? []) ocs.set(ocId, valor);
    out.set(fdId, Math.round([...ocs.values()].reduce((a, b) => a + b, 0) * 100) / 100);
  }
  return out;
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
        // Também encontra a FD pela RM, OC ou IdMov TOTVS gerados a partir dela (só leitura em RM/OC).
        const rmIdsDaBusca = await materialRequestIdsForFdSearch(search);
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
              ...rmIdsDaBusca.map((rmId) => ({
                itensPedidos: { array_contains: [{ materialRequestId: rmId }] },
              })),
            ],
          },
        ];
      }

      const rows = await prisma.demandSheetApproval.findMany({
        where,
        include: includeDefault,
        orderBy: { createdAt: 'desc' },
      });

      // Custo real: o espelho da aba Ficha de demanda (inclui valores digitados e os vindos das OCs);
      // sem espelho, soma as OCs enviadas ao TOTVS para os itens pedidos pela FD.
      const custoRealPorFd = new Map<string, number>();
      for (const r of rows) {
        const espelho = custoRealEspelhado(r.anexos);
        if (espelho != null) custoRealPorFd.set(r.id, espelho);
      }
      await Promise.all(
        rows
          .filter(
            (r) => !custoRealPorFd.has(r.id) && Array.isArray(r.itensPedidos) && r.itensPedidos.length > 0
          )
          .map(async (r) => {
            const itens = await calcularCustosReaisFd(r.itensPedidos);
            custoRealPorFd.set(r.id, Object.values(itens).reduce((acc, it) => acc + it.total, 0));
          })
      );

      // Resultado por FD para a lista em níveis (centro de custo → obra → OS → FD).
      const [osInfo, pagoPorFd] = await Promise.all([osNumeroPastaPorFd(rows), totalPagoOcsPorFd(rows)]);

      return res.json({
        success: true,
        data: rows.map((r) => ({
          ...serializeRow(r),
          custoReal: custoRealPorFd.get(r.id) ?? null,
          osNumeroPasta: osInfo.os.get(r.id) ?? null,
          /** false = o orçamento de origem foi excluído (FD sem dado real para o resultado). */
          orcamentoExiste: osInfo.orcamentoExiste.get(r.id) ?? null,
          totalPagoOcs: pagoPorFd.get(r.id) ?? 0,
        })),
      });
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
      return res.status(500).json({ error: `Erro ao enviar a ficha de demanda: ${(e as Error)?.message || 'erro desconhecido'}` });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const existing = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!existing) throw createError('Ficha de demanda não encontrada', 404);
      // Edição liberada enquanto aguarda aprovação, quando reprovada e na Fila (aprovada, ainda sem status de compras).
      const naFila = existing.status === 'APPROVED' && !existing.purchaseStatus;
      if (existing.status !== 'WAITING_MANAGER' && existing.status !== 'REJECTED' && !naFila) {
        throw createError('A ficha só pode ser editada até a etapa Fila', 400);
      }
      if (!req.user.isAdmin && existing.createdBy !== req.user.id) {
        throw createError('Sem permissão para editar esta ficha', 403);
      }

      const body = formSchema.parse(req.body);
      await assertLiberadoContractAccess(req, body.contratoId);

      const anexos: Array<Record<string, unknown>> = Array.isArray(body.anexos)
        ? body.anexos.map((a: Record<string, unknown>) => ({ ...a }))
        : [];
      const existingOrcRef = extractOrcamentoRefFromAnexos(existing.anexos);
      if (existingOrcRef && !extractOrcamentoRefFromAnexos(anexos)) {
        anexos.push({
          id: ORCAMENTO_REF_KIND,
          name: ORCAMENTO_REF_NAME,
          kind: ORCAMENTO_REF_KIND,
          centroCustoId: existingOrcRef.centroCustoId,
          orcamentoId: existingOrcRef.orcamentoId,
          fichaDemandaPct: existingOrcRef.fichaDemandaPct ?? 0,
        });
      }
      const centroRef = String((req.body as Record<string, unknown>).orcamentoCentroCustoId || '').trim();
      const orcRef = String((req.body as Record<string, unknown>).orcamentoId || '').trim();
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
          anexos: anexos as unknown as Prisma.InputJsonValue,
          ...(existing.status === 'REJECTED' ? { status: 'WAITING_MANAGER', managerApprovedBy: null, managerApprovedAt: null, managerApprovalComment: null, managerRejectionReason: null, managerRejectionComment: null } : {}),
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
              ? { status: { in: ['REJECTED', 'CANCELLED'] as DemandSheetApprovalStatus[] } }
              : {
                  status: {
                    in: ['WAITING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED'] as DemandSheetApprovalStatus[],
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

      await syncOrcamentoStatusFromFd(updated.anexos, 'aprovado', updated.id);

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

      const rejectedOwn = await prisma.demandSheetApproval.count({
        where: { status: 'REJECTED', createdBy: req.user.id },
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
        data: { pendingManager, pendingPurchase, rejectedOwn },
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

  /** Espelha o custo real da aba Ficha de demanda na FD (para a coluna "Custo real" da lista). */
  async updateCustoReal(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const custoReal = Number((req.body as { custoReal?: unknown })?.custoReal);
      if (!Number.isFinite(custoReal) || custoReal < 0) throw createError('Custo real inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id }, select: { anexos: true, status: true } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);

      // Mesmo acesso de "ver detalhes": módulo de FDs aprovadas ou FD visível para o usuário.
      const canFdsAprovadas = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!(canFdsAprovadas && row.status === 'APPROVED')) {
        const scope = await listWhereForUser(req.user.id, req.user.isAdmin);
        const allowed = await prisma.demandSheetApproval.findFirst({ where: { id, ...scope }, select: { id: true } });
        if (!allowed) throw createError('Sem permissão para atualizar esta ficha de demanda', 403);
      }

      if (!extractOrcamentoRefFromAnexos(row.anexos)) return res.json({ success: true });
      const valor = Math.round(custoReal * 100) / 100;
      if (custoRealEspelhado(row.anexos) === valor) return res.json({ success: true });

      await prisma.demandSheetApproval.update({
        where: { id },
        data: { anexos: anexosComCustoReal(row.anexos, valor) },
      });
      return res.json({ success: true });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao atualizar custo real da ficha' });
    }
  }

  async encerrarPedidos(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const canAccess = await userCanAccessFdsAprovadasModule(req.user.id, req.user.isAdmin);
      if (!canAccess) {
        throw createError('Sem permissão para encerrar pedidos', 403);
      }

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (row.status !== 'APPROVED') {
        throw createError('Somente fichas aprovadas podem ter pedidos encerrados', 400);
      }
      if (row.pedidosEncerrados) {
        throw createError('Os pedidos desta FD já estão encerrados', 400);
      }

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          pedidosEncerrados: true,
          pedidosEncerradosBy: req.user.id,
          pedidosEncerradosAt: new Date(),
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao encerrar pedidos' });
    }
  }

  async reabrirPedidos(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const id = String(req.params.id || '').trim();
      if (!id) throw createError('ID inválido', 400);

      const row = await prisma.demandSheetApproval.findUnique({ where: { id } });
      if (!row) throw createError('Ficha de demanda não encontrada', 404);
      if (!row.pedidosEncerrados) {
        throw createError('Os pedidos desta FD não estão encerrados', 400);
      }

      if (!req.user.isAdmin) {
        const contractAccess = await prisma.userContractPermission.findFirst({
          where: { userId: req.user.id, contractId: row.contratoId, accessLiberado: true },
        });
        if (!contractAccess) {
          throw createError('Apenas o administrador ou o gestor do contrato pode reabrir pedidos', 403);
        }
      }

      const updated = await prisma.demandSheetApproval.update({
        where: { id },
        data: {
          pedidosEncerrados: false,
          pedidosEncerradosBy: null,
          pedidosEncerradosAt: null,
        },
        include: includeDefault,
      });

      return res.json({ success: true, data: serializeRow(updated) });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: 'Erro ao reabrir pedidos' });
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

  async createMaterialRequestFromFd(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const fdId = req.params.id;
      const fd = await prisma.demandSheetApproval.findUnique({
        where: { id: fdId },
        include: { contrato: { select: { id: true, costCenterId: true } } },
      });

      if (!fd) throw createError('Ficha de demanda não encontrada', 404);
      if (fd.status !== 'APPROVED') throw createError('Ficha de demanda não está aprovada', 400);
      if (fd.pedidosEncerrados) throw createError('Os pedidos desta FD foram encerrados. Não é possível criar novos pedidos.', 400);

      const itensPedidos = parseItensPedidos(fd.itensPedidos);
      // RM informada manualmente (fluxo antigo, sem controle por item): FD inteira já pedida.
      if (itensPedidos.length === 0 && hasManualRm(fd.numMovRm)) {
        throw createError('Esta ficha de demanda já possui uma RM vinculada', 400);
      }

      const schema = z.object({
        serviceOrderId: z.string().optional(),
        items: z.array(z.object({
          fdItemKey: z.string().min(1),
          fdItem: z.string().default(''),
          fdDescricao: z.string().default(''),
          fdQuantidade: z.number().nonnegative().optional(),
          fdUnidade: z.string().default(''),
          materialId: z.string().min(1),
          materialLabel: z.string().default(''),
          quantity: z.number().positive(),
          /** Unidade do pedido (padrão = unidade da FD; editável no modal). */
          unit: z.string().optional(),
          description: z.string().optional(),
        })).min(1, 'Informe pelo menos um item'),
      });

      const body = schema.parse(req.body);

      // Rascunhos antigos guardavam o ID do material de construção; a RM usa o espelho de engenharia (`CM-{id}`).
      const idsInformados = [...new Set(body.items.map((i) => i.materialId))];
      const engExistentes = await prisma.engineeringMaterial.findMany({
        where: { id: { in: idsInformados } },
        select: { id: true },
      });
      const idsSemEng = idsInformados.filter((id) => !engExistentes.some((e) => e.id === id));
      if (idsSemEng.length > 0) {
        const espelhos = await prisma.engineeringMaterial.findMany({
          where: { sinapiCode: { in: idsSemEng.map((id) => `CM-${id}`) } },
          select: { id: true, sinapiCode: true },
        });
        const engPorConstrucao = new Map(espelhos.map((e) => [e.sinapiCode.slice(3), e.id]));
        for (const item of body.items) {
          const engId = engPorConstrucao.get(item.materialId);
          if (engId) item.materialId = engId;
        }
      }

      // Agrupa os materiais por item da FD.
      type ItemFd = {
        fdItem: string;
        descricao: string;
        fdQuantidade?: number;
        fdUnidade: string;
        materiais: { materialId: string; materialLabel: string; quantity: number; unit: string }[];
      };
      const porItemFd = new Map<string, ItemFd>();
      for (const item of body.items) {
        const atual = porItemFd.get(item.fdItemKey) ?? {
          fdItem: item.fdItem || item.fdItemKey,
          descricao: item.fdDescricao,
          fdQuantidade: item.fdQuantidade,
          fdUnidade: item.fdUnidade.trim(),
          materiais: [],
        };
        atual.materiais.push({
          materialId: item.materialId,
          materialLabel: item.materialLabel,
          quantity: item.quantity,
          unit: (item.unit || '').trim() || item.fdUnidade.trim(),
        });
        porItemFd.set(item.fdItemKey, atual);
      }

      // A FD pode ser pedida em partes, mas cada item é pedido de forma integral, uma única vez.
      const jaPedidos = new Set(itensPedidos.map((p) => p.fdItemKey));
      const repetidos = [...porItemFd.entries()].filter(([key]) => jaPedidos.has(key)).map(([, it]) => it.fdItem);
      if (repetidos.length > 0) {
        throw createError(`Itens da FD já solicitados em pedido anterior: ${repetidos.join(', ')}`, 409);
      }

      // Item 1:1 na unidade da FD: a quantidade tem que ser a da FD (sem pedido parcial).
      // 1:N ou unidade alterada não dá para conferir — fica marcado para o gestor (alertas).
      const alertasPorItem = new Map<string, string[]>();
      for (const [key, it] of porItemFd) {
        const alertas: string[] = [];
        if (it.materiais.length > 1) alertas.push('1:N');
        if (it.materiais.some((m) => m.unit !== it.fdUnidade)) alertas.push('unidade');
        alertasPorItem.set(key, alertas);
        if (alertas.length > 0 || it.fdQuantidade === undefined) continue;
        if (Math.abs(it.materiais[0].quantity - it.fdQuantidade) > FD_QTD_EPS) {
          throw createError(
            `Item ${it.fdItem}: deve ser solicitado de forma integral (${it.fdQuantidade.toLocaleString('pt-BR')} ${it.fdUnidade}).`,
            400
          );
        }
      }


      let resolvedServiceOrderId = body.serviceOrderId || undefined;
      if (!resolvedServiceOrderId && fd.obra) {
        const pleito = await prisma.pleito.findFirst({
          where: {
            service_orders: { costCenterId: fd.contrato.costCenterId },
            updatedContractId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { serviceOrderId: true },
        });
        if (pleito) resolvedServiceOrderId = pleito.serviceOrderId;
      }

      const demandSheetAttachments = (Array.isArray(fd.anexos) ? fd.anexos : [])
        .filter((a: any) => !isOrcamentoRefAnexo(a) && a?.url)
        .map((a: any) => ({ url: String(a.url), name: String(a.name || 'Anexo') }));

      // A RM (fluxo de produção, não alterar) exige material único por linha: junta o mesmo material
      // de vários itens da FD em uma linha só, somando quantidades e juntando as observações.
      const linhasRm = new Map<string, { quantity: number; unit: string; notes: string[] }>();
      for (const item of body.items) {
        const unit = (item.unit || '').trim();
        const atual = linhasRm.get(item.materialId);
        if (!atual) {
          linhasRm.set(item.materialId, { quantity: item.quantity, unit, notes: item.description ? [item.description] : [] });
          continue;
        }
        if (atual.unit !== unit) {
          throw createError(
            `O mesmo material foi associado com unidades diferentes (${atual.unit || '—'} e ${unit || '—'}). Use a mesma unidade para ele neste pedido.`,
            400
          );
        }
        atual.quantity += item.quantity;
        if (item.description) atual.notes.push(item.description);
      }

      const materialRequestService = new MaterialRequestService();
      const rm = await materialRequestService.createMaterialRequest({
        requestedBy: req.user.id,
        costCenterId: fd.contrato.costCenterId,
        serviceOrderId: resolvedServiceOrderId,
        serviceOrder: fd.obra || undefined,
        obra: fd.obra || undefined,
        description: `Pedido de material da ${fd.codFichaDemanda}`,
        demandSheet: fd.codFichaDemanda,
        demandSheetAttachments: demandSheetAttachments.length > 0 ? demandSheetAttachments : undefined,
        priority: 'MEDIUM',
        items: [...linhasRm.entries()].map(([materialId, linha]) => ({
          materialId,
          quantity: linha.quantity,
          notes: linha.notes.join(' | ') || undefined,
        })),
      });

      // Unidade escolhida no modal (padrão = unidade da FD). A RM grava a do cadastro; ajusta só os itens desta RM.
      for (const [materialId, linha] of linhasRm) {
        if (!linha.unit) continue;
        try {
          await prisma.materialRequestItem.updateMany({
            where: { materialRequestId: rm.id, materialId, unit: { not: linha.unit } },
            data: { unit: linha.unit },
          });
        } catch (err) {
          console.warn('[DemandSheetApproval] Falha ao ajustar unidade do item da RM:', err);
        }
      }

      const requestedAt = new Date().toISOString();
      const novos: FdItemPedido[] = [];
      for (const [key, it] of porItemFd) {
        novos.push({
          fdItemKey: key,
          fdItem: it.fdItem,
          descricao: it.descricao,
          requestNumber: rm.requestNumber,
          materialRequestId: rm.id,
          requestedAt,
          requestedBy: req.user.id,
          quantidade: it.materiais.reduce((acc, m) => acc + m.quantity, 0),
          quantidadeFd: it.fdQuantidade ?? null,
          unidadeFd: it.fdUnidade,
          quantidadeNaUnidadeFd: it.materiais
            .filter((m) => m.unit === it.fdUnidade)
            .reduce((acc, m) => acc + m.quantity, 0),
          materiais: it.materiais,
          alertas: alertasPorItem.get(key) ?? [],
        });
      }
      const itensAtualizados = [...itensPedidos, ...novos];
      const rmsAnteriores = itensPedidos.length > 0 ? fd.numMovRm.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const idsAnteriores = itensPedidos.length > 0 ? fd.idMovRm.split(',').map((s) => s.trim()).filter(Boolean) : [];

      await prisma.demandSheetApproval.update({
        where: { id: fdId },
        data: {
          itensPedidos: itensAtualizados as unknown as Prisma.InputJsonValue,
          numMovRm: [...rmsAnteriores, rm.requestNumber].join(', '),
          idMovRm: [...idsAnteriores, rm.id].join(', '),
        },
      });

      return res.json({
        success: true,
        data: { requestNumber: rm.requestNumber, materialRequestId: rm.id, itensPedidos: itensAtualizados },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: e.errors[0]?.message || 'Dados inválidos' });
      }
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      }
      return res.status(500).json({ error: (e as Error)?.message || 'Erro ao criar requisição de material' });
    }
  }

  /**
   * Associação itens da FD → materiais de uma RM criada pela FD (detalhe da RM na aprovação).
   * Retorna `null` quando a RM não veio da FD — a tela de aprovação segue igual.
   */
  async getFdAssociationByMaterialRequest(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const rmId = String(req.params.materialRequestId || '').trim();
      if (!rmId) throw createError('ID inválido', 400);

      const fd = await prisma.demandSheetApproval.findFirst({
        where: { itensPedidos: { array_contains: [{ materialRequestId: rmId }] } },
        select: { id: true, codFichaDemanda: true, obra: true, itensPedidos: true, anexos: true, contratoId: true, contrato: { select: { costCenterId: true, name: true } } },
      });
      if (!fd) return res.json({ success: true, data: null });

      const itens = parseItensPedidos(fd.itensPedidos).filter((i) => i.materialRequestId === rmId);
      const orcRef = extractOrcamentoRefFromAnexos(fd.anexos);
      return res.json({
        success: true,
        data: {
          fdId: fd.id,
          codFichaDemanda: fd.codFichaDemanda,
          obra: fd.obra,
          itens,
          orcamentoId: orcRef?.orcamentoId || null,
          contratoId: fd.contratoId || null,
          contratoNome: fd.contrato?.name || null,
          centroCustoId: orcRef?.centroCustoId || fd.contrato?.costCenterId || null,
        },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao buscar associação da FD' });
    }
  }

  /**
   * Resumo do que já foi pedido da FD: itens, materiais e quantidades, RM e as OCs vinculadas
   * (com IdMov do TOTVS quando já enviada). Só leitura — não altera RM nem OC.
   */
  async getPedidosResumo(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const fdId = String(req.params.id || '').trim();
      const fd = await prisma.demandSheetApproval.findUnique({
        where: { id: fdId },
        select: { id: true, codFichaDemanda: true, itensPedidos: true },
      });
      if (!fd) throw createError('Ficha de demanda não encontrada', 404);

      const itens = parseItensPedidos(fd.itensPedidos);
      const rmIds = [...new Set(itens.map((i) => i.materialRequestId).filter(Boolean))];
      const rms = rmIds.length
        ? await prisma.materialRequest.findMany({
            where: { id: { in: rmIds } },
            select: {
              id: true,
              requestNumber: true,
              status: true,
              items: {
                select: {
                  materialId: true,
                  quantity: true,
                  unit: true,
                  material: { select: { name: true, description: true } },
                },
              },
            },
          })
        : [];
      const rmPorId = new Map(rms.map((rm) => [rm.id, rm]));
      const itensOc = await itensOcPorRmMaterial(rmIds);
      // Pago = OC validada pelo compras no G4 (Anexar Nota Fiscal ou Finalizada), pelo IdMov.
      const validadasG4 = await idMovsValidadosComprasG4();

      // Quanto cada item da FD pediu de cada material na mesma RM (base do rateio do valor pago).
      const pedidoPorRmMaterial = new Map<string, number>();
      for (const p of itens) {
        for (const m of p.materiais) {
          const k = `${p.materialRequestId}|${m.materialId}`;
          pedidoPorRmMaterial.set(k, (pedidoPorRmMaterial.get(k) || 0) + m.quantity);
        }
      }

      const resumo = itens.map((it) => {
        const rm = rmPorId.get(it.materialRequestId);
        const ocsDoMaterial = (materialId: string, quantidadeItem: number) => {
          const k = `${it.materialRequestId}|${materialId}`;
          const linhas = itensOc.get(k) ?? [];
          const pedidoTotal = pedidoPorRmMaterial.get(k) || 0;
          const fator = pedidoTotal > 0 && quantidadeItem > 0 ? quantidadeItem / pedidoTotal : 1;
          const vistos = new Set<string>();
          return linhas
            .map((x) => x.oc)
            .filter((po) => (vistos.has(po.id) ? false : (vistos.add(po.id), true)))
            .map((po) => {
              const pago =
                po.totvsIdMov != null &&
                po.status !== 'CANCELLED' &&
                po.status !== 'REJECTED' &&
                validadasG4.has(po.totvsIdMov);
              const valorMaterial = linhas
                .filter((x) => x.oc.id === po.id)
                .reduce((s, x) => s + x.total, 0);
              return {
                orderNumber: po.orderNumber,
                status: po.status,
                totvsIdMov: po.totvsIdMov,
                totvsNumMovimento: po.totvsNumMovimento,
                pago,
                // Valor deste material nesta OC, rateado para o item da FD; só quando validado no G4.
                valorPago: pago ? Math.round(valorMaterial * fator * 100) / 100 : null,
              };
            });
        };
        // Registros antigos não guardavam os materiais: usa os itens da própria RM.
        const materiais = it.materiais.length
          ? it.materiais
          : (rm?.items ?? []).map((ri) => ({
              materialId: ri.materialId,
              materialLabel: ri.material?.name || ri.material?.description || '',
              quantity: Number(ri.quantity),
              unit: ri.unit,
            }));
        return {
          fdItemKey: it.fdItemKey,
          fdItem: it.fdItem,
          descricao: it.descricao,
          quantidadeFd: it.quantidadeFd,
          unidadeFd: it.unidadeFd,
          alertas: it.alertas,
          requestedAt: it.requestedAt,
          rm: rm
            ? { id: rm.id, requestNumber: rm.requestNumber, status: rm.status }
            : { id: it.materialRequestId, requestNumber: it.requestNumber, status: null },
          materiais: materiais.map((m) => ({ ...m, ocs: ocsDoMaterial(m.materialId, m.quantity) })),
        };
      });

      // Conferência do custo real: soma das OCs pagas (validadas no G4) da FD, cada OC uma vez, pelo total da OC.
      const ocsPagasPorId = new Map<string, { orderNumber: string; totvsIdMov: number; valor: number }>();
      for (const lista of itensOc.values()) {
        for (const { oc } of lista) {
          if (oc.totvsIdMov == null || oc.status === 'CANCELLED' || oc.status === 'REJECTED') continue;
          if (!validadasG4.has(oc.totvsIdMov) || ocsPagasPorId.has(oc.id)) continue;
          ocsPagasPorId.set(oc.id, { orderNumber: oc.orderNumber, totvsIdMov: oc.totvsIdMov, valor: oc.amountToPay });
        }
      }
      const ocsPagas = [...ocsPagasPorId.values()].sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
      const totalOcsPagas = Math.round(ocsPagas.reduce((s, o) => s + o.valor, 0) * 100) / 100;

      return res.json({
        success: true,
        data: { codFichaDemanda: fd.codFichaDemanda, itens: resumo, ocsPagas, totalOcsPagas },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao buscar resumo dos pedidos da FD' });
    }
  }

  /**
   * Obra da OS (detalhes da OS em Contratos): a informada ao iniciar/importar o orçamento vinculado
   * à OS (e aos aditivos). Orçamento antigo sem obra usa a obra das FDs geradas dele. Só leitura.
   */
  async obrasPorOrcamento(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const pleitoId = String(req.query.pleitoId ?? '').trim();
      const serviceOrderId = String(req.query.serviceOrderId ?? '').trim();
      let ids = String(req.query.ids ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 50);
      let centroCustoId = '';
      if (pleitoId || serviceOrderId) {
        // OS do contrato pelo id, ou a mais recente da ordem de serviço (formulário de RM).
        const selectOs = {
          obra: true,
          linkedOrcamentoId: true,
          budgetAdditives: true,
          updatedContract: { select: { costCenterId: true } },
        } as const;
        const os = pleitoId
          ? await prisma.pleito.findUnique({ where: { id: pleitoId }, select: selectOs })
          : await prisma.pleito.findFirst({
              where: { serviceOrderId },
              orderBy: { createdAt: 'desc' },
              select: selectOs,
            });
        // Obra informada no cadastro da OS tem prioridade.
        const obraDaOs = String(os?.obra || '').trim();
        if (obraDaOs) {
          return res.json({ success: true, data: [{ orcamentoId: '', codFichaDemanda: '', obra: obraDaOs }] });
        }
        const aditivos = Array.isArray(os?.budgetAdditives)
          ? (os!.budgetAdditives as Array<{ orcamentoId?: unknown }>).map((a) => String(a?.orcamentoId || ''))
          : [];
        ids = [...new Set([os?.linkedOrcamentoId || '', ...aditivos].map((x) => x.trim()).filter(Boolean))];
        centroCustoId = os?.updatedContract?.costCenterId || '';
      }
      if (!ids.length) return res.json({ success: true, data: [] });

      // Obra do próprio orçamento (índice de orçamentos do centro de custo).
      const obraDoOrcamento = new Map<string, string>();
      if (centroCustoId) {
        try {
          const index = await orcamentoService.getIndex(centroCustoId);
          for (const o of index.orcamentos) {
            const obra = String(o.obra || '').trim();
            if (obra && ids.includes(o.id)) obraDoOrcamento.set(o.id, obra);
          }
        } catch {
          /* sem índice: usa a obra das FDs */
        }
      }
      if (ids.every((id) => obraDoOrcamento.has(id))) {
        return res.json({
          success: true,
          data: ids.map((id) => ({ orcamentoId: id, codFichaDemanda: '', obra: obraDoOrcamento.get(id)! })),
        });
      }
      const fds = await prisma.demandSheetApproval.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: { codFichaDemanda: true, obra: true, anexos: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      // Orçamentos sem obra própria (antigos): obra das FDs geradas deles.
      const wanted = new Set(ids.filter((id) => !obraDoOrcamento.has(id)));
      const daFd = fds
        .map((fd) => {
          const ref = extractOrcamentoRefFromAnexos(fd.anexos);
          return ref && wanted.has(ref.orcamentoId)
            ? { orcamentoId: ref.orcamentoId, codFichaDemanda: fd.codFichaDemanda, obra: fd.obra?.trim() || '' }
            : null;
        })
        .filter((x): x is { orcamentoId: string; codFichaDemanda: string; obra: string } => !!x && !!x.obra);
      const data = [
        ...[...obraDoOrcamento].map(([orcamentoId, obra]) => ({ orcamentoId, codFichaDemanda: '', obra })),
        ...daFd,
      ];
      return res.json({ success: true, data });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao buscar a obra das FDs' });
    }
  }

  /** IDs das RMs criadas pela Ficha de Demanda — usado só para exibir a etiqueta "FD" na lista de RMs. */
  async listFdMaterialRequestIds(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const rows = await prisma.demandSheetApproval.findMany({
        where: { NOT: { itensPedidos: { equals: [] } } },
        select: { itensPedidos: true },
      });
      const ids = new Set<string>();
      for (const row of rows) {
        for (const it of parseItensPedidos(row.itensPedidos)) {
          if (it.materialRequestId) ids.add(it.materialRequestId);
        }
      }
      return res.json({ success: true, data: [...ids] });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao listar RMs da FD' });
    }
  }

  /** Nome do orçamento que gerou a FD (detalhes da FD). Só leitura. */
  async getOrcamentoDaFd(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const fd = await prisma.demandSheetApproval.findUnique({
        where: { id: String(req.params.id || '').trim() },
        select: { anexos: true },
      });
      if (!fd) throw createError('Ficha de demanda não encontrada', 404);

      const ref = extractOrcamentoRefFromAnexos(fd.anexos);
      if (!ref) return res.json({ success: true, data: null });

      let nome: string | null = null;
      let osNumeroPasta: string | null = null;
      try {
        const index = await orcamentoService.getIndex(ref.centroCustoId);
        const entry = index.orcamentos.find((o) => o.id === ref.orcamentoId);
        nome = entry?.nome ?? null;
        // OS e nº da pasta informados na importação do orçamento (mesmo formato do orçamento: "OS - Nº123").
        const os = String(entry?.osCodigo || '').trim();
        const pasta = String(entry?.numeroPasta || '').trim();
        osNumeroPasta = os && pasta ? `${os} - Nº${pasta}` : os || pasta || null;
      } catch {
        nome = null;
      }
      return res.json({
        success: true,
        data: { nome, osNumeroPasta, orcamentoId: ref.orcamentoId, centroCustoId: ref.centroCustoId },
      });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao buscar orçamento da FD' });
    }
  }

  /**
   * Custo real dos itens da FD a partir das OCs validadas pelo compras no G4 (Anexar Nota Fiscal ou Finalizada).
   * Cada material do item usa a quantidade e o valor unitário da OC. Se a RM juntou o mesmo material de
   * vários itens da FD, o que foi comprado é rateado pela quantidade pedida em cada item. Só leitura.
   */
  async getCustosReais(req: AuthRequest, res: Response) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const fd = await prisma.demandSheetApproval.findUnique({
        where: { id: String(req.params.id || '').trim() },
        select: { itensPedidos: true },
      });
      if (!fd) throw createError('Ficha de demanda não encontrada', 404);

      const itens = await calcularCustosReaisFd(fd.itensPedidos);
      return res.json({ success: true, data: { itens } });
    } catch (e: unknown) {
      const err = e as { statusCode?: number; message?: string };
      if (err?.statusCode) return res.status(err.statusCode).json({ error: err.message || 'Erro' });
      return res.status(500).json({ error: 'Erro ao calcular custos reais da FD' });
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
