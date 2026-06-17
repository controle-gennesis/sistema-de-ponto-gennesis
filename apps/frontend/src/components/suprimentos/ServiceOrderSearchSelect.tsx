'use client';

import React, { useMemo } from 'react';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import {
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
  required?: boolean;
};

export function ServiceOrderSearchSelect({
  costCenterId,
  serviceOrders,
  loading,
  serviceOrderId,
  onSelect,
  onClear,
  emptyCostCenterHint = 'Selecione o centro de custo para listar as ordens de serviço'
}: ServiceOrderSearchSelectProps) {
  const options = useMemo(
    () =>
      serviceOrders.map((os) => {
        const full = serviceOrderOptionFullLabel(os);
        return {
          value: os.id,
          label: full,
          searchText: full
        };
      }),
    [serviceOrders]
  );

  const handleChange = (id: string) => {
    if (!id) {
      onClear();
      return;
    }
    const os = serviceOrders.find((o) => o.id === id);
    if (os) onSelect(os.id, os.label);
    else onClear();
  };

  if (!costCenterId) {
    return (
      <SingleSelectSearchDropdown
        value=""
        onChange={() => {}}
        options={[]}
        disabled
        allowEmpty={false}
        placeholder={emptyCostCenterHint}
        noFocusRing
      />
    );
  }

  if (loading) {
    return (
      <SingleSelectSearchDropdown
        value=""
        onChange={() => {}}
        options={[]}
        disabled
        allowEmpty={false}
        placeholder="Carregando ordens de serviço..."
        noFocusRing
      />
    );
  }

  return (
    <div>
      <SingleSelectSearchDropdown
        value={serviceOrderId}
        onChange={handleChange}
        options={options}
        allowEmpty
        placeholder="Digite para buscar ordem de serviço..."
        searchPlaceholder="Pesquisar..."
        emptyOptionsMessage="Nenhuma ordem de serviço cadastrada neste centro de custo."
        emptySearchMessage="Nenhuma ordem de serviço encontrada."
        noFocusRing
      />
      {serviceOrders.length === 0 ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Nenhuma ordem de serviço cadastrada neste centro de custo no módulo de Contratos (Engenharia).
        </p>
      ) : null}
    </div>
  );
}
