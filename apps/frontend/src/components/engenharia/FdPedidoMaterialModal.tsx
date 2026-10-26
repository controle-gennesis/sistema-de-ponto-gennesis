'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ListChecks,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronRight,
  CircleDashed,
  Info,
  Loader2,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import { FdPedidosResumoModal } from '@/components/engenharia/FdPedidosResumoModal';
import {
  getRmMaterialLabel,
  searchRmMaterials,
  type RmMaterialListItem,
} from '@/lib/searchRmMaterials';

/** Insumo da ficha de demanda — cada linha da FD é associada separadamente. */
export interface FdInsumoLine {
  key: string;
  item: string;
  codigo: string;
  descricao: string;
  /** MA, MO, LO, outro código ou '' (em branco). */
  tipo: string;
  unidade: string;
  quantidade: number;
  /** Rótulos da hierarquia da FD (ex.: "1 ADMINISTRAÇÃO", "1.1 ADMINISTRAÇÃO", "1.1.1 ENGENHEIRO..."). */
  etapa: string;
  subetapa: string;
  composicao: string;
}

/** Material do cadastro associado a um item da FD (1 item → N materiais). */
export interface FdMaterialMapping {
  materialId: string;
  materialLabel: string;
  /** Unidade do material no cadastro (referência). */
  materialUnit: string;
  /** Unidade do pedido = unidade do material no cadastro (a mesma do TOTVS); não editável. */
  unidade: string;
  quantity: number;
}

/** Rascunho das associações, por chave do insumo da FD (persistido na meta do orçamento). */
export type FdMaterialMap = Record<string, FdMaterialMapping[]>;

/** Item da FD já solicitado em uma RM (vem de `demandSheetApproval.itensPedidos`). */
export interface FdItemPedido {
  fdItemKey: string;
  fdItem: string;
  descricao: string;
  requestNumber: string;
  materialRequestId: string;
  requestedAt: string;
  requestedBy: string;
  /** Soma das quantidades dos materiais pedidos para o item (RMs novas). */
  quantidade?: number;
  /** Quantidade do item no orçamento no momento do pedido. */
  quantidadeFd?: number | null;
  /** Unidade do item na FD. */
  unidadeFd?: string;
  /** Soma só dos materiais pedidos na unidade da FD (base do saldo). */
  quantidadeNaUnidadeFd?: number;
  /** Materiais associados ao item naquele pedido. */
  materiais?: { materialId: string; materialLabel: string; quantity: number; unit: string }[];
  /** '1:N' e/ou 'unidade' — itens destacados para o gestor. */
  alertas?: string[];
}

/** Tolerância de arredondamento ao comparar com a quantidade da FD. */
const QTD_EPS = 1e-6;

export function parseFdMaterialMap(raw: unknown): FdMaterialMap | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: FdMaterialMap = {};
  for (const [key, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    const parsed = rows
      .map((r) => {
        const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
        return {
          materialId: typeof o.materialId === 'string' ? o.materialId : '',
          materialLabel: typeof o.materialLabel === 'string' ? o.materialLabel : '',
          materialUnit: typeof o.materialUnit === 'string' ? o.materialUnit : '',
          unidade: typeof o.unidade === 'string' ? o.unidade : '',
          quantity: Number.isFinite(Number(o.quantity)) ? Number(o.quantity) : 0,
        };
      })
      .filter((r) => r.materialId);
    if (parsed.length > 0) out[key] = parsed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fdApprovalId: string;
  insumos: FdInsumoLine[];
  /** Associações salvas anteriormente (rascunho). */
  initialMap?: FdMaterialMap;
  /** Itens da FD já pedidos em RMs anteriores (marcados; podem ser pedidos de novo). */
  itensPedidos: FdItemPedido[];
  /** Persiste o rascunho (ao fechar ou em "Salvar rascunho"). */
  onDraftChange: (map: FdMaterialMap | undefined) => void;
  serviceOrderId?: string;
  onSuccess: (itensPedidos: FdItemPedido[]) => void;
}

/** Tipos sempre exibidos no filtro; outros códigos presentes na FD entram depois. */
const TIPOS_FIXOS: { id: string; label: string }[] = [
  { id: 'MA', label: 'Material' },
  { id: 'MO', label: 'Mão de obra' },
  { id: 'LO', label: 'Locação' },
  { id: '', label: 'Em branco' },
];

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const linhaVazia = (quantity: number, unidade: string): FdMaterialMapping => ({
  materialId: '',
  materialLabel: '',
  materialUnit: '',
  unidade,
  quantity,
});

/** Linhas com material escolhido entram no pedido; linhas sem material são ignoradas. */
function linhasComMaterial(rows: FdMaterialMapping[] | undefined): FdMaterialMapping[] {
  return (rows || []).filter((r) => !!r.materialId);
}

/** Quantidade pedida de um item da FD = soma das quantidades dos materiais associados. */
function somaMateriais(rows: FdMaterialMapping[] | undefined): number {
  return linhasComMaterial(rows).reduce((acc, r) => acc + (r.quantity || 0), 0);
}

type Grupo = {
  etapa: string;
  subetapas: { subetapa: string; composicoes: { composicao: string; itens: FdInsumoLine[] }[] }[];
  itens: FdInsumoLine[];
};

function agruparPorEtapa(insumos: FdInsumoLine[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const ins of insumos) {
    let g = grupos[grupos.length - 1];
    if (!g || g.etapa !== ins.etapa) {
      g = { etapa: ins.etapa, subetapas: [], itens: [] };
      grupos.push(g);
    }
    g.itens.push(ins);
    let sub = g.subetapas[g.subetapas.length - 1];
    if (!sub || sub.subetapa !== ins.subetapa) {
      sub = { subetapa: ins.subetapa, composicoes: [] };
      g.subetapas.push(sub);
    }
    let comp = sub.composicoes[sub.composicoes.length - 1];
    if (!comp || comp.composicao !== ins.composicao) {
      comp = { composicao: ins.composicao, itens: [] };
      sub.composicoes.push(comp);
    }
    comp.itens.push(ins);
  }
  return grupos;
}

const TIPO_BADGE: Record<string, string> = {
  MA: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  MO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  LO: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

export function FdPedidoMaterialModal({
  isOpen,
  onClose,
  fdApprovalId,
  insumos,
  initialMap,
  itensPedidos,
  onDraftChange,
  serviceOrderId,
  onSuccess,
}: Props) {
  const [mappings, setMappings] = useState<FdMaterialMap>({});
  const [busca, setBusca] = useState('');
  /** Tipos desmarcados no filtro (os demais aparecem, inclusive tipos novos). */
  const [tiposOcultos, setTiposOcultos] = useState<Set<string>>(() => new Set());
  /** Etapas abertas pelo usuário — por padrão todas começam recolhidas. */
  const [etapasExpandidas, setEtapasExpandidas] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [resumoAberto, setResumoAberto] = useState(false);

  // Recria as linhas a cada abertura (insumos chegam depois do primeiro render da página).
  useEffect(() => {
    if (!isOpen) return;
    const init: FdMaterialMap = {};
    for (const ins of insumos) {
      const salvas = initialMap?.[ins.key];
      init[ins.key] = salvas && salvas.length > 0
        ? salvas.map((r) => ({ ...r, unidade: r.materialUnit || r.unidade || '' }))
        : [linhaVazia(ins.quantidade, '')];
    }
    setMappings(init);
    setBusca('');
    setEtapasExpandidas(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** RM em que cada item da FD já entrou — item pedido fica travado (pedido integral, uma vez só). */
  const pedidoPorKey = useMemo(() => {
    const m = new Map<string, FdItemPedido[]>();
    for (const p of itensPedidos) m.set(p.fdItemKey, [...(m.get(p.fdItemKey) || []), p]);
    return m;
  }, [itensPedidos]);


  const insumoPorKey = useMemo(() => new Map(insumos.map((i) => [i.key, i])), [insumos]);

  /**
   * Pedido integral do item:
   * - 1 material na unidade da FD → a quantidade tem que ser a da FD.
   * - 1:N ou unidade alterada → não dá para conferir; o item fica em alerta (vermelho) para o gestor.
   */
  const analisarItem = useCallback(
    (key: string) => {
      const ins = insumoPorKey.get(key);
      const rows = linhasComMaterial(mappings[key]);
      const unidadeFd = (ins?.unidade ?? '').trim();
      const travado = pedidoPorKey.has(key);
      const multi = rows.length > 1;
      const unidadeAlterada = rows.some((r) => r.unidade.trim().toUpperCase() !== unidadeFd.toUpperCase());
      const alerta = !travado && (multi || unidadeAlterada);
      const quantidadeDiferente =
        !travado && !alerta && rows.length === 1 && Math.abs(rows[0].quantity - (ins?.quantidade ?? 0)) > QTD_EPS;
      return { rows, travado, multi, unidadeAlterada, alerta, quantidadeDiferente };
    },
    [insumoPorKey, mappings, pedidoPorKey],
  );

  /** Item pronto: não pedido antes, ≥1 material, quantidades > 0 e integral quando é 1:1 na unidade da FD. */
  const itemPronto = useCallback(
    (key: string) => {
      const a = analisarItem(key);
      return !a.travado && a.rows.length > 0 && a.rows.every((r) => r.quantity > 0) && !a.quantidadeDiferente;
    },
    [analisarItem],
  );

  const itensProntos = useMemo(() => insumos.filter((ins) => itemPronto(ins.key)), [insumos, itemPronto]);
  const totalPedidos = useMemo(
    () => insumos.filter((ins) => pedidoPorKey.has(ins.key)).length,
    [insumos, pedidoPorKey],
  );
  const itensSemQuantidade = useMemo(
    () =>
      insumos.filter(
        (ins) => !pedidoPorKey.has(ins.key) && linhasComMaterial(mappings[ins.key]).some((r) => r.quantity <= 0),
      ),
    [insumos, mappings, pedidoPorKey],
  );
  const itensNaoIntegrais = useMemo(
    () => insumos.filter((ins) => analisarItem(ins.key).quantidadeDiferente),
    [insumos, analisarItem],
  );

  const contagemPorTipo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const ins of insumos) m[ins.tipo] = (m[ins.tipo] || 0) + 1;
    return m;
  }, [insumos]);

  const tiposFiltro = useMemo(() => {
    const extras = Object.keys(contagemPorTipo)
      .filter((t) => !TIPOS_FIXOS.some((f) => f.id === t))
      .sort()
      .map((t) => ({ id: t, label: '' }));
    return [...TIPOS_FIXOS, ...extras];
  }, [contagemPorTipo]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const visiveis = insumos.filter(
      (ins) =>
        !tiposOcultos.has(ins.tipo) &&
        (!q || `${ins.item} ${ins.codigo} ${ins.descricao}`.toLowerCase().includes(q)),
    );
    return agruparPorEtapa(visiveis);
  }, [insumos, busca, tiposOcultos]);

  const buscaAtiva = busca.trim() !== '';
  const todasExpandidas = grupos.length > 0 && grupos.every((g) => etapasExpandidas.has(g.etapa));

  const toggleTipo = useCallback((tipo: string) => {
    setTiposOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) next.delete(tipo);
      else next.add(tipo);
      return next;
    });
  }, []);

  const toggleEtapa = useCallback((etapa: string) => {
    setEtapasExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(etapa)) next.delete(etapa);
      else next.add(etapa);
      return next;
    });
  }, []);

  const updateMapping = useCallback(
    (insumoKey: string, idx: number, patch: Partial<FdMaterialMapping>) => {
      setMappings((prev) => {
        const rows = [...(prev[insumoKey] || [])];
        rows[idx] = { ...rows[idx], ...patch };
        return { ...prev, [insumoKey]: rows };
      });
    },
    [],
  );


  const addRow = useCallback((insumoKey: string) => {
    setMappings((prev) => ({
      ...prev,
      [insumoKey]: [...(prev[insumoKey] || []), linhaVazia(0, '')],
    }));
  }, []);

  const removeRow = useCallback((insumoKey: string, idx: number) => {
    setMappings((prev) => {
      const rows = [...(prev[insumoKey] || [])];
      if (rows.length <= 1) return { ...prev, [insumoKey]: [linhaVazia(0, '')] };
      rows.splice(idx, 1);
      return { ...prev, [insumoKey]: rows };
    });
  }, []);

  const salvarRascunho = useCallback(() => {
    onDraftChange(parseFdMaterialMap(mappings));
  }, [mappings, onDraftChange]);

  const fechar = useCallback(() => {
    if (submitting) return;
    salvarRascunho();
    onClose();
  }, [submitting, salvarRascunho, onClose]);

  const handleSubmit = useCallback(async () => {
    if (itensSemQuantidade.length > 0) {
      toast.error(`Informe a quantidade dos materiais do item ${itensSemQuantidade[0].item}.`);
      return;
    }
    if (itensNaoIntegrais.length > 0) {
      const ins = itensNaoIntegrais[0];
      toast.error(
        `Item ${ins.item}: deve ser solicitado de forma integral (${fmtQtd(ins.quantidade)} ${ins.unidade}).`,
      );
      return;
    }
    if (itensProntos.length === 0) {
      toast.error('Associe pelo menos um item da FD a um material.');
      return;
    }
    const items = itensProntos.flatMap((ins) =>
      linhasComMaterial(mappings[ins.key]).map((r) => ({
        fdItemKey: ins.key,
        fdItem: ins.item,
        fdDescricao: ins.descricao,
        fdQuantidade: ins.quantidade,
        fdUnidade: ins.unidade,
        materialId: r.materialId,
        materialLabel: r.materialLabel,
        quantity: r.quantity,
        unit: r.unidade.trim() || ins.unidade,
        description: `FD ${ins.item} — ${ins.descricao}`,
      })),
    );

    setSubmitting(true);
    try {
      const res = await api.post(`/demand-sheet-approvals/${fdApprovalId}/material-request`, {
        serviceOrderId: serviceOrderId || undefined,
        items,
      });
      const data = res.data?.data || {};
      const rn = data.requestNumber || 'RM criada';
      toast.success(`Requisição de material ${rn} criada com ${itensProntos.length} item(ns) da FD.`);
      // Limpa as associações já enviadas para não repetir o pedido sem querer.
      const restante: FdMaterialMap = { ...mappings };
      for (const ins of itensProntos) restante[ins.key] = [linhaVazia(0, '')];
      setMappings(restante);
      onDraftChange(parseFdMaterialMap(restante));
      onSuccess(Array.isArray(data.itensPedidos) ? data.itensPedidos : itensPedidos);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Erro ao criar requisição de material');
    } finally {
      setSubmitting(false);
    }
  }, [itensSemQuantidade, itensNaoIntegrais, itensProntos, mappings, fdApprovalId, serviceOrderId, onDraftChange, onSuccess, itensPedidos]);

  if (!isOpen) return null;

  const renderItem = (ins: FdInsumoLine) => {
    const pedidos = pedidoPorKey.get(ins.key) ?? [];
    const rmsDoItem = [...new Set(pedidos.map((p) => p.requestNumber).filter(Boolean))];
    const materiaisPedidos = pedidos.flatMap((p) => p.materiais ?? []);
    const rows = mappings[ins.key] || [];
    const pronto = itemPronto(ins.key);
    const somaQtd = somaMateriais(rows);
    const analise = analisarItem(ins.key);
    return (
      <div
        key={ins.key}
        className={`rounded-lg border p-3 ${
          analise.travado
            ? 'border-gray-200 bg-gray-100/70 opacity-80 dark:border-gray-700 dark:bg-gray-800/30'
            : analise.alerta || analise.quantidadeDiferente
            ? 'border-red-400 bg-red-50/60 dark:border-red-700 dark:bg-red-950/20'
            : pronto
            ? 'border-green-300 bg-green-50/60 dark:border-green-800 dark:bg-green-950/20'
            : rmsDoItem.length > 0
              ? 'border-gray-200 bg-gray-100/70 dark:border-gray-700 dark:bg-gray-800/30'
              : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {analise.travado ? (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            ) : pronto ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                <span className="mr-2 tabular-nums text-gray-500 dark:text-gray-400">{ins.item}</span>
                <span
                  className={`mr-2 inline-block rounded px-1.5 py-0.5 align-middle text-[10px] font-semibold ${
                    TIPO_BADGE[ins.tipo] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  {ins.tipo || '—'}
                </span>
                {ins.descricao}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ins.codigo ? `Cód. ${ins.codigo} · ` : ''}
                Qtd. FD: {fmtQtd(ins.quantidade)} {ins.unidade}
                {!analise.travado && rows.length > 1 && ` · Total associado: ${fmtQtd(somaQtd)}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {rmsDoItem.length > 0 && (
              <span
                className="rounded-md bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                title={`Já solicitado em: ${rmsDoItem.join(', ')}`}
              >
                Solicitado · {rmsDoItem.join(', ')}
              </span>
            )}
            {!analise.travado && (
            <button
              type="button"
              onClick={() => addRow(ins.key)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              title="Adicionar outro material para este item"
            >
              <Plus className="h-3 w-3" /> Material
            </button>
            )}
          </div>
        </div>

        {analise.travado ? (
          <div className="mt-2 space-y-1 pl-6 text-xs text-gray-600 dark:text-gray-400">
            {materiaisPedidos.map((m, idx) => (
              <p key={`${m.materialId}-${idx}`}>
                → {m.materialLabel || 'Material'} · {fmtQtd(m.quantity)} {m.unit}
              </p>
            ))}
            <p className="italic">Item já solicitado — não pode entrar em um novo pedido.</p>
          </div>
        ) : (
          <div className="mt-2 space-y-1.5 pl-6">
            {rows.map((row, ri) => (
              <div key={ri} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {/* Mesma busca da RM: retorna IDs de engenharia, que a RM exige. */}
                  <AsyncSearchSelectDropdown<RmMaterialListItem>
                    value={row.materialId}
                    selectedLabel={row.materialLabel || undefined}
                    onChange={(mat) =>
                      updateMapping(ins.key, ri, {
                        materialId: mat.id,
                        materialLabel: getRmMaterialLabel(mat),
                        materialUnit: mat.unit || '',
                        unidade: mat.unit || '',
                      })
                    }
                    searchFn={searchRmMaterials}
                    getOptionId={(m) => m.id}
                    // Mostra a unidade do cadastro (a mesma do TOTVS) já na lista.
                    getOptionLabel={(m) =>
                      m.unit?.trim() ? `${getRmMaterialLabel(m)} · ${m.unit.trim()}` : getRmMaterialLabel(m)
                    }
                    placeholder="Buscar material..."
                    minSearchLength={2}
                    queryKeyPrefix="rm-materials-search"
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={row.quantity || ''}
                  onChange={(e) =>
                    updateMapping(ins.key, ri, {
                      quantity: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Qtd"
                  aria-label="Quantidade do material"
                />
                {/* Unidade do material no cadastro (= TOTVS); não editável. */}
                <span
                  className={`flex w-16 shrink-0 items-center justify-center rounded-md border bg-gray-50 px-2 py-1.5 text-center text-sm dark:bg-gray-800/60 ${
                    row.materialId &&
                    row.unidade.trim().toUpperCase() !== ins.unidade.trim().toUpperCase()
                      ? 'border-red-500 text-red-700 dark:border-red-500 dark:text-red-300'
                      : 'border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200'
                  }`}
                  title={
                    row.materialId
                      ? `Unidade cadastrada no material (TOTVS): ${row.unidade || 'não informada'}`
                      : 'Selecione o material para ver a unidade'
                  }
                  aria-label="Unidade do material"
                >
                  {row.materialId ? row.unidade || '—' : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(ins.key, ri)}
                  disabled={rows.length <= 1 && !row.materialId}
                  className="rounded-md p-1 text-red-500 hover:bg-red-50 disabled:invisible dark:hover:bg-red-900/30"
                  aria-label={rows.length <= 1 ? 'Limpar material' : 'Remover material'}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {analise.quantidadeDiferente && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                O item deve ser solicitado de forma integral: {fmtQtd(ins.quantidade)} {ins.unidade}.
              </p>
            )}
            {analise.alerta && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                Atenção:{' '}
                {[
                  analise.multi ? '1 item da FD com vários materiais' : '',
                  analise.unidadeAlterada ? `unidade diferente da FD (${ins.unidade})` : '',
                ]
                  .filter(Boolean)
                  .join(' e ')}
                . A quantidade não é travada e este item aparecerá destacado para o gestor na aprovação da RM.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppModalOverlay
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div
        className="relative flex h-[90vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl dark:bg-gray-900 dark:shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Associar itens da FD aos materiais
            </h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              Cada item pode ser atendido por um ou mais materiais. Os itens já solicitados ficam travados com o
              número da RM.
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              A FD pode ser solicitada parcialmente, mas os itens das etapas devem ser solicitados de forma integral.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {itensPedidos.length > 0 && (
              <button
                type="button"
                onClick={() => setResumoAberto(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <ListChecks className="h-3.5 w-3.5" aria-hidden />
                Ver itens solicitados
              </button>
            )}
            <button
              type="button"
              onClick={fechar}
              disabled={submitting}
              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <FdPedidosResumoModal
          isOpen={resumoAberto}
          onClose={() => setResumoAberto(false)}
          fdApprovalId={fdApprovalId}
          insumos={insumos}
        />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-6 py-3 dark:border-gray-700">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar por item, código ou descrição..."
              className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por tipo">
            <span className="mr-1 text-xs font-medium text-gray-500 dark:text-gray-400">Tipo:</span>
            {tiposFiltro.map((t) => {
              const ativo = !tiposOcultos.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTipo(t.id)}
                  aria-pressed={ativo}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    ativo
                      ? 'border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-600'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.id && t.label ? `${t.id} · ${t.label}` : t.label || t.id} ({contagemPorTipo[t.id] || 0})
                </button>
              );
            })}
          </div>
          {!buscaAtiva && grupos.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setEtapasExpandidas(todasExpandidas ? new Set() : new Set(grupos.map((g) => g.etapa)))
              }
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {todasExpandidas ? (
                <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
              )}
              {todasExpandidas ? 'Recolher todas' : 'Expandir todas'}
            </button>
          )}
          <span className="ml-auto text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium text-green-700 dark:text-green-400">{itensProntos.length} prontos</span>
            {' · '}
            {totalPedidos} solicitados · {insumos.length} itens
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {insumos.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum insumo na ficha de demanda.
            </p>
          ) : grupos.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhum item encontrado para os filtros.
            </p>
          ) : (
            <div className="space-y-4">
              {grupos.map((g) => {
                // Com busca ativa, abre tudo para mostrar os resultados.
                const recolhida = !buscaAtiva && !etapasExpandidas.has(g.etapa);
                const pedidosEtapa = g.itens.filter((i) => pedidoPorKey.has(i.key)).length;
                const prontosEtapa = g.itens.filter((i) => itemPronto(i.key)).length;
                return (
                  <section key={g.etapa} className="rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => toggleEtapa(g.etapa)}
                      className="flex w-full items-center gap-2 rounded-t-lg bg-red-50 px-3 py-2 text-left hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60"
                      aria-expanded={!recolhida}
                    >
                      {recolhida ? (
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold uppercase text-gray-900 dark:text-gray-100">
                        {g.etapa || 'Sem etapa'}
                      </span>
                      <span className="shrink-0 text-xs text-gray-600 dark:text-gray-300">
                        {prontosEtapa > 0 && (
                          <span className="text-green-700 dark:text-green-400">{prontosEtapa} prontos · </span>
                        )}
                        {pedidosEtapa}/{g.itens.length} solicitados
                      </span>
                    </button>
                    {!recolhida && (
                      <div className="space-y-3 p-3">
                        {g.subetapas.map((sub) => (
                          <div key={sub.subetapa} className="space-y-2">
                            {sub.subetapa && sub.subetapa !== g.etapa && (
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                {sub.subetapa}
                              </p>
                            )}
                            {sub.composicoes.map((comp) => (
                              <div key={comp.composicao} className="space-y-2">
                                {comp.composicao && (
                                  <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400" title={comp.composicao}>
                                    {comp.composicao}
                                  </p>
                                )}
                                {comp.itens.map(renderItem)}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            onClick={fechar}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => {
              salvarRascunho();
              toast.success('Associações salvas.');
            }}
            disabled={submitting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Salvar rascunho
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={itensProntos.length === 0 || submitting}
            title={itensProntos.length === 0 ? 'Associe pelo menos um item para enviar' : undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar pedido para aprovação{itensProntos.length > 0 ? ` (${itensProntos.length})` : ''}
          </button>
        </div>
      </div>
    </AppModalOverlay>
  );
}
