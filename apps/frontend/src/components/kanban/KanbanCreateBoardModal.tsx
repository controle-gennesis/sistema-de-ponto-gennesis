'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { kanbanInput } from './kanbanFormStyles';

export interface KanbanCreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  saving?: boolean;
}

export function KanbanCreateBoardModal({
  isOpen,
  onClose,
  onCreate,
  saving = false,
}: KanbanCreateBoardModalProps) {
  const [name, setName] = useState('');

  const handleClose = () => {
    if (saving) return;
    setName('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setName('');
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Novo quadro" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nome do quadro
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Projeto Alpha"
            maxLength={80}
            autoFocus
            className={kanbanInput}
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Quadros personalizados podem ser compartilhados com outras pessoas.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Criando…' : 'Criar quadro'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
