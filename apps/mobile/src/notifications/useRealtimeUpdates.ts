import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import { API_CONFIG } from '../config/api';

const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

function wsUpdatesUrl(token: string): string {
  const base = API_CONFIG.BASE_URL.replace(/\/$/, '').replace(/^http/i, 'ws');
  return `${base}/ws/calls?channel=updates&token=${encodeURIComponent(token)}`;
}

/**
 * Conexão em tempo real com o backend: quando algo muda (solicitação, chamado, reserva,
 * aprovação…) o servidor avisa e o app atualiza na hora, sem esperar o polling.
 * Se a conexão cair, reconecta sozinho; o polling continua como rede de segurança.
 */
export function useRealtimeUpdates(enabled: boolean, onChange: () => void) {
  const queryClient = useQueryClient();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const cleanupSocket = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
      if (ws) {
        ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
        try {
          ws.close();
        } catch {
          // ignora
        }
      }
      ws = null;
    };

    const scheduleReconnect = () => {
      if (stopped || retryTimer) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** retry);
      retry += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (stopped) return;
      cleanupSocket();
      const token = await AsyncStorage.getItem('token').catch(() => null);
      if (stopped || !token) return;
      try {
        const socket = new WebSocket(wsUpdatesUrl(token));
        ws = socket;
        socket.onopen = () => {
          retry = 0;
          pingTimer = setInterval(() => {
            try {
              socket.send('ping');
            } catch {
              // a queda é tratada no onclose
            }
          }, PING_MS);
          // Pode ter mudado algo enquanto estava desconectado.
          onChangeRef.current();
        };
        socket.onmessage = (event) => {
          let msg: { type?: string; scopes?: string[] } | null = null;
          try {
            msg = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (msg?.type !== 'data:changed') return;
          onChangeRef.current();
          if (!msg.scopes || msg.scopes.includes('approvals')) {
            void queryClient.invalidateQueries({ queryKey: ['approvals'] });
          }
        };
        socket.onclose = () => {
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = null;
          scheduleReconnect();
        };
        socket.onerror = () => {
          // o onclose cuida da reconexão
        };
      } catch {
        scheduleReconnect();
      }
    };

    void connect();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && (!ws || ws.readyState !== WebSocket.OPEN)) {
        retry = 0;
        void connect();
      }
    });

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      sub.remove();
      cleanupSocket();
    };
  }, [enabled, queryClient]);
}
