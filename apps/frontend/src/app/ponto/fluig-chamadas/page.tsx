'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import api from '@/lib/api';

const ROTULO_ORIGEM: Record<string, string> = {
  espelho_diario: 'Rotina automática diária (espelho)',
  atualizacao_manual: 'Atualização manual do espelho',
  aquecimento_automatico: 'Aquecimento automático do cache',
  abrir_solicitacao: 'Abrir solicitação (consulta de anexos)',
  download_anexo: 'Baixar anexo',
  ver_anexo: 'Ver anexo (visualizar)',
  consulta_usuario: 'Consultas feitas pelas telas',
  outra: 'Outras',
};

const ROTULO_TIPO: Record<string, string> = {
  dataset: 'Consulta de dataset',
  busca: 'Busca em dataset',
  estrutura: 'Estrutura de dataset',
  lista_datasets: 'Lista de datasets',
  documento_url: 'Link/dados de documento',
  download_arquivo: 'Download de arquivo',
  outro: 'Outros',
};

const PERIODOS = [
  { dias: 1, rotulo: 'Hoje' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

type Resumo = {
  dias: number;
  total: number;
  comErro: number;
  porOrigem: Array<{ origem: string; total: number }>;
  porTipo: Array<{ tipo: string; total: number }>;
  porDia: Array<{ dia: string; origem: string; total: number }>;
};

type Registro = {
  id: string;
  createdAt: string;
  origem: string;
  detalhe?: string | null;
  tipo: string;
  metodo: string;
  path: string;
  datasetId?: string | null;
  status?: number | null;
  ok: boolean;
  durationMs: number;
  erro?: string | null;
};

const fmtInt = (n: number) => n.toLocaleString('pt-BR');

function TabelaContagem({ titulo, linhas }: { titulo: string; linhas: Array<{ rotulo: string; total: number }> }) {
  return (
    <Card className="w-full">
      <CardHeader className="border-b-0 pb-1">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{titulo}</h2>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma chamada no período.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {linhas.map((l) => (
                <tr key={l.rotulo} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                  <td className="py-2 pr-4 text-gray-800 dark:text-gray-200">{l.rotulo}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {fmtInt(l.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export default function FluigChamadasPage() {
  const router = useRouter();
  const [dias, setDias] = useState(30);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const resumoQuery = useQuery({
    queryKey: ['fluig-request-logs', 'summary', dias],
    queryFn: async () => {
      const res = await api.get('/fluig/request-logs/summary', { params: { days: dias } });
      return res.data?.data as Resumo;
    },
    retry: false,
  });

  const registrosQuery = useQuery({
    queryKey: ['fluig-request-logs', 'list'],
    queryFn: async () => {
      const res = await api.get('/fluig/request-logs', { params: { limit: 100 } });
      return (res.data?.data ?? []) as Registro[];
    },
    retry: false,
  });

  const resumo = resumoQuery.data;
  const semPermissao = (resumoQuery.error as { response?: { status?: number } } | null)?.response?.status === 403;

  const porDia = useMemo(() => {
    const mapa = new Map<string, { total: number; porOrigem: Record<string, number> }>();
    for (const l of resumo?.porDia ?? []) {
      const atual = mapa.get(l.dia) ?? { total: 0, porOrigem: {} };
      atual.total += l.total;
      atual.porOrigem[l.origem] = (atual.porOrigem[l.origem] ?? 0) + l.total;
      mapa.set(l.dia, atual);
    }
    return Array.from(mapa.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [resumo]);

  const hoje = porDia[0]?.[0] === new Date().toLocaleDateString('sv-SE') ? porDia[0]![1].total : 0;

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
        <ListPageHeader
          title="Chamadas ao Fluig"
          description="Registro das requisições do Conecta ao Fluig."
        />

        {semPermissao ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-gray-700 dark:text-gray-300">
              Somente administradores podem ver este registro.
            </CardContent>
          </Card>
        ) : resumoQuery.isLoading ? (
          <Loading message="Carregando registro de chamadas..." />
        ) : resumoQuery.error ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-red-600">
              Não foi possível carregar o registro de chamadas.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {PERIODOS.map((p) => (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => setDias(p.dias)}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    dias === p.dias
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Chamadas no período
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {fmtInt(resumo?.total ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Hoje
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {fmtInt(hoje)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Com erro
                  </p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-red-600">
                    {fmtInt(resumo?.comErro ?? 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <TabelaContagem
                titulo="Por origem"
                linhas={(resumo?.porOrigem ?? []).map((o) => ({
                  rotulo: ROTULO_ORIGEM[o.origem] ?? o.origem,
                  total: o.total,
                }))}
              />
              <TabelaContagem
                titulo="Por tipo de chamada"
                linhas={(resumo?.porTipo ?? []).map((t) => ({
                  rotulo: ROTULO_TIPO[t.tipo] ?? t.tipo,
                  total: t.total,
                }))}
              />
            </div>

            <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Por dia</h2>
              </CardHeader>
              <CardContent>
                {porDia.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma chamada registrada no período. O registro começa a valer a partir desta versão.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <th className="py-2 pr-4">Dia</th>
                          <th className="py-2 pr-4 text-right">Total</th>
                          <th className="py-2">Detalhe por origem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {porDia.map(([dia, info]) => (
                          <tr key={dia} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                            <td className="py-2 pr-4 tabular-nums text-gray-800 dark:text-gray-200">
                              {dia.split('-').reverse().join('/')}
                            </td>
                            <td className="py-2 pr-4 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                              {fmtInt(info.total)}
                            </td>
                            <td className="py-2 text-gray-600 dark:text-gray-400">
                              {Object.entries(info.porOrigem)
                                .sort((a, b) => b[1] - a[1])
                                .map(([o, n]) => `${ROTULO_ORIGEM[o] ?? o}: ${fmtInt(n)}`)
                                .join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Últimas 100 chamadas
                </h2>
              </CardHeader>
              <CardContent>
                {registrosQuery.isLoading ? (
                  <Loading message="Carregando..." />
                ) : (registrosQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma chamada registrada ainda.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          <th className="py-2 pr-4">Data e hora</th>
                          <th className="py-2 pr-4">Origem</th>
                          <th className="py-2 pr-4">Tipo</th>
                          <th className="py-2 pr-4">Dataset / caminho</th>
                          <th className="py-2 pr-4 text-right">Status</th>
                          <th className="py-2 text-right">Tempo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(registrosQuery.data ?? []).map((r) => (
                          <tr key={r.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                            <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-gray-800 dark:text-gray-200">
                              {new Date(r.createdAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2 pr-4 text-gray-800 dark:text-gray-200">
                              {ROTULO_ORIGEM[r.origem] ?? r.origem}
                              {r.detalhe ? (
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{r.detalhe}</span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-4 text-gray-800 dark:text-gray-200">
                              {ROTULO_TIPO[r.tipo] ?? r.tipo}
                            </td>
                            <td className="max-w-[22rem] truncate py-2 pr-4 text-gray-600 dark:text-gray-400" title={r.path}>
                              {r.datasetId || r.path}
                            </td>
                            <td
                              className={`py-2 pr-4 text-right font-semibold tabular-nums ${
                                r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                              }`}
                              title={r.erro ?? undefined}
                            >
                              {r.status ?? (r.ok ? 'OK' : 'Erro')}
                            </td>
                            <td className="whitespace-nowrap py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                              {(r.durationMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageStack>
    </MainLayout>
  );
}
