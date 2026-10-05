'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import {
  CURRENT_STATUS_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  RECEIPT_TYPE_OPTIONS,
  type CurrentStatusValue,
  type DeliveryTypeValue,
  type PaymentStatusValue,
  type PoloValue,
  type ReceiptTypeValue,
} from '@/components/suprimentos/materialDeliveryLabels';

export type MaterialDeliveryFormState = {
  polo: PoloValue;
  movementId: string;
  movementNumber: string;
  contractId: string;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierId: string;
  purchaseOrderId: string;
  orderValue: string;
  expectedDelivery: string;
  actualDelivery: string;
  receivedAt: string;
  receiptType: ReceiptTypeValue | '';
  totalPaid: string;
  rmNumber: string;
  deliveryType: DeliveryTypeValue | '';
  observations: string;
};

export const EMPTY_MATERIAL_DELIVERY_FORM: MaterialDeliveryFormState = {
  polo: 'DF',
  movementId: '',
  movementNumber: '',
  contractId: '',
  currentStatus: 'APROVADO_SUPRIMENTOS',
  paymentStatus: 'AGUARDANDO_PAGAMENTO',
  supplierId: '',
  purchaseOrderId: '',
  orderValue: '',
  expectedDelivery: '',
  actualDelivery: '',
  receivedAt: '',
  receiptType: '',
  totalPaid: '',
  rmNumber: '',
  deliveryType: '',
  observations: '',
};

type EditingDelivery = {
  id: string;
  deliveryNumber: string;
  polo: PoloValue;
  movementId: string | null;
  movementNumber: string | null;
  contractId?: string | null;
  currentStatus: CurrentStatusValue;
  paymentStatus: PaymentStatusValue;
  supplierId?: string | null;
  purchaseOrderId: string | null;
  orderValue: string | number | null;
  expectedDelivery: string | null;
  actualDelivery?: string | null;
  receivedAt?: string | null;
  receiptType?: ReceiptTypeValue | null;
  totalPaid: string | number | null;
  rmNumber: string | null;
  deliveryType: string | null;
  observations: string | null;
};

function toInputDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function toInputDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeDeliveryTypeValue(value: string | null | undefined): DeliveryTypeValue | '' {
  if (!value) return '';
  const upper = value.trim().toUpperCase();
  if (upper === 'CIF' || upper.includes('CIF')) return 'CIF';
  if (upper === 'FOB' || upper.includes('FOB')) return 'FOB';
  return '';
}

export function editingDeliveryToForm(row: EditingDelivery): MaterialDeliveryFormState {
  return {
    polo: row.polo,
    movementId: row.movementId ?? '',
    movementNumber: row.movementNumber ?? '',
    contractId: row.contractId ?? '',
    currentStatus: row.currentStatus,
    paymentStatus: row.paymentStatus,
    supplierId: row.supplierId ?? '',
    purchaseOrderId: row.purchaseOrderId ?? '',
    orderValue: formatCurrencyInputBrFromNumber(row.orderValue),
    expectedDelivery: toInputDate(row.expectedDelivery),
    actualDelivery: toInputDate(row.actualDelivery),
    receivedAt: toInputDateTimeLocal(row.receivedAt),
    receiptType: row.receiptType === 'TOTAL' || row.receiptType === 'PARCIAL' ? row.receiptType : '',
    totalPaid: formatCurrencyInputBrFromNumber(row.totalPaid),
    rmNumber: row.rmNumber ?? '',
    deliveryType: normalizeDeliveryTypeValue(row.deliveryType),
    observations: row.observations ?? '',
  };
}

const NO_FOCUS =
  'outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

const fieldClassName = `w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm ${NO_FOCUS}`;
const currencyFieldClassName = `${fieldClassName} text-right tabular-nums`;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  editing?: EditingDelivery | null;
  /** Extra query keys to invalidate after save (page-specific lists). */
  invalidateKeys?: string[][];
};

export function MaterialDeliveryFormModal({
  isOpen,
  onClose,
  editing = null,
  invalidateKeys = [],
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MaterialDeliveryFormState>(EMPTY_MATERIAL_DELIVERY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    setForm(editing ? editingDeliveryToForm(editing) : EMPTY_MATERIAL_DELIVERY_FORM);
  }, [isOpen, editing]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const { data: suppliersRes } = useQuery({
    queryKey: ['suppliers-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { isActive: true, limit: 500 } });
      return res.data;
    },
    enabled: isOpen,
  });

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-deliveries'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: isOpen,
  });

  const suppliers = suppliersRes?.data ?? [];
  const contracts = (contractsRes?.data ?? []) as { id: string; name: string }[];

  const contractOptions = useMemo(
    () => contracts.map((c) => ({ value: c.id, label: c.name })),
    [contracts]
  );

  const supplierOptions = useMemo(
    () => suppliers.map((s: { id: string; name: string }) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const currentStatusOptions = useMemo(
    () => CURRENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const paymentStatusOptions = useMemo(
    () => PAYMENT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const deliveryTypeOptions = useMemo(
    () => DELIVERY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    []
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedSupplier = suppliers.find(
        (s: { id: string; name: string }) => s.id === form.supplierId
      );
      const payload = {
        polo: form.polo,
        movementId: form.movementId,
        movementNumber: form.movementNumber,
        contractId: form.contractId || null,
        currentStatus: form.currentStatus,
        paymentStatus: form.paymentStatus,
        supplierId: form.supplierId || null,
        supplierName: selectedSupplier?.name ?? null,
        purchaseOrderId: form.purchaseOrderId || null,
        orderValue: parseCurrencyInputBr(form.orderValue),
        totalPaid: parseCurrencyInputBr(form.totalPaid),
        rmNumber: form.rmNumber,
        expectedDelivery: form.expectedDelivery || null,
        actualDelivery: form.actualDelivery || null,
        receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : null,
        receiptType: form.receiptType || null,
        deliveryType: form.deliveryType || null,
        observations: form.observations,
      };
      if (editing) {
        const res = await api.patch(`/material-deliveries/${editing.id}`, payload);
        return res.data;
      }
      const res = await api.post('/material-deliveries', payload);
      return res.data;
    },
    onSuccess: () => {
      const keys = [
        ['material-deliveries'],
        ['material-deliveries-summary'],
        ['material-deliveries-recebimento'],
        ['material-deliveries-summary-recebimento'],
        ['material-deliveries-recebimento-pending-count'],
        ...invalidateKeys,
      ];
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      toast.success(editing ? 'Entrega atualizada' : 'Entrega registrada');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erro ao salvar entrega');
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? `Editar ${editing.deliveryNumber}` : 'Nova entrega'}
      size="lg"
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">ID Mov</label>
            <input
              value={form.movementId}
              onChange={(e) => setForm((f) => ({ ...f, movementId: e.target.value }))}
              className={fieldClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nº Mov</label>
            <input
              value={form.movementNumber}
              onChange={(e) => setForm((f) => ({ ...f, movementNumber: e.target.value }))}
              className={fieldClassName}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">N° RM</label>
            <input
              value={form.rmNumber}
              onChange={(e) => setForm((f) => ({ ...f, rmNumber: e.target.value }))}
              className={fieldClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Entrega efetiva</label>
            <input
              type="date"
              value={form.actualDelivery}
              onChange={(e) => setForm((f) => ({ ...f, actualDelivery: e.target.value }))}
              className={fieldClassName}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Recebido pela engenharia</label>
            <input
              type="datetime-local"
              value={form.receivedAt}
              onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))}
              className={fieldClassName}
            />
          </div>

          <div className="sm:col-span-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Recebimento de material
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Local de recebimento</label>
                <SingleSelectSearchDropdown
                  value={form.contractId}
                  onChange={(contractId) => setForm((f) => ({ ...f, contractId }))}
                  options={contractOptions}
                  allowEmpty={false}
                  placeholder="Selecionar contrato / obra..."
                  noFocusRing
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1">Recebimento *</label>
                <div className="flex w-full gap-2">
                  {RECEIPT_TYPE_OPTIONS.map((o) => (
                    <ButtonSeg
                      key={o.value}
                      active={form.receiptType === o.value}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          receiptType: f.receiptType === o.value ? '' : o.value,
                        }))
                      }
                      label={o.label.toUpperCase()}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tipo de entrega</label>
                <SingleSelectSearchDropdown
                  value={form.deliveryType}
                  onChange={(deliveryType) =>
                    setForm((f) => ({ ...f, deliveryType: deliveryType as DeliveryTypeValue | '' }))
                  }
                  options={deliveryTypeOptions}
                  allowEmpty={false}
                  placeholder="CIF / FOB..."
                  noFocusRing
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status atual</label>
                <SingleSelectSearchDropdown
                  value={form.currentStatus}
                  onChange={(currentStatus) =>
                    setForm((f) => ({ ...f, currentStatus: currentStatus as CurrentStatusValue }))
                  }
                  options={currentStatusOptions}
                  allowEmpty={false}
                  placeholder="Selecionar status..."
                  noFocusRing
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Pagamento</label>
            <SingleSelectSearchDropdown
              value={form.paymentStatus}
              onChange={(paymentStatus) =>
                setForm((f) => ({ ...f, paymentStatus: paymentStatus as PaymentStatusValue }))
              }
              options={paymentStatusOptions}
              allowEmpty={false}
              placeholder="Selecionar pagamento..."
              noFocusRing
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Fornecedor</label>
            <SingleSelectSearchDropdown
              value={form.supplierId}
              onChange={(supplierId) => setForm((f) => ({ ...f, supplierId }))}
              options={supplierOptions}
              allowEmpty={false}
              placeholder="Selecionar fornecedor..."
              noFocusRing
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Valor OC</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.orderValue}
              onChange={(e) =>
                setForm((f) => ({ ...f, orderValue: maskCurrencyInputBrOrEmpty(e.target.value) }))
              }
              placeholder="R$ 0,00"
              className={currencyFieldClassName}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Valor total pago</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.totalPaid}
              onChange={(e) =>
                setForm((f) => ({ ...f, totalPaid: maskCurrencyInputBrOrEmpty(e.target.value) }))
              }
              placeholder="R$ 0,00"
              className={currencyFieldClassName}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Observações</label>
            <textarea
              rows={2}
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              className={fieldClassName}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Registrar entrega'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
