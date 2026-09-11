'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import api from '@/lib/api';
import {
  FD_STATUS_LABELS,
  formatCurrencyDisplay,
  purchaseStatusLabel,
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
};

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
}: Props) {
  const queryClient = useQueryClient();
  const [uploadingAnexoId, setUploadingAnexoId] = useState<string | null>(null);

  const anexos = useMemo(() => {
    if (!record?.anexos?.length) return [];
    return record.anexos.filter((a) => a && (a.name || a.url));
  }, [record]);

  const linkedCount = anexos.filter((a) => a.url).length;
  const pendingCount = anexos.length - linkedCount;

  const uploadMutation = useMutation({
    mutationFn: async ({ anexoId, file }: { anexoId: string; file: File }) => {
      if (!record?.id) throw new Error('Ficha inválida');
      const form = new FormData();
      form.append('file', file);
      form.append('anexoId', anexoId);
      const res = await api.post(`/demand-sheet-approvals/${record.id}/anexos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return (res.data?.data ?? null) as FichaDemandaApprovalRecord | null;
    },
    onMutate: ({ anexoId }) => {
      setUploadingAnexoId(anexoId);
    },
    onSuccess: async (updated) => {
      toast.success('Anexo vinculado');
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

  if (!record) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes da Ficha de Demanda" size="xl">
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
          <Field label="Contrato">
            <span className="uppercase">{record.contratoNome || '—'}</span>
          </Field>
          <Field label="Obra">
            <span className="uppercase">{record.obra || '—'}</span>
          </Field>
          <Field label="Solicitante">{record.solicitanteNome || '—'}</Field>
          <Field label="Polo">{record.polo || '—'}</Field>
          <Field label="Nº Mov RM">{record.numMovRm || '—'}</Field>
          <Field label="ID Mov RM">{record.idMovRm || '—'}</Field>
          <Field label="Faturamento estimado">
            {formatCurrencyDisplay(record.faturamentoEstimado)}
          </Field>
          <Field label="Custo estimado">{formatCurrencyDisplay(record.custoEstimado)}</Field>
          <Field label="Data/hora">{formatDateTime(record.dataHora)}</Field>
          <Field label="Status">{FD_STATUS_LABELS[record.status] || record.status}</Field>
          <Field label="Status compras">{purchaseStatusLabel(record.purchaseStatus)}</Field>
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

        <div className="rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Paperclip className="h-4 w-4 text-gray-500" />
              Anexos
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {anexos.length === 0
                ? 'Nenhum anexo'
                : `${linkedCount} com arquivo` +
                  (pendingCount ? ` · ${pendingCount} pendente(s)` : '')}
            </p>
          </div>

          {anexos.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Esta ficha ainda não tem anexos. Use Importar → só o ZIP para vincular, ou cadastre
              anexos na planilha.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
              {anexos.map((anexo, index) => {
                const anexoKey = anexo.id || `${anexo.name}-${anexo.sourcePath || index}`;
                const isPending = !anexo.url;
                return (
                  <FilePreviewCard
                    key={anexoKey}
                    file={{
                      originalName: anexo.name || 'Arquivo',
                      fileUrl: anexo.url,
                    }}
                    extra={anexo.kind || undefined}
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

        <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}
