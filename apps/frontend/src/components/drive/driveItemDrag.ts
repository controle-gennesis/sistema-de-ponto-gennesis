import type React from 'react';

/** Arrastar pastas/arquivos do próprio Drive (diferente de arrastar arquivos do computador para upload). */
export const DRIVE_ITEM_MIME = 'application/x-gennesis-drive-item';

export type DriveDragItem = { type: 'folder' | 'file'; id: string };

export function isDriveItemDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(DRIVE_ITEM_MIME);
}

/** Miniatura do arrasto de vários itens: pilha de cartões com a quantidade num selo vermelho. */
function setCountDragImage(e: React.DragEvent, count: number): void {
  if (typeof document === 'undefined' || typeof e.dataTransfer.setDragImage !== 'function') return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;top:-400px;left:-400px;width:184px;height:72px;pointer-events:none;';

  const card = (dx: number, dy: number, opacity: number) => {
    const d = document.createElement('div');
    d.style.cssText =
      `position:absolute;left:${dx}px;top:${dy}px;width:156px;height:46px;box-sizing:border-box;border-radius:12px;` +
      `background:#fff;border:1px solid #fca5a5;opacity:${opacity};box-shadow:0 2px 6px rgba(0,0,0,.08);`;
    return d;
  };
  wrap.appendChild(card(14, 14, 0.45));
  wrap.appendChild(card(7, 7, 0.75));

  const front = card(0, 0, 1);
  front.style.border = '1px solid #f87171';
  front.style.boxShadow = '0 10px 24px rgba(220,38,38,.28)';
  front.style.display = 'flex';
  front.style.alignItems = 'center';
  front.style.padding = '0 14px';
  front.style.font = '600 13px system-ui,-apple-system,sans-serif';
  front.style.color = '#111827';
  front.textContent = `Movendo ${count} itens`;
  wrap.appendChild(front);

  const badge = document.createElement('div');
  badge.textContent = String(count);
  badge.style.cssText =
    'position:absolute;top:-9px;right:20px;min-width:24px;height:24px;padding:0 6px;box-sizing:border-box;' +
    'border-radius:12px;background:#dc2626;color:#fff;font:700 12px system-ui,sans-serif;' +
    'display:flex;align-items:center;justify-content:center;border:2px solid #fff;';
  wrap.appendChild(badge);

  document.body.appendChild(wrap);
  e.dataTransfer.setDragImage(wrap, 24, 24);
  window.setTimeout(() => wrap.remove(), 0);
}

/** Inicia o arrasto de um item ou de vários (a seleção atual). */
export function startDriveItemDrag(e: React.DragEvent, items: DriveDragItem | DriveDragItem[]): void {
  const list = Array.isArray(items) ? items : [items];
  e.dataTransfer.setData(DRIVE_ITEM_MIME, JSON.stringify(list));
  e.dataTransfer.effectAllowed = 'move';
  if (list.length > 1) setCountDragImage(e, list.length);
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
