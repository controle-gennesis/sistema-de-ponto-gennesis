'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsCallsUrl } from '@/lib/wsCallUrl';

export type OrcamentoPresenca = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  color: string;
  aba: string | null;
  rowKey: string | null;
  field: string | null;
  editing: boolean;
};

export type OrcamentoSalvoRemoto = {
  revisao: number;
  by: { id: string; name: string };
  em: string;
};

type Opcoes = {
  centroCustoId: string | null | undefined;
  orcamentoId: string | null | undefined;
  /** Chamado a cada salvamento de outra pessoa (e quando a revisão do servidor é maior que a conhecida). */
  onSalvoPorOutro: (info: {
    revisao: number;
    by: { id: string; name: string } | null;
    em: string | null;
    /** `conexao`: revisão informada ao entrar; `salvamento`: alguém acabou de salvar. */
    origem: 'conexao' | 'salvamento';
  }) => void;
};

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

/**
 * Presença em tempo real do orçamento: quem está online, em qual aba/linha, e avisos de salvamento.
 * Conecta no canal `orcamento` do WebSocket e reconecta sozinho se cair.
 */
export function useOrcamentoColaboracao({ centroCustoId, orcamentoId, onSalvoPorOutro }: Opcoes) {
  const [usuarios, setUsuarios] = useState<OrcamentoPresenca[]>([]);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const meuIdRef = useRef<string | null>(null);
  const ultimaPresencaRef = useRef<string>('');
  const aoSalvarRef = useRef(onSalvoPorOutro);
  aoSalvarRef.current = onSalvoPorOutro;

  useEffect(() => {
    if (!centroCustoId || !orcamentoId) return;
    const token = getAuthToken();
    if (!token) return;

    let cancelado = false;
    let tentativa = 0;
    let timerReconexao: ReturnType<typeof setTimeout> | null = null;
    let timerPing: ReturnType<typeof setInterval> | null = null;

    const conectar = () => {
      if (cancelado) return;
      const url =
        `${getWsCallsUrl()}?channel=orcamento` +
        `&centroCustoId=${encodeURIComponent(centroCustoId)}` +
        `&orcamentoId=${encodeURIComponent(orcamentoId)}` +
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
        setConectado(true);
        ultimaPresencaRef.current = '';
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
          setUsuarios(Array.isArray(msg.users) ? (msg.users as OrcamentoPresenca[]) : []);
          // Na conexão o servidor informa a revisão atual: se for maior que a carregada, avisa.
          if (typeof msg.revisao === 'number') {
            const ult = msg.ultimaAlteracao as { userId?: string; userName?: string; em?: string } | null;
            aoSalvarRef.current({
              revisao: msg.revisao,
              by: ult?.userId ? { id: ult.userId, name: ult.userName || 'Alguém' } : null,
              em: ult?.em ?? null,
              origem: 'conexao',
            });
          }
          return;
        }
        if (msg.type === 'orcamento:saved') {
          const by = msg.by as { id?: string; name?: string } | undefined;
          if (typeof msg.revisao !== 'number') return;
          aoSalvarRef.current({
            revisao: msg.revisao,
            by: by?.id ? { id: by.id, name: by.name || 'Alguém' } : null,
            em: typeof msg.em === 'string' ? msg.em : null,
            origem: 'salvamento',
          });
        }
      };

      ws.onclose = () => {
        if (timerPing) clearInterval(timerPing);
        timerPing = null;
        if (wsRef.current === ws) wsRef.current = null;
        setConectado(false);
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
      setConectado(false);
    };
  }, [centroCustoId, orcamentoId]);

  /** Informa onde estou (aba, linha, campo). Ignora repetições. */
  const enviarPresenca = useCallback(
    (p: { aba?: string | null; rowKey?: string | null; field?: string | null; editing?: boolean }) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const payload = {
        type: 'presence',
        aba: p.aba ?? null,
        rowKey: p.rowKey ?? null,
        field: p.field ?? null,
        editing: p.editing === true,
      };
      const serial = JSON.stringify(payload);
      if (serial === ultimaPresencaRef.current) return;
      ultimaPresencaRef.current = serial;
      ws.send(serial);
    },
    []
  );

  return { usuarios, meuId, conectado, enviarPresenca };
}
