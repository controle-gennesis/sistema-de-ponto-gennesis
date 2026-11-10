import { useEffect } from 'react';

/**
 * Fecha o menu de três pontinhos ao clicar em qualquer lugar fora dele (ou apertar Esc).
 * O botão e o painel do menu levam `data-drive-menu` para não contarem como "fora".
 */
export function useDriveMenuDismiss(aberto: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('[data-drive-menu]')) return;
      fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto, fechar]);
}
