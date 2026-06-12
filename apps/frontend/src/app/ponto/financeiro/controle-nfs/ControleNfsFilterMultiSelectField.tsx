'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';

export type ControleNfsFilterOption = {
  value: string;
  label: string;
  searchText?: string;
};

function selectionSummary(
  selected: string[],
  options: ControleNfsFilterOption[],
  placeholder: string,
  emptyMessage: string
): string {
  if (options.length === 0) return emptyMessage;
  if (selected.length === 0) return placeholder;
  if (selected.length >= options.length) return 'Todos selecionados';
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? '1 selecionado';
  }
  return `${selected.length} selecionado(s)`;
}

type ControleNfsFilterMultiSelectFieldProps<T extends string> = {
  fieldKey: T;
  label: string;
  icon: LucideIcon;
  options: ControleNfsFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  openField: T | null;
  onOpenField: (key: T | null) => void;
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyOptionsMessage: string;
  emptySearchMessage: string;
};

export function ControleNfsFilterMultiSelectField<T extends string>({
  fieldKey,
  label,
  icon: Icon,
  options,
  selected,
  onChange,
  openField,
  onOpenField,
  disabled,
  placeholder,
  searchPlaceholder,
  emptyOptionsMessage,
  emptySearchMessage
}: ControleNfsFilterMultiSelectFieldProps<T>) {
  const isOpen = openField === fieldKey;
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allValues = useMemo(() => options.map((option) => option.value), [options]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.searchText ?? ''} ${option.value}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [options, search]);

  const filteredValues = useMemo(() => filtered.map((option) => option.value), [filtered]);

  const allSelected = allValues.length > 0 && allValues.every((value) => selectedSet.has(value));
  const someSelected = allValues.some((value) => selectedSet.has(value));
  const allFilteredSelected =
    filteredValues.length > 0 && filteredValues.every((value) => selectedSet.has(value));
  const someFilteredSelected = filteredValues.some((value) => selectedSet.has(value));

  const summary = selectionSummary(selected, options, placeholder, emptyOptionsMessage);

  const toggleValue = (value: string) => {
    onChange(
      selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value]
    );
  };

  const toggleSelectAll = () => {
    if (search.trim()) {
      if (allFilteredSelected) {
        const remove = new Set(filteredValues);
        onChange(selected.filter((value) => !remove.has(value)));
      } else {
        onChange(Array.from(new Set([...selected, ...filteredValues])));
      }
      return;
    }
    onChange(allSelected ? [] : [...allValues]);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onOpenField(isOpen ? null : fieldKey)}
        className="relative flex h-10 w-full items-center rounded-md border border-gray-300 bg-white pl-10 pr-10 text-left text-sm text-gray-900 outline-none transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600/80"
      >
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="block truncate pr-2">{summary}</span>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-600 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-600">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="block h-10 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
            />
          </div>

          {options.length > 0 ? (
            <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-600">
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-500 dark:bg-gray-700"
                  checked={search.trim() ? allFilteredSelected : allSelected}
                  ref={(element) => {
                    if (element) {
                      element.indeterminate = search.trim()
                        ? someFilteredSelected && !allFilteredSelected
                        : someSelected && !allSelected;
                    }
                  }}
                  onChange={toggleSelectAll}
                />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {search.trim() ? 'Selecionar resultados da busca' : 'Selecionar tudo'}
                </span>
              </label>
            </div>
          ) : null}

          <div className="max-h-52 overflow-y-auto overscroll-contain p-2">
            {options.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptyOptionsMessage}
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                {emptySearchMessage}
              </p>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-500 dark:bg-gray-700"
                      checked={selectedSet.has(option.value)}
                      onChange={() => toggleValue(option.value)}
                    />
                    <span className="text-sm leading-snug text-gray-800 dark:text-gray-100">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
