'use client';

import { useSyncExternalStore } from 'react';

export type CronogramaNovoRef = {
  contractId: string;
  orcamentoId: string;
};

type Store = {
  /** Momento em que a pessoa saiu da lista. Itens anteriores a isso já foram vistos. */
  vistosAte: number;
  itens: CronogramaNovoRef[];
};

const listeners = new Set<() => void>();

function storageKey(userId: string): string {
  return `cronogramas-nao-vistos:${userId}`;
}

function emptyStore(): Store {
  return { vistosAte: 0, itens: [] };
}

function read(userId: string): Store {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    const itens = Array.isArray(parsed.itens)
      ? parsed.itens.filter(
          (item): item is CronogramaNovoRef =>
            !!item &&
            typeof item.contractId === 'string' &&
            typeof item.orcamentoId === 'string' &&
            item.orcamentoId.trim().length > 0,
        )
      : [];
    const vistosAte = Number(parsed.vistosAte);
    return {
      vistosAte: Number.isFinite(vistosAte) && vistosAte > 0 ? vistosAte : 0,
      itens,
    };
  } catch {
    return emptyStore();
  }
}

function write(userId: string, store: Store): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId), JSON.stringify(store));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Orçamento acabou de ser finalizado: o cronograma entra na conta da sidebar. */
export function registrarCronogramaNovo(userId: string, item: CronogramaNovoRef): void {
  const orcamentoId = item.orcamentoId.trim();
  const contractId = item.contractId.trim();
  if (!userId || !orcamentoId) return;
  const store = read(userId);
  if (store.itens.some((row) => row.orcamentoId === orcamentoId && row.contractId === contractId)) {
    return;
  }
  store.itens.push({ contractId, orcamentoId });
  write(userId, store);
}

export function dispensarCronogramaNovo(userId: string, orcamentoId: string): void {
  if (!userId || !orcamentoId) return;
  const store = read(userId);
  const next = store.itens.filter((row) => row.orcamentoId !== orcamentoId);
  if (next.length === store.itens.length) return;
  store.itens = next;
  write(userId, store);
}

/** A pessoa saiu da lista de cronogramas: o aviso da sidebar zera. */
export function marcarCronogramasVistos(userId: string): void {
  if (!userId) return;
  write(userId, { vistosAte: Date.now(), itens: [] });
}

const JANELA_INICIAL_MS = 24 * 60 * 60 * 1000;

/**
 * Na primeira vez, cronogramas finalizados nas últimas 24 horas entram no aviso.
 * Depois, só os que surgiram desde a última visita à lista.
 */
export function sincronizarCronogramasRecentes(
  userId: string,
  items: Array<CronogramaNovoRef & { updatedAt?: string }>,
): void {
  if (!userId) return;
  const store = read(userId);
  const since = store.vistosAte > 0 ? store.vistosAte : Date.now() - JANELA_INICIAL_MS;
  let changed = false;
  for (const item of items) {
    const orcamentoId = item.orcamentoId.trim();
    const contractId = item.contractId.trim();
    if (!orcamentoId) continue;
    const updated = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    if (!Number.isFinite(updated) || updated <= since) continue;
    if (store.itens.some((row) => row.orcamentoId === orcamentoId && row.contractId === contractId)) {
      continue;
    }
    store.itens.push({ contractId, orcamentoId });
    changed = true;
  }
  if (changed) write(userId, store);
}

export function useCronogramasNovosCount(userId: string | null | undefined): number {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? read(userId).itens.length : 0),
    () => 0,
  );
}
