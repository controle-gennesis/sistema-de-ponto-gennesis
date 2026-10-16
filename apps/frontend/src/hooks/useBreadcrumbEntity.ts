'use client';

import { useLayoutEffect, useEffect, useId, useRef } from 'react';
import { usePageTitleOverride } from '@/context/PageTitleContext';
import type { BreadcrumbItem } from '@/lib/pageTitle';

function normalizeEntities(
  entity: BreadcrumbItem | BreadcrumbItem[] | null | undefined,
  /**
   * O effect só roda quando o `key` muda, então um `onClick` direto ficaria preso ao render antigo.
   * O wrapper abaixo chama sempre o handler mais recente guardado no ref.
   */
  latestRef?: { current: BreadcrumbItem[] },
): BreadcrumbItem[] {
  const list = Array.isArray(entity) ? entity : entity ? [entity] : [];
  return list
    .map((item, index) => ({
      label: item.label?.trim() ?? '',
      href: item.href,
      ...(item.onClick
        ? { onClick: () => latestRef?.current[index]?.onClick?.() }
        : {}),
      ...(item.badge?.trim() ? { badge: item.badge.trim() } : {}),
      ...(Array.isArray(item.badgeMenu) && item.badgeMenu.length > 0
        ? { badgeMenu: item.badgeMenu }
        : {}),
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
  const latestRef = useRef<BreadcrumbItem[]>([]);
  latestRef.current = Array.isArray(entity) ? entity : entity ? [entity] : [];
  const normalized = normalizeEntities(entity, latestRef);
  const key = normalized
    .map(
      (e) =>
        `${e.label}|${e.href ?? ''}|${e.onClick ? 'fn' : ''}|${e.badge ?? ''}|${(e.badgeMenu ?? [])
          .map((m) => m.href)
          .join(',')}`
    )
    .join('>');

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
