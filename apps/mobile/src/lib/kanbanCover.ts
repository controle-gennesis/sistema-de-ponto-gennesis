/** Capa colorida do cartão (mesma paleta do web). */
export type KanbanCoverSize = 'NORMAL' | 'FULL';

export const KANBAN_COVER_COLORS = [
  { key: 'green', label: 'Verde', hex: '#22a06b' },
  { key: 'yellow', label: 'Amarelo', hex: '#cf9f02' },
  { key: 'orange', label: 'Laranja', hex: '#e2740f' },
  { key: 'red', label: 'Vermelho', hex: '#d84a3d' },
  { key: 'purple', label: 'Roxo', hex: '#8a56c4' },
  { key: 'blue', label: 'Azul', hex: '#2f6fd0' },
  { key: 'sky', label: 'Azul-petróleo', hex: '#2a8fa6' },
  { key: 'lime', label: 'Verde-limão', hex: '#6c9b1d' },
  { key: 'pink', label: 'Rosa', hex: '#c8508f' },
  { key: 'black', label: 'Cinza', hex: '#5a6472' },
] as const;

export function coverHex(key?: string | null): string | null {
  if (!key) return null;
  return KANBAN_COVER_COLORS.find((c) => c.key === key)?.hex ?? null;
}

export function normalizeCoverSize(size?: string | null): KanbanCoverSize {
  return size === 'FULL' ? 'FULL' : 'NORMAL';
}
