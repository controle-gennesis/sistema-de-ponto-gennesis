'use client';

import React from 'react';
import { Input as BaseInput } from '@/components/ui/Input';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { QuantityStepperInput } from '@/components/ui/QuantityStepperInput';
import { DP_SOLICITACOES_NO_FOCUS_CLS } from '@/lib/dpSolicitacoesUi';
import { ButtonSeg } from './DpSolicitacaoTypeFields';

export type AdmFormRequestType =
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR';

export const ADM_TYPE_LABELS: Record<AdmFormRequestType, string> = {
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
};

export const ADM_SIMPLE_DETAIL_TYPES: AdmFormRequestType[] = [
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
];

type PayrollEmp = { id: string; name: string };

const fieldBox =
  `w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm appearance-none ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const labelCls = 'block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200';
const taCls = `${fieldBox} min-h-[100px] resize-y`;
const inputFieldCls = `border-gray-300 dark:border-gray-600 ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const Input = (props: React.ComponentProps<typeof BaseInput>) => (
  <BaseInput
    {...props}
    className={[inputFieldCls, props.className].filter(Boolean).join(' ')}
  />
);

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <DatePickerField
        value={value}
        onChange={onChange}
        placeholder="dd/mm/aaaa"
        noFocusRing
        aria-label={label}
      />
    </div>
  );
}

type Props = {
  requestType: AdmFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: PayrollEmp[];
};

export function AdmTstSolicitacaoTypeFields({ requestType, details, patchDetails, employees }: Props) {
  const employeeOptions = React.useMemo<MultiSelectSearchOption[]>(
    () => employees.map((e) => ({ value: e.id, label: e.name, searchText: e.name })),
    [employees]
  );

  const selectedEmployeeIds = React.useMemo(() => {
    const raw = details.employeeIds;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && !!id) : [];
  }, [details.employeeIds]);

  if (!requestType) return null;

  if (requestType === 'ADM_VIAGENS') {
    return (
      <div className="md:col-span-2 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            label="Data de ida *"
            value={(details.dataIda as string) ?? ''}
            onChange={(dataIda) => patchDetails({ dataIda })}
          />
          <DateField
            label="Data de volta *"
            value={(details.dataVolta as string) ?? ''}
            onChange={(dataVolta) => patchDetails({ dataVolta })}
          />
        </div>

        <div>
          <MultiSelectSearchDropdown
            label="Colaboradores *"
            selected={selectedEmployeeIds}
            onChange={(employeeIds) => patchDetails({ employeeIds })}
            options={employeeOptions}
            placeholder="Selecione os colaboradores..."
            searchPlaceholder="Pesquisar..."
            noFocusRing
          />
        </div>

        <div>
          <label className={labelCls}>Cidade *</label>
          <Input
            value={(details.cidade as string) ?? ''}
            onChange={(e) => patchDetails({ cidade: e.target.value })}
            placeholder="Ex.: Brasília"
            required
          />
        </div>

        <div>
          <label className={labelCls}>Motivo da viagem *</label>
          <Input
            value={(details.motivoViagem as string) ?? ''}
            onChange={(e) => patchDetails({ motivoViagem: e.target.value })}
            placeholder="Ex.: Reunião com cliente"
            required
          />
        </div>

        <div>
          <label className={labelCls}>Nº de dias *</label>
          <QuantityStepperInput
            required
            allowEmpty
            value={
              typeof details.numeroDias === 'number'
                ? details.numeroDias
                : parseInt(String(details.numeroDias ?? ''), 10) || 0
            }
            min={1}
            max={365}
            unit="dia(s)"
            placeholder="Ex.: 3"
            onChange={(qty) => patchDetails({ numeroDias: qty > 0 ? String(qty) : '' })}
          />
        </div>

        <div>
          <label className={labelCls}>Pedágio *</label>
          <div className="flex gap-2">
            <ButtonSeg
              active={(details.pedagio as string) === 'SIM'}
              onClick={() => patchDetails({ pedagio: 'SIM' })}
              label="Sim"
            />
            <ButtonSeg
              active={(details.pedagio as string) === 'NAO'}
              onClick={() => patchDetails({ pedagio: 'NAO' })}
              label="Não"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Observações</label>
          <textarea
            className={taCls}
            value={(details.observacoes as string) ?? ''}
            onChange={(e) => patchDetails({ observacoes: e.target.value })}
            placeholder="Opcional"
          />
        </div>
      </div>
    );
  }

  if ((ADM_SIMPLE_DETAIL_TYPES as readonly string[]).includes(requestType)) {
    return (
      <div className="md:col-span-2">
        <label className={labelCls}>Informar detalhes e particularidades da solicitação *</label>
        <textarea
          className={taCls}
          value={(details.detalhes as string) ?? ''}
          onChange={(e) => patchDetails({ detalhes: e.target.value })}
          placeholder="Descreva o que precisa ser atendido..."
          required
        />
      </div>
    );
  }

  return null;
}
