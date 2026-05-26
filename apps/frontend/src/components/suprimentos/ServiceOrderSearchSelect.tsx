'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  filterServiceOrdersByQuery,
  serviceOrderOptionFullLabel,
  type ServiceOrderOption
} from '@/hooks/useServiceOrdersByCostCenter';

type ServiceOrderSearchSelectProps = {
  costCenterId: string;
  serviceOrders: ServiceOrderOption[];
  loading: boolean;
  serviceOrderId: string;
  serviceOrderLabel: string;
  onSelect: (id: string, label: string) => void;
  onClear: () => void;
  inputSize?: 'sm' | 'md';
  emptyCostCenterHint?: string;
};

export function ServiceOrderSearchSelect({
  costCenterId,
  serviceOrders,
  loading,
  serviceOrderId,
  serviceOrderLabel,
  onSelect,
  onClear,
  inputSize = 'md',
  emptyCostCenterHint = 'Selecione o centro de custo para listar as ordens de serviço'
}: ServiceOrderSearchSelectProps) {
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    setSearch(serviceOrderLabel);
  }, [serviceOrderId, serviceOrderLabel]);

  useEffect(() => {
    if (!costCenterId) {
      setSearch('');
      setDropdownOpen(false);
    }
  }, [costCenterId]);

  const filtered = useMemo(
    () => filterServiceOrdersByQuery(serviceOrders, search),
    [serviceOrders, search]
  );

  const inputClass =
    inputSize === 'sm'
      ? 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
      : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  const boxClass =
    inputSize === 'sm'
      ? 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm'
      : 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm';

  if (!costCenterId) {
    return <div className={boxClass}>{emptyCostCenterHint}</div>;
  }

  if (loading) {
    return <div className={boxClass}>Carregando ordens de serviço...</div>;
  }

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setDropdownOpen(true);
    const normalized = value.trim().toLowerCase();
    const exact = serviceOrders.find(
      (os) => serviceOrderOptionFullLabel(os).trim().toLowerCase() === normalized
    );
    if (exact && exact.id === serviceOrderId) return;
    if (exact) {
      onSelect(exact.id, exact.label);
      return;
    }
    onClear();
  };

  const handleBlur = () => {
    setTimeout(() => {
      setDropdownOpen(false);
      const normalized = search.trim().toLowerCase();
      const exact = serviceOrders.find(
        (os) => serviceOrderOptionFullLabel(os).trim().toLowerCase() === normalized
      );
      if (exact) {
        onSelect(exact.id, exact.label);
        setSearch(serviceOrderOptionFullLabel(exact));
      } else if (!serviceOrderId) {
        setSearch('');
      } else {
        setSearch(serviceOrderLabel);
      }
    }, 120);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={search}
        onFocus={() => setDropdownOpen(true)}
        onBlur={handleBlur}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Digite para buscar ordem de serviço (opcional)"
        className={inputClass}
        role="combobox"
        aria-expanded={dropdownOpen}
        aria-autocomplete="list"
      />
      {dropdownOpen && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          {filtered.slice(0, 50).map((os) => (
            <button
              key={os.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(os.id, os.label);
                setSearch(serviceOrderOptionFullLabel(os));
                setDropdownOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                os.id === serviceOrderId
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'
                  : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {serviceOrderOptionFullLabel(os)}
            </button>
          ))}
        </div>
      )}
      {dropdownOpen && search.trim() && filtered.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 shadow-lg">
          Nenhuma ordem de serviço encontrada para &quot;{search.trim()}&quot;.
        </div>
      )}
      {!loading && serviceOrders.length === 0 && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Nenhuma ordem de serviço cadastrada neste centro de custo no módulo de Contratos (Engenharia).
        </p>
      )}
    </div>
  );
}
