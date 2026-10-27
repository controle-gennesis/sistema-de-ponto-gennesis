import { useCallback, useRef, useState } from 'react';

export interface UseResizableColumnsOptions {
  initialWidths: number[];
  minWidth?: number;
}

export function useResizableColumns({ initialWidths, minWidth = 40 }: UseResizableColumnsOptions) {
  const [widths, setWidths] = useState<number[]>(initialWidths);
  const dragging = useRef<{ colIndex: number; startX: number; startWidth: number } | null>(null);

  const onMouseDown = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = widths[colIndex];
      dragging.current = { colIndex, startX, startWidth };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const diff = ev.clientX - dragging.current.startX;
        const newWidth = Math.max(minWidth, dragging.current.startWidth + diff);
        setWidths((prev) => {
          const next = [...prev];
          next[dragging.current!.colIndex] = newWidth;
          return next;
        });
      };

      const onMouseUp = () => {
        dragging.current = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [widths, minWidth],
  );

  return { widths, onMouseDown, setWidths };
}
