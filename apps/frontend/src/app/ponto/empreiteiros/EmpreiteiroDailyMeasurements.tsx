'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { DatePickerField } from '@/components/ui/DatePickerField';
import api from '@/lib/api';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { TeamLivePhotoCapture, LiveGeoPhotosField, type TeamGeoPhoto } from './TeamLivePhotoCapture';

type PaymentFile = {
  url: string;
  name: string;
  key?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  capturedAt?: string;
  address?: string | null;
};

type TeamMember = {
  id?: string;
  name: string;
  role: string;
};

export type DailyMeasurement = {
  id: string;
  workDate: string;
  description: string;
  confirmedBy: string | null;
  quantity: number | null;
  unit: string | null;
  photos: PaymentFile[];
  teamPhoto: TeamGeoPhoto | null;
  workers: Array<{ id: string; teamMemberId: string | null; name: string; role: string }>;
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function formatDateBr(ymd: string) {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return ymd;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function isImageFile(file: { url: string; name?: string }) {
  const source = `${file.name || ''} ${file.url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(source) || source.includes('data:image/');
}

type FormState = {
  workDate: string;
  description: string;
  confirmedBy: string;
  workerIds: string[];
  photos: TeamGeoPhoto[];
  teamPhoto: TeamGeoPhoto | null;
};

const emptyForm = (): FormState => ({
  workDate: todayYmd(),
  description: '',
  confirmedBy: '',
  workerIds: [],
  photos: [],
  teamPhoto: null,
});

function asGeoPhotos(raw: PaymentFile[] | TeamGeoPhoto[] | undefined): TeamGeoPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const latitude = Number((item as TeamGeoPhoto).latitude);
      const longitude = Number((item as TeamGeoPhoto).longitude);
      const capturedAt = String((item as TeamGeoPhoto).capturedAt || '');
      if (
        !item?.url ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !capturedAt ||
        Number.isNaN(new Date(capturedAt).getTime())
      ) {
        return null;
      }
      return {
        url: item.url,
        name: item.name || 'foto-servico.jpg',
        key: item.key,
        latitude,
        longitude,
        accuracy: (item as TeamGeoPhoto).accuracy ?? null,
        capturedAt: new Date(capturedAt).toISOString(),
        address: (item as TeamGeoPhoto).address ?? null,
      } satisfies TeamGeoPhoto;
    })
    .filter((item): item is TeamGeoPhoto => item != null);
}

export function EmpreiteiroDailyMeasurements({
  empreiteiroId,
  team,
  canEdit,
  onPreviewPhoto,
}: {
  empreiteiroId: string;
  team: TeamMember[];
  canEdit: boolean;
  onPreviewPhoto: (url?: string | null, alt?: string) => void;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DailyMeasurement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['empreiteiro-daily-measurements', empreiteiroId],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${empreiteiroId}/daily-measurements`);
      return res.data?.data as DailyMeasurement[];
    },
  });

  const items = data ?? [];
  const teamWithId = useMemo(() => team.filter((member) => member.id), [team]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        workDate: form.workDate,
        description: form.description.trim(),
        confirmedBy: form.confirmedBy.trim() || null,
        quantity: null,
        unit: null,
        workerIds: form.workerIds,
        photos: form.photos,
        teamPhoto: form.teamPhoto,
      };
      if (editing) {
        const res = await api.patch(
          `/empreiteiros/${empreiteiroId}/daily-measurements/${editing.id}`,
          payload
        );
        return res.data;
      }
      const res = await api.post(`/empreiteiros/${empreiteiroId}/daily-measurements`, payload);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição salva');
      setFormOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['empreiteiro-daily-measurements', empreiteiroId] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível salvar a medição');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/empreiteiros/${empreiteiroId}/daily-measurements/${id}`);
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || 'Medição excluída');
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['empreiteiro-daily-measurements', empreiteiroId] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      toast.error(error.response?.data?.message || 'Não foi possível excluir');
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      workerIds: teamWithId.map((member) => member.id as string),
    });
    setFormOpen(true);
  };

  const openEdit = (item: DailyMeasurement) => {
    setEditing(item);
    setForm({
      workDate: item.workDate,
      description: item.description,
      confirmedBy: item.confirmedBy || '',
      workerIds: item.workers.map((worker) => worker.teamMemberId).filter((id): id is string => !!id),
      photos: asGeoPhotos(item.photos),
      teamPhoto: item.teamPhoto || null,
    });
    setFormOpen(true);
  };

  const toggleWorker = (id: string) => {
    setForm((prev) => ({
      ...prev,
      workerIds: prev.workerIds.includes(id)
        ? prev.workerIds.filter((current) => current !== id)
        : [...prev.workerIds, id],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Medição diária</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Relatório do que a turma fez no dia. Não mistura com notas de pagamento.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            <Plus className="h-4 w-4" />
            Novo dia
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando medições...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          Nenhum dia registrado ainda.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatDateBr(item.workDate)}
                  </p>
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{item.description}</p>
                  {item.confirmedBy ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Confirmado por: {item.confirmedBy}
                    </p>
                  ) : null}
                  {item.workers.length > 0 ? (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Quem trabalhou: {item.workers.map((worker) => worker.name).join(', ')}
                    </p>
                  ) : null}
                  {item.teamPhoto ? (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                        Foto da equipe
                      </p>
                      <button
                        type="button"
                        onClick={() => onPreviewPhoto(item.teamPhoto?.url, 'Foto da equipe')}
                        className="overflow-hidden rounded-lg"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveApiMediaUrl(item.teamPhoto.url) || item.teamPhoto.url}
                          alt="Foto da equipe"
                          className="h-20 w-28 object-cover"
                        />
                      </button>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {item.teamPhoto.address ||
                          `${item.teamPhoto.latitude.toFixed(5)}, ${item.teamPhoto.longitude.toFixed(5)}`}
                      </p>
                      <a
                        href={`https://www.google.com/maps?q=${item.teamPhoto.latitude},${item.teamPhoto.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-red-700 hover:underline dark:text-red-300"
                      >
                        Ver local no mapa
                      </a>
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(item.id)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      aria-label="Excluir medição"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              {item.photos.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.photos.map((photo, index) => {
                    const href = resolveApiMediaUrl(photo.url) || photo.url;
                    const hasGeo =
                      Number.isFinite(Number(photo.latitude)) &&
                      Number.isFinite(Number(photo.longitude)) &&
                      Boolean(photo.capturedAt);
                    if (!isImageFile(photo)) {
                      return (
                        <a
                          key={`${photo.url}-${index}`}
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-red-700 hover:underline dark:text-red-300"
                        >
                          {photo.name || 'arquivo'}
                        </a>
                      );
                    }
                    return (
                      <div
                        key={`${photo.url}-${index}`}
                        className="w-28 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <button
                          type="button"
                          onClick={() => onPreviewPhoto(photo.url, photo.name || 'Foto do serviço')}
                          className="block w-full"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={href}
                            alt={photo.name || 'Foto do serviço'}
                            className="h-16 w-full object-cover"
                          />
                        </button>
                        {hasGeo ? (
                          <p className="line-clamp-3 p-1.5 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                            {new Date(String(photo.capturedAt)).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                            })}
                            <span className="mt-0.5 block">
                              {photo.address ||
                                `${Number(photo.latitude).toFixed(5)}, ${Number(photo.longitude).toFixed(5)}`}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {formOpen ? (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <p className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {editing ? 'Editar dia' : 'Novo dia'}
          </p>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Data *</label>
              <DatePickerField value={form.workDate} onChange={(workDate) => setForm((prev) => ({ ...prev, workDate }))} />
            </div>
            <div>
              <label className={labelClass}>Quem trabalhou</label>
              {teamWithId.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Cadastre a equipe para marcar quem trabalhou neste dia.
                </p>
              ) : (
                <div className="space-y-2">
                  {teamWithId.map((member) => {
                    const id = member.id as string;
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="checkbox"
                          checked={form.workerIds.includes(id)}
                          onChange={() => toggleWorker(id)}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        <span>
                          {member.name}
                          <span className="text-gray-500 dark:text-gray-400"> · {member.role}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="pt-3">
                <label className={labelClass}>Foto da equipe</label>
                <TeamLivePhotoCapture
                  value={form.teamPhoto}
                  onChange={(teamPhoto) => setForm((prev) => ({ ...prev, teamPhoto }))}
                  disabled={!canEdit}
                  onPreview={onPreviewPhoto}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>O que fizeram *</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className={inputClass}
                placeholder="Ex.: alvenaria do 2º pavimento e chapisco da fachada"
              />
            </div>
            <div>
              <label className={labelClass}>Confirmado por</label>
              <input
                value={form.confirmedBy}
                onChange={(e) => setForm((prev) => ({ ...prev, confirmedBy: e.target.value }))}
                className={inputClass}
                placeholder="Nome do encarregado ou fiscal que validou o dia"
              />
            </div>
            <div>
              <label className={labelClass}>Fotos do serviço</label>
              <LiveGeoPhotosField
                values={form.photos}
                onChange={(photos) => setForm((prev) => ({ ...prev, photos }))}
                disabled={!canEdit}
                onPreview={onPreviewPhoto}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending || !form.workDate || !form.description.trim()}
                onClick={() => saveMutation.mutate()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar dia'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
          <p className="mb-3 text-sm text-red-800 dark:text-red-200">Excluir esta medição do dia?</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteId(null)}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteId)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
