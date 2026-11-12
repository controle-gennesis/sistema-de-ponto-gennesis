'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export type DriveTypeFilter = 'all' | 'folders' | 'pdf' | 'image' | 'doc' | 'sheet' | 'video' | 'other';
export type DriveModifiedFilter = 'all' | 'today' | '7d' | '30d' | 'year';
export type DriveOwnerFilter = 'all' | 'me' | 'others';

export type DriveFiltersState = {
  type: DriveTypeFilter;
  modified: DriveModifiedFilter;
  owner: DriveOwnerFilter;
};

export const DRIVE_FILTERS_EMPTY: DriveFiltersState = { type: 'all', modified: 'all', owner: 'all' };

export const driveFiltersActive = (f: DriveFiltersState) => f.type !== 'all' || f.modified !== 'all' || f.owner !== 'all';

const TYPE_OPTIONS: Array<{ value: DriveTypeFilter; label: string }> = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'folders', label: 'Pastas' },
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'Imagens' },
  { value: 'doc', label: 'Documentos' },
  { value: 'sheet', label: 'Planilhas' },
  { value: 'video', label: 'Vídeos' },
  { value: 'other', label: 'Outros' },
];

const MODIFIED_OPTIONS: Array<{ value: DriveModifiedFilter; label: string }> = [
  { value: 'all', label: 'Qualquer data' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'year', label: 'Este ano' },
];

const OWNER_OPTIONS: Array<{ value: DriveOwnerFilter; label: string }> = [
  { value: 'all', label: 'Qualquer pessoa' },
  { value: 'me', label: 'Eu' },
  { value: 'others', label: 'Outras pessoas' },
];

/** Categoria de um arquivo pelo tipo MIME / extensão. */
export function driveFileCategory(mimeType: string, name: string): Exclude<DriveTypeFilter, 'all' | 'folders'> {
  const mime = (mimeType || '').toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv' ||
    ['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(ext)
  )
    return 'sheet';
  if (
    mime.includes('word') ||
    mime.includes('document') ||
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    mime.startsWith('text/') ||
    ['doc', 'docx', 'odt', 'txt', 'rtf', 'ppt', 'pptx', 'odp'].includes(ext)
  )
    return 'doc';
  return 'other';
}

/** O item foi modificado dentro do período escolhido? */
export function driveMatchesModified(updatedAt: string, filter: DriveModifiedFilter): boolean {
  if (filter === 'all') return true;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return true;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (filter === 'today') return t >= startOfToday;
  if (filter === '7d') return t >= startOfToday - 6 * 86_400_000;
  if (filter === '30d') return t >= startOfToday - 29 * 86_400_000;
  return t >= new Date(now.getFullYear(), 0, 1).getTime();
}

function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== options[0].value;
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-red-500 ${
          active
            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-600'
        }`}
      >
        <span className={active ? '' : 'text-gray-500 dark:text-gray-400'}>{active ? current?.label : label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <span className={o.value === value ? 'font-medium text-red-600 dark:text-red-400' : ''}>{o.label}</span>
              {o.value === value && <Check className="h-4 w-4 text-red-600 dark:text-red-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DriveFilters({
  filters,
  onChange,
  showOwner = true,
}: {
  filters: DriveFiltersState;
  onChange: (f: DriveFiltersState) => void;
  /** Em "Compartilhados comigo" quase tudo é de outras pessoas, mas o filtro continua útil. */
  showOwner?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterDropdown label="Tipo" value={filters.type} options={TYPE_OPTIONS} onChange={(type) => onChange({ ...filters, type })} />
      <FilterDropdown
        label="Modificado"
        value={filters.modified}
        options={MODIFIED_OPTIONS}
        onChange={(modified) => onChange({ ...filters, modified })}
      />
      {showOwner && (
        <FilterDropdown
          label="Proprietário"
          value={filters.owner}
          options={OWNER_OPTIONS}
          onChange={(owner) => onChange({ ...filters, owner })}
        />
      )}
      {driveFiltersActive(filters) && (
        <button
          type="button"
          onClick={() => onChange(DRIVE_FILTERS_EMPTY)}
          className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <X className="h-4 w-4" />
          Limpar
        </button>
      )}
    </div>
  );
}
