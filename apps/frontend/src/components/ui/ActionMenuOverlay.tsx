'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Z_ACTION_MENU } from '@/lib/zIndex';

type ActionMenuOverlayProps = {
  open: boolean;
  onClose: () => void;
  top: number;
  left: number;
  children: React.ReactNode;
  /** Largura do painel (classes Tailwind). Default: w-56 */
  panelClassName?: string;
  /** Estilos extras do painel (ex.: width fixa). */
  panelStyle?: React.CSSProperties;
  maxHeight?: number;
  /** Abre acima do botão (translateY -100%). */
  placement?: 'below' | 'above';
  zIndex?: number;
  /**
   * `auto` (default): o painel inteiro rola.
   * `hidden`: o painel não rola — o scroll fica no conteúdo interno (ex.: lista + footer fixo).
   * `visible`: sem clip (ex.: setinha/caret fora do painel).
   */
  panelOverflow?: 'auto' | 'hidden' | 'visible';
};

/**
 * Overlay + menu ⋮: o painel fica *dentro* do backdrop para o clique
 * nas opções não ser engolido pelo z-index do overlay.
 */
export function ActionMenuOverlay({
  open,
  onClose,
  top,
  left,
  children,
  panelClassName = 'w-56',
  panelStyle,
  maxHeight,
  placement = 'below',
  zIndex = Z_ACTION_MENU,
  panelOverflow = 'auto',
}: ActionMenuOverlayProps) {
  if (!open || typeof document === 'undefined') return null;

  const overflowClass =
    panelOverflow === 'hidden'
      ? 'overflow-hidden'
      : panelOverflow === 'visible'
        ? 'overflow-visible'
        : 'overflow-y-auto overflow-x-hidden';

  const positionStyle: React.CSSProperties =
    placement === 'above'
      ? {
          top: 'auto',
          bottom: `calc(100vh - ${top}px)`,
          left,
          maxHeight,
        }
      : {
          top,
          left,
          maxHeight,
        };

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex }} onClick={onClose}>
      <div
        role="menu"
        className={`absolute rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 ${overflowClass} ${panelClassName}`}
        style={{ ...positionStyle, ...panelStyle }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
