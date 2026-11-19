'use client';

import { useEffect, useRef } from 'react';
import { getWsCallsUrl } from '@/lib/wsCallUrl';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Agenda ao vivo: o servidor avisa (pelo WebSocket) assim que o Google informa uma mudança nos
 * eventos, e a tela recarrega na hora. Reconecta sozinho se a conexão cair.
 */
export function useAgendaPush(enabled: boolean, onChanged: () => void) {
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    if (!enabled) return;
    const token = getAuthToken();
    if (!token) return;

    let cancelado = false;
    let tentativa = 0;
    let ws: WebSocket | null = null;
    let timerReconexao: ReturnType<typeof setTimeout> | null = null;
    let timerPing: ReturnType<typeof setInterval> | null = null;

    const conectar = () => {
      if (cancelado) return;
      try {
        ws = new WebSocket(`${getWsCallsUrl()}?channel=agenda&token=${encodeURIComponent(token)}`);
      } catch {
        return;
      }
      const atual = ws;
      atual.onopen = () => {
        tentativa = 0;
        timerPing = setInterval(() => {
          if (atual.readyState === WebSocket.OPEN) atual.send('ping');
        }, 25000);
      };
      atual.onmessage = (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return;
        try {
          const msg = JSON.parse(ev.data) as { type?: string };
          if (msg.type === 'planner:changed') onChangedRef.current();
        } catch {
          /* ignora */
        }
      };
      atual.onclose = () => {
        if (timerPing) clearInterval(timerPing);
        timerPing = null;
        if (cancelado) return;
        tentativa += 1;
        timerReconexao = setTimeout(conectar, Math.min(15000, 1000 * 2 ** Math.min(tentativa, 4)));
      };
      atual.onerror = () => atual.close();
    };

    conectar();

    return () => {
      cancelado = true;
      if (timerReconexao) clearTimeout(timerReconexao);
      if (timerPing) clearInterval(timerPing);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [enabled]);
}
