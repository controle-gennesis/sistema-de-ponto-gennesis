import { Prisma, VehicleReservationStatus } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const PERIODO_USO_VALUES = new Set(['INTEGRAL', 'MATUTINO', 'VESPERTINO', 'NOTURNO']);

const reservationInclude = {
  vehicle: {
    select: {
      id: true,
      code: true,
      marcaVeic: true,
      modeloVeic: true,
      placaVeic: true,
    },
  },
  createdBy: { select: { id: true, name: true } },
  suppliesApprovedBy: { select: { id: true, name: true } },
  baixaReportedBy: { select: { id: true, name: true } },
  vistoriaReportedBy: { select: { id: true, name: true } },
} as const;

export type VehicleReservationWithRelations = Prisma.VehicleReservationGetPayload<{
  include: typeof reservationInclude;
}>;

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parsePeriodoUso(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map((item) => String(item).trim().toUpperCase())
    .filter((item) => PERIODO_USO_VALUES.has(item));
  return Array.from(new Set(items));
}

function parseDateOnly(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw createError(`${fieldLabel} é obrigatória`, 400);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw createError(`${fieldLabel} inválida`, 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createError(`${fieldLabel} inválida`, 400);
  }
  return date;
}

export function parseVehicleReservationDateTime(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw createError(`${fieldLabel} é obrigatória`, 400);

  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    const second = Number(localMatch[6] || 0);
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      throw createError(`${fieldLabel} inválida`, 400);
    }
    return date;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseDateOnly(raw, fieldLabel);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw createError(`${fieldLabel} inválida`, 400);
  return date;
}

export type CreateVehicleReservationInput = {
  solicitante: string;
  motorista: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: Date | string;
  dataUsoFim: Date | string;
  periodoUso?: unknown;
  polo?: string | null;
  contrato?: string | null;
  observacaoCapacidadeVeiculo?: string | null;
  assinatura?: string | null;
  createdById?: string | null;
  sourceWhatsAppPhone?: string | null;
};

export function buildVehicleReservationData(body: Record<string, unknown>) {
  const dataUsoInicio = parseVehicleReservationDateTime(body.dataUsoInicio, 'Data de uso (início)');
  const dataUsoFim = parseVehicleReservationDateTime(body.dataUsoFim, 'Data de uso (fim)');
  if (dataUsoFim < dataUsoInicio) {
    throw createError('Data final não pode ser anterior à data inicial', 400);
  }

  const assinatura = normalizeOptionalString(body.assinatura) || '';
  const motorista = normalizeOptionalString(body.motorista);
  const atividade = normalizeOptionalString(body.atividade);
  const localDestino = normalizeOptionalString(body.localDestino);
  const solicitante = normalizeOptionalString(body.solicitante);

  if (!solicitante) throw createError('Solicitante é obrigatório', 400);
  if (!motorista) throw createError('Motorista é obrigatório', 400);
  if (!atividade) throw createError('Atividade é obrigatória', 400);
  if (!localDestino) throw createError('Local de destino é obrigatório', 400);

  return {
    solicitante,
    motorista,
    atividade,
    localDestino,
    dataUsoInicio,
    dataUsoFim,
    periodoUso: parsePeriodoUso(body.periodoUso),
    polo: normalizeOptionalString(body.polo),
    contrato: normalizeOptionalString(body.contrato),
    observacaoCapacidadeVeiculo: normalizeOptionalString(body.observacaoCapacidadeVeiculo),
    assinatura,
  };
}

async function reserveReservationCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER) END
    ) AS max
    FROM vehicle_reservations
  `;

  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

export class VehicleReservationService {
  readonly include = reservationInclude;

  async create(input: CreateVehicleReservationInput): Promise<VehicleReservationWithRelations> {
    const parsed = buildVehicleReservationData({
      solicitante: input.solicitante,
      motorista: input.motorista,
      atividade: input.atividade,
      localDestino: input.localDestino,
      dataUsoInicio:
        input.dataUsoInicio instanceof Date
          ? toLocalDateTimeString(input.dataUsoInicio)
          : input.dataUsoInicio,
      dataUsoFim:
        input.dataUsoFim instanceof Date
          ? toLocalDateTimeString(input.dataUsoFim)
          : input.dataUsoFim,
      periodoUso: input.periodoUso ?? [],
      polo: input.polo,
      contrato: input.contrato,
      observacaoCapacidadeVeiculo: input.observacaoCapacidadeVeiculo,
      assinatura: input.assinatura ?? '',
    });

    const [code] = await reserveReservationCodes(1);
    if (!code) throw createError('Não foi possível gerar o código da reserva', 500);

    return prisma.vehicleReservation.create({
      data: {
        ...parsed,
        code,
        status: VehicleReservationStatus.PENDING_SUPPLIES,
        createdById: input.createdById ?? null,
        sourceWhatsAppPhone: normalizeOptionalString(input.sourceWhatsAppPhone),
      },
      include: reservationInclude,
    });
  }

  async listApprovedForWhatsAppPhone(phone: string) {
    const phoneTrim = phone.trim();
    if (!phoneTrim) return [];
    return prisma.vehicleReservation.findMany({
      where: {
        status: VehicleReservationStatus.APPROVED,
        sourceWhatsAppPhone: phoneTrim,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        code: true,
        motorista: true,
        solicitante: true,
        createdById: true,
        vehicle: {
          select: {
            id: true,
            code: true,
            marcaVeic: true,
            modeloVeic: true,
            placaVeic: true,
          },
        },
      },
    });
  }

  /**
   * Baixa via WhatsApp: foto já salva (URL/key), assinatura dispensada.
   */
  async submitReturnFromWhatsApp(input: {
    reservationId: string;
    phone: string;
    devolucaoAt: Date;
    baixaFotoUrl: string | null;
    baixaFotoKey: string | null;
    baixaObservacao?: string | null;
  }): Promise<VehicleReservationWithRelations> {
    const phone = input.phone.trim();
    if (!phone) throw createError('Telefone WhatsApp ausente', 400);
    if (
      !String(input.baixaFotoUrl || '').trim() &&
      !String(input.baixaFotoKey || '').trim()
    ) {
      throw createError('Foto do veículo é obrigatória', 400);
    }

    const existing = await prisma.vehicleReservation.findUnique({
      where: { id: input.reservationId },
    });
    if (!existing) throw createError('Reserva não encontrada', 404);
    if (existing.status !== VehicleReservationStatus.APPROVED) {
      throw createError('Somente reservas aprovadas podem receber baixa', 400);
    }
    if ((existing.sourceWhatsAppPhone || '').trim() !== phone) {
      throw createError('Você não tem permissão para dar baixa nesta reserva', 403);
    }

    return prisma.vehicleReservation.update({
      where: { id: existing.id, status: existing.status },
      data: {
        status: VehicleReservationStatus.COMPLETED,
        devolucaoAt: input.devolucaoAt,
        baixaObservacao: normalizeOptionalString(input.baixaObservacao),
        baixaFotoUrl: String(input.baixaFotoUrl || '').trim() || null,
        baixaFotoKey: String(input.baixaFotoKey || '').trim() || null,
        baixaAssinatura: '',
        baixaReportedAt: new Date(),
        baixaReportedById: existing.createdById,
      },
      include: reservationInclude,
    });
  }
}

function toLocalDateTimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export const vehicleReservationService = new VehicleReservationService();
