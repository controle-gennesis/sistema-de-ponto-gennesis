export interface KanbanCardLabel {
  color: string;
  text: string;
}

export type KanbanLabelPreset = {
  color: string;
  name: string;
};

/** Paleta global usada como fallback quando o setor ainda não configurou etiquetas. */
export const DEFAULT_KANBAN_LABEL_PRESETS: readonly KanbanLabelPreset[] = [
  { color: '#FF78CB', name: 'DP/RH' },
  { color: '#00C2E0', name: 'Sistema' },
  { color: '#FF9F1A', name: 'Engenharia' },
  { color: '#F2D600', name: 'Suprimentos' },
  { color: '#C377E0', name: 'Contratos e Licitações' },
  { color: '#51E898', name: 'Projetos' },
  { color: '#EB5A46', name: 'Diretoria/Auditoria' },
  { color: '#344563', name: 'Geral' },
];

/** @deprecated Use getKanbanLabelPalette(boardPresets) */
export const KANBAN_LABEL_PALETTE = DEFAULT_KANBAN_LABEL_PRESETS;

const LEGACY_DP_LABEL_COLOR = '#ff78cb';

export function getKanbanLabelPalette(
  presets?: readonly KanbanLabelPreset[] | null,
): readonly KanbanLabelPreset[] {
  return presets?.length ? presets : DEFAULT_KANBAN_LABEL_PRESETS;
}

export function getKanbanLabelPreset(
  color: string,
  presets?: readonly KanbanLabelPreset[] | null,
): KanbanLabelPreset | undefined {
  const normalized = color.trim().toLowerCase();
  return getKanbanLabelPalette(presets).find(
    (preset) => preset.color.toLowerCase() === normalized,
  );
}

export function getKanbanLabelNameForColor(
  color: string,
  presets?: readonly KanbanLabelPreset[] | null,
): string | undefined {
  return getKanbanLabelPreset(color, presets)?.name;
}

export function normalizeKanbanLabels(
  labels: KanbanCardLabel[],
  presets?: readonly KanbanLabelPreset[] | null,
): KanbanCardLabel[] {
  const palette = getKanbanLabelPalette(presets);

  return labels.map((label) => {
    const colorKey = label.color.trim().toLowerCase();

    if (colorKey === LEGACY_DP_LABEL_COLOR && label.text.trim().toUpperCase() === 'DP') {
      const dpPreset = palette.find((p) => p.name === 'DP/RH');
      if (dpPreset) return { color: dpPreset.color, text: dpPreset.name };
    }

    const fixedName = getKanbanLabelNameForColor(label.color, palette);
    return fixedName ? { color: label.color, text: fixedName } : label;
  });
}

export function labelKey(label: KanbanCardLabel): string {
  return `${label.color}:${label.text}`;
}
