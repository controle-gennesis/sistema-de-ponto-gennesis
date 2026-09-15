'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, MapPin, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { Loading } from '@/components/ui/Loading';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import api from '@/lib/api';

type GeofenceLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  qrToken?: string | null;
};

type CompanySettings = {
  id: string;
  maxDistanceMeters: number;
  defaultLatitude: number;
  defaultLongitude: number;
  geofenceLocations?: GeofenceLocation[] | null;
  geofenceEnabled: boolean;
  geofenceBlockOutside: boolean;
  geofenceRequireLocation: boolean;
  requireFaceMatch?: boolean;
  requirePunchQr?: boolean;
};

type GeofenceForm = {
  geofenceEnabled: boolean;
  geofenceBlockOutside: boolean;
  geofenceRequireLocation: boolean;
  requireFaceMatch: boolean;
  requirePunchQr: boolean;
  locations: GeofenceLocation[];
};

type LocationDraft = {
  id: string | null;
  name: string;
  latitude: string;
  longitude: string;
  radius: string;
};

function emptyLocationDraft(): LocationDraft {
  return {
    id: null,
    name: '',
    latitude: '',
    longitude: '',
    radius: '1000',
  };
}

function seedLocations(settings: CompanySettings): GeofenceLocation[] {
  const fromJson = Array.isArray(settings.geofenceLocations)
    ? settings.geofenceLocations.filter(
        (loc) =>
          loc &&
          Number.isFinite(Number(loc.latitude)) &&
          Number.isFinite(Number(loc.longitude))
      )
    : [];
  if (fromJson.length > 0) {
    return fromJson.map((loc, index) => ({
      id: String(loc.id || `loc-${index + 1}`),
      name: String(loc.name || `Local ${index + 1}`),
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      radius: Math.max(10, Number(loc.radius) || settings.maxDistanceMeters || 1000),
      qrToken: loc.qrToken || null,
    }));
  }
  return [
    {
      id: 'company-default',
      name: 'Base da empresa',
      latitude: Number(settings.defaultLatitude),
      longitude: Number(settings.defaultLongitude),
      radius: Math.max(10, Number(settings.maxDistanceMeters) || 1000),
    },
  ];
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`group flex items-start gap-3 rounded-lg px-1 py-2 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <CheckboxIndicator checked={checked} disabled={disabled} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <span className="mt-0.5 block text-sm text-gray-600 dark:text-gray-400">{description}</span>
      </span>
    </label>
  );
}

export default function ConfiguracoesPontoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<GeofenceForm | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>(() => emptyLocationDraft());

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CompanySettings }>('/company/settings');
      return res.data?.data;
    },
  });

  useEffect(() => {
    if (!settings || form) return;
    setForm({
      geofenceEnabled: !!settings.geofenceEnabled,
      geofenceBlockOutside: settings.geofenceBlockOutside ?? true,
      geofenceRequireLocation: settings.geofenceRequireLocation ?? true,
      requireFaceMatch: !!settings.requireFaceMatch,
      requirePunchQr: !!settings.requirePunchQr,
      locations: seedLocations(settings),
    });
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: async (payload: GeofenceForm) => {
      const first = payload.locations[0];
      await api.put('/company/settings', {
        geofenceEnabled: payload.geofenceEnabled,
        geofenceBlockOutside: payload.geofenceBlockOutside,
        geofenceRequireLocation: payload.geofenceRequireLocation,
        requireFaceMatch: payload.requireFaceMatch,
        requirePunchQr: payload.requirePunchQr,
        geofenceLocations: payload.locations,
        maxDistanceMeters: first?.radius ?? 1000,
        defaultLatitude: first?.latitude,
        defaultLongitude: first?.longitude,
      });
    },
    onSuccess: () => {
      toast.success('Configurações de ponto atualizadas.');
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['company-geofence-settings'] });
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar configurações.');
    },
  });

  const openCreateLocation = () => {
    setLocationDraft(emptyLocationDraft());
    setLocationModalOpen(true);
  };

  const openEditLocation = (loc: GeofenceLocation) => {
    setLocationDraft({
      id: loc.id,
      name: loc.name,
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius: String(loc.radius),
    });
    setLocationModalOpen(true);
  };

  const closeLocationModal = () => {
    setLocationModalOpen(false);
    setLocationDraft(emptyLocationDraft());
  };

  const useCurrentPosition = () => {
    if (!navigator.geolocation) {
      toast.error('Este navegador não oferece geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationDraft((prev) => ({
          ...prev,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        toast.success('Coordenadas preenchidas com a sua posição atual.');
      },
      () => toast.error('Não foi possível obter sua localização.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveLocationDraft = () => {
    if (!form) return;
    const name = locationDraft.name.trim();
    const latitude = Number(locationDraft.latitude.replace(',', '.'));
    const longitude = Number(locationDraft.longitude.replace(',', '.'));
    const radius = Number(locationDraft.radius);

    if (!name) {
      toast.error('Informe o nome do local.');
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      toast.error('Latitude inválida.');
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      toast.error('Longitude inválida.');
      return;
    }
    if (!Number.isFinite(radius) || radius < 10) {
      toast.error('Informe um raio de no mínimo 10 metros.');
      return;
    }

    const next: GeofenceLocation = {
      id: locationDraft.id || `loc-${Date.now()}`,
      name,
      latitude,
      longitude,
      radius: Math.round(radius),
      qrToken: form.locations.find((loc) => loc.id === locationDraft.id)?.qrToken || null,
    };

    setForm({
      ...form,
      locations: locationDraft.id
        ? form.locations.map((loc) => (loc.id === locationDraft.id ? next : loc))
        : [...form.locations, next],
    });
    closeLocationModal();
  };

  const removeLocation = (id: string) => {
    if (!form) return;
    if (form.locations.length <= 1) {
      toast.error('Mantenha ao menos um local autorizado.');
      return;
    }
    setForm({ ...form, locations: form.locations.filter((loc) => loc.id !== id) });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    if (form.geofenceEnabled && form.locations.length === 0) {
      toast.error('Cadastre ao menos um local autorizado.');
      return;
    }

    saveMutation.mutate(form);
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/configuracoes-ponto">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Configurações do Ponto
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Defina se a presença das equipes deve ser confirmada por geolocalização.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <ShieldCheck className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Confirmação de presença por geolocalização
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Compara a posição do celular no momento da batida com os locais autorizados.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading || !form ? (
                <div className="py-10">
                  <Loading message="Carregando configurações..." size="md" />
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <ToggleRow
                    title="Exigir confirmação por geolocalização"
                    description="Com a opção desligada, o ponto continua podendo ser registrado de qualquer lugar."
                    checked={form.geofenceEnabled}
                    onChange={(value) => setForm({ ...form, geofenceEnabled: value })}
                  />

                  <ToggleRow
                    title="Bloquear batidas fora da área"
                    description="Ligado, a batida fora do raio é recusada. Desligado, ela é registrada e sinalizada como fora da área para conferência do gestor."
                    checked={form.geofenceBlockOutside}
                    disabled={!form.geofenceEnabled}
                    onChange={(value) => setForm({ ...form, geofenceBlockOutside: value })}
                  />

                  <ToggleRow
                    title="Exigir GPS ativo"
                    description="Recusa a batida quando o dispositivo não envia coordenadas (GPS desligado ou permissão negada)."
                    checked={form.geofenceRequireLocation}
                    disabled={!form.geofenceEnabled}
                    onChange={(value) => setForm({ ...form, geofenceRequireLocation: value })}
                  />

                  <ToggleRow
                    title="Confrontar biometria facial"
                    description="Compara a foto do ponto com a foto cadastrada no painel (Rekognition). Sem a foto do colaborador a batida é recusada."
                    checked={form.requireFaceMatch}
                    onChange={(value) => setForm({ ...form, requireFaceMatch: value })}
                  />

                  <ToggleRow
                    title="Exigir QR Code da localidade"
                    description="O colaborador só registra o ponto depois de ler o QR associado ao local de prestação do serviço."
                    checked={form.requirePunchQr}
                    onChange={(value) => setForm({ ...form, requirePunchQr: value })}
                  />

                  <div
                    className={`rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${
                      !form.geofenceEnabled ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Locais autorizados ({form.locations.length})
                      </h4>
                      <button
                        type="button"
                        disabled={!form.geofenceEnabled}
                        onClick={openCreateLocation}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar
                      </button>
                    </div>
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                      Cadastre todos os lugares em que a equipe pode bater ponto. A batida é válida se
                      estiver dentro do raio de qualquer um deles.
                    </p>

                    {form.locations.length === 0 ? (
                      <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        Nenhum local cadastrado.
                      </p>
                    ) : (
                      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                        {form.locations.map((loc) => (
                          <li
                            key={loc.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <button
                              type="button"
                              disabled={!form.geofenceEnabled}
                              onClick={() => openEditLocation(loc)}
                              className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                            >
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {loc.name}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)} · raio{' '}
                                {loc.radius} m
                                {loc.qrToken ? ` · QR gennesis-punch:${loc.qrToken}` : ''}
                              </p>
                            </button>
                            <button
                              type="button"
                              disabled={!form.geofenceEnabled}
                              onClick={() => removeLocation(loc.id)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                              aria-label={`Remover ${loc.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex gap-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Funcionários com locais autorizados próprios no cadastro continuam sendo
                      validados contra esses locais. A lista acima vale para quem não tem locais
                      específicos.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={saveMutation.isPending}
                      className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {saveMutation.isPending ? 'Salvando...' : 'Salvar configurações'}
                    </button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {locationModalOpen ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeLocationModal} />
            <div className="relative w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {locationDraft.id ? 'Editar local' : 'Adicionar local'}
                </h2>
                <button
                  type="button"
                  onClick={closeLocationModal}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nome do local
                  </label>
                  <input
                    value={locationDraft.name}
                    onChange={(e) => setLocationDraft({ ...locationDraft, name: e.target.value })}
                    placeholder="Ex.: Sede, Obra Norte, Almoxarifado"
                    className={FORM_FIELD_INPUT_CLS}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Raio permitido (metros)
                  </label>
                  <input
                    value={locationDraft.radius}
                    onChange={(e) =>
                      setLocationDraft({
                        ...locationDraft,
                        radius: e.target.value.replace(/\D/g, ''),
                      })
                    }
                    placeholder="Ex.: 1000"
                    inputMode="numeric"
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Latitude
                    </label>
                    <input
                      value={locationDraft.latitude}
                      onChange={(e) =>
                        setLocationDraft({
                          ...locationDraft,
                          latitude: e.target.value.replace(/[^\d.,-]/g, ''),
                        })
                      }
                      placeholder="Ex.: -15.83584"
                      inputMode="decimal"
                      className={FORM_FIELD_INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Longitude
                    </label>
                    <input
                      value={locationDraft.longitude}
                      onChange={(e) =>
                        setLocationDraft({
                          ...locationDraft,
                          longitude: e.target.value.replace(/[^\d.,-]/g, ''),
                        })
                      }
                      placeholder="Ex.: -47.873407"
                      inputMode="decimal"
                      className={FORM_FIELD_INPUT_CLS}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={useCurrentPosition}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  <Crosshair className="h-4 w-4" />
                  Usar minha localização atual
                </button>
              </div>
              <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={saveLocationDraft}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
                >
                  {locationDraft.id ? 'Salvar local' : 'Adicionar local'}
                </button>
                <button
                  type="button"
                  onClick={closeLocationModal}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
