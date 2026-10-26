'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';

interface ContractRow {
  id: string;
  costCenterId?: string | number | null;
}

interface OrcIndexEntry {
  id?: string;
  statusAprovacao?: string;
}

/** Orçamento com aviso: aprovado ou devolvido para correção (chave = centro de custo + orçamento). */
type OrcamentoAviso = { key: string; status: 'aprovado' | 'em_correcao' };

/**
 * Avisos já vistos por usuário: chave do orçamento → status visto. O aviso volta só se o orçamento
 * mudar de situação de novo (ex.: aprovado → em correção). Fica no navegador; falha de storage = nada visto.
 */
function chaveVistos(userId: string): string {
  return `orcamento-avisos-vistos:${userId}`;
}

function lerVistos(userId: string): Record<string, string> {
  if (!userId) return {};
  try {
    const raw = window.localStorage.getItem(chaveVistos(userId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function gravarVistos(userId: string, vistos: Record<string, string>): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(chaveVistos(userId), JSON.stringify(vistos));
  } catch {
    /* sem storage: o aviso some enquanto a página estiver aberta */
  }
}

export function useOrcamentoNotificationCounts() {
  const { isLoading, isAdministrator, canAccessContractOrcamentoTab, user } = usePermissions();
  const userId = String(user?.id || '');

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', 'orcamentos-all'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500 } });
      return res.data;
    },
    enabled: !isLoading,
  });

  const contracts: ContractRow[] = (() => {
    const raw = contractsData?.data ?? contractsData;
    const list = Array.isArray(raw) ? (raw as ContractRow[]) : [];
    return list.filter((c) => {
      if (!c?.id || !c.costCenterId) return false;
      if (isAdministrator) return true;
      return canAccessContractOrcamentoTab(c.id);
    });
  })();

  const costCenterIds = contracts
    .map((c) => String(c.costCenterId))
    .filter(Boolean)
    .sort()
    .join(',');

  const { data } = useQuery({
    queryKey: ['orcamento-notification-counts', costCenterIds],
    queryFn: async () => {
      const avisos: OrcamentoAviso[] = [];
      await Promise.allSettled(
        contracts.map(async (c) => {
          const res = await api.get(`/orcamento/${c.costCenterId}`, { timeout: 30000 });
          const orcs: OrcIndexEntry[] = Array.isArray(res.data?.orcamentos)
            ? res.data.orcamentos
            : [];
          for (const o of orcs) {
            if (!o.id) continue;
            if (o.statusAprovacao === 'em_correcao' || o.statusAprovacao === 'aprovado') {
              avisos.push({ key: `${c.costCenterId}|${o.id}`, status: o.statusAprovacao });
            }
          }
        })
      );
      return avisos;
    },
    enabled: contracts.length > 0,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const [vistos, setVistos] = useState<Record<string, string>>({});
  useEffect(() => {
    setVistos(lerVistos(userId));
  }, [userId]);

  // Só conta o que ainda não foi visto naquela situação.
  const naoVistos = useMemo(
    () => (data ?? []).filter((a) => vistos[a.key] !== a.status),
    [data, vistos]
  );

  /** Usuário entrou em Orçamentos: os avisos atuais somem e não voltam (até mudar a situação). */
  const marcarComoVistos = useCallback(() => {
    if (!userId || !data?.length) return;
    const atual = lerVistos(userId);
    let mudou = false;
    for (const a of data) {
      if (atual[a.key] !== a.status) {
        atual[a.key] = a.status;
        mudou = true;
      }
    }
    if (!mudou) return;
    gravarVistos(userId, atual);
    setVistos(atual);
  }, [userId, data]);

  return {
    rejectedCount: naoVistos.filter((a) => a.status === 'em_correcao').length,
    approvedCount: naoVistos.filter((a) => a.status === 'aprovado').length,
    marcarComoVistos,
  };
}
