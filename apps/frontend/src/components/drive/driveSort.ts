export type DriveSortKey = 'name' | 'owner' | 'modified' | 'size';
export type DriveSortState = { key: DriveSortKey; dir: 'asc' | 'desc' } | null;

type Sortable = { name: string; ownerName?: string | null; updatedAt: string };

/** Ordena pastas ou arquivos (cada grupo separado; pastas continuam antes dos arquivos). */
export function sortDriveItems<T extends Sortable>(
  items: T[],
  sort: DriveSortState,
  sizeOf: (item: T) => number,
): T[] {
  if (!sort) return items;
  const mult = sort.dir === 'asc' ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
  return [...items].sort((a, b) => {
    let r = 0;
    if (sort.key === 'name') r = text(a.name, b.name);
    else if (sort.key === 'owner') r = text(a.ownerName ?? '', b.ownerName ?? '') || text(a.name, b.name);
    else if (sort.key === 'modified') r = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    else r = sizeOf(a) - sizeOf(b);
    return r * mult || text(a.name, b.name);
  });
}
