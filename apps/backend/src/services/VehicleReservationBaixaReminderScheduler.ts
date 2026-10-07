import cron from 'node-cron';
import { sendVehicleReservationBaixaReminders } from '../lib/vehicleReservationBaixaReminder';

/** A cada 5 min: se o fim do uso passou e ainda não deu baixa, avisa no WhatsApp. */
export function startVehicleReservationBaixaReminderScheduler(): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';
  cron.schedule(
    '*/5 * * * *',
    () => {
      void sendVehicleReservationBaixaReminders()
        .then((r) => {
          if (r.sent > 0) {
            console.log(`[vehicle-baixa-reminder] lembretes enviados: ${r.sent}`);
          }
        })
        .catch((err) => {
          console.error('[vehicle-baixa-reminder] falha:', err);
        });
    },
    { timezone: tz },
  );
}
