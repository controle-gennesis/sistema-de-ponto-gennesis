'use client';

import React, { useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Download, X } from 'lucide-react';
import api from '@/lib/api';
import { Z_LIGHTBOX } from '@/lib/zIndex';
import { buildOcPdfDownloadFileName } from '@/components/oc/ocListDisplay';

/**
 * PDFs do mapa de cotação da OC (PDF da OC e comparativo): baixar com nome coerente e visualizar
 * dentro do Conecta. Abrir o blob em outra aba fazia o Chrome baixar com nome aleatório (o id do blob).
 */

type Kind = 'snapshot' | 'comparison';

async function fetchPdf(kind: Kind, mapId: string, purchaseOrderId?: string): Promise<Blob> {
  const path = kind === 'snapshot' ? 'snapshot-pdf' : 'comparison-pdf';
  const response = await api.get(`/quote-maps/${mapId}/${path}`, {
    responseType: 'blob',
    params: purchaseOrderId ? { purchaseOrderId } : undefined,
  });
  const data = response.data as Blob;
  return data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' });
}

/** `OC26-ACO-POTIGUAR.pdf` (PDF da OC) · `OC26-ACO-POTIGUAR-mapa-cotacao.pdf` (comparativo). */
function nomeArquivo(kind: Kind, orderNumber?: string | number | null, supplierName?: string | null): string {
  const base = buildOcPdfDownloadFileName(orderNumber != null ? String(orderNumber) : null, supplierName);
  return kind === 'snapshot' ? base : base.replace(/\.pdf$/i, '-mapa-cotacao.pdf');
}

function baixarBlob(blob: Blob, fileName: string) {
  const blobUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}

function PdfViewer({
  blobUrl,
  title,
  onDownload,
  onClose,
}: {
  blobUrl: string;
  title: string;
  onDownload: () => void;
  onClose: () => void;
}) {
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 p-4"
      style={{ zIndex: Z_LIGHTBOX }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <Download className="h-4 w-4" />
              Baixar
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Sem a barra do visualizador do navegador: o download dela usaria o nome aleatório do blob. */}
        <iframe src={`${blobUrl}#toolbar=0&navpanes=0`} title={title} className="min-h-0 w-full flex-1 bg-gray-100" />
      </div>
    </div>
  );
}

let viewerRoot: Root | null = null;
let viewerHost: HTMLDivElement | null = null;

function abrirVisualizador(blob: Blob, fileName: string, title: string) {
  if (typeof document === 'undefined') return;
  if (!viewerHost) {
    viewerHost = document.createElement('div');
    document.body.appendChild(viewerHost);
    viewerRoot = createRoot(viewerHost);
  }
  const blobUrl = window.URL.createObjectURL(blob);
  const fechar = () => {
    viewerRoot?.render(<></>);
    window.URL.revokeObjectURL(blobUrl);
  };
  viewerRoot?.render(
    <PdfViewer blobUrl={blobUrl} title={title} onDownload={() => baixarBlob(blob, fileName)} onClose={fechar} />
  );
}

export async function openQuoteMapSnapshotPdf(
  mapId: string,
  purchaseOrderId?: string,
  orderNumber?: string | number | null,
  supplierName?: string | null
) {
  const blob = await fetchPdf('snapshot', mapId, purchaseOrderId);
  const nome = nomeArquivo('snapshot', orderNumber, supplierName);
  abrirVisualizador(blob, nome, `PDF da OC · ${nome}`);
}

export async function downloadQuoteMapSnapshotPdf(
  mapId: string,
  orderNumber?: string | number | null,
  supplierName?: string | null,
  purchaseOrderId?: string
) {
  const blob = await fetchPdf('snapshot', mapId, purchaseOrderId);
  baixarBlob(blob, nomeArquivo('snapshot', orderNumber, supplierName));
}

export async function openQuoteMapComparisonPdf(
  mapId: string,
  purchaseOrderId?: string,
  orderNumber?: string | number | null,
  supplierName?: string | null
) {
  const blob = await fetchPdf('comparison', mapId, purchaseOrderId);
  const nome = nomeArquivo('comparison', orderNumber, supplierName);
  abrirVisualizador(blob, nome, `Mapa de cotação · ${nome}`);
}

export async function downloadQuoteMapComparisonPdf(
  mapId: string,
  purchaseOrderId?: string,
  orderNumber?: string | number | null,
  supplierName?: string | null
) {
  const blob = await fetchPdf('comparison', mapId, purchaseOrderId);
  baixarBlob(blob, nomeArquivo('comparison', orderNumber, supplierName));
}
