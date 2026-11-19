'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsCallsUrl } from '@/lib/wsCallUrl';

export type KanbanPresenca = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  color: string;
  /** Cartão em que a pessoa está (aberto ou sendo arrastado). */
  cardId: string | null;
  state: 'viewing' | 'editing' | 'dragging';
};

type Opcoes = {
  boardId: string | null | undefined;
  /** Alguém (que não eu) alterou o quadro: hora de buscar a versão nova. */
  onAlteradoPorOutro: () => void;
};

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Colaboração em tempo real no quadro: quem está online, em qual cartão (e se está editando ou
 * arrastando) e aviso quando outra pessoa altera algo. Reconecta sozinho se a conexão cair.
 */
export function useKanbanColaboracao({ boardId, onAlteradoPorOutro }: Opcoes) {
  const [usuarios, setUsuarios] = useState<KanbanPresenca[]>([]);
  const [meuId, setMeuId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const meuIdRef = useRef<string | null>(null);
  const presencaAtualRef = useRef<string>('');
  const ultimaEnviadaRef = useRef<string>('');
  const aoAlterarRef = useRef(onAlteradoPorOutro);
  aoAlterarRef.current = onAlteradoPorOutro;

  useEffect(() => {
    if (!boardId) return;
    const token = getAuthToken();
    if (!token) return;

    let cancelado = false;
    let tentativa = 0;
    let timerReconexao: ReturnType<typeof setTimeout> | null = null;
    let timerPing: ReturnType<typeof setInterval> | null = null;

    const conectar = () => {
      if (cancelado) return;
      const url =
        `${getWsCallsUrl()}?channel=kanban` +
        `&boardId=${encodeURIComponent(boardId)}` +
        `&token=${encodeURIComponent(token)}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        tentativa = 0;
        ultimaEnviadaRef.current = '';
        // Reenvia onde eu estava (cartão aberto etc.) depois de uma reconexão.
        if (presencaAtualRef.current && presencaAtualRef.current !== ultimaEnviadaRef.current) {
          ws.send(presencaAtualRef.current);
          ultimaEnviadaRef.current = presencaAtualRef.current;
        }
        timerPing = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
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
          if (typeof msg.selfId === 'string') {
            meuIdRef.current = msg.selfId;
            setMeuId(msg.selfId);
          }
          setUsuarios(Array.isArray(msg.users) ? (msg.users as KanbanPresenca[]) : []);
          return;
        }
        if (msg.type === 'kanban:changed') {
          const by = msg.by as { id?: string } | undefined;
          if (by?.id && by.id === meuIdRef.current) return;
          aoAlterarRef.current();
        }
      };

      ws.onclose = () => {
        if (timerPing) clearInterval(timerPing);
        timerPing = null;
        if (wsRef.current === ws) wsRef.current = null;
        setUsuarios([]);
        if (cancelado) return;
        tentativa += 1;
        timerReconexao = setTimeout(conectar, Math.min(15000, 1000 * 2 ** Math.min(tentativa, 4)));
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    conectar();

    return () => {
      cancelado = true;
      if (timerReconexao) clearTimeout(timerReconexao);
      if (timerPing) clearInterval(timerPing);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      setUsuarios([]);
    };
  }, [boardId]);

  /** Informa onde estou: só olhando, com um cartão aberto (editing) ou arrastando um cartão. */
  const enviarPresenca = useCallback(
    (p: { state: 'viewing' | 'editing' | 'dragging'; cardId: string | null }) => {
      const payload = JSON.stringify({ type: 'presence', state: p.state, cardId: p.cardId });
      presencaAtualRef.current = payload;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (payload === ultimaEnviadaRef.current) return;
      ultimaEnviadaRef.current = payload;
      ws.send(payload);
    },
    [],
  );

  return { usuarios, meuId, enviarPresenca };
}
