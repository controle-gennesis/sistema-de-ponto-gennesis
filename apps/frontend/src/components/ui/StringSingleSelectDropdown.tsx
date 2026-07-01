'use client';

import React, { useMemo } from 'react';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { stringsToSelectOptions } from '@/lib/selectOptionBuilders';

export type StringSingleSelectDropdownProps = {
  value: string | undefined;
  onChange: (value: string) => void;
  options: string[] | MultiSelectSearchOption[];
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyOptionsMessage?: string;
  emptySearchMessage?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  className?: string;
  menuInline?: boolean;
  disableSearch?: boolean;
  menuAlign?: 'start' | 'end';
  matchTriggerWidth?: boolean;
  menuMinWidth?: number;
};

export function StringSingleSelectDropdown({
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
  disableSearch = false,
  menuAlign = 'start',
  matchTriggerWidth = false,
  menuMinWidth,
}: StringSingleSelectDropdownProps) {
  const dropdownOptions = useMemo((): MultiSelectSearchOption[] => {
    if (!options.length) return [];
    if (typeof options[0] === 'string') {
      return stringsToSelectOptions(options as string[]);
    }
    return options as MultiSelectSearchOption[];
  }, [options]);

  return (
    <SingleSelectSearchDropdown
      value={value ?? ''}
      onChange={onChange}
      options={dropdownOptions}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyOptionsMessage={emptyOptionsMessage}
      emptySearchMessage={emptySearchMessage}
      allowEmpty={allowEmpty}
      emptyOptionLabel={emptyOptionLabel}
      className={className}
      menuInline={menuInline}
      disableSearch={disableSearch}
      menuAlign={menuAlign}
      matchTriggerWidth={matchTriggerWidth}
      menuMinWidth={menuMinWidth}
    />
  );
}
