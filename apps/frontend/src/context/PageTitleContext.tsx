'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BreadcrumbItem } from '@/lib/pageTitle';

type Layer = {
  items: BreadcrumbItem[];
  /** Menor = mais à esquerda (ex.: nome do contrato). */
  priority: number;
};

type PageTitleContextValue = {
  override: string | null;
  setOverride: (title: string | null) => void;
  /** Crumbs dinâmicos no breadcrumb (ex.: pasta do Drive, nome do contrato). */
  breadcrumbEntities: BreadcrumbItem[];
  /**
   * Atualiza a camada deste `ownerId`. Várias páginas/layouts podem contribuir;
   * o resultado exibido é a fusão ordenada por `priority` (sem labels duplicados).
   */
  setBreadcrumbEntities: (
    entities: BreadcrumbItem[] | null,
    ownerId?: string,
    priority?: number,
  ) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

function sameEntities(a: BreadcrumbItem[], b: BreadcrumbItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) => item.label === b[i]?.label && (item.href ?? '') === (b[i]?.href ?? ''),
  );
}

function mergeLayers(layers: Map<string, Layer>): BreadcrumbItem[] {
  const ordered = [...layers.values()].sort((a, b) => a.priority - b.priority);
  const out: BreadcrumbItem[] = [];
  const seen = new Set<string>();
  for (const layer of ordered) {
    for (const item of layer.items) {
      const key = item.label.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  const [breadcrumbEntities, setBreadcrumbEntitiesState] = useState<BreadcrumbItem[]>([]);
  const layersRef = useRef<Map<string, Layer>>(new Map());

  const setBreadcrumbEntities = useCallback(
    (entities: BreadcrumbItem[] | null, ownerId?: string, priority = 0) => {
      const oid = ownerId ?? '__default__';
      if (!entities?.length) {
        layersRef.current.delete(oid);
      } else {
        layersRef.current.set(oid, { items: entities, priority });
      }
      const next = mergeLayers(layersRef.current);
      setBreadcrumbEntitiesState((prev) => (sameEntities(prev, next) ? prev : next));
    },
    [],
  );

  const value = useMemo(
    () => ({ override, setOverride, breadcrumbEntities, setBreadcrumbEntities }),
    [override, breadcrumbEntities, setBreadcrumbEntities],
  );

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleOverride() {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error('usePageTitleOverride must be used within PageTitleProvider');
  }
  return ctx;
}
