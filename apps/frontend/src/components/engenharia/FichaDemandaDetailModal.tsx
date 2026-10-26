'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Paperclip } from 'lucide-react';
import { FileDropZone } from '@/components/ui/FileDropZone';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import { FdStatusBadges } from '@/components/engenharia/FdStatusBadges';
import { FdHistoricoPedidosSection } from '@/components/engenharia/FdHistoricoPedidosSection';
import api, { LARGE_FILE_UPLOAD_TIMEOUT_MS } from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import {
  anexosDemais,
  anexosOrdemCompra,
  fdAnexoKindLabel,
  findAnexoByKind,
  FD_STATUS_LABELS,
  formatCurrencyDisplay,
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

function cleanAnexoName(raw: string): string {
  return raw.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-?/i, '');
}

async function downloadAnexo(url: string, fallbackName: string) {
  try {
    const resolved = resolveApiMediaUrl(url) || url;
    const res = await fetch(resolved);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = cleanAnexoName(fallbackName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(resolveApiMediaUrl(url) || url, '_blank');
  }
}

function FilePreviewCardIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toUpperCase() || '';
  return (
    <div className="text-center">
      <svg className="mx-auto h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      {ext && <span className="mt-0.5 block text-[9px] font-bold text-gray-500">{ext}</span>}
    </div>
  );
}

function AnexoObrigatorioPreview({
  titulo,
  anexo,
  uploadingAnexoId,
  allowPendingUpload,
  onUpload,
}: {
  titulo: string;
  anexo?: FdAnexo;
  uploadingAnexoId: string | null;
  allowPendingUpload: boolean;
  onUpload: (anexoId: string, file: File) => void;
}) {
  if (!anexo) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center dark:border-gray-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {titulo}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Não enviado</p>
      </div>
    );
  }
  const anexoKey = anexo.id || anexo.name;
  const isPending = !anexo.url;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {titulo}
      </p>
      <FilePreviewCard
        file={{
          originalName: anexo.name || 'Arquivo',
          fileUrl: anexo.url,
        }}
        extra={titulo}
        uploading={uploadingAnexoId === anexoKey || uploadingAnexoId === anexo.id}
        onUpload={
          allowPendingUpload && isPending
            ? (file) => onUpload(anexo.id || anexoKey, file)
            : undefined
        }
      />
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
  const [uploadingAnexoId, setUploadingAnexoId] = useState<string | null>(null);

  /** Orçamento que gerou a FD (nome vem do índice de orçamentos do contrato). */
  const orcamentoQuery = useQuery({
    queryKey: ['fd-orcamento-origem', record?.id],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/${record!.id}/orcamento`);
      return (res.data?.data ?? null) as {
        nome: string | null;
        osNumeroPasta?: string | null;
        orcamentoId: string;
        centroCustoId: string;
      } | null;
    },
    enabled: isOpen && !!record?.id,
    staleTime: 60_000,
    retry: false,
  });

  const anexos = useMemo(() => {
    if (!record?.anexos?.length) return [];
    return record.anexos.filter((a) => a && (a.name || a.url) && inferFdAnexoKind(a) !== 'orcamento-ref');
  }, [record]);

  const anexoOrcamento = findAnexoByKind(anexos, 'orcamento');
  const anexoFd = findAnexoByKind(anexos, 'fd');
  const extras = anexosDemais(anexos);
  const ordensCompra = anexosOrdemCompra(anexos);
  const linkedCount = anexos.filter((a) => a.url).length;
  const pendingCount = anexos.length - linkedCount;

  const uploadMutation = useMutation({
    mutationFn: async ({
      anexoId,
      file,
      kind,
    }: {
      anexoId?: string;
      file: File;
      kind?: string;
    }) => {
      if (!record?.id) throw new Error('Ficha inválida');
      const form = new FormData();
      form.append('file', file);
      if (anexoId) form.append('anexoId', anexoId);
      if (kind) form.append('kind', kind);
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

  const orcamentoDaFd = orcamentoQuery.data;
  const temPedidosPelaFd = Array.isArray(record.itensPedidos) && record.itensPedidos.length > 0;

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
          {orcamentoDaFd !== undefined && (
            <div className="sm:col-span-2">
              <Field label="OS / Nº da pasta">{orcamentoDaFd?.osNumeroPasta || '—'}</Field>
            </div>
          )}
          {orcamentoDaFd !== undefined && (
            <div className="sm:col-span-2">
              <Field label="Orçamento de origem">
                {orcamentoDaFd?.nome || (orcamentoDaFd ? 'Orçamento não encontrado' : 'FD sem orçamento vinculado')}
              </Field>
            </div>
          )}
          <Field label="Solicitante">{record.solicitanteNome || '—'}</Field>
          <Field label="Polo">{record.polo || '—'}</Field>
          {/* RMs geradas pela FD aparecem nos cards do histórico; aqui só a RM informada à mão (fluxo antigo). */}
          {!temPedidosPelaFd && (
            <>
              <Field label="Nº Mov RM">{record.numMovRm || '—'}</Field>
              <Field label="ID Mov RM">{record.idMovRm || '—'}</Field>
            </>
          )}
          <Field label="Faturamento estimado">
            {formatCurrencyDisplay(record.faturamentoEstimado)}
          </Field>
          <Field label="Custo estimado">{formatCurrencyDisplay(record.custoEstimado)}</Field>
          <Field label="Data/hora">{formatDateTime(record.dataHora)}</Field>
          <Field label="Status">{
            record.status === 'CANCELLED' && record.managerRejectionComment?.includes('exclusão de orçamento')
              ? 'FD Cancelada por exclusão de orçamento'
              : (FD_STATUS_LABELS[record.status] || record.status)
          }</Field>
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

        {record.status === 'APPROVED' && (
          <FdHistoricoPedidosSection fdApprovalId={record.id} codFichaDemanda={record.codFichaDemanda} />
        )}

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Paperclip className="h-4 w-4 text-gray-500" />
                Anexos obrigatórios
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {linkedCount === 0
                  ? 'Nenhum arquivo'
                  : `${linkedCount} com arquivo` +
                    (pendingCount ? ` · ${pendingCount} pendente(s)` : '')}
              </p>
            </div>
            <div className="space-y-3 p-4">
              {record?.orcamentoId && record?.contratoId ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        `/ponto/contratos/${record.contratoId}/orcamento/${record.orcamentoId}`,
                        '_blank',
                      )
                    }
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                      <FilePreviewCardIcon name="orcamento.xlsx" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        Orçamento e Ficha de Demanda
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">Clique para abrir</p>
                    </div>
                  </button>
                  <div className="flex gap-2">
                    {anexoOrcamento?.url && (
                      <button
                        type="button"
                        onClick={() => downloadAnexo(anexoOrcamento.url!, anexoOrcamento.name || 'orcamento.xlsx')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar Orçamento
                      </button>
                    )}
                    {anexoFd?.url && (
                      <button
                        type="button"
                        onClick={() => downloadAnexo(anexoFd.url!, anexoFd.name || 'ficha-demanda.xlsx')}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar Ficha de Demanda
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <AnexoObrigatorioPreview
                    titulo="Orçamento"
                    anexo={anexoOrcamento}
                    uploadingAnexoId={uploadingAnexoId}
                    allowPendingUpload={allowPendingUpload}
                    onUpload={(anexoId, file) => uploadMutation.mutate({ anexoId, file })}
                  />
                  <AnexoObrigatorioPreview
                    titulo="Ficha de demanda"
                    anexo={anexoFd}
                    uploadingAnexoId={uploadingAnexoId}
                    allowPendingUpload={allowPendingUpload}
                    onUpload={(anexoId, file) => uploadMutation.mutate({ anexoId, file })}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Paperclip className="h-4 w-4 text-gray-500" />
                Ordens de compra
              </div>
            </div>
            <div className="space-y-3 p-4">
              {ordensCompra.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma ordem de compra anexada.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {ordensCompra.map((anexo, index) => {
                    const anexoKey = anexo.id || `${anexo.name}-${anexo.sourcePath || index}`;
                    const isPending = !anexo.url;
                    return (
                      <FilePreviewCard
                        key={anexoKey}
                        file={{
                          originalName: anexo.name || 'Arquivo',
                          fileUrl: anexo.url,
                        }}
                        extra="Ordem de compra"
                        uploading={uploadingAnexoId === anexoKey || uploadingAnexoId === anexo.id}
                        onUpload={
                          allowPendingUpload && isPending
                            ? (file) => {
                                const idForUpload = anexo.id || anexoKey;
                                uploadMutation.mutate({ anexoId: idForUpload, file, kind: 'oc' });
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              )}
              {allowAddOrdemCompra ? (
                <FileDropZone
                  label="Adicionar ordem de compra"
                  hint="Clique ou arraste imagem/PDF"
                  uploading={uploadingAnexoId === 'oc'}
                  disabled={uploadMutation.isPending && uploadingAnexoId !== 'oc'}
                  onFiles={(files) => {
                    const file = files[0];
                    if (file) uploadMutation.mutate({ file, kind: 'oc' });
                  }}
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <Paperclip className="h-4 w-4 text-gray-500" />
                Demais anexos
              </div>
            </div>
            {extras.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                Nenhum anexo adicional.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
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
                      extra={fdAnexoKindLabel(inferFdAnexoKind(anexo))}
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

        {footer ? (
          footer
        ) : (
          <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
