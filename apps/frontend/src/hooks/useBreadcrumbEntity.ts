'use client';

import { useLayoutEffect, useEffect, useId } from 'react';
import { usePageTitleOverride } from '@/context/PageTitleContext';
import type { BreadcrumbItem } from '@/lib/pageTitle';

function normalizeEntities(
  entity: BreadcrumbItem | BreadcrumbItem[] | null | undefined,
): BreadcrumbItem[] {
  const list = Array.isArray(entity) ? entity : entity ? [entity] : [];
  return list
    .map((item) => ({
      label: item.label?.trim() ?? '',
      href: item.href,
    }))
    .filter((item) => item.label.length > 0);
}

type UseBreadcrumbEntityOptions = {
  /**
   * Quando false, remove a camada deste hook sem apagar as demais.
   */
  enabled?: boolean;
  /**
   * Ordem na trilha (menor = mais à esquerda). Contrato no layout = 0;
   * sufixos da página (Orçamentos, nome) = 1+.
   */
  priority?: number;
};

/** Insere crumb(s) dinâmicos no breadcrumb da TopNavbar enquanto a página estiver montada. */
export function useBreadcrumbEntity(
  entity: BreadcrumbItem | BreadcrumbItem[] | null | undefined,
  options?: UseBreadcrumbEntityOptions,
) {
  const { setBreadcrumbEntities } = usePageTitleOverride();
  const ownerId = useId();
  const enabled = options?.enabled !== false;
  const priority = options?.priority ?? 0;
  const normalized = normalizeEntities(entity);
  const key = normalized.map((e) => `${e.label}|${e.href ?? ''}`).join('>');

  useLayoutEffect(() => {
    if (!enabled) {
      setBreadcrumbEntities(null, ownerId, priority);
      return;
    }
    if (normalized.length === 0) {
      setBreadcrumbEntities(null, ownerId, priority);
      return;
    }
    setBreadcrumbEntities(normalized, ownerId, priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captura label/href
  }, [enabled, key, ownerId, priority, setBreadcrumbEntities]);

  useEffect(() => {
    return () => {
      setBreadcrumbEntities(null, ownerId, priority);
    };
  }, [ownerId, priority, setBreadcrumbEntities]);
}
