import { WebSocket } from 'ws';
import { prisma } from '../lib/prisma';
import { OrcamentoService } from '../services/OrcamentoService';

let orcamentoService: OrcamentoService | null = null;

/** Cores das pessoas na grade (estilo Google Planilhas). */
const PRESENCE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#4f46e5',
  '#0d9488',
];

type PresenceSocket = WebSocket & { userId?: string };

type Presence = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  color: string;
  /** Aba aberta (montagem, memorial, analitico, fichaDemanda, cronograma...). */
  aba: string | null;
  /** Chave da linha em que a pessoa está. */
  rowKey: string | null;
  /** Coluna/campo em edição. */
  field: string | null;
  /** Está digitando agora. */
  editing: boolean;
};

const rooms = new Map<string, Map<PresenceSocket, Presence>>();

function roomKey(centroCustoId: string, orcamentoId: string): string {
  return `${centroCustoId}:${orcamentoId}`;
}

function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]!;
}

function str(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Uma entrada por pessoa (várias abas do navegador viram uma só, vale a mais recente). */
function listPresences(room: Map<PresenceSocket, Presence>): Presence[] {
  const byUser = new Map<string, Presence>();
  for (const presence of room.values()) byUser.set(presence.userId, presence);
  return [...byUser.values()];
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(room: Map<PresenceSocket, Presence>, payload: unknown, except?: WebSocket): void {
  const raw = JSON.stringify(payload);
  for (const sock of room.keys()) {
    if (sock !== except && sock.readyState === WebSocket.OPEN) sock.send(raw);
  }
}

/**
 * Canal `/ws/calls?channel=orcamento&centroCustoId=..&orcamentoId=..&token=..`:
 * quem está no orçamento, em qual aba/linha, e aviso quando alguém salva.
 */
export async function registerOrcamentoSocket(
  ws: PresenceSocket,
  userId: string,
  url: URL
): Promise<void> {
  const centroCustoId = str(url.searchParams.get('centroCustoId'));
  const orcamentoId = str(url.searchParams.get('orcamentoId'));
  if (!centroCustoId || !orcamentoId) {
    ws.close(4003, 'orcamento obrigatorio');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, profilePhotoUrl: true },
  });
  if (!user || ws.readyState !== WebSocket.OPEN) {
    ws.close(4004, 'usuario invalido');
    return;
  }

  // Revisão atual do orçamento: o cliente compara com a que ele carregou e se atualiza se estiver defasado.
  orcamentoService ??= new OrcamentoService();
  const arquivo = await orcamentoService.readOrcamentoFile(centroCustoId, orcamentoId).catch(() => null);
  if (ws.readyState !== WebSocket.OPEN) return;

  const key = roomKey(centroCustoId, orcamentoId);
  let room = rooms.get(key);
  if (!room) {
    room = new Map();
    rooms.set(key, room);
  }
  const presence: Presence = {
    userId,
    name: user.name,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    color: colorFor(userId),
    aba: null,
    rowKey: null,
    field: null,
    editing: false,
  };
  room.set(ws, presence);

  send(ws, {
    type: 'presence:list',
    selfId: userId,
    users: listPresences(room),
    revisao: typeof arquivo?.revisao === 'number' ? arquivo.revisao : 0,
    ultimaAlteracao: arquivo?.ultimaAlteracao ?? null,
  });
  broadcast(room, { type: 'presence:list', users: listPresences(room) }, ws);

  ws.on('message', (raw) => {
    const text = raw.toString();
    if (text === 'ping') {
      ws.send('pong');
      return;
    }
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (msg.type !== 'presence') return;
    presence.aba = str(msg.aba, 60);
    presence.rowKey = str(msg.rowKey, 200);
    presence.field = str(msg.field, 60);
    presence.editing = msg.editing === true;
    const current = rooms.get(key);
    if (current) broadcast(current, { type: 'presence:list', users: listPresences(current) });
  });

  ws.on('close', () => {
    const current = rooms.get(key);
    if (!current) return;
    current.delete(ws);
    if (current.size === 0) {
      rooms.delete(key);
      return;
    }
    broadcast(current, { type: 'presence:list', users: listPresences(current) });
  });
}

/** Avisa quem está no orçamento que alguém salvou (revisão nova). */
export function broadcastOrcamentoSalvo(
  centroCustoId: string,
  orcamentoId: string,
  info: { revisao: number; userId: string; userName: string }
): void {
  const room = rooms.get(roomKey(centroCustoId, orcamentoId));
  if (!room) return;
  broadcast(room, {
    type: 'orcamento:saved',
    revisao: info.revisao,
    by: { id: info.userId, name: info.userName },
    em: new Date().toISOString(),
  });
}
