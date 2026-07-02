'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type PageTitleContextValue = {
  override: string | null;
  setOverride: (title: string | null) => void;
};

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>;
}

export function usePageTitleOverride() {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error('usePageTitleOverride must be used within PageTitleProvider');
  }
  return ctx;
}
