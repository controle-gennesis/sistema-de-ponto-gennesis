const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';
const SIDEBAR_SELECTED_MODULE_KEY = 'sidebar-selected-module-id';
const SIDEBAR_RAIL_FAVORITES_KEY = 'sidebar-rail-favorites-v2';

/** Rail (5rem) + painel tier 2 (18rem) */
export const SIDEBAR_WIDTH_EXPANDED = '23rem';
/** Apenas o rail */
export const SIDEBAR_WIDTH_COLLAPSED = '5rem';

export const SIDEBAR_TRANSITION_CLASS = 'duration-500 ease-in-out';
/** ms — alinhado a duration-500 (borda do painel só some após fechar) */
export const SIDEBAR_TRANSITION_MS = 500;

/** Atalhos do rodapé do rail — recolhem o painel tier 2 automaticamente */
export const RAIL_FOOTER_ROUTES = [
  '/ponto/conversas',
  '/ponto/kanban',
  '/ponto/agenda',
  '/ponto/flow',
  '/ponto/drive',
  '/ponto/aprovacoes',
] as const;

export type RailFooterRoute = (typeof RAIL_FOOTER_ROUTES)[number];

const RAIL_FOOTER_ROUTE_SET = new Set<string>(RAIL_FOOTER_ROUTES);

/** Favoritos iniciais do rodapé (antes de qualquer preferência salva). */
export const DEFAULT_RAIL_FAVORITES: readonly RailFooterRoute[] = [
  '/ponto/kanban',
  '/ponto/aprovacoes',
];

export function isRailFooterRoute(pathname: string | null): boolean {
  if (pathname == null) return false;
  return RAIL_FOOTER_ROUTES.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}

/** Normaliza favoritos preservando a ordem de adição (novos no fim). */
function normalizeRailFavorites(hrefs: unknown[]): RailFooterRoute[] {
  const seen = new Set<string>();
  const ordered: RailFooterRoute[] = [];
  for (const h of hrefs) {
    if (typeof h !== 'string' || !RAIL_FOOTER_ROUTE_SET.has(h) || seen.has(h)) continue;
    seen.add(h);
    ordered.push(h as RailFooterRoute);
  }
  return ordered;
}

/** Hrefs favoritos do rodapé (ordem de adição). */
export function readRailFavorites(): RailFooterRoute[] {
  if (typeof window === 'undefined') return [...DEFAULT_RAIL_FAVORITES];
  try {
    const raw = localStorage.getItem(SIDEBAR_RAIL_FAVORITES_KEY);
    if (!raw) {
      const defaults = [...DEFAULT_RAIL_FAVORITES];
      writeRailFavorites(defaults);
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const defaults = [...DEFAULT_RAIL_FAVORITES];
      writeRailFavorites(defaults);
      return defaults;
    }
    return normalizeRailFavorites(parsed);
  } catch {
    return [...DEFAULT_RAIL_FAVORITES];
  }
}

export function writeRailFavorites(hrefs: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const ordered = normalizeRailFavorites(hrefs);
    localStorage.setItem(SIDEBAR_RAIL_FAVORITES_KEY, JSON.stringify(ordered));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isHomeRoute(pathname: string | null): boolean {
  return pathname === '/ponto/home';
}

export function shouldForceSidebarCollapsed(pathname: string | null): boolean {
  return isHomeRoute(pathname) || isRailFooterRoute(pathname);
}

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? JSON.parse(saved) === true : false;
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readSelectedModuleId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(SIDEBAR_SELECTED_MODULE_KEY);
  } catch {
    return null;
  }
}

export function writeSelectedModuleId(moduleId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SIDEBAR_SELECTED_MODULE_KEY, moduleId);
  } catch {
    /* ignore quota / private mode */
  }
}
