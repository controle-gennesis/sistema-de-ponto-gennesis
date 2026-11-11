import type React from 'react';

/** Arrastar pastas/arquivos do próprio Drive (diferente de arrastar arquivos do computador para upload). */
export const DRIVE_ITEM_MIME = 'application/x-gennesis-drive-item';

export type DriveDragItem = { type: 'folder' | 'file'; id: string };

export function isDriveItemDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(DRIVE_ITEM_MIME);
}

export function startDriveItemDrag(e: React.DragEvent, item: DriveDragItem): void {
  e.dataTransfer.setData(DRIVE_ITEM_MIME, JSON.stringify(item));
  e.dataTransfer.effectAllowed = 'move';
}

export function readDriveItemDrag(e: React.DragEvent): DriveDragItem | null {
  try {
    const raw = e.dataTransfer.getData(DRIVE_ITEM_MIME);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<DriveDragItem>;
    if ((o.type === 'folder' || o.type === 'file') && typeof o.id === 'string' && o.id) {
      return { type: o.type, id: o.id };
    }
  } catch {
    /* conteúdo inválido */
  }
  return null;
}

/**
 * Props para uma pasta aceitar itens soltos em cima dela.
 * `onHover` destaca a pasta enquanto o item está sobre ela.
 */
export function folderDropProps(
  folderId: string,
  onDropInto: ((item: DriveDragItem, targetFolderId: string) => void) | undefined,
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
      const item = readDriveItemDrag(e);
      if (item && !(item.type === 'folder' && item.id === folderId)) onDropInto(item, folderId);
    },
  };
}
