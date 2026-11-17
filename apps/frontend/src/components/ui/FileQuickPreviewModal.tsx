'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { downloadUploadFile } from '@/lib/downloadUploadFile';
import { Z_LIGHTBOX } from '@/lib/zIndex';

export type QuickPreviewFile = { url: string; name: string };

type Kind = 'image' | 'pdf' | 'docx' | 'sheet' | 'other';

function kindOf(name: string): Kind {
  const n = (name || '').toLowerCase();
  if (/\.(png|jpe?g|webp|gif|bmp|svg)$/.test(n)) return 'image';
  if (/\.pdf$/.test(n)) return 'pdf';
  if (/\.docx$/.test(n)) return 'docx';
  if (/\.(xlsx?|csv)$/.test(n)) return 'sheet';
  return 'other';
}

/**
 * Prévia de um arquivo sem baixar: imagem, PDF, Word (.docx) e planilha abrem numa janela por cima da tela.
 * Outros formatos mostram um aviso com o botão de baixar.
 */
export function FileQuickPreviewModal({
  file,
  onClose,
}: {
  file: QuickPreviewFile | null;
  onClose: () => void;
}) {
  const kind = file ? kindOf(file.name) : 'other';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [file, onClose]);

  useEffect(() => {
    setBlobUrl(null);
    setHtml(null);
    setError(false);
    if (!file || kind === 'other') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);

    (async () => {
      try {
        const url = absoluteUploadUrl(file.url);
        if (!url) throw new Error('URL inválida');
        const token =
          typeof window !== 'undefined'
            ? localStorage.getItem('token') || sessionStorage.getItem('token')
            : null;
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        if (kind === 'image' || kind === 'pdf') {
          objectUrl = URL.createObjectURL(
            new Blob([buffer], { type: kind === 'pdf' ? 'application/pdf' : undefined }),
          );
          setBlobUrl(objectUrl);
        } else if (kind === 'docx') {
          const mammothMod = await import('mammoth');
          const mammoth =
            (mammothMod as unknown as { default?: typeof mammothMod }).default ?? mammothMod;
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!cancelled) setHtml(result.value || '<p>Documento vazio.</p>');
        } else if (kind === 'sheet') {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(buffer, { type: 'array' });
          const parts = wb.SheetNames.slice(0, 5).map((name) => {
            const ws = wb.Sheets[name];
            return `<h4 style="margin:12px 0 6px;font-weight:600">${name.replace(/[<>&]/g, '')}</h4>${XLSX.utils.sheet_to_html(ws)}`;
          });
          if (!cancelled) setHtml(parts.join(''));
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
  }, [file, kind]);

  if (!file || typeof document === 'undefined') return null;

  const baixar = async () => {
    setBaixando(true);
    try {
      await downloadUploadFile(file.url, file.name);
    } catch {
      toast.error('Não foi possível baixar o arquivo');
    } finally {
      setBaixando(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      style={{ zIndex: Z_LIGHTBOX }}
      role="dialog"
      aria-modal="true"
      aria-label={`Prévia de ${file.name}`}
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {file.name}
          </p>
          <button
            type="button"
            onClick={() => void baixar()}
            disabled={baixando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {baixando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Baixar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : kind === 'other' || error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {error
                  ? 'Não foi possível pré-visualizar este arquivo.'
                  : 'Este tipo de arquivo não tem prévia.'}
              </p>
              <button
                type="button"
                onClick={() => void baixar()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Baixar arquivo
              </button>
            </div>
          ) : kind === 'image' && blobUrl ? (
            <div className="flex h-full items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={blobUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : kind === 'pdf' && blobUrl ? (
            <iframe title={file.name} src={blobUrl} className="h-full w-full bg-white" />
          ) : html ? (
            <div
              className="mx-auto max-w-3xl bg-white p-6 text-sm leading-relaxed text-gray-900 [&_p]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-1 [&_th]:border [&_th]:border-gray-300 [&_th]:p-1"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
