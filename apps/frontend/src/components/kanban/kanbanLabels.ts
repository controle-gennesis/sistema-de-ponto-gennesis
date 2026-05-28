export interface KanbanCardLabel {
  color: string;
  text: string;
}

/** Cinza (Editável) — única etiqueta com texto personalizável. */
export const KANBAN_CUSTOM_LABEL_COLOR = '#344563';

export type KanbanLabelPreset = {
  color: string;
  name: string;
  editable?: boolean;
};

/** Etiquetas padrão do Kanban — cor fixa + nome do setor. */
export const KANBAN_LABEL_PALETTE: readonly KanbanLabelPreset[] = [
  { color: '#FF78CB', name: 'DP/RH' },
  { color: '#00C2E0', name: 'Sistema' },
  { color: '#FF9F1A', name: 'Engenharia' },
  { color: '#F2D600', name: 'Suprimentos' },
  { color: '#C377E0', name: 'Contratos e Licitações' },
  { color: '#51E898', name: 'Projetos' },
  { color: '#EB5A46', name: 'Diretoria/Auditoria' },
  { color: KANBAN_CUSTOM_LABEL_COLOR, name: 'Editavel', editable: true },
];

const LEGACY_DP_LABEL_COLOR = '#ff78cb';

export function isKanbanEditableLabelColor(color: string): boolean {
  return color.trim().toLowerCase() === KANBAN_CUSTOM_LABEL_COLOR.toLowerCase();
}

export function getKanbanLabelPreset(color: string): KanbanLabelPreset | undefined {
  const normalized = color.trim().toLowerCase();
  return KANBAN_LABEL_PALETTE.find((preset) => preset.color.toLowerCase() === normalized);
}

export function getKanbanLabelNameForColor(color: string): string | undefined {
  const preset = getKanbanLabelPreset(color);
  if (!preset || preset.editable) return undefined;
  return preset.name;
}

export function normalizeKanbanLabels(labels: KanbanCardLabel[]): KanbanCardLabel[] {
  return labels.map((label) => {
    const colorKey = label.color.trim().toLowerCase();

    if (colorKey === LEGACY_DP_LABEL_COLOR && label.text.trim().toUpperCase() === 'DP') {
      return { color: label.color, text: 'DP/RH' };
    }

    if (isKanbanEditableLabelColor(label.color)) {
      return { color: label.color, text: label.text.trim() };
    }

    const fixedName = getKanbanLabelNameForColor(label.color);
    return fixedName ? { color: label.color, text: fixedName } : label;
  });
}

export function labelKey(label: KanbanCardLabel): string {
  return `${label.color}:${label.text}`;
}
