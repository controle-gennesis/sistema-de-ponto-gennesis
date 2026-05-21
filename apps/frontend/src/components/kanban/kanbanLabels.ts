export interface KanbanCardLabel {
  color: string;
  text: string;
}

/** Paleta de cores estilo Trello para etiquetas. */
export const KANBAN_LABEL_PALETTE = [
  { color: '#61BD4F', name: 'Verde' },
  { color: '#F2D600', name: 'Amarelo' },
  { color: '#FF9F1A', name: 'Laranja' },
  { color: '#EB5A46', name: 'Vermelho' },
  { color: '#C377E0', name: 'Roxo' },
  { color: '#0079BF', name: 'Azul' },
  { color: '#00C2E0', name: 'Ciano' },
  { color: '#51E898', name: 'Menta' },
  { color: '#FF78CB', name: 'Rosa' },
  { color: '#344563', name: 'Cinza' },
] as const;

export function labelKey(label: KanbanCardLabel): string {
  return `${label.color}:${label.text}`;
}
