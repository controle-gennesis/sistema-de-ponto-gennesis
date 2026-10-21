'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConstructionMaterialSearchDropdown } from '@/components/suprimentos/ConstructionMaterialSearchDropdown';
import {
  addKanbanCardMaterials,
  removeKanbanCardMaterial,
  type KanbanCardMaterial,
} from '@/lib/kanban';

interface Row {
  materialId: string;
  code: string | null;
  name: string;
  unit: string;
  qty: string;
}

const RECENTS_KEY = 'kanban-materials-recents-totvs';
const RECENTS_MAX = 15;

interface RecentMaterial {
  id: string;
  name: string;
  unit: string;
  code?: string | null;
  productType?: string | null;
}

function loadRecents(): RecentMaterial[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENTS_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecents(list: RecentMaterial[]) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
  } catch {
    /* ignore */
  }
}

function parseQty(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export interface KanbanCardMaterialsModalProps {
  isOpen: boolean;
  elevated?: boolean;
  onClose: () => void;
  cardId: string;
  selected: KanbanCardMaterial[];
  onSaved: (materials: KanbanCardMaterial[]) => void;
}

export function KanbanCardMaterialsModal({
  isOpen,
  elevated,
  onClose,
  cardId,
  selected,
  onSaved,
}: KanbanCardMaterialsModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [recents, setRecents] = useState<RecentMaterial[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setRecents(loadRecents());
    setRows(
      selected.map((m) => ({
        materialId: m.materialId,
        code: m.code,
        name: m.name,
        unit: m.unit,
        qty: String(m.quantity ?? 1).replace('.', ','),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const changed = useMemo(() => {
    const initial = new Map(selected.map((m) => [m.materialId, m.quantity ?? 1]));
    const current = new Set(rows.map((r) => r.materialId));
    const toAdd = rows
      .filter((r) => initial.get(r.materialId) !== parseQty(r.qty))
      .map((r) => ({ materialId: r.materialId, quantity: parseQty(r.qty) }));
    const toRemove = [...initial.keys()].filter((id) => !current.has(id));
    return { toAdd, toRemove };
  }, [rows, selected]);

  const hasChanges = changed.toAdd.length > 0 || changed.toRemove.length > 0;

  const toggleMaterial = (
    id: string,
    m: { code?: string | null; name: string; unit: string },
  ) => {
    setRecents((prev) => {
      const next = [{ id, ...m }, ...prev.filter((r) => r.id !== id)].slice(0, RECENTS_MAX);
      saveRecents(next);
      return next;
    });
    setRows((prev) =>
      prev.some((r) => r.materialId === id)
        ? prev.filter((r) => r.materialId !== id)
        : [
            ...prev,
            { materialId: id, code: m.code ?? null, name: m.name, unit: m.unit, qty: '1' },
          ],
    );
  };

  const setQty = (id: string, qty: string) =>
    setRows((prev) => prev.map((r) => (r.materialId === id ? { ...r, qty } : r)));

  const confirm = async () => {
    setSaving(true);
    try {
      let latest: KanbanCardMaterial[] = selected;
      for (const id of changed.toRemove) await removeKanbanCardMaterial(cardId, id);
      if (changed.toAdd.length > 0) {
        latest = await addKanbanCardMaterials(cardId, changed.toAdd);
      } else {
        latest = selected.filter((m) => !changed.toRemove.includes(m.materialId));
      }
      onSaved(latest);
      onClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || 'Não foi possível salvar os materiais');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      elevated={elevated}
      contentOverflowVisible
      onClose={onClose}
      size="xl"
      title="Materiais"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="error" onClick={confirm} loading={saving} disabled={!hasChanges}>
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Material <span className="text-red-600">*</span>
            </label>
            {rows.length > 0 ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {rows.length} selecionado{rows.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>
          <ConstructionMaterialSearchDropdown
            value=""
            onChange={(id, m) => toggleMaterial(id, m)}
            selectedIds={rows.map((r) => r.materialId)}
            stayOpenOnSelect
            showCheckbox
            onlyTotvs
            defaultOptions={recents}
            defaultOptionsLabel="Recentes"
            noFocusRing
          />
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Busque e marque os materiais para adicioná-los à lista.
          </p>
        ) : (
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-center font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 text-center font-medium">Un.</th>
                  <th className="px-3 py-2 text-center font-medium">Quantidade</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r) => (
                  <tr key={r.materialId}>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                      {r.code || '—'}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {r.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                      {r.unit}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={r.qty}
                        onChange={(e) => setQty(r.materialId, e.target.value.replace(/[^0-9.,]/g, ''))}
                        onBlur={() => setQty(r.materialId, String(parseQty(r.qty)).replace('.', ','))}
                        className="w-24 rounded-lg border-0 bg-transparent px-2 py-1 text-center text-sm text-gray-900 hover:bg-gray-50 focus:bg-gray-100 focus:outline-none dark:text-gray-100 dark:hover:bg-gray-700/50 dark:focus:bg-gray-700"
                        aria-label={`Quantidade de ${r.name}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((x) => x.materialId !== r.materialId))}
                        className="text-gray-400 hover:text-red-600"
                        aria-label={`Remover ${r.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
