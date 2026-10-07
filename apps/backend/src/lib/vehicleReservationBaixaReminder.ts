import { VehicleReservationStatus } from '@prisma/client';
import { prisma } from './prisma';
import { metaWhatsApp } from '../services/MetaWhatsAppService';

/** Botão «Dar baixa» do lembrete (id da reserva no sufixo). */
export const VRR_CHECK_YES_PREFIX = 'vrr_chk_y_';
/** Botão «Depois» do lembrete. */
export const VRR_CHECK_NO_PREFIX = 'vrr_chk_n_';

export function parseVehicleBaixaReminderReply(
  content: string,
): { kind: 'yes' | 'no'; reservationId: string | null } | null {
  const c = content.trim();
  if (!c) return null;
  const lower = c.toLowerCase();
  if (lower.startsWith(VRR_CHECK_YES_PREFIX)) {
    return { kind: 'yes', reservationId: c.slice(VRR_CHECK_YES_PREFIX.length) || null };
  }
  if (lower.startsWith(VRR_CHECK_NO_PREFIX)) {
    return { kind: 'no', reservationId: c.slice(VRR_CHECK_NO_PREFIX.length) || null };
  }
  return null;
}

function formatVehicleLabel(vehicle?: {
  code?: string | null;
  marcaVeic?: string | null;
  modeloVeic?: string | null;
  placaVeic?: string | null;
} | null): string {
  if (!vehicle) return '—';
  const parts = [
    vehicle.placaVeic?.trim(),
    [vehicle.marcaVeic, vehicle.modeloVeic].filter(Boolean).join(' ').trim() || null,
  ].filter(Boolean);
  return parts.join(' · ') || vehicle.code || '—';
}

function formatBrDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Reservas APPROVED cujo fim de uso já passou, ainda sem baixa e sem lembrete enviado.
 * Roda a cada poucos minutos no scheduler.
 */
export async function sendVehicleReservationBaixaReminders(
  now = new Date(),
): Promise<{ sent: number }> {
  const rows = await prisma.vehicleReservation.findMany({
    where: {
      status: VehicleReservationStatus.APPROVED,
      dataUsoFim: { lte: now },
      baixaCheckRemindedAt: null,
      sourceWhatsAppPhone: { not: null },
    },
    select: {
      id: true,
      code: true,
      dataUsoFim: true,
      sourceWhatsAppPhone: true,
      vehicle: {
        select: {
          code: true,
          marcaVeic: true,
          modeloVeic: true,
          placaVeic: true,
        },
      },
    },
    orderBy: { dataUsoFim: 'asc' },
    take: 100,
  });

  let sent = 0;
  for (const row of rows) {
    const phone = row.sourceWhatsAppPhone?.trim();
    if (!phone) continue;

    const vehicleLabel = formatVehicleLabel(row.vehicle);
    const body = [
      `⏰ Reserva #${row.code} — horário de fim do uso chegou.`,
      '',
      `Veículo: ${vehicleLabel}`,
      `Fim previsto: ${formatBrDateTime(row.dataUsoFim)}`,
      '',
      'Ainda não foi dada a baixa. Toque em «Dar baixa» para registrar a devolução.',
    ].join('\n');

    let ok = false;
    try {
      ok = await metaWhatsApp.sendButtons(phone, body, [
        { id: `${VRR_CHECK_YES_PREFIX}${row.id}`, title: 'Dar baixa' },
        { id: `${VRR_CHECK_NO_PREFIX}${row.id}`, title: 'Depois' },
      ]);
    } catch (err) {
      console.error(`[VehicleBaixaReminder] WhatsApp #${row.code}:`, err);
    }

    if (!ok) continue;

    await prisma.vehicleReservation.update({
      where: { id: row.id },
      data: { baixaCheckRemindedAt: now },
    });
    sent += 1;
  }

  return { sent };
}
