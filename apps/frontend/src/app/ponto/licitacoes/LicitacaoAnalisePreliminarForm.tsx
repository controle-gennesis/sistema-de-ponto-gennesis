'use client';

import { useRef, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  clampAnalisePreliminarRowHeight,
  createAnalisePreliminarRow,
  defaultAnalisePreliminarRowHeight,
  isAnalisePreliminarCurrencyRow,
  maskAnalisePreliminarValorInput,
  type AnalisePreliminarData,
  type AnalisePreliminarRow,
} from './licitacaoAnalisePreliminar';

type Props = {
  value: AnalisePreliminarData;
  onChange: (next: AnalisePreliminarData) => void;
  disabled?: boolean;
};

function moveRow(rows: AnalisePreliminarRow[], fromId: string, toId: string): AnalisePreliminarRow[] {
  if (fromId === toId) return rows;
  const fromIndex = rows.findIndex((row) => row.id === fromId);
  const toIndex = rows.findIndex((row) => row.id === toId);
  if (fromIndex < 0 || toIndex < 0) return rows;
  const next = [...rows];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function LicitacaoAnalisePreliminarForm({ value, onChange, disabled }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const updateCabecalho = (cabecalho: string) => {
    onChange({ ...value, cabecalho });
  };

  const updateRow = (
    id: string,
    patch: Partial<Pick<AnalisePreliminarRow, 'label' | 'value' | 'currency' | 'heightPx'>>
  ) => {
    onChange({
      ...value,
      rows: value.rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.label !== undefined) {
          next.currency = isAnalisePreliminarCurrencyRow(next);
        }
        if (patch.heightPx !== undefined) {
          next.heightPx = clampAnalisePreliminarRowHeight(patch.heightPx);
        }
        return next;
      }),
    });
  };

  const addRow = () => {
    onChange({
      ...value,
      rows: [...value.rows, createAnalisePreliminarRow()],
    });
  };

  const removeRow = (id: string) => {
    if (value.rows.length <= 1) return;
    onChange({
      ...value,
      rows: value.rows.filter((row) => row.id !== id),
    });
  };

  const reorderRows = (fromId: string, toId: string) => {
    const nextRows = moveRow(value.rows, fromId, toId);
    if (nextRows === value.rows) return;
    onChange({ ...value, rows: nextRows });
  };

  const clearDragState = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setOverId(null);
  };

  const persistRowHeight = (id: string, el: HTMLTextAreaElement | null) => {
    if (!el || disabled) return;
    const nextHeight = clampAnalisePreliminarRowHeight(el.offsetHeight);
    const current = value.rows.find((row) => row.id === id);
    if (!current || current.heightPx === nextHeight) return;
    updateRow(id, { heightPx: nextHeight });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-gray-900 dark:border-gray-300">
        <label className="block border-b border-gray-900 bg-white dark:border-gray-300 dark:bg-gray-950">
          <span className="sr-only">Cabeçalho do documento</span>
          <input
            type="text"
            value={value.cabecalho}
            onChange={(e) => updateCabecalho(e.target.value)}
            disabled={disabled}
            placeholder="PREGÃO ELETRÔNICO Nº … — ATA"
            className="w-full bg-transparent px-3 py-3 text-center text-sm font-bold uppercase tracking-wide text-gray-900 outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:text-gray-100"
          />
        </label>

        <table className="w-full border-collapse text-sm">
          <tbody>
            {value.rows.map((row) => {
              const isCurrency = isAnalisePreliminarCurrencyRow(row);
              const isDragging = draggingId === row.id;
              const isOver = overId === row.id && draggingId !== row.id;
              const heightPx =
                row.heightPx ?? defaultAnalisePreliminarRowHeight(row.label);

              return (
                <tr
                  key={row.id}
                  onDragOver={(e) => {
                    if (disabled || !dragIdRef.current) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (overId !== row.id) setOverId(row.id);
                  }}
                  onDrop={(e) => {
                    if (disabled) return;
                    e.preventDefault();
                    const fromId = dragIdRef.current || e.dataTransfer.getData('text/plain');
                    if (fromId) reorderRows(fromId, row.id);
                    clearDragState();
                  }}
                  className={`border-t border-gray-900 dark:border-gray-300 ${
                    isDragging ? 'opacity-50' : ''
                  } ${isOver ? 'bg-sky-50/80 dark:bg-sky-950/40' : ''}`}
                >
                  <th
                    scope="row"
                    className="w-[13rem] shrink-0 border-r border-gray-900 bg-white p-0 align-top dark:border-gray-300 dark:bg-gray-950 sm:w-[15.5rem]"
                  >
                    <div className="flex items-start">
                      <span
                        role="button"
                        tabIndex={disabled ? -1 : 0}
                        draggable={!disabled}
                        aria-disabled={disabled || undefined}
                        title="Arrastar para reordenar"
                        aria-label="Arrastar para reordenar"
                        onKeyDown={(e) => {
                          if (disabled) return;
                          const index = value.rows.findIndex((r) => r.id === row.id);
                          if (index < 0) return;
                          if (e.key === 'ArrowUp' && index > 0) {
                            e.preventDefault();
                            reorderRows(row.id, value.rows[index - 1].id);
                          } else if (e.key === 'ArrowDown' && index < value.rows.length - 1) {
                            e.preventDefault();
                            reorderRows(row.id, value.rows[index + 1].id);
                          }
                        }}
                        onDragStart={(e) => {
                          if (disabled) {
                            e.preventDefault();
                            return;
                          }
                          dragIdRef.current = row.id;
                          setDraggingId(row.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', row.id);
                        }}
                        onDragEnd={clearDragState}
                        className={`mt-1.5 ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors ${
                          disabled
                            ? 'cursor-not-allowed opacity-40'
                            : 'cursor-grab hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing dark:hover:bg-gray-800 dark:hover:text-gray-200'
                        }`}
                      >
                        <GripVertical className="h-4 w-4" aria-hidden />
                      </span>
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) => updateRow(row.id, { label: e.target.value })}
                        disabled={disabled}
                        placeholder="CAMPO"
                        className="min-w-0 flex-1 bg-transparent px-2 py-2 text-right text-xs font-bold uppercase tracking-wide text-gray-900 outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:text-gray-100 sm:px-3 sm:text-sm"
                      />
                    </div>
                  </th>
                  <td className="bg-white p-0 align-top dark:bg-gray-950">
                    <div className="flex items-start gap-1">
                      <textarea
                        value={row.value}
                        onChange={(e) =>
                          updateRow(row.id, {
                            value: isCurrency
                              ? maskAnalisePreliminarValorInput(e.target.value)
                              : e.target.value,
                          })
                        }
                        onMouseUp={(e) => persistRowHeight(row.id, e.currentTarget)}
                        onTouchEnd={(e) => persistRowHeight(row.id, e.currentTarget)}
                        onBlur={(e) => persistRowHeight(row.id, e.currentTarget)}
                        disabled={disabled}
                        inputMode={isCurrency ? 'decimal' : 'text'}
                        placeholder={isCurrency ? 'R$ 0,00' : undefined}
                        title="Arraste o canto inferior direito para ajustar a altura"
                        style={{ height: heightPx }}
                        className="min-h-9 min-w-0 flex-1 resize-y overflow-auto bg-transparent px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        title="Excluir linha"
                        aria-label="Excluir linha"
                        disabled={disabled || value.rows.length <= 1}
                        onClick={() => removeRow(row.id)}
                        className="mt-1.5 mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={addRow}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Adicionar linha
      </button>
    </div>
  );
}
