'use client';

import React from 'react';
import { DatePickerField } from '@/components/ui/DatePickerField';

/** Medição do faturamento: código + período (datas no formato do DatePickerField, aaaa-mm-dd). */
export type MedicaoValue = { codigo: string; inicio: string; fim: string };

export const MEDICAO_VAZIA: MedicaoValue = { codigo: '', inicio: '', fim: '' };

/** Mensagem de erro, ou null quando a medição está completa e coerente. */
export function validarMedicao(m: MedicaoValue): string | null {
  if (!m.codigo.trim()) return 'Informe o código da medição.';
  if (!m.inicio) return 'Informe a data de início da medição.';
  if (!m.fim) return 'Informe a data de fim da medição.';
  if (m.fim < m.inicio) return 'A data de fim da medição não pode ser antes do início.';
  return null;
}

/** Campos enviados à API de faturamento. */
export function medicaoParaApi(m: MedicaoValue) {
  return { measurementCode: m.codigo.trim(), measurementStart: m.inicio, measurementEnd: m.fim };
}

/** Medição de um faturamento já salvo, para o formulário de edição. */
export function medicaoDoFaturamento(b: {
  measurementCode?: string | null;
  measurementStart?: string | null;
  measurementEnd?: string | null;
}): MedicaoValue {
  return {
    codigo: b.measurementCode || '',
    inicio: b.measurementStart ? b.measurementStart.split('T')[0] : '',
    fim: b.measurementEnd ? b.measurementEnd.split('T')[0] : '',
  };
}

/** "MED-01 · 01/10/2026 a 31/10/2026" (ou "—" quando o faturamento não tem medição). */
export function formatMedicao(b: {
  measurementCode?: string | null;
  measurementStart?: string | null;
  measurementEnd?: string | null;
}): string {
  const codigo = (b.measurementCode || '').trim();
  if (!codigo) return '—';
  const data = (iso?: string | null) => {
    if (!iso) return '';
    const [a, m, d] = iso.split('T')[0].split('-');
    return d && m && a ? `${d}/${m}/${a}` : '';
  };
  const ini = data(b.measurementStart);
  const fim = data(b.measurementEnd);
  return ini || fim ? `${codigo} · ${ini || '?'} a ${fim || '?'}` : codigo;
}

export function MedicaoFields({
  value,
  onChange,
  disabled = false,
  focusRingClass = 'focus:ring-green-500',
}: {
  value: MedicaoValue;
  onChange: (next: MedicaoValue) => void;
  disabled?: boolean;
  focusRingClass?: string;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700" disabled={disabled}>
      <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">Medição *</legend>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Código da medição</label>
        <input
          type="text"
          value={value.codigo}
          onChange={(e) => onChange({ ...value, codigo: e.target.value })}
          placeholder="Ex: MED-01"
          className={`h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 ${focusRingClass} dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100`}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Início</label>
          <DatePickerField
            value={value.inicio}
            onChange={(inicio) => onChange({ ...value, inicio })}
            placeholder="dd/mm/aaaa"
            aria-label="Início da medição"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Fim</label>
          <DatePickerField
            value={value.fim}
            onChange={(fim) => onChange({ ...value, fim })}
            placeholder="dd/mm/aaaa"
            aria-label="Fim da medição"
          />
        </div>
      </div>
    </fieldset>
  );
}
