import { metaWhatsApp } from '../services/MetaWhatsAppService';
import {
  notifyRequesterApprovedWhatsApp,
  notifyApprovalDecisionWhatsApp,
} from './approvalWhatsAppNotify';

function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, '');
}

async function postVehicleWhatsAppMessage(phone: string | null | undefined, text: string) {
  if (!phone?.trim()) return;
  try {
    await metaWhatsApp.sendText(phone.trim(), stripMarkdown(text));
  } catch (err) {
    console.error('[VehicleReservation] Falha ao enviar WhatsApp:', err);
  }
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
    vehicle.code ? `cód. ${vehicle.code}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
}

export async function notifyVehicleReservationApproved(params: {
  code: string;
  sourceWhatsAppPhone?: string | null;
  createdById?: string | null;
  approverUserId: string;
  vehicle?: {
    code?: string | null;
    marcaVeic?: string | null;
    modeloVeic?: string | null;
    placaVeic?: string | null;
  } | null;
  comment?: string | null;
}): Promise<void> {
  try {
    const vehicleLabel = formatVehicleLabel(params.vehicle);
    const waPhone = params.sourceWhatsAppPhone?.trim();

    if (waPhone) {
      const lines = [
        `✅ Reserva #${params.code} aprovada pelo Suprimentos.`,
        `Veículo: ${vehicleLabel}`,
      ];
      if (params.comment?.trim()) {
        lines.push(`Observação: ${params.comment.trim()}`);
      }
      lines.push(
        '',
        'Quando devolver o veículo, abra o menu e escolha «Dar baixa do veículo».',
        'Você também pode acompanhar em Frota no Conecta.',
      );
      await postVehicleWhatsAppMessage(waPhone, lines.join('\n'));
      return;
    }

    if (params.createdById) {
      await notifyRequesterApprovedWhatsApp({
        requesterUserId: params.createdById,
        approverUserId: params.approverUserId,
        subjectLine: `Reserva de veículo #${params.code} (${vehicleLabel})`,
      });
    }
  } catch (err) {
    console.error('[VehicleReservation] Falha ao notificar aprovação:', err);
  }
}

export async function notifyVehicleReservationRejected(params: {
  code: string;
  sourceWhatsAppPhone?: string | null;
  createdById?: string | null;
  reason: string;
}): Promise<void> {
  try {
    const waPhone = params.sourceWhatsAppPhone?.trim();
    const reason = params.reason.trim();

    if (waPhone) {
      await postVehicleWhatsAppMessage(
        waPhone,
        [
          `❌ Reserva #${params.code} não aprovada pelo Suprimentos.`,
          reason ? `Motivo: ${reason}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      return;
    }

    if (params.createdById) {
      await notifyApprovalDecisionWhatsApp(
        [params.createdById],
        `Reserva de veículo #${params.code}`,
        reason ? `Rejeitada. Motivo: ${reason}` : 'Rejeitada pelo Suprimentos.',
        false,
      );
    }
  } catch (err) {
    console.error('[VehicleReservation] Falha ao notificar rejeição:', err);
  }
}
