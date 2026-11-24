'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Columns3,
  Download,
  ListFilter,
  Loader2,
  RefreshCw,
  Rows3,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { ListPagination } from '@/components/ui/ListPagination';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { exportBrandedExcelTable } from '@/lib/exportBrandedExcelTable';
import api from '@/lib/api';
import {
  AppSegmentedButton,
  AppSegmentedControl,
  AppUnderlineTabButton,
  AppUnderlineTabList,
} from '@/components/ui/AppTabButton';
import {
  DIMENSOES,
  exportarResumoFolhaExcel,
  montarResumoFolha,
  poloDaSecao,
  type DimensaoResumo,
  type EventoResumo,
  type ResumoDimensao,
} from '@/lib/previaFolhaResumo';

/**
 * Prévia da Folha — SOMENTE CONSULTA da consulta FOLPAG do TOTVS.
 * Nada aqui grava, edita ou exclui na folha do TOTVS. O TOTVS é lido 1x ao dia (03:30)
 * ou quando o usuário clica em Atualizar; a tela mostra a última leitura guardada no Conecta.
 */
const ROUTE = '/ponto/metricas/previa-folha';
const PAGE_SIZE = 100;

type Snapshot = {
  fetchedAt: string | null;
  trigger: string | null;
  fetchedByName: string | null;
  rows: Record<string, unknown>[];
  rowCount: number;
  lastError: string | null;
  lastErrorAt: string | null;
  atualizando: boolean;
};

type Coluna = { key: string; label: string; numerica: boolean; somavel: boolean };

/** Colunas numéricas que são códigos (não somar nem formatar como valor). */
const RE_CODIGO = /^(cod|codigo|id|chapa|matricula|cpf|pis|ano|mes|competencia|nro|num|numero|seq|coligada|filial|tipo|evento|secao|funcao|periodo|salario)/i;
const RE_CODIGO_FIM = /(cod|codigo|id|chapa|ano|mes|nro|num)$/i;

function rotuloColuna(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function textoCelula(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
}

function numeroDe(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = textoCelula(v);
  if (!s) return null;
  // Aceita "1234.56" (JSON do RM) e "1.234,56".
  const norm = /,\d{1,4}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function dataIso(v: unknown): string | null {
  const s = textoCelula(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00)?/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Filtros da tela: coluna da FOLPAG correspondente (pelo nome) e rótulo. */
type FiltroKey = 'ano' | 'mes' | 'polo' | 'cc' | 'filial' | 'nome';
const FILTROS: {
  key: FiltroKey;
  label: string;
  nomes: RegExp;
  todos: string;
  /** Valor derivado da coluna (ex.: polo = sigla da seção). */
  valor?: (v: unknown) => string;
}[] = [
  { key: 'ano', label: 'Ano', nomes: /^ano$/i, todos: 'Todos os anos' },
  { key: 'mes', label: 'Mês', nomes: /^mes$/i, todos: 'Todos os meses' },
  { key: 'polo', label: 'Polo', nomes: /^secao$/i, todos: 'Todos os polos', valor: poloDaSecao },
  { key: 'cc', label: 'Centro de custo', nomes: /^(centro_?de_?custo|centrocusto|ccusto|cc)$/i, todos: 'Todos os centros de custo' },
  { key: 'filial', label: 'Filial', nomes: /^filial$/i, todos: 'Todas as filiais' },
  { key: 'nome', label: 'Nome', nomes: /^(nome|funcionario|nome_?funcionario)$/i, todos: 'Todos os funcionários' },
];
/** Colunas que começam escondidas (o usuário pode mostrar no menu "Colunas"). */
const COLUNAS_OCULTAS_PADRAO = new Set([
  'CHAPA',
  'CODSECAO',
  'CODFUNCAO',
  'DEPARTAMENTO',
  'CODCENTROCUSTO',
  'CENTROCUSTOCOMPLETO',
  'BANCO',
  'AGENCIA',
  'TIPOCONTA',
  'TIPOCHAVE',
  'CONTAPAGAMENTO',
]);
const normalizarChave = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
const STORAGE_COLUNAS = 'previa-folha:colunas-ocultas';

const FILTROS_VAZIOS: Record<FiltroKey, string[]> = { ano: [], mes: [], polo: [], cc: [], filial: [], nome: [] };
/** Polos marcados por padrão (o usuário pode trocar no filtro Polo). */
const POLOS_PADRAO = ['DF', 'GO'];
const valorDoFiltro = (fk: FiltroKey, v: unknown) => {
  const f = FILTROS.find((x) => x.key === fk);
  return f?.valor ? f.valor(v) : textoCelula(v);
};

const fmtMoeda = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function montarColunas(rows: Record<string, unknown>[]): Coluna[] {
  const keys: string[] = [];
  const vistas = new Set<string>();
  for (const r of rows.slice(0, 500)) {
    for (const k of Object.keys(r)) {
      if (!vistas.has(k)) {
        vistas.add(k);
        keys.push(k);
      }
    }
  }
  return keys.map((key) => {
    let preenchidos = 0;
    let numericos = 0;
    for (const r of rows.slice(0, 500)) {
      const t = textoCelula(r[key]);
      if (!t) continue;
      preenchidos += 1;
      if (numeroDe(r[key]) != null) numericos += 1;
    }
    const numerica = preenchidos > 0 && numericos === preenchidos;
    const codigo = RE_CODIGO.test(key) || RE_CODIGO_FIM.test(key);
    return { key, label: rotuloColuna(key), numerica, somavel: numerica && !codigo };
  });
}

function exibirCelula(col: Coluna, v: unknown): string {
  if (col.somavel) {
    const n = numeroDe(v);
    return n == null ? '' : fmtMoeda(n);
  }
  return dataIso(v) ?? textoCelula(v);
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function EventosDaLinha({ eventos, resultado }: { eventos: EventoResumo[]; resultado: number }) {
  const moeda = (n: number) => `R$ ${fmtMoeda(n)}`;
  const proventos = eventos.filter((e) => e.tipo === 'P');
  const descontos = eventos.filter((e) => e.tipo === 'D');
  const soma = (l: EventoResumo[]) => l.reduce((s, e) => s + e.valor, 0);
  const bloco = (titulo: string, lista: EventoResumo[], cor: string) => (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      <div className={`flex items-center justify-between border-b border-gray-200 px-3 py-2 text-sm font-semibold dark:border-gray-700 ${cor}`}>
        <span>
          {titulo} <span className="font-normal text-gray-500 dark:text-gray-400">({lista.length})</span>
        </span>
        <span className="tabular-nums">{moeda(soma(lista))}</span>
      </div>
      {lista.length ? (
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
          {lista.map((e) => (
            <li key={e.nome} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={e.nome}>
                {e.nome}
              </span>
              <span className={`shrink-0 tabular-nums font-medium ${e.valor < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                {moeda(e.valor)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Nenhum evento.</p>
      )}
    </div>
  );
  return (
    <div className="space-y-3 bg-gray-50/80 px-4 py-4 dark:bg-gray-800/30">
      <div className="grid gap-3 md:grid-cols-2">
        {bloco('Proventos', proventos, 'text-emerald-700 dark:text-emerald-400')}
        {bloco('Descontos', descontos, 'text-red-700 dark:text-red-400')}
      </div>
      <p className="text-right text-sm text-gray-600 dark:text-gray-300">
        Proventos {moeda(soma(proventos))} + Descontos {moeda(soma(descontos))} ={' '}
        <span className="font-bold text-gray-900 dark:text-white">{moeda(resultado)}</span>
      </p>
    </div>
  );
}

function ResumoFolhaTabela({ dados, coluna }: { dados: ResumoDimensao; coluna: string }) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const moeda = (n: number) => `R$ ${fmtMoeda(n)}`;
  const th = 'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:text-sm';
  const tdNum = 'whitespace-nowrap px-4 py-3.5 text-right tabular-nums';
  const maior = Math.max(1, ...dados.linhas.map((l) => Math.abs(l.resultado)));
  const todasAbertas = dados.linhas.length > 0 && dados.linhas.every((l) => abertas.has(l.nome));
  const alternar = (nome: string) =>
    setAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome);
      else n.add(nome);
      return n;
    });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">Clique numa linha para ver os eventos (proventos e descontos).</p>
        <button
          type="button"
          onClick={() => setAbertas(todasAbertas ? new Set() : new Set(dados.linhas.map((l) => l.nome)))}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          {todasAbertas ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {todasAbertas ? 'Recolher todos' : 'Expandir todos'}
        </button>
      </div>
      <div className="w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <colgroup>
            <col />
            <col className="w-40" />
            <col className="w-56" />
            <col className="w-72" />
          </colgroup>
          <thead className="bg-gray-50 dark:bg-gray-800/80">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className={`${th} text-left`}>{coluna}</th>
              <th className={`${th} text-right`}>Colaboradores</th>
              <th className={`${th} text-right`}>Resultado da folha</th>
              <th className={`${th} text-left`}>% do total</th>
            </tr>
          </thead>
          <tbody>
            {dados.linhas.map((l, i) => {
              const aberta = abertas.has(l.nome);
              return (
                <React.Fragment key={l.nome}>
                  <tr
                    onClick={() => alternar(l.nome)}
                    className={`cursor-pointer border-b border-gray-100 text-[15px] text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-700/70 dark:text-gray-100 dark:hover:bg-gray-800/50 ${
                      aberta ? 'bg-gray-50 dark:bg-gray-800/50' : ''
                    }`}
                    aria-expanded={aberta}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        {aberta ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                        )}
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-600 dark:bg-red-950/50 dark:text-red-400">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium" title={l.nome}>
                          {l.nome}
                        </span>
                      </div>
                    </td>
                    <td className={tdNum}>{l.colaboradores.toLocaleString('pt-BR')}</td>
                    <td className={`${tdNum} font-semibold ${l.resultado < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {moeda(l.resultado)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${Math.min(100, (Math.abs(l.resultado) / maior) * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
                          {l.pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                      </div>
                    </td>
                  </tr>
                  {aberta ? (
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <td colSpan={4} className="p-0">
                        <EventosDaLinha eventos={l.eventos} resultado={l.resultado} />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 bg-gray-50 text-base font-bold text-gray-900 dark:border-gray-600 dark:bg-gray-800/80 dark:text-white">
              <td className="px-4 py-4">Total geral</td>
              <td className={`${tdNum} py-4`}>{dados.colaboradores.toLocaleString('pt-BR')}</td>
              <td className={`${tdNum} py-4`}>{moeda(dados.resultado)}</td>
              <td className="px-4 py-4 text-right text-sm tabular-nums">{dados.linhas.length ? '100,0%' : '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function PreviaFolhaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [ordem, setOrdem] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [exportando, setExportando] = useState(false);
  const [filtros, setFiltros] = useState<Record<FiltroKey, string[]>>(FILTROS_VAZIOS);
  // Colunas escondidas pelo usuário (null = padrão). Guarda as ESCONDIDAS, para colunas novas do TOTVS aparecerem.
  const [ocultas, setOcultas] = useState<string[] | null>(null);
  // Aba principal = resumo para a diretoria; "Folha - Base TOTVS" = linhas da consulta.
  const [aba, setAba] = useState<'resumo' | 'base'>('resumo');
  const [dim, setDim] = useState<DimensaoResumo>('empresa');
  const mesPadraoAplicado = useRef(false);
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_COLUNAS);
      if (salvo) setOcultas(JSON.parse(salvo));
    } catch {
      /* sem armazenamento: usa o padrão */
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  // Lê só a cópia guardada no Conecta — não chama o TOTVS.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['previa-folha'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Snapshot }>('/metricas/previa-folha');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Única ação que consulta o TOTVS (leitura da FOLPAG), além da leitura diária das 03:30.
  const atualizar = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ success: boolean; data: Snapshot }>(
        '/metricas/previa-folha/atualizar',
        {},
        { timeout: 300_000 }
      );
      return res.data.data;
    },
    onSuccess: (snap) => {
      queryClient.setQueryData(['previa-folha'], snap);
      setPage(1);
      toast.success(`Prévia atualizada: ${snap.rowCount.toLocaleString('pt-BR')} linha(s).`);
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao consultar a folha no TOTVS.');
      void queryClient.invalidateQueries({ queryKey: ['previa-folha'] });
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const colunas = useMemo(() => montarColunas(rows), [rows]);
  const ocultasSet = useMemo(
    () =>
      ocultas
        ? new Set(ocultas)
        : new Set(colunas.filter((c) => COLUNAS_OCULTAS_PADRAO.has(normalizarChave(c.key))).map((c) => c.key)),
    [ocultas, colunas]
  );
  const colunasVisiveis = useMemo(() => colunas.filter((c) => !ocultasSet.has(c.key)), [colunas, ocultasSet]);
  const escolherColunas = (visiveis: string[]) => {
    const v = new Set(visiveis);
    const novas = colunas.filter((c) => !v.has(c.key)).map((c) => c.key);
    setOcultas(novas);
    try {
      localStorage.setItem(STORAGE_COLUNAS, JSON.stringify(novas));
    } catch {
      /* ignora */
    }
  };

  // Coluna da FOLPAG usada por cada filtro (só os filtros cuja coluna existe na consulta).
  const colunaDoFiltro = useMemo(() => {
    const out = new Map<FiltroKey, string>();
    for (const f of FILTROS) {
      const col = colunas.find((c) => f.nomes.test(c.key.trim()));
      if (col) out.set(f.key, col.key);
    }
    return out;
  }, [colunas]);

  const opcoesFiltro = useMemo(() => {
    const out = new Map<FiltroKey, { value: string; label: string }[]>();
    for (const [fk, colKey] of colunaDoFiltro) {
      const valores = new Set<string>();
      for (const r of rows) {
        const v = valorDoFiltro(fk, r[colKey]);
        if (v) valores.add(v);
      }
      const lista = [...valores].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
      if (fk === 'ano') lista.reverse();
      out.set(fk, lista.map((v) => ({ value: v, label: v })));
    }
    return out;
  }, [colunaDoFiltro, rows]);

  const filtrosAtivos = FILTROS.some((f) => filtros[f.key].length > 0);

  // Mês mais recente já vem marcado (para não somar meses diferentes na prévia).
  useEffect(() => {
    if (mesPadraoAplicado.current) return;
    const ops = opcoesFiltro.get('mes');
    if (!ops?.length) return;
    mesPadraoAplicado.current = true;
    const polos = new Set((opcoesFiltro.get('polo') ?? []).map((o) => o.value));
    const polosPadrao = POLOS_PADRAO.filter((x) => polos.has(x));
    setFiltros((prev) => ({
      ...prev,
      mes: prev.mes.length ? prev.mes : [ops[ops.length - 1].value],
      polo: prev.polo.length ? prev.polo : polosPadrao,
    }));
  }, [opcoesFiltro]);

  // Linhas só com os filtros (base do resumo).
  const porFiltros = useMemo(() => {
    const ativos = FILTROS.filter((f) => filtros[f.key].length > 0 && colunaDoFiltro.has(f.key)).map((f) => ({
      key: f.key,
      col: colunaDoFiltro.get(f.key)!,
      valores: new Set(filtros[f.key]),
    }));
    return ativos.length
      ? rows.filter((r) => ativos.every((a) => a.valores.has(valorDoFiltro(a.key, r[a.col]))))
      : rows;
  }, [rows, filtros, colunaDoFiltro]);

  const resumo = useMemo(() => {
    const achar = (re: RegExp) => colunas.find((c) => re.test(c.key.trim()))?.key;
    return montarResumoFolha(porFiltros, {
      empresa: achar(/^coligada$/i) ?? achar(/^filial$/i),
      polo: achar(/^secao$/i),
      cc: achar(/^(centro_?de_?custo|centrocusto)$/i),
      valor: achar(/^valor$/i),
      pessoa: achar(/^chapa$/i) ?? achar(/^nome$/i),
      evento: achar(/^evento$/i),
      tipoEvento: achar(/^tipo_?evento$/i),
    });
  }, [porFiltros, colunas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let lista = porFiltros;
    if (termo) {
      lista = lista.filter((r) => colunas.some((c) => exibirCelula(c, r[c.key]).toLowerCase().includes(termo)));
    }
    if (ordem) {
      const col = colunas.find((c) => c.key === ordem.key);
      const mult = ordem.dir === 'asc' ? 1 : -1;
      lista = [...lista].sort((a, b) => {
        if (col?.numerica) return ((numeroDe(a[ordem.key]) ?? 0) - (numeroDe(b[ordem.key]) ?? 0)) * mult;
        return textoCelula(a[ordem.key]).localeCompare(textoCelula(b[ordem.key]), 'pt-BR', { numeric: true }) * mult;
      });
    }
    return lista;
  }, [porFiltros, colunas, busca, ordem]);

  const totais = useMemo(() => {
    const out = new Map<string, number>();
    for (const c of colunas) {
      if (!c.somavel) continue;
      out.set(c.key, filtradas.reduce((s, r) => s + (numeroDe(r[c.key]) ?? 0), 0));
    }
    return out;
  }, [colunas, filtradas]);

  const range = getCadastroListRange(page, PAGE_SIZE, filtradas.length);
  const currentPage = Math.min(page, range.totalPages);
  const pagina = filtradas.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const alternarOrdem = (key: string) => {
    setOrdem((o) => (o?.key !== key ? { key, dir: 'asc' } : o.dir === 'asc' ? { key, dir: 'desc' } : null));
    setPage(1);
  };

  const exportarExcel = async () => {
    if (filtradas.length === 0) return;
    setExportando(true);
    try {
      const hoje = new Date();
      const ymd = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      await exportBrandedExcelTable({
        title: 'Prévia da Folha',
        subtitle: `Consulta FOLPAG do TOTVS · leitura de ${fmtDataHora(data?.fetchedAt ?? null)}`,
        sheetName: 'Prévia da Folha',
        filename: `Previa-da-folha-${ymd}.xlsx`,
        columns: colunasVisiveis.map((c) => ({
          header: c.label,
          width: Math.min(40, Math.max(12, c.label.length + 4)),
          align: c.somavel ? 'right' : 'left',
          ...(c.somavel ? { numFmt: '#,##0.00' } : {}),
        })),
        rows: [
          ...filtradas.map((r) =>
            colunasVisiveis.map((c) => (c.somavel ? numeroDe(r[c.key]) ?? 0 : dataIso(r[c.key]) ?? textoCelula(r[c.key])))
          ),
          colunasVisiveis.map((c, i) => (c.somavel ? totais.get(c.key) ?? 0 : i === 0 ? 'TOTAL' : '')),
        ],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar.');
    } finally {
      setExportando(false);
    }
  };

  const exportarResumo = async () => {
    setExportando(true);
    try {
      const hoje = new Date();
      const ymd = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      await exportarResumoFolhaExcel(resumo, {
        subtitulo: `Base TOTVS (FOLPAG) · leitura de ${fmtDataHora(data?.fetchedAt ?? null)}`,
        filtros: FILTROS.filter((f) => filtros[f.key].length > 0).map((f) => `${f.label}: ${filtros[f.key].join(', ')}`),
        arquivo: `Previa-da-folha-resumo-${ymd}.xlsx`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar.');
    } finally {
      setExportando(false);
    }
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route={ROUTE}>
        <MainLayout userRole="EMPLOYEE" userName="Usuário" onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  const user = userData?.data || { name: 'Usuário' };
  const errorMessage =
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ||
    (error instanceof Error ? error.message : 'Erro ao carregar a prévia da folha.');
  const primeiraColunaSomavel = colunas.find((c) => c.somavel);
  const atualizandoAgora = atualizar.isPending || !!data?.atualizando;

  return (
    <ProtectedRoute route={ROUTE}>
      <MainLayout userRole="EMPLOYEE" userName={user.name || 'Usuário'} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="flex w-full flex-col items-center text-center">
            <h1 className="w-full text-center text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Prévia da Folha
            </h1>
            <p className="mt-2 w-full text-center text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Consulta da folha no TOTVS — somente leitura
            </p>
          </div>

          <AppUnderlineTabList aria-label="Abas da prévia da folha">
            {(
              [
                ['resumo', 'Prévia da Folha'],
                ['base', 'Folha - Base TOTVS'],
              ] as const
            ).map(([id, label]) => (
              <AppUnderlineTabButton
                key={id}
                active={aba === id}
                onClick={() => setAba(id)}
                className="whitespace-nowrap px-3 py-2.5 text-sm sm:px-4"
              >
                {label}
              </AppUnderlineTabButton>
            ))}
          </AppUnderlineTabList>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {aba === 'resumo' ? (
              <>
                <FilterStatCard
                  label="Colaboradores"
                  count={resumo.empresa.colaboradores.toLocaleString('pt-BR')}
                  icon={Users}
                  iconBg="bg-sky-50 dark:bg-sky-950/40"
                  iconColor="text-sky-600 dark:text-sky-400"
                  loading={isLoading}
                />
                <FilterStatCard
                  label="Resultado da folha"
                  count={`R$ ${fmtMoeda(resumo.empresa.resultado)}`}
                  icon={Wallet}
                  iconBg="bg-emerald-50 dark:bg-emerald-950/40"
                  iconColor="text-emerald-600 dark:text-emerald-400"
                  loading={isLoading}
                />
              </>
            ) : (
              <>
            <FilterStatCard
              label="Linhas"
              count={filtradas.length.toLocaleString('pt-BR')}
              icon={Rows3}
              iconBg="bg-sky-50 dark:bg-sky-950/40"
              iconColor="text-sky-600 dark:text-sky-400"
              loading={isLoading}
            />
            <FilterStatCard
              label={primeiraColunaSomavel ? `Total — ${primeiraColunaSomavel.label}` : 'Total'}
              count={primeiraColunaSomavel ? `R$ ${fmtMoeda(totais.get(primeiraColunaSomavel.key) ?? 0)}` : '—'}
              icon={Wallet}
              iconBg="bg-emerald-50 dark:bg-emerald-950/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              loading={isLoading}
            />
              </>
            )}
            <FilterStatCard
              label="Última leitura do TOTVS"
              count={fmtDataHora(data?.fetchedAt ?? null)}
              icon={Clock}
              iconBg="bg-amber-50 dark:bg-amber-950/40"
              iconColor="text-amber-600 dark:text-amber-400"
              loading={isLoading}
            />
          </div>

          {data?.fetchedAt ? (
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              {data.trigger === 'manual'
                ? `Atualizada pelo botão${data.fetchedByName ? ` por ${data.fetchedByName}` : ''}`
                : 'Leitura automática da madrugada (03:30)'}{' '}
              · o TOTVS é consultado só às 03:30 ou pelo botão Atualizar
            </p>
          ) : null}

          {data?.lastError ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                A última tentativa de consulta ao TOTVS falhou ({fmtDataHora(data.lastErrorAt)}): {data.lastError}
                {data.fetchedAt ? ' A tabela mostra a leitura anterior.' : ''}
              </p>
            </div>
          ) : null}

          {isError ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-50 p-2 sm:p-3 dark:bg-red-950/40">
                    <Wallet className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                      {aba === 'resumo' ? DIMENSOES.find((d) => d.key === dim)?.aba : 'Folha - Base TOTVS'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {aba === 'resumo'
                        ? 'Resultado da folha = proventos + descontos de todos os eventos'
                        : `${filtradas.length.toLocaleString('pt-BR')} registro(s)`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                    {aba === 'base' ? (
                      <>
                    <div className="relative h-10 min-w-0 flex-1 sm:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="search"
                        value={busca}
                        onChange={(e) => {
                          setBusca(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Buscar em qualquer coluna..."
                        className="box-border h-full w-full rounded-lg border border-gray-300 bg-white py-0 pl-9 pr-9 text-sm font-medium leading-10 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {busca ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBusca('');
                            setPage(1);
                          }}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {colunas.length > 0 ? (
                      <div className="w-48 shrink-0" title="Escolha as colunas que aparecem na tabela e no Excel">
                        <MultiSelectSearchDropdown
                          options={colunas.map((c) => ({ value: c.key, label: c.label }))}
                          selected={colunasVisiveis.map((c) => c.key)}
                          onChange={escolherColunas}
                          icon={<Columns3 className="h-4 w-4" />}
                          placeholder="Nenhuma coluna"
                          searchPlaceholder="Pesquisar coluna..."
                          emptySearchMessage="Nenhuma coluna encontrada."
                          listMaxHeight={360}
                          menuMinWidth={260}
                          noFocusRing
                        />
                      </div>
                    ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void (aba === 'resumo' ? exportarResumo() : exportarExcel())}
                      disabled={exportando || porFiltros.length === 0}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      title="Exportar para Excel"
                    >
                      {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => atualizar.mutate()}
                      disabled={atualizandoAgora}
                      className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      title="Consulta a folha no TOTVS agora (somente leitura)"
                    >
                      <RefreshCw className={`h-4 w-4 ${atualizandoAgora ? 'animate-spin' : ''}`} />
                      {atualizandoAgora ? 'Consultando...' : 'Atualizar'}
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {aba === 'resumo' && rows.length > 0 ? (
                <div className="mb-5 flex justify-center">
                  <AppSegmentedControl aria-label="Agrupamento do resumo">
                    {DIMENSOES.map((d) => (
                      <AppSegmentedButton
                        key={d.key}
                        active={dim === d.key}
                        onClick={() => setDim(d.key)}
                        className="!px-4 !py-2 !text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 sm:!text-base"
                      >
                        {d.aba}
                      </AppSegmentedButton>
                    ))}
                  </AppSegmentedControl>
                </div>
              ) : null}
              <div className={aba === 'resumo' ? 'grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]' : ''}>
              {colunaDoFiltro.size > 0 && rows.length > 0 ? (
                <div
                  className={`rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/40 ${
                    aba === 'resumo' ? 'lg:sticky lg:top-4' : 'mb-5'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      <ListFilter className="h-4 w-4 text-red-600 dark:text-red-400" />
                      Filtros
                    </div>
                    {filtrosAtivos ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFiltros(FILTROS_VAZIOS);
                          setPage(1);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <X className="h-4 w-4" />
                        Limpar filtros
                      </button>
                    ) : null}
                  </div>
                  <div
                    className={`grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 ${aba === 'resumo' ? 'lg:grid-cols-1' : 'lg:grid-cols-3 xl:grid-cols-6'}`}
                  >
                    {FILTROS.filter((f) => colunaDoFiltro.has(f.key)).map((f) => (
                      <div key={f.key} className="min-w-0">
                        <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{f.label}</span>
                        <MultiSelectSearchDropdown
                          options={opcoesFiltro.get(f.key) ?? []}
                          selected={filtros[f.key]}
                          onChange={(valores) => {
                            setFiltros((prev) => ({ ...prev, [f.key]: valores }));
                            setPage(1);
                          }}
                          placeholder={f.todos}
                          searchPlaceholder={`Pesquisar ${f.label.toLowerCase()}...`}
                          emptyOptionsMessage="Nenhuma opção."
                          emptySearchMessage="Nada encontrado."
                          listMaxHeight={320}
                          noFocusRing
                        />
                      </div>
                    ))}
                  </div>
                  {filtrosAtivos ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                      {FILTROS.filter((f) => filtros[f.key].length > 0).map((f) => (
                        <span
                          key={f.key}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-red-200 bg-red-50 py-1 pl-3 pr-1.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                          title={filtros[f.key].join(', ')}
                        >
                          <span className="font-semibold">{f.label}:</span>
                          <span className="truncate">
                            {filtros[f.key].length > 3
                              ? `${filtros[f.key].slice(0, 3).join(', ')} +${filtros[f.key].length - 3}`
                              : filtros[f.key].join(', ')}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setFiltros((prev) => ({ ...prev, [f.key]: [] }));
                              setPage(1);
                            }}
                            aria-label={`Remover filtro ${f.label}`}
                            className="rounded-full p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {aba === 'resumo' && !isLoading && porFiltros.length > 0 ? (
                <ResumoFolhaTabela dados={resumo[dim]} coluna={DIMENSOES.find((d) => d.key === dim)?.coluna ?? ''} />
              ) : isLoading ? (
                <CadastroListLoading message="Carregando prévia da folha..." />
              ) : filtradas.length === 0 ? (
                <CadastroListEmpty
                  icon={Wallet}
                  title={rows.length === 0 ? 'Nenhuma leitura da folha ainda' : 'Nenhum registro encontrado'}
                  hint={
                    rows.length === 0
                      ? 'Clique em Atualizar para consultar a folha no TOTVS, ou aguarde a leitura das 03:30.'
                      : 'Tente ajustar a busca ou os filtros.'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={range.startItem}
                    endItem={range.endItem}
                    total={filtradas.length}
                    itemLabel="registro"
                    itemLabelPlural="registros"
                    currentPage={currentPage}
                    totalPages={range.totalPages}
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead>
                        <tr>
                          {colunasVisiveis.map((c) => (
                            <th
                              key={c.key}
                              className={`${c.somavel ? 'text-right' : 'text-left'} cursor-pointer select-none whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white`}
                              onClick={() => alternarOrdem(c.key)}
                              title="Ordenar"
                            >
                              <span className="inline-flex items-center gap-1">
                                {c.label}
                                {ordem?.key === c.key ? (
                                  ordem.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                ) : null}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {pagina.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                            {colunasVisiveis.map((c) => (
                              <td
                                key={c.key}
                                className={`whitespace-nowrap px-3 py-2 text-sm text-gray-800 dark:text-gray-200 ${c.somavel ? 'text-right tabular-nums' : ''}`}
                              >
                                {exibirCelula(c, r[c.key]) || <span className="text-gray-400">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {totais.size > 0 ? (
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold dark:border-gray-600 dark:bg-gray-800/80">
                            {colunasVisiveis.map((c, i) => (
                              <td
                                key={c.key}
                                className={`whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ${c.somavel ? 'text-right tabular-nums' : ''}`}
                              >
                                {c.somavel ? fmtMoeda(totais.get(c.key) ?? 0) : i === 0 ? 'Total (filtro atual)' : ''}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      ) : null}
                    </table>
                  </div>
                  <ListPagination currentPage={currentPage} totalPages={range.totalPages} onPageChange={setPage} />
                </>
              )}
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
