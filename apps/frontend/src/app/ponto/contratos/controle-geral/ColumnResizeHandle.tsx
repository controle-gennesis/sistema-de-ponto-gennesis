'use client';

import type { ReactNode } from 'react';

type ColumnResizeHandleProps = {
  width: number;
  minWidth: number;
  onWidthChange: (width: number) => void;
};

export function ColumnResizeHandle({ width, minWidth, onWidthChange }: ColumnResizeHandleProps) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar largura da coluna"
      title="Arraste para ajustar a largura"
      className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize touch-none select-none hover:bg-blue-500/40"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = width;
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (moveEvent: MouseEvent) => {
          onWidthChange(Math.max(minWidth, startWidth + moveEvent.clientX - startX));
        };
        const onUp = () => {
          document.body.style.cursor = previousCursor;
          document.body.style.userSelect = previousUserSelect;
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }}
    />
  );
}

type ResizableThProps = {
  className: string;
  width: number;
  minWidth: number;
  onWidthChange: (width: number) => void;
  children: ReactNode;
};

export function ResizableTh({
  className,
  width,
  minWidth,
  onWidthChange,
  children
}: ResizableThProps) {
  return (
    <th className={`relative ${className}`} style={{ width, maxWidth: width }}>
      <div className="overflow-hidden">{children}</div>
      <ColumnResizeHandle width={width} minWidth={minWidth} onWidthChange={onWidthChange} />
    </th>
  );
}
