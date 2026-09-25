'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, Minus, Plus, RotateCcw, X, ZoomIn } from 'lucide-react';
import toast from 'react-hot-toast';

export type FuelRequestPhotoProps = {
  src: string;
  alt: string;
  label: string;
  fileName?: string | null;
  /** Miniatura mais compacta (ex.: dentro do bloco verde de abastecimento). */
  compact?: boolean;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.35;

function sanitizeDownloadName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]+/g, '-').slice(0, 180) || 'foto';
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function FuelRequestPhoto({ src, alt, label, fileName, compact = false }: FuelRequestPhotoProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const closeViewer = useCallback(() => {
    setOpen(false);
    resetView();
  }, [resetView]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeViewer();
        return;
      }
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => clampZoom(z + ZOOM_STEP));
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => {
          const next = clampZoom(z - ZOOM_STEP);
          if (next <= 1) setOffset({ x: 0, y: 0 });
          return next;
        });
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, closeViewer]);

  useEffect(() => {
    if (!open) resetView();
  }, [open, resetView]);

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

  const zoomIn = () => setZoom((z) => clampZoom(z + ZOOM_STEP));
  const zoomOut = () =>
    setZoom((z) => {
      const next = clampZoom(z - ZOOM_STEP);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const thumbClass = compact
    ? 'group relative flex h-36 w-full max-w-[200px] items-center justify-center overflow-hidden rounded-xl border border-green-200/80 bg-gray-900/40 dark:border-green-800/60'
    : 'group relative flex h-40 w-full max-w-[280px] items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm dark:border-gray-600 dark:bg-gray-800';

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
          className={`${thumbClass} focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500`}
          title="Ampliar imagem"
        >
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full object-contain p-1 transition-transform duration-200 group-hover:scale-[1.02]"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
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
            className="fixed inset-0 z-[20000] isolate bg-black"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onWheel={onWheel}
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Fechar visualizador"
              onClick={closeViewer}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-4 pb-10 pt-4 sm:px-6">
              <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-4">
                <p className="truncate text-base font-semibold text-white">{label}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-1 rounded-full bg-white/15 p-1 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={zoomOut}
                      disabled={zoom <= MIN_ZOOM}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                      aria-label="Diminuir zoom"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-white">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={zoomIn}
                      disabled={zoom >= MAX_ZOOM}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                      aria-label="Aumentar zoom"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={resetView}
                      disabled={zoom <= MIN_ZOOM && offset.x === 0 && offset.y === 0}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                      aria-label="Resetar zoom"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {downloading ? 'Baixando…' : 'Baixar'}
                  </button>
                  <button
                    type="button"
                    onClick={closeViewer}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden px-4 pb-8 pt-20 sm:px-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className={`max-h-[calc(100vh-7rem)] max-w-full object-contain select-none ${
                  zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
                }`}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: dragging ? 'none' : 'transform 120ms ease-out',
                }}
                referrerPolicy="no-referrer"
                draggable={false}
                onClick={(e) => {
                  e.stopPropagation();
                  if (zoom <= 1) zoomIn();
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            </div>

            <p className="pointer-events-none absolute inset-x-0 bottom-4 z-20 text-center text-xs text-white/45">
              Scroll ou +/− para zoom · arraste para mover · Esc para fechar
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
