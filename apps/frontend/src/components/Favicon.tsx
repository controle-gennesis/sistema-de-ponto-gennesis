'use client';

import { useEffect } from 'react';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';

function appendIcon(rel: string, href: string, type?: string, sizes?: string) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (type) link.type = type;
  if (sizes) link.setAttribute('sizes', sizes);
  document.head.appendChild(link);
}

/**
 * Mantém ícones estáveis (favicon.ico / 48 / 192) para o Google e abas,
 * e aplica o logo de branding (Gennesis/UNB) por cima quando diferente.
 */
function applyFavicon(brandingHref: string) {
  document.querySelectorAll("link[rel*='icon'], link[rel='apple-touch-icon']").forEach((link) => {
    link.remove();
  });

  appendIcon('icon', '/favicon.ico', undefined, 'any');
  appendIcon('icon', '/icon-48.png', 'image/png', '48x48');
  appendIcon('icon', '/icon-192.png', 'image/png', '192x192');
  appendIcon('apple-touch-icon', '/apple-touch-icon.png', undefined, '180x180');
  appendIcon('shortcut icon', '/favicon.ico');

  const isDefaultGennesis =
    brandingHref === '/logopv.png' || brandingHref === '/logobranca.png';
  if (brandingHref && !isDefaultGennesis) {
    appendIcon('icon', brandingHref, 'image/png');
  }
}

export function Favicon() {
  const { logoSrc } = useBrandingLogo();

  useEffect(() => {
    applyFavicon(logoSrc);
  }, [logoSrc]);

  return null;
}
