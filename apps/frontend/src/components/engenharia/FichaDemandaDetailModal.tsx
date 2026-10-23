'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Pencil, Plus } from 'lucide-react';
import { FileDropZone } from '@/components/ui/FileDropZone';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FichaDemandaApprovalFormModal } from '@/components/engenharia/FichaDemandaApprovalFormModal';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { usePermissions } from '@/hooks/usePermissions';
import { detectOcIdFromFile } from '@/lib/extractOcId';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import api, { LARGE_FILE_UPLOAD_TIMEOUT_MS } from '@/lib/api';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import {
  anexosDemais,
  anexosOrdemCompra,
  fdAnexoKindLabel,
  findAnexoByKind,
  FD_STATUS_LABELS,
  formatCurrencyDisplay,
  formToApiPayload,
  type FichaDemandaApprovalFormState,
  inferFdAnexoKind,
  purchaseStatusLabel,
  type FdAnexo,
  type FichaDemandaApprovalRecord,
} from '@/lib/fichaDemandaApproval';

type Props = {
  isOpen: boolean;
  record: FichaDemandaApprovalRecord | null;
  onClose: () => void;
  /** Atualiza o registro na tela pai após vincular anexo. */
  onRecordUpdated?: (record: FichaDemandaApprovalRecord) => void;
  /** Permite upload em anexos pendentes (padrão: true). */
  allowPendingUpload?: boolean;
  /** Suprimentos: permite anexar ordens de compra na ficha aprovada. */
  allowAddOrdemCompra?: boolean;
  /** Rodapé extra (ex.: aprovar/rejeitar). Substitui o botão Fechar padrão. */
  footer?: React.ReactNode;
};

/** Botão vermelho "+ Adicionar ..." (mesmo do Adicionar OC) que abre o seletor de arquivo. */
function AddFileButton({
  label,
  onFile,
  disabled,
}: {
  label: string;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title={label}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
      >
        <Plus className="h-4 w-4 shrink-0" />
      </button>
    </>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

export function FichaDemandaDetailModal({
  isOpen,
  record,
  onClose,
  onRecordUpdated,
  allowPendingUpload = true,
  allowAddOrdemCompra = false,
  footer,
}: Props) {
  const queryClient = useQueryClient();
  const { isAdministrator } = usePermissions();
  const [editFichaOpen, setEditFichaOpen] = useState(false);
  const [editandoContrato, setEditandoContrato] = useState(false);
  const [contratoEdit, setContratoEdit] = useState('');
  const [obraEdit, setObraEdit] = useState('');
  const [uploadingAnexoId, setUploadingAnexoId] = useState<string | null>(null);
  const [scNumero, setScNumero] = useState('');
  const [scId, setScId] = useState('');
  const [ocId, setOcId] = useState('');
  const [novaOcRef, setNovaOcRef] = useState('');
  const [ocModalOpen, setOcModalOpen] = useState(false);
  const [scModalOpen, setScModalOpen] = useState(false);
  const [anexoModalOpen, setAnexoModalOpen] = useState(false);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [anexoDescricao, setAnexoDescricao] = useState('');
  const [ocFile, setOcFile] = useState<File | null>(null);
  // Leitura do ID no arquivo da OC: o campo só aparece se não der para ler.
  const [ocIdStatus, setOcIdStatus] = useState<'none' | 'found' | 'missing'>('none');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');

  useEffect(() => {
    setCancelOpen(false);
    setCancelNote('');
    setEditandoContrato(false);
    setEditFichaOpen(false);
  }, [record?.id]);

  const { data: contratosRes, isLoading: carregandoContratos } = useQuery({
    queryKey: ['fd-edit-contracts'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    enabled: editandoContrato,
  });
  const { data: obrasEdit = [], isLoading: carregandoObras } = useQuery({
    queryKey: ['fd-edit-obras', contratoEdit],
    enabled: editandoContrato && Boolean(contratoEdit),
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: { isActive: 'true', contratoId: contratoEdit, limit: 500, page: 1 },
      });
      return ((res.data?.data || []) as Array<{ id: string; name: string }>).filter(
        (o) => o.id && o.name?.trim(),
      );
    },
  });
  const contratoOptions = useMemo(
    () =>
      labeledToSelectOptions(
        ((contratosRes?.data ?? []) as Array<{ id: string; name: string; number?: string }>).map(
          (c) => ({
            value: c.id,
            label: c.name,
            searchText: [c.name, c.number].filter(Boolean).join(' '),
          }),
        ),
      ),
    [contratosRes?.data],
  );
  const obraOptionsEdit = useMemo(() => {
    const options = obrasEdit.map((o) => ({ value: o.name, label: o.name }));
    // Mantém a obra atual selecionável mesmo que não esteja na lista do contrato escolhido.
    if (obraEdit && !options.some((o) => o.value === obraEdit)) {
      options.unshift({ value: obraEdit, label: obraEdit });
    }
    return labeledToSelectOptions(options);
  }, [obrasEdit, obraEdit]);

  const editFichaMutation = useMutation({
    mutationFn: async (form: FichaDemandaApprovalFormState) => {
      if (!record?.id) throw new Error('Ficha inválida');
      const res = await api.patch(
        `/demand-sheet-approvals/${record.id}/supplies-edit`,
        formToApiPayload(form),
      );
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onSuccess: async (updated) => {
      toast.success('Ficha de demanda atualizada');
      setEditFichaOpen(false);
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(msg || 'Não foi possível atualizar a ficha.');
    },
  });

  const contratoObraMutation = useMutation({
    mutationFn: async () => {
      if (!record?.id) throw new Error('Ficha inválida');
      const res = await api.patch(`/demand-sheet-approvals/${record.id}/contract-obra`, {
        contratoId: contratoEdit,
        obra: obraEdit,
      });
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onSuccess: async (updated) => {
      toast.success('Contrato e obra atualizados');
      setEditandoContrato(false);
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(msg || 'Não foi possível atualizar contrato e obra.');
    },
  });

  useEffect(() => {
    setScNumero(record?.scNumero || '');
    setScId(record?.scId || '');
    setOcId(record?.ocId || '');
  }, [record?.id, record?.scNumero, record?.scId, record?.ocId]);

  const anexos = useMemo(() => {
    if (!record?.anexos?.length) return [];
    return record.anexos.filter((a) => a && (a.name || a.url) && inferFdAnexoKind(a) !== 'orcamento-ref');
  }, [record]);

  const anexoOrcamento = findAnexoByKind(anexos, 'orcamento');
  const extrasBase = anexosDemais(anexos);
  const ordensCompra = anexosOrdemCompra(anexos);

  const uploadMutation = useMutation({
    mutationFn: async ({
      anexoId,
      file,
      kind,
      ocRef,
      descricao,
    }: {
      anexoId?: string;
      file: File;
      kind?: string;
      ocRef?: string;
      descricao?: string;
    }) => {
      if (!record?.id) throw new Error('Ficha inválida');
      const form = new FormData();
      form.append('file', file);
      if (anexoId) form.append('anexoId', anexoId);
      if (kind) form.append('kind', kind);
      if (ocRef) form.append('ocRef', ocRef);
      if (descricao) form.append('descricao', descricao);
      const res = await api.post(`/demand-sheet-approvals/${record.id}/anexos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: LARGE_FILE_UPLOAD_TIMEOUT_MS,
      });
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onMutate: ({ anexoId, kind }) => {
      setUploadingAnexoId(anexoId || kind || 'novo');
    },
    onSuccess: async (updated) => {
      toast.success('Anexo vinculado');
      setNovaOcRef('');
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível enviar o anexo.');
    },
    onSettled: () => setUploadingAnexoId(null),
  });

  const refsMutation = useMutation({
    mutationFn: async () => {
      if (!record?.id) throw new Error('Ficha inválida');
      const res = await api.patch(`/demand-sheet-approvals/${record.id}/purchase-refs`, {
        scNumero,
        scId,
        // Cotação cada OC leva o próprio ID (no anexo); o ID único da ficha não muda.
        ocId: record.ocId || '',
      });
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onSuccess: async (updated) => {
      toast.success('Dados de compra salvos');
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível salvar os dados de compra.');
    },
  });

  const [removingAnexoId, setRemovingAnexoId] = useState<string | null>(null);
  const removeMutation = useMutation({
    mutationFn: async (anexoId: string) => {
      if (!record?.id) throw new Error('Ficha inválida');
      const res = await api.delete(
        `/demand-sheet-approvals/${record.id}/anexos/${encodeURIComponent(anexoId)}`
      );
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onMutate: (anexoId) => setRemovingAnexoId(anexoId),
    onSuccess: async (updated) => {
      toast.success('Anexo removido.');
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(msg || 'Não foi possível remover o anexo.');
    },
    onSettled: () => setRemovingAnexoId(null),
  });

  const statusMutation = useMutation({
    mutationFn: async (purchaseStatus: 'QUOTATION' | 'FINISHED') => {
      if (!record?.id) throw new Error('Ficha inválida');
      const res = await api.patch(`/demand-sheet-approvals/${record.id}/purchase-status`, {
        purchaseStatus,
      });
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onSuccess: async (updated, purchaseStatus) => {
      toast.success(
        purchaseStatus === 'FINISHED'
          ? 'Ficha finalizada.'
          : isFinished
            ? 'Ficha voltou para Cotação.'
            : 'Ficha enviada para Cotação.'
      );
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
      await queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(msg || 'Não foi possível alterar o status da ficha.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!record?.id) throw new Error('Ficha inválida');
      const res = await api.patch(`/demand-sheet-approvals/${record.id}/purchase-status`, {
        purchaseStatus: 'CANCELLED',
        purchaseCancellationNote: cancelNote.trim(),
      });
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onSuccess: async (updated) => {
      toast.success('Ficha cancelada.');
      setCancelOpen(false);
      setCancelNote('');
      if (updated) onRecordUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['demand-sheet-approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['fds-aprovadas'] });
      await queryClient.invalidateQueries({ queryKey: ['fd-notification-counts'] });
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível cancelar a ficha.');
    },
  });

  if (!record) return null;

  // Fluxo: Fila → (SC preenchida) Suprimentos → manual: Cotação (mais OCs) ou Finalizada.
  const isCancelled = record.purchaseStatus === 'CANCELLED';
  const isFinished = record.purchaseStatus === 'FINISHED';
  const canCancel = !isCancelled && !isFinished;
  // Pendente (sem status de compras): ainda não existe OC, então não dá para anexar nem editar.
  const ordemCompraEditavel = !!record.purchaseStatus && !isCancelled;
  // Etapas: sem status → SC; Cotação → ID da OC + anexo da OC; demais (Finalizado, Cancelado, antigos) → tudo.
  const stage: 'sc' | 'oc' | 'all' = !record.purchaseStatus
    ? 'sc'
    : record.purchaseStatus === 'PURCHASE_REQUEST' ||
        record.purchaseStatus === 'SUPPLIES' ||
        record.purchaseStatus === 'QUOTATION'
      ? 'oc'
      : 'all';
  // Só existe a etapa Cotação (as fichas antigas em Suprimentos já foram migradas pra ela).
  const isQuotation =
    record.purchaseStatus === 'QUOTATION' ||
    record.purchaseStatus === 'PURCHASE_REQUEST' ||
    record.purchaseStatus === 'SUPPLIES';
  const temOcAnexada = ordensCompra.some((a) => !!a.url);
  // A 1ª ficha de demanda é a obrigatória; as demais entram aqui (Suprimentos e Cotação).
  const fdsDaFicha = anexos.filter((a) => inferFdAnexoKind(a) === 'fd');
  const podeAdicionarFd = allowAddOrdemCompra && stage !== 'all';
  // Em Fila e em Cotação (editável) a ficha de demanda sai de "Anexos obrigatórios" e vai para o próprio bloco.
  const editavelAnexos = podeAdicionarFd && canCancel;
  // Botão de lixeira nos anexos (não vale para o orçamento) enquanto a ficha está em Cotação.
  const removerProps = (anexo: FdAnexo) =>
    editavelAnexos && anexo.id && inferFdAnexoKind(anexo) !== 'orcamento'
      ? {
          onRemove: () => {
            if (window.confirm('Remover este anexo?')) removeMutation.mutate(anexo.id);
          },
          removing: removingAnexoId === anexo.id,
        }
      : {}
  // Organização igual em todos os status: Fichas de demanda e Demais anexos (o orçamento fica nele).
  const extras = anexoOrcamento ? [anexoOrcamento, ...extrasBase] : extrasBase;
  const ordemCompraItems = ordensCompra.map((anexo, index) => {
          const anexoKey = anexo.id || `${anexo.name}-${anexo.sourcePath || index}`;
          const isPending = !anexo.url;
          return (
            <FilePreviewCard
              key={anexoKey}
              file={{
                originalName: anexo.name || 'Arquivo',
                fileUrl: anexo.url,
              }}
              // Número da OC em cima e o nome do arquivo embaixo.
              displayName={anexo.ocRef ? `ID ${anexo.ocRef}` : undefined}
              extra={anexo.ocRef ? anexo.name || 'Arquivo' : 'Ordem de compra'}
              {...removerProps(anexo)}
              uploading={uploadingAnexoId === anexoKey || uploadingAnexoId === anexo.id}
              onUpload={
                allowPendingUpload && isPending && ordemCompraEditavel
                  ? (file) => {
                      const idForUpload = anexo.id || anexoKey;
                      uploadMutation.mutate({ anexoId: idForUpload, file, kind: 'oc' });
                    }
                  : undefined
              }
            />
          );
        });
  const ordemCompraCards =
    ordemCompraItems.length === 0 ? null : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{ordemCompraItems}</div>
    );
  const corpoBlocoSc = stage !== 'sc' || (isCancelled && !!record.purchaseCancellationNote);
  const scAddButton =
    allowAddOrdemCompra && !isCancelled ? (
      <button
        type="button"
        onClick={() => setScModalOpen(true)}
        title="Adicionar SC"
        aria-label="Adicionar SC"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
      >
        <Plus className="h-4 w-4 shrink-0" />
      </button>
    ) : null;
  const ordemCompraAddButton =
    allowAddOrdemCompra && ordemCompraEditavel ? (
      <button
        type="button"
        onClick={() => {
          setNovaOcRef('');
          setOcFile(null);
          setOcIdStatus('none');
          setOcModalOpen(true);
        }}
        title="Adicionar OC"
        aria-label="Adicionar OC"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
      >
        <Plus className="h-4 w-4 shrink-0" />
      </button>
    ) : null;
  const refsChanged =
    scNumero !== (record.scNumero || '') ||
    scId !== (record.scId || '');

  // Rodapé fixo do modal (não rola com o conteúdo): Fechar e, em Cotação, Finalizar.
  const mostrarFinalizar = allowAddOrdemCompra && canCancel && isQuotation;
  const modalFooter = footer ? (
    <div className="w-full">{footer}</div>
  ) : (
    <div className="flex w-full items-center justify-end gap-2">
      {allowAddOrdemCompra ? (
        <Button type="button" variant="outline" onClick={() => setEditFichaOpen(true)}>
          Editar
        </Button>
      ) : null}
      {allowAddOrdemCompra && canCancel ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setCancelOpen(true)}
          disabled={refsMutation.isPending || statusMutation.isPending}
        >
          Cancelar
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={onClose}>
          Fechar
        </Button>
      )}
      {mostrarFinalizar ? (
        <Button
          type="button"
          variant="error"
          onClick={() => statusMutation.mutate('FINISHED')}
          disabled={statusMutation.isPending || refsMutation.isPending || !temOcAnexada}
          title={temOcAnexada ? undefined : 'Adicione uma ordem de compra para finalizar'}
        >
          {statusMutation.isPending ? 'Finalizando...' : 'Finalizar'}
        </Button>
      ) : null}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalhes da Ficha de Demanda"
      size="xl"
      footer={modalFooter}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {record.codFichaDemanda || 'Sem código'}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Pedido {record.codigoPedido || '—'} · {record.polo}
            </p>
          </div>
          <FdStatusBadges record={record} />
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Código da FD">{record.codFichaDemanda || '—'}</Field>
          <Field label="Pedido">{record.codigoPedido || '—'}</Field>
          {editandoContrato ? (
            <div className="sm:col-span-2">
              <div className="grid gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Contrato
                  </p>
                  <SingleSelectSearchDropdown
                    value={contratoEdit}
                    onChange={(id) => {
                      setContratoEdit(id);
                      setObraEdit('');
                    }}
                    options={contratoOptions}
                    allowEmpty={false}
                    disabled={carregandoContratos}
                    placeholder={carregandoContratos ? 'Carregando…' : 'Selecionar contrato…'}
                    searchPlaceholder="Pesquisar contrato…"
                    emptyOptionsMessage="Nenhum contrato encontrado."
                    noFocusRing
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Obra
                  </p>
                  <SingleSelectSearchDropdown
                    value={obraEdit}
                    onChange={setObraEdit}
                    options={obraOptionsEdit}
                    allowEmpty={false}
                    disabled={!contratoEdit || carregandoObras}
                    placeholder={
                      !contratoEdit
                        ? 'Selecione o contrato primeiro…'
                        : carregandoObras
                          ? 'Carregando…'
                          : 'Selecionar obra…'
                    }
                    searchPlaceholder="Pesquisar obra…"
                    emptyOptionsMessage="Nenhuma obra neste contrato."
                    noFocusRing
                  />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={contratoObraMutation.isPending}
                    onClick={() => setEditandoContrato(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="error"
                    disabled={contratoObraMutation.isPending || !contratoEdit || !obraEdit}
                    onClick={() => contratoObraMutation.mutate()}
                  >
                    {contratoObraMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Field label="Contrato">
                <span className="uppercase">{record.contratoNome || '—'}</span>
              </Field>
              <Field label="Obra">
                <div className="flex items-start justify-between gap-2">
                  <span className="uppercase">{record.obra || '—'}</span>
                  {isAdministrator ? (
                    <button
                      type="button"
                      title="Editar contrato e obra"
                      aria-label="Editar contrato e obra"
                      onClick={() => {
                        setContratoEdit(record.contratoId);
                        setObraEdit(record.obra);
                        setEditandoContrato(true);
                      }}
                      className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </Field>
            </>
          )}
          <Field label="Solicitante">{record.solicitanteNome || '—'}</Field>
          <Field label="Polo">{record.polo || '—'}</Field>
          <Field label="Nº Mov RM">{record.numMovRm || '—'}</Field>
          <Field label="ID Mov RM">{record.idMovRm || '—'}</Field>
          <Field label="Nº da SC">{record.scNumero || '—'}</Field>
          <Field label="ID da SC">{record.scId || '—'}</Field>
          {record.ocId ? <Field label="ID da OC">{record.ocId}</Field> : null}
          <Field label="Faturamento estimado">
            {formatCurrencyDisplay(record.faturamentoEstimado)}
          </Field>
          <Field label="Custo estimado">{formatCurrencyDisplay(record.custoEstimado)}</Field>
          <Field label="Data/hora">{formatDateTime(record.dataHora)}</Field>
          <Field label="Status">{FD_STATUS_LABELS[record.status] || record.status}</Field>
          <Field label="Status compras">{purchaseStatusLabel(record.purchaseStatus)}</Field>
          {record.purchaseStatus === 'CANCELLED' && record.purchaseCancellationNote ? (
            <div className="sm:col-span-2">
              <Field label="Observação do cancelamento">{record.purchaseCancellationNote}</Field>
            </div>
          ) : null}
          <Field label="Criada em">{formatDateTime(record.createdAt)}</Field>
          {record.managerApproverNome ? (
            <Field label="Aprovado por">{record.managerApproverNome}</Field>
          ) : null}
          {record.managerApprovalComment ? (
            <Field label="Comentário da aprovação">{record.managerApprovalComment}</Field>
          ) : null}
          {record.managerRejectionReason ? (
            <Field label="Motivo da reprovação">{record.managerRejectionReason}</Field>
          ) : null}
          <div className="sm:col-span-2">
            <Field label="Observação">{record.observacao || '—'}</Field>
          </div>
        </dl>

        {/* Finalizada ou cancelada: não edita mais; os dados ficam na lista acima e a OC no bloco de consulta. */}
        {allowAddOrdemCompra && isFinished ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Ficha finalizada. Precisa de mais ordens de compra?
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => statusMutation.mutate('QUOTATION')}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? 'Voltando...' : 'Voltar para Cotação'}
            </Button>
          </div>
        ) : null}

        {allowAddOrdemCompra && canCancel ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                corpoBlocoSc ? 'border-b border-gray-200 dark:border-gray-700' : ''
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Paperclip className="h-4 w-4 text-gray-500" />
                {stage === 'sc' ? 'Solicitação de compra' : 'Ordens de compra'}
              </div>
              {stage === 'sc' ? scAddButton : ordemCompraAddButton}
            </div>
            {corpoBlocoSc ? (
            <div className="space-y-4 p-4">
              {isCancelled && record.purchaseCancellationNote ? (
                <p className="text-sm text-red-700 dark:text-red-300">
                  Cancelada: {record.purchaseCancellationNote}
                </p>
              ) : null}
              {stage === 'all' ? (
              <div
                className={`grid gap-4 ${
                  stage === 'all' ? 'sm:grid-cols-3' : stage === 'sc' ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
                }`}
              >
                <>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nº da SC
                      </span>
                      <input
                        value={scNumero}
                        onChange={(e) => setScNumero(e.target.value)}
                        disabled={isCancelled}
                        className={FORM_FIELD_INPUT_CLS}
                        placeholder="Digite o número da solicitação"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        ID da SC
                      </span>
                      <input
                        value={scId}
                        onChange={(e) => setScId(e.target.value)}
                        disabled={isCancelled}
                        className={FORM_FIELD_INPUT_CLS}
                        placeholder="Digite o ID da solicitação"
                      />
                    </label>
                </>
              </div>
              ) : null}
              {stage !== 'sc' ? (
                <div className="space-y-3">
                  {ordemCompraItems.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhuma ordem de compra adicionada. Use{' '}
                      <span className="font-medium text-gray-700 dark:text-gray-300">Adicionar OC</span>{' '}
                      para incluir quantas precisar.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{ordemCompraItems}</div>
                  )}
                </div>
              ) : null}
              {stage === 'all' && !isCancelled ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => refsMutation.mutate()}
                    disabled={refsMutation.isPending || !refsChanged}
                  >
                    {refsMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              ) : null}
            </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4">
          {/* Em edição as OCs ficam no bloco de cima; aqui só a consulta, quando há OC. */}
          {(!allowAddOrdemCompra || !canCancel) && ordensCompra.length > 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <Paperclip className="h-4 w-4 text-gray-500" />
                  Ordens de compra
                </div>
              </div>
              <div className="p-4">{ordemCompraCards}</div>
            </div>
          ) : null}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Paperclip className="h-4 w-4 text-gray-500" />
                Fichas de demanda
              </div>
              {editavelAnexos ? (
                <AddFileButton
                  label="Adicionar ficha"
                  disabled={uploadMutation.isPending}
                  onFile={(file) => uploadMutation.mutate({ file, kind: 'fd' })}
                />
              ) : null}
            </div>
            {fdsDaFicha.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                Nenhuma ficha de demanda.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                {fdsDaFicha.map((anexo, index) => {
                  const anexoKey = anexo.id || `${anexo.name}-${anexo.sourcePath || index}`;
                  const isPending = !anexo.url;
                  return (
                    <FilePreviewCard
                      key={anexoKey}
                      file={{ originalName: anexo.name || 'Arquivo', fileUrl: anexo.url }}
                      displayName="Ficha de demanda"
                      extra={anexo.name || 'Arquivo'}
                      uploading={uploadingAnexoId === anexoKey || uploadingAnexoId === anexo.id}
                      onUpload={
                        allowPendingUpload && isPending
                          ? (file) =>
                              uploadMutation.mutate({ anexoId: anexo.id || anexoKey, file })
                          : undefined
                      }
                      {...removerProps(anexo)}
                    />
                  );
                })}
              </div>
            )}
          </div>


          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Paperclip className="h-4 w-4 text-gray-500" />
                Demais anexos
              </div>
              {/* Qualquer pessoa com acesso à ficha pode juntar anexos, em qualquer etapa (aprovada, cotação, finalizada...). */}
              {allowPendingUpload ? (
                <button
                  type="button"
                  onClick={() => {
                    setAnexoDescricao('');
                    setAnexoFile(null);
                    setAnexoModalOpen(true);
                  }}
                  title="Adicionar anexo"
                  aria-label="Adicionar anexo"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                </button>
              ) : null}
            </div>
            {extras.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                Nenhum anexo adicional.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                {extras.map((anexo, index) => {
                  const anexoKey = anexo.id || `${anexo.name}-${anexo.sourcePath || index}`;
                  const isPending = !anexo.url;
                  return (
                    <FilePreviewCard
                      key={anexoKey}
                      file={{
                        originalName: anexo.name || 'Arquivo',
                        fileUrl: anexo.url,
                      }}
                      displayName={anexo.descricao || fdAnexoKindLabel(inferFdAnexoKind(anexo))}
                      extra={anexo.name || 'Arquivo'}
                      {...removerProps(anexo)}
                      uploading={uploadingAnexoId === anexoKey || uploadingAnexoId === anexo.id}
                      onUpload={
                        allowPendingUpload && isPending
                          ? (file) => {
                              const idForUpload = anexo.id || anexoKey;
                              uploadMutation.mutate({ anexoId: idForUpload, file });
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
      <Modal
        isOpen={anexoModalOpen}
        onClose={() => {
          if (!uploadMutation.isPending) setAnexoModalOpen(false);
        }}
        title="Adicionar anexo"
        size="md"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              O que é este anexo?<span className="text-red-500"> *</span>
            </span>
            <input
              value={anexoDescricao}
              onChange={(e) => setAnexoDescricao(e.target.value)}
              maxLength={120}
              className={FORM_FIELD_INPUT_CLS}
              placeholder="Ex.: Orçamento, Proposta, Comprovante..."
            />
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Arquivo<span className="text-red-500"> *</span>
            </span>
            <FileDropZone
              label={anexoFile ? anexoFile.name : 'Anexar arquivo'}
              hint={anexoFile ? 'Clique ou arraste para trocar o arquivo' : 'Clique ou arraste o arquivo'}
              onFiles={(files) => {
                if (files[0]) setAnexoFile(files[0]);
              }}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAnexoModalOpen(false)}
              disabled={uploadMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={() => {
                if (!anexoFile || !anexoDescricao.trim()) return;
                uploadMutation.mutate(
                  { file: anexoFile, kind: 'outro', descricao: anexoDescricao.trim() },
                  {
                    onSuccess: () => {
                      setAnexoModalOpen(false);
                      setAnexoFile(null);
                    },
                  },
                );
              }}
              disabled={!anexoFile || !anexoDescricao.trim() || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
      <FichaDemandaApprovalFormModal
        isOpen={editFichaOpen}
        onClose={() => {
          if (!editFichaMutation.isPending) setEditFichaOpen(false);
        }}
        editingRecord={record}
        onSave={(form) => editFichaMutation.mutate(form)}
        isSaving={editFichaMutation.isPending}
        title="Editar ficha de demanda"
      />
      <Modal
        isOpen={scModalOpen}
        onClose={() => {
          if (!refsMutation.isPending) setScModalOpen(false);
        }}
        title="Adicionar solicitação de compra"
        size="md"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nº da SC<span className="text-red-500"> *</span>
            </span>
            <input
              value={scNumero}
              onChange={(e) => setScNumero(e.target.value)}
              className={FORM_FIELD_INPUT_CLS}
              placeholder="Digite o número da solicitação"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              ID da SC<span className="text-red-500"> *</span>
            </span>
            <input
              value={scId}
              onChange={(e) => setScId(e.target.value)}
              className={FORM_FIELD_INPUT_CLS}
              placeholder="Digite o ID da solicitação"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setScModalOpen(false)}
              disabled={refsMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={() =>
                refsMutation.mutate(undefined, { onSuccess: () => setScModalOpen(false) })
              }
              disabled={!scNumero.trim() || !scId.trim() || refsMutation.isPending}
            >
              {refsMutation.isPending ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={ocModalOpen}
        onClose={() => {
          if (!uploadMutation.isPending) setOcModalOpen(false);
        }}
        title="Adicionar ordem de compra"
        size="md"
      >
        <div className="space-y-4">
          {ocIdStatus === 'missing' ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                ID da OC<span className="text-red-500"> *</span>
              </span>
              <input
                value={novaOcRef}
                onChange={(e) => setNovaOcRef(e.target.value)}
                className={FORM_FIELD_INPUT_CLS}
                placeholder="Digite o ID da ordem de compra"
              />
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Não foi possível ler o ID no arquivo. Informe manualmente.
              </span>
            </label>
          ) : null}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Anexo da OC<span className="text-red-500"> *</span>
            </span>
            <FileDropZone
              label={ocFile ? ocFile.name : 'Anexar ordem de compra'}
              hint={ocFile ? 'Clique ou arraste para trocar o arquivo' : 'Clique ou arraste imagem/PDF'}
              onFiles={(files) => {
                const file = files[0];
                if (!file) return;
                setOcFile(file);
                setOcIdStatus('none');
                void detectOcIdFromFile(file).then((id) => {
                  if (id) setNovaOcRef(id);
                  setOcIdStatus(id ? 'found' : 'missing');
                });
              }}
            />
            {ocIdStatus === 'found' ? (
              <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                ID da OC identificado no arquivo: {novaOcRef}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOcModalOpen(false)}
              disabled={uploadMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="error"
              onClick={() => {
                if (!ocFile || !novaOcRef.trim()) return;
                uploadMutation.mutate(
                  { file: ocFile, kind: 'oc', ocRef: novaOcRef.trim() },
                  {
                    onSuccess: () => {
                      setOcModalOpen(false);
                      setOcFile(null);
                    },
                  },
                );
              }}
              disabled={!ocFile || !novaOcRef.trim() || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={cancelOpen}
        onClose={() => {
          if (!cancelMutation.isPending) setCancelOpen(false);
        }}
        title="Cancelar ficha de demanda"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Informe o motivo do cancelamento. A ficha passa para Cancelada e não poderá mais ser
            alterada.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Motivo do cancelamento<span className="text-red-500"> *</span>
            </label>
            <textarea
              rows={3}
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              placeholder="Informe o motivo do cancelamento"
              className={FORM_FIELD_TEXTAREA_CLS}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => cancelMutation.mutate()}
              disabled={!cancelNote.trim() || cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar ficha'}
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
