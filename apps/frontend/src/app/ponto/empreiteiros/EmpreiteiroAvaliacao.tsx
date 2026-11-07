'use client';

import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';

export type ReviewSummary = {
  count: number;
  average: number | null;
  price: number | null;
  deadline: number | null;
  payment: number | null;
};

export type ServiceReviewItem = {
  id: string;
  serviceId: string;
  serviceName: string;
  priceRating: number;
  deadlineRating: number;
  paymentRating: number;
  average: number;
  comment: string | null;
  reviewedByName: string | null;
  updatedAt: string;
};

type ReviewsResponse = { itens: ServiceReviewItem[]; summary: ReviewSummary };

const CRITERIOS = [
  { key: 'priceRating', rotulo: 'Preço', resumo: 'price' },
  { key: 'deadlineRating', rotulo: 'Prazo', resumo: 'deadline' },
  { key: 'paymentRating', rotulo: 'Pagamento', resumo: 'payment' },
] as const;

export const formatNota = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Avaliações dos serviços de uma empreita (com as médias). */
export function useEmpreiteiroReviews(empreiteiroId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['empreiteiro-reviews', empreiteiroId],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${empreiteiroId}/reviews`);
      return (res.data?.data ?? { itens: [], summary: { count: 0, average: null, price: null, deadline: null, payment: null } }) as ReviewsResponse;
    },
    enabled: Boolean(empreiteiroId) && enabled,
    staleTime: 30_000,
  });
}

/** Médias de todas as empreitas (lista e ranking). */
export function useReviewsSummaryByEmpreiteiro() {
  return useQuery({
    queryKey: ['empreiteiro-reviews-summary'],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/reviews/summary');
      return (res.data?.data ?? {}) as Record<string, ReviewSummary>;
    },
    staleTime: 60_000,
  });
}

/** Estrelas só para exibir (aceita meia estrela visual por arredondamento da média). */
export function StarsDisplay({ value, size = 'h-4 w-4' }: { value: number | null | undefined; size?: string }) {
  const nota = value ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={value == null ? 'Sem avaliação' : `${formatNota(value)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const cheia = nota >= i - 0.25;
        const meia = !cheia && nota >= i - 0.75;
        return (
          <span key={i} className={`relative inline-block ${size}`}>
            <Star className={`absolute inset-0 ${size} text-gray-300 dark:text-gray-600`} />
            {cheia || meia ? (
              <span className="absolute inset-0 overflow-hidden" style={{ width: cheia ? '100%' : '50%' }}>
                <Star className={`${size} fill-amber-400 text-amber-400`} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

function StarsInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  const ativo = hover || value;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            aria-label={`${label}: ${i} ${i === 1 ? 'estrela' : 'estrelas'}`}
            className="rounded p-0.5 transition-transform hover:scale-110"
          >
            <Star className={`h-7 w-7 ${i <= ativo ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Modal para avaliar (ou reavaliar) um serviço concluído. */
export function ReviewServiceModal({
  empreiteiroId,
  serviceId,
  serviceName,
  onClose,
}: {
  empreiteiroId: string;
  serviceId: string | null;
  serviceName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useEmpreiteiroReviews(empreiteiroId, Boolean(serviceId));
  const existente = data?.itens.find((r) => r.serviceId === serviceId);
  const [notas, setNotas] = useState({ priceRating: 0, deadlineRating: 0, paymentRating: 0 });
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    if (!serviceId) return;
    setNotas({
      priceRating: existente?.priceRating ?? 0,
      deadlineRating: existente?.deadlineRating ?? 0,
      paymentRating: existente?.paymentRating ?? 0,
    });
    setComentario(existente?.comment ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, existente?.id]);

  const salvar = useMutation({
    mutationFn: async () => {
      const res = await api.put(`/empreiteiros/${empreiteiroId}/contracts/${serviceId}/review`, {
        ...notas,
        comment: comentario.trim() || null,
      });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Avaliação salva');
      void queryClient.invalidateQueries({ queryKey: ['empreiteiro-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['empreiteiro-reviews-summary'] });
      // O serviço "Avaliar" passa a "Concluído": recarrega a empreita.
      void queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      onClose();
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível salvar a avaliação');
    },
  });

  const completo = notas.priceRating > 0 && notas.deadlineRating > 0 && notas.paymentRating > 0;

  return (
    <Modal isOpen={Boolean(serviceId)} onClose={onClose} title={`Avaliar serviço · ${serviceName}`} size="md">
      <div className="space-y-5">
        <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          {CRITERIOS.map((c) => (
            <StarsInput
              key={c.key}
              label={c.rotulo}
              value={notas[c.key]}
              onChange={(n) => setNotas((prev) => ({ ...prev, [c.key]: n }))}
            />
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Comentário (opcional)</label>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ex.: entregou antes do prazo, mas teve aditivo de valor"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!completo || salvar.isPending}
            onClick={() => salvar.mutate()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar avaliação'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Aba "Avaliações" da empreita: média por critério e histórico por serviço. */
export function EmpreiteiroReviewsPanel({ empreiteiroId }: { empreiteiroId: string }) {
  const { data, isLoading } = useEmpreiteiroReviews(empreiteiroId);
  const resumo = data?.summary;
  const itens = data?.itens ?? [];

  return (
    <Card className="w-full">
      <CardHeader className="border-b-0 pb-1">
        <div className="flex items-center space-x-3">
          <div className="rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
            <Star className="h-5 w-5 text-amber-600 sm:h-6 sm:w-6 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Avaliações</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Nota de cada serviço concluído: preço, prazo e pagamento
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <CadastroListLoading message="Carregando avaliações..." />
        ) : itens.length === 0 ? (
          <CadastroListEmpty
            icon={Star}
            title="Nenhuma avaliação ainda"
            hint="Quando um serviço for concluído, use a ação “Avaliar serviço” na aba Contratos de Serviço."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-gray-200 p-4 text-center dark:border-gray-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Geral</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatNota(resumo?.average)}</p>
                <StarsDisplay value={resumo?.average} />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {resumo?.count} {resumo?.count === 1 ? 'avaliação' : 'avaliações'}
                </p>
              </div>
              {CRITERIOS.map((c) => (
                <div key={c.key} className="rounded-xl border border-gray-200 p-4 text-center dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{c.rotulo}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatNota(resumo?.[c.resumo])}</p>
                  <StarsDisplay value={resumo?.[c.resumo]} />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {itens.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{r.serviceName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {r.reviewedByName ? `por ${r.reviewedByName} · ` : ''}
                        {new Date(r.updatedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StarsDisplay value={r.average} />
                      <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">{formatNota(r.average)}</span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 dark:text-gray-300">
                    <span>Preço <strong>{r.priceRating}</strong>/5</span>
                    <span>Prazo <strong>{r.deadlineRating}</strong>/5</span>
                    <span>Pagamento <strong>{r.paymentRating}</strong>/5</span>
                  </div>
                  {r.comment ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">“{r.comment}”</p> : null}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
