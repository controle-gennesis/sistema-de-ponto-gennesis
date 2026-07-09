import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';

/** Sincroniza `modal-open` no html/body quando existe overlay de modal no DOM. */
export function syncModalOpenClass() {
  if (typeof document === 'undefined') return;
  const hasOverlay = document.querySelector(`.${MODAL_OVERLAY_CLASS}`);
  document.documentElement.classList.toggle('modal-open', !!hasOverlay);
  document.body.classList.toggle('modal-open', !!hasOverlay);
}
