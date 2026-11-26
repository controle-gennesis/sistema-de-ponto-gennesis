import type React from 'react';

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Quadros esperados depois de soltar, para o React já ter posto o cartão no lugar novo. */
const LAND_WAIT_FRAMES = 2;

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
 * inclina um pouco e segue com um leve atraso. Ao soltar (ou cancelar) ele viaja até onde o cartão ficou,
 * endireitando e voltando ao tamanho normal; o cartão de verdade só aparece quando ele chega.
 */
export function startKanbanCardDragGhost(e: React.DragEvent): void {
  const source = e.currentTarget as HTMLElement;
  const cardSelector = `[data-kanban-card-id="${CSS.escape(source.getAttribute('data-kanban-card-id') ?? '')}"]`;
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
    transition: 'none',
    animation: 'none',
    willChange: 'transform',
    borderRadius: '16px',
    // Fundo é o do próprio cartão; só a sombra marca que está «no ar». Sem contorno nem recorte,
    // para não aparecer uma bordinha em volta da capa.
    border: '1px solid transparent',
    boxShadow: '0 14px 32px rgba(0, 0, 0, 0.2)',
    // Já nasce em cima do cartão original.
    transform: `translate(${origin.left}px, ${origin.top}px)`,
  });

  const scale = Math.min(0.8, 240 / origin.width);
  const pos = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2, s: 1, r: 0 };
  let phase: 'follow' | 'land' | 'done' = 'follow';
  let raf = 0;
  let last = performance.now();
  let waited = 0;
  let landing: { from: typeof pos; start: number; duration: number } | null = null;
  const hidden = new Set<HTMLElement>();

  const draw = () => {
    clone.style.transform = `translate(${pos.x - origin.width / 2}px, ${pos.y - origin.height / 2}px) scale(${pos.s}) rotate(${pos.r}deg)`;
  };

  const finish = () => {
    if (phase === 'done') return;
    phase = 'done';
    cancelAnimationFrame(raf);
    // Mostrar o cartão e tirar a cópia no mesmo instante, para não piscar.
    hidden.forEach((el) => {
      el.style.visibility = '';
    });
    clone.remove();
  };

  const frame = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;

    if (phase === 'follow') {
      // Logo abaixo e à direita do cursor, para não cobrir onde se vai soltar.
      const k = 1 - Math.pow(1 - 0.26, dt / 16.7);
      pos.x = lerp(pos.x, mx + 14 + (origin.width * scale) / 2, k);
      pos.y = lerp(pos.y, my + 16 + (origin.height * scale) / 2, k);
      pos.s = lerp(pos.s, scale, k);
      pos.r = lerp(pos.r, -3, k);
    } else {
      const card = document.querySelector<HTMLElement>(cardSelector);
      if (card) {
        card.style.visibility = 'hidden';
        hidden.add(card);
      }
      if (waited++ >= LAND_WAIT_FRAMES) {
        const rect = card?.getBoundingClientRect();
        if (!rect?.width) {
          // Lista recolhida ou cartão fora do que está na tela: some onde está.
          clone.style.transition = 'opacity 180ms ease-out';
          clone.style.opacity = '0';
          window.setTimeout(finish, 190);
          return;
        }
        // Medido a cada quadro: os vizinhos ainda podem estar deslizando.
        const to = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        landing ??= {
          from: { ...pos },
          start: now,
          // Quanto mais longe, um pouco mais de tempo.
          duration: Math.min(480, 280 + Math.hypot(to.x - pos.x, to.y - pos.y) * 0.25),
        };
        const t = Math.min(1, (now - landing.start) / landing.duration);
        const k = 1 - Math.pow(1 - t, 3);
        pos.x = lerp(landing.from.x, to.x, k);
        pos.y = lerp(landing.from.y, to.y, k);
        pos.s = lerp(landing.from.s, rect.width / origin.width, k);
        pos.r = lerp(landing.from.r, 0, k);
        // A sombra baixa junto, como se o cartão encostasse na lista.
        clone.style.boxShadow = `0 ${lerp(14, 1, k)}px ${lerp(32, 3, k)}px rgba(0, 0, 0, ${lerp(0.2, 0.08, k)})`;
        if (t >= 1) {
          draw();
          finish();
          return;
        }
      }
    }

    draw();
    raf = requestAnimationFrame(frame);
  };

  const onOver = (ev: DragEvent) => {
    if (ev.clientX || ev.clientY) {
      mx = ev.clientX;
      my = ev.clientY;
    }
  };

  const land = () => {
    if (phase !== 'follow') return;
    phase = 'land';
    document.removeEventListener('dragover', onOver, true);
    document.removeEventListener('drop', land, true);
    document.removeEventListener('mousemove', land, true);
    source.removeEventListener('dragend', land);
    if (!clone.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    // Garantia: se a aba parar de desenhar, o cartão não pode ficar escondido.
    window.setTimeout(finish, 1500);
  };

  // Captura: as colunas interrompem o evento (stopPropagation), então escutamos antes delas.
  document.addEventListener('dragover', onOver, true);
  document.addEventListener('drop', land, true);
  source.addEventListener('dragend', land);

  // Espera o navegador iniciar o arrasto antes de mexer na página.
  window.setTimeout(() => {
    if (phase !== 'follow') return;
    document.body.appendChild(clone);
    // Garantia: o mouse só volta a se mover «normalmente» depois que o arrasto acabou.
    document.addEventListener('mousemove', land, true);
    raf = requestAnimationFrame(frame);
  }, 0);
}
