'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  ListPlus,
  Wallet,
  X,
  type LucideIcon
} from 'lucide-react';
import type { ExtratoCaixaFiltroPayload, ExtratoFiltroAllValues } from '@/lib/extratoCaixaFiltrosSalvos';
import { ExtratoFiltrosSalvosPanel } from './ExtratoFiltrosSalvosPanel';
import {
  EXTRATO_FILTER_DATE_CLASS,
  MOVIMENTO_TIPO_ALL_VALUES,
  MOVIMENTO_TIPO_FILTER_OPTIONS
} from './extratoFiltrosConstants';

export type ExtratoFilterOption = {
  value: string;
  label: string;
  searchText?: string;
};

type FilterFieldKey =
  | 'movimento'
  | 'polo'
  | 'cc'
  | 'nature'
  | 'fornecedor'
  | 'historico'
  | 'tipoOperacao';

function withAllIfEmpty(applied: string[], all: string[]): string[] {
  return applied.length === 0 && all.length > 0 ? [...all] : [...applied];
}

function expandApplied(
  applied: ExtratoCaixaFiltroPayload,
  all: ExtratoFiltroAllValues
): ExtratoCaixaFiltroPayload {
  return {
    ccFilterCodes: withAllIfEmpty(applied.ccFilterCodes, all.cc),
    natureFilterCodes: withAllIfEmpty(applied.natureFilterCodes, all.nature),
    poloFilterIds: withAllIfEmpty(applied.poloFilterIds, all.polo),
    fornecedorFilterValues: withAllIfEmpty(applied.fornecedorFilterValues, all.fornecedor),
    historicoFilterValues: withAllIfEmpty(applied.historicoFilterValues, all.historico),
    tipoOperacaoFilterValues: withAllIfEmpty(applied.tipoOperacaoFilterValues, all.tipoOperacao),
    movimentoTipoFilter: withAllIfEmpty(applied.movimentoTipoFilter, all.movimento),
    periodFrom: applied.periodFrom,
    periodTo: applied.periodTo
  };
}

function selectionSummary(
  selected: string[],
  options: ExtratoFilterOption[],
  placeholder: string,
  emptyMessage: string
): string {
  if (options.length === 0) return emptyMessage;
  if (selected.length === 0) return placeholder;
  if (selected.length >= options.length) return 'Todos selecionados';
  return `${selected.length} selecionado(s)`;
}

function FilterMultiSelectField({
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
}: {
  fieldKey: FilterFieldKey;
  label: string;
  icon: LucideIcon;
  options: ExtratoFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  openField: FilterFieldKey | null;
  onOpenField: (key: FilterFieldKey | null) => void;
  disabled?: boolean;
  placeholder: string;
  searchPlaceholder: string;
  emptyOptionsMessage: string;
  emptySearchMessage: string;
}) {
  const isOpen = openField === fieldKey;
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) setSearch('');
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allValues = useMemo(() => options.map((o) => o.value), [options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.searchText ?? ''} ${o.value}`.toLowerCase();
      return hay.includes(q);
    });
  }, [options, search]);

  const filteredValues = useMemo(() => filtered.map((o) => o.value), [filtered]);

  const allSelected =
    allValues.length > 0 && allValues.every((v) => selectedSet.has(v));
  const someSelected = allValues.some((v) => selectedSet.has(v));
  const allFilteredSelected =
    filteredValues.length > 0 && filteredValues.every((v) => selectedSet.has(v));
  const someFilteredSelected = filteredValues.some((v) => selectedSet.has(v));

  const summary = selectionSummary(selected, options, placeholder, emptyOptionsMessage);

  const toggleValue = (value: string) => {
    onChange(
      selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]
    );
  };

  const toggleSelectAll = () => {
    if (search.trim()) {
      if (allFilteredSelected) {
        const remove = new Set(filteredValues);
        onChange(selected.filter((v) => !remove.has(v)));
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
              onChange={(e) => setSearch(e.target.value)}
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
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = search.trim()
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

          <div className="max-h-[220px] overflow-y-auto overscroll-contain p-2">
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
                {filtered.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-500 dark:bg-gray-700"
                      checked={selectedSet.has(opt.value)}
                      onChange={() => toggleValue(opt.value)}
                    />
                    <span className="text-sm leading-snug text-gray-800 dark:text-gray-100">
                      {opt.label}
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

export type ExtratoFiltrosModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draft: ExtratoCaixaFiltroPayload) => void;
  applied: ExtratoCaixaFiltroPayload;
  allValues: ExtratoFiltroAllValues;
  buildDefaults: () => ExtratoCaixaFiltroPayload;
  options: {
    polo: ExtratoFilterOption[];
    cc: ExtratoFilterOption[];
    nature: ExtratoFilterOption[];
    fornecedor: ExtratoFilterOption[];
    historico: ExtratoFilterOption[];
    tipoOperacao: ExtratoFilterOption[];
  };
  disabled?: boolean;
};

export function ExtratoFiltrosModal({
  isOpen,
  onClose,
  onApply,
  applied,
  allValues,
  buildDefaults,
  options,
  disabled = false
}: ExtratoFiltrosModalProps) {
  const [draft, setDraft] = useState<ExtratoCaixaFiltroPayload>(() => expandApplied(applied, allValues));
  const [openField, setOpenField] = useState<FilterFieldKey | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(expandApplied(applied, allValues));
    setOpenField(null);
  }, [isOpen]); // snapshot de applied/allValues ao abrir

  useEffect(() => {
    if (!isOpen) return;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const movimentoOptions: ExtratoFilterOption[] = MOVIMENTO_TIPO_FILTER_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    searchText: o.searchText
  }));

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50"
        aria-label="Fechar filtros"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extrato-filtros-title"
        className="relative z-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h2
            id="extrato-filtros-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            Filtros
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-4">
            <ExtratoFiltrosSalvosPanel
              filterDraft={draft}
              onLoadDraft={setDraft}
              allValues={allValues}
              disabled={disabled}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Período (data de compensação)
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="extrato-filter-from"
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    De
                  </label>
                  <input
                    id="extrato-filter-from"
                    type="date"
                    value={draft.periodFrom}
                    onChange={(e) => setDraft((d) => ({ ...d, periodFrom: e.target.value }))}
                    disabled={disabled}
                    className={EXTRATO_FILTER_DATE_CLASS}
                  />
                </div>
                <div>
                  <label
                    htmlFor="extrato-filter-to"
                    className="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    Até
                  </label>
                  <input
                    id="extrato-filter-to"
                    type="date"
                    value={draft.periodTo}
                    onChange={(e) => setDraft((d) => ({ ...d, periodTo: e.target.value }))}
                    min={draft.periodFrom || undefined}
                    disabled={disabled}
                    className={EXTRATO_FILTER_DATE_CLASS}
                  />
                </div>
              </div>
            </div>

            <FilterMultiSelectField
              fieldKey="movimento"
              label="Entradas e Saídas"
              icon={Wallet}
              options={movimentoOptions}
              selected={draft.movimentoTipoFilter}
              onChange={(movimentoTipoFilter) => setDraft((d) => ({ ...d, movimentoTipoFilter }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Entradas e saídas"
              searchPlaceholder="Pesquisar..."
              emptyOptionsMessage="Nenhuma opção disponível."
              emptySearchMessage="Nenhuma opção encontrada."
            />

            <FilterMultiSelectField
              fieldKey="polo"
              label="Polo"
              icon={Building2}
              options={options.polo}
              selected={draft.poloFilterIds}
              onChange={(poloFilterIds) => setDraft((d) => ({ ...d, poloFilterIds }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os polos"
              searchPlaceholder="Pesquisar polo..."
              emptyOptionsMessage="Nenhum polo no balanço carregado."
              emptySearchMessage="Nenhum polo encontrado."
            />

            <FilterMultiSelectField
              fieldKey="cc"
              label="Centro de Custo"
              icon={ListPlus}
              options={options.cc}
              selected={draft.ccFilterCodes}
              onChange={(ccFilterCodes) => setDraft((d) => ({ ...d, ccFilterCodes }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os centros de custo"
              searchPlaceholder="Pesquisar centro de custo..."
              emptyOptionsMessage="Nenhum centro de custo no balanço carregado."
              emptySearchMessage="Nenhum centro de custo encontrado."
            />

            <FilterMultiSelectField
              fieldKey="nature"
              label="Natureza Financeira"
              icon={BookOpen}
              options={options.nature}
              selected={draft.natureFilterCodes}
              onChange={(natureFilterCodes) => setDraft((d) => ({ ...d, natureFilterCodes }))}
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todas as naturezas financeiras"
              searchPlaceholder="Pesquisar natureza ou código..."
              emptyOptionsMessage="Nenhuma natureza no balanço carregado."
              emptySearchMessage="Nenhuma natureza encontrada."
            />

            <FilterMultiSelectField
              fieldKey="fornecedor"
              label="Fornecedor"
              icon={Building2}
              options={options.fornecedor}
              selected={draft.fornecedorFilterValues}
              onChange={(fornecedorFilterValues) =>
                setDraft((d) => ({ ...d, fornecedorFilterValues }))
              }
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os fornecedores"
              searchPlaceholder="Pesquisar fornecedor..."
              emptyOptionsMessage="Nenhum fornecedor no balanço carregado."
              emptySearchMessage="Nenhum fornecedor encontrado."
            />

            <FilterMultiSelectField
              fieldKey="historico"
              label="Histórico"
              icon={FileText}
              options={options.historico}
              selected={draft.historicoFilterValues}
              onChange={(historicoFilterValues) =>
                setDraft((d) => ({ ...d, historicoFilterValues }))
              }
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os históricos"
              searchPlaceholder="Pesquisar histórico..."
              emptyOptionsMessage="Nenhum histórico no balanço carregado."
              emptySearchMessage="Nenhum histórico encontrado."
            />

            <FilterMultiSelectField
              fieldKey="tipoOperacao"
              label="Tipo de Operação"
              icon={ClipboardList}
              options={options.tipoOperacao}
              selected={draft.tipoOperacaoFilterValues}
              onChange={(tipoOperacaoFilterValues) =>
                setDraft((d) => ({ ...d, tipoOperacaoFilterValues }))
              }
              openField={openField}
              onOpenField={setOpenField}
              disabled={disabled}
              placeholder="Todos os tipos de operação"
              searchPlaceholder="Pesquisar tipo..."
              emptyOptionsMessage="Nenhum tipo de operação no balanço carregado."
              emptySearchMessage="Nenhum tipo encontrado."
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setDraft(buildDefaults())}
            disabled={disabled}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            disabled={disabled}
            className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export { MOVIMENTO_TIPO_ALL_VALUES };
