'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  isUnbCostCenter,
  persistUnbBranding,
  persistUnbBrandingFlag,
  readStoredUnbBranding,
  resolveBrandingLogoAlt,
  resolveBrandingLogoSrc,
} from '@/lib/unbBranding';

export function useBrandingLogo() {
  const { isDark } = useTheme();
  const { user, isUnbUser, isLoading } = usePermissions();
  // Começa igual ao servidor (false) e lê o localStorage logo após a hidratação:
  // ler antes fazia o logo do cliente divergir do HTML do servidor (erro de hidratação).
  const [storedUnb, setStoredUnb] = useState(false);

  useEffect(() => {
    setStoredUnb(readStoredUnbBranding());
  }, []);

  const costCenter = user?.employee?.costCenter;
  const useUnbBranding = isLoading
    ? storedUnb
    : isUnbUser ||
      (costCenter != null && costCenter !== ''
        ? isUnbCostCenter(costCenter)
        : storedUnb);

  useEffect(() => {
    if (isLoading) return;

    if (isUnbUser) {
      persistUnbBrandingFlag(true);
      setStoredUnb(true);
      return;
    }

    if (costCenter != null && costCenter !== '') {
      persistUnbBranding(costCenter);
      setStoredUnb(isUnbCostCenter(costCenter));
      return;
    }

    persistUnbBrandingFlag(false);
    setStoredUnb(false);
  }, [isLoading, isUnbUser, costCenter]);

  return {
    logoSrc: resolveBrandingLogoSrc(isDark, useUnbBranding),
    logoAlt: resolveBrandingLogoAlt(useUnbBranding),
    useUnbBranding,
  };
}
