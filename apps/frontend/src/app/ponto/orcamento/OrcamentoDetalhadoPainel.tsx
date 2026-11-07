'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Percent } from 'lucide-react';
import { TabelaJanelaSpacer, useOrcamentoTabelaJanela } from './useOrcamentoTabelaJanela';

/** Estado da caixa de uma composição: todos, nenhum ou parte dos insumos com desconto. */
export type MarcacaoDesconto = 'todos' | 'nenhum' | 'parcial';

export type LinhaOrcamentoDetalhado =
  | {
      kind: 'titulo' | 'subtitulo';
      key: string;
      numero: string;
      texto: string;
      semDesconto: number;
      desconto: number;
    }
  | {
      kind: 'composicao';
      key: string;
      item: string;
      codigo: string;
      banco: string;
      descricao: string;
      und: string;
      quant: number;
      valorUnit: number;
      semDesconto: number;
      desconto: number;
      marcacao: MarcacaoDesconto;
      /** Chaves que a caixa da composição liga/desliga (insumos, ou a própria composição sem analítico). */
      chaves: string[];
      /** Valor digitado à mão na aba Orçamento: o desconto do detalhado não muda essa linha. */
      temValorDigitado: boolean;
    }
  | {
      kind: 'insumo';
      key: string;
      item: string;
      codigo: string;
      banco: string;
      descricao: string;
      und: string;
      quant: number;
      valorUnit: number;
      semDesconto: number;
      desconto: number;
      marcado: boolean;
    };

/** Insumos: quantidade e valor unitário sem arredondar (como no Orçafascio, até 7 casas). */
const exato = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 7 });
const moeda = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Banco sem UF e sem acento: "SINAPI/DF" → "SINAPI", "Próprio" → "PROPRIO". */
function normalizarBanco(b: string): string {
  return String(b || '')
    .split('/')[0]!
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

const TH =
  'sticky top-0 z-10 whitespace-nowrap border-b border-gray-300 bg-gray-100 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300';
const TD_NUM = 'whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums';
const COLUNAS = 11;

function CaixaDesconto({
  marcacao,
  disabled,
  onChange,
  rotulo,
}: {
  marcacao: MarcacaoDesconto;
  disabled: boolean;
  onChange: (aplicar: boolean) => void;
  rotulo: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = marcacao === 'parcial';
  }, [marcacao]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={marcacao === 'todos'}
      disabled={disabled}
      aria-label={rotulo}
      title={disabled ? undefined : rotulo}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600"
    />
  );
}

/**
 * Aba «Orçamento detalhado»: cada composição aberta em insumos, com a caixa para tirar do desconto
 * do contrato. Informação interna — as exportações mostram só os valores finais.
 */
export function OrcamentoDetalhadoPainel({
  linhas,
  descontoPct,
  editavel,
  motivoBloqueio,
  totais,
  onAlternar,
  configFinalizada,
  podeFinalizarConfig,
  onFinalizarConfig,
  onReabrirConfig,
}: {
  linhas: LinhaOrcamentoDetalhado[];
  descontoPct: number;
  editavel: boolean;
  motivoBloqueio: string | null;
  totais: { semDesconto: number; desconto: number; comDesconto: number };
  onAlternar: (chaves: string[], aplicar: boolean) => void;
  /** Configuração do desconto finalizada (marcações travadas). */
  configFinalizada?: { por: string; em: string } | null;
  /** Orçamento editável: dá para finalizar ou reabrir a configuração. */
  podeFinalizarConfig?: boolean;
  onFinalizarConfig?: () => void;
  onReabrirConfig?: () => void;
}) {
  // --- Filtro por banco (do insumo; composição sem insumos usa o próprio banco) ---
  const [bancoFiltro, setBancoFiltro] = useState('');
  const bancosOpcoes = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhas) {
      if (l.kind === 'insumo') set.add(normalizarBanco(l.banco));
      else if (l.kind === 'composicao' && l.chaves.length === 1 && l.chaves[0] === l.key) set.add(normalizarBanco(l.banco));
    }
    set.delete('');
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas]);
  const filtroAtivo = !!bancoFiltro && bancosOpcoes.includes(bancoFiltro);

  /**
   * Linhas exibidas: com filtro, só os insumos do banco, com a composição (e o título/subtítulo) acima.
   * A caixa da composição passa a valer só para os insumos visíveis. `alvos` = caixas afetadas pelos botões.
   */
  const { linhasVisiveis, alvos, totaisFiltro } = useMemo(() => {
    const alvosLista: { key: string; marcado: boolean }[] = [];
    if (!filtroAtivo) {
      for (const l of linhas) {
        if (l.kind === 'insumo') alvosLista.push({ key: l.key, marcado: l.marcado });
        else if (l.kind === 'composicao' && l.chaves.length === 1 && l.chaves[0] === l.key) {
          alvosLista.push({ key: l.key, marcado: l.marcacao === 'todos' });
        }
      }
      return { linhasVisiveis: linhas, alvos: alvosLista, totaisFiltro: null };
    }
    const out: LinhaOrcamentoDetalhado[] = [];
    let tituloPend: LinhaOrcamentoDetalhado | null = null;
    let subtituloPend: LinhaOrcamentoDetalhado | null = null;
    let sem = 0;
    let desc = 0;
    const emitirCabecalhos = () => {
      if (tituloPend) {
        out.push(tituloPend);
        tituloPend = null;
      }
      if (subtituloPend) {
        out.push(subtituloPend);
        subtituloPend = null;
      }
    };
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]!;
      if (l.kind === 'titulo') {
        tituloPend = l;
        subtituloPend = null;
        continue;
      }
      if (l.kind === 'subtitulo') {
        subtituloPend = l;
        continue;
      }
      if (l.kind !== 'composicao') continue;
      const insumos: Extract<LinhaOrcamentoDetalhado, { kind: 'insumo' }>[] = [];
      for (let j = i + 1; j < linhas.length; j++) {
        const prox = linhas[j]!;
        if (prox.kind !== 'insumo') break;
        insumos.push(prox);
      }
      const semInsumos = l.chaves.length === 1 && l.chaves[0] === l.key;
      if (semInsumos) {
        if (normalizarBanco(l.banco) !== bancoFiltro) continue;
        emitirCabecalhos();
        out.push(l);
        alvosLista.push({ key: l.key, marcado: l.marcacao === 'todos' });
        sem += l.semDesconto;
        desc += l.desconto;
        continue;
      }
      const doBanco = insumos.filter((ins) => normalizarBanco(ins.banco) === bancoFiltro);
      if (doBanco.length === 0) continue;
      emitirCabecalhos();
      const marcados = doBanco.filter((ins) => ins.marcado).length;
      out.push({
        ...l,
        chaves: doBanco.map((ins) => ins.key),
        marcacao: marcados === 0 ? 'nenhum' : marcados === doBanco.length ? 'todos' : 'parcial',
      });
      for (const ins of doBanco) {
        out.push(ins);
        alvosLista.push({ key: ins.key, marcado: ins.marcado });
        sem += ins.semDesconto;
        desc += ins.desconto;
      }
    }
    return { linhasVisiveis: out, alvos: alvosLista, totaisFiltro: { semDesconto: sem, desconto: desc } };
  }, [linhas, filtroAtivo, bancoFiltro]);

  const chavesDesmarcar = alvos.filter((a) => a.marcado).map((a) => a.key);
  const chavesMarcar = alvos.filter((a) => !a.marcado).map((a) => a.key);
  const caixasLiberadas = editavel && descontoPct > 0;

  const janela = useOrcamentoTabelaJanela(linhasVisiveis.length, { rowHeight: 40, overscan: 28 });
  const pctTexto = (descontoPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex min-w-0 items-start gap-2">
          {editavel ? (
            <Percent className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
          ) : (
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
          )}
          <p className="text-xs text-gray-700 dark:text-gray-300">
            {descontoPct > 0
              ? `Desconto do contrato: ${pctTexto}%. Desmarque os insumos que não recebem desconto. `
              : 'O contrato não tem desconto cadastrado: nada a configurar. '}
            <span className="text-gray-500 dark:text-gray-400">
              Uso interno: as exportações mostram só os valores finais.
            </span>
            {configFinalizada ? (
              <span className="mt-0.5 block font-medium text-emerald-700 dark:text-emerald-400">
                Configuração do desconto finalizada
                {configFinalizada.por ? ` por ${configFinalizada.por}` : ''}
                {configFinalizada.em ? ` em ${new Date(configFinalizada.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.
              </span>
            ) : motivoBloqueio ? (
              <span className="mt-0.5 block font-medium text-gray-600 dark:text-gray-400">{motivoBloqueio}</span>
            ) : null}
          </p>
          {podeFinalizarConfig && (configFinalizada ? onReabrirConfig : onFinalizarConfig) ? (
            configFinalizada ? (
              <button
                type="button"
                onClick={onReabrirConfig}
                className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Reabrir configuração
              </button>
            ) : (
              <button
                type="button"
                onClick={onFinalizarConfig}
                className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-teal-700 bg-teal-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-800 dark:border-teal-600 dark:bg-teal-700 dark:hover:bg-teal-600"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Finalizar configuração do desconto
              </button>
            )
          ) : null}
        </div>
        <dl className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 text-xs">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Sem desconto</dt>
            <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">R$ {moeda(totais.semDesconto)}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Desconto aplicado</dt>
            <dd className="font-semibold tabular-nums text-red-600 dark:text-red-400">− R$ {moeda(totais.desconto)}</dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Com desconto</dt>
            <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">R$ {moeda(totais.comDesconto)}</dd>
          </div>
        </dl>
      </div>

      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
          Banco
          <select
            value={filtroAtivo ? bancoFiltro : ''}
            onChange={(e) => setBancoFiltro(e.target.value)}
            className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            aria-label="Filtrar por banco"
          >
            <option value="">Todos os bancos</option>
            {bancosOpcoes.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onAlternar(chavesDesmarcar, false)}
          disabled={!caixasLiberadas || chavesDesmarcar.length === 0}
          className="h-8 rounded-md border border-gray-300 bg-white px-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          title={filtroAtivo ? `Tira o desconto só dos insumos ${bancoFiltro}` : 'Tira o desconto de todos os insumos'}
        >
          Desmarcar todos ({chavesDesmarcar.length})
        </button>
        <button
          type="button"
          onClick={() => onAlternar(chavesMarcar, true)}
          disabled={!caixasLiberadas || chavesMarcar.length === 0}
          className="h-8 rounded-md border border-gray-300 bg-white px-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          title={filtroAtivo ? `Aplica o desconto só nos insumos ${bancoFiltro}` : 'Aplica o desconto em todos os insumos'}
        >
          Marcar todos ({chavesMarcar.length})
        </button>
        {filtroAtivo && totaisFiltro ? (
          <span className="ml-auto text-gray-600 dark:text-gray-400">
            {bancoFiltro}: sem desconto <strong className="tabular-nums text-gray-900 dark:text-gray-100">R$ {moeda(totaisFiltro.semDesconto)}</strong>
            {' · '}desconto{' '}
            <strong className="tabular-nums text-red-600 dark:text-red-400">− R$ {moeda(totaisFiltro.desconto)}</strong>
            {' · '}com desconto{' '}
            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
              R$ {moeda(totaisFiltro.semDesconto - totaisFiltro.desconto)}
            </strong>
          </span>
        ) : null}
      </div>

      <div data-orc-table-viewport className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-gray-900 dark:text-gray-100">
          <thead>
            <tr>
              <th className={`${TH} text-center`}>Item</th>
              <th className={`${TH} text-center`}>Código</th>
              <th className={`${TH} text-center`}>Banco</th>
              <th className={`${TH} w-full min-w-[16rem] text-left`}>Descrição</th>
              <th className={`${TH} text-center`}>Und.</th>
              <th className={`${TH} text-right`}>Quant.</th>
              <th className={`${TH} text-right`}>Valor unit.</th>
              <th className={`${TH} text-right`}>Total sem desconto</th>
              <th className={`${TH} text-center`}>Aplica desconto</th>
              <th className={`${TH} text-right`}>Desconto</th>
              <th className={`${TH} text-right`}>Total com desconto</th>
            </tr>
          </thead>
          <tbody ref={janela.tbodyRef}>
            <TabelaJanelaSpacer height={janela.topPad} colSpan={COLUNAS} />
            {linhasVisiveis.slice(janela.start, janela.end).map((l) => {
              if (l.kind === 'titulo' || l.kind === 'subtitulo') {
                const titulo = l.kind === 'titulo';
                return (
                  <tr
                    key={l.key}
                    className={
                      titulo
                        ? 'bg-red-950 text-white dark:bg-red-950'
                        : 'bg-gray-100 text-gray-900 dark:bg-gray-900/80 dark:text-gray-100'
                    }
                  >
                    <td className="whitespace-nowrap px-2 py-2 text-center text-xs font-bold tabular-nums">{l.numero}</td>
                    <td colSpan={6} className="px-2 py-2 text-xs font-bold uppercase tracking-wide">
                      {l.texto}
                    </td>
                    <td className={`${TD_NUM} font-semibold`}>{moeda(l.semDesconto)}</td>
                    <td />
                    <td className={`${TD_NUM} font-semibold`}>{l.desconto > 0 ? `− ${moeda(l.desconto)}` : '—'}</td>
                    <td className={`${TD_NUM} font-semibold`}>{moeda(l.semDesconto - l.desconto)}</td>
                  </tr>
                );
              }
              if (l.kind === 'composicao') {
                return (
                  <tr key={l.key} className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <td className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-center text-xs font-semibold tabular-nums dark:border-gray-700">{l.item}</td>
                    <td className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-center text-xs dark:border-gray-700">{l.codigo}</td>
                    <td className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-center text-xs dark:border-gray-700">{l.banco}</td>
                    <td className="border-b border-gray-200 px-2 py-2 text-xs font-semibold uppercase dark:border-gray-700">
                      {l.descricao}
                      {l.temValorDigitado ? (
                        <span
                          className="ml-2 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                          title="Há valor digitado à mão nesta linha da aba Orçamento: o desconto daqui não altera esse valor."
                        >
                          valor digitado na aba Orçamento
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-200 px-2 py-2 text-center text-xs dark:border-gray-700">{l.und}</td>
                    <td className={`${TD_NUM} border-b border-gray-200 dark:border-gray-700`}>{numero(l.quant)}</td>
                    <td className={`${TD_NUM} border-b border-gray-200 dark:border-gray-700`}>{moeda(l.valorUnit)}</td>
                    <td className={`${TD_NUM} border-b border-gray-200 font-semibold dark:border-gray-700`}>{moeda(l.semDesconto)}</td>
                    <td className="border-b border-gray-200 px-2 py-2 text-center dark:border-gray-700">
                      <CaixaDesconto
                        marcacao={l.marcacao}
                        disabled={!editavel || descontoPct <= 0}
                        onChange={(aplicar) => onAlternar(l.chaves, aplicar)}
                        rotulo={`Aplicar desconto em todos os insumos de ${l.item}`}
                      />
                    </td>
                    <td className={`${TD_NUM} border-b border-gray-200 text-red-600 dark:border-gray-700 dark:text-red-400`}>
                      {l.desconto > 0.004 ? `− ${moeda(l.desconto)}` : '—'}
                    </td>
                    <td className={`${TD_NUM} border-b border-gray-200 font-semibold dark:border-gray-700`}>{moeda(l.semDesconto - l.desconto)}</td>
                  </tr>
                );
              }
              if (l.kind !== 'insumo') return null;
              return (
                <tr
                  key={l.key}
                  className={l.marcado ? 'bg-gray-50/60 dark:bg-gray-900/40' : 'bg-amber-50/70 dark:bg-amber-950/20'}
                >
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-center text-[11px] tabular-nums text-gray-500 dark:border-gray-800 dark:text-gray-400">{l.item}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-center text-[11px] dark:border-gray-800">{l.codigo}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-center text-[11px] dark:border-gray-800">{l.banco}</td>
                  <td className="border-b border-gray-100 py-1.5 pl-6 pr-2 text-[11px] uppercase text-gray-700 dark:border-gray-800 dark:text-gray-300">{l.descricao}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-center text-[11px] dark:border-gray-800">{l.und}</td>
                  <td className={`${TD_NUM} border-b border-gray-100 !text-[11px] dark:border-gray-800`}>{exato(l.quant)}</td>
                  <td className={`${TD_NUM} border-b border-gray-100 !text-[11px] dark:border-gray-800`}>{exato(l.valorUnit)}</td>
                  <td className={`${TD_NUM} border-b border-gray-100 !text-[11px] dark:border-gray-800`}>{moeda(l.semDesconto)}</td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-center dark:border-gray-800">
                    <CaixaDesconto
                      marcacao={l.marcado ? 'todos' : 'nenhum'}
                      disabled={!editavel || descontoPct <= 0}
                      onChange={(aplicar) => onAlternar([l.key], aplicar)}
                      rotulo={`Aplicar desconto no insumo ${l.item}`}
                    />
                  </td>
                  <td className={`${TD_NUM} border-b border-gray-100 !text-[11px] text-red-600 dark:border-gray-800 dark:text-red-400`}>
                    {l.desconto > 0.004 ? `− ${moeda(l.desconto)}` : l.marcado ? '—' : 'sem desconto'}
                  </td>
                  <td className={`${TD_NUM} border-b border-gray-100 !text-[11px] dark:border-gray-800`}>{moeda(l.semDesconto - l.desconto)}</td>
                </tr>
              );
            })}
            <TabelaJanelaSpacer height={janela.bottomPad} colSpan={COLUNAS} />
          </tbody>
        </table>
      </div>
    </div>
  );
}
