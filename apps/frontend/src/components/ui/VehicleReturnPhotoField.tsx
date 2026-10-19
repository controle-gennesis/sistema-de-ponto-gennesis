'use client';

import React, { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a foto'));
    reader.readAsDataURL(file);
  });
}

/** Arquivo solto na área: aceita pelo tipo ou, quando o navegador não informa o tipo (ex.: HEIC), pela extensão. */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
}

function dragHasFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

type VehicleReturnPhotoFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  photoAlt?: string;
};

const emptyPhotoButtonClassName =
  'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white text-gray-500 transition-colors hover:border-red-400 hover:bg-red-50/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-red-500 dark:hover:bg-red-950/20 dark:hover:text-red-400';

/** Mesmo visual do hover, mantido enquanto o arquivo está sendo arrastado sobre a área. */
const draggingPhotoButtonClassName =
  'border-red-500 bg-red-50/60 text-red-600 dark:border-red-500 dark:bg-red-950/30 dark:text-red-400';

export function VehicleReturnPhotoField({
  value,
  onChange,
  disabled = false,
  emptyLabel = 'Tocar para fotografar o veículo',
  photoAlt = 'Foto do veículo',
}: VehicleReturnPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState('');

  const handleFile = async (file: File | null | undefined) => {
    if (!file || disabled) return;
    setLoading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setDropError('');
      onChange(dataUrl);
    } finally {
      setLoading(false);
    }
  };

  const canDrop = !disabled && !loading;

  const handleDragOver = (event: React.DragEvent) => {
    if (!dragHasFiles(event)) return;
    // Sem isso o navegador não permite soltar e abre o arquivo em outra aba.
    event.preventDefault();
    if (!canDrop) return;
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    // Ignora o "leave" ao passar por cima de elementos filhos (ícone, texto, imagem).
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    if (!canDrop) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!isImageFile(file)) {
      setDropError('Envie uma imagem (JPG, PNG ou similar).');
      return;
    }
    void handleFile(file);
  };

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || loading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={photoAlt} className="mx-auto max-h-48 w-full object-contain" />
          {!disabled ? (
            <button
              type="button"
              onClick={() => {
                setDropError('');
                onChange('');
              }}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Remover foto"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          {dragging ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-600/70 text-sm font-medium text-white">
              Solte para substituir a foto
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => inputRef.current?.click()}
          className={`${emptyPhotoButtonClassName} ${dragging ? draggingPhotoButtonClassName : ''}`}
        >
          <Camera className="h-8 w-8" />
          <span className="text-sm font-medium">
            {loading ? 'Carregando foto...' : dragging ? 'Solte a imagem aqui' : emptyLabel}
          </span>
          {!loading && !dragging ? (
            <span className="hidden text-xs opacity-80 sm:block">ou arraste a imagem para cá</span>
          ) : null}
        </button>
      )}
      {dropError ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {dropError}
        </p>
      ) : null}
    </div>
  );
}

export function isBlankVehiclePhoto(value: string): boolean {
  return !value || !value.startsWith('data:image/');
}
