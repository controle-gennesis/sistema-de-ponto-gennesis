import { API_BASE_URL } from './apiBaseUrl';

const FRONTEND_PUBLIC_ORIGIN =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL?.trim()) ||
  'http://localhost:3000';

/** Caminho no /public do Next (avatar da Gennecy/Luna). */
export const GENNECY_BOT_AVATAR_PATH = '/Logo%20-%20Luna.png';

function isBackendUploadPath(path: string): boolean {
  return path.startsWith('/uploads') || path.startsWith('/api/');
}

/** Placeholder legado do app (`mobile:assinatura-tecnico`) — não é arquivo real. */
export function isGestaoOsMediaPlaceholder(url: string | null | undefined): boolean {
  const u = String(url || '').trim();
  if (!u) return true;
  if (/^mobile:/i.test(u)) return true;
  if (/^app:/i.test(u)) return true;
  return false;
}

/** URL que pode ser aberta/baixada (upload, http ou data URL). */
export function isOpenableMediaUrl(url: string | null | undefined): boolean {
  const u = String(url || '').trim();
  if (!u || isGestaoOsMediaPlaceholder(u)) return false;
  if (/^data:image\//i.test(u)) return true;
  if (/^https?:\/\//i.test(u)) return true;
  if (u.startsWith('/uploads') || u.startsWith('/api/')) return true;
  return false;
}

/** URLs relativas `/uploads/...` → API; arquivos do /public do Next → frontend. */
export function resolveApiMediaUrl(url: string | null | undefined): string | undefined {
  if (url == null || String(url).trim() === '') return undefined;
  const u = String(url).trim();
  if (isGestaoOsMediaPlaceholder(u)) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:image\//i.test(u)) return u;
  if (u.startsWith('/')) {
    if (isBackendUploadPath(u)) {
      const apiOrigin = API_BASE_URL.replace(/\/api\/?$/i, '').replace(/\/$/, '');
      return `${apiOrigin}${u}`;
    }
    const feOrigin =
      typeof window !== 'undefined'
        ? window.location.origin
        : FRONTEND_PUBLIC_ORIGIN.replace(/\/$/, '');
    return `${feOrigin}${u}`;
  }
  return undefined;
}

export function hasFuelStoredPhoto(
  url?: string | null,
  key?: string | null,
): boolean {
  return Boolean(String(url || '').trim() || String(key || '').trim());
}

/** Prioriza URL resolvida pela API (ex.: S3 assinada); senão tenta URL legada. */
export function resolveFuelPhotoSrc(
  viewUrl?: string | null,
  fallbackUrl?: string | null,
): string | undefined {
  const resolved = viewUrl?.trim() || resolveApiMediaUrl(fallbackUrl);
  return resolved || undefined;
}
