'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronRight, Loader2, X } from 'lucide-react';
import { FdOcDetalheModal } from '@/components/engenharia/FdOcDetalheModal';
import api from '@/lib/api';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import type { FdInsumoLine } from '@/components/engenharia/FdPedidoMaterialModal';
import {
  OC_STATUS,
  fmtMoeda,
  type ItemResumo,
  type OcPagaResumo,
  type OcResumo,
} from '@/components/engenharia/FdPedidosResumoModal';

const OC_FORA = new Set(['CANCELLED', 'REJECTED']);

const fmtQtd = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const fmtPct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LinhaOc = {
  fdItemKey: string;
  fdItem: string;
  descricao: string;
  material: string;
  quantidade: number;
  unidade: string;
  orcado: number;
  custo: number;
  /** Partes do orçado: custo do orçamento (sem desconto/BDI), desconto e BDI — repartidas como o orçado. */
  partes: PartesOrcado;
  /** O item da FD ainda tem material sem OC: o orçado todo está nas OCs que já existem. */
  parcial: boolean;
};

export type PartesOrcado = { custoOrcamento: number; desconto: number; bdi: number };
const partesZero = (): PartesOrcado => ({ custoOrcamento: 0, desconto: 0, bdi: 0 });
const somarPartes = (a: PartesOrcado, b: PartesOrcado): PartesOrcado => ({
  custoOrcamento: a.custoOrcamento + b.custoOrcamento,
  desconto: a.desconto + b.desconto,
  bdi: a.bdi + b.bdi,
});

/** "custo R$ x − desconto R$ y + BDI R$ z" — de onde vem o valor orçado. */
export function textoPartesOrcado(p: PartesOrcado): string {
  return `Custo do orçamento ${fmtMoeda(p.custoOrcamento)} − desconto ${fmtMoeda(p.desconto)} + BDI ${fmtMoeda(p.bdi)}`;
}

export type BlocoOc = {
  ocId: string;
  orderNumber: string;
  rmNumber: string;
  fase: string;
  totvsIdMov: number | null;
  linhas: LinhaOc[];
  orcado: number;
  custo: number;
  partes: PartesOrcado;
};

type ItemSemOc = { fdItemKey: string; fdItem: string; descricao: string; orcado: number; rms: string[] };

function faseDaOc(oc: OcResumo): string {
  if (oc.fluigFase?.etapa) {
    if (oc.fluigFase.fluxo === 'G4' && oc.fluigFase.etapa === 'Finalizada') return 'Pagamento finalizado';
    return oc.fluigFase.etapa;
  }
  return OC_STATUS[oc.status] ?? oc.status;
}

/** Monta o resultado por OC: orçado do item da FD repartido pelo custo de cada OC no item. */
export function montarResultadoPorOc(itens: ItemResumo[], insumos: FdInsumoLine[]) {
  const orcadoPorKey = new Map(insumos.map((i) => [i.key, Number(i.valorOrcado) || 0]));
  const partesPorKey = new Map(
    insumos.map((i) => [
      i.key,
      {
        custoOrcamento: Number(i.custoOrcamento) || 0,
        desconto: Number(i.descontoOrcamento) || 0,
        bdi: Number(i.bdiOrcamento) || 0,
      },
    ])
  );

  // Um item da FD pode aparecer em mais de uma RM: junta tudo pelo item.
  const porItem = new Map<string, ItemResumo[]>();
  for (const it of itens) {
    const lista = porItem.get(it.fdItemKey) ?? [];
    lista.push(it);
    porItem.set(it.fdItemKey, lista);
  }

  const blocos = new Map<string, BlocoOc>();
  const semOc: ItemSemOc[] = [];

  for (const [fdItemKey, registros] of porItem) {
    const base = registros[0]!;
    const orcadoItem = orcadoPorKey.get(fdItemKey) ?? 0;
    const partesItem = partesPorKey.get(fdItemKey) ?? partesZero();
    const pares: { it: ItemResumo; m: ItemResumo['materiais'][number]; oc: OcResumo }[] = [];
    let materialSemOc = false;
    for (const it of registros) {
      for (const m of it.materiais) {
        const validas = m.ocs.filter((oc) => !OC_FORA.has(oc.status));
        if (validas.length === 0) materialSemOc = true;
        for (const oc of validas) pares.push({ it, m, oc });
      }
    }
    if (pares.length === 0) {
      semOc.push({
        fdItemKey,
        fdItem: base.fdItem,
        descricao: base.descricao,
        orcado: orcadoItem,
        rms: [...new Set(registros.map((r) => r.rm.requestNumber).filter(Boolean))],
      });
      continue;
    }
    const custoItem = pares.reduce((s, p) => s + (Number(p.oc.valorOc) || 0), 0);
    for (const p of pares) {
      const custo = Number(p.oc.valorOc) || 0;
      const peso = custoItem > 0 ? custo / custoItem : 1 / pares.length;
      const id = p.oc.ocId || p.oc.orderNumber;
      const bloco: BlocoOc = blocos.get(id) ?? {
        ocId: id,
        orderNumber: p.oc.orderNumber,
        rmNumber: p.it.rm.requestNumber,
        fase: faseDaOc(p.oc),
        totvsIdMov: p.oc.totvsIdMov,
        linhas: [],
        orcado: 0,
        custo: 0,
        partes: partesZero(),
      };
      const orcado = r2(orcadoItem * peso);
      const partes: PartesOrcado = {
        custoOrcamento: partesItem.custoOrcamento * peso,
        desconto: partesItem.desconto * peso,
        bdi: partesItem.bdi * peso,
      };
      bloco.linhas.push({
        fdItemKey,
        fdItem: p.it.fdItem,
        descricao: p.it.descricao,
        material: p.m.materialLabel,
        quantidade: p.oc.quantidadeOc ?? p.m.quantity,
        unidade: p.m.unit,
        orcado,
        custo,
        partes,
        parcial: materialSemOc,
      });
      bloco.partes = somarPartes(bloco.partes, partes);
      bloco.orcado += orcado;
      bloco.custo += custo;
      blocos.set(id, bloco);
    }
  }

  const ordem = new Map(insumos.map((ins, idx) => [ins.key, idx]));
  const pos = (k: string) => ordem.get(k) ?? Number.MAX_SAFE_INTEGER;
  const lista = [...blocos.values()]
    .map((b) => ({ ...b, orcado: r2(b.orcado), custo: r2(b.custo), linhas: b.linhas.sort((a, c) => pos(a.fdItemKey) - pos(c.fdItemKey)) }))
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));
  semOc.sort((a, b) => pos(a.fdItemKey) - pos(b.fdItemKey));

  const orcado = r2(lista.reduce((s, b) => s + b.orcado, 0));
  const custo = r2(lista.reduce((s, b) => s + b.custo, 0));
  const orcadoSemOc = r2(semOc.reduce((s, i) => s + i.orcado, 0));
  const partes = lista.reduce((acc, b) => somarPartes(acc, b.partes), partesZero());
  return { blocos: lista, semOc, orcado, custo, lucro: r2(orcado - custo), orcadoSemOc, partes };
}

function Lucro({ orcado, custo, forte }: { orcado: number; custo: number; forte?: boolean }) {
  const lucro = r2(orcado - custo);
  const cor = lucro < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400';
  return (
    <span className={`${cor} ${forte ? 'font-semibold' : 'font-medium'}`}>
      {fmtMoeda(lucro)}
      {orcado > 0 && <span className="ml-1 text-sm opacity-80">({fmtPct(lucro / orcado)})</span>}
    </span>
  );
}

/** Custo sobre orçado (%), com barra: laranja até 100%, vermelho acima (custo maior que o orçado). */
function CustoSobreOrcado({ orcado, custo, forte }: { orcado: number; custo: number; forte?: boolean }) {
  if (!(orcado > 0)) {
    return <span className="text-gray-400 dark:text-gray-500">{custo > 0 ? 'sem orçado' : '—'}</span>;
  }
  const pct = custo / orcado;
  const acima = pct > 1;
  // 120% ocupa a barra inteira; acima disso a barra fica cheia.
  const largura = Math.max(2, Math.min(pct / 1.2, 1) * 100);
  return (
    <span className="flex items-center justify-end gap-3">
      <span
        className={`w-20 text-right tabular-nums ${forte ? 'font-semibold' : ''} ${
          acima ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {fmtPct(pct)}
      </span>
      <span className="h-3 w-28 shrink-0" aria-hidden>
        <span
          className={`block h-full rounded-sm ${acima ? 'bg-red-600 dark:bg-red-500' : 'bg-orange-500 dark:bg-orange-500'}`}
          style={{ width: `${largura}%` }}
        />
      </span>
    </span>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fdApprovalId: string;
  insumos: FdInsumoLine[];
}

/** Resultado previsto por OC: faturamento orçado do item da FD × custo do item na OC. Só leitura. */
export function FdResultadoPorOcModal({ isOpen, onClose, fdApprovalId, insumos }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['fd-pedidos-resumo', fdApprovalId],
    queryFn: async () => {
      const res = await api.get(`/demand-sheet-approvals/${fdApprovalId}/pedidos-resumo`);
      return res.data?.data as {
        codFichaDemanda: string;
        itens: ItemResumo[];
        ocsPagas?: OcPagaResumo[];
        totalOcsPagas?: number;
      };
    },
    enabled: isOpen && !!fdApprovalId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const resultado = useMemo(() => montarResultadoPorOc(data?.itens ?? [], insumos), [data, insumos]);
  const [ocDetalheId, setOcDetalheId] = useState<string | null>(null);
  const ocDetalhe = resultado.blocos.find((b) => b.ocId === ocDetalheId) ?? null;

  if (!isOpen) return null;

  const { blocos, semOc, orcado, custo, lucro, orcadoSemOc, partes } = resultado;

  return (
    <AppModalOverlay
      className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[92vh] w-full max-w-[90rem] flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-900 dark:shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Resultado por OC</h2>
            <p className="mt-0.5 text-base text-gray-600 dark:text-gray-400">
              {data?.codFichaDemanda ? `${data.codFichaDemanda} · ` : ''}
              Faturamento orçado × custo nas OCs · uso interno
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

        {!isLoading && !isError && blocos.length > 0 && (
          <div className="grid grid-cols-2 gap-3 border-b border-gray-200 px-6 py-3 sm:grid-cols-4 dark:border-gray-700">
            <Resumo
              titulo={`Valor orçado (com desconto e BDI) · ${blocos.length} OC(s)`}
              valor={fmtMoeda(orcado)}
              detalhe={textoPartesOrcado(partes)}
            />
            <Resumo titulo="Custo nas OCs" valor={fmtMoeda(custo)} />
            <div className="rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Lucro previsto</p>
              <p className="text-xl tabular-nums">
                <Lucro orcado={orcado} custo={custo} forte />
              </p>
            </div>
            <Resumo
              titulo={`Valor orçado sem OC (com desconto e BDI) · ${semOc.length} item(ns)`}
              valor={fmtMoeda(orcadoSemOc)}
              apagado
            />
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-red-600 dark:text-red-400">
              Não foi possível carregar o resultado das OCs.
            </p>
          ) : blocos.length === 0 && semOc.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum item desta FD foi solicitado ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {blocos.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma OC gerada para os itens desta FD ainda.
                </p>
              )}
              {blocos.map((b) => (
                <section key={b.ocId} className="rounded-lg border border-gray-200 dark:border-gray-700">
                  <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-t-lg bg-red-50 px-4 py-2.5 text-base dark:bg-red-950/40">
                    <button
                      type="button"
                      onClick={() => setOcDetalheId(b.ocId)}
                      title="Ver orçado x compra desta OC"
                      className="inline-flex items-center gap-1 font-semibold text-red-700 underline decoration-dotted underline-offset-4 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                    >
                      {b.orderNumber}
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                    <span className="text-sm text-gray-500 dark:text-gray-400">RM {b.rmNumber}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">· {b.fase}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      · IdMov{' '}
                      {b.totvsIdMov != null ? (
                        <span className="font-medium text-green-700 dark:text-green-400">{b.totvsIdMov}</span>
                      ) : (
                        'não enviada'
                      )}
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] text-left text-sm">
                      <thead className="text-gray-500 dark:text-gray-400">
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="px-3 py-2.5 font-medium">Item da FD</th>
                          <th className="px-3 py-2.5 font-medium">Material</th>
                          <th className="px-3 py-2.5 text-right font-medium">Qtd. na OC</th>
                          <th className="px-3 py-2.5 text-right font-medium">Valor orçado (com desconto e BDI)</th>
                          <th className="px-3 py-2.5 text-right font-medium">Custo na OC</th>
                          <th className="px-3 py-2.5 text-right font-medium">Lucro previsto</th>
                          <th className="px-3 py-2.5 text-right font-medium">Custo / orçado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.linhas.map((l, idx) => (
                          <tr
                            key={`${l.fdItemKey}-${idx}`}
                            className="border-b border-gray-100 align-top last:border-0 dark:border-gray-800"
                          >
                            <td className="px-3 py-2">
                              <p className="font-medium text-gray-900 dark:text-gray-100">
                                <span className="mr-1.5 tabular-nums opacity-70">{l.fdItem}</span>
                                {l.descricao}
                              </p>
                              {l.parcial && (
                                <p
                                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"
                                  title="Todo o orçado do item está nas OCs que já existem; o lucro pode cair quando o restante for comprado."
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                  parcial: ainda há material sem OC
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">{l.material || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">
                              {fmtQtd(l.quantidade)} {l.unidade}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">
                              {fmtMoeda(l.orcado)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-gray-100">
                              {fmtMoeda(l.custo)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              <Lucro orcado={l.orcado} custo={l.custo} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              <CustoSobreOrcado orcado={l.orcado} custo={l.custo} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr
                          onClick={() => setOcDetalheId(b.ocId)}
                          title="Ver orçado x compra desta OC"
                          className="cursor-pointer border-t border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-800"
                        >
                          <td className="px-3 py-2.5 font-semibold text-gray-900 dark:text-gray-100" colSpan={3}>
                            Resultado da OC
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            {fmtMoeda(b.orcado)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                            {fmtMoeda(b.custo)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            <Lucro orcado={b.orcado} custo={b.custo} forte />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <CustoSobreOrcado orcado={b.orcado} custo={b.custo} forte />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              ))}

              {semOc.length > 0 && (
                <section className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <h3 className="rounded-t-lg px-4 py-2.5 text-base font-semibold text-gray-700 dark:text-gray-300">
                    Aguardando OC
                    <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                      itens já pedidos em RM, ainda sem OC
                    </span>
                  </h3>
                  <table className="w-full text-left text-sm">
                    <thead className="text-gray-500 dark:text-gray-400">
                      <tr className="border-t border-gray-100 dark:border-gray-800">
                        <th className="w-40 px-3 py-2 font-medium">RM</th>
                        <th className="px-3 py-2 font-medium">Item da FD</th>
                        <th className="px-3 py-2 text-right font-medium">Valor orçado (com desconto e BDI)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semOc.map((i) => (
                        <tr key={i.fdItemKey} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="whitespace-nowrap px-3 py-2.5 font-medium text-gray-900 dark:text-gray-100">
                            {i.rms.length ? i.rms.join(', ') : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300">
                            <span className="mr-1.5 tabular-nums opacity-70">{i.fdItem}</span>
                            {i.descricao}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {fmtMoeda(i.orcado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </div>
          )}
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
      <FdOcDetalheModal
        bloco={ocDetalhe}
        codFichaDemanda={data?.codFichaDemanda}
        onClose={() => setOcDetalheId(null)}
      />
    </AppModalOverlay>
  );
}

function Resumo({
  titulo,
  valor,
  apagado,
  detalhe,
}: {
  titulo: string;
  valor: string;
  apagado?: boolean;
  detalhe?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2.5 dark:border-gray-700" title={detalhe}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{titulo}</p>
      <p
        className={`text-xl font-semibold tabular-nums ${
          apagado ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {valor}
      </p>
      {detalhe ? <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{detalhe}</p> : null}
    </div>
  );
}
