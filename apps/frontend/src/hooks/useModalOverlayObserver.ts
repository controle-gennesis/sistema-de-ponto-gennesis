'use client';

import { useEffect } from 'react';
import { syncModalOpenClass } from '@/lib/modalBodyLock';
import { MODAL_OVERLAY_CLASS } from '@/lib/zIndex';

/**
 * Observa overlays de modal no DOM e aplica `modal-open` (scroll + bloqueio da sidebar).
 * Montado uma vez no MainLayout.
 */
export function useModalOverlayObserver() {
  useEffect(() => {
    syncModalOpenClass();

    const observer = new MutationObserver(() => {
      syncModalOpenClass();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    };
  }, []);
}

export { MODAL_OVERLAY_CLASS };
