'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import {
  getKanbanLabelPalette,
  normalizeKanbanLabels,
  type KanbanCardLabel,
  type KanbanLabelPreset,
  labelKey,
} from './kanbanLabels';

export interface KanbanCardLabelsPanelProps {
  labels: KanbanCardLabel[];
  labelPresets?: readonly KanbanLabelPreset[];
  onClose: () => void;
  onSave: (labels: KanbanCardLabel[]) => void | Promise<void>;
}

/** Conteúdo do painel de etiquetas (usar dentro de Modal). */
export function KanbanCardLabelsPanel({
  labels: initialLabels,
  labelPresets,
  onClose,
  onSave,
}: KanbanCardLabelsPanelProps) {
  const palette = getKanbanLabelPalette(labelPresets);
  const [labels, setLabels] = useState<KanbanCardLabel[]>(() =>
    normalizeKanbanLabels(initialLabels, palette),
  );

  function toggleColor(preset: KanbanLabelPreset) {
    const existing = labels.find((l) => l.color === preset.color);
    if (existing) {
      setLabels((prev) => prev.filter((l) => l.color !== preset.color));
    } else {
      setLabels((prev) => [...prev, { color: preset.color, text: preset.name }]);
    }
  }

  function handleSave() {
    const normalized = normalizeKanbanLabels(labels, palette);
    void onSave(normalized);
    onClose();
  }

  return (
    <div className="w-full min-w-[260px]">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Clique em uma cor para adicionar ou remover.
      </p>

      <div className="space-y-2 mb-3">
        {palette.map((preset) => {
          const isOn = labels.some((l) => l.color === preset.color);

          return (
            <button
              key={preset.color}
              type="button"
              onClick={() => toggleColor(preset)}
              className="w-full flex items-center gap-2 group"
            >
              <span className="text-xs text-gray-600 dark:text-gray-400 min-w-[9.5rem] text-left truncate shrink-0">
                {preset.name}
              </span>
              <span
                className={clsx(
                  'h-8 flex-1 rounded-md flex items-center justify-end px-2 transition-opacity',
                  isOn ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
                )}
                style={{ backgroundColor: preset.color }}
              >
                {isOn && <Check className="w-4 h-4 text-white drop-shadow" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

export function KanbanLabelChips({
  labels,
  labelPresets,
}: {
  labels: KanbanCardLabel[];
  labelPresets?: readonly KanbanLabelPreset[];
}) {
  const palette = getKanbanLabelPalette(labelPresets);
  const normalized = normalizeKanbanLabels(labels, palette);
  if (normalized.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {normalized.map((l) => (
        <span
          key={labelKey(l)}
          className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white max-w-full truncate"
          style={{ backgroundColor: l.color }}
          title={l.text}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
