'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Plus, Receipt, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { PleitoFormModal } from '@/components/pleito/PleitoFormModal';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { usePermissions } from '@/hooks/usePermissions';
import { isPleitoHistorico, getPleitoRemainingBalance } from '@/lib/contractHistoricoPleitos';
import { enrichDivSeOptionsWithPleitos, formatOsSePasta } from '@/lib/formatOsSePasta';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { isUnbRelatedLabel } from '@/lib/unbBranding';
import { formatProductionWeekRange } from '@/lib/contractWeeklyProduction';

type ContractRow = {
  id: string;
  name: string;
  costCenter?: { code?: string | null; name?: string | null };
};

type PleitoRow = {
  id: string;
  divSe: string | null;
  folderNumber: string | null;
  serviceDescription: string;
  budget: string | null;
  reportsBilling: string | null;
  billingRequest?: number | null;
  accumulatedBilled?: number | null;
};

type BillingRow = {
  id: string;
  pleitoId?: string | null;
  serviceOrder?: string | null;
  grossValue: number;
};

function toInputDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatProductionWeekDate(fillingYmd: string): string {
  const match = fillingYmd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '-';
  const filling = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return formatProductionWeekRange(filling);
}

function parseCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

function formatBillingCurrencyFromDigits(digits: string): string {
  return digits
    ? (Number(digits) / 100).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '';
}

function calcBillingNetFromGrossFormatted(grossFormatted: string): string {
  if (!grossFormatted.trim()) return '';
  const gross = parseCurrencyInput(grossFormatted);
  if (!(gross > 0)) return '';
  const net = Math.round(gross * 0.8665 * 100) / 100;
  return net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPleitoBillingOptionLabel(p: PleitoRow, billings: BillingRow[]): string {
  const saldo = getPleitoRemainingBalance(p as never, billings as never);
  const desc = (p.serviceDescription || '').trim();
  const shortDesc = desc.length > 40 ? `${desc.slice(0, 40)}…` : desc;
  const pasta = p.folderNumber ? ` · Pasta ${p.folderNumber}` : '';
  return `${formatOsSePasta(p.divSe || '-', p.folderNumber)}${pasta}${shortDesc ? ` — ${shortDesc}` : ''} (saldo ${formatCurrency(saldo)})`;
}

const EMPTY_BILLING = {
  issueDate: '',
  invoiceNumber: '',
  serviceOrder: '',
  pleitoId: '',
  grossValue: '',
  netValue: '',
};

export function ContratoReunioesLancamentosBar({ contractId }: { contractId: string }) {
  const queryClient = useQueryClient();
  const {
    isElevatedUser,
    canCreateContracts,
    canAccessContract,
    canAccessContractOrdemServicoTab,
    canAccessContractProducaoSemanalTab,
  } = usePermissions();

  const canAccessOs = canAccessContractOrdemServicoTab(contractId);
  const canAccessProducao = canAccessContractProducaoSemanalTab(contractId);
  const canCreate = isElevatedUser || canCreateContracts || canAccessContract(contractId);
  const showBilling = isElevatedUser || canAccessContract(contractId);

  const [showProduction, setShowProduction] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showOsModal, setShowOsModal] = useState(false);
  const [productionForm, setProductionForm] = useState({
    fillingDate: '',
    divSe: '',
    weeklyProductionValue: '',
    responsiblePerson: '',
  });
  const [billingForm, setBillingForm] = useState(EMPTY_BILLING);

  const closeProduction = useCallback(() => setShowProduction(false), []);
  const closeBilling = useCallback(() => {
    setShowBillingModal(false);
    setBillingForm(EMPTY_BILLING);
  }, []);

  const { requestClose: requestCloseProduction, confirmUi: productionConfirmUi } =
    useModalCloseConfirm(closeProduction, { isParentOpen: showProduction });
  const { requestClose: requestCloseBilling, confirmUi: billingConfirmUi } = useModalCloseConfirm(
    closeBilling,
    { isParentOpen: showBillingModal }
  );

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const defaultResponsible = String(userData?.data?.name ?? '').trim();

  const { data: contractData } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });
  const contract = contractData?.data as ContractRow | undefined;

  const { data: pleitosData } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}/pleitos`)).data,
    enabled: !!contractId && (canAccessOs || showBilling),
  });

  const { data: billingsData } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => (await api.get(`/contracts/${contractId}/billings`)).data,
    enabled: !!contractId && showBilling,
  });

  const allPleitos = (pleitosData?.data || []) as PleitoRow[];
  const billings = (billingsData?.data || []) as BillingRow[];
  const usesUnbBillingNetFactor = useMemo(() => {
    if (!contract) return false;
    return (
      isUnbRelatedLabel(contract.name) ||
      isUnbRelatedLabel(contract.costCenter?.name) ||
      isUnbRelatedLabel(contract.costCenter?.code)
    );
  }, [contract]);

  const divSeSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        enrichDivSeOptionsWithPleitos([], allPleitos).map((opt) => ({
          value: opt.divSe,
          label: formatOsSePasta(opt.divSe, opt.folderNumber),
        }))
      ),
    [allPleitos]
  );

  const billablePleitos = useMemo(
    () =>
      allPleitos.filter((p) => {
        const markerOk = isPleitoHistorico(p) || (p.billingRequest != null && Number(p.billingRequest) > 0);
        if (!markerOk) return false;
        return getPleitoRemainingBalance(p as never, billings as never) > 0.01;
      }),
    [allPleitos, billings]
  );

  const pleitosForBillingForm = useMemo(() => {
    const os = billingForm.serviceOrder.trim();
    if (!os) return billablePleitos;
    return billablePleitos.filter((p) => (p.divSe || '').trim() === os);
  }, [billablePleitos, billingForm.serviceOrder]);

  const pleitosForBillingSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        pleitosForBillingForm.map((p) => ({
          value: p.id,
          label: formatPleitoBillingOptionLabel(p, billings),
        }))
      ),
    [pleitosForBillingForm, billings]
  );

  const selectedBillingPleito = useMemo(
    () =>
      billablePleitos.find((p) => p.id === billingForm.pleitoId) ??
      allPleitos.find((p) => p.id === billingForm.pleitoId) ??
      null,
    [billablePleitos, allPleitos, billingForm.pleitoId]
  );
  const selectedBillingPleitoSaldo = selectedBillingPleito
    ? getPleitoRemainingBalance(selectedBillingPleito as never, billings as never)
    : null;

  const createProductionMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post(`/contracts/${contractId}/weekly-productions`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-weekly-productions', contractId] });
      setShowProduction(false);
      toast.success('Produção semanal cadastrada com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar produção');
    },
  });

  const createBillingMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      (await api.post(`/contracts/${contractId}/billings`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
      closeBilling();
      toast.success('Faturamento cadastrado com sucesso!');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Erro ao cadastrar faturamento');
    },
  });

  const openProduction = () => {
    setProductionForm({
      fillingDate: toInputDate(),
      divSe: '',
      weeklyProductionValue: '',
      responsiblePerson: defaultResponsible,
    });
    setShowProduction(true);
  };

  const submitProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const value = parseCurrencyInput(productionForm.weeklyProductionValue);
    const responsiblePerson = productionForm.responsiblePerson.trim() || defaultResponsible;
    if (!responsiblePerson) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (value < 0) {
      toast.error('Valor da produção semanal inválido');
      return;
    }
    createProductionMutation.mutate({
      fillingDate: productionForm.fillingDate || toInputDate(),
      divSe: productionForm.divSe.trim(),
      weeklyProductionValue: value,
      responsiblePerson,
    });
  };

  const submitBilling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      toast.error('Você não tem permissão para criar no módulo Contratos.');
      return;
    }
    const gross = parseCurrencyInput(billingForm.grossValue);
    const net = parseCurrencyInput(billingForm.netValue);
    if (!billingForm.issueDate || !billingForm.invoiceNumber.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (gross === 0) {
      toast.error('Valor bruto é obrigatório');
      return;
    }
    if (net === 0) {
      toast.error('Valor líquido é obrigatório');
      return;
    }
    if (selectedBillingPleitoSaldo != null && gross > selectedBillingPleitoSaldo + 0.01) {
      toast.error(`Valor bruto excede o saldo do pleito (${formatCurrency(selectedBillingPleitoSaldo)})`);
      return;
    }
    createBillingMutation.mutate({
      issueDate: billingForm.issueDate,
      invoiceNumber: billingForm.invoiceNumber.trim(),
      serviceOrder: billingForm.serviceOrder.trim(),
      pleitoId: billingForm.pleitoId.trim(),
      grossValue: gross,
      netValue: net,
    });
  };

  if (!canAccessProducao && !canAccessOs && !showBilling) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canAccessProducao ? (
          <button
            type="button"
            onClick={openProduction}
            disabled={!canCreate}
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Nova Produção Semanal
          </button>
        ) : null}
        {canAccessOs ? (
          <button
            type="button"
            onClick={() => setShowOsModal(true)}
            disabled={!canCreate}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Nova Ordem de Serviço
          </button>
        ) : null}
        {showBilling ? (
          <button
            type="button"
            onClick={() => setShowBillingModal(true)}
            disabled={!canCreate}
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-800/60 dark:bg-green-950/30 dark:text-green-300 dark:hover:bg-green-900/40"
          >
            <Plus className="h-4 w-4 shrink-0" />
            Novo Faturamento
          </button>
        ) : null}
      </div>

      {showProduction ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="absolute inset-0" onClick={requestCloseProduction} />
          <div className="relative mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <BarChart3 className="h-5 w-5" />
                Cadastrar Produção Semanal
              </h3>
              <button
                type="button"
                onClick={requestCloseProduction}
                className="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitProduction} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Data
                </label>
                <DatePickerField
                  value={productionForm.fillingDate || toInputDate()}
                  onChange={(fillingDate) => setProductionForm({ ...productionForm, fillingDate })}
                  placeholder="dd/mm/aaaa"
                  aria-label="Data do preenchimento"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Data do preenchimento. Semana:{' '}
                  {formatProductionWeekDate(productionForm.fillingDate || toInputDate())}.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  OS / SE
                </label>
                <StringSingleSelectDropdown
                  value={productionForm.divSe}
                  onChange={(divSe) => setProductionForm({ ...productionForm, divSe })}
                  options={divSeSelectOptions}
                  allowEmpty
                  emptyOptionLabel="Nenhuma"
                  placeholder="Selecionar OS / SE"
                  searchPlaceholder="Pesquisar OS / SE..."
                  emptyOptionsMessage="Nenhuma OS cadastrada neste contrato."
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor da Produção Semanal *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-500">
                    R$
                  </span>
                  <input
                    type="text"
                    value={productionForm.weeklyProductionValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      const formatted = v
                        ? (Number(v) / 100).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '';
                      setProductionForm({ ...productionForm, weeklyProductionValue: formatted });
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={requestCloseProduction}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createProductionMutation.isPending}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {createProductionMutation.isPending ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </AppModalOverlay>
      ) : null}
      {productionConfirmUi}

      {showBillingModal ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="absolute inset-0" onClick={requestCloseBilling} />
          <div className="relative mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <Receipt className="h-5 w-5" />
                Cadastrar Faturamento
              </h3>
              <button
                type="button"
                onClick={requestCloseBilling}
                className="rounded p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitBilling} className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Data de Emissão *
                </label>
                <DatePickerField
                  value={billingForm.issueDate}
                  onChange={(issueDate) => setBillingForm({ ...billingForm, issueDate })}
                  placeholder="dd/mm/aaaa"
                  aria-label="Data de emissão"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Número da Nota Fiscal *
                </label>
                <input
                  type="text"
                  required
                  value={billingForm.invoiceNumber}
                  onChange={(e) => setBillingForm({ ...billingForm, invoiceNumber: e.target.value })}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Ex: 000123"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  OS / SE
                </label>
                <StringSingleSelectDropdown
                  value={billingForm.serviceOrder}
                  onChange={(serviceOrder) => {
                    setBillingForm((prev) => {
                      const osTrimmed = serviceOrder.trim();
                      const pleito = allPleitos.find((p) => p.id === prev.pleitoId);
                      const pleitoStillValid =
                        !!pleito && (!osTrimmed || (pleito.divSe || '').trim() === osTrimmed);
                      return {
                        ...prev,
                        serviceOrder,
                        pleitoId: pleitoStillValid ? prev.pleitoId : '',
                      };
                    });
                  }}
                  options={divSeSelectOptions}
                  allowEmpty
                  placeholder="Selecionar OS / SE"
                  searchPlaceholder="Pesquisar OS / SE..."
                  emptyOptionsMessage="Nenhuma OS cadastrada neste contrato."
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pleito vinculado
                </label>
                <StringSingleSelectDropdown
                  value={billingForm.pleitoId}
                  onChange={(pleitoId) => {
                    const pleito = pleitosForBillingForm.find((p) => p.id === pleitoId);
                    setBillingForm((prev) => ({
                      ...prev,
                      pleitoId,
                      serviceOrder: pleito?.divSe?.trim() || prev.serviceOrder,
                    }));
                  }}
                  options={pleitosForBillingSelectOptions}
                  allowEmpty
                  placeholder="Selecionar pleito"
                  searchPlaceholder="Pesquisar pleito..."
                  emptyOptionsMessage="Nenhum pleito apto para faturamento."
                  className="w-full"
                />
                {selectedBillingPleitoSaldo != null && billingForm.pleitoId ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Saldo disponível do pleito: {formatCurrency(selectedBillingPleitoSaldo)}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor Bruto *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-500">
                    R$
                  </span>
                  <input
                    type="text"
                    required
                    value={billingForm.grossValue}
                    onChange={(e) => {
                      const formatted = formatBillingCurrencyFromDigits(
                        e.target.value.replace(/\D/g, '')
                      );
                      setBillingForm({
                        ...billingForm,
                        grossValue: formatted,
                        ...(usesUnbBillingNetFactor
                          ? { netValue: calcBillingNetFromGrossFormatted(formatted) }
                          : {}),
                      });
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor Líquido *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-500">
                    R$
                  </span>
                  <input
                    type="text"
                    required
                    value={billingForm.netValue}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      const formatted = v
                        ? (Number(v) / 100).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '';
                      setBillingForm({ ...billingForm, netValue: formatted });
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={requestCloseBilling}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createBillingMutation.isPending}
                  className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {createBillingMutation.isPending ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </AppModalOverlay>
      ) : null}
      {billingConfirmUi}

      {showOsModal ? (
        <PleitoFormModal
          contractId={contractId}
          onClose={() => setShowOsModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
          }}
        />
      ) : null}
    </>
  );
}
