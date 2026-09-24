'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';

type QuotaContract = {
  id: string;
  name: string;
  number: string;
  weeklyTankQuota: number | null;
};

type QuotaConfigResponse = {
  tankPriceReais: number;
  contracts: QuotaContract[];
};

/** '' → null (sem limite); número inválido/≤0 → undefined (erro de validação). */
function parsePositiveOrNull(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function FuelQuotaConfigModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tankPriceInput, setTankPriceInput] = useState('');
  const [quotaInputs, setQuotaInputs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['fuel-quota-config'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/quota-config');
      return res.data?.data as QuotaConfigResponse;
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (!data) return;
    setTankPriceInput(formatCurrencyInputBrFromNumber(data.tankPriceReais));
    const next: Record<string, string> = {};
    data.contracts.forEach((c) => {
      next[c.id] = c.weeklyTankQuota == null ? '' : String(c.weeklyTankQuota);
    });
    setQuotaInputs(next);
  }, [data]);

  const tankPriceMutation = useMutation({
    mutationFn: async (value: number) => {
      await api.patch('/fuel-refuel-requests/quota-config/tank-price', {
        tankPriceReais: value,
      });
    },
    onSuccess: () => {
      toast.success('Valor do tanque atualizado');
      queryClient.invalidateQueries({ queryKey: ['fuel-quota-config'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao atualizar valor do tanque'),
  });

  const quotaMutation = useMutation({
    mutationFn: async ({ contractId, value }: { contractId: string; value: number | null }) => {
      await api.patch(`/fuel-refuel-requests/quota-config/contracts/${contractId}`, {
        weeklyFuelTankQuota: value,
      });
    },
    onSuccess: () => {
      toast.success('Cota semanal atualizada');
      queryClient.invalidateQueries({ queryKey: ['fuel-quota-config'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) =>
      toast.error(error.response?.data?.message || 'Erro ao atualizar cota'),
  });

  const handleSaveTankPrice = () => {
    const value = parseCurrencyInputBr(tankPriceInput);
    if (value == null || value <= 0) {
      toast.error('Informe um valor de tanque válido');
      return;
    }
    tankPriceMutation.mutate(value);
  };

  const handleSaveQuota = (contractId: string) => {
    const raw = quotaInputs[contractId] ?? '';
    const value = parsePositiveOrNull(raw);
    if (value === undefined) {
      toast.error('Informe um número válido de tanques (ou deixe vazio pra sem limite)');
      return;
    }
    quotaMutation.mutate({ contractId, value });
  };

  const tankPriceNum = parseCurrencyInputBr(tankPriceInput) || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurar cotas de abastecimento" size="lg">
      <div className="space-y-5">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Valor do tanque (R$)
          </label>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Usado pra calcular o saldo semanal de todos os contratos (cota em tanques × esse valor).
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={tankPriceInput}
              onChange={(e) => setTankPriceInput(maskCurrencyInputBrOrEmpty(e.target.value))}
              placeholder="R$ 0,00"
              className="h-10 w-44 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <Button type="button" onClick={handleSaveTankPrice} loading={tankPriceMutation.isPending}>
              Salvar
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Cota semanal por contrato (em tanques)
          </p>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Deixe em branco pra não limitar. Contratos com mais de um veículo dividem a mesma cota.
          </p>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                      Contrato
                    </th>
                    <th className="w-32 px-3 py-2 text-center font-medium text-gray-500 dark:text-gray-400">
                      Tanques/semana
                    </th>
                    <th className="w-32 px-3 py-2 text-center font-medium text-gray-500 dark:text-gray-400">
                      Equivale a
                    </th>
                    <th className="w-16 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(data?.contracts ?? []).map((c) => {
                    const raw = quotaInputs[c.id] ?? '';
                    const parsed = Number(raw.replace(',', '.'));
                    const reaisPreview =
                      raw.trim() && Number.isFinite(parsed) ? parsed * tankPriceNum : null;
                    return (
                      <tr key={c.id}>
                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{c.name}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={raw}
                            onChange={(e) =>
                              setQuotaInputs((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            placeholder="Sem limite"
                            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-center text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                          {reaisPreview != null
                            ? reaisPreview.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleSaveQuota(c.id)}
                            disabled={quotaMutation.isPending}
                            aria-label={`Salvar cota de ${c.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
