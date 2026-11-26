'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Clock,
  Columns3,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Rows3,
  Search,
  Users,
  Wallet,
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
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { Modal } from '@/components/ui/Modal';
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
/** Colunas que aparecem por padrão, nesta ordem; as demais ficam no botão de colunas. */
const COLUNAS_PADRAO = ['NOME', 'CENTROCUSTO', 'COLIGADA', 'SITUACAO', 'EVENTO', 'SALARIO', 'VALOR'];
/** Informação que vai na segunda linha de outra coluna (não vira coluna própria). */
const LINHA_DE_BAIXO: Record<string, string> = { NOME: 'FUNCAO', CENTROCUSTO: 'SECAO', EVENTO: 'TIPOEVENTO' };
const NOMES_EMBUTIDOS = new Set(Object.values(LINHA_DE_BAIXO));
const TITULOS: Record<string, string> = {
  NOME: 'Funcionário',
  CENTROCUSTO: 'Centro de custo',
  COLIGADA: 'Empresa',
  SITUACAO: 'Situação',
  EVENTO: 'Evento',
  SALARIO: 'Salário',
  VALOR: 'Valor',
  CHAPA: 'Matrícula',
  SECAO: 'Seção',
  FILIAL: 'Filial',
  FUNCAO: 'Função',
  CODSECAO: 'Código da seção',
  CODFUNCAO: 'Código da função',
  TIPOFUNC: 'Tipo de funcionário',
  DTADMISSAO: 'Data de admissão',
  DTDEMISSAO: 'Data de demissão',
  TIPOEVENTO: 'Tipo de evento',
  DEPARTAMENTO: 'Departamento',
  CODCENTROCUSTO: 'Código do centro de custo',
  CENTROCUSTOCOMPLETO: 'Centro de custo completo',
  CONTAPAGAMENTO: 'Conta de pagamento',
  BANCO: 'Banco',
  AGENCIA: 'Agência',
  TIPOCONTA: 'Tipo de conta',
  TIPOCHAVE: 'Tipo de chave Pix',
  ANO: 'Ano',
  MES: 'Mês',
  PERIODO: 'Período',
};
const normalizarChave = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, '');
const STORAGE_COLUNAS = 'previa-folha:colunas-ocultas-v2';
const tituloColuna = (c: { key: string; label: string }) => TITULOS[normalizarChave(c.key)] ?? c.label;
const ehMoeda = (c: { key: string; somavel: boolean }) => c.somavel || normalizarChave(c.key) === 'SALARIO';
/** Funcionário à esquerda, valores à direita, o resto centralizado. */
const alinhamento = (c: { key: string; somavel: boolean }) =>
  ehMoeda(c) ? 'text-right' : normalizarChave(c.key) === 'NOME' ? 'text-left' : 'text-center';
/** «01 - GENNESIS» → «GENNESIS». */
const semCodigo = (v: string) => v.replace(/^\s*[A-Z0-9]{1,6}\s+-\s+/i, '').trim();

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

const COR_SITUACAO: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  F: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  D: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
};

/** Conteúdo de uma célula da lista de lançamentos. */
function CelulaFolha({ coluna, linha, extra }: { coluna: Coluna; linha: Record<string, unknown>; extra?: string }) {
  const chave = normalizarChave(coluna.key);
  const bruto = textoCelula(linha[coluna.key]);
  const baixo = extra ? textoCelula(linha[extra]) : '';
  const vazio = <span className="text-gray-400">—</span>;
  const limpo = !bruto || /^n\/inf/i.test(bruto) ? '' : bruto;

  if (ehMoeda(coluna)) {
    const n = numeroDe(linha[coluna.key]);
    if (n == null) return vazio;
    return (
      <span
        className={['tabular-nums', n < 0 ? 'text-red-600 dark:text-red-400' : '', chave === 'VALOR' ? 'font-semibold' : ''].join(' ')}
      >
        {n < 0 ? '- ' : ''}R$ {fmtMoeda(Math.abs(n))}
      </span>
    );
  }
  if (chave === 'SITUACAO') {
    if (!limpo) return vazio;
    const cor =
      COR_SITUACAO[limpo.charAt(0).toUpperCase()] ?? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    return (
      <span className={'inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ' + cor}>
        {semCodigo(limpo)}
      </span>
    );
  }
  if (chave === 'NOME' || chave === 'CENTROCUSTO' || chave === 'EVENTO') {
    const principal = chave === 'EVENTO' ? semCodigo(limpo) : limpo;
    const tipo = chave !== 'EVENTO' ? '' : /provento/i.test(baixo) ? 'Provento' : /desconto/i.test(baixo) ? 'Desconto' : '';
    const segunda = chave === 'EVENTO' ? tipo : baixo;
    const corSegunda =
      tipo === 'Provento'
        ? 'text-emerald-600 dark:text-emerald-400'
        : tipo === 'Desconto'
          ? 'text-red-600 dark:text-red-400'
          : 'text-gray-500 dark:text-gray-400';
    return (
      <div className="min-w-0">
        <p
          className={'whitespace-nowrap ' + (chave === 'NOME' ? 'font-medium text-gray-900 dark:text-white' : '')}
          title={principal}
        >
          {principal || vazio}
        </p>
        {segunda ? (
          <p className={'whitespace-nowrap text-xs ' + corSegunda} title={segunda}>
            {segunda}
          </p>
        ) : null}
      </div>
    );
  }
  const texto = chave === 'COLIGADA' || chave === 'FILIAL' ? semCodigo(limpo) : limpo ? exibirCelula(coluna, linha[coluna.key]) : '';
  return texto ? (
    <span
      className={chave === 'COLIGADA' || chave === 'FILIAL' ? 'block whitespace-nowrap' : 'mx-auto block max-w-[280px] truncate'}
      title={texto}
    >
      {texto}
    </span>
  ) : (
    vazio
  );
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** «11-NOV» ou «11» vira «Novembro»; formato desconhecido fica como veio. */
function nomeDoMes(valor: string): string {
  const n = Number(valor.match(/^\s*(\d{1,2})/)?.[1]);
  return NOMES_MESES[n - 1] ?? valor;
}

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function EventosDaLinha({
  eventos,
  resultado,
  colaboradores,
}: {
  eventos: EventoResumo[];
  resultado: number;
  colaboradores: number;
}) {
  const moeda = (n: number) => (n < 0 ? '- ' : '') + 'R$ ' + fmtMoeda(Math.abs(n));
  const proventos = eventos.filter((e) => e.tipo === 'P');
  const descontos = eventos.filter((e) => e.tipo === 'D');
  const soma = (l: EventoResumo[]) => l.reduce((s, e) => s + e.valor, 0);
  const cartoes = [
    { rotulo: 'Colaboradores', valor: colaboradores.toLocaleString('pt-BR'), cor: 'text-gray-900 dark:text-white' },
    { rotulo: 'Proventos', valor: moeda(soma(proventos)), cor: 'text-emerald-600 dark:text-emerald-400' },
    { rotulo: 'Descontos', valor: moeda(soma(descontos)), cor: 'text-red-600 dark:text-red-400' },
    { rotulo: 'Resultado', valor: moeda(resultado), cor: 'text-gray-900 dark:text-white' },
  ];
  const bloco = (titulo: string, lista: EventoResumo[], ponto: string) => (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
        <span className={'h-2.5 w-2.5 rounded-full ' + ponto} aria-hidden />
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{titulo}</h4>
        <span className="text-xs text-gray-500 dark:text-gray-400">{lista.length}</span>
      </div>
      {lista.length ? (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
          {lista.map((e) => (
            <li key={e.nome} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-gray-600 dark:text-gray-300" title={e.nome}>
                {semCodigo(e.nome)}
              </span>
              <span className="shrink-0 font-medium tabular-nums text-gray-900 dark:text-gray-100">{moeda(e.valor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-3 text-sm text-gray-500 dark:text-gray-400">Nenhum evento.</p>
      )}
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="min-w-0 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{c.rotulo}</p>
            <p className={'mt-0.5 truncate text-base font-bold tabular-nums ' + c.cor} title={c.valor}>
              {c.valor}
            </p>
          </div>
        ))}
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        {bloco('Proventos', proventos, 'bg-emerald-500')}
        {bloco('Descontos', descontos, 'bg-red-500')}
      </div>
    </div>
  );
}

function ResumoFolhaTabela({
  dados,
  coluna,
  busca,
}: {
  dados: ResumoDimensao;
  coluna: string;
  busca: string;
}) {
  const [abertaNome, setAbertaNome] = useState<string | null>(null);
  const detalhe = dados.linhas.find((l) => l.nome === abertaNome) ?? null;
  const moeda = (n: number) => `R$ ${fmtMoeda(n)}`;
  const maior = Math.max(1, ...dados.linhas.map((l) => Math.abs(l.resultado)));
  const termo = busca.trim().toLowerCase();
  // A posição (ID) é a do ranking completo, mesmo quando a busca esconde linhas.
  const linhas = dados.linhas
    .map((l, i) => ({ ...l, posicao: i + 1 }))
    .filter((l) => !termo || l.nome.toLowerCase().includes(termo));
  if (linhas.length === 0) {
    return <CadastroListEmpty icon={Wallet} title="Nenhum registro encontrado" hint="Tente ajustar a busca ou os filtros." />;
  }
  return (
    <>
      <CadastroListSummary
        startItem={1}
        endItem={linhas.length}
        total={linhas.length}
        itemLabel="linha"
        itemLabelPlural="linhas"
        currentPage={1}
        totalPages={1}
      />
      <div className={cadastroListClasses.tableScroll}>
        <table className={cadastroListClasses.table} data-cc-skip-column-customizer="1">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className={`${cadastroListClasses.th} text-center`} style={{ width: '5rem' }}>ID</th>
              <th className={`${cadastroListClasses.th} text-left`}>{coluna}</th>
              <th className={`${cadastroListClasses.th} text-center`}>Colaboradores</th>
              <th className={`${cadastroListClasses.th} text-right`}>Resultado da folha</th>
              <th className={`${cadastroListClasses.th} text-left`}>% do total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {linhas.map((l) => (
                  <tr key={l.nome} onClick={() => setAbertaNome(l.nome)} className={getListTableRowClassName(true)}>
                    <td className={`${cadastroListClasses.tdMono} text-center`}>{l.posicao}</td>
                    <td className="px-3 py-4 sm:px-6">
                      <ListRowNavigableLabel className="font-medium">{l.nome}</ListRowNavigableLabel>
                    </td>
                    <td className={`${cadastroListClasses.td} text-center tabular-nums`}>
                      {l.colaboradores.toLocaleString('pt-BR')}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-4 text-right text-sm font-medium tabular-nums sm:px-6 ${
                        l.resultado < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {moeda(l.resultado)}
                    </td>
                    <td className="px-3 py-4 sm:px-6">
                      <div className="flex min-w-[160px] items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${Math.min(100, (Math.abs(l.resultado) / maior) * 100)}%` }}
                          />
                        </div>
                        <span className="w-14 text-right text-sm tabular-nums text-gray-600 dark:text-gray-300">
                          {l.pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                        </span>
                      </div>
                    </td>
                  </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal isOpen={detalhe !== null} onClose={() => setAbertaNome(null)} title={detalhe?.nome ?? ''} size="5xl">
        {detalhe ? (
          <EventosDaLinha eventos={detalhe.eventos} resultado={detalhe.resultado} colaboradores={detalhe.colaboradores} />
        ) : null}
      </Modal>
    </>
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
  // Aba principal = resumo para a diretoria; "Folha de Pagamento" = linhas da consulta.
  const [aba, setAba] = useState<'resumo' | 'base'>('resumo');
  const [dim, setDim] = useState<DimensaoResumo>('empresa');
  const mesPadraoAplicado = useRef(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
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
  // Colunas que podem virar coluna da lista (as de segunda linha vão junto da principal).
  const colunasEscolhiveis = useMemo(() => {
    const posicao = (c: Coluna) => {
      const i = COLUNAS_PADRAO.indexOf(normalizarChave(c.key));
      return i < 0 ? COLUNAS_PADRAO.length : i;
    };
    // Matrícula fica de fora: é sempre a primeira coluna e não pode ser escondida.
    return colunas
      .filter((c) => !NOMES_EMBUTIDOS.has(normalizarChave(c.key)) && normalizarChave(c.key) !== 'CHAPA')
      .sort((a, b) => posicao(a) - posicao(b));
  }, [colunas]);
  const ocultasSet = useMemo(
    () =>
      ocultas
        ? new Set(ocultas)
        : new Set(colunas.filter((c) => !COLUNAS_PADRAO.includes(normalizarChave(c.key))).map((c) => c.key)),
    [ocultas, colunas]
  );
  const colunasVisiveis = useMemo(
    () => [
      ...colunas.filter((c) => normalizarChave(c.key) === 'CHAPA'),
      ...colunasEscolhiveis.filter((c) => !ocultasSet.has(c.key)),
    ],
    [colunas, colunasEscolhiveis, ocultasSet]
  );
  const colunaExtra = (c: Coluna) =>
    colunas.find((x) => normalizarChave(x.key) === LINHA_DE_BAIXO[normalizarChave(c.key)])?.key;
  const escolherColunas = (visiveis: string[]) => {
    const v = new Set(visiveis);
    const novas = colunasEscolhiveis.filter((c) => !v.has(c.key)).map((c) => c.key);
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
      const paraExportar = colunasVisiveis.flatMap((c) => {
        const extra = colunas.find((x) => x.key === colunaExtra(c));
        return extra ? [c, extra] : [c];
      });
      const hoje = new Date();
      const ymd = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
      await exportBrandedExcelTable({
        title: 'Prévia da Folha',
        subtitle: `Consulta FOLPAG do TOTVS · leitura de ${fmtDataHora(data?.fetchedAt ?? null)}`,
        sheetName: 'Prévia da Folha',
        filename: `Previa-da-folha-${ymd}.xlsx`,
        columns: paraExportar.map((c) => ({
          header: tituloColuna(c),
          width: Math.min(40, Math.max(14, tituloColuna(c).length + 4)),
          align: ehMoeda(c) ? 'right' : 'left',
          ...(ehMoeda(c) ? { numFmt: '#,##0.00' } : {}),
        })),
        rows: [
          ...filtradas.map((r) =>
            paraExportar.map((c) => (ehMoeda(c) ? numeroDe(r[c.key]) ?? 0 : dataIso(r[c.key]) ?? textoCelula(r[c.key])))
          ),
          paraExportar.map((c, i) => (c.somavel ? totais.get(c.key) ?? 0 : i === 0 ? 'TOTAL' : '')),
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
  const mesOpcoes = (opcoesFiltro.get('mes') ?? []).map((o) => o.value);
  // Valor da folha de cada mês, respeitando os demais filtros (o próprio mês fica de fora).
  const totaisPorMes = (() => {
    const colMes = colunaDoFiltro.get('mes');
    const colValor = colunas.find((c) => /^valor$/i.test(c.key.trim()))?.key;
    const out = new Map<string, number>();
    if (!colMes || !colValor) return out;
    const outros = FILTROS.filter((f) => f.key !== 'mes' && filtros[f.key].length > 0 && colunaDoFiltro.has(f.key));
    for (const r of rows) {
      if (!outros.every((f) => filtros[f.key].includes(valorDoFiltro(f.key, r[colunaDoFiltro.get(f.key)!])))) continue;
      const mes = valorDoFiltro('mes', r[colMes]);
      out.set(mes, (out.get(mes) ?? 0) + (numeroDe(r[colValor]) ?? 0));
    }
    return out;
  })();
  const totalDosMeses = [...totaisPorMes.values()].reduce((s, v) => s + v, 0);
  const escolherMes = (meses: string[]) => {
    setFiltros((prev) => ({ ...prev, mes: meses }));
    setPage(1);
  };
  return (
    <ProtectedRoute route={ROUTE}>
      <MainLayout userRole="EMPLOYEE" userName={user.name || 'Usuário'} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="flex w-full flex-col items-center text-center">
            <h1 className="w-full text-center text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Prévia da Folha
            </h1>
            <p className="mt-2 w-full text-center text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Acompanhe os valores da folha de pagamento
            </p>
          </div>

          <AppUnderlineTabList aria-label="Abas da prévia da folha">
            {(
              [
                ['resumo', 'Prévia da Folha'],
                ['base', 'Folha de Pagamento'],
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

          {mesOpcoes.length > 0 ? (
            <div className="flex justify-center overflow-x-auto">
              <AppSegmentedControl aria-label="Mês de referência">
                {mesOpcoes.map((mes) => (
                  <AppSegmentedButton
                    key={mes}
                    active={filtros.mes.includes(mes)}
                    onClick={() => escolherMes([mes])}
                    className="whitespace-nowrap !px-4 !py-2 !text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                  >
                    <span className="flex flex-col items-center leading-tight">
                      <span>{nomeDoMes(mes)}</span>
                      <span className="text-xs font-normal tabular-nums opacity-80">
                        R$ {fmtMoeda(totaisPorMes.get(mes) ?? 0)}
                      </span>
                    </span>
                  </AppSegmentedButton>
                ))}
                <AppSegmentedButton
                  active={filtros.mes.length === 0}
                  onClick={() => escolherMes([])}
                  className="whitespace-nowrap !px-4 !py-2 !text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span>Todos</span>
                    <span className="text-xs font-normal tabular-nums opacity-80">R$ {fmtMoeda(totalDosMeses)}</span>
                  </span>
                </AppSegmentedButton>
              </AppSegmentedControl>
            </div>
          ) : null}

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
              label="Valor Total"
              count={primeiraColunaSomavel ? `R$ ${fmtMoeda(totais.get(primeiraColunaSomavel.key) ?? 0)}` : '—'}
              icon={Wallet}
              iconBg="bg-emerald-50 dark:bg-emerald-950/40"
              iconColor="text-emerald-600 dark:text-emerald-400"
              loading={isLoading}
            />
              </>
            )}
            <FilterStatCard
              label="Última leitura"
              count={fmtDataHora(data?.fetchedAt ?? null)}
              icon={Clock}
              iconBg="bg-amber-50 dark:bg-amber-950/40"
              iconColor="text-amber-600 dark:text-amber-400"
              loading={isLoading}
            />
          </div>

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

          {aba === 'resumo' && rows.length > 0 ? (
            <AppUnderlineTabList aria-label="Agrupamento do resumo">
              {DIMENSOES.map((d) => (
                <AppUnderlineTabButton
                  key={d.key}
                  active={dim === d.key}
                  onClick={() => setDim(d.key)}
                  className="whitespace-nowrap px-3 py-2.5 text-sm sm:px-4"
                >
                  {d.key === 'empresa' ? 'Por Empresa' : d.key === 'polo' ? 'Por Polo' : 'Por Centro de Custo'}
                </AppUnderlineTabButton>
              ))}
            </AppUnderlineTabList>
          ) : null}

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Wallet className="h-5 w-5 text-red-600 dark:text-red-300 sm:h-6 sm:w-6" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      {aba === 'resumo' ? DIMENSOES.find((d) => d.key === dim)?.aba : 'Folha de Pagamento'}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {aba === 'resumo' ? 'Resultado da folha por empresa, polo e centro de custo' : 'Lançamentos da folha por funcionário'}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:w-[300px] sm:min-w-[240px] sm:flex-none sm:basis-auto">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={busca}
                      onChange={(e) => {
                        setBusca(e.target.value);
                        setPage(1);
                      }}
                      placeholder={aba === 'resumo' ? 'Buscar na lista…' : 'Buscar em qualquer coluna…'}
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  {aba === 'base' && colunas.length > 0 ? (
                    <div className="shrink-0" title="Escolha as colunas que aparecem na tabela e no Excel">
                      <MultiSelectSearchDropdown
                        iconOnly
                        options={colunasEscolhiveis.map((c) => ({ value: c.key, label: tituloColuna(c) }))}
                        selected={colunasVisiveis.filter((c) => normalizarChave(c.key) !== 'CHAPA').map((c) => c.key)}
                        onChange={escolherColunas}
                        icon={<Columns3 className="h-4 w-4" />}
                        placeholder="Colunas visíveis"
                        searchPlaceholder="Pesquisar coluna..."
                        emptySearchMessage="Nenhuma coluna encontrada."
                        listMaxHeight={360}
                        menuMinWidth={260}
                        noFocusRing
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setFiltrosAbertos(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      filtrosAtivos
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={filtrosAtivos ? 'Filtro (ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {filtrosAtivos ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void (aba === 'resumo' ? exportarResumo() : exportarExcel())}
                    disabled={exportando || porFiltros.length === 0}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Exportar Excel"
                    title="Exportar Excel"
                  >
                    {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => atualizar.mutate()}
                    disabled={atualizandoAgora}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    title={atualizandoAgora ? 'Consultando...' : 'Atualizar'}
                    aria-label="Atualizar"
                  >
                    <RefreshCw className={`h-4 w-4 ${atualizandoAgora ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {aba === 'resumo' && !isLoading && porFiltros.length > 0 ? (
                <ResumoFolhaTabela
                  dados={resumo[dim]}
                  coluna={DIMENSOES.find((d) => d.key === dim)?.coluna ?? ''}
                  busca={busca}
                />
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
                    <table className={cadastroListClasses.table} data-cc-skip-column-customizer="1">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {colunasVisiveis.map((c) => (
                            <th
                              key={c.key}
                              className={`${cadastroListClasses.th} ${alinhamento(c)} cursor-pointer select-none whitespace-nowrap`}
                              style={normalizarChave(c.key) === 'CHAPA' ? { width: '5rem' } : undefined}
                              onClick={() => alternarOrdem(c.key)}
                              title="Ordenar"
                            >
                              <span className="inline-flex items-center gap-1">
                                {tituloColuna(c)}
                                {ordem?.key === c.key ? (
                                  ordem.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                ) : null}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {pagina.map((r, i) => (
                          <tr key={i} className={getListTableRowClassName(false)}>
                            {colunasVisiveis.map((c) => (
                              <td
                                key={c.key}
                                className={`${normalizarChave(c.key) === 'CHAPA' ? cadastroListClasses.tdMono : cadastroListClasses.td} ${alinhamento(c)} ${ehMoeda(c) ? 'whitespace-nowrap' : ''}`}
                              >
                                <CelulaFolha coluna={c} linha={r} extra={colunaExtra(c)} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      {totais.size > 0 ? (
                        <tfoot>
                          <tr className="border-t border-gray-200 font-semibold dark:border-gray-700">
                            {colunasVisiveis.map((c, i) => (
                              <td
                                key={c.key}
                                className={`whitespace-nowrap px-3 py-4 text-sm text-gray-900 dark:text-gray-100 sm:px-6 ${c.somavel ? 'text-right tabular-nums' : ''}`}
                              >
                                {c.somavel ? `R$ ${fmtMoeda(totais.get(c.key) ?? 0)}` : i === 1 ? 'Total (filtro atual)' : ''}
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
            </CardContent>
          </Card>

          <Modal
            isOpen={filtrosAbertos}
            onClose={() => setFiltrosAbertos(false)}
            title="Filtros — Prévia da Folha"
            size="md"
          >
            <div className="space-y-4">
              {FILTROS.filter((f) => colunaDoFiltro.has(f.key)).map((f) => (
                <div key={f.key} className="min-w-0">
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{f.label}</label>
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
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setFiltros(FILTROS_VAZIOS);
                    setPage(1);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setFiltrosAbertos(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
