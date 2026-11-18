import { NextFunction, Request, Response } from 'express';
import { WebSocket } from 'ws';
import { prisma } from '../lib/prisma';
import { KanbanService } from '../services/KanbanService';

const kanbanService = new KanbanService();

/** Cores das pessoas no quadro (mesma ideia da presença do orçamento). */
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
  /** Cartão em que a pessoa está (aberto ou arrastando). */
  cardId: string | null;
  /** `viewing`: só olhando o quadro; `editing`: cartão aberto; `dragging`: arrastando o cartão. */
  state: 'viewing' | 'editing' | 'dragging';
};

const rooms = new Map<string, Map<PresenceSocket, Presence>>();

function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]!;
}

function str(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

/** Uma entrada por pessoa (várias abas viram uma só; vale a que está num cartão, senão a mais recente). */
function listPresences(room: Map<PresenceSocket, Presence>): Presence[] {
  const byUser = new Map<string, Presence>();
  for (const presence of room.values()) {
    const prev = byUser.get(presence.userId);
    if (!prev || presence.cardId || !prev.cardId) byUser.set(presence.userId, presence);
  }
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
 * Canal `/ws/calls?channel=kanban&boardId=..&token=..`:
 * quem está no quadro, em qual cartão (e se está editando ou arrastando) e avisos de mudança.
 */
export async function registerKanbanSocket(ws: PresenceSocket, userId: string, url: URL): Promise<void> {
  const boardId = str(url.searchParams.get('boardId'));
  if (!boardId) {
    ws.close(4003, 'quadro obrigatorio');
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
  if (!(await kanbanService.userCanReadBoard(userId, boardId).catch(() => false))) {
    ws.close(4005, 'sem acesso ao quadro');
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) return;

  let room = rooms.get(boardId);
  if (!room) {
    room = new Map();
    rooms.set(boardId, room);
  }
  const presence: Presence = {
    userId,
    name: user.name,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    color: colorFor(userId),
    cardId: null,
    state: 'viewing',
  };
  room.set(ws, presence);

  send(ws, { type: 'presence:list', selfId: userId, users: listPresences(room) });
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
    const state = msg.state === 'editing' || msg.state === 'dragging' ? msg.state : 'viewing';
    presence.cardId = state === 'viewing' ? null : str(msg.cardId, 80);
    presence.state = presence.cardId ? state : 'viewing';
    const current = rooms.get(boardId);
    if (current) broadcast(current, { type: 'presence:list', users: listPresences(current) });
  });

  ws.on('close', () => {
    const current = rooms.get(boardId);
    if (!current) return;
    current.delete(ws);
    if (current.size === 0) {
      rooms.delete(boardId);
      return;
    }
    broadcast(current, { type: 'presence:list', users: listPresences(current) });
  });
}

/** Avisa quem está no quadro que algo mudou (o cliente de quem fez a mudança ignora o aviso). */
export function broadcastKanbanChanged(boardId: string, by: { id: string }): void {
  const room = rooms.get(boardId);
  if (!room) return;
  broadcast(room, { type: 'kanban:changed', by, em: new Date().toISOString() });
}

/** Descobre o quadro de uma requisição de escrita (por cartão, coluna, checklist, comentário, anexo...). */
async function resolveBoardId(path: string, body: Record<string, unknown>): Promise<string | null> {
  const seg = path.split('/').filter(Boolean);
  const first = seg[0];
  const id = seg[1];

  const fromColumn = async (columnId: unknown) => {
    if (typeof columnId !== 'string' || !columnId) return null;
    const col = await prisma.kanbanColumn.findUnique({ where: { id: columnId }, select: { boardId: true } });
    return col?.boardId ?? null;
  };
  const fromCard = async (cardId: unknown) => {
    if (typeof cardId !== 'string' || !cardId) return null;
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      select: { column: { select: { boardId: true } } },
    });
    return card?.column.boardId ?? null;
  };

  if (first === 'boards' && id) return id;
  if (first === 'columns') return id ? fromColumn(id) : typeof body.boardId === 'string' ? body.boardId : fromColumn(body.columnId);
  if (first === 'cards') return id ? fromCard(id) : fromColumn(body.columnId);
  if (first === 'checklist-items' && id) {
    const item = await prisma.kanbanChecklistItem.findUnique({ where: { id }, select: { cardId: true } });
    return item ? fromCard(item.cardId) : null;
  }
  if (first === 'comments' && id) {
    const c = await prisma.kanbanCardComment.findUnique({ where: { id }, select: { cardId: true } });
    return c ? fromCard(c.cardId) : null;
  }
  if (first === 'attachments' && id) {
    const a = await prisma.kanbanCardAttachment.findUnique({ where: { id }, select: { cardId: true } });
    return a ? fromCard(a.cardId) : null;
  }
  return null;
}

/**
 * Middleware das rotas do Kanban: depois de qualquer alteração bem-sucedida, avisa o quadro.
 * Nunca atrapalha a resposta: a descoberta do quadro roda depois que a resposta já saiu.
 */
export function kanbanChangeNotifier(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const path = req.path;
  const body = (req.body ?? {}) as Record<string, unknown>;
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const userId = (req as Request & { user?: { id: string } }).user?.id;
    if (!userId) return;
    void (async () => {
      try {
        const boardId = await resolveBoardId(path, body);
        if (boardId) broadcastKanbanChanged(boardId, { id: userId });
      } catch {
        /* aviso é só conveniência */
      }
    })();
  });
  next();
}
