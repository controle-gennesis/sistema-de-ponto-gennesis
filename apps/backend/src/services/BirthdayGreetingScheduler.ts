import cron from 'node-cron';
import { sendTodaysBirthdayGreetings } from '../lib/birthdayWhatsAppNotify';

/** Todo dia às 8h (horário de Brasília), manda parabéns por WhatsApp pra quem faz aniversário. */
export function startBirthdayGreetingScheduler(): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';
  cron.schedule(
    '0 8 * * *',
    () => {
      void sendTodaysBirthdayGreetings().catch(() => {});
    },
    { timezone: tz }
  );
}
