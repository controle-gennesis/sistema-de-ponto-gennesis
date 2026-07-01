const UNB_BRANDING_STORAGE_KEY = 'gennesis-unb-branding';

/** Centro de custo da UNB (nome ou código no cadastro do funcionário). */
export function isUnbCostCenter(costCenter: string | null | undefined): boolean {
  if (!costCenter?.trim()) return false;
  const normalized = costCenter
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'UNB') return true;
  return /^UNB(\s|$|-|\/)/.test(normalized);
}

export function resolveBrandingLogoSrc(isDark: boolean, useUnbBranding: boolean): string {
  if (useUnbBranding) {
    return isDark ? '/predialbranco.png' : '/predialpreto.png';
  }
  return isDark ? '/logobranca.png' : '/logopv.png';
}

export function resolveBrandingLogoAlt(useUnbBranding: boolean): string {
  return useUnbBranding ? 'Predial Engenharia' : 'Gennesis Engenharia';
}

export function readStoredUnbBranding(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(UNB_BRANDING_STORAGE_KEY) === '1';
}

export function persistUnbBranding(costCenter: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNB_BRANDING_STORAGE_KEY, isUnbCostCenter(costCenter) ? '1' : '0');
}
