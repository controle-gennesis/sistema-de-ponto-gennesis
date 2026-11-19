import { WebSocket } from 'ws';

/** Sockets da Agenda aberta (uma pessoa pode ter várias abas). */
const sockets = new Map<string, Set<WebSocket>>();

/**
 * Canal `/ws/calls?channel=agenda&token=..`: avisa a Agenda aberta que os eventos mudaram
 * (por exemplo, quando o Google avisa o servidor), para ela recarregar na hora.
 */
export function registerAgendaSocket(ws: WebSocket, userId: string): void {
  let set = sockets.get(userId);
  if (!set) {
    set = new Set();
    sockets.set(userId, set);
  }
  set.add(ws);

  ws.on('message', (raw) => {
    if (raw.toString() === 'ping' && ws.readyState === WebSocket.OPEN) ws.send('pong');
  });
  ws.on('close', () => {
    const cur = sockets.get(userId);
    if (!cur) return;
    cur.delete(ws);
    if (cur.size === 0) sockets.delete(userId);
  });
}

export function notifyAgendaChanged(userId: string): void {
  const set = sockets.get(userId);
  if (!set) return;
  const raw = JSON.stringify({ type: 'planner:changed' });
  for (const sock of set) {
    if (sock.readyState === WebSocket.OPEN) sock.send(raw);
  }
}
