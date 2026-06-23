'use client';

import React, { useMemo, useState } from 'react';
import { Banknote, Loader2, Receipt, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import {
  buyerActiveInstallmentIndex,
  canSendCurrentBoletoToPayment,
  hasAwaitingInstallmentPayment,
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
  redistributeInstallmentAmounts,
  parseOrderTotalAmount,
  validateInstallmentAmountsSum,
  type BoletoParcelasOrderFields,
  type RowDraft
} from '@/components/oc/boletoParcelasUtils';
import { maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';

export type BoletoParcelasListProps = {
  order: BoletoParcelasOrderFields & { id: string; orderNumber?: string };
  /** Exibe linha de comprovante (histórico / fase pagamento). */
  showComprovante?: boolean;
  /** Permite editar valor, vencimento e anexo nas parcelas liberadas. */
  editable?: boolean;
  /** Texto auxiliar acima da lista. */
  hint?: string;
  onSaved?: (payload: { data: unknown }) => void;
  /** Após salvar o boleto da parcela atual, envia a OC para a fase Pagamento. */
  onReleaseToPayment?: (orderId: string) => void;
  releasePending?: boolean;
  className?: string;
};

function BoletoParcelasListInner({
  order,
  showComprovante = false,
  editable = false,
  hint,
  onSaved,
  onReleaseToPayment,
  releasePending = false,
  className = ''
}: BoletoParcelasListProps) {
  const n = order.paymentParcelCount ?? 1;
  const [rows, setRows] = useState<RowDraft[]>(() => buildInitialRows(order));
  const [saving, setSaving] = useState(false);
  const [persistedOrder, setPersistedOrder] = useState<
    (BoletoParcelasOrderFields & { id: string }) | null
  >(null);

  const phaseReleased = order.paymentBoletoPhaseReleased === true;
  const financeHasCurrentParcel = hasAwaitingInstallmentPayment({
    status: 'APPROVED',
    paymentType: 'BOLETO',
    paymentParcelCount: order.paymentParcelCount,
    paymentBoletoInstallments: order.paymentBoletoInstallments,
    paymentBoletoPhaseReleased: order.paymentBoletoPhaseReleased
  });
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
  const orderTotal = useMemo(() => parseOrderTotalAmount(order), [order.amountToPay]);

  const isRowLocked = (index: number, st: ReturnType<typeof rowStatus>) =>
    st === 'PAID' || st === 'AWAITING_PAYMENT';

  const handleAmountChange = (index: number, rawValue: string) => {
    const masked = maskCurrencyInputBrOrEmpty(rawValue);
    setRows((prev) => {
      const locked =
        n <= 1
          ? [false]
          : prev.map((r, j) => {
              const st = rowStatus(draftToRow(r));
              return isRowLocked(j, st);
            });

      const { rows: next, wasCapped } =
        n <= 1
          ? redistributeInstallmentAmounts(prev, index, masked, orderTotal, locked)
          : redistributeInstallmentAmounts(prev, index, masked, orderTotal, locked);

      if (wasCapped && orderTotal > 0) {
        const lockedSum = prev.reduce((s, r, i) => {
          if (i === index || !locked[i]) return s;
          return s + (parseMoneyInput(r.amount) ?? 0);
        }, 0);
        const maxAllowed = Math.max(0, orderTotal - lockedSum);
        toast.error(
          `O valor não pode ultrapassar ${formatMoneyDisplay(maxAllowed)} (total da OC: ${formatMoneyDisplay(orderTotal)}).`
        );
      }

      return next;
    });
  };

  const amountValidation = useMemo(
    () => validateInstallmentAmountsSum(rows, orderTotal),
    [rows, orderTotal]
  );

  const canSave = useMemo(() => {
    if (!editable || activeIdx == null) return false;
    if (!amountValidation.valid) return false;
    const active = rows[activeIdx];
    if (!active || parseMoneyInput(active.amount) == null || !(active.dueDate ?? '').trim()) {
      return false;
    }
    return !!(active.boletoUrl || '').trim();
  }, [rows, editable, activeIdx, amountValidation.valid]);

  const orderForRelease = persistedOrder ?? order;
  const showReleaseButton =
    !!onReleaseToPayment &&
    canSendCurrentBoletoToPayment({
      status: 'APPROVED',
      paymentType: 'BOLETO',
      paymentParcelCount: orderForRelease.paymentParcelCount,
      paymentBoletoInstallments: orderForRelease.paymentBoletoInstallments,
      paymentBoletoUrl: (orderForRelease as { paymentBoletoUrl?: string | null }).paymentBoletoUrl,
      boletoAttachmentUrl: (orderForRelease as { boletoAttachmentUrl?: string | null }).boletoAttachmentUrl,
      paymentBoletoPhaseReleased: orderForRelease.paymentBoletoPhaseReleased
    }) &&
    orderForRelease.paymentBoletoPhaseReleased !== true &&
    amountValidation.valid;

  const uploadForIndex = async (index: number, file: File) => {
    if (!editable) return;
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
    if (!amountValidation.valid) {
      toast.error(amountValidation.message || 'Valores das parcelas inválidos.');
      return;
    }
    if (!editable || !canSave) {
      toast.error('Preencha valor e vencimento e anexe o boleto da parcela atual.');
      return;
    }
    const installments: BoletoInstallmentRow[] = rowsToInstallments(rows);
    setSaving(true);
    try {
      const res = await api.patch(`/purchase-orders/${order.id}/payment-boleto-installments`, {
        installments
      });
      toast.success('Boleto da parcela atual salvo.');
      const updated = (res.data as { data?: BoletoParcelasOrderFields & { id: string } })?.data;
      if (updated) setPersistedOrder(updated);
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

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {hint ? <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
      {editable && orderTotal > 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Total da OC: {formatMoneyDisplay(orderTotal)}
          {n > 1 ? ' — ao alterar uma parcela, as demais ajustam automaticamente.' : '.'}
        </p>
      ) : null}
      {!amountValidation.valid && amountValidation.message ? (
        <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md px-2.5 py-1.5">
          {amountValidation.message}
        </p>
      ) : null}
      {phaseReleased && editable && !parallelFlow && financeHasCurrentParcel ? (
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
        const isActiveParcel = activeIdx === i;
        const isFutureParcel = activeIdx != null && i > activeIdx && st === 'PENDING_BOLETO';
        const isPendingEditable = editable && !locked && st === 'PENDING_BOLETO' && !parallelFlow;
        const rowEditable = isPendingEditable;
        const fileEditable = isPendingEditable;
        const amount = parseMoneyInput(row?.amount ?? '');
        const rowAmountInvalid =
          rowEditable &&
          orderTotal > 0 &&
          (amount == null ||
            amount < 0 ||
            amount > orderTotal + 0.001 ||
            !amountValidation.valid);
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
        const boletoHref = (row?.boletoUrl || instRow?.boletoUrl || '').trim();

        return (
          <div
            key={i}
            className="rounded-md border border-gray-200/80 dark:border-gray-600/80 bg-white/40 dark:bg-gray-950/30 px-2.5 py-2 space-y-1.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {n > 1 ? `Parcela ${romanParcelLabel(i)}` : 'Boleto'}
              </span>
              <span className={`text-xs font-medium ${statusClass}`}>
                {installmentStatusLabel(st, !!boletoHref)}
              </span>
              {editable && isActiveParcel ? (
                <span className="text-[10px] text-violet-600 dark:text-violet-400">(obrigatória)</span>
              ) : null}
              {isFutureParcel ? (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">(opcional)</span>
              ) : null}
            </div>

            <div className="text-xs sm:text-sm space-y-1.5 pl-0.5">
              {rowEditable ? (
                <>
                  <label className="block">
                    <span className="text-gray-500 dark:text-gray-400">Valor:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row?.amount ?? ''}
                      onChange={(e) => handleAmountChange(i, e.target.value)}
                      className={`mt-0.5 w-full max-w-[200px] px-2 py-1 text-sm border rounded-md bg-white dark:bg-gray-800 ${
                        rowAmountInvalid
                          ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/30'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      placeholder="R$ 0,00"
                      aria-invalid={rowAmountInvalid}
                    />
                    {rowAmountInvalid && amount != null && amount > orderTotal + 0.001 ? (
                      <span className="mt-0.5 block text-[11px] text-red-600 dark:text-red-400">
                        Máximo: {formatMoneyDisplay(orderTotal)}
                      </span>
                    ) : null}
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
                    ) : isFutureParcel ? (
                      <span className="text-gray-400 dark:text-gray-500">opcional</span>
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
        <div className="pt-2 flex flex-col sm:flex-row sm:justify-end gap-2">
          {showReleaseButton ? (
            <button
              type="button"
              disabled={releasePending || saving || !amountValidation.valid}
              onClick={() => {
                if (!amountValidation.valid) {
                  toast.error(amountValidation.message || 'Valores das parcelas inválidos.');
                  return;
                }
                onReleaseToPayment?.(order.id);
              }}
              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {releasePending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  Enviar para Pagamento
                </>
              )}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canSave || saving || releasePending}
            onClick={() => void handleSave()}
            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Salvando…
              </>
            ) : (
              'Salvar parcela atual'
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
