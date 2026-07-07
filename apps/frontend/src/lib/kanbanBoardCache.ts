import type { KanbanBoard } from '@/lib/kanban';

const STORAGE_PREFIX = 'kanban-board-cache:';

export function readKanbanBoardCache(departmentKey: string): KanbanBoard | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + departmentKey);
    if (!raw) return undefined;
    return JSON.parse(raw) as KanbanBoard;
  } catch {
    return undefined;
  }
}

export function writeKanbanBoardCache(departmentKey: string, board: KanbanBoard): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + departmentKey, JSON.stringify(board));
  } catch {
    /* quota ou modo privado */
  }
}

export function patchKanbanBoardCacheCard(
  departmentKey: string,
  card: KanbanBoard['columns'][number]['cards'][number],
  columnId: string,
): void {
  const cached = readKanbanBoardCache(departmentKey);
  if (!cached) return;

  let changed = false;
  const columns = cached.columns.map((col) => {
    const without = col.cards.filter((c) => c.id !== card.id);
    if (col.id === columnId) {
      changed = true;
      return { ...col, cards: [card, ...without] };
    }
    if (without.length !== col.cards.length) {
      changed = true;
      return { ...col, cards: without };
    }
    return col;
  });

  if (changed) {
    writeKanbanBoardCache(departmentKey, { ...cached, columns });
  }
}
