'use client';

import { OcBoletoCreationField } from '@/components/oc/OcBoletoCreationField';

export type OcBoletoCreationSlot = {
  url: string;
  name: string;
};

type Props = {
  parcelCount: number;
  parcelDueDays?: number[];
  slots: OcBoletoCreationSlot[];
  onChange: (slots: OcBoletoCreationSlot[]) => void;
  disabled?: boolean;
  idPrefix?: string;
  labelClassName?: string;
};

function emptySlots(count: number): OcBoletoCreationSlot[] {
  return Array.from({ length: count }, () => ({ url: '', name: '' }));
}

export function OcBoletoCreationFields({
  parcelCount,
  parcelDueDays = [],
  slots,
  onChange,
  disabled,
  idPrefix = 'oc-boleto',
  labelClassName = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'
}: Props) {
  const count = Math.max(1, parcelCount);

  if (count <= 1) {
    const slot = slots[0] ?? { url: '', name: '' };
    return (
      <OcBoletoCreationField
        inputId={`${idPrefix}-0`}
        url={slot.url}
        name={slot.name}
        disabled={disabled}
        labelClassName={labelClassName}
        onChange={({ url, name }) => onChange([{ url, name }])}
      />
    );
  }

  return (
    <div className="space-y-3">
      <span className={labelClassName}>
        Anexar boletos * ({count} parcelas)
      </span>
      {Array.from({ length: count }, (_, i) => {
        const slot = slots[i] ?? { url: '', name: '' };
        const days = parcelDueDays[i] ?? parcelDueDays[parcelDueDays.length - 1];
        const parcelLabel =
          days != null && Number.isFinite(days)
            ? `Parcela ${i + 1} (${days} dia${days === 1 ? '' : 's'})`
            : `Parcela ${i + 1}`;
        return (
          <div
            key={i}
            className="rounded-lg border border-violet-200/80 bg-violet-50/40 px-3 py-3 dark:border-violet-900/50 dark:bg-violet-950/20"
          >
            <OcBoletoCreationField
              inputId={`${idPrefix}-${i}`}
              url={slot.url}
              name={slot.name}
              disabled={disabled}
              labelClassName="block text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200 mb-2"
              fieldLabel={`Boleto — ${parcelLabel}`}
              onChange={({ url, name }) => {
                const next = Array.from({ length: count }, (_, j) =>
                  j === i ? { url, name } : (slots[j] ?? { url: '', name: '' })
                );
                onChange(next);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export { emptySlots as emptyOcBoletoCreationSlots };

export function resizeOcBoletoCreationSlots(
  count: number,
  prev: OcBoletoCreationSlot[] = []
): OcBoletoCreationSlot[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => prev[i] ?? { url: '', name: '' });
}
