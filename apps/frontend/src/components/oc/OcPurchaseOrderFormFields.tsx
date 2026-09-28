'use client';

import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PaymentConditionSelect } from '@/components/oc/PaymentConditionSelect';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { searchOcSuppliers } from '@/components/oc/searchOcSuppliers';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty
} from '@/lib/maskCurrencyBr';
import api from '@/lib/api';
import {
  parseTotvsFilial,
  resolveTotvsFilialFromCostCenter,
  TOTVS_FREIGHT_TYPES,
  TOTVS_OC_FILIAL_OPTIONS,
  TOTVS_OC_PAYMENT_AVISTA,
  TOTVS_OC_PAYMENT_AVISTA_LABEL,
  totvsFilialLabel,
  totvsFreightTypeLabel,
} from '@/lib/ocTotvsDestination';
import { formatCurrencyBR } from '@/app/ponto/gerenciar-materiais/_lib/ocAmounts';
import { catalogMaterialLabel, materialProductCode } from '@/app/ponto/gerenciar-materiais/_lib/display';
import {
  formatOcCorrectionAuthor,
  type OcCorrectionInfo,
} from '@/lib/ocCorrectionNotes';

export const TOTVS_OC_FILIAL_CODE = '1';

export function OcFilialField({
  value,
  onChange,
  readOnly,
  labelClassName,
}: {
  value?: string | number | null;
  onChange?: (code: string) => void;
  readOnly?: boolean;
  labelClassName?: string;
}) {
  const selected = String(value === 5 || value === '5' ? 5 : 1);
  return (
    <div>
      <label className={labelClassName || 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'}>
        Filial {readOnly ? '' : '*'}
      </label>
      {readOnly || !onChange ? (
        <div className={ocFieldReadonlyCls} aria-readonly="true">
          {totvsFilialLabel(selected)}
        </div>
      ) : (
        <SingleSelectSearchDropdown
          value={selected}
          onChange={onChange}
          options={TOTVS_OC_FILIAL_OPTIONS.map((row) => ({
            value: row.value,
            label: row.label,
            searchText: row.label,
          }))}
          allowEmpty={false}
          placeholder="Selecione..."
          searchPlaceholder="Pesquisar..."
          noFocusRing
        />
      )}
    </div>
  );
}

/** @deprecated Use OcFilialField */
export function OcFilialReadonlyField() {
  return <OcFilialField value={TOTVS_OC_FILIAL_CODE} readOnly />;
}

export type StockLocationOption = {
  id: string;
  code: string;
  name: string;
  filial?: number;
  polo?: string | null;
};

export function formatOcCostCenterLabel(
  cc?: { code?: string | null; name?: string | null } | null
): string {
  if (!cc) return '—';
  const code = (cc.code || '').trim();
  const name = (cc.name || '').trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || '—';
}

export function formatOcStockLocationLabel(
  loc?: { code?: string | null; name?: string | null } | null
): string {
  if (!loc) return '';
  const code = (loc.code || '').trim();
  const name = (loc.name || '').trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || '';
}

export function OcCostCenterField({
  label,
  labelClassName,
}: {
  label?: string | null;
  labelClassName?: string;
}) {
  return (
    <div>
      <label className={labelClassName || 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'}>
        Centro de custo
      </label>
      <div className={ocFieldReadonlyCls} aria-readonly="true">
        {label?.trim() || '—'}
      </div>
    </div>
  );
}

export function OcStockLocationField({
  value,
  filial,
  onChange,
  readOnly,
  selectedLabel,
  labelClassName,
  required = true,
}: {
  value?: string | null;
  filial?: string | number | null;
  onChange?: (location: StockLocationOption | null) => void;
  readOnly?: boolean;
  selectedLabel?: string | null;
  labelClassName?: string;
  required?: boolean;
}) {
  const filialCode = String(parseTotvsFilial(filial));
  const { data: locations = [] } = useQuery({
    queryKey: ['stock-locations', 'oc', filialCode],
    queryFn: async () => {
      const res = await api.get('/stock-locations', {
        params: { isActive: 'true', filial: filialCode, page: 1, limit: 2000 },
      });
      return (res.data?.data || []) as StockLocationOption[];
    },
    staleTime: 30_000,
  });

  const selected = locations.find((row) => row.id === value) || null;

  useEffect(() => {
    if (!value || !locations.length || !onChange) return;
    if (!selected) onChange(null);
    // onChange é callback do pai; só reagimos à filial/lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filialCode, locations, selected, value]);

  const options = useMemo(
    () =>
      locations.map((row) => ({
        value: row.id,
        label: formatOcStockLocationLabel(row) || row.code,
        searchText: `${row.code} ${row.name}`,
      })),
    [locations]
  );

  return (
    <div>
      <label className={labelClassName || 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'}>
        Local de estoque {readOnly || !required ? '' : '*'}
      </label>
      {readOnly || !onChange ? (
        <div className={ocFieldReadonlyCls} aria-readonly="true">
          {selectedLabel || formatOcStockLocationLabel(selected) || '—'}
        </div>
      ) : (
        <SingleSelectSearchDropdown
          value={value || ''}
          onChange={(id) => onChange(locations.find((row) => row.id === id) || null)}
          options={options}
          allowEmpty
          placeholder="Selecione o local de estoque..."
          searchPlaceholder="Pesquisar local..."
          noFocusRing
        />
      )}
    </div>
  );
}

export const OC_PIX_KEY_TYPES = ['ALEATÓRIA', 'CELULAR', 'CNPJ', 'CPF', 'E-MAIL'] as const;

export const OC_PIX_KEY_TYPE_OPTIONS: MultiSelectSearchOption[] = OC_PIX_KEY_TYPES.map((type) => ({
  value: type,
  label: type,
  searchText: type
}));

const OC_PAYMENT_TYPE_LABELS: Record<string, string> = {
  AVISTA: 'À vista',
  BOLETO: 'Boleto'
};

export const ocFieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

const ocFieldCompactCls =
  'w-full min-w-0 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50';

const ocFieldReadonlyCls =
  'w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100';

const ocPaymentSegmentCls = (active: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
    active
      ? 'border-red-600 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200'
      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
  }`;

export type OcSupplierOption = {
  id: string;
  code: string;
  name: string;
  tradeName?: string | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  accountDigit?: string | null;
  pixKeyType?: string | null;
  pixKey?: string | null;
};

export function getOcSupplierLabel(supplier?: OcSupplierOption | null): string {
  if (!supplier) return '';
  const displayName = supplier.tradeName?.trim() || supplier.name?.trim() || '';
  return supplier.code ? `${supplier.code} - ${displayName}` : displayName;
}

export type OcFormLineItem = {
  materialId: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  materialLabel: string;
  scQuantity?: number | null;
};

export type OcPurchaseOrderFormValues = {
  supplierId: string;
  paymentType: string;
  paymentCondition: string;
  paymentDetails: string;
  pixKeyType: string;
  pixKey: string;
  freightType: string;
  totvsCodFilial: string;
  stockLocationId: string;
  totvsCodLoc: string;
  freightAmount: string;
  notes: string;
  items: OcFormLineItem[];
};

type SupplierFieldProps = {
  supplierId: string;
  supplierLabel: string;
  onSupplierChange?: (supplier: OcSupplierOption) => void;
};

type OcPurchaseOrderFormFieldsProps = {
  mode: 'view' | 'edit';
  values: OcPurchaseOrderFormValues;
  paymentConditionLabel?: string;
  correctionInfo?: OcCorrectionInfo | null;
  costCenterLabel?: string | null;
  stockLocationLabel?: string | null;
  onChange?: (patch: Partial<OcPurchaseOrderFormValues>) => void;
  onItemChange?: (index: number, patch: Partial<OcFormLineItem>) => void;
  supplierField?: SupplierFieldProps;
  parseMoneyInput?: (value: string) => number | null;
};

function itemsSubtotal(items: OcFormLineItem[]): number {
  return items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.unitPrice), 0);
}

function amountToPay(items: OcFormLineItem[], freightAmount: string, parseMoney?: (v: string) => number | null): number {
  const freight = parseMoney ? parseMoney(freightAmount) ?? 0 : Number(freightAmount) || 0;
  return itemsSubtotal(items) + Math.max(0, freight);
}

export function OcPurchaseOrderFormFields({
  mode,
  values,
  paymentConditionLabel,
  correctionInfo,
  costCenterLabel,
  stockLocationLabel,
  onChange,
  onItemChange,
  supplierField,
  parseMoneyInput
}: OcPurchaseOrderFormFieldsProps) {
  const isEdit = mode === 'edit';
  const isAvista = values.paymentType === 'AVISTA';
  const total = amountToPay(values.items, values.freightAmount, parseMoneyInput);

  return (
    <div className="space-y-4 text-sm">
      {correctionInfo ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 px-3 py-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide mb-1">
            {correctionInfo.kind === 'proof' ? 'Correção do comprovante' : 'Correção solicitada'}
          </p>
          {formatOcCorrectionAuthor(correctionInfo) ? (
            <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
              Enviado por: {formatOcCorrectionAuthor(correctionInfo)}
              {correctionInfo.at ? (
                <span className="font-normal text-amber-800/90 dark:text-amber-200/90"> · {correctionInfo.at}</span>
              ) : null}
            </p>
          ) : null}
          <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide mb-1">
            Motivo
          </p>
          <p className="text-sm text-amber-900 dark:text-amber-100 whitespace-pre-wrap">{correctionInfo.reason}</p>
        </div>
      ) : null}

      <div>
        <div className="mb-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Itens da OC</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {isEdit ? 'Ajuste quantidade e valor unitário dos itens desta OC.' : 'Itens incluídos nesta ordem de compra.'}
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="max-h-[min(280px,40vh)] overflow-auto">
            <table className="w-full min-w-[26rem] table-fixed border-collapse text-sm">
              <colgroup>
                <col />
                <col className="w-[5.5rem]" />
                <col className="w-[6rem]" />
                <col className="w-[7.5rem]" />
              </colgroup>
              <thead className="sticky top-0 z-[1] border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-900/80">
                <tr className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Material
                  </th>
                  <th scope="col" className="px-2 py-2 text-center font-medium">
                    Qtd. SC
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Qtd. na OC
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Valor unit.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {values.items.map((item, idx) => (
                  <tr key={`${item.materialId}-${idx}`} className="bg-white dark:bg-gray-800">
                    <td className="px-2 py-2 align-middle">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">{item.materialLabel}</p>
                    </td>
                    <td className="px-2 py-2 text-center align-middle tabular-nums font-medium text-gray-900 dark:text-gray-100">
                      {item.scQuantity != null ? `${item.scQuantity} ${item.unit}` : '—'}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {isEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(item.quantity)}
                          onChange={(e) => {
                            const nextQty = Number(e.target.value.replace(',', '.'));
                            onItemChange?.(idx, {
                              quantity: Number.isFinite(nextQty) ? nextQty : 0
                            });
                          }}
                          className={`${ocFieldCompactCls} w-full`}
                        />
                      ) : (
                        <div className={ocFieldReadonlyCls}>{item.quantity}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {isEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(item.unitPrice)}
                          onChange={(e) => {
                            const nextPrice = Number(e.target.value.replace(',', '.'));
                            onItemChange?.(idx, {
                              unitPrice: Number.isFinite(nextPrice) ? nextPrice : 0
                            });
                          }}
                          className={`${ocFieldCompactCls} w-full`}
                        />
                      ) : (
                        <div className={ocFieldReadonlyCls}>
                          {formatCurrencyBR(Number(item.unitPrice))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Fornecedor {isEdit ? '*' : ''}
        </label>
        {isEdit && supplierField?.onSupplierChange ? (
          <AsyncSearchSelectDropdown
            value={supplierField.supplierId}
            selectedLabel={supplierField.supplierLabel}
            onChange={supplierField.onSupplierChange}
            searchFn={searchOcSuppliers}
            getOptionId={(supplier) => supplier.id}
            getOptionLabel={getOcSupplierLabel}
            queryKeyPrefix="oc-supplier-field"
            placeholder="Digite para buscar fornecedor..."
            searchPlaceholder="Pesquisar fornecedor..."
          />
        ) : (
          <div className={ocFieldReadonlyCls}>
            {supplierField ? supplierField.supplierLabel || '—' : '—'}
          </div>
        )}
      </div>

      <OcFilialField
        value={values.totvsCodFilial}
        onChange={(code) =>
          onChange?.({
            totvsCodFilial: code,
            stockLocationId: '',
            totvsCodLoc: '',
          })
        }
        readOnly={!isEdit}
      />

      <OcCostCenterField label={costCenterLabel} />

      <OcStockLocationField
        value={values.stockLocationId}
        filial={values.totvsCodFilial}
        selectedLabel={stockLocationLabel || formatOcStockLocationLabel({
          code: values.totvsCodLoc,
          name: stockLocationLabel,
        })}
        readOnly={!isEdit}
        onChange={(loc) =>
          onChange?.({
            stockLocationId: loc?.id || '',
            totvsCodLoc: loc?.code || '',
          })
        }
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tipo de Frete {isEdit ? '*' : ''}
        </label>
        {isEdit ? (
          <SingleSelectSearchDropdown
            value={values.freightType}
            onChange={(v) => onChange?.({ freightType: v })}
            options={TOTVS_FREIGHT_TYPES.map((row) => ({
              value: row.code,
              label: row.label,
              searchText: `${row.code} ${row.label}`,
            }))}
            allowEmpty
            placeholder="Selecione..."
            searchPlaceholder="Pesquisar..."
            noFocusRing
          />
        ) : (
          <div className={ocFieldReadonlyCls}>
            {totvsFreightTypeLabel(values.freightType) || values.freightType || '—'}
          </div>
        )}
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Tipo de pagamento {isEdit ? '*' : ''}
        </span>
        {isEdit ? (
          <div role="radiogroup" aria-label="Tipo de pagamento" className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={isAvista}
              onClick={() =>
                onChange?.({
                  paymentType: 'AVISTA',
                  paymentCondition: TOTVS_OC_PAYMENT_AVISTA
                })
              }
              className={ocPaymentSegmentCls(isAvista)}
            >
              À vista
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!isAvista}
              onClick={() =>
                onChange?.({
                  paymentType: 'BOLETO',
                  paymentCondition:
                    values.paymentCondition === 'AVISTA' || values.paymentCondition === TOTVS_OC_PAYMENT_AVISTA
                      ? 'BOLETO_30'
                      : values.paymentCondition,
                  pixKeyType: '',
                  pixKey: ''
                })
              }
              className={ocPaymentSegmentCls(!isAvista)}
            >
              Boleto
            </button>
          </div>
        ) : (
          <div className="grid w-full grid-cols-2 gap-2">
            <div className={ocPaymentSegmentCls(isAvista)}>{OC_PAYMENT_TYPE_LABELS.AVISTA}</div>
            <div className={ocPaymentSegmentCls(!isAvista)}>{OC_PAYMENT_TYPE_LABELS.BOLETO}</div>
          </div>
        )}
      </div>

      {isAvista ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Condição de pagamento
          </label>
          <div className={ocFieldReadonlyCls} aria-readonly="true">
            {TOTVS_OC_PAYMENT_AVISTA_LABEL}
          </div>
        </div>
      ) : null}

      {!isAvista ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Condição de pagamento {isEdit ? '*' : ''}
          </label>
          {isEdit ? (
            <PaymentConditionSelect
              paymentType="BOLETO"
              value={values.paymentCondition}
              onChange={(code) => onChange?.({ paymentCondition: code })}
            />
          ) : (
            <div className={ocFieldReadonlyCls}>
              {paymentConditionLabel || values.paymentCondition || '—'}
            </div>
          )}
        </div>
      ) : null}

      {isAvista ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dados do pagamento *
            </label>
            {isEdit ? (
              <textarea
                value={values.paymentDetails}
                onChange={(e) => onChange?.({ paymentDetails: e.target.value })}
                rows={3}
                className={`${ocFieldCls} resize-y`}
                placeholder="Conta, agência, favorecido, etc."
              />
            ) : (
              <div className={`${ocFieldReadonlyCls} whitespace-pre-wrap min-h-[4.5rem]`}>
                {values.paymentDetails?.trim() || '—'}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2.2fr)]">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tipo de Chave Pix *
              </label>
              {isEdit ? (
                <SingleSelectSearchDropdown
                  value={values.pixKeyType}
                  onChange={(v) => onChange?.({ pixKeyType: v })}
                  options={OC_PIX_KEY_TYPE_OPTIONS}
                  allowEmpty
                  placeholder="Selecione..."
                  searchPlaceholder="Pesquisar..."
                  noFocusRing
                />
              ) : (
                <div className={ocFieldReadonlyCls}>{values.pixKeyType || '—'}</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Chave Pix *
              </label>
              {isEdit ? (
                <input
                  type="text"
                  value={values.pixKey}
                  onChange={(e) => onChange?.({ pixKey: e.target.value })}
                  className={ocFieldCls}
                  placeholder="Informe a chave PIX"
                />
              ) : (
                <div className={`${ocFieldReadonlyCls} break-all`}>{values.pixKey || '—'}</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Dados do pagamento
          </label>
          {isEdit ? (
            <textarea
              value={values.paymentDetails}
              onChange={(e) => onChange?.({ paymentDetails: e.target.value })}
              rows={3}
              className={`${ocFieldCls} resize-y`}
              placeholder="Conta, agência, favorecido, etc."
            />
          ) : (
            <div className={`${ocFieldReadonlyCls} whitespace-pre-wrap min-h-[4.5rem]`}>
              {values.paymentDetails?.trim() || '—'}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frete</label>
        {isEdit ? (
          <input
            type="text"
            inputMode="numeric"
            placeholder="R$ 0,00"
            value={values.freightAmount}
            onChange={(e) => onChange?.({ freightAmount: maskCurrencyInputBrOrEmpty(e.target.value) })}
            className={`${ocFieldCls} tabular-nums`}
          />
        ) : (
          <div className={ocFieldReadonlyCls}>
            {values.freightAmount?.trim() ? `R$ ${formatCurrencyBR(Number(values.freightAmount.replace(',', '.')) || 0)}` : 'R$ 0,00'}
          </div>
        )}
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Valor total *
        </span>
        <div className={`${ocFieldCls} bg-gray-50 font-semibold dark:bg-gray-900/50`} aria-live="polite">
          R$ {formatCurrencyBR(total)}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Soma dos itens (quantidade × valor unitário) + frete.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Observações</label>
        {isEdit ? (
          <textarea
            value={values.notes}
            onChange={(e) => onChange?.({ notes: e.target.value })}
            rows={3}
            className={`${ocFieldCls} resize-y`}
            placeholder="Observações gerais da OC"
          />
        ) : (
          <div className={`${ocFieldReadonlyCls} whitespace-pre-wrap min-h-[4.5rem]`}>
            {values.notes?.trim() || '—'}
          </div>
        )}
      </div>
    </div>
  );
}

export type OcFormOrderSource = {
  supplier?: { id: string; code?: string; name: string; tradeName?: string | null } | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  pixKeyType?: string | null;
  pixKey?: string | null;
  freightType?: string | null;
  totvsCodFilial?: number | string | null;
  stockLocationId?: string | null;
  totvsCodLoc?: string | null;
  stockLocation?: { id?: string | null; code?: string | null; name?: string | null } | null;
  freightAmount?: number | string | null;
  materialRequest?: {
    costCenter?: { polo?: string | null; state?: string | null; name?: string | null; code?: string | null } | null;
  } | null;
  amountToPay?: number | string | null;
  notes?: string | null;
  items?: Array<{
    materialId?: string;
    material?: {
      id?: string;
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
      code?: string | null;
    };
    materialRequestItem?: { quantity?: number | string | null } | null;
    quantity: number | string;
    unit?: string | null;
    unitPrice: number | string;
  }>;
};

export function buildOcFormValuesFromOrder(
  order: OcFormOrderSource,
  options?: {
    stripCorrectionNotes?: (notes?: string | null) => string;
    materialLineLabel?: (material?: {
      name?: string | null;
      description?: string | null;
      sinapiCode?: string | null;
      code?: string | null;
    }) => string;
    parseFreight?: (order: OcFormOrderSource) => string;
  }
): OcPurchaseOrderFormValues {
  const labelFn = options?.materialLineLabel ?? catalogMaterialLabel;

  const items = (order.items || []).map((it) => {
    const label = labelFn(it.material);
    const code = materialProductCode(it.material);
    return {
      materialId: it.material?.id || it.materialId || '',
      quantity: Number(it.quantity),
      unit: it.unit || 'UN',
      unitPrice: Number(it.unitPrice),
      materialLabel: code ? `${code} — ${label}` : label,
      scQuantity:
        it.materialRequestItem?.quantity != null ? Number(it.materialRequestItem.quantity) : null
    };
  });

  let freightStored = '';
  if (options?.parseFreight) {
    freightStored = options.parseFreight(order);
  } else if (order.freightAmount != null && order.freightAmount !== '') {
    const n = Number(order.freightAmount);
    freightStored = Number.isFinite(n) && n > 0 ? formatCurrencyInputBrFromNumber(n) : '';
  }

  return {
    supplierId: order.supplier?.id || '',
    paymentType: order.paymentType || 'AVISTA',
    paymentCondition: order.paymentCondition || 'AVISTA',
    paymentDetails: order.paymentDetails || '',
    pixKeyType: order.pixKeyType || '',
    pixKey: order.pixKey || '',
    freightType: order.freightType || '',
    totvsCodFilial: String(
      order.totvsCodFilial === 1 ||
        order.totvsCodFilial === '1' ||
        order.totvsCodFilial === 5 ||
        order.totvsCodFilial === '5'
        ? parseTotvsFilial(order.totvsCodFilial)
        : resolveTotvsFilialFromCostCenter(order.materialRequest?.costCenter)
    ),
    stockLocationId: order.stockLocationId || order.stockLocation?.id || '',
    totvsCodLoc: order.totvsCodLoc || order.stockLocation?.code || '',
    freightAmount: freightStored,
    notes: options?.stripCorrectionNotes ? options.stripCorrectionNotes(order.notes) : order.notes || '',
    items
  };
}
