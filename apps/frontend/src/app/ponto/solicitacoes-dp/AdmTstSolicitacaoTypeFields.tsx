'use client';

import React from 'react';
import {
  AdmSimpleRepeatableFields,
  AdmViagensRepeatableFields,
} from './dpSolicitacaoRepeatableFields';

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

type Props = {
  requestType: AdmFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: PayrollEmp[];
};

export function AdmTstSolicitacaoTypeFields({ requestType, details, patchDetails, employees }: Props) {
  if (!requestType) return null;

  if (requestType === 'ADM_VIAGENS') {
    return (
      <div className="md:col-span-2">
        <AdmViagensRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  if ((ADM_SIMPLE_DETAIL_TYPES as readonly string[]).includes(requestType)) {
    return (
      <div className="md:col-span-2">
        <AdmSimpleRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  return null;
}
