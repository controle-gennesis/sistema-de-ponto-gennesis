'use client';

import { useEffect, useRef, type RefObject } from 'react';

const EDGE_PX = 88;
const MAX_STEP = 24;
/** Reserva no topo (header da página) antes de subir o scroll. */
const TOP_INSET_PX = 72;

/**
 * Auto-scroll vertical (janela) e horizontal (quadro) durante drag nativo do Kanban,
 * além de permitir rolar com a roda do mouse enquanto segura o card.
 */
export function useKanbanDragScrollAssist(
  isDragging: boolean,
  boardHorizontalRef: RefObject<HTMLElement | null>,
) {
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDragging) return;

    let raf = 0;

    const autoScrollStep = () => {
      const { x, y } = pointerRef.current;
      const vh = window.innerHeight;

      if (y > vh - EDGE_PX) {
        const intensity = Math.min(1, (y - (vh - EDGE_PX)) / EDGE_PX);
        window.scrollBy({ top: MAX_STEP * intensity, behavior: 'auto' });
      } else if (y < TOP_INSET_PX + EDGE_PX) {
        const intensity = Math.min(1, (TOP_INSET_PX + EDGE_PX - y) / EDGE_PX);
        window.scrollBy({ top: -MAX_STEP * intensity, behavior: 'auto' });
      }

      const board = boardHorizontalRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        if (x > rect.right - EDGE_PX) {
          const intensity = Math.min(1, (x - (rect.right - EDGE_PX)) / EDGE_PX);
          board.scrollLeft += MAX_STEP * intensity;
        } else if (x < rect.left + EDGE_PX) {
          const intensity = Math.min(1, (rect.left + EDGE_PX - x) / EDGE_PX);
          board.scrollLeft -= MAX_STEP * intensity;
        }
      }

      raf = requestAnimationFrame(autoScrollStep);
    };

    const onDragOver = (e: DragEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      window.scrollBy({ top: e.deltaY, behavior: 'auto' });

      const board = boardHorizontalRef.current;
      if (!board) return;

      const horizontalDelta = e.deltaX !== 0 ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (horizontalDelta !== 0) {
        board.scrollLeft += horizontalDelta;
      }
    };

    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    raf = requestAnimationFrame(autoScrollStep);

    return () => {
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('wheel', onWheel, true);
      cancelAnimationFrame(raf);
    };
  }, [isDragging, boardHorizontalRef]);
}
