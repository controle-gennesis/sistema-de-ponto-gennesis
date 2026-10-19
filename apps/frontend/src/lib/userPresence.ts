/** Janela em que o último sinal (heartbeat/navegação) ainda conta como online. */
export const USER_ONLINE_WINDOW_MS = 3 * 60_000;

/** Intervalo do batimento enviado pelo navegador e da atualização das listas. */
export const USER_PRESENCE_INTERVAL_MS = 60_000;

export function isUserOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= USER_ONLINE_WINDOW_MS;
}
