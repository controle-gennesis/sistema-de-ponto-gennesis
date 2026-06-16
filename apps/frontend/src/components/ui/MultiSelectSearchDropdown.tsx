'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

export type MultiSelectSearchOption = {
  value: string;
  label: string;
  searchText?: string;
  /** Quando definido, exibe um indicador de cor ao lado do rótulo. */
  swatchColor?: string;
};

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

function getPortalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById('dropdown-portal-root') ?? document.body;
}

function DropdownCheckbox({
  id,
  checked,
  indeterminate,
  disabled,
  onToggle,
  onChange,
  noFocusRing,
  children,
}: {
  id?: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  noFocusRing?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  const filled = checked || Boolean(indeterminate);

  return (
    <label
      className={`group flex w-full min-h-[2.5rem] items-center gap-3 rounded-md px-2.5 py-2 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/55 ${
        disabled ? 'opacity-45 cursor-not-allowed hover:bg-transparent' : ''
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onToggle();
      }}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly
        tabIndex={-1}
        aria-hidden
      />
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors outline-none ${
          noFocusRing
            ? ''
            : 'group-focus-within:ring-2 group-focus-within:ring-red-500/80 group-focus-within:ring-offset-1 ring-offset-white dark:ring-offset-gray-800'
        } ${
          filled
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-500 dark:bg-gray-800 dark:group-hover:border-red-400/70'
        }`}
        aria-hidden
      >
        {checked && !indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1 break-words text-sm leading-snug text-gray-800 dark:text-gray-100">
        {children}
      </span>
    </label>
  );
}

export type MultiSelectSearchDropdownProps = {
  label?: string;
  options: MultiSelectSearchOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionsMessage?: string;
  emptySearchMessage?: string;
  icon?: React.ReactNode;
  className?: string;
  closeOnSelect?: boolean;
  /** Fecha o painel ao clicar fora do campo (padrão: true). */
  closeOnOutsideClick?: boolean;
  /**
   * Menu expande no fluxo do documento, logo abaixo do campo.
   * Em modais longos prefira menu flutuante (portal), sem menuInline.
   */
  menuInline?: boolean;
  /** Altura máxima da área rolável de opções (padrão: 220px). */
  listMaxHeight?: number;
  /**
   * Menu flutuante pode usar altura total solicitada e sobrepor o conteúdo da página,
   * em vez de encolher para caber no espaço livre abaixo do campo na viewport.
   */
  menuOverlapContent?: boolean;
  /** Remove anéis/bordas de foco do campo, busca e checkboxes. */
  noFocusRing?: boolean;
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
const LIST_ROW_ESTIMATE_PX = 42;
const PANEL_CHROME_PX = 118;

function estimateListMaxHeight(optionCount: number, cap: number): number {
  if (optionCount <= 0) return Math.min(cap, 80);
  return Math.min(cap, Math.max(80, optionCount * LIST_ROW_ESTIMATE_PX + 8));
}

function computeFloatingPos(
  trigger: HTMLElement,
  listMax: number,
  overlapContent = false
): FloatingPos {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const margin = 12;
  const width = Math.max(rect.width, 200);
  const chrome = 118;
  const preferred = listMax + chrome;
  const viewportMax = window.innerHeight - margin * 2;

  if (overlapContent) {
    const preferred = listMax + chrome;
    const viewportMax = window.innerHeight - margin * 2;
    const spaceAbove = rect.top - gap - margin;
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const fitsBelow =
      rect.bottom + gap + Math.min(preferred, viewportMax, spaceBelow) <=
      window.innerHeight - margin;
    const openUp = !fitsBelow && spaceAbove > spaceBelow;

    if (openUp) {
      const maxHeight = Math.max(160, Math.min(preferred, viewportMax, spaceAbove));
      return {
        left: rect.left,
        width,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight,
        openUp: true,
      };
    }

    const maxHeight = Math.max(160, Math.min(preferred, viewportMax, spaceBelow));
    return {
      left: rect.left,
      width,
      top: rect.bottom + gap,
      maxHeight,
      openUp: false,
    };
  }

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

function MenuPanel({
  panelId,
  panelRef,
  listRef,
  search,
  setSearch,
  searchPlaceholder,
  options,
  filtered,
  allValues,
  allSelected,
  someSelected,
  allFilteredSelected,
  someFilteredSelected,
  selectedSet,
  emptyOptionsMessage,
  emptySearchMessage,
  onChange,
  selectAllFiltered,
  deselectAllFiltered,
  toggleValue,
  toggleSelectAll,
  listMaxHeight,
  noFocusRing,
  className,
  style,
}: {
  panelId: string;
  panelRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<HTMLDivElement>;
  search: string;
  setSearch: (v: string) => void;
  searchPlaceholder: string;
  options: MultiSelectSearchOption[];
  filtered: MultiSelectSearchOption[];
  allValues: string[];
  allSelected: boolean;
  someSelected: boolean;
  allFilteredSelected: boolean;
  someFilteredSelected: boolean;
  selectedSet: Set<string>;
  emptyOptionsMessage: string;
  emptySearchMessage: string;
  onChange: (selected: string[]) => void;
  selectAllFiltered: () => void;
  deselectAllFiltered: () => void;
  toggleValue: (value: string) => void;
  toggleSelectAll: (checked: boolean) => void;
  listMaxHeight: number;
  noFocusRing?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      id={panelId}
      ref={panelRef}
      role="listbox"
      style={style}
      className={
        className ??
        'flex flex-col rounded-lg border border-gray-300 bg-white shadow-xl ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-800 dark:ring-white/10'
      }
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 border-b border-gray-200 px-3 py-3 dark:border-gray-600">
        <div className="relative">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`block h-10 w-full rounded-lg border border-gray-300 bg-gray-50 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100 dark:placeholder:text-gray-500 ${
              noFocusRing ? 'focus:ring-0 focus:border-gray-300 dark:focus:border-gray-600' : 'focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:focus:ring-red-400'
            } ${search ? 'pl-3 pr-9' : 'px-3'}`}
          />
          {search ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearch('');
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 outline-none transition-colors hover:bg-gray-200/80 hover:text-gray-600 focus:ring-0 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              aria-label="Limpar pesquisa"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {options.length > 0 ? (
        <div className="shrink-0 border-b border-gray-200 px-1.5 py-1 dark:border-gray-600">
          <DropdownCheckbox
            id={`${panelId}-all`}
            noFocusRing={noFocusRing}
            checked={search.trim() ? allFilteredSelected : allSelected}
            indeterminate={
              search.trim()
                ? someFilteredSelected && !allFilteredSelected
                : someSelected && !allSelected
            }
            onToggle={() => {
              const nextChecked = search.trim()
                ? !allFilteredSelected
                : !allSelected;
              if (search.trim()) {
                if (nextChecked) selectAllFiltered();
                else deselectAllFiltered();
              } else {
                toggleSelectAll(nextChecked);
              }
            }}
          >
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {search.trim() ? 'Selecionar resultados da busca' : 'Selecionar tudo'}
            </span>
          </DropdownCheckbox>
        </div>
      ) : null}

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1"
        style={listMaxHeight > 0 ? { maxHeight: listMaxHeight } : undefined}
      >
        {options.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">{emptyOptionsMessage}</p>
        ) : filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">{emptySearchMessage}</p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((opt) => (
              <DropdownCheckbox
                key={opt.value}
                noFocusRing={noFocusRing}
                checked={selectedSet.has(opt.value)}
                onToggle={() => toggleValue(opt.value)}
              >
                <OptionLabelContent opt={opt} />
              </DropdownCheckbox>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MultiSelectSearchDropdown({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  placeholder = 'Selecione um ou mais itens',
  searchPlaceholder = 'Pesquisar...',
  emptyOptionsMessage = 'Nenhuma opção disponível.',
  emptySearchMessage = 'Nenhum resultado para esta pesquisa.',
  icon,
  className = '',
  closeOnSelect = false,
  closeOnOutsideClick = true,
  menuInline = false,
  listMaxHeight: listMaxHeightProp,
  menuOverlapContent = false,
  noFocusRing = false,
}: MultiSelectSearchDropdownProps) {
  const effectiveListMax = listMaxHeightProp ?? LIST_MAX;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [floatingPos, setFloatingPos] = useState<FloatingPos | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.searchText ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const allValues = useMemo(() => options.map((o) => o.value), [options]);
  const allFilteredValues = useMemo(() => filtered.map((o) => o.value), [filtered]);

  const allSelected = allValues.length > 0 && allValues.every((v) => selectedSet.has(v));
  const someSelected = allValues.some((v) => selectedSet.has(v));
  const allFilteredSelected =
    allFilteredValues.length > 0 && allFilteredValues.every((v) => selectedSet.has(v));
  const someFilteredSelected = allFilteredValues.some((v) => selectedSet.has(v));

  const estimatedListMax = useMemo(
    () => estimateListMaxHeight(filtered.length, effectiveListMax),
    [filtered.length, effectiveListMax]
  );

  const syncFloatingPos = useCallback(() => {
    if (!triggerRef.current) return;
    setFloatingPos(
      computeFloatingPos(triggerRef.current, estimatedListMax, menuOverlapContent)
    );
  }, [estimatedListMax, menuOverlapContent]);

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
  }, [open, menuInline, syncFloatingPos, filtered.length, search]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setSearch('');
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open || !closeOnOutsideClick) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeOnOutsideClick]);

  const closePanel = () => {
    setOpen(false);
    setSearch('');
  };

  const toggleValue = (value: string) => {
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
    if (closeOnSelect) closePanel();
  };

  const selectAllFiltered = () => onChange(Array.from(new Set([...selected, ...allFilteredValues])));

  const deselectAllFiltered = () => {
    const remove = new Set(allFilteredValues);
    onChange(selected.filter((v) => !remove.has(v)));
  };

  const toggleSelectAll = (checked: boolean) => {
    onChange(checked ? [...allValues] : []);
  };

  const triggerLabel =
    selected.length === 0
      ? options.length === 0
        ? emptyOptionsMessage
        : placeholder
      : selected.length === options.length && options.length > 0
        ? 'Todos selecionados'
        : `${selected.length} selecionado(s)`;

  const listMaxHeight = menuInline
    ? estimatedListMax
    : floatingPos
      ? Math.min(estimatedListMax, Math.max(80, floatingPos.maxHeight - PANEL_CHROME_PX))
      : estimatedListMax;

  const menuProps = {
    panelId,
    panelRef,
    listRef,
    search,
    setSearch,
    searchPlaceholder,
    options,
    filtered,
    allValues,
    allSelected,
    someSelected,
    allFilteredSelected,
    someFilteredSelected,
    selectedSet,
    emptyOptionsMessage,
    emptySearchMessage,
    onChange,
    selectAllFiltered,
    deselectAllFiltered,
    toggleValue,
    toggleSelectAll,
    listMaxHeight,
    noFocusRing,
  };

  const inlineMenu =
    open && menuInline ? (
      <MenuPanel
        {...menuProps}
        className="mt-2 flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-md ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-800 dark:ring-white/10"
        style={{ maxHeight: estimatedListMax + PANEL_CHROME_PX }}
      />
    ) : null;

  const floatingMenu =
    open && !menuInline && floatingPos ? (
      <MenuPanel
        {...menuProps}
        style={{
          position: 'fixed',
          zIndex: 99999,
          left: floatingPos.left,
          width: floatingPos.width,
          maxHeight: floatingPos.maxHeight,
          ...(floatingPos.openUp
            ? { bottom: floatingPos.bottom }
            : { top: floatingPos.top }),
        }}
        className="flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-xl ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-800 dark:ring-white/10"
      />
    ) : null;

  return (
    <div ref={containerRef} className={className}>
      {label ? (
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      ) : null}
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
        className={`relative flex h-10 w-full items-center rounded-md border border-gray-300 bg-white pr-11 text-left text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 ${
          icon ? 'pl-10' : 'pl-3'
        } ${
          noFocusRing
            ? 'focus:ring-0 focus:border-gray-300 dark:focus:border-gray-600'
            : 'focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:focus:ring-red-400'
        }`}
      >
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-gray-400 dark:text-gray-500">
            {icon}
          </span>
        ) : null}
        <span className="block truncate pr-6">{triggerLabel}</span>
        <span className="pointer-events-none absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-gray-400 dark:text-gray-500">
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
