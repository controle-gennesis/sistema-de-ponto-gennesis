'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { kanbanInput, kanbanLabel } from './kanbanFormStyles';
import {
  KANBAN_LABEL_PALETTE,
  type KanbanCardLabel,
  labelKey,
} from './kanbanLabels';

export interface KanbanCardLabelsPanelProps {
  labels: KanbanCardLabel[];
  onClose: () => void;
  onSave: (labels: KanbanCardLabel[]) => void | Promise<void>;
  saving?: boolean;
}

/** Conteúdo do painel de etiquetas (usar dentro de Modal). */
export function KanbanCardLabelsPanel({
  labels: initialLabels,
  onClose,
  onSave,
  saving,
}: KanbanCardLabelsPanelProps) {
  const [labels, setLabels] = useState<KanbanCardLabel[]>(initialLabels);
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  function toggleColor(color: string, defaultName: string) {
    const existing = labels.find((l) => l.color === color);
    if (existing) {
      setLabels((prev) => prev.filter((l) => l.color !== color));
      if (editingColor === color) setEditingColor(null);
    } else {
      const next: KanbanCardLabel = { color, text: defaultName };
      setLabels((prev) => [...prev, next]);
      setEditingColor(color);
      setEditText(defaultName);
    }
  }

  function updateLabelText(color: string, text: string) {
    setLabels((prev) =>
      prev.map((l) => (l.color === color ? { ...l, text: text.trim() || l.text } : l)),
    );
  }

  return (
    <div className="w-full min-w-[260px]">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Clique em uma cor para adicionar ou remover.
      </p>

      <div className="space-y-2 mb-3">
        {KANBAN_LABEL_PALETTE.map((preset) => {
          const isOn = labels.some((l) => l.color === preset.color);
          const current = labels.find((l) => l.color === preset.color);

          return (
            <button
              key={preset.color}
              type="button"
              onClick={() => toggleColor(preset.color, preset.name)}
              className="w-full flex items-center gap-2 group"
            >
              <span
                className={clsx(
                  'h-8 flex-1 rounded-md flex items-center justify-end px-2 transition-opacity',
                  isOn ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
                )}
                style={{ backgroundColor: preset.color }}
              >
                {isOn && <Check className="w-4 h-4 text-white drop-shadow" />}
              </span>
              {isOn && current?.text && (
                <span className="text-xs text-gray-600 dark:text-gray-400 min-w-[4rem] text-left truncate">
                  {current.text}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {editingColor && labels.some((l) => l.color === editingColor) && (
        <div className="mb-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <label className={kanbanLabel}>Nome da etiqueta</label>
          <input
            type="text"
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              updateLabelText(editingColor, e.target.value);
            }}
            className={kanbanInput}
            placeholder="Ex: Urgente"
          />
        </div>
      )}

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
          disabled={saving}
          onClick={async () => {
            await Promise.resolve(onSave(labels));
            onClose();
          }}
          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

export function KanbanLabelChips({ labels }: { labels: KanbanCardLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => (
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
