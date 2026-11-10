'use client';

import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { expandShortLabelHex, KanbanLabelColorPicker } from '@/components/kanban/KanbanLabelColorPicker';
import {
  FOLDER_ICONS,
  FolderIconTile,
  isHexColor,
} from '@/components/drive/folderAppearance';

/** Campo de cor igual ao da janela de editar aba do orçamento: quadradinho que abre a paleta + código da cor. */
function CampoCorPasta({ value, onChange }: { value: string | null; onChange: (hex: string) => void }) {
  const hex = (value ?? '#EF4444').toUpperCase();
  const [texto, setTexto] = useState(hex);
  useEffect(() => setTexto(hex), [hex]);
  return (
    <div className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Cor
      </span>
      <div className="flex items-center gap-2">
        <KanbanLabelColorPicker
          className="[&_button]:shadow-none"
          color={hex}
          onChange={(c) => onChange(expandShortLabelHex(c).toLowerCase())}
        />
        <input
          type="text"
          value={texto}
          onChange={(e) => {
            let v = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, '');
            if (!v.startsWith('#')) v = `#${v.replace(/^#/, '')}`;
            if (v.length > 7) return;
            setTexto(v);
            if (/^#[0-9A-F]{6}$/.test(v)) onChange(v.toLowerCase());
          }}
          onBlur={() => {
            if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(texto)) onChange(expandShortLabelHex(texto).toLowerCase());
            else setTexto(hex);
          }}
          className="w-[4.75rem] rounded-lg border border-gray-200 bg-white px-2 py-2.5 text-center font-mono text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
          maxLength={7}
          spellCheck={false}
          aria-label="Cor da pasta"
        />
      </div>
    </div>
  );
}

type Props = {
  folder: { id: string; name: string; iconKey?: string | null; iconColor?: string | null } | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (
    id: string,
    dados: { name: string; iconKey: string | null; iconColor: string | null },
  ) => void;
};

/** Janela para editar a pasta: nome, ícone e cor, com prévia ao vivo. */
export function FolderAppearanceModal({ folder, saving, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [iconKey, setIconKey] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    setName(folder?.name ?? '');
    setErroNome(false);
    setIconKey(folder?.iconKey ?? null);
    setColor(isHexColor(folder?.iconColor) ? folder!.iconColor! : null);
  }, [folder]);

  const nomeValido = name.trim().length > 0;
  const [erroNome, setErroNome] = useState(false);
  const alterado =
    name.trim() !== (folder?.name ?? '') ||
    (iconKey ?? null) !== (folder?.iconKey ?? null) ||
    (color ?? null) !== (folder?.iconColor ?? null);
  const padrao = iconKey === null && color === null;

  const salvar = () => {
    if (!folder || saving) return;
    if (!nomeValido) {
      setErroNome(true);
      return;
    }
    // Nada mudou: só fecha.
    if (!alterado) {
      onClose();
      return;
    }
    onSave(folder.id, { name: name.trim(), iconKey, iconColor: color });
  }
;
  return (
    <Modal isOpen={!!folder} onClose={onClose} title="Editar pasta" size="md">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="drive-pasta-nome">
            Nome
          </label>
          <input
            id="drive-pasta-nome"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErroNome(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                salvar();
              }
            }}
            aria-invalid={erroNome}
            className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-500 dark:bg-gray-900 dark:text-gray-100 ${
              erroNome
                ? 'border-red-500'
                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
            }`}
          />
          {erroNome ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Informe o nome da pasta.</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <FolderIconTile
            iconKey={iconKey}
            color={color}
            className="h-12 w-12 rounded-xl"
            iconClassName="h-6 w-6"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {name.trim() || folder?.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Prévia</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Ícone</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {FOLDER_ICONS.map(({ key, label, Icon }) => {
              const ativo = (iconKey ?? 'folder') === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIconKey(key === 'folder' ? null : key)}
                  title={label}
                  aria-label={label}
                  aria-pressed={ativo}
                  className={`inline-flex h-10 w-full items-center justify-center rounded-lg border transition-colors ${
                    ativo
                      ? 'border-red-500 bg-red-50 text-red-600 dark:border-red-500 dark:bg-red-950/30 dark:text-red-400'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>

        <CampoCorPasta value={color} onChange={setColor} />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setIconKey(null);
              setColor(null);
            }}
            disabled={padrao}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RotateCcw className="h-4 w-4" /> Voltar ao padrão
          </button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <button
              type="button"
              disabled={saving}
              onClick={salvar}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
