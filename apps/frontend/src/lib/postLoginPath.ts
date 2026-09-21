export const EMPREITEIROS_PATH = '/ponto/empreiteiros';

export function isLinkedEmpreiteiroUser(user?: {
  empreiteiro?: { id?: string | null } | null;
  employee?: { id?: string | null } | null;
} | null): boolean {
  return Boolean(user?.empreiteiro?.id);
}

export function isEmpreiteiroAllowedPath(pathname?: string | null): boolean {
  if (!pathname) return false;
  return pathname === EMPREITEIROS_PATH || pathname.startsWith(`${EMPREITEIROS_PATH}/`);
}

export function postLoginPath(user?: {
  empreiteiro?: { id?: string | null } | null;
} | null): string {
  if (user?.empreiteiro?.id) return EMPREITEIROS_PATH;
  return '/ponto/home';
}
