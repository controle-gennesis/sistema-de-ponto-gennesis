import cron from 'node-cron';

/**
 * Horários das sincronizações com o TOTVS RM: uma de madrugada e uma após 12:30, escalonadas
 * para não consultar tudo ao mesmo tempo (o servidor do RM cai com rajadas de requisições).
 * Fora destes horários, só o botão "Atualizar base" (ação do usuário) consulta o RM.
 * Produtos é a mais pesada: fica por último, com folga.
 */
export const SYNC_TOTVS_HORARIOS = {
  'supplier-totvs': { madrugada: '03:00', almoco: '12:30' },
  'payment-conditions-sync': { madrugada: '03:05', almoco: '12:35' },
  'stock-locations-sync': { madrugada: '03:10', almoco: '12:40' },
  'material-totvs': { madrugada: '03:20', almoco: '12:50' },
} as const;

export type SyncTotvsNome = keyof typeof SYNC_TOTVS_HORARIOS;

function cronDoHorario(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${m} ${h} * * *`;
}

export function agendarSincronizacaoTotvs(nome: SyncTotvsNome, run: () => void): void {
  const tz = process.env.TZ || 'America/Sao_Paulo';
  const { madrugada, almoco } = SYNC_TOTVS_HORARIOS[nome];
  cron.schedule(cronDoHorario(madrugada), run, { timezone: tz });
  cron.schedule(cronDoHorario(almoco), run, { timezone: tz });
  console.log(`[${nome}] agendado: ${madrugada} e ${almoco} (${tz}) — fora disso, só pelo botão "Atualizar base"`);
}
