import type React from 'react';

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Imagem de arrasto invisível: quem aparece é a cópia do cartão que segue o cursor. */
function setBlankDragImage(e: React.DragEvent): void {
  if (typeof e.dataTransfer.setDragImage !== 'function') return;
  const blank = document.createElement('div');
  blank.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(blank);
  e.dataTransfer.setDragImage(blank, 0, 0);
  window.setTimeout(() => blank.remove(), 0);
}

/**
 * Cartão flutuando atrás do cursor durante o arrasto, no mesmo estilo do Drive: sai do lugar, encolhe,
 * inclina um pouco e segue com um leve atraso. Ao soltar some no cursor; se cancelar, volta ao lugar.
 */
export function startKanbanCardDragGhost(e: React.DragEvent): void {
  const source = e.currentTarget as HTMLElement;
  const origin = source.getBoundingClientRect();
  let mx = e.clientX;
  let my = e.clientY;
  setBlankDragImage(e);

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute('data-kanban-card');
  clone.removeAttribute('data-kanban-card-id');
  clone.removeAttribute('draggable');
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    margin: '0',
    width: `${origin.width}px`,
    height: `${origin.height}px`,
    boxSizing: 'border-box',
    zIndex: '9999',
    pointerEvents: 'none',
    opacity: '1',
    overflow: 'hidden',
    transition: 'none',
    animation: 'none',
    willChange: 'transform',
    borderRadius: '16px',
    // Fundo é o do próprio cartão; só a sombra marca que está «no ar».
    border: '1px solid rgba(0, 0, 0, 0.08)',
    boxShadow: '0 14px 32px rgba(0, 0, 0, 0.2)',
    // Já nasce em cima do cartão original.
    transform: `translate(${origin.left}px, ${origin.top}px)`,
  });

  const scale = Math.min(0.8, 240 / origin.width);
  const pos = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2, s: 1, r: 0, o: 1 };
  let mode: 'follow' | 'return' | 'vanish' = 'follow';
  let raf = 0;
  let last = performance.now();

  const frame = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    const target =
      mode === 'return'
        ? { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2, s: 1, r: 0, o: 1 }
        : mode === 'vanish'
          ? { x: mx + 34, y: my + 26, s: scale * 0.4, r: 0, o: 0 }
          : // Logo abaixo e à direita do cursor, para não cobrir onde se vai soltar.
            { x: mx + 14 + (origin.width * scale) / 2, y: my + 16 + (origin.height * scale) / 2, s: scale, r: -3, o: 0.97 };
    const k = 1 - Math.pow(1 - (mode === 'follow' ? 0.26 : 0.3), dt / 16.7);
    pos.x = lerp(pos.x, target.x, k);
    pos.y = lerp(pos.y, target.y, k);
    pos.s = lerp(pos.s, target.s, k);
    pos.r = lerp(pos.r, target.r, k);
    pos.o = lerp(pos.o, target.o, k);
    clone.style.transform = `translate(${pos.x - origin.width / 2}px, ${pos.y - origin.height / 2}px) scale(${pos.s}) rotate(${pos.r}deg)`;
    clone.style.opacity = String(pos.o);
    raf = requestAnimationFrame(frame);
  };

  const onOver = (ev: DragEvent) => {
    if (ev.clientX || ev.clientY) {
      mx = ev.clientX;
      my = ev.clientY;
    }
  };

  const stop = (dropped: boolean) => {
    if (mode !== 'follow') return;
    mode = dropped ? 'vanish' : 'return';
    document.removeEventListener('dragover', onOver, true);
    document.removeEventListener('drop', onDrop, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    source.removeEventListener('dragend', onEnd);
    window.setTimeout(
      () => {
        cancelAnimationFrame(raf);
        clone.remove();
      },
      dropped ? 180 : 260,
    );
  };
  const onDrop = () => stop(true);
  const onEnd = (ev: DragEvent) => stop(ev.dataTransfer?.dropEffect === 'move');
  // Garantia: o mouse só volta a se mover «normalmente» depois que o arrasto acabou.
  const onMouseMove = () => stop(false);

  // Captura: as colunas interrompem o evento (stopPropagation), então escutamos antes delas.
  document.addEventListener('dragover', onOver, true);
  document.addEventListener('drop', onDrop, true);
  source.addEventListener('dragend', onEnd);

  // Espera o navegador iniciar o arrasto antes de mexer na página.
  window.setTimeout(() => {
    if (mode !== 'follow') return;
    document.body.appendChild(clone);
    document.addEventListener('mousemove', onMouseMove, true);
    raf = requestAnimationFrame(frame);
  }, 0);
}
