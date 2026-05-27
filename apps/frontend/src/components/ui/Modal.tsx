import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  showCloseButton?: boolean;
  headerActions?: React.ReactNode;
  /** Permite dropdowns absolutos saírem do conteúdo sem serem cortados. */
  contentOverflowVisible?: boolean;
  /** Acima de modais padrão (ex.: etiquetas/datas abertas sobre o card). */
  elevated?: boolean;
  /** Quando false, o corpo não rola — o filho controla o overflow (ex.: Kanban card). */
  scrollContent?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  showCloseButton = true,
  headerActions,
  contentOverflowVisible = false,
  elevated = false,
  scrollContent = true,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.classList.add('modal-open');
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  const modalContent = (
    <div className={clsx('fixed inset-0', elevated ? 'z-[1100]' : 'z-[1000]')}>
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={closeOnOverlayClick ? onClose : undefined}
        />

        {/* Modal */}
        <div
          className={clsx(
            'relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-h-[calc(100vh-2rem)] flex flex-col',
            contentOverflowVisible && 'overflow-visible',
            sizeClasses[size]
          )}
        >
          {/* Header */}
          {(title || showCloseButton || headerActions) && (
            <div className="flex items-center gap-3 p-6 border-b border-gray-200 dark:border-gray-700 shrink-0 w-full">
              {title ? (
                <div className="flex-1 min-w-0 pr-2">
                  {typeof title === 'string' ? (
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {title}
                    </h3>
                  ) : (
                    title
                  )}
                </div>
              ) : (
                <div className="flex-1 min-w-0" aria-hidden />
              )}
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                {headerActions}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div
            className={clsx(
              'p-6 flex-1 min-h-0',
              contentOverflowVisible
                ? 'overflow-visible'
                : scrollContent
                  ? 'overflow-y-auto [scrollbar-gutter:stable]'
                  : 'overflow-hidden flex flex-col',
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
