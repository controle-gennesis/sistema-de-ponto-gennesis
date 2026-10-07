import { Response, NextFunction } from 'express';
import { Prisma, VehicleReservationStatus } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { assertUserHasVehicleReservationSuppliesAccess, userHasVehicleReservationSuppliesAccess } from '../lib/vehicleReservationSuppliesAccess';
import { PhotoService } from '../services/PhotoService';
import { findIdsByUnaccentSearch } from '../lib/normalizeSearchText';
import {
  parseVehicleReservationDateTime,
  vehicleReservationService,
} from '../services/VehicleReservationService';

const photoService = new PhotoService();

const reservationInclude = vehicleReservationService.include;

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

const parseDateTime = parseVehicleReservationDateTime;

function parseStatusFilter(value: unknown): VehicleReservationStatus[] | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return undefined;

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const statuses: VehicleReservationStatus[] = [];

  for (const part of parts) {
    if (Object.values(VehicleReservationStatus).includes(part as VehicleReservationStatus)) {
      statuses.push(part as VehicleReservationStatus);
    } else {
      throw createError('Status de filtro inválido', 400);
    }
  }

  return statuses.length ? statuses : undefined;
}

function parseImageContentType(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,/i);
  return match?.[1] || 'image/jpeg';
}

function parseDocumentContentType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || 'application/pdf';
}

function userOwnsReservation(
  reservation: { createdById: string | null; solicitante: string },
  user: { id: string; name?: string }
): boolean {
  if (reservation.createdById && reservation.createdById === user.id) return true;
  if (reservation.createdById) return false;
  const userName = String(user.name ?? '').trim().toLowerCase();
  const solicitante = reservation.solicitante.trim().toLowerCase();
  return userName.length > 0 && userName === solicitante;
}

/** Motorista é texto livre (sem vínculo de usuário) — só dá pra comparar pelo nome. */
function userIsReservationDriver(
  reservation: { motorista: string },
  user: { name?: string }
): boolean {
  const userName = String(user.name ?? '').trim().toLowerCase();
  const motorista = reservation.motorista.trim().toLowerCase();
  return userName.length > 0 && userName === motorista;
}

/** Quem pode dar baixa: admin, quem solicitou (criou/nome bate com solicitante) ou o motorista da reserva. */
function userCanSubmitReturn(
  reservation: { createdById: string | null; solicitante: string; motorista: string },
  user: { id: string; name?: string; isAdmin?: boolean }
): boolean {
  if (user.isAdmin) return true;
  if (userOwnsReservation(reservation, user)) return true;
  return userIsReservationDriver(reservation, user);
}

async function buildListWhere(
  query: AuthRequest['query'],
  ownership?: { userId: string; userName?: string | null }
): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {};
  const { search, status } = query;

  const statusFilter = parseStatusFilter(status);
  if (statusFilter?.length === 1) {
    where.status = statusFilter[0];
  } else if (statusFilter && statusFilter.length > 1) {
    where.status = { in: statusFilter };
  }

  if (search) {
    const term = String(search);
    const [reservationIds, vehicleIds] = await Promise.all([
      findIdsByUnaccentSearch({
        from: Prisma.sql`vehicle_reservations`,
        columns: [
          'code',
          'solicitante',
          'motorista',
          'atividade',
          '"localDestino"',
          'contrato',
          '"observacaoCapacidadeVeiculo"',
        ],
        search: term,
      }),
      findIdsByUnaccentSearch({
        from: Prisma.sql`vehicles`,
        columns: ['"placaVeic"', '"modeloVeic"'],
        search: term,
      }),
    ]);
    where.OR = [
      ...(reservationIds?.length ? [{ id: { in: reservationIds } }] : []),
      ...(vehicleIds?.length ? [{ vehicleId: { in: vehicleIds } }] : []),
      ...(!reservationIds?.length && !vehicleIds?.length
        ? [{ id: '__none__' }]
        : []),
    ];
  }

  if (ownership) {
    const userName = String(ownership.userName ?? '').trim();
    if (!userName) {
      where.id = { in: [] };
    } else {
      where.AND = [
        {
          OR: [
            { solicitante: { equals: userName, mode: 'insensitive' as const } },
            { motorista: { equals: userName, mode: 'insensitive' as const } },
          ],
        },
      ];
    }
  }

  return where;
}

export class VehicleReservationController {
  private async listReservations(
    req: AuthRequest,
    ownership?: { userId: string; userName?: string | null }
  ) {
    const { page = 1, limit = 20 } = req.query;
    const where = await buildListWhere(req.query, ownership);

    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 500);
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [reservations, total] = await Promise.all([
      prisma.vehicleReservation.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ createdAt: 'desc' }],
        include: reservationInclude,
      }),
      prisma.vehicleReservation.count({ where }),
    ]);

    return {
      success: true as const,
      data: reservations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  async getMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const profile = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { name: true },
      });
      const payload = await this.listReservations(req, {
        userId: req.user.id,
        userName: profile?.name,
      });
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);
      const payload = await this.listReservations(req);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const reservation = await prisma.vehicleReservation.findUnique({
        where: { id },
        include: reservationInclude
      });
      if (!reservation) throw createError('Reserva não encontrada', 404);
      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const reservation = await vehicleReservationService.create({
        solicitante: String(body.solicitante ?? ''),
        motorista: String(body.motorista ?? ''),
        atividade: String(body.atividade ?? ''),
        localDestino: String(body.localDestino ?? ''),
        dataUsoInicio: body.dataUsoInicio as string,
        dataUsoFim: body.dataUsoFim as string,
        periodoUso: body.periodoUso,
        polo: body.polo as string | null | undefined,
        contrato: body.contrato as string | null | undefined,
        observacaoCapacidadeVeiculo: body.observacaoCapacidadeVeiculo as
          | string
          | null
          | undefined,
        assinatura: body.assinatura as string | null | undefined,
        createdById: req.user?.id ?? null,
      });

      res.status(201).json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { id } = req.params;
      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.PENDING_SUPPLIES) {
        throw createError('Somente reservas pendentes podem ser excluídas', 400);
      }
      const canManageAll = await userHasVehicleReservationSuppliesAccess(
        req.user.id,
        req.user.isAdmin
      );
      if (!canManageAll && !userOwnsReservation(existing, req.user)) {
        throw createError('Você só pode excluir suas próprias reservas', 403);
      }

      await prisma.vehicleReservation.delete({ where: { id, status: existing.status } });
      res.json({ success: true, message: 'Reserva excluída com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const count = await prisma.vehicleReservation.count({
        where: {
          status: {
            in: [VehicleReservationStatus.PENDING_SUPPLIES, VehicleReservationStatus.COMPLETED]
          }
        }
      });
      res.json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async suppliesApprove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);

      const { id } = req.params;
      const comment = normalizeOptionalString(req.body?.comment);
      const vehicleId = normalizeOptionalString(req.body?.vehicleId);
      if (!vehicleId) throw createError('Selecione o veículo disponibilizado', 400);

      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, isActive: true }
      });
      if (!vehicle) throw createError('Veículo não encontrado ou inativo', 400);

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.PENDING_SUPPLIES) {
        throw createError('Esta reserva não está aguardando aprovação do Suprimentos', 400);
      }

      const vehicleInUse = await prisma.vehicleReservation.findFirst({
        where: {
          vehicleId,
          status: VehicleReservationStatus.APPROVED,
          NOT: { id }
        },
        select: {
          id: true,
          code: true,
          solicitante: true,
          motorista: true
        }
      });
      if (vehicleInUse) {
        const who =
          vehicleInUse.motorista || vehicleInUse.solicitante || 'outro colaborador';
        const codeLabel = vehicleInUse.code ? ` #${vehicleInUse.code}` : '';
        throw createError(
          `Este veículo já está em uso (reserva${codeLabel} — ${who}). Aguarde a devolução ou escolha outro.`,
          400
        );
      }

      const reservation = await prisma.vehicleReservation.update({
        where: { id, status: existing.status },
        data: {
          status: VehicleReservationStatus.APPROVED,
          vehicleId,
          suppliesApprovedById: req.user.id,
          suppliesApprovedAt: new Date(),
          suppliesApprovalComment: comment,
          suppliesRejectionReason: null
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);

      const { id } = req.params;
      const reason = normalizeOptionalString(req.body?.reason);
      if (!reason) throw createError('Informe o motivo da rejeição', 400);

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.PENDING_SUPPLIES) {
        throw createError('Esta reserva não está aguardando aprovação do Suprimentos', 400);
      }

      const reservation = await prisma.vehicleReservation.update({
        where: { id, status: existing.status },
        data: {
          status: VehicleReservationStatus.REJECTED,
          suppliesApprovedById: req.user.id,
          suppliesApprovedAt: new Date(),
          suppliesRejectionReason: reason,
          suppliesApprovalComment: null
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async submitReturn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const devolucaoAt = parseDateTime(req.body?.devolucaoAt, 'Data e hora da devolução');
      const baixaObservacao = normalizeOptionalString(req.body?.baixaObservacao);
      const baixaFoto = normalizeOptionalString(req.body?.baixaFoto);
      const baixaAssinatura = normalizeOptionalString(req.body?.baixaAssinatura);

      if (!baixaFoto || !baixaFoto.startsWith('data:image/')) {
        throw createError('Foto do veículo é obrigatória', 400);
      }
      if (!baixaAssinatura || !baixaAssinatura.startsWith('data:image/')) {
        throw createError('Assinatura da devolução é obrigatória', 400);
      }

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.APPROVED) {
        throw createError('Somente reservas aprovadas podem receber baixa', 400);
      }
      if (
        !userCanSubmitReturn(existing, {
          id: req.user.id,
          name: (
            await prisma.user.findUnique({
              where: { id: req.user.id },
              select: { name: true }
            })
          )?.name,
          isAdmin: req.user.isAdmin
        })
      ) {
        throw createError('Você não tem permissão para dar baixa nesta reserva', 403);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        baixaFoto,
        req.user.id,
        parseImageContentType(baixaFoto)
      );

      const reservation = await prisma.vehicleReservation.update({
        where: { id, status: existing.status },
        data: {
          status: VehicleReservationStatus.COMPLETED,
          devolucaoAt,
          baixaObservacao,
          baixaFotoUrl: upload.url,
          baixaFotoKey: upload.key,
          baixaAssinatura,
          baixaReportedAt: new Date(),
          baixaReportedById: req.user.id
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async submitInspection(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);

      const { id } = req.params;
      const vistoriaAt = parseDateTime(req.body?.vistoriaAt, 'Data e hora da vistoria');
      const laudoBase64 = normalizeOptionalString(req.body?.vistoriaLaudo);
      const laudoFileName = normalizeOptionalString(req.body?.vistoriaLaudoFileName) || 'laudo-vistoria.pdf';

      if (!laudoBase64 || !laudoBase64.startsWith('data:')) {
        throw createError('Laudo de vistoria é obrigatório', 400);
      }

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.COMPLETED) {
        throw createError('Somente reservas devolvidas podem receber vistoria', 400);
      }

      const contentType = parseDocumentContentType(laudoBase64);
      const upload = await photoService.uploadReservationLaudoFromBase64(
        laudoBase64,
        req.user.id,
        contentType,
        laudoFileName
      );

      const reservation = await prisma.vehicleReservation.update({
        where: { id, status: existing.status },
        data: {
          status: VehicleReservationStatus.INSPECTED,
          vistoriaAt,
          vistoriaLaudoUrl: upload.url,
          vistoriaLaudoKey: upload.key,
          vistoriaLaudoFileName: laudoFileName,
          vistoriaReportedAt: new Date(),
          vistoriaReportedById: req.user.id
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }
}
