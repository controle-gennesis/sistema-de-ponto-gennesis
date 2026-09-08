'use client';

import { useEffect } from 'react';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';

const BRANDING_ICON_ATTR = 'data-branding-favicon';

/**
 * Não remove links de ícone do React/Next (isso causa
 * "Cannot read properties of null (reading 'removeChild')").
 * Só adiciona um override quando o branding UNB está ativo.
 */
function applyFavicon(brandingHref: string) {
  const isDefaultGennesis =
    brandingHref === '/logopv.png' || brandingHref === '/logobranca.png';

  const existing = document.querySelector(
    `link[${BRANDING_ICON_ATTR}="1"]`
  ) as HTMLLinkElement | null;

  if (isDefaultGennesis) {
    existing?.remove();
    return;
  }

  if (existing) {
    existing.href = brandingHref;
    return;
  }

  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = brandingHref;
  link.setAttribute(BRANDING_ICON_ATTR, '1');
  document.head.appendChild(link);
}

export function Favicon() {
  const { logoSrc } = useBrandingLogo();

  useEffect(() => {
    applyFavicon(logoSrc);
  }, [logoSrc]);

  return null;
}
