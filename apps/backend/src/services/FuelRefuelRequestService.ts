import {
  FuelRefuelRequestStatus,
  FuelTankLevelAfter,
  FuelVehicleType,
  Prisma,
} from '@prisma/client';
import { resolveFuelPhotoViewUrl } from '../lib/fuelPhotoStorage';
import { getFuelSatelliteCityByCode } from '../constants/fuelSatelliteCities';
import { getFuelGasStationForContract } from '../lib/fuelAdministrativeRegions';
import {
  computeRefuelDeadlineAtForDate,
  formatRefuelDeadlineLabel,
} from '../lib/fuelSuppliesSla';
import { prisma } from '../lib/prisma';
import { FUEL_LITERS_MAX } from '../lib/parseFlexibleDecimal';
import { findUserIdsMatchingSearch, findIdsByUnaccentSearch } from '../lib/normalizeSearchText';
import { assertWeeklyQuotaAvailable } from '../lib/fuelWeeklyQuota';
import {
  FUEL_OPEN_REQUEST_STATUSES,
  formatOpenFuelRequestBlockMessage,
} from '../lib/fuelRefuelChatNotify';
import { createError } from '../middleware/errorHandler';
import {
  notifyFuelRequesterApprovedBySupplies,
  notifyFuelRequesterRejectedByManager,
  notifyFuelRequesterRejectedBySupplies,
  notifyFuelRequesterReportCompleted,
  notifyFuelRequesterWaitingSupplies,
} from '../lib/fuelRefuelChatNotify';
import {
  buildApprovedByLine,
  getFuelApprovalNotifyUserIds,
  getFuelSuppliesQueueAccessUserIds,
  notifyApprovalDecisionWhatsApp,
  notifyNewPendingApprovalWhatsApp,
  notifyRequesterCancelledWhatsApp,
  resolveActorName,
} from '../lib/approvalWhatsAppNotify';

export type CreateFuelRefuelRequestInput = {
  requesterId: string;
  refuelDate: Date;
  route: string;
  satelliteCityCode?: string | null;
  administrativeRegionId?: string | null;
  contractId?: string | null;
  costCenter?: string | null;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType: FuelVehicleType;
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  dashboardPhotoName?: string | null;
  observations?: string | null;
  sourceChatId?: string | null;
  sourceWhatsAppPhone?: string | null;
  driverUserId?: string | null;
};

export type SuppliesApproveFuelRefuelInput = {
  gasStationId: string;
  releasedAmountReais: number;
  comment?: string | null;
};

const fuelRefuelInclude = {
  requester: { select: { id: true, name: true, email: true } },
  administrativeRegion: { select: { id: true, code: true, name: true, stateCode: true } },
  gasStation: { select: { id: true, displayNumber: true, name: true, address: true, cityCode: true } },
  contract: {
    select: {
      id: true,
      name: true,
      number: true,
      costCenter: { select: { id: true, code: true, name: true } },
    },
  },
  managerApprover: { select: { id: true, name: true } },
  suppliesApprover: { select: { id: true, name: true } },
} satisfies Prisma.FuelRefuelRequestInclude;

export type SubmitFuelRefuelReportInput = {
  requesterId: string;
  /** Quando true, Suprimentos pode informar o abastecimento em nome do solicitante. */
  allowNonRequester?: boolean;
  /**
   * Quando true, não envia a mensagem “Dados… recebidos” no chat/WhatsApp —
   * o fluxo (WhatsApp/Gennecy) já responde com a confirmação.
   */
  skipRequesterNotify?: boolean;
  requestId: string;
  odometerKm: number;
  tankLevelAfter: FuelTankLevelAfter;
  litersRefueled: number;
  pricePerLiter: number;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
  receiptPhotoName?: string | null;
  observations?: string | null;
};

function initialStatusForVehicleType(_vehicleType: FuelVehicleType): FuelRefuelRequestStatus {
  // Particular e frota: ambos passam pelo gestor antes do Suprimentos.
  return FuelRefuelRequestStatus.PENDING_MANAGER;
}

type FuelPhotoFields = {
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
};

async function presentFuelRowPhotos<T extends FuelPhotoFields & { satelliteCityCode?: string | null; administrativeRegion?: { code: string; name: string; stateCode: string } | null }>(row: T) {
  const [dashboardPhotoViewUrl, receiptPhotoViewUrl] = await Promise.all([
    resolveFuelPhotoViewUrl(row.dashboardPhotoUrl, row.dashboardPhotoKey),
    resolveFuelPhotoViewUrl(row.receiptPhotoUrl, row.receiptPhotoKey),
  ]);

  const city = row.satelliteCityCode ? getFuelSatelliteCityByCode(row.satelliteCityCode) : null;
  const administrativeRegion = city
    ? { id: city.code, code: city.code, name: city.name, stateCode: city.stateCode }
    : row.administrativeRegion ?? null;

  return {
    ...row,
    administrativeRegion,
    dashboardPhotoViewUrl,
    receiptPhotoViewUrl,
  };
}

async function attachReleasedAmounts<T extends { id: string }>(
  rows: T[]
): Promise<Array<T & { releasedAmountReais: number | null }>> {
  if (rows.length === 0) return [];
  try {
    const extras = await prisma.$queryRaw<Array<{ id: string; amount: unknown }>>`
      SELECT id, "releasedAmountReais" AS amount
      FROM "fuel_refuel_requests"
      WHERE id IN (${Prisma.join(rows.map((row) => row.id))})
    `;
    const byId = new Map(
      extras.map((row) => {
        const n = row.amount == null ? null : Number(row.amount);
        return [row.id, n != null && Number.isFinite(n) ? n : null] as const;
      })
    );
    return rows.map((row) => ({
      ...row,
      releasedAmountReais: byId.get(row.id) ?? null,
    }));
  } catch {
    return rows.map((row) => ({ ...row, releasedAmountReais: null }));
  }
}

async function presentFuelRowsPhotos<T extends FuelPhotoFields & { id: string }>(rows: T[]) {
  const withPhotos = await Promise.all(rows.map((row) => presentFuelRowPhotos(row)));
  return attachReleasedAmounts(withPhotos);
}

export class FuelRefuelRequestService {
  async findOpenRequestsForDriver(opts: {
    driverUserId?: string | null;
    driverName: string;
  }) {
    const driverName = opts.driverName.trim();
    const driverUserId = opts.driverUserId?.trim() || '';
    const or: Prisma.FuelRefuelRequestWhereInput[] = [];
    if (driverUserId) or.push({ requesterId: driverUserId });
    if (driverName) {
      or.push({ driverName: { equals: driverName, mode: 'insensitive' } });
    }
    if (!or.length) return [];

    return prisma.fuelRefuelRequest.findMany({
      where: {
        status: { in: FUEL_OPEN_REQUEST_STATUSES },
        OR: or,
      },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        status: true,
        vehiclePlate: true,
        driverName: true,
        requesterId: true,
      },
    });
  }

  async create(input: CreateFuelRefuelRequestInput) {
    const costCenter = input.costCenter?.trim() || null;
    const contractId = input.contractId?.trim() || null;

    if (!contractId) {
      throw createError('Contrato é obrigatório', 400);
    }

    const openRequests = await this.findOpenRequestsForDriver({
      driverUserId: input.driverUserId,
      driverName: input.driverName,
    });
    if (openRequests.length) {
      throw createError(
        formatOpenFuelRequestBlockMessage({
          driverName: input.driverName.trim(),
          requests: openRequests,
        }),
        400,
      );
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, name: true, number: true },
    });
    if (!contract) throw createError('Contrato não encontrado', 404);

    await assertWeeklyQuotaAvailable(contract.id);

    const costCenterLabel =
      costCenter || contract.name.trim() || contract.number;

    const satelliteCityCode = input.satelliteCityCode?.trim().toUpperCase() || null;
    if (satelliteCityCode && !getFuelSatelliteCityByCode(satelliteCityCode)) {
      throw createError('Cidade satélite inválida', 400);
    }

    const administrativeRegionId = input.administrativeRegionId?.trim() || null;

    const row = await prisma.$transaction(async (tx) => {
      const agg = await tx.fuelRefuelRequest.aggregate({ _max: { displayNumber: true } });
      const nextDisplay = (agg._max.displayNumber ?? 0) + 1;

      return tx.fuelRefuelRequest.create({
        data: {
          displayNumber: nextDisplay,
          requesterId: input.requesterId,
          refuelDate: input.refuelDate,
          route: input.route.trim(),
          satelliteCityCode,
          administrativeRegionId,
          costCenter: costCenterLabel,
          contractId: contract.id,
          driverName: input.driverName.trim(),
          vehiclePlate: input.vehiclePlate.trim(),
          vehicleDescription: input.vehicleDescription?.trim() || null,
          vehicleType: input.vehicleType,
          dashboardPhotoUrl: input.dashboardPhotoUrl || null,
          dashboardPhotoKey: input.dashboardPhotoKey || null,
          dashboardPhotoName: input.dashboardPhotoName || null,
          observations: input.observations?.trim() || null,
          sourceChatId: input.sourceChatId || null,
          sourceWhatsAppPhone: input.sourceWhatsAppPhone || null,
          status: initialStatusForVehicleType(input.vehicleType),
        },
        include: fuelRefuelInclude,
      });
    });

    const approverIds = await getFuelApprovalNotifyUserIds(contract.id);
    void notifyNewPendingApprovalWhatsApp(
      approverIds,
      `Solicitação de abastecimento #${row.displayNumber} · Motorista: ${row.driverName}`
    );

    return row;
  }

  /** Resumo no contrato: liberações que entram na cota (Liberado na aba Contratos). */
  async listForContractResumo(contractId: string) {
    const id = contractId.trim();
    if (!id) return [];
    const rows = await prisma.fuelRefuelRequest.findMany({
      where: {
        contractId: id,
        status: {
          in: [
            FuelRefuelRequestStatus.APPROVED,
            FuelRefuelRequestStatus.AWAITING_REFUEL,
            FuelRefuelRequestStatus.COMPLETED,
          ],
        },
      },
      include: fuelRefuelInclude,
      orderBy: [{ suppliesApprovedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return presentFuelRowsPhotos(rows);
  }

  async listForSupplies(params: {
    search?: string;
    status?: FuelRefuelRequestStatus;
    statuses?: FuelRefuelRequestStatus[];
    requesterId?: string;
    queue?: 'supplies' | 'all';
  }) {
    const where: Prisma.FuelRefuelRequestWhereInput = {};

    if (params.statuses?.length) {
      where.status = { in: params.statuses };
    } else if (params.queue === 'supplies') {
      where.status = FuelRefuelRequestStatus.PENDING_SUPPLIES;
    } else if (params.status) {
      where.status = params.status;
    }

    if (params.requesterId) where.requesterId = params.requesterId;

    const search = params.search?.trim();
    if (search) {
      const asNumber = parseInt(search, 10);
      const [matchedRequesterIds, fuelIds, contractIds] = await Promise.all([
        findUserIdsMatchingSearch(search),
        findIdsByUnaccentSearch({
          from: Prisma.sql`fuel_refuel_requests`,
          columns: ['route', '"driverName"', '"vehiclePlate"', '"costCenter"'],
          search,
        }),
        findIdsByUnaccentSearch({
          from: Prisma.sql`contracts`,
          columns: ['name', 'number'],
          search,
        }),
      ]);
      where.OR = [
        ...(fuelIds?.length ? [{ id: { in: fuelIds } }] : []),
        {
          requesterId: {
            in: matchedRequesterIds.length > 0 ? matchedRequesterIds : ['__none__'],
          },
        },
        ...(contractIds?.length ? [{ contractId: { in: contractIds } }] : []),
        ...(Number.isFinite(asNumber) ? [{ displayNumber: asNumber }] : []),
        ...(!fuelIds?.length &&
        !matchedRequesterIds.length &&
        !contractIds?.length &&
        !Number.isFinite(asNumber)
          ? [{ id: '__none__' }]
          : []),
      ];
    }

    const rows = await prisma.fuelRefuelRequest.findMany({
      where,
      include: fuelRefuelInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return presentFuelRowsPhotos(rows);
  }

  async getById(id: string) {
    const row = await prisma.fuelRefuelRequest.findUnique({
      where: { id },
      include: fuelRefuelInclude,
    });
    if (!row) throw createError('Solicitação não encontrada', 404);
    return row;
  }

  async getByIdForApi(id: string) {
    const presented = await presentFuelRowPhotos(await this.getById(id));
    const [withAmount] = await attachReleasedAmounts([presented]);
    return withAmount;
  }

  async adminUpdateContract(id: string, contractId: string) {
    const row = await this.getById(id);
    const editable: FuelRefuelRequestStatus[] = [
      FuelRefuelRequestStatus.PENDING_MANAGER,
      FuelRefuelRequestStatus.PENDING_SUPPLIES,
    ];
    if (!editable.includes(row.status)) {
      throw createError('Só é possível editar solicitações pendentes de análise', 400);
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId.trim() },
      select: { id: true, name: true, number: true },
    });
    if (!contract) throw createError('Contrato não encontrado', 404);

    const costCenterLabel = contract.name.trim() || contract.number;

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id },
      data: {
        contractId: contract.id,
        costCenter: costCenterLabel,
      },
      include: fuelRefuelInclude,
    });

    return presentFuelRowPhotos(updated);
  }

  async managerApprove(id: string, managerId: string, comment?: string) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_MANAGER) {
      throw createError('Esta solicitação não está aguardando aprovação', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      // Compare-and-swap: evita duplo clique/duas aprovações concorrentes decidirem a mesma
      // solicitação ao mesmo tempo — se o status mudou entre o read acima e agora, o Prisma
      // lança P2025 (tratado como 409 pelo errorHandler global) em vez de sobrescrever.
      where: { id, status: row.status },
      data: {
        status: FuelRefuelRequestStatus.PENDING_SUPPLIES,
        managerApprovedBy: managerId,
        managerApprovedAt: new Date(),
        managerApprovalComment: comment?.trim() || null,
      },
      include: fuelRefuelInclude,
    });

    const approvedByLine = await buildApprovedByLine(updated.requesterId, managerId);
    await notifyFuelRequesterWaitingSupplies(
      updated.sourceChatId,
      updated.displayNumber,
      updated.sourceWhatsAppPhone,
      approvedByLine,
    );

    if (updated.contractId) {
      const approverName = await resolveActorName(managerId);
      const gestorApproverIds = await getFuelApprovalNotifyUserIds(updated.contractId);
      void notifyApprovalDecisionWhatsApp(
        gestorApproverIds,
        `Solicitação de abastecimento #${updated.displayNumber}`,
        `Aprovada pelo gestor (${approverName}). Encaminhada para o Suprimentos.`,
        true
      );
    }

    const queueUserIds = await getFuelSuppliesQueueAccessUserIds();
    void notifyNewPendingApprovalWhatsApp(
      queueUserIds,
      `Solicitação de abastecimento #${updated.displayNumber} · ${updated.driverName} — aguardando Suprimentos`
    );

    return updated;
  }

  async managerReject(id: string, managerId: string, reason: string) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_MANAGER) {
      throw createError('Esta solicitação não está aguardando aprovação', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id, status: row.status },
      data: {
        status: FuelRefuelRequestStatus.REJECTED,
        managerApprovedBy: managerId,
        managerApprovedAt: new Date(),
        managerRejectionReason: reason.trim(),
      },
      include: fuelRefuelInclude,
    });

    await notifyFuelRequesterRejectedByManager(
      updated.sourceChatId,
      updated.displayNumber,
      reason,
      updated.sourceWhatsAppPhone,
    );

    if (updated.contractId) {
      const rejecterName = await resolveActorName(managerId);
      const gestorApproverIds = await getFuelApprovalNotifyUserIds(updated.contractId);
      void notifyApprovalDecisionWhatsApp(
        gestorApproverIds,
        `Solicitação de abastecimento #${updated.displayNumber}`,
        `Rejeitada pelo gestor (${rejecterName}).`,
        false
      );
    }

    return updated;
  }

  async cancel(id: string, actorId: string, opts?: { asSupplies?: boolean }) {
    const row = await this.getById(id);
    if (opts?.asSupplies) {
      if (row.status !== FuelRefuelRequestStatus.AWAITING_REFUEL) {
        throw createError('Só é possível cancelar solicitações com status Liberado', 400);
      }
    } else {
      if (row.requesterId !== actorId) {
        throw createError('Você não pode cancelar esta solicitação', 403);
      }
      if (row.status !== FuelRefuelRequestStatus.PENDING_MANAGER) {
        throw createError('Só é possível cancelar solicitações pendentes de aprovação do gestor', 400);
      }
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id, status: row.status },
      data: { status: FuelRefuelRequestStatus.CANCELLED },
      include: fuelRefuelInclude,
    });

    void notifyRequesterCancelledWhatsApp({
      requesterUserId: updated.requesterId,
      actorUserId: actorId,
      subjectLine: `Solicitação de abastecimento #${updated.displayNumber}`,
    });

    return updated;
  }

  /** Cancelamento automático (lembrete 19h / Gennecy) enquanto aguarda informe do abastecimento. */
  async cancelAwaitingRefuelBySystem(
    id: string,
    reason: string,
    opts?: { silentNotify?: boolean },
  ) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.AWAITING_REFUEL) {
      throw createError('Esta solicitação não está aguardando abastecimento', 400);
    }

    const reasonText = reason.trim() || 'Cancelada automaticamente.';
    const updated = await prisma.fuelRefuelRequest.update({
      where: { id, status: row.status },
      data: {
        status: FuelRefuelRequestStatus.CANCELLED,
        suppliesApprovalComment: row.suppliesApprovalComment?.trim()
          ? `${row.suppliesApprovalComment.trim()}\n\n[Cancelamento automático] ${reasonText}`
          : `[Cancelamento automático] ${reasonText}`,
      },
      include: fuelRefuelInclude,
    });

    if (!opts?.silentNotify) {
      const { postFuelChatMessage, postFuelWhatsAppMessage } = await import('../lib/fuelRefuelChatNotify');
      const msg = [
        `❌ Solicitação #${updated.displayNumber} cancelada.`,
        reasonText,
      ].join('\n');
      await postFuelChatMessage(updated.sourceChatId, msg);
      await postFuelWhatsAppMessage(updated.sourceWhatsAppPhone, msg);
    }

    return updated;
  }

  async countPendingManager(
    contractScope?: Prisma.FuelRefuelRequestWhereInput,
  ): Promise<number> {
    return prisma.fuelRefuelRequest.count({
      where: {
        status: FuelRefuelRequestStatus.PENDING_MANAGER,
        ...contractScope,
      },
    });
  }

  async countPendingSupplies(): Promise<number> {
    return prisma.fuelRefuelRequest.count({
      where: { status: FuelRefuelRequestStatus.PENDING_SUPPLIES },
    });
  }

  async suppliesApprove(
    id: string,
    suppliesUserId: string,
    input: SuppliesApproveFuelRefuelInput,
  ) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_SUPPLIES) {
      throw createError('Esta solicitação não está aguardando aprovação do Suprimentos', 400);
    }
    const contractId = row.contractId?.trim() || null;
    if (!contractId) {
      throw createError('Solicitação sem contrato definido', 400);
    }

    const gasStation = await getFuelGasStationForContract(input.gasStationId, contractId);
    if (!gasStation) {
      throw createError('Selecione um posto vinculado ao contrato da solicitação', 400);
    }

    const releasedAmountReais = Number(input.releasedAmountReais);
    if (!Number.isFinite(releasedAmountReais) || releasedAmountReais <= 0) {
      throw createError('Informe o valor que será liberado', 400);
    }

    const refuelDeadlineAt = computeRefuelDeadlineAtForDate(row.refuelDate);

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id, status: row.status },
      data: {
        status: FuelRefuelRequestStatus.AWAITING_REFUEL,
        gasStationId: gasStation.id,
        refuelDeadlineAt,
        refuelDeadlineAmount: null,
        refuelDeadlineUnit: null,
        suppliesApprovedBy: suppliesUserId,
        suppliesApprovedAt: new Date(),
        suppliesApprovalComment: input.comment?.trim() || null,
      },
      include: fuelRefuelInclude,
    });

    await prisma.$executeRawUnsafe(
      `
        UPDATE "fuel_refuel_requests"
        SET "releasedAmountReais" = $1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      releasedAmountReais,
      updated.id
    );

    await notifyFuelRequesterApprovedBySupplies(
      updated.sourceChatId,
      updated.displayNumber,
      {
        gasStationName: gasStation.name,
        gasStationAddress: gasStation.address,
        refuelDeadlineLabel: formatRefuelDeadlineLabel(),
        refuelDeadlineAt,
        comment: updated.suppliesApprovalComment,
      },
      updated.sourceWhatsAppPhone,
    );

    return this.getByIdForApi(updated.id);
  }

  async suppliesReject(id: string, suppliesUserId: string, reason: string) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_SUPPLIES) {
      throw createError('Esta solicitação não está aguardando aprovação do Suprimentos', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id, status: row.status },
      data: {
        status: FuelRefuelRequestStatus.REJECTED,
        suppliesApprovedBy: suppliesUserId,
        suppliesApprovedAt: new Date(),
        suppliesRejectionReason: reason.trim(),
      },
      include: fuelRefuelInclude,
    });

    await notifyFuelRequesterRejectedBySupplies(
      updated.sourceChatId,
      updated.displayNumber,
      reason,
      updated.sourceWhatsAppPhone,
    );

    return updated;
  }

  async listAwaitingRefuelForRequester(requesterId: string) {
    const user = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { name: true },
    });
    const driverName = user?.name?.trim() || '';
    return prisma.fuelRefuelRequest.findMany({
      where: {
        status: FuelRefuelRequestStatus.AWAITING_REFUEL,
        OR: [
          { requesterId },
          ...(driverName
            ? [{ driverName: { equals: driverName, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        vehiclePlate: true,
        driverName: true,
        refuelDate: true,
        requesterId: true,
      },
    });
  }

  async listAwaitingRefuelForWhatsAppPhone(phone: string, extra?: { requestId?: string | null }) {
    const requestId = extra?.requestId?.trim() || '';
    return prisma.fuelRefuelRequest.findMany({
      where: {
        status: FuelRefuelRequestStatus.AWAITING_REFUEL,
        OR: [
          { sourceWhatsAppPhone: phone },
          ...(requestId ? [{ id: requestId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        vehiclePlate: true,
        driverName: true,
        refuelDate: true,
        requesterId: true,
      },
    });
  }

  async submitRefuelReport(input: SubmitFuelRefuelReportInput) {
    const row = await this.getById(input.requestId);
    if (row.requesterId !== input.requesterId && !input.allowNonRequester) {
      throw createError('Você não pode informar abastecimento desta solicitação', 403);
    }
    if (row.status !== FuelRefuelRequestStatus.AWAITING_REFUEL) {
      throw createError('Esta solicitação não está aguardando dados do abastecimento', 400);
    }

    if (!String(input.receiptPhotoUrl || '').trim() && !String(input.receiptPhotoKey || '').trim()) {
      throw createError('Foto do cupom fiscal é obrigatória', 400);
    }
    if (!(input.litersRefueled > 0) || input.litersRefueled > FUEL_LITERS_MAX) {
      throw createError(
        `Litros inválidos (máximo ${FUEL_LITERS_MAX} L). Use ponto ou vírgula como decimal.`,
        400,
      );
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id: input.requestId },
      data: {
        status: FuelRefuelRequestStatus.COMPLETED,
        refuelReportedAt: new Date(),
        odometerKm: input.odometerKm,
        tankLevelAfter: input.tankLevelAfter,
        litersRefueled: input.litersRefueled,
        pricePerLiter: input.pricePerLiter,
        receiptPhotoUrl: input.receiptPhotoUrl?.trim() || null,
        receiptPhotoKey: input.receiptPhotoKey || null,
        receiptPhotoName: input.receiptPhotoName || null,
        refuelReportObservations: input.observations?.trim() || null,
      },
      include: fuelRefuelInclude,
    });

    if (!input.skipRequesterNotify) {
      await notifyFuelRequesterReportCompleted(
        updated.sourceChatId,
        updated.displayNumber,
        updated.sourceWhatsAppPhone,
      );
    }
    return updated;
  }

  async updateReceiptPhoto(input: {
    requestId: string;
    receiptPhotoUrl: string;
    receiptPhotoKey: string | null;
    receiptPhotoName: string | null;
  }) {
    const row = await this.getById(input.requestId);
    if (row.status !== FuelRefuelRequestStatus.COMPLETED) {
      throw createError('Só é possível alterar o cupom de uma solicitação concluída', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id: input.requestId },
      data: {
        receiptPhotoUrl: input.receiptPhotoUrl.trim() || null,
        receiptPhotoKey: input.receiptPhotoKey,
        receiptPhotoName: input.receiptPhotoName,
      },
      include: fuelRefuelInclude,
    });
    return updated;
  }

  async listForManagerApprovals(params: {
    phase: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
    contractScope: Prisma.FuelRefuelRequestWhereInput;
  }) {
    const phaseFilter: Prisma.FuelRefuelRequestWhereInput =
      params.phase === 'PENDING'
        ? {
            status: FuelRefuelRequestStatus.PENDING_MANAGER,
          }
        : params.phase === 'APPROVED'
          ? {
              managerApprovedAt: { not: null },
              status: {
                notIn: [
                  FuelRefuelRequestStatus.REJECTED,
                  FuelRefuelRequestStatus.CANCELLED,
                  FuelRefuelRequestStatus.PENDING_MANAGER,
                ],
              },
            }
          : params.phase === 'REJECTED'
            ? {
                OR: [
                  { status: FuelRefuelRequestStatus.REJECTED },
                  { status: FuelRefuelRequestStatus.CANCELLED },
                ],
              }
            : {
                OR: [
                  { status: FuelRefuelRequestStatus.PENDING_MANAGER },
                  {
                    managerApprovedAt: { not: null },
                    status: {
                      notIn: [
                        FuelRefuelRequestStatus.REJECTED,
                        FuelRefuelRequestStatus.CANCELLED,
                        FuelRefuelRequestStatus.PENDING_MANAGER,
                      ],
                    },
                  },
                  { status: FuelRefuelRequestStatus.REJECTED },
                  { status: FuelRefuelRequestStatus.CANCELLED },
                ],
              };

    const rows = await prisma.fuelRefuelRequest.findMany({
      where: { ...phaseFilter, ...params.contractScope },
      include: fuelRefuelInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return presentFuelRowsPhotos(rows);
  }

  /** Solicitantes que já pediram combustível e não têm telefone utilizável. */
  async listRequestersMissingPhone(): Promise<Array<{ userId: string; name: string }>> {
    const users = await prisma.user.findMany({
      where: { fuelRefuelRequestsRequested: { some: {} } },
      select: {
        id: true,
        name: true,
        employee: { select: { phone: true } },
        fuelRefuelRequestsRequested: {
          where: {
            sourceWhatsAppPhone: { not: null },
          },
          select: { sourceWhatsAppPhone: true },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });

    return users
      .filter((u) => {
        if (hasUsablePhoneDigits(u.employee?.phone)) return false;
        return !u.fuelRefuelRequestsRequested.some((r) =>
          hasUsablePhoneDigits(r.sourceWhatsAppPhone),
        );
      })
      .map((u) => ({ userId: u.id, name: u.name }));
  }

  /**
   * Cadastra telefone do solicitante (Employee.phone) e preenche
   * sourceWhatsAppPhone nas solicitações que ainda estão sem número.
   */
  async setRequesterPhones(
    items: Array<{ userId: string; phone: string }>,
  ): Promise<{ updated: number }> {
    let updated = 0;
    for (const item of items) {
      const userId = String(item.userId || '').trim();
      const phoneDigits = normalizeBrPhoneDigits(item.phone);
      if (!userId || !hasUsablePhoneDigits(phoneDigits)) {
        throw createError(
          'Informe um telefone válido com DDD (10 ou 11 dígitos) para cada pessoa.',
          400,
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          employee: { select: { id: true } },
          fuelRefuelRequestsRequested: { select: { id: true }, take: 1 },
        },
      });
      if (!user || user.fuelRefuelRequestsRequested.length === 0) {
        throw createError('Solicitante sem histórico de abastecimento', 404);
      }

      if (user.employee) {
        await prisma.employee.update({
          where: { id: user.employee.id },
          data: { phone: phoneDigits },
        });
      }

      await prisma.fuelRefuelRequest.updateMany({
        where: {
          requesterId: userId,
          OR: [{ sourceWhatsAppPhone: null }, { sourceWhatsAppPhone: '' }],
        },
        data: { sourceWhatsAppPhone: phoneDigits },
      });
      updated += 1;
    }
    return { updated };
  }
}

function normalizeBrPhoneDigits(raw: string): string {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits;
}

function hasUsablePhoneDigits(value: string | null | undefined): boolean {
  const digits = normalizeBrPhoneDigits(value || '');
  return digits.length >= 10 && digits.length <= 11;
}

export const fuelRefuelRequestService = new FuelRefuelRequestService();
