'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type ControleGeralColumnWidth = {
  key: string;
  defaultWidth: number;
  minWidth: number;
};

function readStoredWidths(storageKey: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const widths: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const width = Number(value);
      if (Number.isFinite(width) && width > 0) widths[key] = width;
    }
    return widths;
  } catch {
    return {};
  }
}

export function useControleGeralColumnWidths(
  storageKey: string,
  columns: readonly ControleGeralColumnWidth[]
) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    setOverrides(readStoredWidths(storageKey));
  }, [storageKey]);

  const widths = useMemo(() => {
    const next: Record<string, number> = {};
    for (const column of columns) {
      const stored = overrides[column.key];
      next[column.key] =
        stored != null && stored >= column.minWidth ? stored : column.defaultWidth;
    }
    return next;
  }, [columns, overrides]);

  const totalWidth = useMemo(
    () => columns.reduce((sum, column) => sum + (widths[column.key] ?? column.defaultWidth), 0),
    [columns, widths]
  );

  const setColumnWidth = useCallback(
    (key: string, width: number) => {
      const column = columns.find((item) => item.key === key);
      const minWidth = column?.minWidth ?? 60;
      const nextWidth = Math.max(minWidth, Math.round(width));
      setOverrides((prev) => {
        const next = { ...prev, [key]: nextWidth };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* largura continua só nesta sessão */
        }
        return next;
      });
    },
    [columns, storageKey]
  );

  return { widths, totalWidth, setColumnWidth };
}
