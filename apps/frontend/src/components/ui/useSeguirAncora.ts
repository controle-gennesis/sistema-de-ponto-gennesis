import { useEffect, type RefObject } from 'react';

/**
 * Enquanto a lista flutuante está aberta, acompanha o campo que a abriu: se ele mudar de lugar ou de
 * tamanho sem rolagem nem redimensionar a janela (ex.: o menu lateral recolhe e a página se desloca),
 * a posição da lista é recalculada.
 */
export function useSeguirAncora(
  open: boolean,
  ancoraRef: RefObject<HTMLElement | null>,
  reposicionar: () => void
): void {
  useEffect(() => {
    if (!open) return;
    let ultimo = '';
    let frame = 0;
    const verificar = () => {
      const el = ancoraRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const atual = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
        if (ultimo && atual !== ultimo) reposicionar();
        ultimo = atual;
      }
      frame = window.requestAnimationFrame(verificar);
    };
    frame = window.requestAnimationFrame(verificar);
    return () => window.cancelAnimationFrame(frame);
  }, [open, ancoraRef, reposicionar]);
}
