'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { fmtMoeda } from '@/components/engenharia/FdPedidosResumoModal';
import { textoPartesOrcado, type BlocoOc, type LinhaOc } from '@/components/engenharia/FdResultadoPorOcModal';

const fmtPct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const ehAcima = (orcado: number, custo: number) => custo > orcado + 0.005;
const semMargem = (orcado: number, custo: number) => orcado > 0 && Math.abs(orcado - custo) < 0.005;

function etiquetaMargem(orcado: number, custo: number): string {
  if (!(orcado > 0)) return 'sem orçado';
  if (ehAcima(orcado, custo)) return 'acima do orçado';
  if (semMargem(orcado, custo)) return 'sem margem';
  return 'custo / orçado';
}

function rotuloLinha(l: LinhaOc) {
  return l.descricao || l.material || l.fdItem;
}

/** Frase do topo, no estilo do relatório "Orçado x compra". */
function resumoEmTexto(linhas: LinhaOc[], orcado: number, custo: number): string {
  if (!(orcado > 0)) return 'Os itens desta OC não têm valor orçado; não dá para calcular a margem.';
  const pct = custo / orcado;
  const partes: string[] = [];
  partes.push(
    ehAcima(orcado, custo)
      ? `O custo é ${fmtPct(pct)} do orçado: a OC custa ${fmtMoeda(r2(custo - orcado))} a mais do que foi orçado.`
      : `O custo é ${fmtPct(pct)} do orçado, com margem de ${fmtPct(1 - pct)}.`
  );
  if (linhas.length > 1 && custo > 0) {
    const maior = [...linhas].sort((a, b) => b.custo - a.custo)[0]!;
    const peso = maior.custo / custo;
    let frase = `O maior peso é ${rotuloLinha(maior)}, com ${fmtPct(peso)} do custo`;
    if (ehAcima(maior.orcado, maior.custo)) frase += ', que custa mais do que o orçado';
    else if (semMargem(maior.orcado, maior.custo)) frase += ', que não tem margem';
    frase += '.';
    const orcadoResto = orcado - maior.orcado;
    if (orcadoResto > 0.005) {
      frase += ` Sem ele, o custo fica em ${fmtPct((custo - maior.custo) / orcadoResto)} do orçado.`;
    }
    partes.push(frase);
  }
  return partes.join(' ');
}

interface Props {
  bloco: BlocoOc | null;
  codFichaDemanda?: string;
  onClose: () => void;
}

/** Detalhe "Orçado x compra" de uma OC: resumo, barras por item e percentuais. Só leitura. */
export function FdOcDetalheModal({ bloco, codFichaDemanda, onClose }: Props) {
  const linhas = useMemo(
    () => [...(bloco?.linhas ?? [])].sort((a, b) => b.orcado - a.orcado || b.custo - a.custo),
    [bloco]
  );
  if (!bloco) return null;

  const { orcado, custo } = bloco;
  const margem = r2(orcado - custo);
  const pct = orcado > 0 ? custo / orcado : 0;
  const acima = ehAcima(orcado, custo);
  const escala = Math.max(1, ...linhas.map((l) => Math.max(l.orcado, l.custo)));
  const temParcial = linhas.some((l) => l.parcial);

  return (
    <AppModalOverlay
      className="fixed inset-0 z-[2300] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[92vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-900 dark:shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Orçado x compra · {bloco.orderNumber}
            </h2>
            <p className="mt-0.5 text-base text-gray-600 dark:text-gray-400">
              {[
                codFichaDemanda,
                `RM ${bloco.rmNumber}`,
                bloco.fase,
                bloco.totvsIdMov != null ? `IdMov ${bloco.totvsIdMov}` : 'IdMov não enviada',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto px-6 py-5">
          {/* 1. Resumo da OC */}
          <section className="rounded-lg border border-gray-200 p-5 dark:border-gray-700">
            <p className="text-base text-gray-700 dark:text-gray-300">{resumoEmTexto(linhas, orcado, custo)}</p>
            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <p
                  className={`text-4xl font-bold tabular-nums ${
                    acima ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {orcado > 0 ? fmtPct(pct) : '—'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">custo sobre o orçado</p>
              </div>
              <div className="min-w-[260px] flex-1">
                <div className="flex h-4 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                  {acima ? (
                    <span className="h-full w-full bg-red-600 dark:bg-red-500" />
                  ) : (
                    <>
                      <span className="h-full bg-orange-500" style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                      <span className="h-full flex-1 bg-emerald-500/80" />
                    </>
                  )}
                </div>
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <span className={`h-2.5 w-2.5 rounded-sm ${acima ? 'bg-red-600' : 'bg-orange-500'}`} />
                    Custo {orcado > 0 ? fmtPct(pct) : '—'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/80" />
                    Margem {orcado > 0 ? fmtPct(1 - pct) : '—'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Quadro titulo="Valor orçado (com desconto e BDI)" valor={fmtMoeda(orcado)} detalhe={textoPartesOrcado(bloco.partes)} />
              <Quadro titulo="Custo" valor={fmtMoeda(custo)} />
              <Quadro
                titulo="Margem"
                valor={fmtMoeda(margem)}
                cor={margem < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}
              />
            </div>
          </section>

          {/* 2. Orçado e custo por item */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orçado e custo por item</h3>
            <div className="mt-1 flex gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-400 dark:bg-slate-500" /> Valor orçado (com desconto e BDI)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Custo na OC
              </span>
            </div>
            <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {linhas.map((l, idx) => {
                const acimaL = ehAcima(l.orcado, l.custo);
                return (
                  <div key={`${l.fdItemKey}-${idx}`} className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_8rem]">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        <span className="mr-1.5 tabular-nums opacity-70">{l.fdItem}</span>
                        {l.descricao}
                      </p>
                      <p className="truncate text-sm text-gray-500 dark:text-gray-400" title={l.material}>
                        {l.material}
                      </p>
                    </div>
                    <div className="space-y-1.5 self-center">
                      <Barra valor={l.orcado} escala={escala} cor="bg-slate-400 dark:bg-slate-500" />
                      <Barra
                        valor={l.custo}
                        escala={escala}
                        cor={acimaL ? 'bg-red-600 dark:bg-red-500' : 'bg-orange-500'}
                      />
                    </div>
                    <div className="self-center text-right">
                      <p
                        className={`text-lg font-semibold tabular-nums ${
                          acimaL ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {l.orcado > 0 ? fmtPct(l.custo / l.orcado) : '—'}
                      </p>
                      <p
                        className={`text-xs ${
                          acimaL || semMargem(l.orcado, l.custo)
                            ? 'font-medium text-red-600 dark:text-red-400'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {etiquetaMargem(l.orcado, l.custo)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Percentuais por item */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Percentuais por item</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Participação de cada item no total da OC, do maior valor orçado para o menor
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-gray-500 dark:text-gray-400">
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-2.5 font-medium">Item</th>
                    <th className="px-3 py-2.5 text-right font-medium">Valor orçado (com desconto e BDI)</th>
                    <th className="px-3 py-2.5 text-right font-medium">% do orçado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Custo</th>
                    <th className="px-3 py-2.5 text-right font-medium">% do custo</th>
                    <th className="px-3 py-2.5 text-right font-medium">Custo / orçado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, idx) => {
                    const m = r2(l.orcado - l.custo);
                    return (
                      <tr key={`${l.fdItemKey}-${idx}`} className="border-b border-gray-100 align-top dark:border-gray-800">
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{l.descricao}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="tabular-nums">{l.fdItem}</span>
                            {l.material ? ` · ${l.material}` : ''}
                          </p>
                          {l.parcial && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                              parcial: ainda há material sem OC
                            </p>
                          )}
                        </td>
                        <Num>{fmtMoeda(l.orcado)}</Num>
                        <Num apagado>{orcado > 0 ? fmtPct(l.orcado / orcado) : '—'}</Num>
                        <Num>{fmtMoeda(l.custo)}</Num>
                        <Num apagado>{custo > 0 ? fmtPct(l.custo / custo) : '—'}</Num>
                        <Num cor={ehAcima(l.orcado, l.custo) ? 'text-red-600 dark:text-red-400 font-semibold' : undefined}>
                          {l.orcado > 0 ? fmtPct(l.custo / l.orcado) : '—'}
                        </Num>
                        <Num cor={m < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                          {fmtMoeda(m)}
                        </Num>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold dark:bg-gray-800/50">
                    <td className="px-3 py-2.5 text-gray-900 dark:text-gray-100">Total da OC</td>
                    <Num>{fmtMoeda(orcado)}</Num>
                    <Num apagado>100,0%</Num>
                    <Num>{fmtMoeda(custo)}</Num>
                    <Num apagado>100,0%</Num>
                    <Num cor={acima ? 'text-red-600 dark:text-red-400' : undefined}>{orcado > 0 ? fmtPct(pct) : '—'}</Num>
                    <Num cor={margem < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}>
                      {fmtMoeda(margem)}
                    </Num>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Margem = orçado − custo. Orçado é o faturamento do item no orçamento: (custo do orçamento − desconto) × (1 + BDI),
            repartido pelo custo de cada OC; custo é o valor do material na OC.
            {temParcial && ' Itens "parcial" ainda têm material sem OC: a margem deles tende a cair.'}
          </p>
        </div>

        <div className="flex justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
        </div>
      </div>
    </AppModalOverlay>
  );
}

function Quadro({ titulo, valor, cor, detalhe }: { titulo: string; valor: string; cor?: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{titulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${cor ?? 'text-gray-900 dark:text-gray-100'}`}>{valor}</p>
      {detalhe ? <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{detalhe}</p> : null}
    </div>
  );
}

function Barra({ valor, escala, cor }: { valor: number; escala: number; cor: string }) {
  const largura = valor > 0 ? Math.max(1, (valor / escala) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 flex-1">
        <div className={`h-full rounded-sm ${cor}`} style={{ width: `${largura}%` }} />
      </div>
      <span className="w-28 shrink-0 text-right text-sm tabular-nums text-gray-700 dark:text-gray-300">
        {fmtMoeda(valor)}
      </span>
    </div>
  );
}

function Num({ children, apagado, cor }: { children: React.ReactNode; apagado?: boolean; cor?: string }) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${
        cor ?? (apagado ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100')
      }`}
    >
      {children}
    </td>
  );
}
