'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import { getOcSupplierLabel } from '@/components/oc/OcPurchaseOrderFormFields';
import { searchOcSuppliers } from '@/components/oc/searchOcSuppliers';
import { SupplierOptionLines } from '@/components/oc/SupplierOptionLines';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  TOOL_RENTAL_DEMAND_OPTIONS,
  TOOL_RENTAL_PRIORITY_OPTIONS,
  type ToolRentalDemandType,
  type ToolRentalPriority,
} from '@/lib/toolRentalLabels';

type ReceiptAnexo = { id: string; name: string; url: string };
type ContractOption = { id: string; name: string; number?: string };
type ObraOption = { id: string; name: string };


// Mesmo padrão das outras telas de solicitação (combustível, reserva de veículos).
const labelCls = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400';
const requiredMark = <span className="text-red-600"> *</span>;
const fieldCls = FORM_FIELD_INPUT_CLS;

type FormEquipamentoRow = { nome: string; quantidade: string; linkSugestao: string };

type FormState = {
  contractId: string;
  obraId: string;
  titulo: string;
  supplierId: string;
  priority: ToolRentalPriority;
  demandType: ToolRentalDemandType;
  equipamentos: FormEquipamentoRow[];
  periodoInicio: string;
  periodoFim: string;
  fdAttachments: ReceiptAnexo[];
};

const EMPTY_EQUIPAMENTO_ROW = (): FormEquipamentoRow => ({
  nome: '',
  quantidade: '1',
  linkSugestao: '',
});

const EMPTY_FORM = (): FormState => ({
  contractId: '',
  obraId: '',
  titulo: '',
  supplierId: '',
  priority: 'NORMAL',
  demandType: 'NOVA_LOCACAO',
  equipamentos: [EMPTY_EQUIPAMENTO_ROW()],
  periodoInicio: '',
  periodoFim: '',
  fdAttachments: [],
});

/** Formulário de nova solicitação de ferramentas, usado nas telas de Engenharia e de Suprimentos. */
export function NovaSolicitacaoFerramentaModal({
  isOpen,
  onClose,
  initialContractId = '',
}: {
  isOpen: boolean;
  onClose: () => void;
  initialContractId?: string;
}) {
  const queryClient = useQueryClient();
  const { allowedContractIds, isAdministrator } = usePermissions();
  const allowedContractIdSet = useMemo(() => new Set(allowedContractIds), [allowedContractIds]);
  const showForm = isOpen;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [supplierLabel, setSupplierLabel] = useState('');
  const [uploadingFd, setUploadingFd] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm({ ...EMPTY_FORM(), contractId: initialContractId });
    setSupplierLabel('');
  }, [isOpen, initialContractId]);

  const { data: contractsRes, isLoading: loadingContracts } = useQuery({
    queryKey: ['contracts-for-tool-rental', allowedContractIds.join(',')],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: showForm,
  });

  const contracts = useMemo(() => {
    const rows = (contractsRes?.data ?? []) as ContractOption[];
    if (isAdministrator) return rows;
    // Só contratos liberados para a pessoa
    return rows.filter((c) => allowedContractIdSet.has(c.id));
  }, [contractsRes?.data, isAdministrator, allowedContractIdSet]);

  const { data: obras = [], isLoading: loadingObras } = useQuery({
    queryKey: ['tool-rental-obras', form.contractId],
    enabled: showForm && Boolean(form.contractId),
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: { isActive: 'true', contratoId: form.contractId, limit: 500, page: 1 },
      });
      return ((res.data?.data || []) as ObraOption[]).filter((o) => o.id && o.name?.trim());
    },
  });

  const contractOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contracts.map((c) => ({
          value: c.id,
          label: c.name,
          searchText: [c.name, c.number].filter(Boolean).join(' '),
        })),
      ),
    [contracts],
  );

  const obraOptions = useMemo(
    () => labeledToSelectOptions(obras.map((o) => ({ value: o.id, label: o.name }))),
    [obras],
  );

  const createMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const contract = contracts.find((c) => c.id === payload.contractId);
      const obra = obras.find((o) => o.id === payload.obraId);
      if (!contract) throw new Error('Contrato inválido');
      if (!obra) throw new Error('Obra inválida');
      const equipamentos = payload.equipamentos
        .map((row) => ({
          nome: row.nome.trim(),
          quantidade: Number(String(row.quantidade).replace(',', '.')),
          linkSugestao: row.linkSugestao.trim() || null,
        }))
        .filter((row) => row.nome && Number.isFinite(row.quantidade) && row.quantidade > 0)
        .map((row) => ({
          nome: row.nome,
          quantidade: Math.floor(row.quantidade),
          ...(row.linkSugestao ? { linkSugestao: row.linkSugestao } : {}),
        }));
      if (equipamentos.length === 0) throw new Error('Informe ao menos um equipamento');
      await api.post('/tool-rental-requests', {
        contractId: contract.id,
        contrato: contract.name,
        obra: obra.name,
        titulo: payload.titulo,
        supplierId: payload.supplierId || null,
        priority: payload.priority,
        demandType: payload.demandType,
        equipamentos,
        periodoInicio: payload.periodoInicio,
        periodoFim: payload.periodoFim,
        ...(payload.demandType === 'NOVA_LOCACAO'
          ? {
              fdAttachments: payload.fdAttachments.map((anexo) => ({
                id: anexo.id,
                name: anexo.name,
                url: anexo.url,
              })),
            }
          : {}),
      });
    },
    onSuccess: () => {
      toast.success('Solicitação aberta — após a SC, o Suprimentos dá continuidade');
      onClose();
      setForm(EMPTY_FORM());
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests-supplies'] });
      queryClient.invalidateQueries({ queryKey: ['tool-rental-supplies-summary'] });
      // Atualiza na hora a bolinha de pendências do menu «Pedidos de Ferramentas» (Suprimentos).
      queryClient.invalidateQueries({ queryKey: ['tool-rental-supplies-pending-count'] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Não foi possível criar a solicitação',
      );
    },
  });

  const uploadFdFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploadingFd(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/tool-rental-requests/upload-fd-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data?.data;
      if (!data?.url) throw new Error('Falha no upload');
      setForm((f) => ({
        ...f,
        fdAttachments: [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: data.originalName || file.name,
            url: data.url,
          },
        ],
      }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Falha ao anexar a FD');
    } finally {
      setUploadingFd(false);
    }
  };

  const submitForm = () => {
    if (!form.contractId) return toast.error('Informe o contrato');
    if (!form.obraId) return toast.error('Informe a obra');
    if (!form.titulo.trim()) return toast.error('Informe o título');
    if (!form.priority) return toast.error('Informe a prioridade');
    if (!form.demandType) return toast.error('Informe o tipo de demanda');
    const hasValidEquipamento = form.equipamentos.some((row) => {
      const qtd = Number(String(row.quantidade).replace(',', '.'));
      return row.nome.trim() && Number.isFinite(qtd) && qtd > 0;
    });
    if (!hasValidEquipamento) {
      return toast.error('Informe ao menos um equipamento com quantidade');
    }
    if (!form.periodoInicio) return toast.error('Informe a data de início');
    if (!form.periodoFim) return toast.error('Informe a data de fim');
    if (form.demandType === 'NOVA_LOCACAO' && form.fdAttachments.length === 0) {
      return toast.error('Anexe a FD na primeira locação');
    }
    createMutation.mutate(form);
  };

  return (
      <Modal
        isOpen={showForm}
        onClose={() => !createMutation.isPending && onClose()}
        title="Pedidos de Ferramentas"
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Título{requiredMark}</label>
            <input
              className={fieldCls}
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder={
                form.demandType === 'COMPRA'
                  ? 'Ex.: Compra de furadeira industrial'
                  : 'Ex.: Locação de andaime tubular'
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Tipo de demanda{requiredMark}</label>
              <StringSingleSelectDropdown
                value={form.demandType}
                onChange={(demandType) =>
                  setForm((f) => ({ ...f, demandType: demandType as ToolRentalDemandType }))
                }
                options={TOOL_RENTAL_DEMAND_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                  searchText: opt.label,
                }))}
                allowEmpty={false}
              />
            </div>
            <div>
              <label className={labelCls}>Prioridade{requiredMark}</label>
              <StringSingleSelectDropdown
                value={form.priority}
                onChange={(priority) =>
                  setForm((f) => ({ ...f, priority: priority as ToolRentalPriority }))
                }
                options={TOOL_RENTAL_PRIORITY_OPTIONS}
                allowEmpty={false}
              />
            </div>
          </div>

          <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
              <h4 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                Equipamentos ({form.equipamentos.length}){requiredMark}
              </h4>
            </div>
            <div className="space-y-6">
              {form.equipamentos.map((row, index) => (
                <div
                  key={`equipamento-${index}`}
                  className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-700"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Equipamento {index + 1}
                    </span>
                    {form.equipamentos.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            equipamentos: f.equipamentos.filter((_, i) => i !== index),
                          }))
                        }
                        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        aria-label={`Remover equipamento ${index + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                          Equipamento *
                        </label>
                        <input
                          className={fieldCls}
                          value={row.nome}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              equipamentos: f.equipamentos.map((item, i) =>
                                i === index ? { ...item, nome: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Descreva o equipamento"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                          Qtd *
                        </label>
                        <input
                          className={`${fieldCls} [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          value={row.quantidade}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              equipamentos: f.equipamentos.map((item, i) =>
                                i === index ? { ...item, quantidade: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="1"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                        Link de sugestão
                      </label>
                      <input
                        className={fieldCls}
                        value={row.linkSugestao}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            equipamentos: f.equipamentos.map((item, i) =>
                              i === index ? { ...item, linkSugestao: e.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="http://"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    equipamentos: [...f.equipamentos, EMPTY_EQUIPAMENTO_ROW()],
                  }))
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-red-300 bg-red-50/50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/25 dark:text-red-300 dark:hover:border-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-200"
              >
                <Plus className="h-4 w-4" />
                Adicionar equipamento
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>
                {form.demandType === 'COMPRA' ? 'Necessário a partir de' : 'Data de início'}
                {requiredMark}
              </label>
              <DatePickerField
                value={form.periodoInicio}
                onChange={(periodoInicio) => setForm((f) => ({ ...f, periodoInicio }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
              />
            </div>
            <div>
              <label className={labelCls}>
                {form.demandType === 'COMPRA' ? 'Necessário até' : 'Data de fim'}
                {requiredMark}
              </label>
              <DatePickerField
                value={form.periodoFim}
                onChange={(periodoFim) => setForm((f) => ({ ...f, periodoFim }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Contrato{requiredMark}</label>
              <SingleSelectSearchDropdown
                value={form.contractId}
                onChange={(contractId) =>
                  setForm((f) => ({ ...f, contractId, obraId: '' }))
                }
                options={contractOptions}
                disabled={loadingContracts}
                placeholder={loadingContracts ? 'Carregando…' : 'Selecionar contrato…'}
                searchPlaceholder="Pesquisar contrato…"
                emptyOptionsMessage="Nenhum contrato liberado para você."
                noFocusRing
              />
            </div>
            <div>
              <label className={labelCls}>Obra{requiredMark}</label>
              <SingleSelectSearchDropdown
                value={form.obraId}
                onChange={(obraId) => setForm((f) => ({ ...f, obraId }))}
                options={obraOptions}
                disabled={!form.contractId || loadingObras}
                placeholder={
                  !form.contractId
                    ? 'Selecione o contrato primeiro…'
                    : loadingObras
                      ? 'Carregando…'
                      : 'Selecionar obra…'
                }
                searchPlaceholder="Pesquisar obra…"
                emptyOptionsMessage="Nenhuma obra neste contrato."
                noFocusRing
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Fornecedor</label>
            <AsyncSearchSelectDropdown
              value={form.supplierId}
              selectedLabel={supplierLabel || undefined}
              onChange={(supplier) => {
                setForm((f) => ({ ...f, supplierId: supplier.id }));
                setSupplierLabel(
                  supplier.tradeName?.trim() || supplier.name?.trim() || getOcSupplierLabel(supplier),
                );
              }}
              searchFn={searchOcSuppliers}
              getOptionId={(supplier) => supplier.id}
              getOptionLabel={(supplier) =>
                supplier.tradeName?.trim() || supplier.name?.trim() || getOcSupplierLabel(supplier)
              }
              renderOption={(supplier) => <SupplierOptionLines supplier={supplier} />}
              queryKeyPrefix="tool-rental-supplier"
              placeholder="Digite para buscar fornecedor…"
              searchPlaceholder="Nome, fantasia ou CNPJ…"
              minSearchLength={0}
              noFocusRing
            />
          </div>

          {form.demandType === 'NOVA_LOCACAO' ? (
            <div>
              <label className={labelCls}>FD - anexo{requiredMark}</label>
              {form.fdAttachments.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {form.fdAttachments.map((anexo) => (
                    <FilePreviewCard
                      key={anexo.id}
                      file={{
                        originalName: anexo.name || 'Arquivo',
                        fileUrl: anexo.url,
                      }}
                      extra="FD"
                      onRemove={() =>
                        setForm((f) => ({
                          ...f,
                          fdAttachments: f.fdAttachments.filter((item) => item.id !== anexo.id),
                        }))
                      }
                    />
                  ))}
                </div>
              ) : null}
              {/* A FD é um arquivo só: com ele anexado, o campo de envio some (remover o arquivo traz o campo de volta). */}
              {form.fdAttachments.length === 0 ? (
                <FileDropZone
                  label="Adicionar FD"
                  hint="Obrigatório na primeira locação. Clique ou arraste imagem/PDF"
                  uploading={uploadingFd}
                  disabled={createMutation.isPending}
                  onFiles={(files) => {
                    void uploadFdFile(files);
                  }}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => onClose()}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={submitForm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
  );
}
