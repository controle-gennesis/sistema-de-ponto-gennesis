'use client';

import React, { useRef } from 'react';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { KANBAN_COVER_COLORS, coverHex, type KanbanCoverSize } from './kanbanCover';

export interface KanbanCardCoverPanelProps {
  color: string | null;
  size: KanbanCoverSize;
  /** Miniatura da foto de capa (URL já resolvida), quando houver. */
  imageSrc?: string | null;
  /** Imagens já anexadas ao cartão, que podem virar capa. */
  attachmentImages?: Array<{ id: string; fileName: string; src: string }>;
  /** Enviando/gerando a foto. */
  busy?: boolean;
  onPickFile?: (file: File) => void;
  onPickAttachment?: (attachmentId: string) => void;
  onRemoveImage?: () => void;
  /** Chamado a cada escolha (cor, tamanho ou remover); a janela do cartão salva na hora. */
  onChange: (next: { color: string | null; size: KanbanCoverSize }) => void;
  onClose: () => void;
}

/** Painel "Capa" do cartão: tamanho (faixa ou cartão inteiro), cor e remover. */
export function KanbanCardCoverPanel({
  color,
  size,
  imageSrc,
  attachmentImages = [],
  busy = false,
  onPickFile,
  onPickAttachment,
  onRemoveImage,
  onChange,
}: KanbanCardCoverPanelProps) {
  const hex = coverHex(color);
  const fileRef = useRef<HTMLInputElement>(null);
  const fill: React.CSSProperties = imageSrc
    ? { backgroundImage: `url("${imageSrc}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: hex ?? '#9ca3af' };
  const preview = (kind: KanbanCoverSize) => {
    const selected = size === kind;
    return (
      <button
        key={kind}
        type="button"
        disabled={busy}
        onClick={() => onChange({ color: imageSrc ? null : (color ?? 'blue'), size: kind })}
        aria-pressed={selected}
        aria-label={kind === 'NORMAL' ? 'Capa em faixa' : 'Capa no cartão inteiro'}
        className={clsx(
          'flex-1 rounded-lg border-2 p-1.5 transition-colors',
          selected
            ? 'border-blue-500'
            : 'border-gray-200 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-500',
        )}
      >
        {kind === 'NORMAL' ? (
          <div className="overflow-hidden rounded-md bg-gray-100 dark:bg-gray-700">
            <div className="h-6" style={fill} />
            <div className="space-y-1.5 p-2">
              <div className="h-1.5 w-4/5 rounded bg-gray-300 dark:bg-gray-500" />
              <div className="h-1.5 w-3/5 rounded bg-gray-300 dark:bg-gray-500" />
            </div>
          </div>
        ) : (
          <div className="flex h-[58px] flex-col justify-end gap-1.5 rounded-md p-2" style={fill}>
            <div className="h-1.5 w-4/5 rounded bg-white/70" />
            <div className="h-1.5 w-3/5 rounded bg-white/70" />
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Tamanho</p>
        <div className="flex gap-3">
          {preview('NORMAL')}
          {preview('FULL')}
        </div>
      </div>

      {color || imageSrc ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => (imageSrc ? onRemoveImage?.() : onChange({ color: null, size: 'NORMAL' }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Remover capa
        </button>
      ) : null}

      {onPickFile ? (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Foto</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onPickFile(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {busy ? 'Salvando foto...' : 'Enviar foto'}
          </button>
          {attachmentImages.length > 0 ? (
            <>
              <p className="mb-1.5 mt-3 text-xs text-gray-500 dark:text-gray-400">Ou use um anexo do cartão</p>
              <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
                {attachmentImages.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onPickAttachment?.(att.id)}
                    title={att.fileName}
                    aria-label={`Usar ${att.fileName} como capa`}
                    className="h-14 overflow-hidden rounded-md border border-gray-200 transition-transform hover:scale-105 disabled:opacity-60 dark:border-gray-600"
                  >
                    <img src={att.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Cores</p>
        <div className="grid grid-cols-5 gap-2">
          {KANBAN_COVER_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={busy}
              onClick={() => onChange({ color: c.key, size })}
              title={c.label}
              aria-label={c.label}
              aria-pressed={color === c.key}
              className="flex h-9 items-center justify-center rounded-md text-white transition-transform hover:scale-105"
              style={{ backgroundColor: c.hex }}
            >
              {color === c.key ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
