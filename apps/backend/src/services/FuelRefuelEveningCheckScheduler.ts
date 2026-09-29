import cron from 'node-cron';
import { sendFuelRefuelEveningChecks } from '../lib/fuelRefuelEveningCheck';

/** Todo dia às 19h (Brasília): pergunta se abasteceu (prazo até 22:00). */
export function startFuelRefuelEveningCheckScheduler(): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';
  cron.schedule(
    '0 19 * * *',
    () => {
      void sendFuelRefuelEveningChecks()
        .then((r) => {
          if (r.sent > 0) {
            console.log(`[fuel-evening-check] lembretes enviados: ${r.sent}`);
          }
        })
        .catch((err) => {
          console.error('[fuel-evening-check] falha:', err);
        });
    },
    { timezone: tz }
  );
}
