'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SearchableEntityAutocompleteProps<T> = {
  searchValue: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (item: T) => void;
  items: T[];
  getItemKey: (item: T) => string;
  getItemLabel: (item?: T | null) => string;
  loading?: boolean;
  loadError?: boolean;
  inputClassName: string;
  placeholder?: string;
  emptyListMessage?: string;
  notFoundMessage?: string;
  loadingMessage?: string;
  errorMessage?: string;
  maxResults?: number;
};

export function SearchableEntityAutocomplete<T>({
  searchValue,
  isOpen,
  onOpen,
  onClose,
  onSearchChange,
  onSelect,
  items,
  getItemKey,
  getItemLabel,
  loading = false,
  loadError = false,
  inputClassName,
  placeholder = 'Digite para buscar...',
  emptyListMessage = 'Nenhum registro disponível.',
  notFoundMessage = 'Nenhum resultado para esta busca.',
  loadingMessage = 'Carregando…',
  errorMessage = 'Erro ao carregar.',
  maxResults = 50
}: SearchableEntityAutocompleteProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  const syncMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }
    syncMenuPosition();
    const onReposition = () => syncMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isOpen, syncMenuPosition, searchValue]);

  const filteredItems = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return items
      .filter((item) => {
        if (!q) return true;
        return getItemLabel(item).toLowerCase().includes(q);
      })
      .slice(0, maxResults);
  }, [items, searchValue, getItemLabel, maxResults]);

  const dropdown =
    isOpen &&
    menuStyle &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="listbox"
        className="max-h-56 overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
        style={{
          position: 'fixed',
          top: menuStyle.top,
          left: menuStyle.left,
          width: menuStyle.width,
          zIndex: 1200
        }}
      >
        {loading ? (
          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{loadingMessage}</p>
        ) : loadError ? (
          <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
        ) : filteredItems.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            {items.length === 0 ? emptyListMessage : notFoundMessage}
          </p>
        ) : (
          filteredItems.map((item) => (
            <button
              key={getItemKey(item)}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(item)}
              className="w-full whitespace-normal break-words px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {getItemLabel(item)}
            </button>
          ))
        )}
      </div>,
      document.body
    );

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={searchValue}
        onFocus={onOpen}
        onClick={onOpen}
        onBlur={() => setTimeout(onClose, 120)}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
        title={searchValue || undefined}
        autoComplete="off"
      />
      {dropdown}
    </>
  );
}
