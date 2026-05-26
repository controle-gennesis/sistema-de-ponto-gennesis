'use client';

import React, { useMemo, useState } from 'react';
import { Banknote, Loader2, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import {
  buyerActiveInstallmentIndex,
  installmentStatusLabel,
  parsePaymentBoletoInstallments,
  romanParcelLabel,
  rowStatus,
  useParallelBoletoPaymentFlow,
  type BoletoInstallmentRow
} from '@/components/oc/ocPaymentBoleto';
import {
  buildInitialRows,
  draftToRow,
  formatDueDateBr,
  formatMoneyDisplay,
  installmentsStateKey,
  parseMoneyInput,
  rowsToInstallments,
  type BoletoParcelasOrderFields,
  type RowDraft
} from '@/components/oc/boletoParcelasUtils';

export type BoletoParcelasListProps = {
  order: BoletoParcelasOrderFields & { id: string; orderNumber?: string };
  /** Exibe linha de comprovante (histórico / fase pagamento). */
  showComprovante?: boolean;
  /** Permite editar valor, vencimento e anexo nas parcelas liberadas. */
  editable?: boolean;
  /** Texto auxiliar acima da lista. */
  hint?: string;
  onSaved?: (payload: { data: unknown }) => void;
  className?: string;
};

function BoletoParcelasListInner({
  order,
  showComprovante = false,
  editable = false,
  hint,
  onSaved,
  className = ''
}: BoletoParcelasListProps) {
  const n = order.paymentParcelCount ?? 1;
  const [rows, setRows] = useState<RowDraft[]>(() => buildInitialRows(order));
  const [saving, setSaving] = useState(false);

  const phaseReleased = order.paymentBoletoPhaseReleased === true;
  const parallelFlow = useParallelBoletoPaymentFlow({
    status: 'APPROVED',
    paymentType: 'BOLETO',
    paymentParcelCount: order.paymentParcelCount,
    paymentBoletoInstallments: order.paymentBoletoInstallments,
    paymentBoletoPhaseReleased: order.paymentBoletoPhaseReleased
  });
  const activeIdx = useMemo(
    () =>
      buyerActiveInstallmentIndex({
        status: 'APPROVED',
        paymentType: 'BOLETO',
        paymentParcelCount: order.paymentParcelCount,
        paymentBoletoInstallments: rows.map(draftToRow),
        paymentBoletoPhaseReleased: order.paymentBoletoPhaseReleased
      }),
    [order.paymentParcelCount, order.paymentBoletoPhaseReleased, rows]
  );

  const parsedRows = useMemo(() => rows.map(draftToRow), [rows]);
  const storedRows = useMemo(
    () => parsePaymentBoletoInstallments(order.paymentBoletoInstallments),
    [order.paymentBoletoInstallments]
  );
  const orderProofUrl = (order.paymentProofUrl || '').trim();
  const orderProofName = (order.paymentProofName || '').trim();

  const canSave = useMemo(() => {
    if (!editable) return false;
    if (!rows.every((r) => parseMoneyInput(r.amount) != null && (r.dueDate ?? '').trim())) return false;
    if (phaseReleased) return false;
    const pending = rows.some((r, i) => rowStatus(parsedRows[i]) === 'PENDING_BOLETO');
    if (!pending) return false;
    return rows.some((r, i) => {
      if (rowStatus(parsedRows[i]) !== 'PENDING_BOLETO') return false;
      return !!(r.boletoUrl || '').trim();
    });
  }, [rows, parsedRows, editable, phaseReleased]);

  const uploadForIndex = async (index: number, file: File) => {
    if (!editable) return;
    if (phaseReleased) {
      toast.error('Aguarde o financeiro liberar a próxima parcela.');
      return;
    }
    const st = rowStatus(parsedRows[index]);
    if (st !== 'PENDING_BOLETO') {
      toast.error('Esta parcela não pode ser alterada.');
      return;
    }
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, uploading: true } : r)));
    try {
      const fd = new FormData();
      fd.append('boleto', file);
      const up = await api.post('/purchase-orders/upload-boleto', fd);
      const url = up.data?.data?.url as string | undefined;
      const originalName = up.data?.data?.originalName as string | undefined;
      if (!url) throw new Error('Resposta inválida do upload');
      setRows((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, boletoUrl: url, boletoName: originalName ?? file.name, uploading: false } : r
        )
      );
      toast.success(`Boleto da parcela ${romanParcelLabel(index)} anexado.`);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || 'Erro ao enviar arquivo');
      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, uploading: false } : r)));
    }
  };

  const handleSave = async () => {
    if (!editable || !canSave) {
      toast.error('Preencha valor e vencimento e anexe ao menos um boleto em parcela pendente.');
      return;
    }
    const installments: BoletoInstallmentRow[] = rowsToInstallments(rows);
    setSaving(true);
    try {
      const res = await api.patch(`/purchase-orders/${order.id}/payment-boleto-installments`, {
        installments
      });
      toast.success('Dados das parcelas salvos.');
      onSaved?.(res.data);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || 'Erro ao salvar parcelas');
    } finally {
      setSaving(false);
    }
  };

  if (n <= 1) return null;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {hint ? <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
      {phaseReleased && editable && !parallelFlow ? (
        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5">
          Parcela com o financeiro: só é possível editar parcelas ainda em &quot;Anexar boleto&quot;.
        </p>
      ) : null}
      {phaseReleased && parallelFlow ? (
        <p className="text-xs text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-md px-2.5 py-1.5">
          Todos os boletos já estão anexados. Anexe os comprovantes na seção &quot;Comprovantes por parcela&quot; abaixo.
        </p>
      ) : null}
      {Array.from({ length: n }, (_, i) => {
        const row = rows[i] ?? buildInitialRows(order)[i];
        const stored = storedRows[i];
        const instRow: BoletoInstallmentRow = stored
          ? { ...draftToRow(row), ...stored }
          : parsedRows[i] ?? draftToRow(row);
        const st = rowStatus(instRow);
        const locked = st === 'PAID' || st === 'AWAITING_PAYMENT';
        const rowEditable =
          editable && !locked && !phaseReleased && st === 'PENDING_BOLETO' && !parallelFlow;
        const fileEditable = rowEditable;
        const amount = parseMoneyInput(row?.amount ?? '');
        const statusClass =
          st === 'PAID'
            ? 'text-emerald-600 dark:text-emerald-400'
            : st === 'AWAITING_PAYMENT'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-gray-600 dark:text-gray-400';
        const proofHref =
          (instRow?.installmentProofUrl || '').trim() ||
          (st === 'PAID' && orderProofUrl ? orderProofUrl : '');
        const proofName =
          instRow?.installmentProofName?.trim() ||
          (proofHref === orderProofUrl && orderProofName ? orderProofName : '');
        const boletoHref = (row?.boletoUrl || '').trim();

        return (
          <div
            key={i}
            className="rounded-md border border-gray-200/80 dark:border-gray-600/80 bg-white/40 dark:bg-gray-950/30 px-2.5 py-2 space-y-1.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                Parcela {romanParcelLabel(i)}
              </span>
              <span className={`text-xs font-medium ${statusClass}`}>{installmentStatusLabel(st)}</span>
              {editable && activeIdx === i && !phaseReleased ? (
                <span className="text-[10px] text-violet-600 dark:text-violet-400">(parcela atual)</span>
              ) : null}
            </div>

            <div className="text-xs sm:text-sm space-y-1.5 pl-0.5">
              {rowEditable ? (
                <>
                  <label className="block">
                    <span className="text-gray-500 dark:text-gray-400">Valor:</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row?.amount ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, amount: v } : r)));
                      }}
                      className="mt-0.5 w-full max-w-[200px] px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                      placeholder="0,00"
                    />
                  </label>
                  <label className="block">
                    <span className="text-gray-500 dark:text-gray-400">Vencimento:</span>
                    <input
                      type="date"
                      value={row?.dueDate ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, dueDate: v } : r)));
                      }}
                      className="mt-0.5 w-full max-w-[200px] px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-gray-500 dark:text-gray-400 shrink-0">Valor:</span>
                    <span className="text-gray-800 dark:text-gray-200 font-medium">
                      {formatMoneyDisplay(amount ?? instRow?.amount)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-gray-500 dark:text-gray-400 shrink-0">Vencimento:</span>
                    <span className="text-gray-800 dark:text-gray-200">
                      {formatDueDateBr(row?.dueDate || instRow?.dueDate)}
                    </span>
                  </div>
                </>
              )}

              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-gray-500 dark:text-gray-400 shrink-0">Boleto:</span>
                {boletoHref && !fileEditable ? (
                  <OcAttachmentActions
                    url={boletoHref}
                    fileName={row?.boletoName?.trim() || `Boleto parcela ${romanParcelLabel(i)}`}
                    icon={Banknote}
                  />
                ) : boletoHref && fileEditable ? (
                  <div className="flex flex-col gap-1 w-full">
                    <OcAttachmentActions
                      url={boletoHref}
                      fileName={row?.boletoName?.trim() || `Boleto parcela ${romanParcelLabel(i)}`}
                      icon={Banknote}
                    />
                    <label className="inline-flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 cursor-pointer w-fit">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 font-medium">
                        <Banknote className="w-3.5 h-3.5" />
                        Substituir arquivo
                      </span>
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        disabled={row?.uploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          void uploadForIndex(i, file);
                        }}
                      />
                    </label>
                  </div>
                ) : fileEditable ? (
                  <label className="inline-flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 cursor-pointer">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 font-medium">
                      <Banknote className="w-3.5 h-3.5" />
                      Escolher arquivo
                    </span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      disabled={row?.uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        void uploadForIndex(i, file);
                      }}
                    />
                    {row?.uploading ? (
                      <span className="text-gray-500 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Enviando…
                      </span>
                    ) : null}
                  </label>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">Não anexado</span>
                )}
              </div>

              {showComprovante ? (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="text-gray-500 dark:text-gray-400 shrink-0">Comprovante:</span>
                  {proofHref ? (
                    <OcAttachmentActions
                      url={proofHref}
                      fileName={proofName || `Comprovante parcela ${romanParcelLabel(i)}`}
                      icon={Receipt}
                    />
                  ) : (
                    <span className="text-gray-400 dark:text-gray-500">—</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {editable ? (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Salvando…
              </>
            ) : (
              'Salvar parcelas'
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Remonta o estado interno quando os dados da OC mudam (evita loop de useEffect). */
export function BoletoParcelasList(props: BoletoParcelasListProps) {
  return <BoletoParcelasListInner key={installmentsStateKey(props.order)} {...props} />;
}
