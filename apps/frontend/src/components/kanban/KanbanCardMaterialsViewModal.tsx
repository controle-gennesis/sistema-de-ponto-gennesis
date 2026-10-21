'use client';

import React from 'react';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from '@/components/ui/Modal';
import type { KanbanCardMaterial } from '@/lib/kanban';

export interface KanbanCardMaterialsViewModalProps {
  isOpen: boolean;
  elevated?: boolean;
  onClose: () => void;
  materials: KanbanCardMaterial[];
  cardTitle?: string;
}

export function KanbanCardMaterialsViewModal({
  isOpen,
  elevated,
  onClose,
  materials,
  cardTitle,
}: KanbanCardMaterialsViewModalProps) {
  const download = () => {
    const rows = [
      ['Código', 'Nome', 'Unidade', 'Quantidade'],
      ...materials.map((m) => [m.code ?? '', m.name, m.unit, Number(m.quantity ?? 1)]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 70 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materiais');
    const safe = (cardTitle || 'card').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'card';
    XLSX.writeFile(wb, `materiais-${safe}.xlsx`);
  };

  return (
    <Modal
      isOpen={isOpen}
      elevated={elevated}
      onClose={onClose}
      size="xl"
      title={`Materiais (${materials.length})`}
      headerActions={
        <button
          type="button"
          onClick={download}
          title="Baixar planilha"
          aria-label="Baixar planilha"
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <Download className="h-5 w-5" />
        </button>
      }
    >
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2 text-center font-medium">Código</th>
              <th className="px-3 py-2 text-left font-medium">Nome</th>
              <th className="px-3 py-2 text-center font-medium">Un.</th>
              <th className="px-3 py-2 text-center font-medium">Quantidade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {materials.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                  {m.code || '—'}
                </td>
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{m.name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-gray-600 dark:text-gray-300">
                  {m.unit}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-center text-gray-900 dark:text-gray-100">
                  {Number(m.quantity ?? 1).toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
