'use client';

import React from 'react';
import { Paperclip } from 'lucide-react';

/** Bloco com cabeçalho (clipe + título + ação opcional), igual ao da Ficha de Demanda. */
export function Bloco({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700">
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 ${
          children ? 'border-b border-gray-200 dark:border-gray-700' : ''
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Paperclip className="h-4 w-4 text-gray-500" />
          {title}
        </div>
        {action}
      </div>
      {children ? <div className="p-4">{children}</div> : null}
    </div>
  );
}
