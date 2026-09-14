'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, MapPin, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import api from '@/lib/api';

type CompanySettings = {
  id: string;
  maxDistanceMeters: number;
  defaultLatitude: number;
  defaultLongitude: number;
  geofenceEnabled: boolean;
  geofenceBlockOutside: boolean;
  geofenceRequireLocation: boolean;
};

type GeofenceForm = {
  geofenceEnabled: boolean;
  geofenceBlockOutside: boolean;
  geofenceRequireLocation: boolean;
  maxDistanceMeters: string;
  defaultLatitude: string;
  defaultLongitude: string;
};

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
        disabled
          ? 'cursor-not-allowed border-gray-200 opacity-60 dark:border-gray-700'
          : 'cursor-pointer border-gray-200 hover:border-red-300 dark:border-gray-700 dark:hover:border-red-800/60'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500"
      />
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
    }
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CompanySettings }>('/company/settings');
      return res.data?.data;
    }
  });

  useEffect(() => {
    if (!settings || form) return;
    setForm({
      geofenceEnabled: !!settings.geofenceEnabled,
      geofenceBlockOutside: settings.geofenceBlockOutside ?? true,
      geofenceRequireLocation: settings.geofenceRequireLocation ?? true,
      maxDistanceMeters: String(settings.maxDistanceMeters ?? 1000),
      defaultLatitude: String(settings.defaultLatitude ?? ''),
      defaultLongitude: String(settings.defaultLongitude ?? '')
    });
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: async (payload: GeofenceForm) => {
      await api.put('/company/settings', {
        geofenceEnabled: payload.geofenceEnabled,
        geofenceBlockOutside: payload.geofenceBlockOutside,
        geofenceRequireLocation: payload.geofenceRequireLocation,
        maxDistanceMeters: Number(payload.maxDistanceMeters),
        defaultLatitude: Number(payload.defaultLatitude.replace(',', '.')),
        defaultLongitude: Number(payload.defaultLongitude.replace(',', '.'))
      });
    },
    onSuccess: () => {
      toast.success('Configurações de ponto atualizadas.');
      void queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar configurações.');
    }
  });

  const useCurrentPosition = () => {
    if (!navigator.geolocation) {
      toast.error('Este navegador não oferece geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) =>
          prev
            ? {
                ...prev,
                defaultLatitude: position.coords.latitude.toFixed(6),
                defaultLongitude: position.coords.longitude.toFixed(6)
              }
            : prev
        );
        toast.success('Coordenadas preenchidas com a sua posição atual.');
      },
      () => toast.error('Não foi possível obter sua localização.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    const radius = Number(form.maxDistanceMeters);
    const latitude = Number(form.defaultLatitude.replace(',', '.'));
    const longitude = Number(form.defaultLongitude.replace(',', '.'));

    if (form.geofenceEnabled) {
      if (!Number.isFinite(radius) || radius < 10) {
        toast.error('Informe um raio de no mínimo 10 metros.');
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

          <Card className="mx-auto max-w-3xl">
            <CardHeader className="border-b border-gray-200 p-6 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-100 p-3 dark:bg-red-900/30">
                  <ShieldCheck className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Confirmação de presença por geolocalização
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Compara a posição do celular no momento da batida com o local autorizado.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
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

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Raio permitido (metros)
                      </label>
                      <input
                        value={form.maxDistanceMeters}
                        onChange={(e) => setForm({ ...form, maxDistanceMeters: e.target.value })}
                        inputMode="numeric"
                        disabled={!form.geofenceEnabled}
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Latitude da base
                      </label>
                      <input
                        value={form.defaultLatitude}
                        onChange={(e) => setForm({ ...form, defaultLatitude: e.target.value })}
                        inputMode="decimal"
                        disabled={!form.geofenceEnabled}
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Longitude da base
                      </label>
                      <input
                        value={form.defaultLongitude}
                        onChange={(e) => setForm({ ...form, defaultLongitude: e.target.value })}
                        inputMode="decimal"
                        disabled={!form.geofenceEnabled}
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={useCurrentPosition}
                    disabled={!form.geofenceEnabled}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Crosshair className="h-4 w-4" />
                    Usar minha localização atual
                  </button>

                  <div className="flex gap-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-900/40">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Funcionários com locais autorizados próprios cadastrados são validados contra
                      esses locais e seus respectivos raios. A base acima vale para quem não tem
                      locais específicos.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="w-full rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? 'Salvando...' : 'Salvar configurações'}
                  </button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
