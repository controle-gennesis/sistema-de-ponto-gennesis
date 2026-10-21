'use client';

import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import {
  searchConstructionMaterials,
  type ConstructionMaterialListItem,
} from '@/lib/fetchAllConstructionMaterials';

export type ConstructionMaterialSearchDropdownProps = {
  value: string;
  selectedLabel?: string;
  onChange: (materialId: string, material: ConstructionMaterialListItem) => void;
  disabled?: boolean;
  placeholder?: string;
  noFocusRing?: boolean;
  stayOpenOnSelect?: boolean;
  selectedIds?: string[];
  showCheckbox?: boolean;
  defaultOptions?: ConstructionMaterialListItem[];
  defaultOptionsLabel?: string;
  /** Lista só materiais vindos do TOTVS (oculta cadastros manuais). */
  onlyTotvs?: boolean;
};

export function ConstructionMaterialSearchDropdown({
  value,
  selectedLabel,
  onChange,
  disabled,
  placeholder = 'Digite para buscar material...',
  noFocusRing,
  stayOpenOnSelect,
  selectedIds,
  showCheckbox,
  defaultOptions,
  defaultOptionsLabel,
  onlyTotvs,
}: ConstructionMaterialSearchDropdownProps) {
  return (
    <AsyncSearchSelectDropdown<ConstructionMaterialListItem>
      value={value}
      selectedLabel={selectedLabel}
      onChange={(material) => onChange(material.id, material)}
      searchFn={(term) => searchConstructionMaterials(term, 50, { onlyTotvs })}
      getOptionId={(m) => m.id}
      getOptionLabel={(m) => {
        const name = m.name?.trim() || '';
        const code = m.code?.trim() || '';
        if (code && name && code !== name) return `${code} — ${name}`;
        return name || code || 'Material sem nome';
      }}
      disabled={disabled}
      placeholder={placeholder}
      minSearchLength={2}
      noFocusRing={noFocusRing}
      queryKeyPrefix={onlyTotvs ? 'construction-materials-search-totvs' : 'construction-materials-search'}
      stayOpenOnSelect={stayOpenOnSelect}
      selectedIds={selectedIds}
      showCheckbox={showCheckbox}
      defaultOptions={defaultOptions}
      defaultOptionsLabel={defaultOptionsLabel}
      renderOption={
        showCheckbox
          ? (m) => (
              <span className="flex items-center gap-3 py-0.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-gray-900 dark:text-gray-100">
                    {m.name?.trim() || 'Material sem nome'}
                  </span>
                  <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">
                    {m.code?.trim() || 'Sem código'}
                  </span>
                </span>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {m.unit}
                </span>
              </span>
            )
          : undefined
      }
    />
  );
}
