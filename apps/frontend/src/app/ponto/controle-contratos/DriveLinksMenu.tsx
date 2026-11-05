'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Cloud, Folder, Info } from 'lucide-react';

type DriveLink = {
  id: string;
  label: string;
  /** Link da pasta no Drive. Vazio = ainda não configurado. */
  url: string;
  /** Cor da pasta (classes Tailwind de texto). */
  folderColor: string;
};

/** Pastas do Drive acessíveis pelo menu. Para adicionar outra, inclua um item aqui. */
const DRIVE_LINKS: DriveLink[] = [
  {
    id: 'contratos',
    label: 'Contratos',
    url: 'https://drive.google.com/drive/folders/19EivIglv4Vk1Jf9fcVFxbuna0KdJArs0?usp=sharing',
    folderColor: 'text-amber-400',
  },
];

/** Botão "Drivers" com a lista de pastas do Drive; ao escolher, abre o link em nova aba. */
export function DriveLinksMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Cloud className="h-4 w-4" />
        <span>Drivers</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="p-1.5">
            {DRIVE_LINKS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={!item.url}
                title={item.url ? item.label : 'Link do Drive ainda não configurado'}
                onClick={() => {
                  if (!item.url) return;
                  setOpen(false);
                  window.open(item.url, '_blank', 'noopener,noreferrer');
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <Folder className={`h-5 w-5 shrink-0 fill-current ${item.folderColor}`} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-start gap-2 border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Acesso aos Drives de arquivos dos contratos.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
