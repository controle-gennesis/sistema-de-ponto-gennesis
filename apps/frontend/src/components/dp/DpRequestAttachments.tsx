'use client';

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { downloadUploadFile } from '@/lib/downloadUploadFile';

type Attachment = {
  id: string;
  uploadedByUserId: string;
  uploadedByName: string;
  fileName: string;
  mimeType: string;
  url: string;
  createdAt: string;
};

/**
 * Documentos anexados na solicitação (ex.: a Contabilidade anexa e o DP vê, e vice-versa).
 * Cada anexo também entra no histórico de mensagens e avisa a outra parte.
 */
export function DpRequestAttachments({
  requestId,
  currentUserId,
  title = 'Documentos anexados',
}: {
  requestId: string;
  currentUserId?: string | null;
  title?: string;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dp-request-attachments', requestId],
    queryFn: async () => {
      const res = await api.get(`/solicitacoes-dp/${requestId}/anexos`);
      return (res.data?.data?.items ?? []) as Attachment[];
    },
    enabled: !!requestId,
    refetchInterval: 30_000,
  });

  const errorMessage = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
    return d?.message || d?.error || fallback;
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/solicitacoes-dp/${requestId}/anexos`, form);
      return (res.data?.data?.items ?? []) as Attachment[];
    },
    onSuccess: (items) => {
      queryClient.setQueryData(['dp-request-attachments', requestId], items);
      // o anexo também entra no histórico de mensagens
      void queryClient.invalidateQueries({ queryKey: ['dp-request-messages', requestId] });
      toast.success('Documento anexado.');
    },
    onError: (e) => toast.error(errorMessage(e, 'Não foi possível anexar o documento.')),
  });

  const remove = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await api.delete(`/solicitacoes-dp/${requestId}/anexos/${attachmentId}`);
      return (res.data?.data?.items ?? []) as Attachment[];
    },
    onSuccess: (items) => queryClient.setQueryData(['dp-request-attachments', requestId], items),
    onError: (e) => toast.error(errorMessage(e, 'Não foi possível remover o documento.')),
  });

  const items = data ?? [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          title="Anexar documento"
          aria-label="Anexar documento"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : isError ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Não foi possível carregar os documentos.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum documento anexado ainda.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50"
            >
              <FileText className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={a.fileName}>
                  {a.fileName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {a.uploadedByName} · {formatDateTimeBr(a.createdAt, '—')}
                </p>
              </div>
              <button
                type="button"
                title="Baixar"
                aria-label={`Baixar ${a.fileName}`}
                onClick={() =>
                  void downloadUploadFile(a.url, a.fileName).catch(() => toast.error('Não foi possível baixar o arquivo.'))
                }
                className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Download className="h-4 w-4" />
              </button>
              {currentUserId && a.uploadedByUserId === currentUserId ? (
                <button
                  type="button"
                  title="Remover"
                  aria-label={`Remover ${a.fileName}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Remover o documento "${a.fileName}"?`)) remove.mutate(a.id);
                  }}
                  className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
