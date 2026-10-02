'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
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
  fuelQuotaParentContractId?: string | null;
};

type QuotaConfigResponse = {
  tankPriceReais: number;
  contracts: QuotaContract[];
};

type QuotaGroup = {
  owner: QuotaContract;
  members: QuotaContract[];
};

/** '' → null (sem limite); número inválido/≤0 → undefined (erro de validação). */
function parsePositiveOrNull(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function formatTanksAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function reaisFromTanksRaw(tanksRaw: string, tankPrice: number): string {
  const tanks = parsePositiveOrNull(tanksRaw);
  if (tanks == null || tanks === undefined || tankPrice <= 0) return '';
  return formatCurrencyInputBrFromNumber(tanks * tankPrice);
}

function tanksFromReaisRaw(reaisRaw: string, tankPrice: number): string {
  const reais = parseCurrencyInputBr(reaisRaw);
  if (reais == null || reais <= 0 || tankPrice <= 0) return '';
  return formatTanksAmount(reais / tankPrice);
}

function buildQuotaGroups(contracts: QuotaContract[]): QuotaGroup[] {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const resolveRoot = (id: string) => {
    const seen = new Set<string>();
    let current = id;
    while (byId.get(current)?.fuelQuotaParentContractId) {
      if (seen.has(current)) break;
      seen.add(current);
      current = byId.get(current)?.fuelQuotaParentContractId as string;
    }
    return byId.has(current) ? current : id;
  };

  const grouped = new Map<string, QuotaContract[]>();
  contracts.forEach((c) => {
    const rootId = resolveRoot(c.id);
    const list = grouped.get(rootId) || [];
    list.push(c);
    grouped.set(rootId, list);
  });

  return Array.from(grouped.entries())
    .map(([rootId, members]) => {
      const owner = byId.get(rootId) || members[0];
      const rest = members
        .filter((m) => m.id !== owner.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      return { owner, members: [owner, ...rest] };
    })
    .sort((a, b) => a.owner.name.localeCompare(b.owner.name, 'pt-BR'));
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
  const [reaisInputs, setReaisInputs] = useState<Record<string, string>>({});

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
    const price = Number(data.tankPriceReais) || 0;
    setTankPriceInput(formatCurrencyInputBrFromNumber(price));
    const nextTanks: Record<string, string> = {};
    const nextReais: Record<string, string> = {};
    data.contracts.forEach((c) => {
      const tanksRaw = c.weeklyTankQuota == null ? '' : String(c.weeklyTankQuota);
      nextTanks[c.id] = tanksRaw;
      nextReais[c.id] = reaisFromTanksRaw(tanksRaw, price);
    });
    setQuotaInputs(nextTanks);
    setReaisInputs(nextReais);
  }, [data]);

  const groups = useMemo(() => buildQuotaGroups(data?.contracts ?? []), [data?.contracts]);
  const tankPriceNum = parseCurrencyInputBr(tankPriceInput) || 0;

  const handleTankPriceInputChange = (raw: string) => {
    const masked = maskCurrencyInputBrOrEmpty(raw);
    setTankPriceInput(masked);
    const price = parseCurrencyInputBr(masked) || 0;
    setReaisInputs((prev) => {
      const next: Record<string, string> = { ...prev };
      Object.keys(quotaInputs).forEach((id) => {
        next[id] = reaisFromTanksRaw(quotaInputs[id] ?? '', price);
      });
      return next;
    });
  };

  const handleTanksChange = (contractId: string, raw: string) => {
    setQuotaInputs((prev) => ({ ...prev, [contractId]: raw }));
    setReaisInputs((prev) => ({
      ...prev,
      [contractId]: reaisFromTanksRaw(raw, tankPriceNum),
    }));
  };

  const handleReaisChange = (contractId: string, raw: string) => {
    const masked = maskCurrencyInputBrOrEmpty(raw);
    setReaisInputs((prev) => ({ ...prev, [contractId]: masked }));
    setQuotaInputs((prev) => ({
      ...prev,
      [contractId]: tanksFromReaisRaw(masked, tankPriceNum),
    }));
  };

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
    mutationFn: async (payload: {
      contractId: string;
      weeklyFuelTankQuota?: number | null;
      fuelQuotaParentContractId?: string | null;
      dissolveGroup?: boolean;
    }) => {
      const { contractId, ...body } = payload;
      await api.patch(`/fuel-refuel-requests/quota-config/contracts/${contractId}`, body);
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.dissolveGroup
          ? 'Grupo desfeito'
          : variables.fuelQuotaParentContractId === null
            ? 'Contrato desagrupado'
            : variables.fuelQuotaParentContractId
              ? 'Contratos agrupados'
              : 'Cota semanal atualizada'
      );
      queryClient.invalidateQueries({ queryKey: ['fuel-quota-config'] });
    },
    onError: (error: {
      response?: { data?: { message?: string; error?: string } };
      message?: string;
    }) =>
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          'Erro ao atualizar cota'
      ),
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
    quotaMutation.mutate({ contractId, weeklyFuelTankQuota: value });
  };

  const handleGroupChange = (
    contractId: string,
    parentId: string,
    currentParentId?: string | null,
    options?: { dissolveIfEmpty?: boolean }
  ) => {
    const next = parentId.trim() ? parentId : null;
    const current = currentParentId || null;
    if (!next && options?.dissolveIfEmpty) {
      quotaMutation.mutate({ contractId, dissolveGroup: true });
      return;
    }
    if (next === current) return;
    quotaMutation.mutate({
      contractId,
      fuelQuotaParentContractId: next,
    });
  };

  const ownerOptions = labeledToSelectOptions(
    groups.map((g) => ({ value: g.owner.id, label: g.owner.name }))
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Configurar cotas de abastecimento" size="xl">
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
              onChange={(e) => handleTankPriceInputChange(e.target.value)}
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
            Cota semanal por contrato
          </p>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Edite tanques ou o valor em R$ — o outro campo calcula sozinho. Deixe em branco pra não
            limitar. Em Agrupar com, junte contratos que compartilham o mesmo saldo.
          </p>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                      Contrato
                    </th>
                    <th className="w-56 px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">
                      Agrupar com
                    </th>
                    <th className="w-28 px-3 py-2 text-center font-medium text-gray-500 dark:text-gray-400">
                      Tanques/semana
                    </th>
                    <th className="w-36 px-3 py-2 text-center font-medium text-gray-500 dark:text-gray-400">
                      Equivale a (R$)
                    </th>
                    <th className="w-16 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {groups.map((group) => {
                    const isGrouped = group.members.length > 1;
                    const ownerTanksRaw = quotaInputs[group.owner.id] ?? '';
                    const ownerReaisRaw = reaisInputs[group.owner.id] ?? '';
                    const groupOptions = ownerOptions.filter((opt) => opt.value !== group.owner.id);
                    const ownerReaisLabel =
                      ownerReaisRaw.trim() ||
                      (ownerTanksRaw.trim() ? '—' : 'Sem limite');

                    return (
                      <React.Fragment key={group.owner.id}>
                        <tr
                          className={
                            isGrouped
                              ? 'bg-red-50/70 dark:bg-red-950/25'
                              : undefined
                          }
                        >
                          <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                            <div className="font-medium">{group.owner.name}</div>
                            {isGrouped ? (
                              <div className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                                Grupo · {group.members.length} contratos
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <StringSingleSelectDropdown
                              value=""
                              onChange={(value) =>
                                handleGroupChange(group.owner.id, value, null, {
                                  dissolveIfEmpty: isGrouped,
                                })
                              }
                              options={groupOptions}
                              placeholder={isGrouped ? 'Dono do grupo' : 'Sem grupo'}
                              emptyOptionLabel={isGrouped ? 'Desfazer grupo' : 'Sem grupo'}
                              searchPlaceholder="Buscar contrato..."
                              matchTriggerWidth
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={ownerTanksRaw}
                              onChange={(e) => handleTanksChange(group.owner.id, e.target.value)}
                              placeholder="Sem limite"
                              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-center text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={ownerReaisRaw}
                              onChange={(e) => handleReaisChange(group.owner.id, e.target.value)}
                              placeholder="Sem limite"
                              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-center text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleSaveQuota(group.owner.id)}
                              disabled={quotaMutation.isPending}
                              aria-label={`Salvar cota de ${group.owner.name}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                            >
                              <Save className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        {group.members
                          .filter((member) => member.id !== group.owner.id)
                          .map((member) => (
                            <tr
                              key={member.id}
                              className="bg-red-50/40 dark:bg-red-950/15"
                            >
                              <td className="px-3 py-2 pl-8 text-gray-900 dark:text-gray-100">
                                <div>{member.name}</div>
                                <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  usa a cota de {group.owner.name}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <StringSingleSelectDropdown
                                  value={group.owner.id}
                                  onChange={(value) => handleGroupChange(member.id, value, group.owner.id)}
                                  options={ownerOptions.filter((opt) => opt.value !== member.id)}
                                  placeholder="Sem grupo"
                                  emptyOptionLabel="Sem grupo"
                                  searchPlaceholder="Buscar contrato..."
                                  matchTriggerWidth
                                />
                              </td>
                              <td className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                                usa esta cota
                              </td>
                              <td className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                                {ownerReaisLabel}
                              </td>
                              <td className="px-3 py-2" />
                            </tr>
                          ))}
                      </React.Fragment>
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
