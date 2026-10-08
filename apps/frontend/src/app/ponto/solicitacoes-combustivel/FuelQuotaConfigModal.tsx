'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
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
  urgencyReais?: number | null;
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

const fieldClass =
  'h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-900/70 dark:text-gray-100';
const labelClass =
  'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const saveButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50';
const removeButtonClass =
  'inline-flex h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800';

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
  const [urgencyInputs, setUrgencyInputs] = useState<Record<string, string>>({});

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
    const nextUrgency: Record<string, string> = {};
    data.contracts.forEach((c) => {
      const tanksRaw = c.weeklyTankQuota == null ? '' : String(c.weeklyTankQuota);
      nextTanks[c.id] = tanksRaw;
      nextReais[c.id] = reaisFromTanksRaw(tanksRaw, price);
      nextUrgency[c.id] =
        c.urgencyReais && c.urgencyReais > 0
          ? formatCurrencyInputBrFromNumber(c.urgencyReais)
          : '';
    });
    setQuotaInputs(nextTanks);
    setReaisInputs(nextReais);
    setUrgencyInputs(nextUrgency);
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
      urgencyReais?: number | null;
    }) => {
      const { contractId, ...body } = payload;
      await api.patch(`/fuel-refuel-requests/quota-config/contracts/${contractId}`, body);
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.urgencyReais === null
          ? 'Urgência desta semana removida'
          : variables.urgencyReais !== undefined
            ? 'Urgência desta semana atualizada'
            : variables.dissolveGroup
            ? 'Grupo desfeito'
            : variables.fuelQuotaParentContractId === null
              ? 'Contrato desagrupado'
              : variables.fuelQuotaParentContractId
                ? 'Contratos agrupados'
                : 'Cota semanal atualizada'
      );
      queryClient.invalidateQueries({ queryKey: ['fuel-quota-config'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-quota-balances'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-urgency-chart'] });
      queryClient.invalidateQueries({ queryKey: ['fuel-quota-balance'] });
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

  const handleSaveUrgency = (contractId: string) => {
    const raw = (urgencyInputs[contractId] ?? '').trim();
    if (!raw) {
      quotaMutation.mutate({ contractId, urgencyReais: null });
      return;
    }
    const value = parseCurrencyInputBr(raw);
    if (value == null || value < 0) {
      toast.error('Informe um valor de urgência válido');
      return;
    }
    quotaMutation.mutate({ contractId, urgencyReais: value });
  };

  const handleRemoveUrgency = (contractId: string) => {
    setUrgencyInputs((prev) => ({ ...prev, [contractId]: '' }));
    quotaMutation.mutate({ contractId, urgencyReais: null });
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
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className={labelClass}>Valor do tanque</label>
              <input
                type="text"
                inputMode="numeric"
                value={tankPriceInput}
                onChange={(e) => handleTankPriceInputChange(e.target.value)}
                placeholder="R$ 0,00"
                className={fieldClass}
              />
            </div>
            <button
              type="button"
              onClick={handleSaveTankPrice}
              disabled={tankPriceMutation.isPending}
              className={saveButtonClass}
            >
              {tankPriceMutation.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            A cota em tanques vira reais com esse valor, em todos os contratos.
          </p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cotas da semana</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Campo vazio fica sem limite. Tanques e valor se calculam juntos.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {groups.map((group) => {
              const isGrouped = group.members.length > 1;
              const ownerTanksRaw = quotaInputs[group.owner.id] ?? '';
              const ownerReaisRaw = reaisInputs[group.owner.id] ?? '';
              const groupOptions = ownerOptions.filter((opt) => opt.value !== group.owner.id);
              const members = group.members.filter((member) => member.id !== group.owner.id);
              const ownerReaisLabel = ownerReaisRaw.trim()
                ? ownerReaisRaw
                : ownerTanksRaw.trim()
                  ? '—'
                  : 'Sem limite';

              return (
                <article
                  key={group.owner.id}
                  className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {group.owner.name}
                    </p>
                    {isGrouped ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                        {group.members.length} contratos
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.3fr)_7.5rem_9.5rem_auto] sm:items-end">
                    <div>
                      <label className={labelClass}>Grupo</label>
                      <StringSingleSelectDropdown
                        value=""
                        onChange={(value) =>
                          handleGroupChange(group.owner.id, value, null, {
                            dissolveIfEmpty: isGrouped,
                          })
                        }
                        options={groupOptions}
                        placeholder={isGrouped ? 'Este define a cota' : 'Sozinho'}
                        emptyOptionLabel={isGrouped ? 'Desfazer grupo' : 'Sozinho'}
                        searchPlaceholder="Buscar contrato..."
                        matchTriggerWidth
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Tanques</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ownerTanksRaw}
                        onChange={(e) => handleTanksChange(group.owner.id, e.target.value)}
                        placeholder="Sem limite"
                        className={`${fieldClass} text-center`}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Valor</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={ownerReaisRaw}
                        onChange={(e) => handleReaisChange(group.owner.id, e.target.value)}
                        placeholder="Sem limite"
                        className={fieldClass}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveQuota(group.owner.id)}
                      disabled={quotaMutation.isPending}
                      className={saveButtonClass}
                    >
                      Salvar
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <label className={labelClass}>Urgência desta semana</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={urgencyInputs[group.owner.id] ?? ''}
                        onChange={(e) =>
                          setUrgencyInputs((prev) => ({
                            ...prev,
                            [group.owner.id]: maskCurrencyInputBrOrEmpty(e.target.value),
                          }))
                        }
                        placeholder="R$ 0,00"
                        className={fieldClass}
                      />
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        Soma só nesta semana. Não altera tanques nem o valor da cota.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {(group.owner.urgencyReais ?? 0) > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveUrgency(group.owner.id)}
                          disabled={quotaMutation.isPending}
                          className={removeButtonClass}
                        >
                          Remover
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleSaveUrgency(group.owner.id)}
                        disabled={quotaMutation.isPending}
                        className={saveButtonClass}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>

                  {members.length > 0 ? (
                    <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-700">
                      {members.map((member) => (
                        <div
                          key={member.id}
                          className="grid grid-cols-1 items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_14rem] dark:bg-gray-900/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-gray-800 dark:text-gray-100">
                              {member.name}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              Usa esta cota · {ownerTanksRaw.trim() || 'sem limite'} tanque(s) ·{' '}
                              {ownerReaisLabel}
                            </p>
                          </div>
                          <StringSingleSelectDropdown
                            value={group.owner.id}
                            onChange={(value) =>
                              handleGroupChange(member.id, value, group.owner.id)
                            }
                            options={ownerOptions.filter((opt) => opt.value !== member.id)}
                            placeholder="Sozinho"
                            emptyOptionLabel="Sair do grupo"
                            searchPlaceholder="Buscar contrato..."
                            matchTriggerWidth
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
