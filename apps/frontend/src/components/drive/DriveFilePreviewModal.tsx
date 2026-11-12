'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { Z_LIGHTBOX } from '@/lib/zIndex';

/** Mesmo visual do lightbox de anexos das Fichas de Demanda (FilePreviewCard), para arquivos do Drive. */

export type DrivePreviewFile = {
  id: string;
  name: string;
  mimeType: string;
};

type Kind = 'image' | 'video' | 'pdf' | 'spreadsheet' | 'other';

export function drivePreviewKind(file: DrivePreviewFile): Kind {
  const mime = (file.mimeType || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/.test(name)) return 'video';
  if (mime.includes('pdf') || /\.pdf$/.test(name)) return 'pdf';
  if (/\.(xlsx?|csv)$/.test(name) || mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    return 'spreadsheet';
  return 'other';
}

/** Só imagem, vídeo e PDF mostram o ícone de olho no hover (planilhas e outros só baixam, como nas FDs). */
export function canShowEyeButton(file: DrivePreviewFile): boolean {
  const k = drivePreviewKind(file);
  return k === 'image' || k === 'video' || k === 'pdf';
}

/** Botões de ação que aparecem ao passar o mouse (olho + baixar), iguais aos cards das FDs. */
export const driveHoverBtnCls =
  'inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white shadow-sm backdrop-blur-sm hover:bg-black/75';

export function DriveHoverActions({
  file,
  onPreview,
  onDownload,
  className = '',
}: {
  file: DrivePreviewFile;
  onPreview: () => void;
  onDownload: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${className}`}
    >
      {canShowEyeButton(file) ? (
        <button
          type="button"
          title="Ver"
          aria-label={`Ver ${file.name}`}
          className={driveHoverBtnCls}
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        title="Baixar"
        aria-label={`Baixar ${file.name}`}
        className={driveHoverBtnCls}
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

type Props = {
  file: DrivePreviewFile;
  onClose: () => void;
  onDownload: () => void | Promise<void>;
};

export function DriveFilePreviewModal({ file, onClose, onDownload }: Props) {
  const kind = drivePreviewKind(file);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [sheetHtml, setSheetHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(kind !== 'other');
  const [error, setError] = useState(false);

  // Escape fecha só a prévia (ela abre por cima de outros modais).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  useEffect(() => {
    if (kind === 'other') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(false);
    setMediaUrl(null);
    setSheetHtml(null);

    (async () => {
      try {
        if (kind === 'image' || kind === 'video') {
          const res = await api.get<{ success: boolean; data: { url: string } }>(
            `/drive/files/${file.id}/preview`,
          );
          const url = res.data.data?.url;
          if (!url) throw new Error('sem url');
          if (!cancelled) setMediaUrl(url);
          return;
        }

        // PDF e planilha: bytes pelo proxy autenticado (limite de ~12 MB no backend).
        const res = await api.get(`/drive/files/${file.id}/content`, {
          responseType: 'arraybuffer',
          timeout: 60000,
        });
        const data = res.data as ArrayBuffer;
        if (!(data instanceof ArrayBuffer) || data.byteLength === 0) throw new Error('vazio');

        if (kind === 'pdf') {
          objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
          if (!cancelled) setMediaUrl(objectUrl);
        } else {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(data, { type: 'array' });
          const html = wb.SheetNames.map((name) => {
            const safe = name.replace(/[<>&]/g, '');
            return `<h3 style="margin:16px 0 8px;font-size:14px;font-weight:600;">${safe}</h3>${XLSX.utils.sheet_to_html(
              wb.Sheets[name],
            )}`;
          }).join('');
          if (!cancelled) setSheetHtml(html);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, kind]);

  if (typeof document === 'undefined') return null;

  const fallback = (message: string) => (
    <div className="max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 text-center text-white">
      <p className="mb-4 text-sm">{message}</p>
      <button
        type="button"
        onClick={() => void onDownload()}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        Baixar
      </button>
    </div>
  );

  const spinner = (cls: string) => (
    <div className={`flex items-center justify-center rounded-xl bg-white ${cls}`}>
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  let body: React.ReactNode;
  if (kind === 'other') {
    body = fallback('Não é possível pré-visualizar este tipo de arquivo aqui.');
  } else if (loading) {
    body = spinner(kind === 'pdf' ? 'h-[94vh] w-[96vw]' : 'h-[60vh] w-[min(90vw,900px)]');
  } else if (error || (!mediaUrl && !sheetHtml)) {
    body = fallback('Não foi possível pré-visualizar este arquivo.');
  } else if (kind === 'image') {
    body = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mediaUrl!}
        alt={file.name}
        className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
      />
    );
  } else if (kind === 'video') {
    body = (
      <video
        src={mediaUrl!}
        controls
        autoPlay
        playsInline
        className="max-h-[85vh] max-w-full rounded-2xl bg-black shadow-2xl"
      />
    );
  } else if (kind === 'pdf') {
    body = <iframe title={file.name} src={mediaUrl!} className="h-[94vh] w-[96vw] rounded-xl bg-white" />;
  } else {
    body = (
      <div
        className="h-[80vh] w-[min(90vw,1100px)] overflow-auto rounded-xl bg-white p-4 text-xs text-gray-900 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium"
        dangerouslySetInnerHTML={{ __html: sheetHtml! }}
      />
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/80 p-2"
      style={{ zIndex: Z_LIGHTBOX }}
      role="dialog"
      aria-modal="true"
      aria-label={`Prévia de ${file.name}`}
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onDownload();
          }}
          className="rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
          aria-label="Baixar"
          title="Baixar"
        >
          <Download className="h-[22px] w-[22px]" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
          aria-label="Fechar"
        >
          <X className="h-[22px] w-[22px]" />
        </button>
      </div>
      <div
        className="flex max-h-[99vh] max-w-[98vw] flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {body}
        <p className="mt-3 max-w-full truncate text-center text-xs text-white/80">{file.name}</p>
      </div>
    </div>,
    document.body,
  );
}
