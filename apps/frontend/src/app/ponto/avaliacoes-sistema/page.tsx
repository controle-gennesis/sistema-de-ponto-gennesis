'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Heart, Loader2, MessageSquare, Star, ThumbsUp, X, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';

type AvaliacaoItem = {
  id: string;
  userName: string;
  userEmail: string;
  rating: number;
  likes: string[];
  comment: string;
  page: string;
  createdAt: string;
};

type AvaliacoesData = {
  resumo: {
    respostas: number;
    dispensas: number;
    media: number | null;
    distribuicao: Record<string, number>;
    curtidas: Array<{ item: string; total: number }>;
  };
  itens: AvaliacaoItem[];
};

const COR_NOTA: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-amber-400',
  4: 'bg-lime-500',
  5: 'bg-green-500',
};

function Estrelas({ nota, tamanho = 'h-4 w-4' }: { nota: number; tamanho?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${tamanho} ${
            n <= nota
              ? 'fill-amber-400 text-amber-400'
              : 'fill-transparent text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
    </span>
  );
}

function CartaoSecao({
  titulo,
  subtitulo,
  Icone,
  acoes,
  children,
}: {
  titulo: string;
  subtitulo: string;
  Icone: LucideIcon;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <div className={`${cadastroListClasses.cardHeaderIconRow} ${acoes ? 'flex-wrap justify-between gap-y-4' : ''}`}>
         <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
            <Icone className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
              {titulo}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{subtitulo}</p>
          </div>
         </div>
         {acoes}
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>{children}</CardContent>
    </Card>
  );
}

function formatarDataHora(iso: string): string {
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm');
  } catch {
    return '—';
  }
}

function AvaliacoesConteudo() {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [nota, setNota] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['app-feedback-admin', de, ate, nota],
    queryFn: async () => {
      const res = await api.get('/app-feedback/admin', {
        params: { from: de || undefined, to: ate || undefined, rating: nota || undefined },
      });
      return res.data?.data as AvaliacoesData;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" aria-hidden />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
        Não foi possível carregar as avaliações. Tente novamente em instantes.
      </p>
    );
  }

  const { resumo, itens } = data;
  const maxNota = Math.max(1, ...Object.values(resumo.distribuicao));
  const maxCurtida = Math.max(1, ...resumo.curtidas.map((c) => c.total));
  const filtrando = Boolean(de || ate || nota);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        <FilterStatCard
          label="Nota média"
          count={resumo.media != null ? resumo.media.toLocaleString('pt-BR') : '—'}
          icon={Star}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
          subtitle="De 1 a 5 estrelas"
        />
        <FilterStatCard
          label="Avaliações"
          count={resumo.respostas}
          icon={MessageSquare}
          iconBg="bg-blue-100 dark:bg-blue-900/30"
          iconColor="text-blue-600 dark:text-blue-400"
          subtitle={`${itens.filter((i) => i.comment).length} com comentário`}
        />
        <FilterStatCard
          label="Dispensaram"
          count={resumo.dispensas}
          icon={X}
          iconBg="bg-gray-100 dark:bg-gray-700"
          iconColor="text-gray-600 dark:text-gray-300"
          subtitle="Fecharam o balão sem avaliar"
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <CartaoSecao titulo="Distribuição das notas" subtitulo="Quantas pessoas deram cada nota" Icone={Star}>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map((n) => {
              const total = resumo.distribuicao[String(n)] ?? 0;
              const pct = resumo.respostas ? Math.round((total / resumo.respostas) * 100) : 0;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(nota === n ? 0 : n)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                    nota === n ? 'bg-gray-50 ring-1 ring-red-300 dark:bg-gray-800/60' : ''
                  }`}
                  title="Filtrar por esta nota"
                >
                  <span className="flex w-20 shrink-0 items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {n} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                  </span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <span
                      className={`block h-full rounded-full ${COR_NOTA[n]}`}
                      style={{ width: `${(total / maxNota) * 100}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                    {total} · {pct}%
                  </span>
                </button>
              );
            })}
          </div>
        </CartaoSecao>

        <CartaoSecao titulo="O que mais curtem" subtitulo="Itens marcados pelas pessoas que avaliaram" Icone={Heart}>
          {resumo.curtidas.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Ninguém marcou itens ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {resumo.curtidas.map((c) => (
                <div key={c.item} className="flex items-center gap-3 px-2">
                  <span className="w-40 shrink-0 truncate text-sm font-medium text-gray-700 dark:text-gray-200" title={c.item}>
                    {c.item}
                  </span>
                  <span className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                    <span
                      className="block h-full rounded-full bg-red-500"
                      style={{ width: `${(c.total / maxCurtida) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
                    {c.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CartaoSecao>
      </div>

      <CartaoSecao
        titulo="Respostas"
        subtitulo={`${itens.length} ${itens.length === 1 ? 'avaliação' : 'avaliações'}${filtrando ? ' no filtro atual' : ''}`}
        Icone={ThumbsUp}
        acoes={
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">De</span>
            <DatePickerField value={de} onChange={setDe} placeholder="dd/mm/aaaa" noFocusRing className="w-full" aria-label="Período inicial" />
          </div>
          <div className="w-44">
            <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">Até</span>
            <DatePickerField value={ate} onChange={setAte} placeholder="dd/mm/aaaa" noFocusRing className="w-full" aria-label="Período final" />
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400">Nota</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNota(nota === n ? 0 : n)}
                  className={`inline-flex h-10 min-w-[2.5rem] items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold transition-colors ${
                    nota === n
                      ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {n}
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                </button>
              ))}
            </div>
          </div>
          {filtrando ? (
            <button
              type="button"
              onClick={() => {
                setDe('');
                setAte('');
                setNota(0);
              }}
              className="h-10 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar
            </button>
          ) : null}
        </div>
        }
      >
        {itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma avaliação {filtrando ? 'neste filtro' : 'ainda'}.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {itens.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:gap-6">
                <div className="sm:w-60 sm:shrink-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{a.userName}</p>
                  {a.userEmail ? (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={a.userEmail}>
                      {a.userEmail}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-gray-400">{formatarDataHora(a.createdAt)}</p>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <Estrelas nota={a.rating} tamanho="h-5 w-5" />
                  {a.likes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {a.likes.map((l) => (
                        <span
                          key={l}
                          className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {a.comment ? (
                    <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-200">
                      {a.comment}
                    </p>
                  ) : null}
                  {a.page ? (
                    <p className="text-xs text-gray-400">Estava em {a.page}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CartaoSecao>
    </div>
  );
}

export default function AvaliacoesSistemaPage() {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth/login';
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/avaliacoes-sistema">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/avaliacoes-sistema">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Avaliações do sistema"
            description="O que as pessoas responderam à Gennecy: nota, o que mais curtem e comentários."
          />
          <AvaliacoesConteudo />
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
