'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  HardHat,
  ListChecks,
  Lock,
  Plus,
  Save,
  Search,
  Trash2,
  TrendingDown,
  Unlock,
  User,
  Wallet,
} from 'lucide-react';

/** Uma cotação feita com um empreiteiro. */
export type CotacaoEmpreiteiro = {
  id: string;
  nome: string;
  documento: string;
  telefone: string;
  valor: string;
  condicoesPagamento: string;
  servicos: string;
  prazoEntrega: string;
  email: string;
  endereco: string;
  /** Fornecedor que será de fato contratado nesta empreita (no máximo um por empreita). */
  escolhida?: boolean;
};

/** Uma empreita (serviço a contratar) com as cotações recebidas e os itens da FD que ela atende. */
export type EmpreitaCotada = { id: string; nome: string; cotacoes: CotacaoEmpreiteiro[]; itensFd: string[] };

/** Etapa da FD com seus itens (insumos), para associar à empreita. */
export type EtapaFd = { key: string; numero: string; nome: string; itens: { key: string; item: string; descricao: string }[] };

export type CotacaoEmpreitaData = {
  empreitas: EmpreitaCotada[];
  /** Finalizada: depois disso só o gestor do contrato e o administrador alteram. */
  finalizada?: { por: string; em: string };
};

const MIN_COTACOES = 3;

const novoId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const digitos = (v: string) => String(v ?? '').replace(/\D/g, '');

export function cpfValido(v: string): boolean {
  const c = digitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoIni: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoIni - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export function cnpjValido(v: string): boolean {
  const c = digitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

const documentoValido = (v: string) => {
  const d = digitos(v);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
};

function mascaraDocumento(v: string): string {
  const d = digitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function mascaraTelefone(v: string): string {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function valorCotacao(v: string): number {
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  return s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
}

/** Prazo em dias a partir do texto ("10", "45 dias", "2 semanas", "3 meses"); NaN se não der para ler. */
export function prazoEmDias(texto: string): number {
  const t = String(texto ?? '').toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return NaN;
  const n = Number(m[1]!.replace(',', '.'));
  if (/semana/.test(t)) return n * 7;
  if (/m[eê]s|meses/.test(t)) return n * 30;
  if (/ano/.test(t)) return n * 365;
  return n;
}

const brl = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

/** E-mail é opcional; se preenchido, tem que estar no formato nome@dominio.ext. */
export const emailValido = (v: string) => {
  const t = String(v ?? '').trim();
  return !t || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
};

/** Campos obrigatórios que faltam numa cotação (rótulos). */
function faltasCotacao(c: CotacaoEmpreiteiro): string[] {
  const f: string[] = [];
  if (!c.nome.trim()) f.push('nome');
  if (!documentoValido(c.documento)) f.push('CPF/CNPJ válido');
  if (digitos(c.telefone).length < 10) f.push('telefone');
  if (!(valorCotacao(c.valor) > 0)) f.push('valor');
  if (!c.condicoesPagamento.trim()) f.push('condições de pagamento');
  if (!c.servicos.trim()) f.push('serviços');
  if (!c.prazoEntrega.trim()) f.push('prazo de entrega');
  if (!emailValido(c.email)) f.push('e-mail no formato válido');
  return f;
}

/** Pendências de uma empreita para a cotação ficar completa. */
function pendenciasEmpreita(e: EmpreitaCotada): string[] {
  const p: string[] = [];
  if (!e.nome.trim()) p.push('informe o nome da empreita');
  const incompletas = e.cotacoes.filter((c) => faltasCotacao(c).length > 0).length;
  if (incompletas > 0) p.push(`${incompletas} cotação(ões) com campos obrigatórios faltando`);
  const docs = e.cotacoes.filter((c) => faltasCotacao(c).length === 0).map((c) => digitos(c.documento));
  const distintos = new Set(docs).size;
  if (docs.length !== distintos) p.push('há cotações repetidas do mesmo empreiteiro (CPF/CNPJ)');
  if (!e.cotacoes.some((c) => c.escolhida)) p.push('marque o fornecedor contratado');
  if (distintos < MIN_COTACOES) {
    const falta = MIN_COTACOES - distintos;
    p.push(`falta${falta > 1 ? 'm' : ''} ${falta} cotação(ões) de empreiteiros diferentes (mínimo ${MIN_COTACOES})`);
  }
  return p;
}

/** Itens da FD associados a empreitas com cotação completa (para a etiqueta "COTAÇÃO REALIZADA" na FD). */
export function itensFdComCotacaoRealizada(d: CotacaoEmpreitaData | undefined): Set<string> {
  const out = new Set<string>();
  for (const e of d?.empreitas ?? []) {
    if (pendenciasEmpreita(e).length > 0) continue;
    for (const k of e.itensFd ?? []) out.add(k);
  }
  return out;
}

export function cotacaoEmpreitaValida(d: CotacaoEmpreitaData | undefined): boolean {
  if (!d || d.empreitas.length === 0) return false;
  return d.empreitas.every((e) => pendenciasEmpreita(e).length === 0);
}

export function parseCotacaoEmpreita(raw: unknown): CotacaoEmpreitaData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const empreitas = Array.isArray(r.empreitas)
    ? (r.empreitas as unknown[])
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map((e) => ({
          id: str(e.id) || novoId(),
          nome: str(e.nome),
          itensFd: Array.isArray(e.itensFd) ? (e.itensFd as unknown[]).map(str).filter(Boolean) : [],
          cotacoes: Array.isArray(e.cotacoes)
            ? (e.cotacoes as unknown[])
                .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
                .map((c) => ({
                  id: str(c.id) || novoId(),
                  nome: str(c.nome),
                  documento: str(c.documento),
                  telefone: str(c.telefone),
                  valor: str(c.valor),
                  condicoesPagamento: str(c.condicoesPagamento),
                  servicos: str(c.servicos),
                  prazoEntrega: str(c.prazoEntrega),
                  email: str(c.email),
                  endereco: str(c.endereco),
                  ...(c.escolhida === true ? { escolhida: true } : {}),
                }))
            : [],
        }))
    : [];
  const fin = r.finalizada as { por?: unknown; em?: unknown } | undefined;
  return {
    empreitas,
    ...(fin && typeof fin === 'object' && fin.em ? { finalizada: { por: str(fin.por), em: str(fin.em) } } : {}),
  };
}

const cotacaoVazia = (): CotacaoEmpreiteiro => ({
  id: novoId(),
  nome: '',
  documento: '',
  telefone: '',
  valor: '',
  condicoesPagamento: '',
  servicos: '',
  prazoEntrega: '',
  email: '',
  endereco: '',
});

/** Menu suspenso com as etapas e os itens da FD (checkbox por item; a etapa marca/desmarca todos). */
function SeletorItensFd({
  etapas,
  selecionados,
  disabled,
  onChange,
}: {
  etapas: EtapaFd[];
  selecionados: string[];
  disabled: boolean;
  onChange: (keys: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  /** Etapas abertas — por padrão todas recolhidas; com busca, abrem as que têm resultado. */
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set());
  const ref = useRef<HTMLDivElement>(null);
  const sel = useMemo(() => new Set(selecionados), [selecionados]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const termo = busca.trim().toLowerCase();
  const filtradas = etapas
    .map((et) => ({
      ...et,
      itens: termo
        ? et.itens.filter(
            (i) => `${i.item} ${i.descricao}`.toLowerCase().includes(termo) || et.nome.toLowerCase().includes(termo)
          )
        : et.itens,
    }))
    .filter((et) => et.itens.length > 0);

  const alternar = (keys: string[], marcar: boolean) => {
    const next = new Set(sel);
    for (const k of keys) {
      if (marcar) next.add(k);
      else next.delete(k);
    }
    onChange([...next]);
  };
  const alternarEtapa = (key: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const etapasComSelecao = etapas
    .map((et) => ({ et, n: et.itens.filter((i) => sel.has(i.key)).length }))
    .filter((x) => x.n > 0);

  return (
    <div ref={ref} className="relative w-full max-w-3xl flex-1">
      <button
        type="button"
        disabled={disabled && selecionados.length === 0}
        onClick={() => setAberto((v) => !v)}
        className={`flex min-h-[2.5rem] w-full items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-800 dark:hover:bg-gray-700 ${
          aberto ? 'border-red-400 ring-2 ring-red-500/20' : 'border-gray-300 dark:border-gray-600'
        }`}
        aria-expanded={aberto}
      >
        <ListChecks className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
        {etapasComSelecao.length === 0 ? (
          <span className="flex-1 truncate text-gray-500 dark:text-gray-400">Associar etapas e itens da FD</span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {etapasComSelecao.map(({ et, n }) => (
              <span
                key={et.key}
                className="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
                title={`${et.numero} ${et.nome}: ${n} de ${et.itens.length} item(ns)`}
              >
                <span className="font-bold tabular-nums">{et.numero}</span>
                <span className="truncate">{et.nome}</span>
                <span className="shrink-0 tabular-nums opacity-70">
                  {n}/{et.itens.length}
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {aberto ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
            <div>
              <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Itens da Ficha de Demanda</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Abra as etapas e marque os itens que esta empreita atende.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white">
              {selecionados.length} selecionado(s)
            </span>
          </div>

          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar etapa ou item..."
                className="h-8 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[26rem] space-y-1.5 overflow-y-auto p-3">
            {filtradas.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {etapas.length === 0 ? 'A FD ainda não tem itens.' : 'Nenhum item encontrado.'}
              </p>
            ) : (
              filtradas.map((et) => {
                const keys = et.itens.map((i) => i.key);
                const marcados = keys.filter((k) => sel.has(k)).length;
                const estado = marcados === 0 ? 'nenhum' : marcados === keys.length ? 'todos' : 'parcial';
                const aberta = !!termo || expandidas.has(et.key);
                const pct = keys.length ? (marcados / keys.length) * 100 : 0;
                return (
                  <div
                    key={et.key}
                    className={`overflow-hidden rounded-lg border transition-colors ${
                      estado === 'nenhum'
                        ? 'border-gray-200 dark:border-gray-700'
                        : 'border-red-200 dark:border-red-900/60'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-3 px-3 py-1.5 ${
                        aberta ? 'bg-gray-50 dark:bg-gray-800/80' : 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={estado === 'todos'}
                        ref={(el) => {
                          if (el) el.indeterminate = estado === 'parcial';
                        }}
                        onChange={(e) => alternar(keys, e.target.checked)}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-red-600"
                        aria-label={`Marcar todos os itens de ${et.nome}`}
                      />
                      <button
                        type="button"
                        onClick={() => alternarEtapa(et.key)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        aria-expanded={aberta}
                      >
                        <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-md bg-red-50 px-1.5 text-xs font-bold tabular-nums text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          {et.numero}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold uppercase text-gray-900 dark:text-gray-100">
                            {et.nome}
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="h-1 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                              <span
                                className={`block h-full rounded-full ${estado === 'todos' ? 'bg-emerald-500' : 'bg-red-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                              {marcados} de {keys.length} item(ns)
                            </span>
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberta ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {aberta ? (
                      <ul className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                        {et.itens.map((i) => {
                          const marcado = sel.has(i.key);
                          return (
                            <li key={i.key}>
                              <label
                                className={`flex cursor-pointer items-start gap-2.5 py-1.5 pl-10 pr-3 text-xs transition-colors ${
                                  marcado
                                    ? 'bg-red-50/70 dark:bg-red-950/20'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={disabled}
                                  checked={marcado}
                                  onChange={(e) => alternar([i.key], e.target.checked)}
                                  className="mt-px h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-gray-300 accent-red-600"
                                />
                                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-px font-mono text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  {i.item}
                                </span>
                                <span className={`min-w-0 ${marcado ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
                                  {i.descricao}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/80 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/60">
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={disabled || selecionados.length === 0}
              className="text-xs font-medium text-gray-500 hover:text-red-600 disabled:opacity-40 dark:text-gray-400"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Concluir
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const INPUT =
  'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:disabled:bg-gray-800/60';

function Campo({
  rotulo,
  obrigatorio,
  erro,
  children,
  className = '',
}: {
  rotulo: string;
  obrigatorio?: boolean;
  erro?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className={`mb-1 block text-[11px] font-medium ${erro ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
        {rotulo}
        {obrigatorio ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

/** Aba «Cotação Empreita»: empreitas e as cotações com empreiteiros (mínimo de 3 diferentes por empreita). */
export function CotacaoEmpreitaPainel({
  valor,
  onChange,
  podeEditarFinalizada,
  somenteLeitura,
  usuarioNome,
  etapasFd,
  onSalvarRascunho,
  salvandoRascunho,
}: {
  /** Etapas e itens da FD para associar a cada empreita. */
  etapasFd: EtapaFd[];
  /** Grava agora (sem esperar o salvamento automático). */
  onSalvarRascunho: () => void;
  salvandoRascunho: boolean;
  valor: CotacaoEmpreitaData;
  onChange: (next: CotacaoEmpreitaData) => void;
  /** Pode reabrir a cotação finalizada: administrador, gestor do contrato ou quem destranca orçamento. */
  podeEditarFinalizada: boolean;
  /** Revisão congelada: só leitura. */
  somenteLeitura: boolean;
  usuarioNome: string;
}) {
  const [confirmarFinalizar, setConfirmarFinalizar] = useState(false);
  /** Empreita recém-criada: rola até ela e põe o cursor no nome. */
  const [focarEmpreitaId, setFocarEmpreitaId] = useState<string | null>(null);
  useEffect(() => {
    if (!focarEmpreitaId) return;
    const id = window.requestAnimationFrame(() => {
      const el = document.getElementById(`empreita-${focarEmpreitaId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.querySelector<HTMLInputElement>('input[aria-label="Nome da empreita"]')?.focus({ preventScroll: true });
      }
      setFocarEmpreitaId(null);
    });
    return () => window.cancelAnimationFrame(id);
  }, [focarEmpreitaId, valor.empreitas.length]);
  const finalizada = !!valor.finalizada;
  // Finalizada = travada para todos; quem pode (admin, gestor do contrato ou quem destranca orçamento) reabre.
  const editavel = !somenteLeitura && !finalizada;
  const [confirmarReabrir, setConfirmarReabrir] = useState(false);
  const valida = useMemo(() => cotacaoEmpreitaValida(valor), [valor]);
  /** Gasto com empreita: soma dos fornecedores marcados como "será utilizado". */
  const gastoEmpreita = useMemo(() => {
    let total = 0;
    let escolhidas = 0;
    for (const e of valor.empreitas) {
      const c = e.cotacoes.find((x) => x.escolhida);
      if (!c) continue;
      const v = valorCotacao(c.valor);
      if (v > 0) {
        total += v;
        escolhidas += 1;
      }
    }
    return { total, escolhidas, empreitas: valor.empreitas.length };
  }, [valor]);

  const setEmpreitas = (fn: (e: EmpreitaCotada[]) => EmpreitaCotada[]) =>
    onChange({ ...valor, empreitas: fn(valor.empreitas) });
  const setEmpreita = (id: string, patch: Partial<EmpreitaCotada>) =>
    setEmpreitas((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const setCotacao = (empId: string, cotId: string, patch: Partial<CotacaoEmpreiteiro>) =>
    setEmpreitas((list) =>
      list.map((e) =>
        e.id === empId ? { ...e, cotacoes: e.cotacoes.map((c) => (c.id === cotId ? { ...c, ...patch } : c)) } : e
      )
    );

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-[96rem] space-y-4 px-1 py-2">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white px-5 py-4 shadow-sm dark:border-indigo-800/60 dark:from-indigo-950/40 dark:to-gray-900">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Wallet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Gasto com empreita</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{brl(gastoEmpreita.total)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Soma dos fornecedores contratados · {gastoEmpreita.escolhidas} de {gastoEmpreita.empreitas}{' '}
              empreita(s) com fornecedor contratado
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>ATENÇÃO:</strong> O preenchimento da cotação não é obrigatório para solicitar materiais. Caso ela
            não seja preenchida, será exibido um alerta ao aprovador da RM.
          </p>
        </div>

        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border-2 border-red-500 bg-red-50 px-5 py-4 shadow-sm dark:border-red-600 dark:bg-red-950/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-bold uppercase leading-snug tracking-wide text-red-700 sm:text-base dark:text-red-300">
            Para aprovação da RM, o gestor do contrato deverá entrar em contato e checar todas as cotações. Utilize
            fornecedores confiáveis.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-red-50 p-2 dark:bg-red-950/40">
              <HardHat className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cotação Empreita</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Para cada empreita, registre no mínimo {MIN_COTACOES} cotações com empreiteiros diferentes.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {finalizada ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Finalizada{valor.finalizada?.por ? ` por ${valor.finalizada.por}` : ''}
                {valor.finalizada?.em
                  ? ` em ${new Date(valor.finalizada.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                  : ''}
              </span>
            ) : (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  valida
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                {valida ? 'Completa · falta finalizar' : 'Incompleta'}
              </span>
            )}
            {editavel ? (
              <button
                type="button"
                onClick={() => {
                  const id = novoId();
                  setEmpreitas((list) => [...list, { id, nome: '', cotacoes: [cotacaoVazia()], itensFd: [] }]);
                  setFocarEmpreitaId(id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Empreita
              </button>
            ) : null}
            {editavel ? (
              <button
                type="button"
                onClick={onSalvarRascunho}
                disabled={salvandoRascunho}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                {salvandoRascunho ? 'Salvando…' : 'Salvar rascunho'}
              </button>
            ) : null}
            {finalizada && podeEditarFinalizada && !somenteLeitura ? (
              <button
                type="button"
                onClick={() => setConfirmarReabrir(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-600 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
              >
                <Unlock className="h-3.5 w-3.5" aria-hidden />
                Reabrir cotação
              </button>
            ) : null}
            {!finalizada && !somenteLeitura ? (
              <button
                type="button"
                onClick={() => setConfirmarFinalizar(true)}
                disabled={!valida}
                title={valida ? 'Finalizar a cotação' : 'Complete as cotações para finalizar'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-600 dark:bg-teal-700"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Finalizar cotação
              </button>
            ) : null}
          </div>
        </div>

        {!finalizada && !valida && valor.empreitas.length > 0 ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">Para finalizar a cotação, falta:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {valor.empreitas.map((e, i) => {
                const pend = pendenciasEmpreita(e);
                return pend.length > 0 ? (
                  <li key={e.id}>
                    <strong>{e.nome.trim() || `Empreita ${i + 1}`}:</strong> {pend.join('; ')}
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        ) : null}

        <p className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Depois de finalizada, a cotação fica travada para edição. Somente o administrador, o gestor do contrato ou
          quem tem permissão para destrancar orçamentos pode reabri-la para editar.
          {finalizada
            ? podeEditarFinalizada
              ? ' Esta cotação está finalizada: use "Reabrir cotação" para editar.'
              : ' Esta cotação está finalizada: só leitura.'
            : ''}
        </p>

        {valor.empreitas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Nenhuma empreita cadastrada. {editavel ? 'Clique em "+ Empreita" para começar.' : ''}
          </div>
        ) : null}

        {valor.empreitas.map((emp, idxEmp) => {
          const pend = pendenciasEmpreita(emp);
          const valores = emp.cotacoes.map((c) => valorCotacao(c.valor)).filter((n) => n > 0);
          const menor = valores.length ? Math.min(...valores) : NaN;
          const comValor = emp.cotacoes.filter((c) => valorCotacao(c.valor) > 0);
          const maisBarata = comValor.length
            ? comValor.reduce((a, b) => (valorCotacao(b.valor) < valorCotacao(a.valor) ? b : a))
            : null;
          const comPrazo = emp.cotacoes.filter((c) => prazoEmDias(c.prazoEntrega) > 0);
          const maisRapida = comPrazo.length
            ? comPrazo.reduce((a, b) => (prazoEmDias(b.prazoEntrega) < prazoEmDias(a.prazoEntrega) ? b : a))
            : null;
          const menorPrazo = maisRapida ? prazoEmDias(maisRapida.prazoEntrega) : NaN;
          const escolhida = emp.cotacoes.find((c) => c.escolhida) ?? null;
          const contagemDoc = new Map<string, number>();
          for (const c of emp.cotacoes) {
            const d = digitos(c.documento);
            if (d.length >= 11) contagemDoc.set(d, (contagemDoc.get(d) ?? 0) + 1);
          }
          return (
            <section key={emp.id} id={`empreita-${emp.id}`} className="scroll-mt-4 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-red-50 px-1.5 text-xs font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  {idxEmp + 1}
                </span>
                <input
                  value={emp.nome}
                  onChange={(e) => setEmpreita(emp.id, { nome: e.target.value })}
                  disabled={!editavel}
                  placeholder="Nome da empreita (ex.: Pintura de paredes) *"
                  className={`${INPUT} max-w-xl font-semibold`}
                  aria-label="Nome da empreita"
                />
                <SeletorItensFd
                  etapas={etapasFd}
                  selecionados={emp.itensFd}
                  disabled={!editavel}
                  onChange={(keys) => setEmpreita(emp.id, { itensFd: keys })}
                />
                <span
                  className={`basis-full text-xs font-medium ${
                    pend.length === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {pend.length === 0 ? '✓ Empreita completa' : pend.join(' · ')}
                </span>
                {maisBarata || maisRapida || escolhida ? (
                  <div className="flex basis-full flex-wrap gap-2">
                    {escolhida ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-800 dark:border-indigo-700/60 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        Fornecedor contratado: <strong>{escolhida.nome || 'sem nome'}</strong>
                        {valorCotacao(escolhida.valor) > 0 ? ` · ${brl(valorCotacao(escolhida.valor))}` : ''}
                        {escolhida.prazoEntrega.trim() ? ` · ${escolhida.prazoEntrega.trim()}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                        Nenhum fornecedor contratado ainda
                      </span>
                    )}
                    {maisBarata ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                        Mais barato: <strong>{maisBarata.nome || 'sem nome'}</strong> · {brl(valorCotacao(maisBarata.valor))}
                      </span>
                    ) : null}
                    {maisRapida ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-300">
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        Prazo mais curto: <strong>{maisRapida.nome || 'sem nome'}</strong> ·{' '}
                        {menorPrazo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dia(s)
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {editavel ? (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEmpreita(emp.id, { cotacoes: [...emp.cotacoes, cotacaoVazia()] })}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Cotação
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Excluir a empreita "${emp.nome || idxEmp + 1}" e suas cotações?`)) {
                          setEmpreitas((list) => list.filter((e) => e.id !== emp.id));
                        }
                      }}
                      className="rounded-md p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                      aria-label="Excluir empreita"
                      title="Excluir empreita"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-3">
                {emp.cotacoes.map((c, idxCot) => {
                  const faltas = faltasCotacao(c);
                  const v = valorCotacao(c.valor);
                  const ehMenor = v > 0 && v === menor && valores.length > 1;
                  const ehMaisRapida =
                    comPrazo.length > 1 && prazoEmDias(c.prazoEntrega) > 0 && prazoEmDias(c.prazoEntrega) === menorPrazo;
                  const docDig = digitos(c.documento);
                  const docRepetido = docDig.length >= 11 && (contagemDoc.get(docDig) ?? 0) > 1;
                  return (
                    <div
                      key={c.id}
                      className={`rounded-xl border bg-gray-50/60 p-4 shadow-sm dark:bg-gray-900/40 ${
                        c.escolhida
                          ? 'border-indigo-500 ring-2 ring-indigo-500/40 dark:border-indigo-500'
                          : ehMenor
                            ? 'border-emerald-400 ring-1 ring-emerald-400/40 dark:border-emerald-700'
                            : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Cotação {idxCot + 1}
                          {ehMenor ? (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                              MENOR VALOR
                            </span>
                          ) : null}
                          {ehMaisRapida ? (
                            <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
                              MENOR PRAZO
                            </span>
                          ) : null}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] ${faltas.length === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
                          >
                            {faltas.length === 0 ? 'Completa' : `Falta: ${faltas.join(', ')}`}
                          </span>
                          {editavel ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm('Excluir esta cotação?')) {
                                  setEmpreita(emp.id, { cotacoes: emp.cotacoes.filter((x) => x.id !== c.id) });
                                }
                              }}
                              className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                              aria-label="Excluir cotação"
                              title="Excluir cotação"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <label
                        className={`mb-3 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                          c.escolhida
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-200'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700/60'
                        } ${editavel ? '' : 'cursor-not-allowed opacity-80'}`}
                      >
                        <input
                          type="checkbox"
                          checked={!!c.escolhida}
                          disabled={!editavel}
                          onChange={(e) => {
                            const marcar = e.target.checked;
                            // Um só fornecedor escolhido por empreita: marcar este desmarca os outros.
                            setEmpreita(emp.id, {
                              cotacoes: emp.cotacoes.map((x) =>
                                x.id === c.id ? { ...x, escolhida: marcar || undefined } : { ...x, escolhida: undefined }
                              ),
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300 accent-indigo-600"
                        />
                        Fornecedor contratado
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 sm:col-span-2 dark:text-gray-400">
                          <User className="h-3.5 w-3.5" aria-hidden /> Empreiteiro
                        </p>
                        <Campo rotulo="Nome do empreiteiro" obrigatorio erro={!c.nome.trim()} className="sm:col-span-2">
                          <input value={c.nome} disabled={!editavel} onChange={(e) => setCotacao(emp.id, c.id, { nome: e.target.value })} className={INPUT} />
                        </Campo>
                        <Campo
                          rotulo={docRepetido ? 'CPF ou CNPJ (repetido nesta empreita)' : 'CPF ou CNPJ'}
                          obrigatorio
                          erro={!documentoValido(c.documento) || docRepetido}
                        >
                          <input
                            value={c.documento}
                            disabled={!editavel}
                            inputMode="numeric"
                            onChange={(e) => setCotacao(emp.id, c.id, { documento: mascaraDocumento(e.target.value) })}
                            className={INPUT}
                            placeholder="000.000.000-00"
                            title={
                              docRepetido
                                ? 'Outro empreiteiro desta empreita já usa este CPF/CNPJ: cada cotação deve ser de um empreiteiro diferente'
                                : docDig.length >= 11 && !documentoValido(c.documento)
                                  ? 'CPF/CNPJ inválido'
                                  : undefined
                            }
                            style={docRepetido ? { borderColor: '#ef4444' } : undefined}
                          />
                        </Campo>
                        <Campo rotulo="Telefone de contato" obrigatorio erro={digitos(c.telefone).length < 10}>
                          <input
                            value={c.telefone}
                            disabled={!editavel}
                            inputMode="tel"
                            onChange={(e) => setCotacao(emp.id, c.id, { telefone: mascaraTelefone(e.target.value) })}
                            className={INPUT}
                            placeholder="(61) 90000-0000"
                          />
                        </Campo>
                        <Campo rotulo={emailValido(c.email) ? 'E-mail' : 'E-mail (formato inválido)'} erro={!emailValido(c.email)}>
                          <input
                            value={c.email}
                            disabled={!editavel}
                            type="email"
                            onChange={(e) => setCotacao(emp.id, c.id, { email: e.target.value.trim() })}
                            className={`${INPUT} ${emailValido(c.email) ? '' : '!border-red-500'}`}
                            placeholder="nome@empresa.com.br"
                          />
                        </Campo>
                        <Campo rotulo="Endereço">
                          <input value={c.endereco} disabled={!editavel} onChange={(e) => setCotacao(emp.id, c.id, { endereco: e.target.value })} className={INPUT} />
                        </Campo>
                        <p className="mt-2 flex items-center gap-1.5 border-t border-gray-200 pt-3 text-[11px] font-bold uppercase tracking-wide text-gray-500 sm:col-span-2 dark:border-gray-700 dark:text-gray-400">
                          <Wallet className="h-3.5 w-3.5" aria-hidden /> Proposta
                        </p>
                        <Campo rotulo="Valor da empreita (R$)" obrigatorio erro={!(v > 0)}>
                          <input
                            value={c.valor}
                            disabled={!editavel}
                            inputMode="decimal"
                            onChange={(e) => setCotacao(emp.id, c.id, { valor: e.target.value.replace(/[^\d.,]/g, '') })}
                            onBlur={() => {
                              const n = valorCotacao(c.valor);
                              if (n > 0) setCotacao(emp.id, c.id, { valor: n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
                            }}
                            className={INPUT}
                            placeholder="0,00"
                          />
                        </Campo>
                        <Campo rotulo="Prazo para entrega" obrigatorio erro={!c.prazoEntrega.trim()}>
                          <input value={c.prazoEntrega} disabled={!editavel} onChange={(e) => setCotacao(emp.id, c.id, { prazoEntrega: e.target.value })} className={INPUT} placeholder="Ex.: 30 dias" />
                        </Campo>
                        <Campo rotulo="Condições de pagamento" obrigatorio erro={!c.condicoesPagamento.trim()} className="sm:col-span-2">
                          <input value={c.condicoesPagamento} disabled={!editavel} onChange={(e) => setCotacao(emp.id, c.id, { condicoesPagamento: e.target.value })} className={INPUT} placeholder="Ex.: 30% na assinatura e 70% na entrega" />
                        </Campo>
                        <Campo rotulo="Serviços que irá prestar" obrigatorio erro={!c.servicos.trim()} className="sm:col-span-2">
                          <textarea value={c.servicos} disabled={!editavel} rows={2} onChange={(e) => setCotacao(emp.id, c.id, { servicos: e.target.value })} className={`${INPUT} resize-y`} />
                        </Campo>
                      </div>
                    </div>
                  );
                })}
                {emp.cotacoes.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma cotação nesta empreita.</p>
                ) : null}
              </div>
              {valores.length > 0 ? (
                <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  Menor valor: <strong className="text-gray-900 dark:text-gray-100">{brl(menor)}</strong> · Maior valor:{' '}
                  <strong className="text-gray-900 dark:text-gray-100">{brl(Math.max(...valores))}</strong>
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {confirmarFinalizar ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmarFinalizar(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/30">
              <Lock className="h-6 w-6 text-teal-700 dark:text-teal-300" aria-hidden />
            </div>
            <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">Finalizar cotação?</h3>
            <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Depois de finalizada, a cotação fica travada. Para editar, o administrador, o gestor do contrato ou quem
              pode destrancar orçamentos precisa reabri-la.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmarFinalizar(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...valor, finalizada: { por: usuarioNome || '', em: new Date().toISOString() } });
                  setConfirmarFinalizar(false);
                }}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Finalizar cotação
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmarReabrir ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmarReabrir(false)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Unlock className="h-6 w-6 text-amber-700 dark:text-amber-300" aria-hidden />
            </div>
            <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">Reabrir cotação?</h3>
            <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
              A cotação volta a ser editável e deixa de contar como preenchida até ser finalizada de novo. Enquanto isso,
              a aprovação das RMs desta FD mostra o alerta "COTAÇÃO EMPREITA NÃO PREENCHIDA".
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmarReabrir(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...valor, finalizada: undefined });
                  setConfirmarReabrir(false);
                }}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Reabrir cotação
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
