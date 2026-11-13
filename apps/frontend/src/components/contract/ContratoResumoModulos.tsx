'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Calculator, CalendarRange, ChevronRight, ClipboardList, HardHat, Wrench, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';

export type ContratoResumoModulosAcesso = {
  orcamentos: boolean;
  cronogramas: boolean;
  diarios: boolean;
  obras: boolean;
  fichasDemanda: boolean;
  ferramentas: boolean;
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : 0;
};

function dataBr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function maisRecente(datas: Array<string | null | undefined>): string | null {
  let melhor: string | null = null;
  let t = 0;
  for (const d of datas) {
    if (!d) continue;
    const x = new Date(d).getTime();
    if (Number.isFinite(x) && x > t) {
      t = x;
      melhor = d;
    }
  }
  return melhor;
}

/** Cartão de um módulo: ícone, título e conteúdo (cada módulo tem o seu desenho). */
function BlocoModulo({
  titulo,
  icon: Icon,
  iconBg,
  iconColor,
  carregando,
  erro,
  rodape,
  onAbrir,
  children,
}: {
  titulo: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  carregando: boolean;
  erro: boolean;
  rodape?: React.ReactNode;
  /** Clicar no bloco abre os detalhes numa janela, sem sair da página. */
  onAbrir?: () => void;
  children: React.ReactNode;
}) {
  const clicavel = !!onAbrir && !carregando && !erro;
  return (
    <Card
      className={`${cadastroListClasses.card} flex min-h-0 flex-col ${
        clicavel
          ? 'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:border-red-800'
          : ''
      }`}
      {...(clicavel
        ? {
            role: 'button' as const,
            tabIndex: 0,
            title: `Ver detalhes de ${titulo}`,
            onClick: onAbrir,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAbrir?.();
              }
            },
          }
        : {})}
    >
      <CardHeader className={`${cadastroListClasses.cardHeader} !pt-5`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 sm:p-3 ${iconBg}`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
          </div>
          <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">{titulo}</h3>
        </div>
      </CardHeader>
      <CardContent className={`${cadastroListClasses.cardContent} flex min-h-0 flex-1 flex-col`}>
        {carregando ? (
          <div className="space-y-3" aria-label="Carregando">
            <div className="h-10 w-1/2 animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/70" />
            <div className="h-16 w-full animate-pulse rounded-lg bg-gray-200/90 dark:bg-gray-700/70" />
            <div className="h-4 w-2/3 animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/70" />
          </div>
        ) : erro ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Não foi possível carregar os dados deste módulo.</p>
        ) : (
          <>
            <div className="flex-1">{children}</div>
            {rodape || clicavel ? (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700/70 dark:text-gray-400">
                <p className="min-w-0">{rodape}</p>
                {clicavel ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-red-600 dark:text-red-400">
                    Ver detalhes
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{children}</p>;
}

/** Pílula colorida com a quantidade e o nome da situação. */
function Pilula({ valor, label, classe }: { valor: number; label: string; classe: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${classe}`}>
      <p className="text-xl font-bold tabular-nums leading-none">{valor}</p>
      <p className="mt-1 text-[11px] font-medium leading-tight opacity-90">{label}</p>
    </div>
  );
}

/** Anel de progresso (0–100). */
function Anel({ percent, cor, rotulo }: { percent: number; cor: string; rotulo: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative h-[116px] w-[116px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={rotulo}>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="11" className="stroke-gray-200 dark:stroke-gray-700" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          stroke={cor}
          strokeDasharray={`${(p / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {p.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
        </span>
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">avanço</span>
      </div>
    </div>
  );
}

type OrcamentoRow = {
  id: string;
  nome?: string;
  familiaId?: string | null;
  versao?: number | string | null;
  statusAprovacao?: string | null;
  totalComBdi?: number | null;
  updatedAt?: string | null;
  cronogramaProgressoFisico?: number | null;
  cronogramaConcluido?: number | null;
  cronogramaTotalEtapas?: number | null;
  cronogramaAtrasado?: number | null;
};

/** Mantém só a última revisão de cada família de orçamento. */
function ultimasRevisoes(rows: OrcamentoRow[]): OrcamentoRow[] {
  const porFamilia = new Map<string, OrcamentoRow>();
  for (const o of rows) {
    const familia = (typeof o.familiaId === 'string' && o.familiaId.trim()) || o.id;
    const atual = porFamilia.get(familia);
    if (!atual || num(o.versao) > num(atual.versao)) porFamilia.set(familia, o);
  }
  return [...porFamilia.values()];
}

const statusNorm = (s?: string | null) => String(s ?? 'rascunho').trim().toLowerCase();

/** Cronogramas = última revisão de cada orçamento que já virou cronograma (mesma regra da página de Cronogramas). */
function filtrarCronogramas(ultimas: OrcamentoRow[]): OrcamentoRow[] {
  return ultimas.filter((o) => {
    const s = statusNorm(o.statusAprovacao);
    return num(o.versao) > 1 || s === 'finalizado' || s === 'aguardando_aprovacao' || s === 'aprovado';
  });
}

const STATUS_ORCAMENTO: Record<string, { label: string; classe: string }> = {
  rascunho: { label: 'Rascunho', classe: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' },
  pronta: { label: 'Pronta', classe: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  em_correcao: { label: 'Em correção', classe: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  aguardando_aprovacao: { label: 'Em aprovação', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  aprovado: { label: 'Aprovado', classe: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  finalizado: { label: 'Finalizado', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  reprovado: { label: 'Reprovado', classe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

const STATUS_FERRAMENTA: Record<string, { label: string; classe: string }> = {
  OPEN: { label: 'Aberto', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  SUPPLIER_RELATION: { label: 'Relação com fornecedor', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  QUOTATION: { label: 'Cotação', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  AWAITING_PAYMENT: { label: 'Aguardando pagamento', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  AWAITING_RECEIPT: { label: 'Aguardando recebimento', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  IN_USE: { label: 'Em uso', classe: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  COMPLETED: { label: 'Concluído', classe: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  REJECTED: { label: 'Recusado', classe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  CANCELLED: { label: 'Cancelado', classe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

const STATUS_FD: Record<string, { label: string; classe: string }> = {
  WAITING_MANAGER: { label: 'Aguardando', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  APPROVED: { label: 'Aprovada', classe: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  REJECTED: { label: 'Rejeitada', classe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  CANCELLED: { label: 'Cancelada', classe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

function Selo({ texto, classe }: { texto: string; classe: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${classe}`}>{texto}</span>;
}

/** Resumo no topo da janela: pequenos indicadores lado a lado. */
function ChipsModal({ itens }: { itens: Array<{ rotulo: string; valor: string }> }) {
  return (
    <div className="flex flex-wrap gap-3">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-[7.5rem] rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800/50">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{i.rotulo}</p>
          <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">{i.valor}</p>
        </div>
      ))}
    </div>
  );
}

/** Tabela da janela de detalhes (rola por dentro, com o cabeçalho fixo). */
function TabelaModal({
  colunas,
  linhas,
  vazio,
}: {
  colunas: Array<{ titulo: string; alinhar?: 'left' | 'right' | 'center' }>;
  linhas: Array<{ chave: string; celulas: React.ReactNode[] }>;
  vazio: string;
}) {
  if (linhas.length === 0) return <CadastroListEmpty icon={ClipboardList} title={vazio} />;
  const alinhar = (a?: 'left' | 'right' | 'center') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
  return (
    <div className="max-h-[52vh] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
          <tr>
            {colunas.map((c) => (
              <th key={c.titulo} className={`whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${alinhar(c.alinhar)}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/70">
          {linhas.map((l) => (
            <tr key={l.chave} className="bg-white transition-colors hover:bg-gray-50/80 dark:bg-gray-900/40 dark:hover:bg-gray-800/50">
              {l.celulas.map((c, i) => (
                <td key={i} className={`px-4 py-2.5 align-middle text-gray-800 dark:text-gray-100 ${alinhar(colunas[i]?.alinhar)}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Blocos de resumo dos módulos que ficam fora da página do contrato
 * (Orçamentos, Cronogramas, Diários de Obra, Obras, Fichas de Demanda e Pedidos de ferramentas).
 */
export function ContratoResumoModulos({
  contractId,
  costCenterId,
  acesso,
}: {
  contractId: string;
  costCenterId?: string | null;
  acesso: ContratoResumoModulosAcesso;
}) {
  const semRetry = { retry: false, staleTime: 5 * 60_000 } as const;

  // Orçamentos e Cronogramas vêm da mesma consulta (por centro de custo).
  const orcQ = useQuery({
    queryKey: ['resumo-orcamentos', costCenterId],
    queryFn: async () => {
      const res = await api.get(`/orcamento/${costCenterId}`, { timeout: 60000 });
      return (Array.isArray(res.data?.orcamentos) ? res.data.orcamentos : []) as OrcamentoRow[];
    },
    enabled: !!costCenterId && (acesso.orcamentos || acesso.cronogramas),
    ...semRetry,
  });

  const diariosQ = useQuery({
    queryKey: ['resumo-diarios', contractId],
    queryFn: async () => {
      const res = await api.get('/diario-obra', { params: { contratoId: contractId, limit: 100 } });
      return {
        rows: (res.data?.data ?? []) as Array<{ id?: string; date?: string; obraName?: string | null; finalizedAt?: string | null; noActivity?: boolean }>,
        total: num(res.data?.pagination?.total),
      };
    },
    enabled: acesso.diarios,
    ...semRetry,
  });

  const obrasQ = useQuery({
    queryKey: ['resumo-obras', contractId],
    queryFn: async () => {
      const res = await api.get('/obras', { params: { contratoId: contractId, limit: 500 } });
      return (res.data?.data ?? []) as Array<{ id: string; name?: string; isActive?: boolean }>;
    },
    enabled: acesso.obras,
    ...semRetry,
  });

  const fdQ = useQuery({
    queryKey: ['resumo-fichas-demanda', contractId],
    queryFn: async () => {
      const res = await api.get('/demand-sheet-approvals', { params: { contratoId: contractId } });
      return (res.data?.data ?? []) as Array<{
        id?: string;
        codFichaDemanda?: string | null;
        obra?: string | null;
        status?: string;
        faturamentoEstimado?: unknown;
        custoEstimado?: unknown;
        dataHora?: string | null;
        createdAt?: string | null;
      }>;
    },
    enabled: acesso.fichasDemanda,
    ...semRetry,
  });

  const ferramentasQ = useQuery({
    queryKey: ['resumo-ferramentas', contractId],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests', { params: { contractId, limit: 100 } });
      return {
        rows: (res.data?.data ?? []) as Array<{ id?: string; code?: string | null; titulo?: string | null; obra?: string | null; status?: string; updatedAt?: string | null }>,
        total: num(res.data?.pagination?.total),
      };
    },
    enabled: acesso.ferramentas,
    ...semRetry,
  });

  const ultimas = React.useMemo(() => ultimasRevisoes(orcQ.data ?? []), [orcQ.data]);
  const [aberto, setAberto] = React.useState<null | 'orc' | 'cron' | 'diarios' | 'obras' | 'fd' | 'ferr'>(null);

  const blocos: React.ReactNode[] = [];

  // ── Orçamentos: valor em destaque + situações em pílulas ────────────────
  if (acesso.orcamentos) {
    const g = { elab: 0, aprov: 0, ok: 0, rep: 0 };
    let valor = 0;
    for (const o of ultimas) {
      const s = statusNorm(o.statusAprovacao);
      if (s === 'aguardando_aprovacao') g.aprov += 1;
      else if (s === 'aprovado' || s === 'finalizado') g.ok += 1;
      else if (s === 'reprovado') g.rep += 1;
      else g.elab += 1;
      valor += num(o.totalComBdi);
    }
    blocos.push(
      <BlocoModulo
        key="orc"
        onAbrir={() => setAberto('orc')}
        titulo="Orçamentos"
        icon={Calculator}
        iconBg="bg-blue-100 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        carregando={orcQ.isLoading}
        erro={orcQ.isError}
        rodape={<>Última atualização: {dataBr(maisRecente(ultimas.map((o) => o.updatedAt)))}</>}
      >
        <Rotulo>Valor total (com BDI)</Rotulo>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100 sm:text-[1.7rem]">{brl(valor)}</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {ultimas.length} {ultimas.length === 1 ? 'orçamento' : 'orçamentos'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Pilula valor={g.elab} label="Em elaboração" classe="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" />
          <Pilula valor={g.aprov} label="Em aprovação" classe="bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300" />
          <Pilula valor={g.ok} label="Aprovados" classe="bg-green-50 text-green-800 dark:bg-green-900/25 dark:text-green-300" />
          <Pilula valor={g.rep} label="Reprovados" classe="bg-red-50 text-red-800 dark:bg-red-900/25 dark:text-red-300" />
        </div>
      </BlocoModulo>
    );
  }

  // ── Cronogramas: anel de avanço + etapas ────────────────────────────────
  if (acesso.cronogramas) {
    const cronos = filtrarCronogramas(ultimas);
    const comProgresso = cronos.filter((o) => o.cronogramaProgressoFisico != null);
    const media = comProgresso.length ? comProgresso.reduce((t, o) => t + num(o.cronogramaProgressoFisico), 0) / comProgresso.length : 0;
    const etapas = cronos.reduce((t, o) => t + num(o.cronogramaTotalEtapas), 0);
    const concluidas = cronos.reduce((t, o) => t + num(o.cronogramaConcluido), 0);
    const atrasadas = cronos.reduce((t, o) => t + num(o.cronogramaAtrasado), 0);
    blocos.push(
      <BlocoModulo
        key="cron"
        onAbrir={() => setAberto('cron')}
        titulo="Cronogramas"
        icon={CalendarRange}
        iconBg="bg-indigo-100 dark:bg-indigo-900/30"
        iconColor="text-indigo-600 dark:text-indigo-400"
        carregando={orcQ.isLoading}
        erro={orcQ.isError}
        rodape={<>Última atualização: {dataBr(maisRecente(cronos.map((o) => o.updatedAt)))}</>}
      >
        <div className="flex items-center gap-5">
          <Anel percent={media} cor="#6366f1" rotulo="Avanço físico médio" />
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <Rotulo>Cronogramas</Rotulo>
              <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{cronos.length}</p>
            </div>
            <div>
              <Rotulo>Etapas concluídas</Rotulo>
              <p className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {etapas > 0 ? `${concluidas} de ${etapas}` : '—'}
              </p>
            </div>
          </div>
        </div>
        <div
          className={`mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold ${
            atrasadas > 0
              ? 'bg-red-50 text-red-800 dark:bg-red-900/25 dark:text-red-300'
              : 'bg-green-50 text-green-800 dark:bg-green-900/25 dark:text-green-300'
          }`}
        >
          <span>{atrasadas > 0 ? 'Etapas atrasadas' : 'Nenhuma etapa atrasada'}</span>
          {atrasadas > 0 ? <span className="tabular-nums">{atrasadas}</span> : null}
        </div>
      </BlocoModulo>
    );
  }

  // ── Diários de Obra: registros dos últimos 14 dias em barras ────────────
  if (acesso.diarios) {
    const rows = diariosQ.data?.rows ?? [];
    const total = diariosQ.data?.total ?? 0;
    const finalizados = rows.filter((d) => d.finalizedAt).length;
    const semAtividade = rows.filter((d) => d.noActivity).length;
    const hoje = new Date();
    const dias: Array<{ chave: string; rotulo: string; qtd: number }> = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dias.push({ chave, rotulo: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), qtd: 0 });
    }
    for (const r of rows) {
      const alvo = dias.find((x) => x.chave === r.date);
      if (alvo) alvo.qtd += 1;
    }
    const ultimos30 = (() => {
      const limite = new Date();
      limite.setDate(limite.getDate() - 30);
      return rows.filter((d) => d.date && new Date(`${d.date}T12:00:00`) >= limite).length;
    })();
    const maxQtd = Math.max(1, ...dias.map((d) => d.qtd));
    blocos.push(
      <BlocoModulo
        key="diarios"
        onAbrir={() => setAberto('diarios')}
        titulo="Diários de Obra"
        icon={BookOpen}
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        iconColor="text-amber-600 dark:text-amber-400"
        carregando={diariosQ.isLoading}
        erro={diariosQ.isError}
        rodape={<>Último registro: {dataBr(rows[0]?.date)}</>}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <Rotulo>Registros</Rotulo>
            <p className="text-3xl font-bold tabular-nums leading-tight text-gray-900 dark:text-gray-100">{total}</p>
          </div>
          <div className="text-right">
            <Rotulo>Últimos 30 dias</Rotulo>
            <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{ultimos30}</p>
          </div>
        </div>
        <div className="mt-4">
          <Rotulo>Últimos 14 dias</Rotulo>
          <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label="Registros por dia nos últimos 14 dias">
            {dias.map((d) => (
              <div key={d.chave} className="flex h-full flex-1 items-end" title={`${d.rotulo}: ${d.qtd} registro(s)`}>
                <div
                  className={`w-full rounded-t ${d.qtd > 0 ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                  style={{ height: d.qtd > 0 ? `${Math.max(18, (d.qtd / maxQtd) * 100)}%` : '6%' }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
          <span>
            <strong className="tabular-nums text-green-700 dark:text-green-400">{finalizados}</strong> finalizados
          </span>
          <span>
            <strong className="tabular-nums text-amber-700 dark:text-amber-400">{Math.max(0, rows.length - finalizados)}</strong> em preenchimento
          </span>
          <span>
            <strong className="tabular-nums text-gray-700 dark:text-gray-200">{semAtividade}</strong> sem atividade
          </span>
        </div>
      </BlocoModulo>
    );
  }

  // ── Obras: obras ativas em lista ────────────────────────────────────────
  if (acesso.obras) {
    const obras = obrasQ.data ?? [];
    const ativas = obras.filter((o) => o.isActive !== false);
    blocos.push(
      <BlocoModulo
        key="obras"
        onAbrir={() => setAberto('obras')}
        titulo="Obras"
        icon={HardHat}
        iconBg="bg-orange-100 dark:bg-orange-900/30"
        iconColor="text-orange-600 dark:text-orange-400"
        carregando={obrasQ.isLoading}
        erro={obrasQ.isError}
        rodape={
          <>
            {obras.length} {obras.length === 1 ? 'obra cadastrada' : 'obras cadastradas'} · {obras.length - ativas.length} inativa(s)
          </>
        }
      >
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold tabular-nums leading-tight text-gray-900 dark:text-gray-100">{ativas.length}</p>
          <p className="pb-1 text-sm text-gray-500 dark:text-gray-400">{ativas.length === 1 ? 'obra ativa' : 'obras ativas'}</p>
        </div>
        {ativas.length ? (
          <ul className="mt-4 space-y-2">
            {ativas.slice(0, 4).map((o) => (
              <li key={o.id} className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:bg-gray-800/60 dark:text-gray-100">
                <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
                <span className="truncate font-medium">{o.name || 'Obra sem nome'}</span>
              </li>
            ))}
            {ativas.length > 4 ? (
              <li className="px-1 text-xs font-medium text-gray-500 dark:text-gray-400">+ {ativas.length - 4} obra(s)</li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">Nenhuma obra ativa.</p>
        )}
      </BlocoModulo>
    );
  }

  // ── Fichas de Demanda: faturamento x custo estimados ────────────────────
  if (acesso.fichasDemanda) {
    const fds = fdQ.data ?? [];
    const por = { aguardando: 0, aprovadas: 0, rejeitadas: 0 };
    let faturamento = 0;
    let custo = 0;
    for (const f of fds) {
      if (f.status === 'WAITING_MANAGER') por.aguardando += 1;
      else if (f.status === 'APPROVED') por.aprovadas += 1;
      else por.rejeitadas += 1;
      faturamento += num(f.faturamentoEstimado);
      custo += num(f.custoEstimado);
    }
    const maior = Math.max(faturamento, custo, 1);
    const margem = faturamento > 0 ? ((faturamento - custo) / faturamento) * 100 : 0;
    blocos.push(
      <BlocoModulo
        key="fd"
        onAbrir={() => setAberto('fd')}
        titulo="Fichas de Demanda"
        icon={ClipboardList}
        iconBg="bg-red-100 dark:bg-red-900/30"
        iconColor="text-red-600 dark:text-red-400"
        carregando={fdQ.isLoading}
        erro={fdQ.isError}
        rodape={
          <>
            <strong className="text-gray-700 dark:text-gray-200">{por.aguardando}</strong> aguardando ·{' '}
            <strong className="text-gray-700 dark:text-gray-200">{por.aprovadas}</strong> aprovadas ·{' '}
            <strong className="text-gray-700 dark:text-gray-200">{por.rejeitadas}</strong> rejeitadas/canceladas
          </>
        }
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <Rotulo>Fichas</Rotulo>
            <p className="text-3xl font-bold tabular-nums leading-tight text-gray-900 dark:text-gray-100">{fds.length}</p>
          </div>
          <div className="rounded-xl bg-green-50 px-3 py-2 text-right dark:bg-green-900/25">
            <p className="text-[11px] font-medium text-green-800 dark:text-green-300">Margem estimada</p>
            <p className="text-lg font-bold tabular-nums text-green-800 dark:text-green-300">
              {faturamento > 0 ? `${margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-500 dark:text-gray-400">Faturamento estimado</span>
              <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">{brl(faturamento)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${(faturamento / maior) * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-gray-500 dark:text-gray-400">Custo estimado</span>
              <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">{brl(custo)}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${(custo / maior) * 100}%` }} />
            </div>
          </div>
        </div>
      </BlocoModulo>
    );
  }

  // ── Pedidos de ferramentas: etapas do pedido em barras ──────────────────
  if (acesso.ferramentas) {
    const rows = ferramentasQ.data?.rows ?? [];
    const total = ferramentasQ.data?.total ?? 0;
    const g = { andamento: 0, uso: 0, concluidos: 0, encerrados: 0 };
    for (const r of rows) {
      const s = r.status ?? '';
      if (s === 'IN_USE') g.uso += 1;
      else if (s === 'COMPLETED') g.concluidos += 1;
      else if (s === 'REJECTED' || s === 'CANCELLED') g.encerrados += 1;
      else g.andamento += 1;
    }
    const etapas = [
      { label: 'Em andamento', valor: g.andamento, cor: '#f59e0b' },
      { label: 'Em uso', valor: g.uso, cor: '#3b82f6' },
      { label: 'Concluídos', valor: g.concluidos, cor: '#22c55e' },
      { label: 'Recusados/cancelados', valor: g.encerrados, cor: '#ef4444' },
    ];
    const maxEtapa = Math.max(1, ...etapas.map((e) => e.valor));
    blocos.push(
      <BlocoModulo
        key="ferr"
        onAbrir={() => setAberto('ferr')}
        titulo="Pedidos de Ferramentas"
        icon={Wrench}
        iconBg="bg-cyan-100 dark:bg-cyan-900/30"
        iconColor="text-cyan-600 dark:text-cyan-400"
        carregando={ferramentasQ.isLoading}
        erro={ferramentasQ.isError}
        rodape={<>Última atualização: {dataBr(maisRecente(rows.map((r) => r.updatedAt)))}</>}
      >
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold tabular-nums leading-tight text-gray-900 dark:text-gray-100">{total}</p>
          <p className="pb-1 text-sm text-gray-500 dark:text-gray-400">{total === 1 ? 'pedido' : 'pedidos'}</p>
        </div>
        <ul className="mt-4 space-y-3">
          {etapas.map((e) => (
            <li key={e.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-medium text-gray-600 dark:text-gray-300">{e.label}</span>
                <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">{e.valor}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div className="h-full rounded-full" style={{ width: `${(e.valor / maxEtapa) * 100}%`, backgroundColor: e.cor }} />
              </div>
            </li>
          ))}
        </ul>
      </BlocoModulo>
    );
  }

  // ── Janela de detalhes (abre ao clicar num bloco) ───────────────────────
  let janela: { titulo: string; conteudo: React.ReactNode } | null = null;
  if (aberto === 'orc') {
    const rows = [...ultimas].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    janela = {
      titulo: 'Orçamentos do contrato',
      conteudo: (
        <div className="space-y-4">
          <ChipsModal
            itens={[
              { rotulo: 'Orçamentos', valor: String(rows.length) },
              { rotulo: 'Valor total (com BDI)', valor: brl(rows.reduce((t, o) => t + num(o.totalComBdi), 0)) },
            ]}
          />
          <TabelaModal
            vazio="Nenhum orçamento neste contrato"
            colunas={[{ titulo: 'Orçamento' }, { titulo: 'Situação' }, { titulo: 'Valor (com BDI)', alinhar: 'right' }, { titulo: 'Atualizado', alinhar: 'right' }]}
            linhas={rows.map((o) => {
              const st = STATUS_ORCAMENTO[statusNorm(o.statusAprovacao)] ?? STATUS_ORCAMENTO.rascunho;
              return {
                chave: o.id,
                celulas: [
                  <span key="n" className="font-medium">{o.nome || 'Sem nome'}</span>,
                  <Selo key="s" texto={st.label} classe={st.classe} />,
                  <span key="v" className="tabular-nums">{brl(num(o.totalComBdi))}</span>,
                  <span key="d" className="tabular-nums text-gray-500 dark:text-gray-400">{dataBr(o.updatedAt)}</span>,
                ],
              };
            })}
          />
        </div>
      ),
    };
  } else if (aberto === 'cron') {
    const rows = filtrarCronogramas(ultimas);
    janela = {
      titulo: 'Cronogramas do contrato',
      conteudo: (
        <div className="space-y-4">
          <ChipsModal
            itens={[
              { rotulo: 'Cronogramas', valor: String(rows.length) },
              { rotulo: 'Etapas atrasadas', valor: String(rows.reduce((t, o) => t + num(o.cronogramaAtrasado), 0)) },
            ]}
          />
          <TabelaModal
            vazio="Nenhum cronograma neste contrato"
            colunas={[{ titulo: 'Cronograma' }, { titulo: 'Avanço físico' }, { titulo: 'Etapas', alinhar: 'right' }, { titulo: 'Atrasadas', alinhar: 'right' }]}
            linhas={rows.map((o) => {
              const p = Math.max(0, Math.min(100, num(o.cronogramaProgressoFisico)));
              const atras = num(o.cronogramaAtrasado);
              return {
                chave: o.id,
                celulas: [
                  <span key="n" className="font-medium">{o.nome || 'Sem nome'}</span>,
                  <div key="p" className="flex min-w-[9rem] items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${p}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold tabular-nums">{p.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>
                  </div>,
                  <span key="e" className="tabular-nums">{num(o.cronogramaTotalEtapas) > 0 ? `${num(o.cronogramaConcluido)} de ${num(o.cronogramaTotalEtapas)}` : '—'}</span>,
                  <span key="a" className={`font-semibold tabular-nums ${atras > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{atras}</span>,
                ],
              };
            })}
          />
        </div>
      ),
    };
  } else if (aberto === 'diarios') {
    const rows = diariosQ.data?.rows ?? [];
    const total = diariosQ.data?.total ?? 0;
    janela = {
      titulo: 'Diários de Obra do contrato',
      conteudo: (
        <div className="space-y-4">
          <ChipsModal
            itens={[
              { rotulo: 'Registros', valor: String(total) },
              { rotulo: 'Finalizados', valor: String(rows.filter((d) => d.finalizedAt).length) },
              { rotulo: 'Em preenchimento', valor: String(rows.filter((d) => !d.finalizedAt).length) },
            ]}
          />
          <TabelaModal
            vazio="Nenhum diário de obra neste contrato"
            colunas={[{ titulo: 'Data' }, { titulo: 'Obra' }, { titulo: 'Situação' }]}
            linhas={rows.map((d, i) => ({
              chave: d.id ?? `${d.date}-${i}`,
              celulas: [
                <span key="d" className="font-medium tabular-nums">{dataBr(d.date)}</span>,
                <span key="o">{d.obraName || '—'}</span>,
                d.noActivity ? (
                  <Selo key="s" texto="Sem atividade" classe="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" />
                ) : d.finalizedAt ? (
                  <Selo key="s" texto="Finalizado" classe="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" />
                ) : (
                  <Selo key="s" texto="Em preenchimento" classe="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" />
                ),
              ],
            }))}
          />
          {total > rows.length ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Mostrando os {rows.length} registros mais recentes de {total}.</p>
          ) : null}
        </div>
      ),
    };
  } else if (aberto === 'obras') {
    const rows = [...(obrasQ.data ?? [])].sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false));
    janela = {
      titulo: 'Obras do contrato',
      conteudo: (
        <div className="space-y-4">
          <ChipsModal
            itens={[
              { rotulo: 'Obras', valor: String(rows.length) },
              { rotulo: 'Ativas', valor: String(rows.filter((o) => o.isActive !== false).length) },
              { rotulo: 'Inativas', valor: String(rows.filter((o) => o.isActive === false).length) },
            ]}
          />
          <TabelaModal
            vazio="Nenhuma obra neste contrato"
            colunas={[{ titulo: 'Obra' }, { titulo: 'Situação' }]}
            linhas={rows.map((o) => ({
              chave: o.id,
              celulas: [
                <span key="n" className="font-medium">{o.name || 'Obra sem nome'}</span>,
                o.isActive === false ? (
                  <Selo key="s" texto="Inativa" classe="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200" />
                ) : (
                  <Selo key="s" texto="Ativa" classe="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" />
                ),
              ],
            }))}
          />
        </div>
      ),
    };
  } else if (aberto === 'fd') {
    const rows = [...(fdQ.data ?? [])].sort(
      (a, b) => new Date(b.dataHora ?? b.createdAt ?? 0).getTime() - new Date(a.dataHora ?? a.createdAt ?? 0).getTime()
    );
    janela = {
      titulo: 'Fichas de Demanda do contrato',
      conteudo: (
        <div className="space-y-4">
          <ChipsModal
            itens={[
              { rotulo: 'Fichas', valor: String(rows.length) },
              { rotulo: 'Faturamento estimado', valor: brl(rows.reduce((t, f) => t + num(f.faturamentoEstimado), 0)) },
              { rotulo: 'Custo estimado', valor: brl(rows.reduce((t, f) => t + num(f.custoEstimado), 0)) },
            ]}
          />
          <TabelaModal
            vazio="Nenhuma ficha de demanda neste contrato"
            colunas={[
              { titulo: 'Ficha' },
              { titulo: 'Obra' },
              { titulo: 'Situação' },
              { titulo: 'Faturamento est.', alinhar: 'right' },
              { titulo: 'Custo est.', alinhar: 'right' },
              { titulo: 'Data', alinhar: 'right' },
            ]}
            linhas={rows.map((f, i) => {
              const st = STATUS_FD[f.status ?? ''] ?? { label: f.status || '—', classe: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' };
              return {
                chave: f.id ?? `${f.codFichaDemanda}-${i}`,
                celulas: [
                  <span key="c" className="font-medium">{f.codFichaDemanda || '—'}</span>,
                  <span key="o">{f.obra || '—'}</span>,
                  <Selo key="s" texto={st.label} classe={st.classe} />,
                  <span key="f" className="tabular-nums">{brl(num(f.faturamentoEstimado))}</span>,
                  <span key="k" className="tabular-nums">{brl(num(f.custoEstimado))}</span>,
                  <span key="d" className="tabular-nums text-gray-500 dark:text-gray-400">{dataBr(f.dataHora ?? f.createdAt)}</span>,
                ],
              };
            })}
          />
        </div>
      ),
    };
  } else if (aberto === 'ferr') {
    const rows = ferramentasQ.data?.rows ?? [];
    const total = ferramentasQ.data?.total ?? 0;
    janela = {
      titulo: 'Pedidos de ferramentas do contrato',
      conteudo: (
        <div className="space-y-4">
          <ChipsModal
            itens={[
              { rotulo: 'Pedidos', valor: String(total) },
              { rotulo: 'Em uso', valor: String(rows.filter((r) => r.status === 'IN_USE').length) },
              { rotulo: 'Concluídos', valor: String(rows.filter((r) => r.status === 'COMPLETED').length) },
            ]}
          />
          <TabelaModal
            vazio="Nenhum pedido de ferramentas neste contrato"
            colunas={[{ titulo: 'Código' }, { titulo: 'Pedido' }, { titulo: 'Obra' }, { titulo: 'Situação' }, { titulo: 'Atualizado', alinhar: 'right' }]}
            linhas={rows.map((r, i) => {
              const st = STATUS_FERRAMENTA[r.status ?? ''] ?? { label: r.status || '—', classe: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200' };
              return {
                chave: r.id ?? `${r.code}-${i}`,
                celulas: [
                  <span key="c" className="font-medium tabular-nums">{r.code || '—'}</span>,
                  <span key="t">{r.titulo || '—'}</span>,
                  <span key="o">{r.obra || '—'}</span>,
                  <Selo key="s" texto={st.label} classe={st.classe} />,
                  <span key="d" className="tabular-nums text-gray-500 dark:text-gray-400">{dataBr(r.updatedAt)}</span>,
                ],
              };
            })}
          />
          {total > rows.length ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Mostrando os {rows.length} pedidos mais recentes de {total}.</p>
          ) : null}
        </div>
      ),
    };
  }

  if (blocos.length === 0) return null;

  // Larguras diferentes (grade de 12 colunas): cada linha soma 12, então nunca sobra espaço vazio.
  // Linhas de 3 blocos alternam entre 5-4-3 e 3-5-4; a última linha incompleta se estica (7-5 ou 12).
  const spanClasse: Record<number, string> = {
    3: 'xl:col-span-3',
    4: 'xl:col-span-4',
    5: 'xl:col-span-5',
    7: 'xl:col-span-7',
    12: 'xl:col-span-12',
  };
  const padroes = [
    [5, 4, 3],
    [3, 5, 4],
  ];
  const spans: number[] = [];
  for (let ini = 0, linha = 0; ini < blocos.length; ini += 3, linha += 1) {
    const qtd = Math.min(3, blocos.length - ini);
    if (qtd === 3) spans.push(...padroes[linha % padroes.length]);
    else if (qtd === 2) spans.push(7, 5);
    else spans.push(12);
  }
  return (
    <>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-12">
        {blocos.map((b, i) => (
          <div key={(b as React.ReactElement).key ?? i} className={`flex min-w-0 [&>*]:w-full ${spanClasse[spans[i]]}`}>
            {b}
          </div>
        ))}
      </div>
      <Modal isOpen={janela != null} onClose={() => setAberto(null)} title={janela?.titulo ?? ''} size="xl">
        {janela?.conteudo}
      </Modal>
    </>
  );
}
