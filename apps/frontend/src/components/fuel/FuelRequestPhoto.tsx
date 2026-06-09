'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, X, ZoomIn } from 'lucide-react';
import toast from 'react-hot-toast';

export type FuelRequestPhotoProps = {
  src: string;
  alt: string;
  label: string;
  fileName?: string | null;
  /** Miniatura mais compacta (ex.: dentro do bloco verde de abastecimento). */
  compact?: boolean;
};

function sanitizeDownloadName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]+/g, '-').slice(0, 180) || 'foto';
}

export function FuelRequestPhoto({ src, alt, label, fileName, compact = false }: FuelRequestPhotoProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const downloadName = sanitizeDownloadName(fileName?.trim() || alt || 'foto');

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadName.includes('.') ? downloadName : `${downloadName}.jpg`;
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Não foi possível baixar a imagem.');
    } finally {
      setDownloading(false);
    }
  }, [src, downloadName, downloading]);

  return (
    <>
      <div className={compact ? 'mt-3' : undefined}>
        <span className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
          <ImageIcon className="h-4 w-4 shrink-0" />
          {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            compact
              ? 'group relative block w-full max-w-[220px] overflow-hidden rounded-xl border border-green-200/80 bg-black/5 dark:border-green-800/60 dark:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500'
              : 'group relative block w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm dark:border-gray-600 dark:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500'
          }
          title="Ampliar imagem"
        >
          <img
            src={src}
            alt={alt}
            className={
              compact
                ? 'aspect-[3/4] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]'
                : 'aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]'
            }
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/35 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
              <ZoomIn className="h-4 w-4" />
              Ampliar
            </span>
          </div>
        </button>
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[10050] flex flex-col bg-black/92"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={label}
          >
            <div
              className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="truncate text-sm font-medium text-white">{label}</p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {downloading ? 'Baixando…' : 'Baixar'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div
              className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={src}
                alt={alt}
                className="max-h-[calc(100vh-5rem)] max-w-full rounded-lg object-contain shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
