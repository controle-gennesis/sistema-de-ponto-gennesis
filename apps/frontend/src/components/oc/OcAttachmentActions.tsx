'use client';

import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Download, FileText, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { downloadUploadFile } from '@/lib/downloadUploadFile';

type OcAttachmentActionsProps = {
  url: string;
  fileName: string;
  icon?: LucideIcon;
  className?: string;
  linkClassName?: string;
  compact?: boolean;
};

export function OcAttachmentActions({
  url,
  fileName,
  icon: Icon = FileText,
  className,
  linkClassName,
  compact = false
}: OcAttachmentActionsProps) {
  const [downloading, setDownloading] = useState(false);
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadUploadFile(trimmed, fileName);
    } catch {
      toast.error('Não foi possível baixar o arquivo.');
    } finally {
      setDownloading(false);
    }
  };

  const linkCls =
    linkClassName ??
    'text-blue-600 dark:text-blue-400 underline inline-flex items-center gap-1';

  const btnCls = compact
    ? 'inline-flex items-center gap-0.5 p-0.5 rounded text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50'
    : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50';

  return (
    <span className={`inline-flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      <a href={absoluteUploadUrl(trimmed)} target="_blank" rel="noopener noreferrer" className={linkCls}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        {fileName}
      </a>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        title="Baixar arquivo"
        className={btnCls}
      >
        {downloading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        {!compact ? <span>Baixar</span> : null}
      </button>
    </span>
  );
}
