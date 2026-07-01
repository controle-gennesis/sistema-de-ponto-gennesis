'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  isUnbCostCenter,
  persistUnbBranding,
  readStoredUnbBranding,
  resolveBrandingLogoAlt,
  resolveBrandingLogoSrc,
} from '@/lib/unbBranding';

export function useBrandingLogo() {
  const { isDark } = useTheme();
  const { user } = usePermissions();
  const [storedUnb, setStoredUnb] = useState(() =>
    typeof window !== 'undefined' ? readStoredUnbBranding() : false
  );

  const costCenter = user?.employee?.costCenter;
  const useUnbBranding =
    costCenter != null && costCenter !== ''
      ? isUnbCostCenter(costCenter)
      : storedUnb;

  useEffect(() => {
    if (costCenter != null && costCenter !== '') {
      persistUnbBranding(costCenter);
      setStoredUnb(isUnbCostCenter(costCenter));
    }
  }, [costCenter]);

  return {
    logoSrc: resolveBrandingLogoSrc(isDark, useUnbBranding),
    logoAlt: resolveBrandingLogoAlt(useUnbBranding),
    useUnbBranding,
  };
}
