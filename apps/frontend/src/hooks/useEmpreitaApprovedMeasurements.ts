'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';

/**
 * Selo de "Empreitas" no menu: quantas medições o gestor aprovou desde a última vez que o usuário
 * abriu a página. A marca de "visto" fica no navegador (por usuário); sem storage, o selo some só
 * enquanto a página estiver aberta.
 */
function chave(userId: string): string {
  return `empreitas-medicoes-aprovadas-vistas:${userId}`;
}

function ler(userId: string): string | null {
  if (!userId) return null;
  try {
    return window.localStorage.getItem(chave(userId));
  } catch {
    return null;
  }
}

function gravar(userId: string, iso: string): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(chave(userId), iso);
  } catch {
    /* sem storage */
  }
}

export function useEmpreitaApprovedMeasurements(userId: string, enabled: boolean) {
  const [since, setSince] = useState<string | null>(null);

  // Primeiro acesso: começa a contar a partir de agora (não despeja o histórico no selo).
  useEffect(() => {
    if (!userId || !enabled) return;
    const salvo = ler(userId);
    if (salvo) {
      setSince(salvo);
    } else {
      const agora = new Date().toISOString();
      gravar(userId, agora);
      setSince(agora);
    }
  }, [userId, enabled]);

  const { data } = useQuery({
    queryKey: ['empreitas-medicoes-aprovadas-count', userId, since],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/daily-measurements/approved-count', {
        params: { since },
      });
      const n = Number(res.data?.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: enabled && !!userId && !!since,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
    retry: false,
  });

  /** Usuário abriu Empreitas: o selo zera. */
  const marcarComoVistas = useCallback(() => {
    if (!userId) return;
    const agora = new Date().toISOString();
    gravar(userId, agora);
    setSince(agora);
  }, [userId]);

  return { count: data ?? 0, marcarComoVistas };
}
