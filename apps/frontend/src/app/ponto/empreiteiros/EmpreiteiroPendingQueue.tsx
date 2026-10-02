'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  ImageIcon,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import type { DailyMeasurement } from './EmpreiteiroDailyMeasurements';
import type { TeamGeoPhoto } from './TeamLivePhotoCapture';

type PendingItem = DailyMeasurement & {
  empreiteiroId: string;
  empreiteiro: {
    id: string;
    name: string;
    specialty: string;
    contratoNome: string;
  };
};

export type PendingMeasurementItem = PendingItem;

function formatDateBr(ymd: string) {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatWeekdayBr(ymd: string) {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' });
}

function isImageFile(file: { url: string; name?: string }) {
  const source = `${file.name || ''} ${file.url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(source) || source.includes('data:image/');
}

function formatMoney(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function phaseHeadline(
  phase: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL',
  count: number,
  loading: boolean,
) {
  if (loading) return 'Carregando medições…';
  if (phase === 'APPROVED') {
    return count === 0
      ? 'Nenhuma medição aprovada'
      : count === 1
        ? '1 medição aprovada'
        : `${count} medições aprovadas`;
  }
  if (phase === 'REJECTED') {
    return count === 0
      ? 'Nenhuma medição devolvida'
      : count === 1
        ? '1 medição devolvida'
        : `${count} medições devolvidas`;
  }
  if (phase === 'ALL') {
    return count === 0 ? 'Nenhuma medição' : count === 1 ? '1 medição' : `${count} medições`;
  }
  return count === 0
    ? 'Nenhuma entrega aguardando aprovação'
    : `${count} entrega${count === 1 ? '' : 's'} aguardando aprovação`;
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-100 dark:focus:border-red-500';

function PhotoThumb({
  url,
  alt,
  badge,
  caption,
  mapHref,
  onClick,
}: {
  url: string;
  alt: string;
  badge?: string;
  caption?: string | null;
  mapHref?: string | null;
  onClick: () => void;
}) {
  const src = resolveApiMediaUrl(url) || url;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-24 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:border-red-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-red-800"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-24 w-full object-cover" />
      {badge ? (
        <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
      {caption || mapHref ? (
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1.5 pt-4 text-[10px] text-white">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{caption || 'Ver mapa'}</span>
        </span>
      ) : null}
    </button>
  );
}

export function EmpreiteiroPendingQueue({
  onPreviewPhoto,
  items: itemsProp,
  isLoading: loadingProp,
  phase = 'PENDING',
}: {
  onPreviewPhoto: (url?: string | null, alt?: string) => void;
  items?: PendingItem[];
  isLoading?: boolean;
  phase?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
}) {
  const queryClient = useQueryClient();
  const [returnId, setReturnId] = useState<{
    empreiteiroId: string;
    measurementId: string;
  } | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [approveTarget, setApproveTarget] = useState<PendingItem | null>(null);
  const [approveAmount, setApproveAmount] = useState('');

  const { data, isLoading: queryLoading } = useQuery({
    queryKey: ['empreiteiro-daily-measurements-pending'],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/daily-measurements/pending');
      return (res.data?.data || []) as PendingItem[];
    },
    enabled: itemsProp == null,
  });

  const items = itemsProp ?? data ?? [];
  const isLoading = loadingProp ?? (itemsProp == null && queryLoading);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['empreiteiro-daily-measurements-pending'] });
    void queryClient.invalidateQueries({ queryKey: ['empreiteiro-daily-measurements'] });
    void queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
  };

  const approveMutation = useMutation({
    mutationFn: async ({
      item,
      executedAmount,
    }: {
      item: PendingItem;
      executedAmount?: number;
    }) => {
      const empreiteiroId = item.empreiteiroId || item.empreiteiro.id;
      const res = await api.post(
        `/empreiteiros/${empreiteiroId}/daily-measurements/${item.id}/approve`,
        executedAmount != null && executedAmount > 0 ? { executedAmount } : {}
      );
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição aprovada');
      setApproveTarget(null);
      setApproveAmount('');
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível aprovar');
    },
  });

  const returnMutation = useMutation({
    mutationFn: async ({
      empreiteiroId,
      measurementId,
      note,
    }: {
      empreiteiroId: string;
      measurementId: string;
      note: string;
    }) => {
      const res = await api.post(
        `/empreiteiros/${empreiteiroId}/daily-measurements/${measurementId}/return`,
        { correctionNote: note }
      );
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição devolvida');
      setReturnId(null);
      setReturnNote('');
      invalidate();
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível devolver');
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {phaseHeadline(phase, items.length, isLoading)}
        </p>
        {phase === 'PENDING' || phase === 'ALL' ? (
          <p className="mt-0.5 text-xs text-gray-500">
            Ao aprovar, informe o valor da baixa — ele vai para a próxima parcela do contrato.
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800/60"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-600">
          <div className="mb-3 rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-950/40">
            <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {phase === 'APPROVED'
              ? 'Nenhuma aprovada'
              : phase === 'REJECTED'
                ? 'Nenhuma devolvida'
                : phase === 'ALL'
                  ? 'Nenhuma medição'
                  : 'Fila limpa'}
          </p>
          <p className="mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
            {phase === 'PENDING'
              ? 'Quando a empreita enviar uma entrega, ela aparece aqui para você revisar.'
              : 'Nada neste filtro.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const weekday = formatWeekdayBr(item.workDate);
            const servicePhotos = (item.photos || []).filter((photo) => isImageFile(photo));
            const teamPhoto = item.teamPhoto as TeamGeoPhoto | null;
            const status = String(item.status || 'SUBMITTED').toUpperCase();
            const isPending = status !== 'APPROVED' && status !== 'CORRECTION';
            const executedLabel = formatMoney(item.executedAmount);
            return (
              <article
                key={item.id}
                className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/55"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                  <div className="flex shrink-0 items-center gap-3 sm:w-28 sm:flex-col sm:items-stretch">
                    <div className="rounded-2xl bg-red-50 px-3 py-2.5 text-center dark:bg-red-950/40 sm:w-full">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700/80 dark:text-red-300/80">
                        {weekday || 'Dia'}
                      </p>
                      <p className="text-sm font-bold leading-tight text-red-800 dark:text-red-200">
                        {formatDateBr(item.workDate)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : status === 'CORRECTION'
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-300'
                      }`}
                    >
                      <Clock3 className="h-3.5 w-3.5" />
                      {status === 'APPROVED' ? 'Aprovada' : status === 'CORRECTION' ? 'Devolvida' : 'Enviado'}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
                          {item.empreiteiro.name}
                          {item.contratoNome || item.empreiteiro.contratoNome
                            ? ` · ${item.contratoNome || item.empreiteiro.contratoNome}`
                            : ''}
                        </p>
                        <h4 className="mt-1 text-base font-semibold leading-snug text-gray-900 dark:text-gray-50">
                          {item.description}
                        </h4>
                        {status === 'APPROVED' && executedLabel ? (
                          <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            Baixa {executedLabel}
                            {item.approvedBy ? ` · aprovado por ${item.approvedBy}` : ''}
                          </p>
                        ) : null}
                        {status === 'CORRECTION' && item.correctionNote ? (
                          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                            {item.correctionNote}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.confirmedBy ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                <span className="font-semibold">Confirmado por:</span>{' '}
                                {item.confirmedBy}
                              </span>
                            </span>
                          ) : null}
                          {item.workers.length > 0 ? (
                            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              <Users className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">
                                <span className="font-semibold">Equipe:</span>{' '}
                                {item.workers.map((worker) => worker.name).join(', ')}
                              </span>
                            </span>
                          ) : null}
                          {item.empreiteiro.specialty ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                <span className="font-semibold">Especialidade:</span>{' '}
                                {item.empreiteiro.specialty}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {isPending ? (
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={approveMutation.isPending}
                          onClick={() => {
                            setApproveTarget(item);
                            setApproveAmount('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={returnMutation.isPending}
                          onClick={() => {
                            setReturnId({
                              empreiteiroId: item.empreiteiroId || item.empreiteiro.id,
                              measurementId: item.id,
                            });
                            setReturnNote('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Devolver
                        </button>
                      </div>
                      ) : null}
                    </div>

                    {(teamPhoto || servicePhotos.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {teamPhoto ? (
                          <PhotoThumb
                            url={teamPhoto.url}
                            alt="Foto da equipe"
                            badge="Equipe"
                            onClick={() => onPreviewPhoto(teamPhoto.url, 'Foto da equipe')}
                            caption={
                              teamPhoto.address ||
                              `${Number(teamPhoto.latitude).toFixed(5)}, ${Number(teamPhoto.longitude).toFixed(5)}`
                            }
                            mapHref={mapsUrl(
                              Number(teamPhoto.latitude),
                              Number(teamPhoto.longitude)
                            )}
                          />
                        ) : null}
                        {servicePhotos.slice(0, 4).map((photo, index) => (
                          <PhotoThumb
                            key={`${photo.url}-${index}`}
                            url={photo.url}
                            alt={photo.name || 'Foto do serviço'}
                            badge={index === 0 ? 'Serviço' : undefined}
                            onClick={() =>
                              onPreviewPhoto(photo.url, photo.name || 'Foto do serviço')
                            }
                          />
                        ))}
                        {servicePhotos.length > 4 ? (
                          <span className="inline-flex h-24 w-16 items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs font-semibold text-gray-500 dark:border-gray-600">
                            +{servicePhotos.length - 4}
                            <ImageIcon className="ml-0.5 h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {approveTarget ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Aprovar e dar baixa
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Informe o valor da baixa. Ele vai para a próxima parcela (libera e atualiza o
              valor).
            </p>
            <label className="mt-3 mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Valor executado (R$) *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={approveAmount}
              onChange={(e) => setApproveAmount(maskCurrencyInputBrOrEmpty(e.target.value))}
              placeholder="R$ 0,00"
              className={inputClass}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setApproveTarget(null);
                  setApproveAmount('');
                }}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={approveMutation.isPending || !parseCurrencyInputBr(approveAmount)}
                onClick={() => {
                  const amount = parseCurrencyInputBr(approveAmount);
                  if (!amount || amount <= 0) {
                    toast.error('Informe o valor executado da entrega');
                    return;
                  }
                  approveMutation.mutate({
                    item: approveTarget,
                    executedAmount: amount,
                  });
                }}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {approveMutation.isPending ? 'Salvando…' : 'Aprovar e dar baixa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {returnId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Devolver para correção
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Explique o que falta para a empreita ajustar e reenviar.
            </p>
            <textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              rows={4}
              className={`${inputClass} mt-3`}
              placeholder="Ex.: falta foto da fachada e confirmar quem trabalhou"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnId(null);
                  setReturnNote('');
                }}
                className="rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={returnMutation.isPending || !returnNote.trim()}
                onClick={() =>
                  returnMutation.mutate({
                    empreiteiroId: returnId.empreiteiroId,
                    measurementId: returnId.measurementId,
                    note: returnNote.trim(),
                  })
                }
                className="rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {returnMutation.isPending ? 'Devolvendo…' : 'Devolver'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
