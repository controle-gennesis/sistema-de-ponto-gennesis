'use client';

import React, { useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';

type FileDropZoneProps = {
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  uploading?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
};

/**
 * Zona de clique/arraste no estilo GestaoOs / formulários (borda tracejada, ícone, hint).
 */
export function FileDropZone({
  label,
  hint = 'PNG, JPG ou PDF',
  accept = 'image/*,.pdf,application/pdf',
  multiple = false,
  disabled = false,
  uploading = false,
  onFiles,
  className = '',
}: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const blocked = disabled || uploading;

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    onFiles(Array.from(list));
  };

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!blocked) setDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(false);
        if (blocked) return;
        pick(event.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
        dragOver
          ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
          : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500 dark:hover:bg-gray-700/80'
      } ${blocked ? 'pointer-events-none opacity-60' : ''} ${className}`}
    >
      {uploading ? (
        <Loader2 className="h-7 w-7 animate-spin text-red-600 dark:text-red-400" />
      ) : (
        <ImagePlus className="h-7 w-7 text-gray-400 dark:text-gray-500" strokeWidth={1.4} />
      )}
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
        {uploading ? 'Enviando...' : label}
      </span>
      {hint ? <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span> : null}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={blocked}
        onChange={(event) => {
          pick(event.target.files);
          event.currentTarget.value = '';
        }}
      />
    </label>
  );
}
