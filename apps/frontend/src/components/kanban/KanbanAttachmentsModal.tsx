'use client';

import React, { useRef, useState } from 'react';
import {
  Loader2,
  Trash2,
  Download,
  Upload,
  FileImage,
  FileText,
  Plus,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  type KanbanCardAttachment,
  uploadKanbanAttachments,
  deleteKanbanAttachment,
} from '@/lib/kanban';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return FileImage;
  return FileText;
}

export interface KanbanDraftAttachment {
  id: string;
  file: File;
}

export interface KanbanAttachmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId?: string;
  attachments?: KanbanCardAttachment[];
  draftFiles?: KanbanDraftAttachment[];
  onDraftFilesChange?: (files: KanbanDraftAttachment[]) => void;
  currentUserId?: string;
  onUpdated?: () => void | Promise<void>;
  elevated?: boolean;
}

export function KanbanAttachmentsModal({
  isOpen,
  onClose,
  cardId,
  attachments = [],
  draftFiles = [],
  onDraftFilesChange,
  currentUserId,
  onUpdated,
  elevated = true,
}: KanbanAttachmentsModalProps) {
  const isPersisted = !!cardId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function addDraftFiles(fileList: FileList | null) {
    if (!fileList?.length || !onDraftFilesChange) return;
    const next = [
      ...draftFiles,
      ...Array.from(fileList).map((file) => ({
        id: `draft-${crypto.randomUUID()}`,
        file,
      })),
    ];
    onDraftFilesChange(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    if (!isPersisted) {
      addDraftFiles(fileList);
      return;
    }
    setUploading(true);
    try {
      await uploadKanbanAttachments(cardId!, Array.from(fileList));
      toast.success('Anexo(s) enviado(s)');
      await onUpdated?.();
    } catch {
      toast.error('Erro ao enviar anexo');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    if (!isPersisted) {
      onDraftFilesChange?.(draftFiles.filter((f) => f.id !== id));
      return;
    }
    setDeletingId(id);
    try {
      await deleteKanbanAttachment(id);
      toast.success('Anexo removido');
      await onUpdated?.();
    } catch {
      toast.error('Erro ao remover anexo');
    } finally {
      setDeletingId(null);
    }
  }

  function downloadDraftFile(draftId: string, file: File) {
    const objectUrl = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = file.name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  }

  function previewDraftFile(file: File) {
    const objectUrl = URL.createObjectURL(file);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function openAttachmentPreview(fileUrl: string) {
    const url = resolveApiMediaUrl(fileUrl);
    if (!url) {
      toast.error('URL do arquivo indisponível');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function downloadAttachment(
    attachmentId: string,
    fileUrl: string,
    fileName: string,
  ) {
    if (!fileUrl?.trim()) {
      toast.error('URL do arquivo indisponível');
      return;
    }
    setDownloadingId(attachmentId);
    try {
      const response = await api.get('/chats/direct/attachments/download', {
        params: { url: fileUrl, fileName },
        responseType: 'blob',
        timeout: 60000,
      });
      const blob = response.data as Blob;
      if (!(blob instanceof Blob)) throw new Error('invalid blob');
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Erro ao baixar anexo');
    } finally {
      setDownloadingId(null);
    }
  }

  const totalCount = attachments.length + draftFiles.length;
  const title = totalCount > 0 ? `Anexos (${totalCount})` : 'Anexos';
  const hasAny = totalCount > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={title}
      closeOnOverlayClick
      elevated={elevated}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full mb-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        Adicionar anexo
      </button>

      {!hasAny ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={clsx(
            'rounded-lg border-2 border-dashed px-4 py-10 transition-colors text-center',
            dragOver
              ? 'border-red-400 bg-red-50/60 dark:bg-red-950/20'
              : 'border-gray-200 dark:border-gray-600',
          )}
        >
          <Upload className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum anexo ainda
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Arraste arquivos aqui ou use o botão acima · máx. 10 MB
          </p>
        </div>
      ) : (
        <ul className="space-y-1 max-h-[min(360px,50vh)] overflow-y-auto -mx-1 px-1">
          {draftFiles.map((draft) => {
            const Icon = fileIcon(draft.file.type || 'application/octet-stream');
            return (
              <li
                key={draft.id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </span>
                <button
                  type="button"
                  onClick={() => previewDraftFile(draft.file)}
                  className="flex-1 min-w-0 text-left"
                  title={draft.file.name}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {draft.file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(draft.file.size)} · pendente
                  </p>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadDraftFile(draft.id, draft.file)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    title="Baixar"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(draft.id)}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
          {attachments.map((att) => {
            const Icon = fileIcon(att.mimeType);
            return (
              <li
                key={att.id}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </span>
                <button
                  type="button"
                  onClick={() => openAttachmentPreview(att.fileUrl)}
                  className="flex-1 min-w-0 text-left"
                  title={att.fileName}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {att.fileName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(att.fileSize)} · {att.uploader.name.split(/\s+/)[0]}
                  </p>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={downloadingId === att.id}
                    onClick={() =>
                      downloadAttachment(att.id, att.fileUrl, att.fileName)
                    }
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
                    title="Baixar"
                  >
                    {downloadingId === att.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                  {currentUserId === att.uploader.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(att.id)}
                      disabled={deletingId === att.id}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title="Remover"
                    >
                      {deletingId === att.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
