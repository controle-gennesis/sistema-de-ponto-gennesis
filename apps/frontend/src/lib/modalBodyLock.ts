import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';

/**
 * Considera só overlays que realmente bloqueiam interação
 * (visíveis e com pointer-events ativos).
 */
export function hasBlockingModalOverlay(): boolean {
  if (typeof document === 'undefined') return false;
  const overlays = document.querySelectorAll<HTMLElement>(`.${MODAL_OVERLAY_CLASS}`);
  for (const el of overlays) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.pointerEvents === 'none') continue;
    if (Number(style.opacity) === 0) continue;
    return true;
  }
  return false;
}

/** Sincroniza `modal-open` no html/body quando existe overlay de modal no DOM. */
export function syncModalOpenClass() {
  if (typeof document === 'undefined') return;
  const hasOverlay = hasBlockingModalOverlay();
  document.documentElement.classList.toggle('modal-open', hasOverlay);
  document.body.classList.toggle('modal-open', hasOverlay);
}
