'use client';

// Página padrão de entrada para todos os usuários autenticados (home minimalista).
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function HomePage() {
  const router = useRouter();
  const [now, setNow] = useState<Date>(() => new Date());

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const firstName = (user?.name || 'Usuário').split(' ')[0] || 'Usuário';

  const greeting = getGreeting(now);

  const formattedDate = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    return capitalizeFirst(formatter.format(now));
  }, [now]);

  const formattedTime = useMemo(() => {
    return now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [now]);

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden">
        {/* Decoração de fundo: glow vermelho suave que segue o tema do app */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/3 h-[520px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-3xl dark:bg-red-500/15" />
          <div className="absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-400/10 blur-2xl dark:bg-red-500/10" />
        </div>

        <div className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-3xl flex-col items-center justify-center px-4 text-center">
          {/* Logo */}
          <div className="animate-home-fade-in mb-10">
            <img
              src="/loogo.png"
              alt="Gennesis"
              className="h-20 w-20 rounded-2xl object-cover opacity-95 shadow-sm sm:h-24 sm:w-24"
            />
          </div>

          {/* Saudação principal */}
          <section className="animate-home-fade-in">
            <p className="text-sm font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400 sm:text-base">
              {greeting}
            </p>
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-6xl">
              <span className="text-red-600 dark:text-red-500">{firstName}</span>
              <span className="text-gray-900 dark:text-gray-100">!</span>
            </h1>
          </section>

          {/* Subtítulo de boas-vindas */}
          <p className="animate-home-slide-up mt-6 max-w-md text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg">
            Bem-vindo de volta ao seu painel. Que seja um dia produtivo.
          </p>

          {/* Linha divisória sutil */}
          <div className="animate-home-slide-up mt-10 h-px w-16 bg-gray-200 dark:bg-gray-700" />

          {/* Hora acima · Data abaixo */}
          <div className="animate-home-slide-up mt-8 flex flex-col items-center gap-1">
            <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
              {formattedTime}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 sm:text-base">
              {formattedDate}
            </span>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
