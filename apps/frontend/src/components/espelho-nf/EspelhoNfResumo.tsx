'use client';

import React, { useMemo } from 'react';
import { CheckCircle2, Clock, Coins, Wallet } from 'lucide-react';
import {
  INITIAL_FEDERAL_TAX_RATES,
  mergeFederalTaxStateFromApi,
  type FederalTaxContextKey,
} from '@/components/espelho-nf/EspelhoNfTaxCodeContractFields';
import {
  computeEspelhoValorLiquidoNumero,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  type EspelhoFederalRates,
} from '@/lib/exportEspelhoNfLayout';
import type { EspelhoApprovalStatus } from '@/lib/espelhoNfApproval';

/** Alíquotas federais do código tributário do espelho (contexto habilitado), como no cadastro. */
export function federalRatesForTaxCode(taxCode: unknown): EspelhoFederalRates {
  const tc = (taxCode ?? {}) as {
    federalRatesByContext?: unknown;
    federalTaxContextEnabled?: unknown;
  };
  const fed = mergeFederalTaxStateFromApi(
    tc.federalRatesByContext as never,
    tc.federalTaxContextEnabled as never
  );
  const key = (Object.keys(fed.federalTaxContextEnabled) as FederalTaxContextKey[]).find(
    (k) => fed.federalTaxContextEnabled[k]
  );
  return key ? fed.federalRatesByContext[key] : INITIAL_FEDERAL_TAX_RATES;
}

/** Espelho com o mínimo para o resumo (status, valores e datas). */
export type EspelhoResumoItem = {
  id: string;
  status: EspelhoApprovalStatus;
  measurementAmount?: string;
  taxCodeId?: string;
  createdAt?: string | null;
  finalizedAt?: string | null;
  [k: string]: unknown;
};

/** Data local AAAA-MM-DD de um ISO (para comparar com o filtro de período). */
function ymdLocal(iso: string | null | undefined): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Data usada no período: emissão da NF (finalização) para as finalizadas; criação para as demais. */
export function dataPeriodoEspelho(m: EspelhoResumoItem): string {
  return ymdLocal(m.status === 'FINALIZED' ? m.finalizedAt || m.createdAt : m.createdAt);
}

/** Período de / até (AAAA-MM-DD, vazio = sem limite). */
export function espelhoNoPeriodo(m: EspelhoResumoItem, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  const d = dataPeriodoEspelho(m);
  if (!d) return false;
  if (de && d < de) return false;
  if (ate && d > ate) return false;
  return true;
}

type Cadastros = {
  providers: unknown[];
  takers: unknown[];
  banks: unknown[];
  taxCodes: unknown[];
};

/** Cards: valor bruto emitido, valor líquido, notas pendentes e notas finalizadas. */
export function EspelhoNfResumoCards({
  itens,
  cadastros,
  pendentesDetalhe,
}: {
  itens: EspelhoResumoItem[];
  cadastros: Cadastros;
  /** Texto curto sob o card de pendentes (o que conta como pendente nesta tela). */
  pendentesDetalhe: string;
}) {
  const resumo = useMemo(() => {
    let bruto = 0;
    let liquido = 0;
    let finalizadas = 0;
    let pendentes = 0;
    let brutoPendente = 0;
    for (const m of itens) {
      if (m.status === 'CANCELLED') continue;
      const med = parseEspelhoBrCurrencyToNumber(String(m.measurementAmount ?? '')) ?? 0;
      if (m.status === 'FINALIZED') {
        finalizadas += 1;
        bruto += med;
        const taxCode = (cadastros.taxCodes as Array<{ id?: string }>).find((t) => t?.id === m.taxCodeId);
        const liq = computeEspelhoValorLiquidoNumero(
          m as never,
          cadastros.providers as never,
          cadastros.takers as never,
          cadastros.banks as never,
          cadastros.taxCodes as never,
          federalRatesForTaxCode(taxCode)
        );
        liquido += liq ?? med;
      } else {
        pendentes += 1;
        brutoPendente += med;
      }
    }
    return { bruto, liquido, finalizadas, pendentes, brutoPendente };
  }, [itens, cadastros]);

  const cards = [
    {
      titulo: 'Valor bruto emitido',
      valor: fmtEspelhoBrl(resumo.bruto),
      detalhe: 'Soma da medição das notas finalizadas',
      Icon: Coins,
      cor: 'text-gray-900 dark:text-gray-100',
      icone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    },
    {
      titulo: 'Valor líquido',
      valor: fmtEspelhoBrl(resumo.liquido),
      detalhe: 'Valor final das notas (medição − retenções)',
      Icon: Wallet,
      cor: 'text-emerald-700 dark:text-emerald-400',
      icone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    },
    {
      titulo: 'Notas pendentes',
      valor: String(resumo.pendentes),
      detalhe: `${pendentesDetalhe} · ${fmtEspelhoBrl(resumo.brutoPendente)} a emitir`,
      Icon: Clock,
      cor: 'text-amber-700 dark:text-amber-400',
      icone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    {
      titulo: 'Notas finalizadas',
      valor: String(resumo.finalizadas),
      detalhe: 'Com NF anexada pelo Financeiro',
      Icon: CheckCircle2,
      cor: 'text-blue-700 dark:text-blue-400',
      icone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ titulo, valor, detalhe, Icon, cor, icone }) => (
        <div
          key={titulo}
          className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${icone}`}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{titulo}</p>
            <p className={`mt-0.5 text-xl font-bold tabular-nums ${cor}`}>{valor}</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{detalhe}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Campos de período (de / até) para a janela de filtros. */
export function EspelhoNfPeriodoCampos({
  de,
  ate,
  onDe,
  onAte,
}: {
  de: string;
  ate: string;
  onDe: (v: string) => void;
  onAte: (v: string) => void;
}) {
  const cls =
    'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark]';
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Período</label>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={de} max={ate || undefined} onChange={(e) => onDe(e.target.value)} className={cls} aria-label="De" />
        <input type="date" value={ate} min={de || undefined} onChange={(e) => onAte(e.target.value)} className={cls} aria-label="Até" />
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Data de emissão da NF para as finalizadas; data de criação para as pendentes.
      </p>
    </div>
  );
}
