'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Minus, Paperclip, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { LARGE_FILE_UPLOAD_TIMEOUT_MS } from '@/lib/api';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  adjustCurrency,
  currencyDigitsToFormatted,
  anexosDemais,
  emptyFichaDemandaForm,
  findAnexoByKind,
  recordToForm,
  upsertAnexoObrigatorio,
  validateFichaDemandaForm,
  type FdAnexo,
  type FdAnexoKind,
  type FichaDemandaApprovalFormState,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

interface ContractOption {
  id: string;
  name: string;
}

interface ObraOption {
  id: string;
  name: string;
  contratoId: string;
}

const fieldClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
      {children}
      {required ? <span className="text-red-500"> *</span> : null}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
      {children}
    </h4>
  );
}

function CurrencyStepperInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
          R$
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(currencyDigitsToFormatted(e.target.value))}
          placeholder="0,00"
          autoComplete="off"
          className="w-full bg-transparent py-2 pl-9 pr-3 text-right text-sm tabular-nums text-gray-900 focus:outline-none dark:text-gray-100"
        />
      </div>
      <div className="flex border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          onClick={() => onChange(adjustCurrency(value, -100))}
          className="px-3 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Diminuir valor"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange(adjustCurrency(value, 100))}
          className="border-l border-gray-300 px-3 text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          aria-label="Aumentar valor"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SubSection({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <SectionTitle>{title}</SectionTitle>
      {children}
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 dark:border-gray-600 dark:text-red-400 dark:hover:border-red-800/60 dark:hover:bg-red-950/20"
      >
        <Plus className="h-4 w-4 shrink-0" />
        {addLabel}
      </button>
    </div>
  );
}

function AnexoObrigatorioSlot({
  label,
  anexo,
  disabled,
  onAdd,
  onRemove,
}: {
  label: string;
  anexo?: FdAnexo;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <FieldLabel required>{label}</FieldLabel>
      {anexo ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900/40">
          <span className="flex min-w-0 items-center gap-2 truncate text-gray-800 dark:text-gray-200">
            <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
            {anexo.name}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={onAdd}
              className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Trocar
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30"
              aria-label={`Remover ${label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-2.5 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50 dark:border-gray-600 dark:text-red-400 dark:hover:border-red-800/60 dark:hover:bg-red-950/20"
        >
          <Plus className="h-4 w-4 shrink-0" />
          Adicionar {label.toLowerCase()}
        </button>
      )}
    </div>
  );
}

export type FichaDemandaApprovalFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  editingRecord?: FichaDemandaApprovalRecord | null;
  /** Prefill ao criar (ex.: envio a partir do orçamento). Ignorado se `editingRecord` estiver setado. */
  initialForm?: Partial<FichaDemandaApprovalFormState> | null;
  onSave: (form: FichaDemandaApprovalFormState) => void;
  isSaving?: boolean;
  title?: string;
};

export function FichaDemandaApprovalFormModal({
  isOpen,
  onClose,
  editingRecord = null,
  initialForm = null,
  onSave,
  isSaving = false,
  title,
}: FichaDemandaApprovalFormModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FichaDemandaApprovalFormState>(() => emptyFichaDemandaForm());
  const [showCreateObra, setShowCreateObra] = useState(false);
  const [novaObraNome, setNovaObraNome] = useState('');
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const anexoKindRef = useRef<FdAnexoKind>('outro');

  const closeForm = useCallback(() => {
    onClose();
  }, [onClose]);

  const formHasData = Boolean(
    form.numMovRm.trim() ||
      form.idMovRm.trim() ||
      form.codigoPedido.trim() ||
      form.contratoId.trim() ||
      form.obra.trim() ||
      form.codFichaDemanda.trim() ||
      form.faturamentoEstimado.trim() ||
      form.custoEstimado.trim() ||
      form.observacao.trim() ||
      form.polo ||
      form.anexos.length > 0
  );

  const { requestClose, confirmUi } = useModalCloseConfirm(closeForm, {
    isParentOpen: isOpen,
    enabled: formHasData,
    className: '!z-[2200]',
  });

  useEffect(() => {
    if (!isOpen) return;
    if (editingRecord) {
      setForm(recordToForm(editingRecord));
    } else if (initialForm) {
      setForm({
        ...emptyFichaDemandaForm(),
        ...initialForm,
        anexos: initialForm.anexos ? [...initialForm.anexos] : [],
      });
    } else {
      setForm(emptyFichaDemandaForm());
    }
    setShowCreateObra(false);
    setNovaObraNome('');
  }, [isOpen, editingRecord, initialForm]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) requestClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, isSaving, requestClose]);

  const { data: contractsData } = useQuery({
    queryKey: ['fd-approval-contrato-options'],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals/options/contratos');
      return res.data;
    },
    enabled: isOpen,
  });

  const { data: obrasData, isLoading: loadingObras } = useQuery({
    queryKey: ['obras-fd-approval', form.contratoId],
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: {
          isActive: 'true',
          contratoId: form.contratoId,
          limit: 500,
          page: 1,
        },
      });
      return res.data;
    },
    enabled: isOpen && !!form.contratoId,
  });

  const contracts = useMemo(() => {
    return ((contractsData?.data || []) as ContractOption[]).filter((c) => c.id);
  }, [contractsData]);

  const obras = useMemo(() => {
    return ((obrasData?.data || []) as ObraOption[]).filter((o) => o.id && o.name?.trim());
  }, [obrasData]);

  const contratoSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        contracts.map((c) => ({
          value: c.id,
          label: c.name,
        }))
      ),
    [contracts]
  );

  const obraSelectOptions = useMemo(
    () => labeledToSelectOptions(obras.map((obra) => ({ value: obra.name, label: obra.name }))),
    [obras]
  );

  const obraPlaceholder = !form.contratoId
    ? 'Selecione um contrato primeiro'
    : loadingObras
      ? 'Carregando obras...'
      : 'Selecione a obra';

  const createObraMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/obras', {
        name,
        contratoId: form.contratoId,
      });
      return res.data?.data as ObraOption | undefined;
    },
    onSuccess: async (created) => {
      const nome = created?.name?.trim() || novaObraNome.trim();
      toast.success('Obra criada');
      setShowCreateObra(false);
      setNovaObraNome('');
      await queryClient.invalidateQueries({ queryKey: ['obras-fd-approval', form.contratoId] });
      if (nome) setForm((prev) => ({ ...prev, obra: nome }));
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível criar a obra.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateFichaDemandaForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    onSave(form);
  };

  const handleAnexoFile = async (file: File | null, kind: FdAnexoKind = anexoKindRef.current) => {
    if (!file || uploadingAnexo || isSaving) return;
    setUploadingAnexo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/demand-sheet-approvals/upload-attachment', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: LARGE_FILE_UPLOAD_TIMEOUT_MS,
      });
      const uploaded = res.data?.data as { url?: string; originalName?: string } | undefined;
      const url = String(uploaded?.url || '').trim();
      if (!url) throw new Error('Upload sem URL');
      const next: FdAnexo = {
        id: crypto.randomUUID(),
        name: uploaded?.originalName || file.name,
        url,
        kind,
      };
      setForm((prev) => ({
        ...prev,
        anexos:
          kind === 'orcamento' || kind === 'fd'
            ? upsertAnexoObrigatorio(prev.anexos, kind, next)
            : [...prev.anexos, { ...next, kind: 'outro' }],
      }));
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível enviar o anexo.');
    } finally {
      setUploadingAnexo(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={isSaving ? undefined : requestClose} />
      <div className="relative z-[1101] flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title ||
              (editingRecord ? 'Editar Ficha de Demanda' : 'Nova Ficha de Demanda')}
          </h3>
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          id="ficha-demanda-approval-form"
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
          autoComplete="off"
        >
          <div className="space-y-6">
            <div className="space-y-4">
              <SectionTitle>Dados do Movimento</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel required>Número de Movimento da RM</FieldLabel>
                  <input
                    type="text"
                    value={form.numMovRm}
                    onChange={(e) => setForm({ ...form, numMovRm: e.target.value })}
                    placeholder="Ex.: 123456"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <FieldLabel required>ID de Movimento da RM</FieldLabel>
                  <input
                    type="text"
                    value={form.idMovRm}
                    onChange={(e) => setForm({ ...form, idMovRm: e.target.value })}
                    placeholder="Ex.: 89660"
                    className={fieldClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel required>Código do Pedido</FieldLabel>
                  <input
                    type="text"
                    value={form.codigoPedido}
                    onChange={(e) => setForm({ ...form, codigoPedido: e.target.value })}
                    placeholder="Ex.: PED-001"
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>Vínculos</SectionTitle>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <FieldLabel required>Contrato</FieldLabel>
                  <StringSingleSelectDropdown
                    value={form.contratoId}
                    onChange={(v) => {
                      setShowCreateObra(false);
                      setNovaObraNome('');
                      setForm({ ...form, contratoId: v, obra: '' });
                    }}
                    options={contratoSelectOptions}
                    placeholder="Selecione o contrato"
                    emptyOptionLabel="Selecione o contrato"
                    matchTriggerWidth
                  />
                </div>
                <div>
                  <FieldLabel required>Obra</FieldLabel>
                  <StringSingleSelectDropdown
                    value={form.obra}
                    onChange={(v) => setForm({ ...form, obra: v })}
                    options={obraSelectOptions}
                    disabled={!form.contratoId || loadingObras}
                    placeholder={obraPlaceholder}
                    allowEmpty={false}
                    matchTriggerWidth
                    menuFooter={
                      form.contratoId ? (
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setNovaObraNome('');
                            setShowCreateObra(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          Criar nova obra neste contrato
                        </button>
                      ) : null
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>Valores e Identificação</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FieldLabel required>Código da Ficha de Demanda</FieldLabel>
                  <input
                    type="text"
                    value={form.codFichaDemanda}
                    onChange={(e) => setForm({ ...form, codFichaDemanda: e.target.value })}
                    placeholder="Ex.: FD-001"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <FieldLabel required>Faturamento Estimado</FieldLabel>
                  <CurrencyStepperInput
                    value={form.faturamentoEstimado}
                    onChange={(faturamentoEstimado) => setForm({ ...form, faturamentoEstimado })}
                  />
                </div>
                <div>
                  <FieldLabel required>Custo Estimado</FieldLabel>
                  <CurrencyStepperInput
                    value={form.custoEstimado}
                    onChange={(custoEstimado) => setForm({ ...form, custoEstimado })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <SectionTitle>Informações Adicionais</SectionTitle>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <FieldLabel required>Observação</FieldLabel>
                  <textarea
                    rows={3}
                    value={form.observacao}
                    onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                    className={fieldClass}
                    placeholder="Descreva observações relevantes"
                  />
                </div>
                <div>
                  <FieldLabel required>Polo</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {(['DF', 'GO'] as const).map((polo) => {
                      const selected = form.polo === polo;
                      return (
                        <button
                          key={polo}
                          type="button"
                          onClick={() => setForm({ ...form, polo })}
                          className={`rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                            selected
                              ? 'border-red-600 bg-red-600 text-white'
                              : 'border-gray-300 bg-white text-gray-900 hover:border-red-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
                          }`}
                        >
                          {polo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <SectionTitle>Anexos obrigatórios</SectionTitle>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                disabled={uploadingAnexo || isSaving}
                onChange={(e) => {
                  void handleAnexoFile(e.target.files?.[0] ?? null, anexoKindRef.current);
                  e.target.value = '';
                }}
              />
              {uploadingAnexo ? (
                <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando anexo...
                </p>
              ) : null}
              <AnexoObrigatorioSlot
                label="Orçamento"
                anexo={findAnexoByKind(form.anexos, 'orcamento')}
                disabled={uploadingAnexo || isSaving}
                onAdd={() => {
                  anexoKindRef.current = 'orcamento';
                  fileInputRef.current?.click();
                }}
                onRemove={() =>
                  setForm((prev) => ({
                    ...prev,
                    anexos: upsertAnexoObrigatorio(prev.anexos, 'orcamento', null),
                  }))
                }
              />
              <AnexoObrigatorioSlot
                label="Ficha de demanda"
                anexo={findAnexoByKind(form.anexos, 'fd')}
                disabled={uploadingAnexo || isSaving}
                onAdd={() => {
                  anexoKindRef.current = 'fd';
                  fileInputRef.current?.click();
                }}
                onRemove={() =>
                  setForm((prev) => ({
                    ...prev,
                    anexos: upsertAnexoObrigatorio(prev.anexos, 'fd', null),
                  }))
                }
              />
            </div>

            <SubSection
              title="Demais anexos"
              addLabel={uploadingAnexo ? 'Enviando anexo...' : 'Adicionar anexo'}
              onAdd={() => {
                if (uploadingAnexo || isSaving) return;
                anexoKindRef.current = 'outro';
                fileInputRef.current?.click();
              }}
            >
              {anexosDemais(form.anexos).length > 0 ? (
                <ul className="space-y-2">
                  {anexosDemais(form.anexos).map((anexo) => (
                    <li
                      key={anexo.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900/40"
                    >
                      <span className="flex min-w-0 items-center gap-2 truncate text-gray-800 dark:text-gray-200">
                        <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                        {anexo.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            anexos: prev.anexos.filter((a) => a.id !== anexo.id),
                          }))
                        }
                        className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        aria-label="Remover anexo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SubSection>
          </div>

          <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={requestClose}
              disabled={isSaving}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || uploadingAnexo}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : editingRecord ? (
                'Salvar alterações'
              ) : (
                'Salvar ficha'
              )}
            </button>
          </div>
        </form>
      </div>
    </AppModalOverlay>
  );

  return createPortal(
    <>
      {modalContent}
      {confirmUi}
      {showCreateObra ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden
            onClick={() => {
              if (createObraMutation.isPending) return;
              setShowCreateObra(false);
            }}
          />
          <div className="relative z-[2201] w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Nova obra
            </h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              A obra será vinculada ao contrato selecionado na ficha.
            </p>
            <div className="mt-4">
              <FieldLabel required>Nome da obra</FieldLabel>
              <input
                type="text"
                value={novaObraNome}
                onChange={(e) => setNovaObraNome(e.target.value.toLocaleUpperCase('pt-BR'))}
                placeholder="EX.: UNIDADE CENTRO"
                className={`${fieldClass} uppercase`}
                autoFocus
                disabled={createObraMutation.isPending}
                autoCapitalize="characters"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const name = novaObraNome.trim().toLocaleUpperCase('pt-BR');
                    if (name && !createObraMutation.isPending) {
                      createObraMutation.mutate(name);
                    }
                  }
                }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={createObraMutation.isPending}
                onClick={() => setShowCreateObra(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={createObraMutation.isPending || !novaObraNome.trim()}
                onClick={() => {
                  const name = novaObraNome.trim().toLocaleUpperCase('pt-BR');
                  if (!name) return;
                  createObraMutation.mutate(name);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {createObraMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Criar obra'
                )}
              </button>
            </div>
          </div>
        </AppModalOverlay>
      ) : null}
    </>,
    document.body
  );
}
