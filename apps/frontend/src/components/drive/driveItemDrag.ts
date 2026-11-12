import type React from 'react';

/** Arrastar pastas/arquivos do próprio Drive (diferente de arrastar arquivos do computador para upload). */
export const DRIVE_ITEM_MIME = 'application/x-gennesis-drive-item';

export type DriveDragItem = { type: 'folder' | 'file'; id: string };

export function isDriveItemDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(DRIVE_ITEM_MIME);
}

/** Imagem de arrasto invisível: no arrasto de vários itens quem aparece são os próprios cartões (veja `startCardStack`). */
function setBlankDragImage(e: React.DragEvent): void {
  if (typeof document === 'undefined' || typeof e.dataTransfer.setDragImage !== 'function') return;
  const blank = document.createElement('div');
  blank.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(blank);
  e.dataTransfer.setDragImage(blank, 0, 0);
  window.setTimeout(() => blank.remove(), 0);
}

const MAX_STACK_CARDS = 8;
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** O "espaço" do item na grade/lista: o filho direto do contêiner (o cartão pode estar dentro de um wrapper). */
const slotOf = (el: HTMLElement): HTMLElement => el.closest<HTMLElement>('.drive-stagger > *') ?? el;

/** FLIP: aplica a mudança de layout e anima os cartões que sobraram do lugar antigo para o novo. */
function flipLayout(change: () => void, excludeKeys: Set<string>): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-drive-key]'))
    .filter((el) => !excludeKeys.has(el.getAttribute('data-drive-key') || ''))
    .map(slotOf);
  const before = els.map((el) => el.getBoundingClientRect());
  change();
  els.forEach((el, i) => {
    const a = before[i];
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], {
      duration: 340,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  });
}

/**
 * Arrasto de vários itens: os cartões selecionados saem do lugar, voam até o cursor e viajam juntos, empilhados
 * (cada um seguindo o cursor com um pouco de atraso). Os que ficaram na tela fecham o espaço deslizando.
 * Ao soltar: se o destino aceitou, a pilha some no cursor; se cancelou, os cartões voltam para o lugar.
 */
function startCardStack(anchor: HTMLElement, keys: string[], startX: number, startY: number): (dropped: boolean) => void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anchorKey = anchor.getAttribute('data-drive-key') || '';
  const ordered = [anchorKey, ...keys.filter((k) => k !== anchorKey)];
  const origins = ordered
    .map((key) => ({ key, el: document.querySelector<HTMLElement>(`[data-drive-key="${key}"]`) }))
    .filter((o): o is { key: string; el: HTMLElement } => !!o.el);
  if (!origins.length) return () => {};

  const keySet = new Set(ordered);
  let mx = startX;
  let my = startY;
  const onOver = (ev: DragEvent) => {
    if (ev.clientX || ev.clientY) {
      mx = ev.clientX;
      my = ev.clientY;
    }
  };
  // Captura: as pastas interrompem o evento (stopPropagation), então escutamos antes delas.
  document.addEventListener('dragover', onOver, true);

  type Card = { el: HTMLElement; w: number; h: number; ox: number; oy: number; x: number; y: number; s: number; r: number };
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
  const cards: Card[] = origins.slice(0, MAX_STACK_CARDS).map(({ el }) => {
    const r = el.getBoundingClientRect();
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-drive-key');
    clone.removeAttribute('draggable');
    clone.style.cssText =
      `position:fixed;left:0;top:0;margin:0;width:${r.width}px;height:${r.height}px;box-sizing:border-box;` +
      'pointer-events:none;opacity:1;transform-origin:50% 50%;will-change:transform;animation:none;' +
      // Sempre com o visual de "selecionado" (vermelhinho), mesmo quando o item não estava selecionado.
      'background-color:#fef2f2;border:1px solid #fca5a5;box-shadow:0 8px 22px rgba(220,38,38,.25);border-radius:14px;overflow:hidden;';
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Já nasce em cima do cartão original (sem isso aparece um instante no canto superior esquerdo).
    clone.style.transform = `translate(${r.left}px,${r.top}px) scale(1) rotate(0deg)`;
    layer.appendChild(clone);
    return { el: clone, w: r.width, h: r.height, ox: cx, oy: cy, x: cx, y: cy, s: 1, r: 0 };
  });

  document.body.appendChild(layer);

  // Os originais saem do fluxo (os outros cartões fecham o espaço) e ficam invisíveis.
  const hide = () => {
    origins.forEach(({ el }) => {
      const slot = slotOf(el);
      slot.style.position = 'absolute';
      slot.style.visibility = 'hidden';
      slot.style.pointerEvents = 'none';
    });
  };
  const show = () => {
    origins.forEach(({ el }) => {
      const slot = slotOf(el);
      slot.style.position = '';
      slot.style.visibility = '';
      slot.style.pointerEvents = '';
    });
  };
  if (reduce) hide();
  else flipLayout(hide, keySet);

  // Posição de cada cartão da pilha em relação ao cursor.
  const target = (i: number) => {
    const d = Math.min(i, 4);
    return {
      x: mx + 34 + d * 5,
      y: my + 26 + d * 5,
      s: Math.min(0.55, 190 / cards[i].w),
      r: i === 0 ? -2 : (i % 2 ? 1 : -1) * (3 + d * 2.2),
    };
  };

  let mode: 'follow' | 'return' | 'vanish' = 'follow';
  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const dt = Math.min(now - last, 50);
    last = now;
    cards.forEach((c, i) => {
      let t: { x: number; y: number; s: number; r: number };
      let f: number;
      if (mode === 'return') {
        t = { x: c.ox, y: c.oy, s: 1, r: 0 };
        f = 0.28;
      } else if (mode === 'vanish') {
        t = { x: mx + 34, y: my + 26, s: 0.15, r: 0 };
        f = 0.35;
      } else {
        t = target(i);
        f = Math.max(0.1, 0.26 - i * 0.022); // quanto mais atrás na pilha, mais atrasado
      }
      const k = 1 - Math.pow(1 - f, dt / 16.7);
      c.x = lerp(c.x, t.x, k);
      c.y = lerp(c.y, t.y, k);
      c.s = lerp(c.s, t.s, k);
      c.r = lerp(c.r, t.r, k);
      c.el.style.transform = `translate(${c.x - c.w / 2}px,${c.y - c.h / 2}px) scale(${c.s}) rotate(${c.r}deg)`;
      c.el.style.zIndex = String(cards.length - i);
    });
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return (dropped: boolean) => {
    document.removeEventListener('dragover', onOver, true);
    const finish = () => {
      cancelAnimationFrame(raf);
      layer.remove();
    };
    if (dropped) {
      // Destino aceitou: a pilha some no cursor; os originais continuam ocultos até a lista atualizar.
      mode = 'vanish';
      window.setTimeout(finish, 220);
      window.setTimeout(show, 2500);
    } else {
      // Cancelado: o espaço reabre já (os outros deslizam de volta) e os cartões pousam nos lugares finais.
      mode = 'return';
      const restoreFlow = () =>
        origins.forEach(({ el }) => {
          const slot = slotOf(el);
          slot.style.position = '';
          slot.style.pointerEvents = '';
        });
      if (reduce) restoreFlow();
      else flipLayout(restoreFlow, keySet);
      cards.forEach((c, i) => {
        const r = origins[i].el.getBoundingClientRect();
        c.ox = r.left + r.width / 2;
        c.oy = r.top + r.height / 2;
      });
      window.setTimeout(() => {
        show();
        finish();
      }, 330);
    }
  };
}

/** Inicia o arrasto de um item ou de vários (a seleção atual). */
export function startDriveItemDrag(e: React.DragEvent, items: DriveDragItem | DriveDragItem[]): void {
  const list = Array.isArray(items) ? items : [items];
  e.dataTransfer.setData(DRIVE_ITEM_MIME, JSON.stringify(list));
  e.dataTransfer.effectAllowed = 'move';
  const anchor = e.currentTarget as HTMLElement;
  // Um ou vários itens: os cartões em si (menores) acompanham o cursor; sem o "fantasma" grande do navegador.
  if (anchor?.getAttribute?.('data-drive-key')) {
    setBlankDragImage(e);
    const keys = list.map((it) => `${it.type}-${it.id}`);
    const { clientX, clientY } = e;
    // Espera o navegador iniciar o arrasto antes de mexer nos cartões (esconder a origem no mesmo instante cancela o arrasto).
    window.setTimeout(() => {
      const stop = startCardStack(anchor, keys, clientX, clientY);
      anchor.addEventListener('dragend', (ev) => stop(ev.dataTransfer?.dropEffect === 'move'), { once: true });
    }, 0);
  }
}

/** Itens do arrasto (aceita o formato antigo de um item só). */
export function readDriveItemDrag(e: React.DragEvent): DriveDragItem[] {
  try {
    const raw = e.dataTransfer.getData(DRIVE_ITEM_MIME);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter(
        (o): o is DriveDragItem =>
          !!o &&
          typeof o === 'object' &&
          ((o as DriveDragItem).type === 'folder' || (o as DriveDragItem).type === 'file') &&
          typeof (o as DriveDragItem).id === 'string' &&
          !!(o as DriveDragItem).id
      )
      .map((o) => ({ type: o.type, id: o.id }));
  } catch {
    /* conteúdo inválido */
  }
  return [];
}

/**
 * Props para uma pasta aceitar itens soltos em cima dela.
 * `onHover` destaca a pasta enquanto o item está sobre ela.
 */
export function folderDropProps(
  folderId: string,
  onDropInto: ((items: DriveDragItem[], targetFolderId: string) => void) | undefined,
  onHover: (folderId: string | null) => void
) {
  if (!onDropInto) return {};
  return {
    onDragOver: (e: React.DragEvent) => {
      if (!isDriveItemDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      onHover(folderId);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!isDriveItemDrag(e)) return;
      if (!e.currentTarget.contains(e.relatedTarget as Node)) onHover(null);
    },
    onDrop: (e: React.DragEvent) => {
      if (!isDriveItemDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      onHover(null);
      // Uma pasta não pode ser solta dentro dela mesma.
      const items = readDriveItemDrag(e).filter((it) => !(it.type === 'folder' && it.id === folderId));
      if (items.length > 0) onDropInto(items, folderId);
    },
  };
}
