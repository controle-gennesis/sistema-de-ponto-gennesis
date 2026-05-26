const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

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
