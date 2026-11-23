import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';

/** Quem está no quadro agora (mesmo formato que o servidor manda para o site). */
export type KanbanPresence = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  color: string;
  /** Cartão em que a pessoa está (aberto ou sendo arrastado). */
  cardId: string | null;
  state: 'viewing' | 'editing' | 'dragging';
};

type Snapshot = { users: KanbanPresence[]; selfId: string | null };
type Claim = { state: 'viewing' | 'editing' | 'dragging'; cardId: string | null };

/** Endereço do canal ao vivo do servidor (mesmo host da API, caminho /ws/calls). */
function wsCallsUrl(): string {
  const base = String(API_CONFIG.BASE_URL || '').replace(/\/+$/, '');
  return `${base.replace(/^http/i, 'ws')}/ws/calls`;
}

/**
 * Uma conexão por quadro, compartilhada entre o quadro e o cartão aberto (que ficam na tela ao mesmo
 * tempo). Reconecta sozinha se a rede cair e ao voltar do segundo plano.
 */
class Connection {
  readonly boardId: string;
  refs = 0;
  private ws: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastSent = '';
  private claims = new Map<number, Claim>();
  private snapshot: Snapshot = { users: [], selfId: null };
  private selfId: string | null = null;
  readonly listeners = new Set<(s: Snapshot) => void>();
  readonly changedListeners = new Set<() => void>();
  private appSub: { remove: () => void } | null = null;

  constructor(boardId: string) {
    this.boardId = boardId;
    this.connect();
    // Voltou do segundo plano: o sistema pode ter derrubado o canal, então reconecta na hora.
    this.appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && !this.closed && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.attempt = 0;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.connect();
      }
    });
  }

  getSnapshot(): Snapshot {
    return this.snapshot;
  }

  private emit() {
    this.snapshot = { users: this.snapshot.users, selfId: this.selfId };
    this.listeners.forEach((l) => l(this.snapshot));
  }

  private async connect() {
    if (this.closed) return;
    const token = await AsyncStorage.getItem('token').catch(() => null);
    if (!token || this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(
        `${wsCallsUrl()}?channel=kanban&boardId=${encodeURIComponent(this.boardId)}&token=${encodeURIComponent(token)}`,
      );
    } catch {
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.lastSent = '';
      this.flushPresence();
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data === 'pong') return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.type === 'presence:list') {
        if (typeof msg.selfId === 'string') this.selfId = msg.selfId;
        this.snapshot = {
          users: Array.isArray(msg.users) ? (msg.users as KanbanPresence[]) : [],
          selfId: this.selfId,
        };
        this.listeners.forEach((l) => l(this.snapshot));
        return;
      }
      if (msg.type === 'kanban:changed') {
        const by = msg.by as { id?: string } | undefined;
        if (by?.id && by.id === this.selfId) return; // fui eu que mudei
        this.changedListeners.forEach((l) => l());
      }
    };

    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) this.ws = null;
      this.snapshot = { users: [], selfId: this.selfId };
      this.emit();
      if (this.closed) return;
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => void this.connect(), Math.min(15_000, 1000 * 2 ** Math.min(this.attempt, 4)));
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* já fechou */
      }
    };
  }

  /** Onde estou: vale a «reivindicação» mais recente que esteja num cartão; senão, só olhando. */
  private currentPayload(): string {
    let chosen: Claim = { state: 'viewing', cardId: null };
    for (const c of this.claims.values()) if (c.cardId) chosen = c;
    return JSON.stringify({ type: 'presence', state: chosen.state, cardId: chosen.cardId });
  }

  private flushPresence() {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload = this.currentPayload();
    if (payload === this.lastSent) return;
    this.lastSent = payload;
    ws.send(payload);
  }

  setClaim(owner: number, claim: Claim) {
    this.claims.set(owner, claim);
    this.flushPresence();
  }

  removeClaim(owner: number) {
    this.claims.delete(owner);
    this.flushPresence();
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.appSub?.remove();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* já fechou */
      }
    }
    this.listeners.clear();
    this.changedListeners.clear();
  }
}

const connections = new Map<string, Connection>();
let nextOwner = 1;

function acquire(boardId: string): Connection {
  let conn = connections.get(boardId);
  if (!conn) {
    conn = new Connection(boardId);
    connections.set(boardId, conn);
  }
  conn.refs += 1;
  return conn;
}

function release(conn: Connection) {
  conn.refs -= 1;
  if (conn.refs > 0) return;
  // Pequena espera: trocar de tela (quadro → cartão) não derruba e refaz a conexão.
  setTimeout(() => {
    if (conn.refs <= 0 && connections.get(conn.boardId) === conn) {
      connections.delete(conn.boardId);
      conn.close();
    }
  }, 1500);
}

/**
 * Colaboração em tempo real no quadro: quem está online, em qual cartão (e se está editando) e aviso
 * quando outra pessoa altera algo. `presence` diz onde EU estou (padrão: só olhando o quadro).
 */
export function useKanbanCollab({
  boardId,
  onChangedByOther,
  presence,
}: {
  boardId: string | null | undefined;
  onChangedByOther?: () => void;
  presence?: Claim;
}): Snapshot {
  const [snap, setSnap] = useState<Snapshot>({ users: [], selfId: null });
  const connRef = useRef<Connection | null>(null);
  const ownerRef = useRef<number>(0);
  if (!ownerRef.current) ownerRef.current = nextOwner++;
  const changedRef = useRef(onChangedByOther);
  changedRef.current = onChangedByOther;

  useEffect(() => {
    if (!boardId) {
      setSnap({ users: [], selfId: null });
      return;
    }
    const conn = acquire(boardId);
    connRef.current = conn;
    setSnap(conn.getSnapshot());
    const onSnap = (s: Snapshot) => setSnap(s);
    const onChanged = () => changedRef.current?.();
    conn.listeners.add(onSnap);
    conn.changedListeners.add(onChanged);
    return () => {
      conn.listeners.delete(onSnap);
      conn.changedListeners.delete(onChanged);
      conn.removeClaim(ownerRef.current);
      if (connRef.current === conn) connRef.current = null;
      release(conn);
    };
  }, [boardId]);

  const state = presence?.state ?? 'viewing';
  const cardId = presence?.cardId ?? null;
  useEffect(() => {
    const conn = connRef.current;
    if (!conn) return;
    conn.setClaim(ownerRef.current, { state, cardId });
  }, [boardId, state, cardId]);

  return snap;
}
