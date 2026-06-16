'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Check, Search, X } from 'lucide-react';
import type { MultiSelectSearchOption } from './MultiSelectSearchDropdown';

export type SingleSelectSearchDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: MultiSelectSearchOption[];
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionsMessage?: string;
  emptySearchMessage?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  className?: string;
  menuInline?: boolean;
  noFocusRing?: boolean;
  hideFocus?: boolean;
};

type FloatingPos = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
  openUp: boolean;
};

const LIST_MAX = 220;

function getPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('dropdown-portal-root') ?? document.body;
}

function computeFloatingPos(trigger: HTMLElement): FloatingPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const margin = 12;
  const width = Math.max(rect.width, 200);
  const chrome = 72;
  const preferred = LIST_MAX + chrome;

  const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const openUp = spaceBelow < preferred && spaceAbove > spaceBelow;

  if (openUp) {
    const maxHeight = Math.max(160, Math.min(preferred, spaceAbove));
    return {
      left: rect.left,
      width,
      bottom: window.innerHeight - rect.top + gap,
      maxHeight,
      openUp: true,
    };
  }

  const maxHeight = Math.max(160, Math.min(preferred, spaceBelow));
  return {
    left: rect.left,
    width,
    top: rect.bottom + gap,
    maxHeight,
    openUp: false,
  };
}

function OptionLabelContent({ opt }: { opt: MultiSelectSearchOption }) {
  if (!opt.swatchColor) return <>{opt.label}</>;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <span
        className="h-5 w-5 shrink-0 rounded-md border border-black/15 shadow-sm dark:border-white/20"
        style={{ backgroundColor: opt.swatchColor }}
        aria-hidden
      />
      <span className="truncate">{opt.label}</span>
    </span>
  );
}

export function SingleSelectSearchDropdown({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = 'Selecionar...',
  searchPlaceholder = 'Pesquisar...',
  emptyOptionsMessage = 'Nenhuma opção disponível.',
  emptySearchMessage = 'Nenhum resultado para esta pesquisa.',
  allowEmpty = true,
  emptyOptionLabel = 'Nenhum',
  className = '',
  menuInline = false,
  noFocusRing = false,
  hideFocus = false,
}: SingleSelectSearchDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [floatingPos, setFloatingPos] = useState<FloatingPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.searchText ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return '';
    return options.find((o) => o.value === value)?.label ?? '';
  }, [options, value]);

  const syncFloatingPos = useCallback(() => {
    if (!triggerRef.current) return;
    setFloatingPos(computeFloatingPos(triggerRef.current));
  }, []);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || menuInline) return;

    syncFloatingPos();
    if (listRef.current) listRef.current.scrollTop = 0;

    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      syncFloatingPos();
    };

    window.addEventListener('resize', syncFloatingPos);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', syncFloatingPos);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, menuInline, syncFloatingPos]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setSearch('');
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const closePanel = () => {
    setOpen(false);
    setSearch('');
  };

  const pickValue = (next: string) => {
    onChange(next);
    closePanel();
  };

  const triggerLabel =
    selectedLabel ||
    (options.length === 0 ? emptyOptionsMessage : placeholder);

  const listMaxHeight = menuInline
    ? LIST_MAX
    : floatingPos
      ? Math.max(80, floatingPos.maxHeight - 72)
      : LIST_MAX;

  const neutralFocusCls =
    'focus:outline-none focus:ring-0 focus:border-gray-300 dark:focus:border-gray-600';

  const searchFocusCls = hideFocus
    ? neutralFocusCls
    : noFocusRing
      ? 'focus:ring-0 focus:border-red-500 dark:focus:border-red-500'
      : 'focus:outline-none focus:ring-2 focus:ring-red-500/70 focus:border-transparent dark:focus:ring-red-400/70';

  const triggerFocusCls = hideFocus
    ? neutralFocusCls
    : noFocusRing
      ? 'focus:ring-0 focus:border-red-500 dark:focus:border-red-500'
      : 'focus:outline-none focus:ring-2 focus:ring-red-500/70 focus:border-transparent dark:focus:ring-red-400/70';

  const optionClassName = (active: boolean) =>
    `flex w-full min-h-[2.75rem] items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
      active
        ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-700/90 dark:text-white'
        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50'
    }`;

  const panelClassName =
    'flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-600 dark:bg-gray-800';

  const menuContent = (
    <div
      id={panelId}
      ref={panelRef}
      role="listbox"
      className={panelClassName}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 border-b border-gray-100 px-3 py-2.5 dark:border-gray-700">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`block h-9 w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 text-sm text-gray-900 placeholder:text-gray-400 outline-none dark:border-gray-600 dark:bg-gray-900/40 dark:text-gray-100 dark:placeholder:text-gray-500 ${searchFocusCls} ${search ? 'pr-9' : 'pr-3'}`}
          />
          {search ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearch('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 outline-none transition-colors hover:bg-gray-200/80 hover:text-gray-600 focus:ring-0 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              aria-label="Limpar pesquisa"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={listRef}
        style={{ maxHeight: listMaxHeight }}
        className="overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        {options.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{emptyOptionsMessage}</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{emptySearchMessage}</p>
        ) : (
          <div className="space-y-0.5">
            {allowEmpty && !search.trim() ? (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickValue('')}
                className={optionClassName(!value)}
              >
                <span className="min-w-0 truncate">{emptyOptionLabel}</span>
                {!value ? <Check className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden /> : null}
              </button>
            ) : null}
            {filtered.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickValue(opt.value)}
                  className={optionClassName(active)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <OptionLabelContent opt={opt} />
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const inlineMenu =
    open && menuInline ? (
      <div className="mt-2" style={{ maxHeight: LIST_MAX + 72 }}>
        {menuContent}
      </div>
    ) : null;

  const floatingMenu =
    open && !menuInline && floatingPos ? (
      <div
        style={{
          position: 'fixed',
          zIndex: 99999,
          left: floatingPos.left,
          width: floatingPos.width,
          maxHeight: floatingPos.maxHeight,
          ...(floatingPos.openUp ? { bottom: floatingPos.bottom } : { top: floatingPos.top }),
        }}
      >
        {menuContent}
      </div>
    ) : null;

  return (
    <div ref={containerRef} className={className}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (!open && !menuInline) syncFloatingPos();
          setOpen((v) => {
            if (v) setSearch('');
            return !v;
          });
        }}
        className={`relative flex h-10 w-full items-center rounded-lg border bg-white px-3 pr-10 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-800 dark:text-gray-100 ${
          open && !hideFocus
            ? 'border-red-500 dark:border-red-400'
            : 'border-gray-300 dark:border-gray-600'
        } ${triggerFocusCls} ${!selectedLabel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
      >
        <span className="block truncate">{triggerLabel}</span>
        <span className="pointer-events-none absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-red-600 dark:text-red-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {inlineMenu}
      {mounted && floatingMenu && getPortalRoot()
        ? createPortal(floatingMenu, getPortalRoot()!)
        : null}
    </div>
  );
}
