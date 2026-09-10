'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  FD_PURCHASE_STATUS_OPTIONS,
  formatCurrencyDisplay,
  type DemandSheetPurchaseStatus,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

interface FichaDemandaPurchaseStatusModalProps {
  record: FichaDemandaApprovalRecord | null;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (purchaseStatus: DemandSheetPurchaseStatus) => void;
}

export function FichaDemandaPurchaseStatusModal({
  record,
  isOpen,
  isSaving = false,
  onClose,
  onSave,
}: FichaDemandaPurchaseStatusModalProps) {
  const [selectedStatus, setSelectedStatus] = useState('');

  const statusOptions = useMemo(
    () => labeledToSelectOptions(FD_PURCHASE_STATUS_OPTIONS),
    [],
  );

  useEffect(() => {
    if (!record) {
      setSelectedStatus('');
      return;
    }
    setSelectedStatus(record.purchaseStatus ?? '');
  }, [record]);

  const handleSave = () => {
    if (!selectedStatus) return;
    onSave(selectedStatus as DemandSheetPurchaseStatus);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Status de compras — Ficha de Demanda"
      size="lg"
      contentOverflowVisible
    >
      {record ? (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Cód. ficha de demanda</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.codFichaDemanda}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Código do pedido</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.codigoPedido}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Contrato</p>
              <p className="font-medium uppercase text-gray-900 dark:text-gray-100">
                {record.contratoNome}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Obra</p>
              <p className="font-medium uppercase text-gray-900 dark:text-gray-100">{record.obra}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.solicitanteNome}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Polo</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{record.polo}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Faturamento estimado</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrencyDisplay(record.faturamentoEstimado)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Custo estimado</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {formatCurrencyDisplay(record.custoEstimado)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Observação</p>
            <p className="text-gray-900 dark:text-gray-100">{record.observacao}</p>
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Aprovação<span className="text-red-500"> *</span>
            </label>
            <StringSingleSelectDropdown
              value={selectedStatus}
              onChange={setSelectedStatus}
              options={statusOptions}
              placeholder="Selecione o status..."
              emptyOptionLabel="Selecione o status..."
              searchPlaceholder="Pesquisar status..."
              matchTriggerWidth
              className="w-full"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Selecione um único status de compras para esta ficha.
            </p>
            {record.purchaseStatusUpdatedAt ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Última atualização: {record.purchaseStatusUpdatedAt}
                {record.purchaseStatusUpdaterNome
                  ? ` — ${record.purchaseStatusUpdaterNome}`
                  : ''}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={!selectedStatus || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar status'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
