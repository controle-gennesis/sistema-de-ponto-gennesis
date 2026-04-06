'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calculator,
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  Search,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Building2,
  FileDown,
  FileText,
  Table2,
  ClipboardList,
  Pencil,
  ArrowLeft,
  ListPlus
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { OrcamentoMedicaoPainel } from './OrcamentoMedicaoPainel';
import { calcularQuantidadeLinha, inferirTipoUnidadePorDimensao } from './orcamentoMedicaoCalc';
import type { LinhaMedicao, DimensoesItem, TipoUnidadeFormula } from './orcamentoMedicaoTypes';
export type { LinhaMedicao, TipoUnidadeFormula, DimensoesItem } from './orcamentoMedicaoTypes';

// Tipos
export interface ComposicaoItem {
  codigo: string;
  banco: string;
  chave: string;
  descricao: string;
  unidade?: string;
  precoUnitario: number;
  maoDeObraUnitario?: number;
  materialUnitario?: number;
  analiticoLinhas?: LinhaAnaliticoComposicao[];
}

type CategoriaAnalitico = 'MATERIAL' | 'MÃO DE OBRA';

export interface LinhaAnaliticoComposicao {
  categoria: CategoriaAnalitico;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
}

export interface AnaliticoComposicao {
  total: number;
  linhas: LinhaAnaliticoComposicao[];
}

export interface ItemServico {
  chave: string;
  codigo: string;
  banco: string;
  descricao: string;
  precoUnitario?: number;
  maoDeObraUnitario?: number;
  materialUnitario?: number;
}

export interface Subtitulo {
  id: string;
  nome: string;
  itens: ItemServico[];
}

export interface ServicoPadrao {
  id: string;
  nome: string;
  subtitulos: Subtitulo[];
}

const STORAGE_PREFIX = 'orcamento';
const STORAGE_IMPORTS = 'orcamento-imports';

/** `orcamentoId` só para dados do orçamento (serviços, imports, sessão); composições não usam. */
function storageKey(centroCustoId: string, base: string, orcamentoId?: string | null) {
  const suffix = orcamentoId ? `-${orcamentoId}` : '';
  return `${STORAGE_PREFIX}-${base}-${centroCustoId}${suffix}`;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  date: string;
  tipo: 'orçamento' | 'composições';
  servicosCount?: number;
  itensCount?: number;
}

type OrcamentoMeta = {
  osNumeroPasta: string;
  dataAbertura: string; // yyyy-mm-dd
  dataEnvio: string; // yyyy-mm-dd (atualiza ao salvar)
  prazoExecucaoDias: string; // mantém como string p/ input
  responsavelOrcamento: string;
  descricao: string;
  orcamentoRealizadoPor: string;
  revisaoCount: number; // 0 = sem revisão; ao salvar vira 1 => R01
};

function todayInputDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Igualdade do título do serviço na tabela (evita repetir o cabeçalho vermelho quando o nome é o mesmo). */
function normalizarNomeServicoOrcamento(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Marca subtítulo sem composições na seleção do dropdown (valor sintético da chave). */
const DROPDOWN_BLOCO_SEM_ITENS = '__bloco_sem_itens__';

function buildItemKeyOrcamento(blocoKey: string, chave: string) {
  return `${blocoKey}|${chave}`;
}

/** Parse `servicoId|subtituloId|chave` (chave pode conter `|` em teoria; ids vêm de UUID). */
function parseItemKeyOrcamento(itemKey: string): { blocoKey: string; chave: string } | null {
  const parts = itemKey.split('|');
  if (parts.length < 3) return null;
  const chave = parts[parts.length - 1]!;
  const subtituloId = parts[parts.length - 2]!;
  const servicoId = parts.slice(0, -2).join('|');
  return { blocoKey: `${servicoId}|${subtituloId}`, chave };
}

function findSubtituloPorBlocoKey(list: ServicoPadrao[], blocoKey: string): Subtitulo | null {
  for (const s of list) {
    for (const sub of s.subtitulos) {
      if (`${s.id}|${sub.id}` === blocoKey) return sub;
    }
  }
  return null;
}

/** Parse número no formato brasileiro (ex.: 1.416,00) para campos da planilha analítica. */
function parsePlanilhaPtBr(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function tipoPlanilhaInsumo(categoria: string): string {
  const u = categoria.toUpperCase();
  if (u.includes('MÃO') || u.includes('OBRA')) return 'MO';
  return 'MAT';
}

/** Formatação condicional col. Levantamento (%): faixas amarelo e vermelho com o mesmo padrão (claro: 50 + 900; escuro: 500/15 + 200). */
function classeLevantamentoCondicional(lev: number): string {
  if (!Number.isFinite(lev)) return '';
  if (lev < 50) {
    return 'bg-green-50 text-green-950 dark:bg-green-950/35 dark:text-green-100';
  }
  if (lev >= 50 && lev < 80.99) {
    return 'font-medium bg-yellow-50 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200';
  }
  if (lev >= 80.99 && lev <= 120) {
    return 'font-medium bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200';
  }
  return '';
}

type EmployeeOption = {
  id: string;
  name: string;
};

/** Estado da montagem do orçamento (persistido por contrato). */
interface SessaoOrcamentoPersist {
  subtitulosNoOrcamento: string[];
  quantidadesPorItem: Record<string, number>;
  dimensoesPorItem: Record<string, DimensoesItem>;
  /** Planilha analítica: chaves = linha analítica (composição ou insumo). */
  planilhaQuantidadeCompra: Record<string, number>;
  planilhaValorUnitCompraReal: Record<string, number>;
  showDetalhesFinanceiros: boolean;
  meta?: OrcamentoMeta;
  /**
   * Chaves `servicoId|subtituloId|chave` ocultas na montagem (removidas pelo usuário).
   * Não apagamos do catálogo `servicos` para poder restaurar sem reimportar.
   */
  itensOcultosNoOrcamento?: string[];
}

function sessaoVazia(): SessaoOrcamentoPersist {
  return {
    subtitulosNoOrcamento: [],
    quantidadesPorItem: {},
    dimensoesPorItem: {},
    planilhaQuantidadeCompra: {},
    planilhaValorUnitCompraReal: {},
    showDetalhesFinanceiros: false,
    itensOcultosNoOrcamento: [],
    meta: {
      osNumeroPasta: '',
      dataAbertura: '',
      dataEnvio: '',
      prazoExecucaoDias: '',
      responsavelOrcamento: '',
      descricao: '',
      orcamentoRealizadoPor: '',
      revisaoCount: 0
    }
  };
}

function loadSessaoOrcamento(centroCustoId: string | null, orcamentoId: string | null): SessaoOrcamentoPersist | null {
  if (typeof window === 'undefined' || !centroCustoId || !orcamentoId) return null;
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'sessao', orcamentoId));
    if (!s) return null;
    const p = JSON.parse(s) as Partial<SessaoOrcamentoPersist>;
    if (!p || typeof p !== 'object') return null;
    const metaRaw = (p as any).meta;
    const hasMeta = metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw);
    const meta: OrcamentoMeta = hasMeta
      ? {
          osNumeroPasta: typeof metaRaw.osNumeroPasta === 'string' ? metaRaw.osNumeroPasta : '',
          dataAbertura: typeof metaRaw.dataAbertura === 'string' ? metaRaw.dataAbertura : '',
          dataEnvio: typeof metaRaw.dataEnvio === 'string' ? metaRaw.dataEnvio : '',
          prazoExecucaoDias: typeof metaRaw.prazoExecucaoDias === 'string' ? metaRaw.prazoExecucaoDias : '',
          responsavelOrcamento: typeof metaRaw.responsavelOrcamento === 'string' ? metaRaw.responsavelOrcamento : '',
          descricao: typeof metaRaw.descricao === 'string' ? metaRaw.descricao : '',
          orcamentoRealizadoPor: typeof metaRaw.orcamentoRealizadoPor === 'string' ? metaRaw.orcamentoRealizadoPor : '',
          revisaoCount:
            typeof metaRaw.revisaoCount === 'number' && isFinite(metaRaw.revisaoCount) ? metaRaw.revisaoCount : 0
        }
      : sessaoVazia().meta!;
    return {
      subtitulosNoOrcamento: Array.isArray(p.subtitulosNoOrcamento) ? p.subtitulosNoOrcamento : [],
      quantidadesPorItem: p.quantidadesPorItem && typeof p.quantidadesPorItem === 'object' ? p.quantidadesPorItem : {},
      dimensoesPorItem: p.dimensoesPorItem && typeof p.dimensoesPorItem === 'object' ? p.dimensoesPorItem : {},
      planilhaQuantidadeCompra:
        p.planilhaQuantidadeCompra && typeof p.planilhaQuantidadeCompra === 'object' ? p.planilhaQuantidadeCompra : {},
      planilhaValorUnitCompraReal:
        p.planilhaValorUnitCompraReal && typeof p.planilhaValorUnitCompraReal === 'object'
          ? p.planilhaValorUnitCompraReal
          : {},
      showDetalhesFinanceiros: Boolean(p.showDetalhesFinanceiros),
      itensOcultosNoOrcamento: Array.isArray(p.itensOcultosNoOrcamento) ? p.itensOcultosNoOrcamento : [],
      meta
    };
  } catch {
    return null;
  }
}

function loadComposicoes(centroCustoId: string | null): ComposicaoItem[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'composicoes'));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveComposicoes(centroCustoId: string, items: ComposicaoItem[]) {
  localStorage.setItem(storageKey(centroCustoId, 'composicoes'), JSON.stringify(items));
}

/** Serviços padrão e imports são compartilhados por todos os orçamentos do contrato. */
function loadServicos(centroCustoId: string | null): ServicoPadrao[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'servicos'));
    const parsed: any[] = s ? JSON.parse(s) : [];
    return parsed.map(svc => {
      if (svc.subtitulos && Array.isArray(svc.subtitulos)) return svc;
      const itens = svc.itens || [];
      return {
        ...svc,
        subtitulos: itens.length
          ? [{ id: crypto.randomUUID(), nome: svc.nome, itens }]
          : []
      };
    });
  } catch {
    return [];
  }
}

function saveServicos(centroCustoId: string, servicos: ServicoPadrao[]) {
  localStorage.setItem(storageKey(centroCustoId, 'servicos'), JSON.stringify(servicos));
}

function loadImports(centroCustoId: string | null): ImportRecord[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'imports'));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function addImport(centroCustoId: string, record: Omit<ImportRecord, 'id'>) {
  const list = loadImports(centroCustoId);
  list.unshift({
    ...record,
    id: crypto.randomUUID()
  } as ImportRecord);
  if (list.length > 20) list.pop();
  localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(list));
}

async function fetchOrcamentosLista(centroCustoId: string): Promise<{
  orcamentos: { id: string; nome: string; updatedAt: string }[];
  ultimoOrcamentoId: string | null;
}> {
  const res = await api.get(`/orcamento/${centroCustoId}`);
  const d = res.data;
  return {
    orcamentos: Array.isArray(d?.orcamentos) ? d.orcamentos : [],
    ultimoOrcamentoId: d?.ultimoOrcamentoId ?? null
  };
}

async function fetchOrcamentoDetail(centroCustoId: string, orcamentoId: string): Promise<{
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist | null;
} | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`);
    const d = res.data;
    if (!d || typeof d !== 'object') return null;
    const hasSessaoKey =
      'sessaoOrcamento' in d && d.sessaoOrcamento != null && typeof d.sessaoOrcamento === 'object';
    const so = d.sessaoOrcamento as Partial<SessaoOrcamentoPersist> | undefined;
    const metaRaw = (so as any)?.meta;
    const hasMeta = metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw);
    const meta: OrcamentoMeta = hasMeta
      ? {
          osNumeroPasta: typeof metaRaw.osNumeroPasta === 'string' ? metaRaw.osNumeroPasta : '',
          dataAbertura: typeof metaRaw.dataAbertura === 'string' ? metaRaw.dataAbertura : '',
          dataEnvio: typeof metaRaw.dataEnvio === 'string' ? metaRaw.dataEnvio : '',
          prazoExecucaoDias: typeof metaRaw.prazoExecucaoDias === 'string' ? metaRaw.prazoExecucaoDias : '',
          responsavelOrcamento: typeof metaRaw.responsavelOrcamento === 'string' ? metaRaw.responsavelOrcamento : '',
          descricao: typeof metaRaw.descricao === 'string' ? metaRaw.descricao : '',
          orcamentoRealizadoPor: typeof metaRaw.orcamentoRealizadoPor === 'string' ? metaRaw.orcamentoRealizadoPor : '',
          revisaoCount:
            typeof metaRaw.revisaoCount === 'number' && isFinite(metaRaw.revisaoCount) ? metaRaw.revisaoCount : 0
        }
      : sessaoVazia().meta!;
    const sessaoOrcamento: SessaoOrcamentoPersist | null =
      hasSessaoKey && so
        ? {
            subtitulosNoOrcamento: Array.isArray(so.subtitulosNoOrcamento) ? so.subtitulosNoOrcamento : [],
            quantidadesPorItem:
              so.quantidadesPorItem && typeof so.quantidadesPorItem === 'object' ? so.quantidadesPorItem : {},
            dimensoesPorItem:
              so.dimensoesPorItem && typeof so.dimensoesPorItem === 'object' ? so.dimensoesPorItem : {},
            planilhaQuantidadeCompra:
              so.planilhaQuantidadeCompra && typeof so.planilhaQuantidadeCompra === 'object'
                ? so.planilhaQuantidadeCompra
                : {},
            planilhaValorUnitCompraReal:
              so.planilhaValorUnitCompraReal && typeof so.planilhaValorUnitCompraReal === 'object'
                ? so.planilhaValorUnitCompraReal
                : {},
            showDetalhesFinanceiros: Boolean(so.showDetalhesFinanceiros),
            itensOcultosNoOrcamento: Array.isArray(so.itensOcultosNoOrcamento) ? so.itensOcultosNoOrcamento : [],
            meta
          }
        : null;
    return {
      servicos: Array.isArray(d.servicos) ? d.servicos : [],
      imports: Array.isArray(d.imports) ? d.imports : [],
      sessaoOrcamento
    };
  } catch {
    return null;
  }
}

async function saveOrcamentoToApi(
  centroCustoId: string,
  orcamentoId: string,
  data: { servicos: ServicoPadrao[]; imports: ImportRecord[]; sessaoOrcamento?: SessaoOrcamentoPersist | null }
): Promise<void> {
  await api.put(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, data);
}

async function criarOrcamentoApi(
  centroCustoId: string,
  nome?: string
): Promise<{ id: string; nome: string; updatedAt: string }> {
  const res = await api.post(`/orcamento/${centroCustoId}/orcamentos`, { nome });
  return res.data;
}

async function excluirOrcamentoApi(centroCustoId: string, orcamentoId: string): Promise<void> {
  await api.delete(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`);
}

async function renomearOrcamentoApi(centroCustoId: string, orcamentoId: string, nome: string): Promise<void> {
  await api.patch(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, { nome });
}

async function saveServicosPadraoToApi(
  centroCustoId: string,
  data: { servicos: ServicoPadrao[]; imports: ImportRecord[] }
): Promise<void> {
  await api.put(`/orcamento/${centroCustoId}/servicos-padrao`, data);
}

async function fetchServicosPadraoFromApi(
  centroCustoId: string
): Promise<{ servicos: ServicoPadrao[]; imports: ImportRecord[] } | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}/servicos-padrao`);
    const root = res?.data;
    const d = root?.data && typeof root.data === 'object' ? root.data : root;
    return {
      servicos: Array.isArray(d?.servicos) ? d.servicos : [],
      imports: Array.isArray(d?.imports) ? d.imports : []
    };
  } catch {
    return null;
  }
}

async function fetchComposicoesGeral(): Promise<ComposicaoItem[]> {
  try {
    const res = await api.get('/orcamento/composicoes/geral');
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

async function saveComposicoesGeralToApi(items: ComposicaoItem[]) {
  try {
    await api.put('/orcamento/composicoes/geral', { items });
  } catch (err) {
    console.warn('Erro ao salvar composições no S3:', err);
  }
}

function parsePreco(val: any): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Avalia expressão matemática no padrão Excel (=10*8). Aceita vírgula como decimal. */
function evalSimpleExpr(str: string): number | null {
  const raw = String(str || '').trim();
  if (!raw.startsWith('=')) return null;
  const s = raw.slice(1).trim().replace(/,/g, '.');
  if (!s) return null;
  if (!/^[\d\s+\-*/.()]+$/.test(s)) return null;
  try {
    const result = new Function(`return (${s})`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function normalizarTextoBusca(val: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Insumos com descrição de caixinha não entram nos totais do rodapé da ficha. */
function insumoExcluirCaixinhaRodape(descricao: string): boolean {
  return normalizarTextoBusca(descricao || '').includes('caixinha');
}

/** MA = material, MO = mão de obra, LO = locação (por categoria/descrição). */
function grupoPrecoCompraInsumoRodape(categoria: string, descricao: string): 'MA' | 'MO' | 'LO' {
  const d = normalizarTextoBusca(descricao || '');
  const c = (categoria || '').toUpperCase();
  if (d.includes('locacao') || d.includes('locação') || d.includes('aluguel') || c.includes('LOCA')) return 'LO';
  if (c.includes('MÃO') || c.includes('OBRA') || d.includes('mao de obra')) return 'MO';
  return 'MA';
}

function normalizarCabecalhoColuna(val: string): string {
  // Remove pontuação para casar cabeçalhos como "M. O." e "MAT."
  return normalizarTextoBusca(val).replace(/[^a-z0-9+]/g, '');
}

function normalizarChave(codigo: string, banco: string): string {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  return `${c}${b}`.replace(/\s+/g, '');
}

function chavesParaBusca(codigo: string, banco: string, chave: string): string[] {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  const k = String(chave || '').trim();
  const uniq = new Set<string>();
  if (k) uniq.add(k);
  uniq.add(normalizarChave(c, b));
  uniq.add(`${c}${b}`.replace(/[\s.]+/g, '')); // sem pontos/espaços (ex: 1680097FDE)
  uniq.add(`${c}_${b}`);
  uniq.add(`${c}-${b}`);
  return Array.from(uniq);
}

/** Converte UND da planilha (M, M², M2, M³, M3, UN) para TipoUnidadeFormula */
function parseUnidadeComposicao(und: string | undefined): TipoUnidadeFormula | null {
  if (!und || !String(und).trim()) return null;
  const u = String(und).toUpperCase().replace(/\s/g, '').replace(/²/g, '2').replace(/³/g, '3');
  if (u === 'M3' || u.includes('CUBIC')) return 'm3';
  if (u === 'M2' || u.includes('QUADRAD')) return 'm2';
  if (u === 'M' || u === 'MT' || u === 'METRO' || u === 'METROS') return 'm';
  if (u === 'UN' || u === 'UND' || u === 'UNID' || u.includes('UNIDADE')) return 'un';
  return null;
}

/** Verifica se a descrição indica item de demolição, remoção ou retirada */
function ehItemDemolicaoOuRemocao(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao);
  return (
    d.includes('demolicao') || d.includes('demolicoes') ||
    d.includes('remocao') || d.includes('remocoes') ||
    d.includes('retirada') || d.includes('retiradas')
  );
}

/** Verifica se a descrição indica composição de Carga Manual de Entulho */
function ehComposicaoCargaEntulho(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao);
  return d.includes('carga') && d.includes('entulho') && (d.includes('caminhao') || d.includes('basculante'));
}

/** Verifica se a descrição indica composição de caçamba de 4m³ para entulho */
function ehComposicaoCacamba4m3(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao).replace(/\s/g, '');
  return d.includes('cacamba') && d.includes('entulho') && (d.includes('4m3') || d.includes('4m³'));
}

function roundTo(n: number, decimals: number) {
  const d = Math.pow(10, decimals);
  return Math.round(n * d) / d;
}

/** Exibição em planilha exportada (pt-BR). */
function formatarBRLExport(n: number) {
  return `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarPesoPctExport(n: number) {
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Estado vazio das abas derivadas do orçamento (sem itens na montagem). */
function OrcamentoSecaoVazia({
  titulo,
  texto,
  Icon,
  onIrOrcamento
}: {
  titulo: string;
  texto: string;
  Icon: React.ComponentType<{ className?: string }>;
  onIrOrcamento: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300/90 dark:border-gray-600/70 bg-gray-50 dark:bg-gray-900 px-5 py-12 sm:py-14 text-center"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600/[0.12] dark:bg-red-500/15 ring-1 ring-red-600/20 dark:ring-red-500/25">
        <Icon className="h-7 w-7 text-red-600 dark:text-red-400" aria-hidden />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">{titulo}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">{texto}</p>
      <button
        type="button"
        onClick={onIrOrcamento}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-900/15 transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
      >
        <ListPlus className="h-4 w-4 shrink-0" aria-hidden />
        Ir para a aba Orçamento
      </button>
    </div>
  );
}

/** Colunas em R$: símbolo à esquerda e valor numérico à direita na mesma célula. */
function MoedaCelula({
  valor,
  className,
  valorClassName,
  simboloClassName
}: {
  valor: number;
  className?: string;
  valorClassName?: string;
  simboloClassName?: string;
}) {
  const formatted = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className={`flex w-full min-w-0 items-baseline justify-between gap-2 tabular-nums ${className ?? ''}`}>
      <span className={`shrink-0 ${simboloClassName ?? ''}`}>R$</span>
      <span className={`min-w-0 text-right ${valorClassName ?? ''}`}>{formatted}</span>
    </div>
  );
}

function hashStringToInt(s: string): number {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function gerarAnaliticoComposicaoUnit(materialTotal: number, maoTotal: number, seedKey: string): AnaliticoComposicao {
  const total = (materialTotal || 0) + (maoTotal || 0);
  if (total <= 0) return { total: 0, linhas: [] };

  const seed = hashStringToInt(seedKey);
  const rnd = (offset: number) => ((seed + offset * 997) % 1000) / 1000; // 0..1

  const materiais = ['Cimento', 'Areia', 'Brita', 'Aço CA-50', 'Argamassa', 'Tijolos', 'Concreto', 'Aditivo', 'Impermeabilizante', 'Forma'];
  const maos = ['Pedreiro', 'Servente', 'Armador', 'Carpinteiro', 'Encarregado', 'Ajudante', 'Montador'];

  const materialLinesCount = 1 + (seed % 3); // 1..3
  const maoLinesCount = 1 + ((seed >> 2) % 3); // 1..3

  const makeLines = (categoria: CategoriaAnalitico, totalCategoria: number, names: string[], count: number, unidadeFallback: string, offsetBase: number) => {
    if (totalCategoria <= 0) return [];
    const weights = Array.from({ length: count }).map((_, i) => 0.2 + rnd(offsetBase + i));
    const sumW = weights.reduce((a, b) => a + b, 0) || 1;

    // Quantidades "de tela": só para dar leitura ao analítico.
    const unidades = Array.from({ length: count }).map((_, i) => {
      const v = rnd(offsetBase + 100 + i);
      return unidadeFallback || (v > 0.6 ? 'un' : 'm²');
    });

    const lines: LinhaAnaliticoComposicao[] = [];
    let acumulado = 0;
    for (let i = 0; i < count; i++) {
      const peso = weights[i] / sumW;
      const linhaTotal = i === count - 1 ? (totalCategoria - acumulado) : totalCategoria * peso;
      acumulado += linhaTotal;

      const qtdMin = categoria === 'MÃO DE OBRA' ? 1 : 0.5;
      const qtdMax = categoria === 'MÃO DE OBRA' ? 40 : 25;
      const quantidade = roundTo(qtdMin + rnd(offsetBase + 200 + i) * (qtdMax - qtdMin), 2);
      const precoUnitario = quantidade > 0 ? linhaTotal / quantidade : 0;

      lines.push({
        categoria,
        descricao: names[(seed + i + offsetBase) % names.length],
        unidade: unidades[i],
        quantidade,
        precoUnitario,
        total: linhaTotal
      });
    }
    return lines;
  };

  const materialLines = makeLines('MATERIAL', materialTotal, materiais, materialLinesCount, 'un', 1);
  const maoLines = makeLines('MÃO DE OBRA', maoTotal, maos, maoLinesCount, 'h', 2);
  const linhas = [...materialLines, ...maoLines];

  const somaLinhas = linhas.reduce((acc, l) => acc + l.total, 0);
  const diff = total - somaLinhas;
  if (linhas.length > 0 && Math.abs(diff) > 0.00001) {
    linhas[linhas.length - 1].total += diff;
    const last = linhas[linhas.length - 1];
    if (last.quantidade > 0) last.precoUnitario = last.total / last.quantidade;
  }

  return { total, linhas };
}

/** Checkbox do dropdown de serviços: caixa 20px, tema vermelho, suporta indeterminado. */
function ServicosDropdownCheckbox({
  id,
  checked,
  indeterminate,
  disabled,
  onChange,
  children,
  compact
}: {
  id?: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
  /** Linhas aninhadas (composições): padding menor */
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  const filled = checked || Boolean(indeterminate);

  return (
    <label
      className={`group flex items-start gap-3 rounded-lg cursor-pointer transition-colors ${
        compact ? 'py-2 min-h-[2.5rem] px-2 -mx-2' : 'py-2.5 px-2 -mx-2'
      } hover:bg-gray-100/95 dark:hover:bg-gray-600/50 ${
        disabled ? 'opacity-45 cursor-not-allowed hover:bg-transparent' : ''
      }`}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all shadow-sm outline-none group-focus-within:ring-2 group-focus-within:ring-red-500/80 group-focus-within:ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ${
          filled
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-500 dark:bg-gray-800 dark:group-hover:border-red-400/70'
        }`}
        aria-hidden
      >
        {checked && !indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
          </svg>
        )}
      </span>
      {children}
    </label>
  );
}

export default function OrcamentoPage() {
  const router = useRouter();
  const { costCenters, isLoading: loadingCentros } = useCostCenters();
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'composicoes' | 'orcamento'>('orcamento');
  const [composicoes, setComposicoes] = useState<ComposicaoItem[]>([]);
  const [servicos, setServicos] = useState<ServicoPadrao[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchComposicao, setSearchComposicao] = useState('');
  /** Chaves `servicoId|subtituloId|chave` (ou `…|${DROPDOWN_BLOCO_SEM_ITENS}`) escolhidas no dropdown. */
  const [linhasSelecionadasDropdown, setLinhasSelecionadasDropdown] = useState<Set<string>>(new Set());
  const [subtitulosNoOrcamento, setSubtitulosNoOrcamento] = useState<string[]>([]);
  const [itensOcultosNoOrcamento, setItensOcultosNoOrcamento] = useState<string[]>([]);
  const [quantidadesPorItem, setQuantidadesPorItem] = useState<Record<string, number>>({});
  const [dimensoesPorItem, setDimensoesPorItem] = useState<Record<string, DimensoesItem>>({});
  const [planilhaQuantidadeCompra, setPlanilhaQuantidadeCompra] = useState<Record<string, number>>({});
  const [planilhaValorUnitCompraReal, setPlanilhaValorUnitCompraReal] = useState<Record<string, number>>({});
  const [planilhaCompraDraft, setPlanilhaCompraDraft] = useState<Record<string, string>>({});
  const [novoServicoNome, setNovoServicoNome] = useState('');
  const [showAddServico, setShowAddServico] = useState(false);
  const [isImportandoOrcamento, setIsImportandoOrcamento] = useState(false);
  const [servicosExpandidos, setServicosExpandidos] = useState<Set<string>>(new Set());
  const [loadingFromApi, setLoadingFromApi] = useState(false);
  const [showServicosDropdown, setShowServicosDropdown] = useState(false);
  const [showContratoDropdown, setShowContratoDropdown] = useState(false);
  const [servicosSearch, setServicosSearch] = useState('');
  const [contratoSearch, setContratoSearch] = useState('');
  const [showDetalhesFinanceiros, setShowDetalhesFinanceiros] = useState(false);
  const servicosDropdownRef = useRef<HTMLDivElement | null>(null);
  const contratoDropdownRef = useRef<HTMLDivElement | null>(null);
  const contratoSearchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredCostCenters = useMemo(() => {
    const q = contratoSearch.trim().toLowerCase();
    const list = costCenters ?? [];
    if (!q) return list;
    return list.filter((cc: { code?: string; name?: string }) => {
      const code = (cc.code ?? '').toLowerCase();
      const name = (cc.name ?? '').toLowerCase();
      return code.includes(q) || name.includes(q) || `${code} ${name}`.includes(q);
    });
  }, [costCenters, contratoSearch]);

  // Analítico (detalhamento) da composição para visualização/exportação.
  const [orcamentoViewTab, setOrcamentoViewTab] = useState<
    'montagem' | 'analitico' | 'memorial' | 'planilhaAnalitica' | 'fichaDemanda'
  >('montagem');
  const [memorialItemKey, setMemorialItemKey] = useState<string | null>(null);
  // Cache do analítico por composição (por item) para não recalcular a cada clique.
  const [analiticoCache, setAnaliticoCache] = useState<Record<string, AnaliticoComposicao>>({});
  // Draft para campos que aceitam cálculos (2+3, 10/2, etc) - avalia no blur
  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const [orcamentoAtivoId, setOrcamentoAtivoId] = useState<string | null>(null);
  const [listaOrcamentos, setListaOrcamentos] = useState<{ id: string; nome: string; updatedAt: string }[]>([]);
  const [carregandoListaOrcamentos, setCarregandoListaOrcamentos] = useState(false);
  const [nomeOrcamentoRascunho, setNomeOrcamentoRascunho] = useState('');
  const [orcamentosSearch, setOrcamentosSearch] = useState('');
  const [editarDadosOpen, setEditarDadosOpen] = useState(false);
  const [editarDadosDraft, setEditarDadosDraft] = useState<
    OrcamentoMeta & { nomeOrcamento: string }
  >({
    ...sessaoVazia().meta!,
    nomeOrcamento: ''
  });
  const sessaoRef = useRef<SessaoOrcamentoPersist>(sessaoVazia());
  const servicosImportsRef = useRef<{ servicos: ServicoPadrao[]; imports: ImportRecord[] }>({
    servicos: [],
    imports: []
  });
  const orcamentoAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredListaOrcamentos = useMemo(() => {
    const q = orcamentosSearch.trim().toLowerCase();
    if (!q) return listaOrcamentos;
    return listaOrcamentos.filter((o) => (o.nome || '').toLowerCase().includes(q));
  }, [listaOrcamentos, orcamentosSearch]);

  const [meta, setMeta] = useState<OrcamentoMeta>(sessaoVazia().meta!);
  const [novoOrcamentoMetaOpen, setNovoOrcamentoMetaOpen] = useState(false);
  const [novoOrcamentoMetaDraft, setNovoOrcamentoMetaDraft] = useState<OrcamentoMeta>(() => ({
    ...sessaoVazia().meta!,
    dataAbertura: todayInputDate()
  }));
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [loadingEmployeeOptions, setLoadingEmployeeOptions] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');

  useEffect(() => {
    if (costCenters?.length && !centroCustoId) {
      const first = costCenters.find((c: { id?: string }) => c.id);
      if (first?.id) setCentroCustoId(first.id);
    }
  }, [costCenters, centroCustoId]);

  useEffect(() => {
    let cancelled = false;
    const loadMetaFormOptions = async () => {
      setLoadingEmployeeOptions(true);
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const [meRes, employeesRes] = await Promise.all([
          api.get('/auth/me'),
          api.get(`/payroll/employees?month=${month}&year=${year}&page=1&limit=500`)
        ]);
        if (cancelled) return;
        const userName = meRes?.data?.data?.name ? String(meRes.data.data.name) : '';
        setCurrentUserName(userName);
        const employees = Array.isArray(employeesRes?.data?.data?.employees)
          ? employeesRes.data.data.employees
          : [];
        const options = employees
          .map((e: any) => ({
            id: String(e?.id ?? ''),
            name: String(e?.name ?? '').trim()
          }))
          .filter((e: EmployeeOption) => e.id && e.name);
        const uniqueMap = new Map<string, EmployeeOption>();
        for (const e of options) {
          if (!uniqueMap.has(e.id)) uniqueMap.set(e.id, e);
        }
        setEmployeeOptions(
          Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        );
      } catch {
        if (!cancelled) {
          setEmployeeOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingEmployeeOptions(false);
      }
    };
    void loadMetaFormOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchComposicoesGeral().then(items => {
      if (cancelled) return;
      if (items.length > 0) {
        setComposicoes(items);
      } else {
        setComposicoes([]);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!centroCustoId) {
      setListaOrcamentos([]);
      setOrcamentoAtivoId(null);
      setServicos([]);
      setImports([]);
      return;
    }
    setOrcamentoAtivoId(null);
    setServicos([]);
    setImports([]);
    let cancelled = false;
    setCarregandoListaOrcamentos(true);
    fetchOrcamentosLista(centroCustoId)
      .then(data => {
        if (cancelled) return;
        setListaOrcamentos(data.orcamentos);
      })
      .catch(() => {
        if (!cancelled) toast.error('Não foi possível carregar a lista de orçamentos.');
      })
      .finally(() => {
        if (!cancelled) setCarregandoListaOrcamentos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [centroCustoId]);

  useEffect(() => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    let cancelled = false;
    setLoadingFromApi(true);
    setServicos([]);
    setImports([]);
    setSubtitulosNoOrcamento([]);
    setItensOcultosNoOrcamento([]);
    setLinhasSelecionadasDropdown(new Set());
    setQuantidadesPorItem({});
    setDimensoesPorItem({});
    setPlanilhaQuantidadeCompra({});
    setPlanilhaValorUnitCompraReal({});
    setPlanilhaCompraDraft({});
    setShowDetalhesFinanceiros(false);

    const aplicarSessao = (s: SessaoOrcamentoPersist | null) => {
      if (!s) return;
      setSubtitulosNoOrcamento(s.subtitulosNoOrcamento);
      setItensOcultosNoOrcamento(
        Array.isArray(s.itensOcultosNoOrcamento) ? s.itensOcultosNoOrcamento : []
      );
      setQuantidadesPorItem(s.quantidadesPorItem);
      setDimensoesPorItem(s.dimensoesPorItem);
      setPlanilhaQuantidadeCompra(s.planilhaQuantidadeCompra ?? {});
      setPlanilhaValorUnitCompraReal(s.planilhaValorUnitCompraReal ?? {});
      setPlanilhaCompraDraft({});
      setShowDetalhesFinanceiros(s.showDetalhesFinanceiros);
      setMeta(s.meta ? s.meta : sessaoVazia().meta!);
    };

    const oid = orcamentoAtivoId;
    fetchOrcamentoDetail(centroCustoId, oid).then(async (apiData) => {
      if (cancelled) return;
      if (apiData) {
        const servicosDoOrcamento = Array.isArray(apiData.servicos) ? apiData.servicos : [];
        const importsDoOrcamento = Array.isArray(apiData.imports) ? apiData.imports : [];

        if (servicosDoOrcamento.length > 0) {
          setServicos(servicosDoOrcamento);
          saveServicos(centroCustoId, servicosDoOrcamento);
          setServicosExpandidos(new Set([servicosDoOrcamento[0].id]));
        } else {
          const local = loadServicos(centroCustoId);
          if (local.length > 0) {
            setServicos(local);
            setServicosExpandidos(new Set([local[0].id]));
          } else {
            const padrao = await fetchServicosPadraoFromApi(centroCustoId);
            if (cancelled) return;
            if (padrao?.servicos?.length) {
              setServicos(padrao.servicos);
              saveServicos(centroCustoId, padrao.servicos);
              setServicosExpandidos(new Set([padrao.servicos[0].id]));
            } else {
              setServicos([]);
            }
          }
        }

        setImports(importsDoOrcamento);
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(importsDoOrcamento));
        aplicarSessao(apiData.sessaoOrcamento ?? loadSessaoOrcamento(centroCustoId, oid));
      } else {
        const svcs = loadServicos(centroCustoId);
        setServicos(svcs);
        setImports(loadImports(centroCustoId));
        if (svcs.length > 0) setServicosExpandidos(new Set([svcs[0].id]));
        aplicarSessao(loadSessaoOrcamento(centroCustoId, oid));
      }
      setLoadingFromApi(false);
    });
    return () => {
      cancelled = true;
      setLoadingFromApi(false);
    };
  }, [centroCustoId, orcamentoAtivoId]);

  useEffect(() => {
    sessaoRef.current = {
      subtitulosNoOrcamento,
      quantidadesPorItem,
      dimensoesPorItem,
      planilhaQuantidadeCompra,
      planilhaValorUnitCompraReal,
      showDetalhesFinanceiros,
      meta,
      itensOcultosNoOrcamento
    };
    servicosImportsRef.current = { servicos, imports };
    if (centroCustoId && orcamentoAtivoId) {
      try {
        localStorage.setItem(storageKey(centroCustoId, 'sessao', orcamentoAtivoId), JSON.stringify(sessaoRef.current));
      } catch {
        /* quota */
      }
    }
  }, [
    centroCustoId,
    orcamentoAtivoId,
    subtitulosNoOrcamento,
    quantidadesPorItem,
    dimensoesPorItem,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    showDetalhesFinanceiros,
    meta,
    itensOcultosNoOrcamento,
    servicos,
    imports
  ]);

  /** Salva montagem + planilha analítica no servidor após pausa na edição (sem alterar revisão/data de envio). */
  useEffect(() => {
    const ORCAMENTO_AUTOSAVE_MS = 900;
    if (!centroCustoId || !orcamentoAtivoId || loadingFromApi) return;

    if (orcamentoAutosaveTimerRef.current) clearTimeout(orcamentoAutosaveTimerRef.current);
    orcamentoAutosaveTimerRef.current = setTimeout(() => {
      orcamentoAutosaveTimerRef.current = null;
      const { servicos: s, imports: i } = servicosImportsRef.current;
      saveOrcamentoToApi(centroCustoId, orcamentoAtivoId, {
        servicos: s,
        imports: i,
        sessaoOrcamento: sessaoRef.current
      }).catch(err => console.warn('Erro ao salvar orçamento no servidor:', err));
    }, ORCAMENTO_AUTOSAVE_MS);

    return () => {
      if (orcamentoAutosaveTimerRef.current) {
        clearTimeout(orcamentoAutosaveTimerRef.current);
        orcamentoAutosaveTimerRef.current = null;
      }
    };
  }, [
    centroCustoId,
    orcamentoAtivoId,
    loadingFromApi,
    subtitulosNoOrcamento,
    quantidadesPorItem,
    dimensoesPorItem,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    showDetalhesFinanceiros,
    meta,
    itensOcultosNoOrcamento,
    servicos,
    imports
  ]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (servicosDropdownRef.current && !servicosDropdownRef.current.contains(e.target as Node)) {
        setShowServicosDropdown(false);
      }
      if (contratoDropdownRef.current && !contratoDropdownRef.current.contains(e.target as Node)) {
        setShowContratoDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (!showContratoDropdown) return;
    setContratoSearch('');
    const t = window.setTimeout(() => {
      contratoSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [showContratoDropdown]);

  const refreshListaOrcamentos = async () => {
    if (!centroCustoId) return;
    try {
      const d = await fetchOrcamentosLista(centroCustoId);
      setListaOrcamentos(d.orcamentos);
    } catch {
      /* ignora */
    }
  };

  const persistToApi = (
    s: ServicoPadrao[],
    i: ImportRecord[],
    sessaoOverride?: SessaoOrcamentoPersist | null
  ) => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    const sessao = sessaoOverride !== undefined ? sessaoOverride : sessaoRef.current;
    saveOrcamentoToApi(centroCustoId, orcamentoAtivoId, {
      servicos: s,
      imports: i,
      sessaoOrcamento: sessao
    }).catch(err => console.warn('Erro ao salvar orçamento no servidor:', err));
  };

  /** Remove um registro do histórico de importações (lista de documentos do contrato). */
  const removerImportDoHistorico = (importId: string) => {
    if (!centroCustoId) return;
    if (!confirm('Remover este documento da lista de importações?')) return;
    const next = imports.filter(i => i.id !== importId);
    setImports(next);
    try {
      localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(next));
    } catch {
      /* quota */
    }
    if (orcamentoAtivoId) {
      persistToApi(servicos, next);
    } else {
      void saveServicosPadraoToApi(centroCustoId, { servicos, imports: next }).catch(() => {
        toast.error('Não foi possível salvar no servidor.');
      });
    }
    toast.success('Documento removido da lista.');
  };

  const voltarParaListaOrcamentos = () => {
    setOrcamentoAtivoId(null);
    setOrcamentoViewTab('montagem');
    setNomeOrcamentoRascunho('');
    refreshListaOrcamentos();
  };

  const criarNovoOrcamento = async () => {
    if (!centroCustoId) return;
    setNovoOrcamentoMetaDraft({
      ...sessaoVazia().meta!,
      dataAbertura: todayInputDate()
    });
    setNovoOrcamentoMetaOpen(true);
  };

  const confirmarCriacaoNovoOrcamento = async () => {
    if (!centroCustoId) return;
    const d = {
      ...novoOrcamentoMetaDraft,
      osNumeroPasta: novoOrcamentoMetaDraft.osNumeroPasta.trim(),
      responsavelOrcamento: novoOrcamentoMetaDraft.responsavelOrcamento.trim(),
      descricao: novoOrcamentoMetaDraft.descricao.trim(),
      orcamentoRealizadoPor: currentUserName || novoOrcamentoMetaDraft.orcamentoRealizadoPor.trim(),
      prazoExecucaoDias: novoOrcamentoMetaDraft.prazoExecucaoDias.trim(),
      dataAbertura: novoOrcamentoMetaDraft.dataAbertura || todayInputDate(),
      dataEnvio: ''
    };
    if (!d.osNumeroPasta || !d.descricao) {
      toast.error('Preencha OS/Nº da pasta e descrição.');
      return;
    }
    try {
      const entry = await criarOrcamentoApi(centroCustoId);
      setListaOrcamentos(prev => [entry, ...prev.filter(o => o.id !== entry.id)]);
      setNomeOrcamentoRascunho(entry.nome);
      setOrcamentoAtivoId(entry.id);
      setActiveTab('orcamento');
      setMeta({ ...d, revisaoCount: 0 });
      // salva imediatamente os metadados (a revisão continua "Sem revisão" até o primeiro salvar)
      await saveOrcamentoToApi(centroCustoId, entry.id, {
        servicos: [],
        imports: [],
        sessaoOrcamento: {
          ...sessaoVazia(),
          meta: { ...d, revisaoCount: 0 }
        }
      });
      setNovoOrcamentoMetaOpen(false);
      toast.success('Novo orçamento criado. Preencha os serviços e clique em salvar para gerar a revisão R01.');
    } catch {
      toast.error('Não foi possível criar o orçamento.');
    }
  };

  const abrirOrcamentoDaLista = (id: string) => {
    const meta = listaOrcamentos.find(o => o.id === id);
    setOrcamentoViewTab('montagem');
    setNomeOrcamentoRascunho(meta?.nome ?? '');
    setOrcamentoAtivoId(id);
    setActiveTab('orcamento');
  };

  const excluirOrcamentoDaLista = async (id: string, nome: string) => {
    if (!centroCustoId) return;
    if (!confirm(`Excluir o orçamento "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirOrcamentoApi(centroCustoId, id);
      localStorage.removeItem(storageKey(centroCustoId, 'sessao', id));
      setListaOrcamentos(prev => prev.filter(o => o.id !== id));
      if (orcamentoAtivoId === id) {
        setOrcamentoAtivoId(null);
        setNomeOrcamentoRascunho('');
        setServicos([]);
        setImports([]);
      }
      toast.success('Orçamento excluído.');
    } catch {
      toast.error('Não foi possível excluir o orçamento.');
    }
  };

  const salvarNomeOrcamento = async () => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    const n = nomeOrcamentoRascunho.trim();
    if (!n) {
      toast.error('Informe um nome.');
      return;
    }
    try {
      await renomearOrcamentoApi(centroCustoId, orcamentoAtivoId, n);
      setListaOrcamentos(prev =>
        prev.map(o => (o.id === orcamentoAtivoId ? { ...o, nome: n } : o))
      );
      toast.success('Nome atualizado.');
    } catch {
      toast.error('Não foi possível renomear.');
    }
  };

  const abrirEdicaoDados = () => {
    setEditarDadosDraft({
      ...meta,
      nomeOrcamento: nomeOrcamentoRascunho || ''
    });
    setEditarDadosOpen(true);
  };

  const salvarEdicaoDados = async () => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    const nome = editarDadosDraft.nomeOrcamento.trim();
    if (!nome) {
      toast.error('Informe o nome do orçamento.');
      return;
    }

    const nextMeta: OrcamentoMeta = {
      ...meta,
      ...editarDadosDraft,
      osNumeroPasta: editarDadosDraft.osNumeroPasta.trim(),
      prazoExecucaoDias: editarDadosDraft.prazoExecucaoDias.trim(),
      responsavelOrcamento: editarDadosDraft.responsavelOrcamento.trim(),
      descricao: editarDadosDraft.descricao.trim(),
      orcamentoRealizadoPor: editarDadosDraft.orcamentoRealizadoPor.trim()
    };

    try {
      if (nome !== nomeOrcamentoRascunho.trim()) {
        await renomearOrcamentoApi(centroCustoId, orcamentoAtivoId, nome);
        setNomeOrcamentoRascunho(nome);
        setListaOrcamentos(prev =>
          prev.map(o => (o.id === orcamentoAtivoId ? { ...o, nome } : o))
        );
      }

      setMeta(nextMeta);
      const nextSessao: SessaoOrcamentoPersist = {
        ...sessaoRef.current,
        meta: nextMeta
      };
      persistToApi(servicos, imports, nextSessao);
      setEditarDadosOpen(false);
      toast.success('Dados do orçamento atualizados.');
    } catch {
      toast.error('Não foi possível atualizar os dados.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleFileUploadComposicoes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      if (rows.length < 2) {
        toast.error('Planilha vazia ou sem dados');
        return;
      }
      // Detecta automaticamente a linha de cabeçalho (algumas planilhas trazem linhas acima do header).
      const detectarLinhaCabecalho = () => {
        const limite = Math.min(rows.length, 30);
        for (let r = 0; r < limite; r++) {
          const h = (rows[r] || []).map((x: any) => normalizarTextoBusca(String(x || '')));
          const hk = h.map((x: string) => normalizarCabecalhoColuna(x));
          const temCodigo = hk.some((c: string) => c.includes('codigo'));
          const temBanco = hk.some((c: string) => c === 'banco');
          const temDescricao = hk.some((c: string) => c.includes('descri'));
          const temMatMo = hk.some((c: string) =>
            c.includes('mat+mo') ||
            c === 'matmo' ||
            c === 'matm.o'
          );
          if ((temCodigo && temDescricao) || (temBanco && temDescricao) || (temCodigo && temMatMo)) {
            return r;
          }
        }
        return 0;
      };

      const headerRowIdx = detectarLinhaCabecalho();
      const header = (rows[headerRowIdx] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
      const headerKey = header.map(h => normalizarCabecalhoColuna(h));
      const chaveIdx = headerKey.findIndex(h => h === 'chave');
      const codigoIdx = headerKey.findIndex(h => h.includes('codigo'));
      const bancoIdx = headerKey.findIndex(h => h === 'banco');
      const descIdx = headerKey.findIndex(h => h === 'descricao' || h.includes('descri'));
      const tipoIdx = headerKey.findIndex(h => h === 'tipo');
      const undIdx = headerKey.findIndex(h => h === 'und' || h === 'un' || h.includes('unidade'));
      const quantIdx = headerKey.findIndex(h => h.includes('quant'));
      const valorUnitIdx = headerKey.findIndex(h => h.includes('valorunit') || h === 'valorunit' || h === 'valoruni');
      const totalIdx = headerKey.findIndex(h => h === 'total');
      const matMoIdx = headerKey.findIndex(h =>
        h === 'mat+mo' ||
        h === 'matm.o' ||
        h === 'matmo' ||
        h === 'mat+m.o' ||
        h.includes('mat+mo')
      );
      const maoIdx = headerKey.findIndex(h =>
        h === 'mo' ||
        h === 'mao' ||
        h === 'maodeobra' ||
        h.includes('maodeobra')
      );
      const materialIdx = headerKey.findIndex(h =>
        h === 'mat' ||
        h === 'material' ||
        (h.includes('material') && !h.includes('submaterial'))
      );
      const itemsMap = new Map<string, ComposicaoItem>();
      let composicaoAtualKey: string | null = null;
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const codigo = String(row[codigoIdx] ?? row[1] ?? '').trim();
        const banco = String(row[bancoIdx] ?? row[2] ?? '').trim();
        const chave = String(row[chaveIdx] ?? '').trim() || normalizarChave(codigo, banco);
        const descricao = String(row[descIdx] ?? row[4] ?? '').trim();
        const tipoRaw = normalizarTextoBusca(String(row[tipoIdx] ?? ''));
        const preco = matMoIdx >= 0 ? parsePreco(row[matMoIdx]) : parsePreco(row[6] ?? row[7]);
        // Valores fixos: vêm exclusivamente da planilha.
        const mao = maoIdx >= 0 ? parsePreco(row[maoIdx]) : 0;
        const material = materialIdx >= 0 ? parsePreco(row[materialIdx]) : 0;

        const ehComposicao = tipoRaw.includes('composicao') || (!tipoRaw && (codigo || banco) && !!descricao);
        const ehInsumo = tipoRaw.includes('insumo') || tipoRaw.includes('mao de obra') || tipoRaw.includes('material');

        if (ehComposicao && (codigo || banco || chave || descricao)) {
          const unidade = String(row[undIdx] ?? '').trim() || undefined;
          const comp: ComposicaoItem = {
            codigo,
            banco,
            chave,
            descricao,
            unidade,
            precoUnitario: preco,
            maoDeObraUnitario: mao,
            materialUnitario: material,
            analiticoLinhas: itemsMap.get(chave)?.analiticoLinhas || []
          };
          itemsMap.set(chave, comp);
          composicaoAtualKey = chave;
          continue;
        }

        if (ehInsumo) {
          const destinoKey = (chave && itemsMap.has(chave)) ? chave : composicaoAtualKey;
          if (!destinoKey) continue;
          const comp = itemsMap.get(destinoKey);
          if (!comp) continue;

          const categoria: CategoriaAnalitico = tipoRaw.includes('mao de obra') ? 'MÃO DE OBRA' : 'MATERIAL';
          const unidade = String(row[undIdx] ?? '').trim() || 'un';
          const quantidade = quantIdx >= 0 ? parsePreco(row[quantIdx]) : 0;
          const precoUnitario = valorUnitIdx >= 0 ? parsePreco(row[valorUnitIdx]) : 0;
          const totalInsumo = totalIdx >= 0 ? parsePreco(row[totalIdx]) : (quantidade * precoUnitario);

          if (descricao) {
            comp.analiticoLinhas = [
              ...(comp.analiticoLinhas || []),
              {
                categoria,
                descricao,
                unidade,
                quantidade,
                precoUnitario,
                total: totalInsumo
              }
            ];
            itemsMap.set(destinoKey, comp);
          }
        }
      }
      const items = Array.from(itemsMap.values());
      setComposicoes(items);
      await saveComposicoesGeralToApi(items);
      toast.success(`${items.length} composições importadas e salvas no S3.`);
    } catch (err) {
      toast.error('Erro ao processar o arquivo. Verifique o formato.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const apagarPlanilhaComposicoes = async () => {
    if (composicoes.length === 0) {
      toast('Não há composições carregadas para apagar.');
      return;
    }
    if (!confirm('Tem certeza que deseja apagar a planilha de composições carregada?')) return;
    try {
      setComposicoes([]);
      await saveComposicoesGeralToApi([]);
      toast.success('Planilha de composições apagada com sucesso.');
    } catch {
      toast.error('Erro ao apagar composições.');
    }
  };

  const composicoesFiltradas = useMemo(() => {
    if (!searchComposicao.trim()) return composicoes;
    const q = searchComposicao.toLowerCase();
    return composicoes.filter(
      c =>
        c.codigo.toLowerCase().includes(q) ||
        c.banco.toLowerCase().includes(q) ||
        c.chave.toLowerCase().includes(q) ||
        c.descricao.toLowerCase().includes(q)
    );
  }, [composicoes, searchComposicao]);

  const addServico = () => {
    if (!novoServicoNome.trim()) {
      toast.error('Informe o nome do serviço');
      return;
    }
    const novo: ServicoPadrao = {
      id: crypto.randomUUID(),
      nome: novoServicoNome.trim(),
      subtitulos: [{ id: crypto.randomUUID(), nome: 'Novo subtítulo', itens: [] }]
    };
    const updated = [...servicos, novo];
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setNovoServicoNome('');
    setShowAddServico(false);
    toast.success('Serviço criado. Importe o orçamento perfeito para preencher a estrutura.');
  };

  const removeServico = (id: string) => {
    const updated = servicos.filter(s => s.id !== id);
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    const prefix = id + '|';
    setSubtitulosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setLinhasSelecionadasDropdown(prev => new Set(Array.from(prev).filter(k => !k.startsWith(prefix))));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(prefix)) delete next[k]; });
      return next;
    });
  };

  const addItemToServico = (servicoId: string, subtituloId: string, item: ComposicaoItem) => {
    const svc = servicos.find(s => s.id === servicoId);
    const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
    if (!sub) return;
    const existe = sub.itens.some(i => i.chave === item.chave || (i.codigo === item.codigo && i.banco === item.banco));
    if (existe) {
      toast.error('Este item já está no subtítulo');
      return;
    }
    const novoItem: ItemServico = {
      chave: item.chave || normalizarChave(item.codigo, item.banco),
      codigo: item.codigo,
      banco: item.banco,
      descricao: item.descricao
    };
    let updated = servicos.map(s => {
      if (s.id !== servicoId) return s;
      return {
        ...s,
        subtitulos: s.subtitulos.map(sb =>
          sb.id === subtituloId ? { ...sb, itens: [...sb.itens, novoItem] } : sb
        )
      };
    });
    // Se for item de demolição/remoção, adiciona Carga de Entulho no mesmo subtítulo se ainda não existir
    if (ehItemDemolicaoOuRemocao(item.descricao)) {
      const cargaEntulho = composicoes.find(c => ehComposicaoCargaEntulho(c.descricao));
      if (cargaEntulho) {
        const subAtualizado = updated.find(s => s.id === servicoId)?.subtitulos.find(sb => sb.id === subtituloId);
        const cargaJaExiste = subAtualizado?.itens.some(i =>
          i.chave === cargaEntulho.chave || (i.codigo === cargaEntulho.codigo && i.banco === cargaEntulho.banco)
        );
        if (!cargaJaExiste) {
          const itemCarga: ItemServico = {
            chave: cargaEntulho.chave || normalizarChave(cargaEntulho.codigo, cargaEntulho.banco),
            codigo: cargaEntulho.codigo,
            banco: cargaEntulho.banco,
            descricao: cargaEntulho.descricao
          };
          updated = updated.map(s => {
            if (s.id !== servicoId) return s;
            return {
              ...s,
              subtitulos: s.subtitulos.map(sb =>
                sb.id === subtituloId ? { ...sb, itens: [...sb.itens, itemCarga] } : sb
              )
            };
          });
        }
      }
    }
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    toast.success('Item adicionado');
  };

  const handleImportOrcamentoPerfeito = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!centroCustoId) {
      toast.error('Selecione um contrato (centro de custo) antes de importar.');
      return;
    }
    setIsImportandoOrcamento(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      if (rows.length < 12) {
        toast.error('Planilha sem dados suficientes (cabeçalho esperado na linha 11)');
        return;
      }
      const HEADER_ROW = 10;
      const header = (rows[HEADER_ROW] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
      const itemIdx = header.findIndex(h => h === 'item');
      const codigoIdx = header.findIndex(h => h.includes('código') || h.includes('codigo'));
      const bancoIdx = header.findIndex(h => h === 'banco');
      const descIdx = header.findIndex(h => h.includes('descri') && !h.includes('serviço') && !h.includes('servico'));
      const matMoIdx = header.findIndex(h =>
        (h.includes('mat') && (h.includes('m.o') || h.includes('m. o') || h.includes('mo'))) ||
        h === 'mat + m.o' ||
        h === 'mat+m.o' ||
        h.includes('mat+mo')
      );
      const maoIdx = header.findIndex(h =>
        (h.includes('mao') && h.includes('obra') && !h.includes('sub mao')) ||
        h === 'm.o' ||
        h === 'mo'
      );
      const materialIdx = header.findIndex(h =>
        (h === 'material' || h === 'mat' || h.includes(' material')) &&
        !h.includes('sub material')
      );

      type ServicoImport = { nome: string; subtitulos: Map<string, ItemServico[]> };
      const servicosMap = new Map<string, ServicoImport>();

      let topicoAtual = '';
      let subdivisaoAtual = '';

      for (let i = HEADER_ROW + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const itemVal = String(row[itemIdx] ?? '').trim();
        const codigo = String(row[codigoIdx] ?? '').trim();
        const banco = String(row[bancoIdx] ?? '').trim();
        const descricao = String(row[descIdx] ?? '').trim();
        const chave = normalizarChave(codigo, banco);
        const precoUnitario = matMoIdx >= 0 ? parsePreco(row[matMoIdx]) : 0;
        const maoDeObraUnitario = maoIdx >= 0 ? parsePreco(row[maoIdx]) : 0;
        const materialUnitario = materialIdx >= 0 ? parsePreco(row[materialIdx]) : 0;

        const partes = itemVal ? String(itemVal).split('.').filter(Boolean) : [];
        const nivel = partes.length;

        if (descricao && !codigo && !banco) {
          if (nivel === 1) {
            topicoAtual = descricao;
            subdivisaoAtual = '';
          } else if (nivel === 2) {
            subdivisaoAtual = descricao;
          }
        }

        const ehItem = (codigo || banco) && descricao && nivel >= 2;
        if (ehItem && topicoAtual) {
          const nomeSubtitulo = subdivisaoAtual || topicoAtual;
          const item: ItemServico = { chave, codigo, banco, descricao, precoUnitario, maoDeObraUnitario, materialUnitario };
          let servico = servicosMap.get(topicoAtual);
          if (!servico) {
            servico = { nome: topicoAtual, subtitulos: new Map() };
            servicosMap.set(topicoAtual, servico);
          }
          let itensSub = servico.subtitulos.get(nomeSubtitulo) || [];
          const jaExiste = itensSub.some(x => x.chave === item.chave || (x.codigo === item.codigo && x.banco === item.banco));
          if (!jaExiste) {
            itensSub = [...itensSub, item];
            servico.subtitulos.set(nomeSubtitulo, itensSub);
          }
        }
      }

      const servicosImportados: ServicoPadrao[] = Array.from(servicosMap.entries())
        .filter(([, v]) => v.subtitulos.size > 0)
        .map(([nome, v]) => ({
          id: crypto.randomUUID(),
          nome,
          subtitulos: Array.from(v.subtitulos.entries())
            .filter(([, itens]) => itens.length > 0)
            .map(([nomSub, itens]) => ({
              id: crypto.randomUUID(),
              nome: nomSub,
              itens
            }))
        }));

      if (servicosImportados.length === 0) {
        toast.error('Nenhum serviço encontrado. Verifique se o cabeçalho está na linha 11 (ITEM, CÓDIGO, BANCO, DESCRIÇÃO).');
        return;
      }

      setServicos(servicosImportados);
      saveServicos(centroCustoId, servicosImportados);
      addImport(centroCustoId, {
        fileName: file.name,
        date: new Date().toISOString(),
        tipo: 'orçamento',
        servicosCount: servicosImportados.length
      });
      const importsAtualizados = loadImports(centroCustoId);
      setImports(importsAtualizados);
      if (orcamentoAtivoId) {
        persistToApi(servicosImportados, importsAtualizados);
      } else {
        await saveServicosPadraoToApi(centroCustoId, {
          servicos: servicosImportados,
          imports: importsAtualizados
        });
      }
      toast.success(
        `${servicosImportados.length} serviço(s) importados para o contrato e salvos. ` +
          (orcamentoAtivoId
            ? 'Use a lista para criar ou abrir um orçamento quando quiser.'
            : 'Você pode criar um orçamento na lista — os serviços já estarão disponíveis.')
      );
      setActiveTab('orcamento');
    } catch (err) {
      toast.error('Erro ao processar o arquivo. Verifique o formato.');
    } finally {
      setIsImportandoOrcamento(false);
      e.target.value = '';
    }
  };

  const removeItemFromServico = (servicoId: string, subtituloId: string, chave: string) => {
    const itemKey = `${servicoId}|${subtituloId}|${chave}`;
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    setItensOcultosNoOrcamento(prev => (prev.includes(itemKey) ? prev : [...prev, itemKey]));
    const baseOcultos = sessaoRef.current.itensOcultosNoOrcamento ?? [];
    const nextOcultos = baseOcultos.includes(itemKey) ? baseOcultos : [...baseOcultos, itemKey];
    if (centroCustoId && orcamentoAtivoId) {
      persistToApi(servicos, imports, { ...sessaoRef.current, itensOcultosNoOrcamento: nextOcultos });
    }
    toast.success('Item removido');
  };

  /** `itemKey` = `servicoId|subtituloId|chave` — remove a composição da lista do serviço (definitivo). */
  const removerItemComposicaoDoOrcamento = (itemKey: string) => {
    const parts = itemKey.split('|');
    if (parts.length < 3) {
      toast.error('Não foi possível identificar o item.');
      return;
    }
    const chave = parts[parts.length - 1]!;
    const subtituloId = parts[parts.length - 2]!;
    const servicoId = parts.slice(0, -2).join('|');
    removeItemFromServico(servicoId, subtituloId, chave);
  };


  const subtitulosAdicionados = useMemo(() => {
    return subtitulosNoOrcamento
      .map(key => {
        const [servicoId, subtituloId] = key.split('|');
        const svc = servicos.find(s => s.id === servicoId);
        const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
        return sub ? { key, servicoNome: svc!.nome, subtituloNome: sub.nome, itens: sub.itens } : null;
      })
      .filter(Boolean) as { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[];
  }, [subtitulosNoOrcamento, servicos]);

  const todosSubtitulos = useMemo(() => {
    const list: { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[] = [];
    servicos.forEach(s =>
      s.subtitulos.forEach(sub =>
        list.push({
          key: `${s.id}|${sub.id}`,
          servicoNome: s.nome,
          subtituloNome: sub.nome,
          itens: sub.itens
        })
      )
    );
    return list;
  }, [servicos]);

  const linhasDisponiveisDropdown = useMemo(() => {
    const keys = new Set<string>();
    const ocultosSet = new Set(itensOcultosNoOrcamento);
    for (const t of todosSubtitulos) {
      const blocoJa = subtitulosNoOrcamento.includes(t.key);
      if (!blocoJa) {
        if (t.itens.length === 0) {
          keys.add(buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS));
        } else {
          for (const i of t.itens) {
            keys.add(buildItemKeyOrcamento(t.key, i.chave));
          }
        }
      } else {
        for (const i of t.itens) {
          const ik = buildItemKeyOrcamento(t.key, i.chave);
          if (ocultosSet.has(ik)) keys.add(ik);
        }
      }
    }
    return keys;
  }, [todosSubtitulos, subtitulosNoOrcamento, itensOcultosNoOrcamento]);

  const toggleLinhaDropdown = (itemKey: string) => {
    setLinhasSelecionadasDropdown(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  /** Marca/desmarca todas as linhas ainda selecionáveis (novo bloco ou linhas ocultas de bloco já no orçamento). */
  const toggleSubtituloTodasLinhas = (t: { key: string; itens: ItemServico[] }) => {
    const blocoJa = subtitulosNoOrcamento.includes(t.key);
    const keys =
      t.itens.length === 0
        ? blocoJa
          ? []
          : [buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS)]
        : blocoJa
          ? t.itens
              .filter(i => itensOcultosNoOrcamento.includes(buildItemKeyOrcamento(t.key, i.chave)))
              .map(i => buildItemKeyOrcamento(t.key, i.chave))
          : t.itens.map(i => buildItemKeyOrcamento(t.key, i.chave));
    if (keys.length === 0) return;
    setLinhasSelecionadasDropdown(prev => {
      const next = new Set(prev);
      const allOn = keys.every(k => next.has(k));
      if (allOn) {
        keys.forEach(k => next.delete(k));
      } else {
        keys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const selecionarTodosSubtitulos = () => {
    setLinhasSelecionadasDropdown(new Set(Array.from(linhasDisponiveisDropdown)));
  };

  const desmarcarTodosSubtitulos = () => {
    setLinhasSelecionadasDropdown(new Set());
  };

  const addSubtitulosSelecionadosAoOrcamento = () => {
    const selected = Array.from(linhasSelecionadasDropdown);
    if (selected.length === 0) {
      toast.error('Selecione ao menos uma linha ou um serviço.');
      return;
    }
    const restaurarKeys = selected.filter(ik => {
      const p = parseItemKeyOrcamento(ik);
      if (!p) return false;
      return subtitulosNoOrcamento.includes(p.blocoKey) && itensOcultosNoOrcamento.includes(ik);
    });
    const porBlocoNovo = new Map<string, Set<string>>();
    for (const ik of selected) {
      const p = parseItemKeyOrcamento(ik);
      if (!p) continue;
      const { blocoKey, chave } = p;
      if (subtitulosNoOrcamento.includes(blocoKey)) continue;
      if (!porBlocoNovo.has(blocoKey)) porBlocoNovo.set(blocoKey, new Set());
      porBlocoNovo.get(blocoKey)!.add(chave);
    }
    const novosBlocos = Array.from(porBlocoNovo.keys()).filter(bk => !subtitulosNoOrcamento.includes(bk));
    if (restaurarKeys.length === 0 && novosBlocos.length === 0) {
      toast.error('Nada para aplicar. Selecione linhas disponíveis ou linhas removidas que possam voltar.');
      return;
    }
    setItensOcultosNoOrcamento(prev => {
      let next = prev.filter(k => !restaurarKeys.includes(k));
      for (const blocoKey of novosBlocos) {
        const chavesSel = porBlocoNovo.get(blocoKey);
        const sub = findSubtituloPorBlocoKey(servicos, blocoKey);
        next = next.filter(k => !k.startsWith(`${blocoKey}|`));
        if (!sub || sub.itens.length === 0) continue;
        if (chavesSel?.has(DROPDOWN_BLOCO_SEM_ITENS)) continue;
        for (const i of sub.itens) {
          const full = buildItemKeyOrcamento(blocoKey, i.chave);
          if (!chavesSel?.has(i.chave) && !next.includes(full)) next.push(full);
        }
      }
      return next;
    });
    if (novosBlocos.length > 0) {
      setSubtitulosNoOrcamento(prev => [...prev, ...novosBlocos]);
    }
    const nextOcultosPersist = (() => {
      let n = [...(sessaoRef.current.itensOcultosNoOrcamento ?? [])];
      n = n.filter(k => !restaurarKeys.includes(k));
      for (const blocoKey of novosBlocos) {
        const chavesSel = porBlocoNovo.get(blocoKey);
        const sub = findSubtituloPorBlocoKey(servicos, blocoKey);
        n = n.filter(k => !k.startsWith(`${blocoKey}|`));
        if (!sub || sub.itens.length === 0) continue;
        if (chavesSel?.has(DROPDOWN_BLOCO_SEM_ITENS)) continue;
        for (const i of sub.itens) {
          const full = buildItemKeyOrcamento(blocoKey, i.chave);
          if (!chavesSel?.has(i.chave) && !n.includes(full)) n.push(full);
        }
      }
      return n;
    })();
    if (centroCustoId && orcamentoAtivoId) {
      persistToApi(servicos, imports, { ...sessaoRef.current, itensOcultosNoOrcamento: nextOcultosPersist });
    }
    setLinhasSelecionadasDropdown(new Set());
    const msgs: string[] = [];
    if (restaurarKeys.length === 1) msgs.push('1 linha readicionada ao orçamento');
    else if (restaurarKeys.length > 1) msgs.push(`${restaurarKeys.length} linhas readicionadas ao orçamento`);
    if (novosBlocos.length === 1) msgs.push('1 serviço adicionado (linhas selecionadas)');
    else if (novosBlocos.length > 1) msgs.push(`${novosBlocos.length} serviços adicionados (linhas selecionadas)`);
    if (msgs.length > 0) toast.success(msgs.join('. ') + '.');
  };

  const removeSubtituloDoOrcamento = (key: string) => {
    setSubtitulosNoOrcamento(prev => prev.filter(k => k !== key));
    setItensOcultosNoOrcamento(prev => prev.filter(k => !k.startsWith(`${key}|`)));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(key + '|')) delete next[k]; });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(key + '|')) delete next[k]; });
      return next;
    });
  };

  const mapaComposicoes = useMemo(() => {
    const m: Record<string, ComposicaoItem> = {};
    composicoes.forEach(c => {
      const chaves = chavesParaBusca(c.codigo, c.banco, c.chave);
      chaves.forEach(k => {
        if (k) m[k] = c;
      });
    });
    return m;
  }, [composicoes]);

  const { itensCalculados, total } = useMemo(() => {
    const lista: {
      key: string;
      blocoKey: string;
      servicoNome: string;
      subtituloNome: string;
      item: ItemServico;
      precoUnitario: number;
      maoDeObraUnitario: number;
      materialUnitario: number;
      subMaoDeObra: number;
      subMaterial: number;
      subMatMaisMo: number;
      quantidade: number;
      total: number;
      dimensoes?: DimensoesItem;
      tipoUnidade: TipoUnidadeFormula;
      unidadeComposicao?: string;
    }[] = [];
    const ocultosSet = new Set(itensOcultosNoOrcamento);
    for (const bloco of subtitulosAdicionados) {
      for (const i of bloco.itens) {
        const itemKey = `${bloco.key}|${i.chave}`;
        if (ocultosSet.has(itemKey)) continue;
        const chaves = chavesParaBusca(i.codigo, i.banco, i.chave);
        let composicao: ComposicaoItem | null = null;
        for (const k of chaves) {
          const c = mapaComposicoes[k];
          if (c) {
            composicao = c;
            break;
          }
        }
        const preco = i.precoUnitario ?? composicao?.precoUnitario ?? 0;
        const maoDeObraUnitario = i.maoDeObraUnitario ?? composicao?.maoDeObraUnitario ?? 0;
        const materialUnitario = i.materialUnitario ?? composicao?.materialUnitario ?? 0;
        const dim = dimensoesPorItem[itemKey];
        const tipoAuto = inferirTipoUnidadePorDimensao(dim?.linhas);
        const tipoDaComp = parseUnidadeComposicao(composicao?.unidade);
        const tipoUnidade: TipoUnidadeFormula = (tipoDaComp && tipoDaComp !== 'un') ? tipoDaComp : tipoAuto;
        let qtd = 0;
        if (tipoUnidade === 'un') {
          qtd = Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        } else if (dim?.linhas?.length) {
          qtd = dim.linhas.reduce((s, ln) => s + calcularQuantidadeLinha(ln, tipoUnidade), 0);
        } else {
          qtd = Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        }
        const subMaoDeObra = maoDeObraUnitario * qtd;
        const subMaterial = materialUnitario * qtd;
        const subMatMaisMo = subMaoDeObra + subMaterial;
        const totalItem = subMatMaisMo;
        lista.push({
          key: itemKey,
          blocoKey: bloco.key,
          servicoNome: bloco.servicoNome,
          subtituloNome: bloco.subtituloNome,
          item: i,
          precoUnitario: preco,
          maoDeObraUnitario,
          materialUnitario,
          subMaoDeObra,
          subMaterial,
          subMatMaisMo,
          quantidade: qtd,
          total: totalItem,
          dimensoes: dim,
          tipoUnidade,
          unidadeComposicao: composicao?.unidade
        });
      }
    }
    // Regra: quantidade da caçamba 4m³ = quantidade da Carga Manual de Entulho / 4 (mesmo subtítulo).
    const cargaPorBloco = new Map<string, number>();
    for (const row of lista) {
      if (ehComposicaoCargaEntulho(row.item.descricao)) {
        cargaPorBloco.set(row.blocoKey, row.quantidade);
      }
    }

    const listaComCacamba = lista.map(row => {
      if (!ehComposicaoCacamba4m3(row.item.descricao)) return row;
      const qtdCarga = cargaPorBloco.get(row.blocoKey) ?? 0;
      const qtdCacamba = Math.ceil(qtdCarga / 4);
      const subMaoDeObra = row.maoDeObraUnitario * qtdCacamba;
      const subMaterial = row.materialUnitario * qtdCacamba;
      const subMatMaisMo = subMaoDeObra + subMaterial;
      return {
        ...row,
        quantidade: qtdCacamba,
        subMaoDeObra,
        subMaterial,
        subMatMaisMo,
        total: subMatMaisMo
      };
    });

    const soma = listaComCacamba.reduce((acc, x) => acc + x.total, 0);
    return { itensCalculados: listaComCacamba, total: soma };
  }, [subtitulosAdicionados, quantidadesPorItem, dimensoesPorItem, mapaComposicoes, itensOcultosNoOrcamento]);

  /** Itens com medição dimensional (não UN) — memória de cálculo e exportação. */
  const itensMemoriaMedicao = useMemo(
    () => itensCalculados.filter(r => r.tipoUnidade !== 'un'),
    [itensCalculados]
  );

  const linhasAnaliticoOrcamento = useMemo(() => {
    type Linha =
      | {
          kind: 'tituloServico';
          key: string;
          main: number;
          servicoNome: string;
        }
      | {
          kind: 'subtituloBloco';
          key: string;
          main: number;
          subIdx: number;
          texto: string;
        }
      | {
          kind: 'composicao';
          key: string;
          item: string;
          servicoNome: string;
          subtituloNome: string;
          codigo: string;
          banco: string;
          descricao: string;
          tipo: string;
          und: string;
          quant: number;
          quantidadeReal: number;
          quantidadeOrcada: number;
          valorUnit: number;
          total: number;
        }
      | {
          kind: 'insumo';
          key: string;
          parentKey: string;
          item: string;
          codigo: string;
          banco: string;
          tipo: string;
          categoria: string;
          descricao: string;
          und: string;
          quant: number;
          quantidadeReal: number;
          quantidadeOrcada: number;
          valorUnit: number;
          total: number;
        };

    const out: Linha[] = [];
    if (subtitulosAdicionados.length === 0) return out;

    const servicoNumero = new Map<string, number>();
    let nextMain = 0;
    for (const b of subtitulosAdicionados) {
      if (!servicoNumero.has(b.servicoNome)) {
        servicoNumero.set(b.servicoNome, ++nextMain);
      }
    }

    for (let blocoIndex = 0; blocoIndex < subtitulosAdicionados.length; blocoIndex++) {
      const bloco = subtitulosAdicionados[blocoIndex];
      const rowsDoBloco = itensCalculados.filter(
        r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome
      );
      const main = servicoNumero.get(bloco.servicoNome) ?? 0;
      const subIdx = subtitulosAdicionados
        .slice(0, blocoIndex + 1)
        .filter(b => b.servicoNome === bloco.servicoNome).length;

      const blocoAnterior = blocoIndex > 0 ? subtitulosAdicionados[blocoIndex - 1] : null;
      const primeiroSubtituloDesteServico =
        !blocoAnterior ||
        normalizarNomeServicoOrcamento(blocoAnterior.servicoNome) !==
          normalizarNomeServicoOrcamento(bloco.servicoNome);

      if (primeiroSubtituloDesteServico) {
        out.push({
          kind: 'tituloServico',
          key: `titulo|main-${main}`,
          main,
          servicoNome: bloco.servicoNome
        });
      }
      out.push({
        kind: 'subtituloBloco',
        key: `sub|${bloco.key}`,
        main,
        subIdx,
        /** Sempre exibir o rótulo do bloco; se serviço = subtítulo (ex.: Canteiro), ainda assim aparece na aba Orçamento. */
        texto: (bloco.subtituloNome && bloco.subtituloNome.trim()) || bloco.servicoNome
      });

      for (let compIdx = 0; compIdx < rowsDoBloco.length; compIdx++) {
        const row = rowsDoBloco[compIdx];
        const itemComp = `${main}.${subIdx}.${compIdx + 1}`;
        const chaves = chavesParaBusca(row.item.codigo, row.item.banco, row.item.chave);
        let comp: ComposicaoItem | null = null;
        for (const k of chaves) {
          const c = mapaComposicoes[k];
          if (c) {
            comp = c;
            break;
          }
        }
        const und = (row.unidadeComposicao || comp?.unidade || '').trim() || '—';
        const key = row.key;
        const valorUnit = row.quantidade > 0 ? row.total / row.quantidade : (row.precoUnitario ?? 0);
        out.push({
          kind: 'composicao',
          key,
          item: itemComp,
          servicoNome: row.servicoNome,
          subtituloNome: row.subtituloNome,
          codigo: row.item.codigo,
          banco: row.item.banco,
          descricao: row.item.descricao || '',
          tipo: 'Composição',
          und,
          quant: row.quantidade,
          quantidadeReal: row.quantidade,
          quantidadeOrcada: row.quantidade,
          valorUnit,
          total: row.total
        });

        const seedKey = `${row.item.codigo}|${row.item.banco}|${row.item.chave || ''}`;
        const unitAnalitico = comp?.analiticoLinhas?.length
          ? {
              total: comp.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0),
              linhas: comp.analiticoLinhas
            }
          : gerarAnaliticoComposicaoUnit(row.materialUnitario, row.maoDeObraUnitario, seedKey);

        for (let i = 0; i < unitAnalitico.linhas.length; i++) {
          const ln = unitAnalitico.linhas[i];
          const quantBase = ln.quantidade || 0;
          const qtd = quantBase * (row.quantidade || 0);
          const valorUnitInsumo = ln.precoUnitario || 0;
          const totalInsumo = qtd * valorUnitInsumo;
          out.push({
            kind: 'insumo',
            key: `${key}|insumo|${i}`,
            parentKey: key,
            item: `${itemComp}.${i + 1}`,
            codigo: '',
            banco: '',
            tipo: 'Insumo',
            categoria: ln.categoria,
            descricao: ln.descricao,
            und: ln.unidade,
            quant: quantBase,
            quantidadeReal: qtd,
            quantidadeOrcada: qtd,
            valorUnit: valorUnitInsumo,
            total: totalInsumo
          });
        }
      }
    }
    return out;
  }, [subtitulosAdicionados, itensCalculados, mapaComposicoes]);

  /** Ficha de demanda: só composições e insumos (sem faixas de título/subtítulo). */
  const linhasFichaDemanda = useMemo(() => {
    const insumosPorComposicao = new Map<
      string,
      Array<{ key: string; valorUnit: number; quantOrc: number }>
    >();
    for (const row of linhasAnaliticoOrcamento) {
      if (row.kind === 'insumo') {
        const arr = insumosPorComposicao.get(row.parentKey) ?? [];
        arr.push({ key: row.key, valorUnit: row.valorUnit, quantOrc: row.quant });
        insumosPorComposicao.set(row.parentKey, arr);
      }
    }

    /** Faturamento (R$) da composição = quant × valor unit. orç. — usado no % custo/valor pago dos insumos. */
    const faturamentoMonetarioPorComposicao = new Map<string, number>();
    for (const row of linhasAnaliticoOrcamento) {
      if (row.kind === 'composicao') {
        const q = Number(row.quant);
        const v = Number(row.valorUnit);
        if (Number.isFinite(q) && Number.isFinite(v)) {
          faturamentoMonetarioPorComposicao.set(row.key, q * v);
        }
      }
    }

    /** Σ (qtd compra × custo unit. orçamento) dos insumos — linha composição. */
    const valorTotalOrcamentoAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sum = 0;
      let temAlgum = false;
      for (const ins of filhos) {
        const qC = planilhaQuantidadeCompra[ins.key];
        if (qC !== undefined && Number.isFinite(qC)) {
          temAlgum = true;
          sum += qC * ins.valorUnit;
        }
      }
      return temAlgum ? sum : undefined;
    };

    /** Mesma coluna "Custo compra real" da planilha analítica: qtd compra × valor unit. compra real; composição = Σ insumos. */
    const precoCompraRealAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumCustoReal = 0;
      let sumQtdCompraComVlReal = 0;
      for (const ins of filhos) {
        const qC = planilhaQuantidadeCompra[ins.key];
        const vReal = planilhaValorUnitCompraReal[ins.key];
        if (qC !== undefined && Number.isFinite(qC) && vReal !== undefined && Number.isFinite(vReal)) {
          sumCustoReal += qC * vReal;
          sumQtdCompraComVlReal += qC;
        }
      }
      return sumQtdCompraComVlReal > 0 ? sumCustoReal : undefined;
    };

    /** Σ qtd compra / Σ qtd orçamento — % levantamento na composição. */
    const levantamentoPctAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumQC = 0;
      let sumQO = 0;
      for (const ins of filhos) {
        const qO = ins.quantOrc;
        if (!Number.isFinite(qO)) continue;
        sumQO += qO;
        const qC = planilhaQuantidadeCompra[ins.key];
        if (qC !== undefined && Number.isFinite(qC)) sumQC += qC;
      }
      return sumQO > 0 ? (sumQC / sumQO) * 100 : undefined;
    };

    /** Média ponderada (vl compra real / vl orçamento) — % preço unitário na composição. */
    const precoUnitarioPctAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumQcvR = 0;
      let sumQcvO = 0;
      for (const ins of filhos) {
        const qC = planilhaQuantidadeCompra[ins.key];
        const vR = planilhaValorUnitCompraReal[ins.key];
        if (
          qC !== undefined &&
          Number.isFinite(qC) &&
          vR !== undefined &&
          Number.isFinite(vR) &&
          Number.isFinite(ins.valorUnit) &&
          ins.valorUnit !== 0
        ) {
          sumQcvR += qC * vR;
          sumQcvO += qC * ins.valorUnit;
        }
      }
      return sumQcvO > 0 ? (sumQcvR / sumQcvO) * 100 : undefined;
    };

    const out: {
      kind: 'composicao' | 'insumo';
      key: string;
      item: string;
      codigo: string;
      banco: string;
      servico: string;
      un: string;
      /** Mesma coluna "Tipo" da planilha (MO/MAT); composição: vazio. */
      tipo: string;
      /** Mesma coluna "Quantidade" da planilha analítica (quant do analítico). */
      quantidadeOrcamento: number;
      /** Mesma chave que na planilha: `planilhaQuantidadeCompra[key]` (só insumos costumam ter valor). */
      quantidadeCompra: number | undefined;
      /** Coluna "Valor unit. orçamento" da planilha (`valorUnit`). */
      custoUnitarioOrcamento: number;
      /** Insumo: `planilhaValorUnitCompraReal[key]`; composição: sem valor na ficha (só insumos). */
      custoUnitarioCompraReal: number | undefined;
      /** qtd compra × custo unit. orçamento; na composição, soma dos insumos. */
      valorTotalOrcamento: number | undefined;
      /** valor total orçamento × 0,6 (composição = total agregado × 0,6). */
      precoCompraEstimado60: number | undefined;
      /** Igual planilha "Custo compra real": qtd compra × vl. unit. compra real; composição = Σ. */
      precoCompraReal: number | undefined;
      /** qtd compra / qtd orçamento × 100. */
      levantamentoPct: number | undefined;
      /** custo unit. compra real / custo unit. orçamento × 100. */
      precoUnitarioRelPct: number | undefined;
      /** preço compra real / valor total orçamento × 100. */
      faturamentoPct: number | undefined;
      /** preço compra real ÷ Faturamento (R$) × 100 — insumo: Faturamento da composição pai. */
      pctCustoValorPago: number | undefined;
    }[] = [];
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind !== 'composicao' && l.kind !== 'insumo') continue;
      const qCompra = planilhaQuantidadeCompra[l.key];
      const vReal =
        l.kind === 'insumo' ? planilhaValorUnitCompraReal[l.key] : undefined;
      const custoCompraReal =
        l.kind === 'composicao'
          ? undefined
          : vReal !== undefined && Number.isFinite(vReal)
            ? vReal
            : undefined;
      const valorTotalOrcamento =
        l.kind === 'composicao'
          ? valorTotalOrcamentoAgregado(l.key)
          : qCompra !== undefined && Number.isFinite(qCompra)
            ? qCompra * l.valorUnit
            : undefined;
      const precoCompraEstimado60 =
        valorTotalOrcamento !== undefined ? valorTotalOrcamento * 0.6 : undefined;
      const precoCompraReal =
        l.kind === 'composicao'
          ? precoCompraRealAgregado(l.key)
          : qCompra !== undefined &&
              vReal !== undefined &&
              Number.isFinite(qCompra) &&
              Number.isFinite(vReal)
            ? qCompra * vReal
            : undefined;
      const qOrcNum = Number(l.quant);
      const qCompraNum =
        qCompra !== undefined && Number.isFinite(Number(qCompra)) ? Number(qCompra) : undefined;
      const vOrcNum = Number(l.valorUnit);
      const levantamentoPct =
        l.kind === 'composicao'
          ? levantamentoPctAgregado(l.key)
          : qCompraNum !== undefined &&
              Number.isFinite(qOrcNum) &&
              qOrcNum !== 0
            ? (qCompraNum / qOrcNum) * 100
            : undefined;
      const precoUnitarioRelPct =
        l.kind === 'composicao'
          ? precoUnitarioPctAgregado(l.key)
          : custoCompraReal !== undefined &&
              Number.isFinite(custoCompraReal) &&
              Number.isFinite(vOrcNum) &&
              vOrcNum !== 0
            ? (custoCompraReal / vOrcNum) * 100
            : undefined;
      const faturamentoPct =
        precoCompraReal !== undefined &&
        valorTotalOrcamento !== undefined &&
        valorTotalOrcamento !== 0
          ? (precoCompraReal / valorTotalOrcamento) * 100
          : undefined;
      const valorFaturamentoMonetario =
        l.kind === 'composicao'
          ? Number.isFinite(qOrcNum) && Number.isFinite(vOrcNum)
            ? qOrcNum * vOrcNum
            : undefined
          : l.kind === 'insumo'
            ? faturamentoMonetarioPorComposicao.get(l.parentKey)
            : undefined;
      const pctCustoValorPago =
        precoCompraReal !== undefined &&
        valorFaturamentoMonetario !== undefined &&
        valorFaturamentoMonetario !== 0 &&
        Number.isFinite(precoCompraReal) &&
        Number.isFinite(valorFaturamentoMonetario)
          ? (precoCompraReal / valorFaturamentoMonetario) * 100
          : undefined;
      out.push({
        kind: l.kind,
        key: l.key,
        item: l.item,
        codigo: (l.codigo && String(l.codigo).trim()) || '—',
        banco: (l.banco && String(l.banco).trim()) || '—',
        servico: l.descricao,
        un: (l.und && String(l.und).trim()) || '—',
        tipo: l.kind === 'insumo' ? tipoPlanilhaInsumo(l.categoria || '') : '',
        quantidadeOrcamento: l.quant,
        quantidadeCompra: qCompra !== undefined && Number.isFinite(qCompra) ? qCompra : undefined,
        custoUnitarioOrcamento: l.valorUnit,
        custoUnitarioCompraReal: custoCompraReal,
        valorTotalOrcamento,
        precoCompraEstimado60,
        precoCompraReal,
        levantamentoPct,
        precoUnitarioRelPct,
        faturamentoPct,
        pctCustoValorPago
      });
    }
    return out;
  }, [linhasAnaliticoOrcamento, planilhaQuantidadeCompra, planilhaValorUnitCompraReal]);

  /** Insumos da planilha agrupados por composição (parentKey = key da linha composição). */
  const insumosPlanilhaPorComposicao = useMemo(() => {
    const m = new Map<string, Array<{ key: string; valorUnit: number }>>();
    for (const row of linhasAnaliticoOrcamento) {
      if (row.kind === 'insumo') {
        const arr = m.get(row.parentKey) ?? [];
        arr.push({ key: row.key, valorUnit: row.valorUnit });
        m.set(row.parentKey, arr);
      }
    }
    return m;
  }, [linhasAnaliticoOrcamento]);

  const resumoFinanceiro = useMemo(() => {
    const descontoPct = 25.01 / 100;
    const bdiPct = 28.35 / 100;
    const ipca1Pct = 3.93583 / 100;
    const ipca2Pct = 3.92595 / 100;
    const ipca3Pct = 5.31964 / 100;

    const totalBase = total;
    const valorDesconto = totalBase * descontoPct;
    const totalComDesconto = totalBase - valorDesconto;
    const totalComDescontoEBdi = totalComDesconto * (1 + bdiPct);
    const reajuste1 = totalComDescontoEBdi * (1 + ipca1Pct);
    const reajuste2 = reajuste1 * (1 + ipca2Pct);
    const reajuste3 = reajuste2 * (1 + ipca3Pct);

    return {
      descontoPct,
      bdiPct,
      ipca1Pct,
      ipca2Pct,
      ipca3Pct,
      totalBase,
      valorDesconto,
      totalComDesconto,
      totalComDescontoEBdi,
      reajuste1,
      reajuste2,
      reajuste3
    };
  }, [total]);

  /** Rodapé da Ficha de demanda: totais por MA/MO/LO e painel de faturamento vs orçamento. */
  const resumoRodapeFichaDemanda = useMemo(() => {
    let precoMa = 0;
    let precoMo = 0;
    let precoLo = 0;
    let temMa = false;
    let temMo = false;
    let temLo = false;

    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind !== 'insumo') continue;
      if (insumoExcluirCaixinhaRodape(l.descricao)) continue;
      const qC = planilhaQuantidadeCompra[l.key];
      const vReal = planilhaValorUnitCompraReal[l.key];
      if (qC === undefined || !Number.isFinite(qC) || vReal === undefined || !Number.isFinite(vReal)) continue;
      const val = qC * vReal;
      const g = grupoPrecoCompraInsumoRodape(l.categoria, l.descricao);
      if (g === 'MA') {
        precoMa += val;
        temMa = true;
      } else if (g === 'MO') {
        precoMo += val;
        temMo = true;
      } else {
        precoLo += val;
        temLo = true;
      }
    }

    let totalFaturado = 0;
    let sumEst = 0;
    let sumReal = 0;
    let temEst = false;
    let temReal = false;
    for (const r of linhasFichaDemanda) {
      if (r.kind !== 'composicao') continue;
      totalFaturado += r.quantidadeOrcamento * r.custoUnitarioOrcamento;
      if (r.precoCompraEstimado60 !== undefined && Number.isFinite(r.precoCompraEstimado60)) {
        sumEst += r.precoCompraEstimado60;
        temEst = true;
      }
      if (r.precoCompraReal !== undefined && Number.isFinite(r.precoCompraReal)) {
        sumReal += r.precoCompraReal;
        temReal = true;
      }
    }

    const valorFinalOrc = resumoFinanceiro.reajuste3;
    const relEst =
      valorFinalOrc > 0 && temEst ? (sumEst / valorFinalOrc) * 100 : null;
    const relReal =
      valorFinalOrc > 0 && temReal ? (sumReal / valorFinalOrc) * 100 : null;

    return {
      precoMa: temMa ? precoMa : null,
      precoMo: temMo ? precoMo : null,
      precoLo: temLo ? precoLo : null,
      totalFaturadoMatMoLoc: totalFaturado,
      precoCompraEstimadoTotal: temEst ? sumEst : null,
      precoCompraRealTotal: temReal ? sumReal : null,
      valorTotalOrcamentoFinal: valorFinalOrc,
      relacaoEstimadoOrcamentoPct: relEst,
      relacaoRealOrcamentoPct: relReal
    };
  }, [
    linhasAnaliticoOrcamento,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    linhasFichaDemanda,
    resumoFinanceiro.reajuste3
  ]);

  // Sincroniza linhas de itens de demolição/remoção para a composição Carga de Entulho
  useEffect(() => {
    const cargaRow = itensCalculados.find(r => ehComposicaoCargaEntulho(r.item.descricao));
    if (!cargaRow) return;
    const cargaKey = cargaRow.key;
    const linhasCargaAtuais = dimensoesPorItem[cargaKey]?.linhas ?? [];
    const linhasAgregadas: LinhaMedicao[] = [];
    for (const row of itensCalculados) {
      if (row.key === cargaKey) continue;
      if (!ehItemDemolicaoOuRemocao(row.item.descricao)) continue;
      const dim = dimensoesPorItem[row.key];
      if (dim?.linhas?.length) {
        for (let sourceIdx = 0; sourceIdx < dim.linhas.length; sourceIdx++) {
          const ln = dim.linhas[sourceIdx];
          const origemLinhaId = `${row.key}|${sourceIdx}`;
          const descricaoLinha = `${ln.descricao?.trim() || row.item.descricao || ''}`.trim().slice(0, 120);
          const linhaCargaExistente = linhasCargaAtuais.find(x => x.origemLinhaId === origemLinhaId)
            || linhasCargaAtuais.find(x => (x.descricao || '').trim() === descricaoLinha);
          linhasAgregadas.push({
            ...ln,
            origemLinhaId,
            origemComposicaoDescricao: row.item.descricao || '',
            descricao: descricaoLinha,
            // Mantém ajustes manuais feitos na Carga de Entulho.
            C: (ln.C || 0) === 0 ? (linhaCargaExistente?.C ?? ln.C) : ln.C,
            L: (ln.L || 0) === 0 ? (linhaCargaExistente?.L ?? ln.L) : ln.L,
            H: (ln.H || 0) === 0 ? (linhaCargaExistente?.H ?? ln.H) : ln.H,
            empolamento: linhaCargaExistente?.empolamento ?? ln.empolamento,
            // Campo que nasceu vazio na origem permanece editável na Carga.
            editavelC: (ln.C || 0) === 0,
            editavelL: (ln.L || 0) === 0,
            editavelH: (ln.H || 0) === 0
          });
        }
      }
    }
    const atualCarga = dimensoesPorItem[cargaKey];
    const atualLinhas = atualCarga?.linhas ?? [];
    if (linhasAgregadas.length === 0 && atualLinhas.length === 0) return;
    if (JSON.stringify(linhasAgregadas.map(l => ({ ...l }))) === JSON.stringify(atualLinhas.map(l => ({ ...l })))) return;
    setDimensoesPorItem(prev => ({
      ...prev,
      [cargaKey]: { tipoUnidade: 'm3' as const, linhas: linhasAgregadas }
    }));
  }, [itensCalculados, dimensoesPorItem]);

  const setQuantidadeItem = (itemKey: string, valor: number) => {
    setQuantidadesPorItem(prev => ({ ...prev, [itemKey]: Math.max(0, valor) }));
  };

  const setDimensoesItem = (itemKey: string, d: DimensoesItem | null) => {
    if (!d) {
      setDimensoesPorItem(prev => { const n = { ...prev }; delete n[itemKey]; return n; });
      return;
    }
    setDimensoesPorItem(prev => ({ ...prev, [itemKey]: d }));
  };

  const addLinhaMedicao = (itemKey: string) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] || { tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] };
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        linhas: [...atual.linhas, { descricao: '', C: 0, L: 0, H: 0, N: 1, empolamento: 1 }]
      }
    }));
  };

  const updateLinhaMedicao = (itemKey: string, idx: number, campo: keyof LinhaMedicao, valor: number | string) => {
    const atual = dimensoesPorItem[itemKey];
    if (!atual?.linhas?.[idx]) return;
    const novaLinhas = [...atual.linhas];
    const v = campo === 'descricao' ? valor : (typeof valor === 'number' ? valor : parseFloat(String(valor)) || 0);
    const updated: LinhaMedicao = { ...novaLinhas[idx], [campo]: v } as LinhaMedicao;
    if (campo === 'C' || campo === 'L' || campo === 'H' || campo === 'N') {
      updated.valorManual = undefined;
    }
    novaLinhas[idx] = updated;
    setDimensoesPorItem(prev => ({ ...prev, [itemKey]: { ...atual, linhas: novaLinhas } }));
  };

  const handleCalcBlur = (draftKey: string, raw: string, onCommit: (n: number) => void) => {
    const r = evalSimpleExpr(raw);
    const rawSemIgual = String(raw).trim().replace(/^=/, '').replace(/,/g, '.');
    onCommit(r !== null ? r : parseFloat(rawSemIgual) || 0);
    setDraftCalc(p => { const n = { ...p }; delete n[draftKey]; return n; });
  };

  const commitPlanilhaQtdCompra = (lineKey: string, raw: string) => {
    const n = parsePlanilhaPtBr(raw);
    setPlanilhaQuantidadeCompra(prev => {
      const next = { ...prev };
      if (n === null) delete next[lineKey];
      else next[lineKey] = Math.max(0, n);
      return next;
    });
    setPlanilhaCompraDraft(p => {
      const x = { ...p };
      delete x[`q|${lineKey}`];
      return x;
    });
  };

  const commitPlanilhaVlCompraReal = (lineKey: string, raw: string) => {
    const n = parsePlanilhaPtBr(raw);
    setPlanilhaValorUnitCompraReal(prev => {
      const next = { ...prev };
      if (n === null) delete next[lineKey];
      else next[lineKey] = Math.max(0, n);
      return next;
    });
    setPlanilhaCompraDraft(p => {
      const x = { ...p };
      delete x[`v|${lineKey}`];
      return x;
    });
  };

  const removeLinhaMedicao = (itemKey: string, idx: number) => {
    const atual = dimensoesPorItem[itemKey];
    if (!atual?.linhas?.length) return;
    const novaLinhas = atual.linhas.filter((_, i) => i !== idx);
    if (novaLinhas.length === 0) {
      setDimensoesPorItem(prev => { const n = { ...prev }; delete n[itemKey]; return n; });
    } else {
      setDimensoesPorItem(prev => ({ ...prev, [itemKey]: { ...atual, linhas: novaLinhas } }));
    }
  };

  const exportarMemoriaCalculo = () => {
    if (itensCalculados.length === 0) {
      toast.error('Não há itens no orçamento para exportar.');
      return;
    }
    const nomeContrato = costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name || costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code || centroCustoId || 'Contrato';
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['Gennesis Engenharia e Consultoria LTDA | CNPJ 17.851.596/0001-36 | gennesis.sedes@gmail.com | SHIS QI 15, Sobreloja 55, Lago Sul - Brasília/DF'],
      [''],
      ['PROJETO/SETOR:', nomeContrato, '', '', 'STATUS:', 'ORÇADO'],
      ['DESCRIÇÃO:', '', '', '', 'DS/Nº da Pasta:', ''],
      ['DATA DE ENVIO:', dataEmissao],
      [''],
      ['MEMÓRIA DE CÁLCULO DOS QUANTITATIVOS'],
      [''],
      [
        'LEGENDA: C= Comprimento | L= Largura | H= Altura | A= Área | V= Volume | % Empolamento= fator 1,10/1,20/1,30 | M= Metro | UN= quantidade nas colunas N e Subtotal'
      ],
      [''],
      ['DISCRIMINAÇÃO DOS SERVIÇOS'],
      ['CÓDIGO', 'DESCRIÇÃO', 'UN', 'C', 'L', 'H', '%', 'N', 'A', 'V', 'SUBTOTAL']
    ];

    const unidadeLabel = (t: TipoUnidadeFormula) => ({ m3: 'M³', m2: 'M²', m: 'M', un: 'UN' }[t] || 'UN');
    const totalMemoriaExport = itensCalculados.reduce((acc, r) => acc + r.total, 0);
    let idxServico = 0;
    const formulaCells: { cell: string; formula: string }[] = [];

    for (const row of itensCalculados) {
      const codigo = `${Math.floor(idxServico / 10) + 1}.${(idxServico % 10) + 1}`;
      const descricaoBase = `${row.item.codigo} ${row.item.banco} - ${row.item.descricao || ''}`;
      const tipoAuto = row.tipoUnidade ?? inferirTipoUnidadePorDimensao(row.dimensoes?.linhas);
      const un = row.unidadeComposicao?.trim() || unidadeLabel(tipoAuto);
      /** Itens em unidade (peça/UN): mesma ordem do orçamento; quantidade em N e Subtotal. */
      if (row.tipoUnidade === 'un') {
        rows.push([
          codigo,
          descricaoBase,
          un,
          '',
          '',
          '',
          '',
          row.quantidade,
          '',
          '',
          row.quantidade
        ]);
        idxServico++;
        continue;
      }

      if (row.dimensoes?.linhas?.length) {
        /** Linha só do nome da composição: medidas (C…Subtotal) em branco. */
        rows.push([codigo, descricaoBase, un, '', '', '', '', '', '', '', '']);
        for (let i = 0; i < row.dimensoes.linhas.length; i++) {
          const ln = row.dimensoes.linhas[i];
          const descLinha = ln.descricao?.trim() || `Medição ${i + 1}`;
          const empolRaw = ln.empolamento ?? ((ln as unknown as { percPerda?: number }).percPerda != null ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100 : 0);
          const empol = (empolRaw != null && empolRaw > 0) ? empolRaw : 1;
          rows.push([
            '',
            descLinha,
            un,
            ln.C ?? '',
            ln.L ?? '',
            ln.H ?? '',
            empol,
            ln.N ?? 1,
            '',
            '',
            ''
          ]);
          const r = rows.length;
          const col = (c: number) => String.fromCharCode(64 + c);
          const D = col(4); const E = col(5); const F = col(6); const G = col(7); const H = col(8); const I = col(9); const J = col(10); const K = col(11);
          const tipo = tipoAuto;
          if (tipo === 'm3') {
            formulaCells.push({ cell: `${I}${r}`, formula: `=${D}${r}*${E}${r}*${H}${r}` });
            formulaCells.push({ cell: `${J}${r}`, formula: `=${I}${r}*${F}${r}` });
            formulaCells.push({ cell: `${K}${r}`, formula: `=${J}${r}*${G}${r}` });
          } else if (tipo === 'm2') {
            formulaCells.push({ cell: `${I}${r}`, formula: `=${D}${r}*${E}${r}*${H}${r}` });
            formulaCells.push({ cell: `${J}${r}`, formula: `=${I}${r}` });
            formulaCells.push({ cell: `${K}${r}`, formula: `=${I}${r}*${G}${r}` });
          } else if (tipo === 'm') {
            formulaCells.push({ cell: `${I}${r}`, formula: '' });
            formulaCells.push({ cell: `${J}${r}`, formula: `=${D}${r}*${H}${r}` });
            formulaCells.push({ cell: `${K}${r}`, formula: `=${J}${r}*${G}${r}` });
          } else {
            const qtd = calcularQuantidadeLinha(ln, tipo);
            rows[rows.length - 1][8] = qtd; rows[rows.length - 1][9] = qtd; rows[rows.length - 1][10] = qtd;
          }
        }
      } else {
        rows.push([codigo, descricaoBase, un, '', '', '', '', '', row.quantidade, row.quantidade, row.quantidade]);
      }
      idxServico++;
    }

    rows.push(['']);
    rows.push(['', '', '', '', '', '', '', '', '', 'TOTAL GERAL', totalMemoriaExport]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    formulaCells.forEach(({ cell, formula }) => {
      if (formula) {
        if (!ws[cell]) ws[cell] = {};
        ws[cell].f = formula;
        ws[cell].t = 'n';
      }
    });
    ws['!cols'] = [
      { wch: 8 }, { wch: 50 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 6 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Memória de Cálculo');
    const nomeArquivo = `Memoria_Calculo_Quantitativos_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Memória de cálculo exportada com sucesso.');
  };

  const exportarOrcamentoDetalhado = () => {
    if (itensCalculados.length === 0) {
      toast.error('Não há itens no orçamento para exportar.');
      return;
    }

    const nomeContrato =
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name ||
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code ||
      centroCustoId ||
      'Contrato';

    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const numeracaoExport: { servicoNum: number; subNum: number }[] = [];
    let lastServicoNome = '';
    let servicoNumExport = 0;
    let subNumExport = 0;
    for (const b of subtitulosAdicionados) {
      if (b.servicoNome !== lastServicoNome) {
        servicoNumExport++;
        subNumExport = 0;
        lastServicoNome = b.servicoNome;
      }
      subNumExport++;
      numeracaoExport.push({ servicoNum: servicoNumExport, subNum: subNumExport });
    }

    const linhaVaziaOrcExport = () =>
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''] as (string | number)[];

    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['ORÇAMENTO DETALHADO'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'ITEM',
        'CÓDIGO',
        'BANCO',
        'CHAVE',
        'DESCRIÇÃO',
        'UNIDADE',
        'QUANTIDADE',
        'MÃO DE OBRA',
        'MATERIAL',
        'MAT + M.O',
        'SUB MÃO DE OBRA',
        'SUB MATERIAL',
        'SUB MAT + M.O',
        'PESO %'
      ]
    ];

    let prevServicoExport = '';
    subtitulosAdicionados.forEach((bloco, blocoIdx) => {
      const { servicoNum, subNum } = numeracaoExport[blocoIdx] ?? { servicoNum: blocoIdx + 1, subNum: 1 };
      const mesmoTituloSubtitulo =
        bloco.servicoNome.trim().toLowerCase() === bloco.subtituloNome.trim().toLowerCase();

      if (bloco.servicoNome !== prevServicoExport) {
        const linhaTitulo = linhaVaziaOrcExport();
        linhaTitulo[0] = servicoNum;
        linhaTitulo[4] = String(bloco.servicoNome || '').toUpperCase();
        rows.push(linhaTitulo);
        prevServicoExport = bloco.servicoNome;
      }

      if (!mesmoTituloSubtitulo) {
        const linhaSub = linhaVaziaOrcExport();
        linhaSub[0] = `${servicoNum}.${subNum}`;
        linhaSub[4] = String(bloco.subtituloNome || '').toUpperCase();
        rows.push(linhaSub);
      }

      const rowsDoBloco = itensCalculados.filter(
        r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome
      );

      rowsDoBloco.forEach((row, rowIdx) => {
        const itemN = mesmoTituloSubtitulo
          ? `${servicoNum}.${rowIdx + 1}`
          : `${servicoNum}.${subNum}.${rowIdx + 1}`;
        const chaveItem = row.item.chave || normalizarChave(row.item.codigo, row.item.banco);
        rows.push([
          itemN,
          row.item.codigo,
          row.item.banco,
          chaveItem,
          row.item.descricao || '',
          row.unidadeComposicao || '',
          roundTo(row.quantidade, 4),
          formatarBRLExport(row.maoDeObraUnitario),
          formatarBRLExport(row.materialUnitario),
          formatarBRLExport(row.precoUnitario),
          formatarBRLExport(row.subMaoDeObra),
          formatarBRLExport(row.subMaterial),
          formatarBRLExport(row.total),
          formatarPesoPctExport(total > 0 ? (row.total / total) * 100 : 0)
        ]);
      });
    });

    const rf = resumoFinanceiro;
    const pctLabel2 = (p: number) =>
      (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pctLabel5 = (p: number) =>
      (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

    const pushLinhaResumo = (rotulo: string, valor: number) => {
      const r = linhaVaziaOrcExport();
      r[11] = rotulo;
      r[12] = formatarBRLExport(valor);
      rows.push(r);
    };

    rows.push(linhaVaziaOrcExport());
    pushLinhaResumo('TOTAL', rf.totalBase);
    pushLinhaResumo(`DESCONTO (${pctLabel2(rf.descontoPct)}%)`, rf.valorDesconto);
    pushLinhaResumo('TOTAL COM DESCONTO', rf.totalComDesconto);
    pushLinhaResumo(`TOTAL GERAL COM DESCONTO E BDI (${pctLabel2(rf.bdiPct)}%)`, rf.totalComDescontoEBdi);
    pushLinhaResumo(`1º REAJUSTE IPCA (${pctLabel5(rf.ipca1Pct)}%)`, rf.reajuste1);
    pushLinhaResumo(`2º REAJUSTE IPCA (${pctLabel5(rf.ipca2Pct)}%)`, rf.reajuste2);
    pushLinhaResumo(`3º REAJUSTE IPCA (${pctLabel5(rf.ipca3Pct)}%)`, rf.reajuste3);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 48 },
      { wch: 9 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orçamento Detalhado');
    const nomeArquivo = `Orcamento_Detalhado_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Orçamento detalhado exportado com sucesso.');
  };

  const resolverAnaliticoComposicao = useCallback(
    (
      linha: any
    ): {
      info: { codigo: string; banco: string; descricao: string };
      data: AnaliticoComposicao;
      seedKeyParaCache: string | null;
    } | null => {
      const item: ItemServico = linha?.item;
      if (!item) return null;

      const composicaoDaLinha = (() => {
        const chaves = chavesParaBusca(item.codigo, item.banco, item.chave);
        for (const k of chaves) {
          const c = mapaComposicoes[k];
          if (c) return c;
        }
        return null;
      })();

      const info = {
        codigo: item.codigo,
        banco: item.banco,
        descricao: item.descricao || ''
      };

      if (composicaoDaLinha?.analiticoLinhas?.length) {
        const totalAnalitico = composicaoDaLinha.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0);
        return {
          info,
          data: {
            total: totalAnalitico,
            linhas: composicaoDaLinha.analiticoLinhas
          },
          seedKeyParaCache: null
        };
      }

      const materialUnitario = Number(linha?.materialUnitario ?? 0);
      const maoDeObraUnitario = Number(linha?.maoDeObraUnitario ?? 0);
      const seedKey = `${item.codigo}|${item.banco}|${item.chave || ''}`;
      const unitAnalitico = analiticoCache[seedKey] ?? gerarAnaliticoComposicaoUnit(materialUnitario, maoDeObraUnitario, seedKey);
      return {
        info,
        data: unitAnalitico,
        seedKeyParaCache: analiticoCache[seedKey] ? null : seedKey
      };
    },
    [mapaComposicoes, analiticoCache]
  );

  useEffect(() => {
    if (orcamentoViewTab !== 'memorial') return;
    if (itensMemoriaMedicao.length === 0) {
      setMemorialItemKey(null);
      return;
    }
    const existe = memorialItemKey && itensMemoriaMedicao.some(r => r.key === memorialItemKey);
    if (!existe) {
      setMemorialItemKey(itensMemoriaMedicao[0].key);
    }
  }, [orcamentoViewTab, itensMemoriaMedicao, memorialItemKey]);

  useEffect(() => {
    if (orcamentoViewTab !== 'memorial' || !memorialItemKey) return;
    const el = document.getElementById(`memorial-medicoes-${memorialItemKey}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [orcamentoViewTab, memorialItemKey]);

  const exportarAnalitico = () => {
    if (itensCalculados.length === 0) {
      toast.error('Não há itens no orçamento para gerar o analítico.');
      return;
    }

    const nomeContrato =
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name ||
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code ||
      centroCustoId ||
      'Contrato';

    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['Gennesis Engenharia e Consultoria LTDA | CNPJ 17.851.596/0001-36 | gennesis.sedes@gmail.com | SHIS QI 15, Sobreloja 55, Lago Sul - Brasília/DF'],
      [''],
      ['PROJETO/SETOR:', nomeContrato, '', '', 'STATUS:', 'ORÇADO'],
      ['DATA DE ENVIO:', dataEmissao],
      [''],
      ['ANALÍTICO DO ORÇAMENTO (COMPOSIÇÕES)'],
      [''],
      ['SERVIÇO', 'SUBTÍTULO', 'CÓDIGO', 'BANCO', 'DESCRIÇÃO', 'CATEGORIA', 'DESCRIÇÃO INSUMO', 'UN', 'QUANTIDADE', 'Preço Unit.', 'TOTAL (R$)']
    ];

    let totalGeral = 0;
    for (const linha of itensCalculados) {
      totalGeral += linha.total;
      const item = linha.item;
      const quantidadeItem = Number(linha.quantidade ?? 0);

      const materialUnitario = Number(linha.materialUnitario ?? 0);
      const maoDeObraUnitario = Number(linha.maoDeObraUnitario ?? 0);
      const seedKey = `${item.codigo}|${item.banco}|${item.chave || ''}`;
      const composicaoDaLinha = (() => {
        const chaves = chavesParaBusca(item.codigo, item.banco, item.chave);
        for (const k of chaves) {
          const c = mapaComposicoes[k];
          if (c) return c;
        }
        return null;
      })();

      const unitAnalitico = composicaoDaLinha?.analiticoLinhas?.length
        ? {
            total: composicaoDaLinha.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0),
            linhas: composicaoDaLinha.analiticoLinhas
          }
        : (analiticoCache[seedKey] ?? gerarAnaliticoComposicaoUnit(materialUnitario, maoDeObraUnitario, seedKey));

      for (const l of unitAnalitico.linhas) {
        rows.push([
          linha.servicoNome,
          linha.subtituloNome,
          item.codigo,
          item.banco,
          item.descricao || '',
          l.categoria,
          l.descricao,
          l.unidade,
          roundTo(l.quantidade * quantidadeItem, 4),
          l.precoUnitario,
          roundTo(l.total * quantidadeItem, 2)
        ]);
      }
    }

    rows.push(['TOTAL GERAL', '', '', '', '', '', '', '', '', '', roundTo(totalGeral, 2)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 26 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 44 },
      { wch: 16 }, { wch: 30 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analítico');
    const nomeArquivo = `Analitico_Composicoes_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Analítico exportado com sucesso.');
  };

  const nomeContratoExport = () =>
    costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name ||
    costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code ||
    centroCustoId ||
    'Contrato';

  /** Exporta a grade da aba Orçamento analítico (mesmas colunas da tela). */
  const exportarOrcamentoAnaliticoTabela = () => {
    if (linhasAnaliticoOrcamento.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['ORÇAMENTO ANALÍTICO'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'Item',
        'Tipo',
        'Código',
        'Banco',
        'Descrição',
        'Und',
        'Quant.',
        'Quantidade real',
        'Quantidade orçada',
        'Valor unit.',
        'Total'
      ]
    ];
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'tituloServico') {
        rows.push([l.main, '', '', '', l.servicoNome, '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'subtituloBloco') {
        rows.push([`${l.main}.${l.subIdx}`, '', '', '', l.texto, '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'composicao') {
        rows.push([
          l.item,
          l.tipo,
          l.codigo,
          l.banco,
          l.descricao,
          l.und,
          l.quant,
          l.quantidadeReal,
          l.quantidadeOrcada,
          l.valorUnit,
          l.total
        ]);
        continue;
      }
      rows.push([
        l.item,
        l.tipo,
        l.codigo || '—',
        l.banco || '—',
        l.descricao,
        l.und,
        l.quant,
        l.quantidadeReal,
        l.quantidadeOrcada,
        l.valorUnit,
        l.total
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 48 },
      { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analítico');
    const nomeArquivo = `Orcamento_Analitico_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Orçamento analítico exportado com sucesso.');
  };

  /** Planilha analítica (compras e custos) — alinhado à grade da aba. */
  const exportarPlanilhaAnalitica = () => {
    if (linhasAnaliticoOrcamento.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['PLANILHA ANALÍTICA'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'Item',
        'Código',
        'Banco',
        'Serviço',
        'UN',
        'Quantidade',
        'Valor unit. orçamento',
        'Total orçamento',
        'Quantidade compra',
        'Custo estimado',
        'Valor unit. compra real',
        'Custo compra real',
        'Tipo'
      ]
    ];
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'tituloServico') {
        rows.push([l.main, '', '', l.servicoNome, '', '', '', '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'subtituloBloco') {
        rows.push([`${l.main}.${l.subIdx}`, '', '', l.texto, '', '', '', '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'composicao') {
        const filhos = insumosPlanilhaPorComposicao.get(l.key) ?? [];
        let sumQtdCompra = 0;
        let sumCustoEst = 0;
        let sumCustoReal = 0;
        let sumQtdCompraComVlReal = 0;
        let temQtdCompra = false;
        let somaVlUnitCompraRealInsumos = 0;
        let temAlgumVlUnitCompraReal = false;
        for (const ins of filhos) {
          const qC = planilhaQuantidadeCompra[ins.key];
          const vReal = planilhaValorUnitCompraReal[ins.key];
          const vOrc = ins.valorUnit;
          if (vReal !== undefined && Number.isFinite(vReal)) {
            somaVlUnitCompraRealInsumos += vReal;
            temAlgumVlUnitCompraReal = true;
          }
          if (qC !== undefined && Number.isFinite(qC)) {
            temQtdCompra = true;
            sumQtdCompra += qC;
            sumCustoEst += qC * vOrc;
            if (vReal !== undefined && Number.isFinite(vReal)) {
              sumCustoReal += qC * vReal;
              sumQtdCompraComVlReal += qC;
            }
          }
        }
        const vlUnitCompraRealAgreg = temAlgumVlUnitCompraReal ? somaVlUnitCompraRealInsumos : null;
        rows.push([
          l.item,
          l.codigo,
          l.banco,
          l.descricao,
          l.und,
          l.quant,
          l.valorUnit,
          l.total,
          temQtdCompra ? sumQtdCompra : '',
          temQtdCompra ? roundTo(sumCustoEst, 2) : '',
          vlUnitCompraRealAgreg !== null ? roundTo(vlUnitCompraRealAgreg, 2) : '',
          sumQtdCompraComVlReal > 0 ? roundTo(sumCustoReal, 2) : '',
          ''
        ]);
        continue;
      }
      const qC = planilhaQuantidadeCompra[l.key];
      const vReal = planilhaValorUnitCompraReal[l.key];
      const vOrc = l.valorUnit;
      const custoEst = qC !== undefined && Number.isFinite(qC) ? qC * vOrc : null;
      const custoCompraR =
        qC !== undefined && vReal !== undefined && Number.isFinite(qC) && Number.isFinite(vReal)
          ? qC * vReal
          : null;
      rows.push([
        l.item,
        l.codigo || '—',
        l.banco || '—',
        l.descricao,
        l.und || '—',
        l.quant,
        l.valorUnit,
        l.total,
        qC !== undefined && Number.isFinite(qC) ? qC : '',
        custoEst !== null ? roundTo(custoEst, 2) : '',
        vReal !== undefined && Number.isFinite(vReal) ? roundTo(vReal, 2) : '',
        custoCompraR !== null ? roundTo(custoCompraR, 2) : '',
        tipoPlanilhaInsumo(l.categoria || '')
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 44 }, { wch: 6 },
      { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 6 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha analítica');
    const nomeArquivo = `Planilha_Analitica_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Planilha analítica exportada com sucesso.');
  };

  const exportarFichaDemandaExcel = () => {
    if (linhasFichaDemanda.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['FICHA DE DEMANDA'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'Item',
        'Código',
        'Banco',
        'Serviço',
        'UN',
        'Levantamento',
        'Preço unitário',
        'Faturamento',
        'Quantidade do orçamento',
        'Quantidade compra',
        'Sobra',
        'Custo unitário orçamento',
        'Custo unitário de compra real',
        'Valor total orçamento',
        'Preço compra estimado (60%)',
        'Preço de compra real',
        '% Custo / valor pago',
        'Tipo'
      ]
    ];
    for (const r of linhasFichaDemanda) {
      const ehComp = r.kind === 'composicao';
      const qCompraOk =
        !ehComp && r.quantidadeCompra !== undefined && Number.isFinite(r.quantidadeCompra);
      const sobra =
        qCompraOk ? r.quantidadeOrcamento - r.quantidadeCompra! : null;
      rows.push([
        r.item,
        r.codigo,
        r.banco,
        r.servico,
        r.un,
        ehComp
          ? r.quantidadeOrcamento
          : r.levantamentoPct !== undefined && Number.isFinite(r.levantamentoPct)
            ? `${r.levantamentoPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
            : '',
        ehComp
          ? r.custoUnitarioOrcamento
          : r.precoUnitarioRelPct !== undefined && Number.isFinite(r.precoUnitarioRelPct)
            ? `${r.precoUnitarioRelPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
            : '',
        ehComp
          ? Number.isFinite(r.quantidadeOrcamento) && Number.isFinite(r.custoUnitarioOrcamento)
            ? r.quantidadeOrcamento * r.custoUnitarioOrcamento
            : ''
          : r.faturamentoPct !== undefined && Number.isFinite(r.faturamentoPct)
            ? `${r.faturamentoPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
            : '',
        ehComp ? '' : r.quantidadeOrcamento,
        ehComp ? '' : r.quantidadeCompra ?? '',
        ehComp ? '' : sobra !== null ? roundTo(sobra, 4) : '',
        ehComp ? '' : r.custoUnitarioOrcamento,
        ehComp ? '' : r.custoUnitarioCompraReal ?? '',
        r.valorTotalOrcamento ?? '',
        r.precoCompraEstimado60 ?? '',
        r.precoCompraReal ?? '',
        r.pctCustoValorPago !== undefined && Number.isFinite(r.pctCustoValorPago)
          ? `${r.pctCustoValorPago.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
          : '',
        r.tipo
      ]);
    }
    rows.push(['']);
    rows.push(['Resumo — Preço compra MA', resumoRodapeFichaDemanda.precoMa ?? '']);
    rows.push(['Resumo — Preço compra MO', resumoRodapeFichaDemanda.precoMo ?? '']);
    rows.push(['Resumo — Preço compra LO', resumoRodapeFichaDemanda.precoLo ?? '']);
    rows.push(['Relação preço estimado × orçamento (%)', resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct ?? '']);
    rows.push(['Relação preço real × orçamento (%)', resumoRodapeFichaDemanda.relacaoRealOrcamentoPct ?? '']);
    rows.push(['Total faturado (mat/MO/loc)', resumoRodapeFichaDemanda.totalFaturadoMatMoLoc]);
    rows.push(['Preço de compra estimado', resumoRodapeFichaDemanda.precoCompraEstimadoTotal ?? '']);
    rows.push(['Preço de compra real', resumoRodapeFichaDemanda.precoCompraRealTotal ?? '']);
    rows.push(['Valor total do orçamento', resumoRodapeFichaDemanda.valorTotalOrcamentoFinal]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array(18).fill({ wch: 14 });
    ws['!cols'][3] = { wch: 40 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ficha de demanda');
    const nomeArquivo = `Ficha_Demanda_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Ficha de demanda exportada (Excel).');
  };

  const exportarFichaDemandaPdf = () => {
    if (linhasFichaDemanda.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;
    const trunc = (s: string, n: number) => {
      const t = String(s ?? '');
      return t.length > n ? `${t.slice(0, n - 1)}…` : t;
    };
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Ficha de demanda', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`Contrato: ${trunc(nomeContrato, 100)}`, margin, y);
    y += 4;
    pdf.text(
      `Emitido em: ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      margin,
      y
    );
    y += 7;

    const headers = [
      'Item',
      'Cod.',
      'Banco',
      'Servico',
      'UN',
      'Lev.',
      'P.unit',
      'Fat.',
      'Q.orc',
      'Q.comp',
      'Sobra',
      'CU orc',
      'CU real',
      'V.tot',
      'Est.60%',
      'P.real',
      '%C/V',
      'Tipo'
    ];
    const colW = [11, 10, 10, 34, 7, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11, 9, 8];
    const sumW = colW.reduce((a, b) => a + b, 0);
    const scale = (pageW - 2 * margin) / sumW;
    const cw = colW.map(w => w * scale);
    const rowH = 4.2;
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica', 'bold');
    let x = margin;
    headers.forEach((h, i) => {
      pdf.text(trunc(h, 18), x + 0.5, y + 3);
      x += cw[i];
    });
    y += rowH;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y - 1, pageW - margin, y - 1);
    pdf.setFont('helvetica', 'normal');

    const fmtPct = (n: number | undefined) =>
      n !== undefined && Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
    const fmtN = (n: number | undefined) =>
      n !== undefined && Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '—';
    const fmtBRL = (n: number | undefined) =>
      n !== undefined && Number.isFinite(n)
        ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';

    const drawRow = (cells: string[]) => {
      if (y + rowH > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      x = margin;
      cells.forEach((cell, i) => {
        pdf.text(trunc(cell, 26), x + 0.5, y + 3);
        x += cw[i];
      });
      y += rowH;
    };

    for (const r of linhasFichaDemanda) {
      const ehComp = r.kind === 'composicao';
      const qCompraOk =
        !ehComp && r.quantidadeCompra !== undefined && Number.isFinite(r.quantidadeCompra);
      const sobra =
        qCompraOk ? r.quantidadeOrcamento - r.quantidadeCompra! : null;
      const levantStr = ehComp
        ? fmtN(r.quantidadeOrcamento)
        : r.levantamentoPct !== undefined && Number.isFinite(r.levantamentoPct)
          ? fmtPct(r.levantamentoPct)
          : '—';
      const pUnitStr = ehComp
        ? fmtBRL(r.custoUnitarioOrcamento)
        : r.precoUnitarioRelPct !== undefined && Number.isFinite(r.precoUnitarioRelPct)
          ? fmtPct(r.precoUnitarioRelPct)
          : '—';
      const fatStr = ehComp
        ? fmtBRL(
            Number.isFinite(r.quantidadeOrcamento) && Number.isFinite(r.custoUnitarioOrcamento)
              ? r.quantidadeOrcamento * r.custoUnitarioOrcamento
              : undefined
          )
        : r.faturamentoPct !== undefined && Number.isFinite(r.faturamentoPct)
          ? fmtPct(r.faturamentoPct)
          : '—';

      drawRow([
        trunc(r.item, 20),
        trunc(String(r.codigo), 12),
        trunc(String(r.banco), 12),
        trunc(r.servico, 40),
        trunc(r.un, 6),
        levantStr,
        pUnitStr,
        fatStr,
        ehComp ? '—' : fmtN(r.quantidadeOrcamento),
        ehComp ? '—' : fmtN(r.quantidadeCompra),
        ehComp ? '—' : sobra !== null ? fmtN(sobra) : '—',
        ehComp ? '—' : fmtBRL(r.custoUnitarioOrcamento),
        ehComp ? '—' : fmtBRL(r.custoUnitarioCompraReal),
        fmtBRL(r.valorTotalOrcamento),
        fmtBRL(r.precoCompraEstimado60),
        fmtBRL(r.precoCompraReal),
        r.pctCustoValorPago !== undefined && Number.isFinite(r.pctCustoValorPago)
          ? fmtPct(r.pctCustoValorPago)
          : '—',
        trunc(r.tipo || '—', 8)
      ]);
    }

    y += 4;
    if (y + 24 > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('Resumos', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const resumoLinhas = [
      ['Preço compra MA', resumoRodapeFichaDemanda.precoMa],
      ['Preço compra MO', resumoRodapeFichaDemanda.precoMo],
      ['Preço compra LO', resumoRodapeFichaDemanda.precoLo],
      ['Relação estimado × orçamento', resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct],
      ['Relação real × orçamento', resumoRodapeFichaDemanda.relacaoRealOrcamentoPct],
      ['Total faturado', resumoRodapeFichaDemanda.totalFaturadoMatMoLoc],
      ['Preço de compra estimado', resumoRodapeFichaDemanda.precoCompraEstimadoTotal],
      ['Preço de compra real', resumoRodapeFichaDemanda.precoCompraRealTotal],
      ['Valor total do orçamento', resumoRodapeFichaDemanda.valorTotalOrcamentoFinal]
    ];
    for (const [lab, val] of resumoLinhas) {
      const label = String(lab);
      let v: string;
      if (val === null || val === undefined) {
        v = '—';
      } else if (typeof val === 'number') {
        const br = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        v = label.includes('Relação') ? `${br}%` : `R$ ${br}`;
      } else {
        v = String(val);
      }
      pdf.text(`${label}: ${v}`, margin, y);
      y += 4;
    }

    const nomeArquivo = `Ficha_Demanda_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(nomeArquivo);
    toast.success('Ficha de demanda exportada (PDF).');
  };

  return (
    <ProtectedRoute route="/ponto/orcamento">
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Orçamento</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Automação de orçamentos com composições e serviços padrão por contrato
            </p>
          </div>

          {/* Seletor de Contrato (Centro de Custo) */}
          <Card>
            <CardContent className="py-5">
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
                <div className="xl:col-span-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    <Building2 className="w-4 h-4" />
                    Contrato (Centro de Custo)
                  </label>
                  <div ref={contratoDropdownRef} className="relative">
                    <button
                      type="button"
                      disabled={loadingCentros}
                      onClick={e => {
                        e.stopPropagation();
                        setShowContratoDropdown(v => !v);
                      }}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between gap-2 disabled:opacity-50 outline-none focus:ring-2 focus:ring-red-500/80 dark:focus:ring-red-500/70 focus:border-red-500 dark:focus:border-red-500"
                    >
                      <span className="truncate min-w-0">
                        {loadingCentros
                          ? 'Carregando...'
                          : (() => {
                              if (!centroCustoId) return 'Selecione o contrato';
                              const cc = costCenters?.find((c: { id?: string }) => c.id === centroCustoId);
                              if (!cc) return 'Selecione o contrato';
                              return `${cc.code || ''} — ${cc.name || cc.code || 'Sem nome'}`;
                            })()}
                      </span>
                      {showContratoDropdown ? (
                        <ChevronUp className="w-4 h-4 shrink-0 opacity-60" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                      )}
                    </button>
                    {showContratoDropdown && !loadingCentros && (
                      <div
                        className="absolute z-[100] mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-y-auto py-1"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 px-3 pt-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                          <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              ref={contratoSearchInputRef}
                              value={contratoSearch}
                              onChange={(e) => setContratoSearch(e.target.value)}
                              placeholder="Pesquisar contrato..."
                              className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-red-500/70 focus:border-red-500 dark:focus:border-red-500"
                            />
                          </div>
                        </div>
                        {contratoSearch.trim() === '' && (
                          <button
                            type="button"
                            className={`w-full px-4 py-2.5 text-left text-sm ${
                              !centroCustoId
                                ? 'bg-red-600 text-white'
                                : 'text-gray-900 dark:text-gray-100 hover:bg-red-600 hover:text-white'
                            }`}
                            onClick={() => {
                              setCentroCustoId(null);
                              setShowContratoDropdown(false);
                            }}
                          >
                            {!centroCustoId ? 'Selecione o contrato' : 'Limpar seleção'}
                          </button>
                        )}
                        {filteredCostCenters.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            Nenhum contrato encontrado.
                          </div>
                        ) : (
                          filteredCostCenters.map((cc: { id?: string; code?: string; name?: string }) => (
                            <button
                              key={cc.id}
                              type="button"
                              className={`w-full px-4 py-2.5 text-left text-sm ${
                                centroCustoId === cc.id
                                  ? 'bg-red-600 text-white'
                                  : 'text-gray-900 dark:text-gray-100 hover:bg-red-600 hover:text-white'
                              }`}
                              onClick={() => {
                                setCentroCustoId(cc.id || null);
                                setShowContratoDropdown(false);
                              }}
                            >
                              {cc.code || ''} — {cc.name || cc.code || 'Sem nome'}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {centroCustoId && orcamentoAtivoId && (
                  <div className="xl:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      <FileDown className="w-4 h-4 inline mr-1.5" />
                      {loadingFromApi ? 'Carregando do S3...' : `Documentos deste orçamento (${imports.length})`}
                    </p>
                    {imports.length > 0 ? (
                      <div className="mt-2 max-h-40 overflow-y-auto text-xs text-gray-500 dark:text-gray-400 space-y-1.5">
                        {imports.map(imp => (
                          <div
                            key={imp.id}
                            className="flex items-start gap-2 rounded-md border border-transparent hover:border-gray-200 dark:hover:border-gray-600 hover:bg-white/60 dark:hover:bg-gray-900/30 pr-1"
                          >
                            <div className="min-w-0 flex-1 min-h-[1.25rem] leading-snug">
                              <span className="block break-words">
                                {imp.fileName} — {imp.tipo} —{' '}
                                {imp.date ? new Date(imp.date).toLocaleString('pt-BR') : ''}
                                {imp.servicosCount != null && ` (${imp.servicosCount} serviços)`}
                                {imp.itensCount != null && ` (${imp.itensCount} itens)`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removerImportDoHistorico(imp.id)}
                              className="shrink-0 rounded p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Remover este documento da lista"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Nenhum documento recente neste orçamento.</p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
            {[
              { id: 'orcamento', label: 'Orçamentos', icon: Calculator },
              { id: 'composicoes', label: 'Composições', icon: FileSpreadsheet }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
                  activeTab === t.id
                    ? 'bg-red-600 text-white dark:bg-red-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Novo Orçamento */}
          {activeTab === 'orcamento' && (
            !centroCustoId ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
                  Selecione um contrato acima para criar orçamentos.
                </CardContent>
              </Card>
            ) : !orcamentoAtivoId ? (
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orçamentos deste contrato</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Crie vários cenários e abra um para continuar editando
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors disabled:opacity-50">
                        {isImportandoOrcamento ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        <span>{isImportandoOrcamento ? 'Importando...' : 'Importar orçamento perfeito'}</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleImportOrcamentoPerfeito}
                          disabled={isImportandoOrcamento || carregandoListaOrcamentos}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={criarNovoOrcamento}
                        disabled={carregandoListaOrcamentos}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none font-medium transition-colors"
                      >
                        {carregandoListaOrcamentos ? <Loader2 className="w-5 h-5 animate-spin" /> : <ListPlus className="w-5 h-5" />}
                        Novo orçamento
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {carregandoListaOrcamentos ? (
                    <div className="flex justify-center py-16 text-gray-500 dark:text-gray-400">
                      <Loader2 className="w-10 h-10 animate-spin" />
                    </div>
                  ) : listaOrcamentos.length === 0 ? (
                    <p className="text-center py-14 text-gray-500 dark:text-gray-400">
                      Nenhum orçamento ainda. Você pode <strong className="text-gray-700 dark:text-gray-300">importar o orçamento perfeito</strong> acima (vale para todo o contrato) ou criar um novo orçamento.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{filteredListaOrcamentos.length}</span>
                          {' '}de {listaOrcamentos.length} orçamento(s)
                        </div>
                        <div className="relative w-full sm:w-72">
                          <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={orcamentosSearch}
                            onChange={(e) => setOrcamentosSearch(e.target.value)}
                            placeholder="Buscar orçamento..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="hidden md:grid md:grid-cols-12 gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                        <div className="md:col-span-6 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Orçamento
                        </div>
                        <div className="md:col-span-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Atualizado
                        </div>
                        <div className="md:col-span-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-right">
                          Ações
                        </div>
                      </div>

                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredListaOrcamentos.map((o) => (
                          <div
                            key={o.id}
                            className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/30 transition-colors"
                          >
                            <div className="md:col-span-6 min-w-0">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                                <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {o.nome}
                                </p>
                              </div>
                            </div>

                            <div className="md:col-span-3 flex items-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 tabular-nums">
                              {o.updatedAt ? new Date(o.updatedAt).toLocaleString('pt-BR') : '—'}
                            </div>

                            <div className="md:col-span-3 flex items-center gap-2 md:justify-end">
                              <button
                                type="button"
                                onClick={() => abrirOrcamentoDaLista(o.id)}
                                className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 text-sm font-medium transition-colors"
                              >
                                Abrir
                              </button>
                              <button
                                type="button"
                                onClick={() => excluirOrcamentoDaLista(o.id, o.nome)}
                                className="px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                        {filteredListaOrcamentos.length === 0 && (
                          <div className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                            Nenhum orçamento encontrado para essa busca.
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
            <Card>
              <CardHeader>
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={voltarParaListaOrcamentos}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Voltar à lista
                  </button>
                  <div className="rounded-2xl border border-gray-200/80 dark:border-gray-700 bg-white/60 dark:bg-gray-900/10 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-200/80 dark:border-gray-700">
                      <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        Dados do orçamento
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={abrirEdicaoDados}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Editar dados
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Nome do orçamento</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100 break-words">{nomeOrcamentoRascunho || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">OS/Nº da pasta</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100 break-words">{meta.osNumeroPasta || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Data de abertura</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{meta.dataAbertura || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Data de envio</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{meta.dataEnvio || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Prazo de execução (dias)</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{meta.prazoExecucaoDias || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Responsável pelo orçamento</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100 break-words">{meta.responsavelOrcamento || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Orçamento realizado por</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100 break-words">{meta.orcamentoRealizadoPor || '—'}</div>
                      </div>
                      <div className="sm:col-span-2 xl:col-span-3">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Descrição</div>
                        <div className="mt-0.5 font-medium text-gray-900 dark:text-gray-100 break-words">{meta.descricao || '—'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="inline-flex flex-wrap items-center justify-center gap-1 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100/80 dark:bg-gray-800/70 max-w-full">
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('montagem')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                          orcamentoViewTab === 'montagem'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Orçamento
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('memorial')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                          orcamentoViewTab === 'memorial'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Memória de cálculo
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('analitico')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                          orcamentoViewTab === 'analitico'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Orçamento analítico
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('planilhaAnalitica')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                          orcamentoViewTab === 'planilhaAnalitica'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Planilha analítica
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('fichaDemanda')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                          orcamentoViewTab === 'fichaDemanda'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Ficha de demanda
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {orcamentoViewTab === 'analitico' && (
                  <div className="space-y-3">
                    {linhasAnaliticoOrcamento.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Orçamento analítico vazio"
                        texto="Monte serviços e itens na aba Orçamento para visualizar composições, insumos e quantidades com valores."
                        Icon={Table2}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                    <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                      <table className="min-w-full border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Item</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Tipo</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Código</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Banco</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Descrição</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Und</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quant.</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quantidade real</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quantidade orçada</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Valor unit</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                          {linhasAnaliticoOrcamento.map((l) => {
                            if (l.kind === 'tituloServico') {
                              return (
                                <tr key={l.key} className="bg-red-600 dark:bg-red-950/90">
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-sm font-bold tabular-nums text-white">
                                    {l.main}
                                  </td>
                                  <td
                                    colSpan={10}
                                    className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-left text-white align-middle"
                                  >
                                    {l.servicoNome}
                                  </td>
                                </tr>
                              );
                            }
                            if (l.kind === 'subtituloBloco') {
                              return (
                                <tr
                                  key={l.key}
                                  className="border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900"
                                >
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                    {`${l.main}.${l.subIdx}`}
                                  </td>
                                  <td colSpan={10} className="px-3 py-1.5 align-middle">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                      {l.texto}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                            if (l.kind === 'composicao') {
                              return (
                                <tr key={l.key} className="bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700">
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                                    {l.item}
                                  </td>
                                  <td className="px-3 py-2 text-center text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">{l.tipo}</td>
                                  <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo}</td>
                                  <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco}</td>
                                  <td className="px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700"><div className="truncate max-w-[min(520px,55vw)]">{l.descricao}</div></td>
                                  <td className="px-3 py-2 text-center text-sm font-medium text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">{l.und}</td>
                                  <td className="px-3 py-2 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quant.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                  <td className="px-3 py-2 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                  <td className="px-3 py-2 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeOrcada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                  <td className="px-3 py-2 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                    <MoedaCelula
                                      valor={l.valorUnit}
                                      className="font-medium text-gray-900 dark:text-gray-100"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                    <MoedaCelula
                                      valor={l.total}
                                      className="font-semibold text-gray-900 dark:text-gray-50"
                                      valorClassName="font-semibold"
                                    />
                                  </td>
                                </tr>
                              );
                            }
                            return (
                              <tr key={l.key} className="bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800">
                                <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                                  {l.item}
                                </td>
                                <td className="px-3 py-2 text-center text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">{l.tipo}</td>
                                <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo || '---'}</td>
                                <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco || '---'}</td>
                                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"><div className="truncate max-w-[min(520px,55vw)]">{l.descricao}</div></td>
                                <td className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">{l.und || '---'}</td>
                                <td className="px-3 py-2 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quant.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeOrcada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                  <MoedaCelula valor={l.valorUnit} className="text-gray-700 dark:text-gray-300" />
                                </td>
                                <td className="px-3 py-2 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                  <MoedaCelula valor={l.total} className="text-gray-900 dark:text-gray-100" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={exportarOrcamentoAnaliticoTabela}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                        title="Exporta a grade do orçamento analítico em Excel"
                      >
                        <FileSpreadsheet className="w-5 h-5 shrink-0" />
                        Exportar orçamento analítico (.xlsx)
                      </button>
                    </div>
                    </>
                    )}
                  </div>
                )}

                {orcamentoViewTab === 'planilhaAnalitica' && (
                  <div className="space-y-3">
                    {linhasAnaliticoOrcamento.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Planilha analítica vazia"
                        texto="Adicione itens na aba Orçamento para acompanhar custos estimados, compras e valores unitários."
                        Icon={FileSpreadsheet}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                        <>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                          <table className="min-w-full border-collapse">
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                                  Item
                                </th>
                                <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Código
                                </th>
                                <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Banco
                                </th>
                                <th className="min-w-[220px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                  Serviço
                                </th>
                                <th className="w-14 px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                  UN
                                </th>
                                <th className="w-[108px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Quantidade
                                </th>
                                <th className="w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Valor unit. orçamento
                                </th>
                                <th className="w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Total orçamento
                                </th>
                                <th className="w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Quantidade compra
                                </th>
                                <th className="w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Custo estimado
                                </th>
                                <th className="w-[130px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Valor unit. compra real
                                </th>
                                <th className="w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Custo compra real
                                </th>
                                <th className="w-14 px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                  Tipo
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                              {linhasAnaliticoOrcamento.map((l) => {
                                const itemW =
                                  'w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-sm tabular-nums';
                                if (l.kind === 'tituloServico') {
                                  return (
                                    <tr key={l.key} className="bg-red-600 dark:bg-red-950/90">
                                      <td className={`${itemW} font-bold text-white`}>
                                        {l.main}
                                      </td>
                                      <td
                                        colSpan={12}
                                        className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-left text-white align-middle"
                                      >
                                        {l.servicoNome}
                                      </td>
                                    </tr>
                                  );
                                }
                                if (l.kind === 'subtituloBloco') {
                                  return (
                                    <tr
                                      key={l.key}
                                      className="border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900"
                                    >
                                      <td className={`${itemW} text-xs font-semibold text-gray-800 dark:text-gray-200`}>
                                        {`${l.main}.${l.subIdx}`}
                                      </td>
                                      <td colSpan={12} className="px-3 py-1.5 align-middle">
                                        {l.texto ? (
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                            {l.texto}
                                          </span>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                }
                                if (l.kind === 'composicao') {
                                  const filhos = insumosPlanilhaPorComposicao.get(l.key) ?? [];
                                  let sumQtdCompra = 0;
                                  let sumCustoEst = 0;
                                  let sumCustoReal = 0;
                                  let sumQtdCompraComVlReal = 0;
                                  let temQtdCompra = false;
                                  /** Soma dos vl. unit. compra real dos insumos (col. "Valor unit. compra real" na linha da composição). */
                                  let somaVlUnitCompraRealInsumos = 0;
                                  let temAlgumVlUnitCompraReal = false;
                                  for (const ins of filhos) {
                                    const qC = planilhaQuantidadeCompra[ins.key];
                                    const vReal = planilhaValorUnitCompraReal[ins.key];
                                    const vOrc = ins.valorUnit;
                                    if (vReal !== undefined && Number.isFinite(vReal)) {
                                      somaVlUnitCompraRealInsumos += vReal;
                                      temAlgumVlUnitCompraReal = true;
                                    }
                                    if (qC !== undefined && Number.isFinite(qC)) {
                                      temQtdCompra = true;
                                      sumQtdCompra += qC;
                                      sumCustoEst += qC * vOrc;
                                      if (vReal !== undefined && Number.isFinite(vReal)) {
                                        sumCustoReal += qC * vReal;
                                        sumQtdCompraComVlReal += qC;
                                      }
                                    }
                                  }
                                  const vlUnitCompraRealAgreg =
                                    temAlgumVlUnitCompraReal ? somaVlUnitCompraRealInsumos : null;
                                  return (
                                    <tr
                                      key={l.key}
                                      className="bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700"
                                    >
                                      <td className={`${itemW} font-semibold text-gray-900 dark:text-gray-50`}>
                                        {l.item}
                                      </td>
                                      <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo}</td>
                                      <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco}</td>
                                      <td className="min-w-[220px] px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                        <div className="truncate max-w-[min(520px,55vw)]" title={l.descricao}>
                                          {l.descricao}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center text-sm font-medium text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">
                                        {l.und}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        {l.quant.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                      </td>
                                      <td className="px-3 py-2 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={l.valorUnit} />
                                      </td>
                                      <td className="px-3 py-2 text-sm tabular-nums text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={l.total} className="font-semibold" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700" />
                                      <td className="px-3 py-2 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">
                                        {temQtdCompra ? <MoedaCelula valor={sumCustoEst} /> : null}
                                      </td>
                                      <td className="px-3 py-2 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">
                                        {vlUnitCompraRealAgreg !== null ? <MoedaCelula valor={vlUnitCompraRealAgreg} /> : null}
                                      </td>
                                      <td className="px-3 py-2 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">
                                        {sumQtdCompraComVlReal > 0 ? <MoedaCelula valor={sumCustoReal} /> : null}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-center text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700" />
                                    </tr>
                                  );
                                }
                                const qC = planilhaQuantidadeCompra[l.key];
                                const vReal = planilhaValorUnitCompraReal[l.key];
                                const vOrc = l.valorUnit;
                                const custoEst = qC !== undefined && Number.isFinite(qC) ? qC * vOrc : null;
                                const custoCompraR =
                                  qC !== undefined &&
                                  vReal !== undefined &&
                                  Number.isFinite(qC) &&
                                  Number.isFinite(vReal)
                                    ? qC * vReal
                                    : null;
                                return (
                                  <tr key={l.key} className="bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800">
                                    <td className={`${itemW} text-gray-700 dark:text-gray-300`}>{l.item}</td>
                                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo || '—'}</td>
                                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco || '—'}</td>
                                    <td className="min-w-[220px] px-3 py-2 text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      <div className="truncate max-w-[min(520px,55vw)]" title={l.descricao}>
                                        {l.descricao}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">{l.und || '—'}</td>
                                    <td className="px-3 py-2 text-sm text-right tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      {l.quant.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="px-3 py-2 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      <MoedaCelula valor={l.valorUnit} />
                                    </td>
                                    <td className="px-3 py-2 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                      <MoedaCelula valor={l.total} />
                                    </td>
                                    <td className="px-2 py-2 border-l border-gray-200 dark:border-gray-700">
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0"
                                        className="w-full min-w-0 px-2 py-1 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm tabular-nums"
                                        value={
                                          planilhaCompraDraft[`q|${l.key}`] ??
                                          (qC !== undefined
                                            ? qC.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                            : '')
                                        }
                                        onChange={(e) =>
                                          setPlanilhaCompraDraft((p) => ({ ...p, [`q|${l.key}`]: e.target.value }))
                                        }
                                        onBlur={(e) => commitPlanilhaQtdCompra(l.key, e.target.value)}
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      {custoEst !== null ? <MoedaCelula valor={custoEst} /> : '—'}
                                    </td>
                                    <td className="px-2 py-2 align-middle border-l border-gray-200 dark:border-gray-700">
                                      <div className="flex w-full min-w-0 items-center justify-between gap-1">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 tabular-nums">
                                          R$
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          className="min-w-0 w-[6.5rem] max-w-full px-2 py-1 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm tabular-nums"
                                          value={
                                            planilhaCompraDraft[`v|${l.key}`] ??
                                            (vReal !== undefined
                                              ? vReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                              : '')
                                          }
                                          onChange={(e) =>
                                            setPlanilhaCompraDraft((p) => ({ ...p, [`v|${l.key}`]: e.target.value }))
                                          }
                                          onBlur={(e) => commitPlanilhaVlCompraReal(l.key, e.target.value)}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                      {custoCompraR !== null ? <MoedaCelula valor={custoCompraR} /> : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-sm text-center font-medium text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      {tipoPlanilhaInsumo(l.categoria)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={exportarPlanilhaAnalitica}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                            title="Exporta a planilha analítica (orçamento e compras) em Excel"
                          >
                            <FileSpreadsheet className="w-5 h-5 shrink-0" />
                            Exportar planilha analítica (.xlsx)
                          </button>
                        </div>
                        </>
                    )}
                  </div>
                )}

                {orcamentoViewTab === 'fichaDemanda' && (
                  <div className="space-y-3">
                    {linhasFichaDemanda.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Ficha de demanda vazia"
                        texto="Inclua composições e insumos no orçamento para gerar levantamentos, totais e indicadores da ficha."
                        Icon={ClipboardList}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                      <div className="space-y-6">
                      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                        <table className="min-w-full border-collapse">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                                Item
                              </th>
                              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Código
                              </th>
                              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Banco
                              </th>
                              <th className="min-w-[220px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                Serviço
                              </th>
                              <th className="w-16 px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                UN
                              </th>
                              <th className="w-[120px] min-w-[7rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                Levantamento
                              </th>
                              <th className="min-w-[11rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Preço unitário
                              </th>
                              <th className="w-[120px] min-w-[7rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                Faturamento
                              </th>
                              <th className="w-[132px] min-w-[8rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Quantidade do orçamento
                              </th>
                              <th className="w-[120px] min-w-[7.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Quantidade compra
                              </th>
                              <th className="w-[100px] min-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Sobra
                              </th>
                              <th className="min-w-[9.5rem] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Custo unitário orçamento
                              </th>
                              <th className="min-w-[10rem] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Custo unitário de compra real
                              </th>
                              <th className="min-w-[11rem] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Valor total orçamento
                              </th>
                              <th className="min-w-[12rem] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Preço compra estimado (60%)
                              </th>
                              <th className="min-w-[11rem] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Preço de compra real
                              </th>
                              <th className="min-w-[12rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                % Custo / valor pago
                              </th>
                              <th className="w-14 px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                Tipo
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                            {linhasFichaDemanda.map((r) => {
                              const ehComp = r.kind === 'composicao';
                              const qCompraOk =
                                !ehComp &&
                                r.quantidadeCompra !== undefined &&
                                Number.isFinite(r.quantidadeCompra);
                              const sobra =
                                qCompraOk
                                  ? r.quantidadeOrcamento - r.quantidadeCompra!
                                  : null;
                              const levantamentoCond =
                                !ehComp &&
                                r.levantamentoPct !== undefined &&
                                Number.isFinite(r.levantamentoPct)
                                  ? classeLevantamentoCondicional(r.levantamentoPct)
                                  : '';
                              return (
                              <tr
                                key={r.key}
                                className={
                                  ehComp
                                    ? 'bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700'
                                    : 'bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800/95'
                                }
                              >
                                <td
                                  className={`w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-sm tabular-nums ${
                                    ehComp
                                      ? 'font-semibold text-gray-900 dark:text-gray-50'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {r.item}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-semibold text-gray-900 dark:text-gray-50'
                                      : 'text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  {r.codigo}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  {r.banco}
                                </td>
                                <td
                                  className={`min-w-[220px] px-3 py-2 text-sm border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp ? 'font-semibold text-gray-900 dark:text-gray-50' : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  <div className="truncate max-w-[min(520px,55vw)]" title={r.servico}>
                                    {r.servico}
                                  </div>
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'
                                  }`}
                                >
                                  {r.un}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    levantamentoCond ||
                                    (ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300')
                                  }`}
                                >
                                  {ehComp
                                    ? Number.isFinite(r.quantidadeOrcamento)
                                      ? r.quantidadeOrcamento.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 4
                                        })
                                      : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )
                                    : r.levantamentoPct !== undefined &&
                                        Number.isFinite(r.levantamentoPct)
                                      ? `${r.levantamentoPct.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}%`
                                      : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )}
                                </td>
                                <td
                                  className={`px-3 py-2 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'text-right font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-center text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? (
                                        <MoedaCelula
                                          valor={r.custoUnitarioOrcamento}
                                          className="w-full text-sm font-medium text-gray-900 dark:text-gray-100"
                                          valorClassName="font-medium"
                                        />
                                      )
                                    : r.precoUnitarioRelPct !== undefined &&
                                        Number.isFinite(r.precoUnitarioRelPct)
                                      ? `${r.precoUnitarioRelPct.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}%`
                                      : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )}
                                </td>
                                <td
                                  className={`px-3 py-2 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'text-right font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-center text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? Number.isFinite(r.quantidadeOrcamento) &&
                                        Number.isFinite(r.custoUnitarioOrcamento)
                                      ? (
                                          <MoedaCelula
                                            valor={r.quantidadeOrcamento * r.custoUnitarioOrcamento}
                                            className="w-full text-sm font-medium text-gray-900 dark:text-gray-100"
                                            valorClassName="font-medium"
                                          />
                                        )
                                      : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )
                                    : r.faturamentoPct !== undefined &&
                                        Number.isFinite(r.faturamentoPct)
                                      ? `${r.faturamentoPct.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}%`
                                      : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp ? '' : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? null
                                    : r.quantidadeOrcamento.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 4
                                      })}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp ? '' : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? null
                                    : r.quantidadeCompra !== undefined
                                      ? r.quantidadeCompra.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 4
                                        })
                                      : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? ''
                                      : sobra !== null && sobra < 0
                                        ? 'font-semibold bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200'
                                        : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? null
                                    : sobra !== null
                                      ? sobra.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 4
                                        })
                                      : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? null
                                    : (
                                        <MoedaCelula
                                          valor={r.custoUnitarioOrcamento}
                                          className="w-full text-sm text-gray-700 dark:text-gray-300"
                                        />
                                      )}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp
                                    ? null
                                    : r.custoUnitarioCompraReal !== undefined
                                      ? (
                                          <MoedaCelula
                                            valor={r.custoUnitarioCompraReal}
                                            className="w-full text-sm text-gray-700 dark:text-gray-300"
                                          />
                                        )
                                      : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {r.valorTotalOrcamento !== undefined
                                    ? (
                                        <MoedaCelula
                                          valor={r.valorTotalOrcamento}
                                          className="w-full text-sm text-gray-700 dark:text-gray-300"
                                        />
                                      )
                                    : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {r.precoCompraEstimado60 !== undefined
                                    ? (
                                        <MoedaCelula
                                          valor={r.precoCompraEstimado60}
                                          className="w-full text-sm text-gray-700 dark:text-gray-300"
                                        />
                                      )
                                    : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {r.precoCompraReal !== undefined
                                    ? (
                                        <MoedaCelula
                                          valor={r.precoCompraReal}
                                          className="w-full text-sm text-gray-700 dark:text-gray-300"
                                        />
                                      )
                                    : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'font-medium text-gray-900 dark:text-gray-100'
                                      : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {r.pctCustoValorPago !== undefined &&
                                  Number.isFinite(r.pctCustoValorPago)
                                    ? `${r.pctCustoValorPago.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}%`
                                    : '—'}
                                </td>
                                <td
                                  className={`px-3 py-2 text-center text-sm border-l border-gray-200 dark:border-gray-700 ${
                                    ehComp
                                      ? 'text-gray-400 dark:text-gray-600'
                                      : 'font-medium text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {ehComp ? null : r.tipo}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-6 flex flex-col gap-4">
                        <div className="space-y-4">
                          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                              Preço de compra por grupo
                            </h4>
                            <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                              {(
                                [
                                  ['Preço compra MA', resumoRodapeFichaDemanda.precoMa],
                                  ['Preço compra MO', resumoRodapeFichaDemanda.precoMo],
                                  ['Preço compra LO', resumoRodapeFichaDemanda.precoLo]
                                ] as const
                              ).map(([label, val]) => (
                                <div
                                  key={label}
                                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0"
                                >
                                  <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                    {label}
                                  </dt>
                                  <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                    {val !== null && val !== undefined
                                      ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : '—'}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                              Relações com o orçamento
                            </h4>
                            <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0">
                                <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                  Relação de preço estimado × orçamento
                                </dt>
                                <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                  {resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct !== null
                                    ? `${resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}%`
                                    : '—'}
                                </dd>
                              </div>
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                                <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                  Relação de preço de compra real × orçamento
                                </dt>
                                <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                  {resumoRodapeFichaDemanda.relacaoRealOrcamentoPct !== null
                                    ? `${resumoRodapeFichaDemanda.relacaoRealOrcamentoPct.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}%`
                                    : '—'}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                          <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0">
                              <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                Total faturado (material / mão de obra / locação)
                              </dt>
                              <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                {`R$ ${resumoRodapeFichaDemanda.totalFaturadoMatMoLoc.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}`}
                              </dd>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                              <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                Preço de compra estimado
                              </dt>
                              <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                {resumoRodapeFichaDemanda.precoCompraEstimadoTotal !== null
                                  ? `R$ ${resumoRodapeFichaDemanda.precoCompraEstimadoTotal.toLocaleString('pt-BR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })}`
                                  : '—'}
                              </dd>
                            </div>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                              <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                Preço de compra real
                              </dt>
                              <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                {resumoRodapeFichaDemanda.precoCompraRealTotal !== null
                                  ? `R$ ${resumoRodapeFichaDemanda.precoCompraRealTotal.toLocaleString('pt-BR', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })}`
                                  : '—'}
                              </dd>
                            </div>
                          </dl>
                          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-300/80 dark:border-gray-600 pt-4">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                              Valor total do orçamento
                            </span>
                            <span className="shrink-0 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50 text-right">
                              {`R$ ${resumoRodapeFichaDemanda.valorTotalOrcamentoFinal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={exportarFichaDemandaExcel}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                          title="Exporta a ficha de demanda em Excel"
                        >
                          <FileSpreadsheet className="w-5 h-5 shrink-0" />
                          Exportar ficha de demanda (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={exportarFichaDemandaPdf}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                          title="Exporta a ficha de demanda em PDF"
                        >
                          <FileDown className="w-5 h-5 shrink-0" />
                          Exportar ficha de demanda (.pdf)
                        </button>
                      </div>
                      </div>
                    )}
                  </div>
                )}

                {orcamentoViewTab === 'memorial' && (
                  <div className="space-y-5">
                    {itensCalculados.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Memória de cálculo vazia"
                        texto="Adicione itens na aba Orçamento para editar medições por dimensão e exportar a memória em planilha."
                        Icon={Calculator}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : itensMemoriaMedicao.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200/90 dark:border-gray-700/80 bg-white/50 dark:bg-gray-900/40 px-5 py-8 text-center leading-relaxed shadow-sm">
                        Nenhum serviço com medição por dimensão neste orçamento. Ajuste quantidades e preços na aba{' '}
                        <span className="font-medium text-gray-900 dark:text-gray-100">Orçamento</span>.
                      </p>
                    ) : (
                      <div className="space-y-8">
                        {itensMemoriaMedicao.map(row => (
                          <section
                            key={row.key}
                            id={`memorial-medicoes-${row.key}`}
                            className="scroll-mt-6 rounded-2xl border border-gray-200/90 dark:border-gray-700/70 bg-slate-50 dark:bg-gray-900 p-5 sm:p-6 shadow-sm"
                          >
                            <div className="mb-4 pb-3 border-b border-gray-200/80 dark:border-gray-700/60">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                                Serviço
                              </p>
                              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 leading-snug">
                                <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                                  {row.item.codigo}
                                </span>{' '}
                                <span className="text-gray-500 dark:text-gray-400 font-normal">{row.item.banco}</span>
                                <span className="text-gray-400 dark:text-gray-500"> — </span>
                                <span className="font-normal">{row.item.descricao}</span>
                              </h2>
                            </div>
                            <div className="space-y-3 max-w-full">
                              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                Medições e quantitativos
                              </h3>
                              <OrcamentoMedicaoPainel
                                rowKey={row.key}
                                tipoUnidade={row.tipoUnidade}
                                itemCodigo={row.item.codigo}
                                itemBanco={row.item.banco}
                                itemDescricao={row.item.descricao || ''}
                                dim={
                                  dimensoesPorItem[row.key] ?? {
                                    tipoUnidade: row.tipoUnidade,
                                    linhas: []
                                  }
                                }
                                ehCargaEntulho={ehComposicaoCargaEntulho(row.item.descricao)}
                                draftCalc={draftCalc}
                                setDraftCalc={setDraftCalc}
                                handleCalcBlur={handleCalcBlur}
                                updateLinhaMedicao={updateLinhaMedicao}
                                addLinhaMedicao={addLinhaMedicao}
                                removeLinhaMedicao={removeLinhaMedicao}
                              />
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                    {itensCalculados.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={exportarMemoriaCalculo}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                        title="Exporta medições dimensionais e itens em unidade (UN), na ordem do orçamento"
                      >
                        <FileSpreadsheet className="w-5 h-5 shrink-0" />
                        Exportar memória de cálculo (.xlsx)
                      </button>
                    </div>
                    )}
                  </div>
                )}

                <div className={orcamentoViewTab === 'montagem' ? 'space-y-6' : 'hidden'}>
                <div className="flex gap-2 items-end flex-wrap">
                  <div
                    ref={servicosDropdownRef}
                    className={`relative flex-1 min-w-[200px] ${showServicosDropdown ? 'z-[200]' : ''}`}
                  >
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Adicionar serviços ao orçamento
                    </label>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowServicosDropdown(v => !v); }}
                      className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                    >
                      <ListPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                      <span className="block pr-6 truncate">
                        {linhasSelecionadasDropdown.size === 0
                          ? (todosSubtitulos.length === 0 ? 'Nenhum serviço disponível' : 'Selecione linhas ou serviços')
                          : linhasDisponiveisDropdown.size > 0 &&
                              Array.from(linhasDisponiveisDropdown).every(k => linhasSelecionadasDropdown.has(k))
                            ? 'Todas as linhas disponíveis selecionadas'
                            : `${linhasSelecionadasDropdown.size} linha(s) selecionada(s)`}
                      </span>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                        {showServicosDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>
                  {showServicosDropdown && (
                    <div className="absolute left-0 right-0 top-full z-[201] mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-2 sm:p-3 max-h-[min(28rem,75vh)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={servicosSearch}
                        onChange={(e) => setServicosSearch(e.target.value)}
                        className="mb-3 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/80 dark:focus:ring-red-400/80"
                      />
                      <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-600/80">
                        {(() => {
                          const allKeys = Array.from(linhasDisponiveisDropdown);
                          const allChecked =
                            allKeys.length > 0 && allKeys.every(k => linhasSelecionadasDropdown.has(k));
                          const someChecked = allKeys.some(k => linhasSelecionadasDropdown.has(k));
                          const partial = someChecked && !allChecked;
                          return (
                            <ServicosDropdownCheckbox
                              id="select-all-servicos"
                              checked={allChecked}
                              indeterminate={partial}
                              onChange={e => (e.target.checked ? selecionarTodosSubtitulos() : desmarcarTodosSubtitulos())}
                            >
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 pt-0.5">
                                Selecionar tudo
                              </span>
                            </ServicosDropdownCheckbox>
                          );
                        })()}
                      </div>
                      <div>
                        {todosSubtitulos.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                            Nenhum serviço disponível. Importe o orçamento perfeito no botão "Importar orçamento perfeito" acima.
                          </p>
                        ) : (
                          todosSubtitulos
                            .filter(t => {
                              const q = servicosSearch.trim().toLowerCase();
                              const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
                              if (!q) return true;
                              if (label.includes(q)) return true;
                              return t.itens.some(
                                i =>
                                  (i.codigo || '').toLowerCase().includes(q) ||
                                  (i.descricao || '').toLowerCase().includes(q)
                              );
                            })
                            .map(t => {
                              const blocoJaNoOrcamento = subtitulosNoOrcamento.includes(t.key);
                              const q = servicosSearch.trim().toLowerCase();
                              const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
                              const parentMatches = !q || label.includes(q);
                              const itensVisiveis =
                                !q || parentMatches
                                  ? t.itens
                                  : t.itens.filter(
                                      i =>
                                        (i.codigo || '').toLowerCase().includes(q) ||
                                        (i.descricao || '').toLowerCase().includes(q)
                                    );
                              const keysSelecionaveis =
                                t.itens.length === 0
                                  ? blocoJaNoOrcamento
                                    ? []
                                    : [buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS)]
                                  : blocoJaNoOrcamento
                                    ? t.itens
                                        .filter(i =>
                                          itensOcultosNoOrcamento.includes(
                                            buildItemKeyOrcamento(t.key, i.chave)
                                          )
                                        )
                                        .map(i => buildItemKeyOrcamento(t.key, i.chave))
                                    : t.itens.map(i => buildItemKeyOrcamento(t.key, i.chave));
                              const allOn =
                                keysSelecionaveis.length > 0 &&
                                keysSelecionaveis.every(k => linhasSelecionadasDropdown.has(k));
                              const someOn = keysSelecionaveis.some(k => linhasSelecionadasDropdown.has(k));
                              const partialPai = someOn && !allOn;
                              const paiDesabilitado = keysSelecionaveis.length === 0;
                              return (
                                <div
                                  key={t.key}
                                  className="border-b border-gray-200/90 dark:border-gray-600/80 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0"
                                >
                                  <ServicosDropdownCheckbox
                                    checked={allOn}
                                    indeterminate={Boolean(!paiDesabilitado && partialPai && !allOn)}
                                    disabled={paiDesabilitado}
                                    onChange={() => {
                                      if (!paiDesabilitado) toggleSubtituloTodasLinhas(t);
                                    }}
                                  >
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                                      {t.servicoNome} › {t.subtituloNome}
                                      {blocoJaNoOrcamento && (
                                        <span className="font-normal text-gray-500 dark:text-gray-400">
                                          {' '}
                                          (grupo no orçamento)
                                        </span>
                                      )}
                                    </span>
                                  </ServicosDropdownCheckbox>
                                  {t.itens.length > 0 && (
                                    <div className="mt-2 ml-2 pl-3 border-l-2 border-red-500/35 dark:border-red-400/30 space-y-1">
                                      {itensVisiveis.map(i => {
                                        const ik = buildItemKeyOrcamento(t.key, i.chave);
                                        const linhaJaNoOrcamento =
                                          blocoJaNoOrcamento && !itensOcultosNoOrcamento.includes(ik);
                                        return (
                                          <ServicosDropdownCheckbox
                                            key={ik}
                                            compact
                                            checked={
                                              linhaJaNoOrcamento ? true : linhasSelecionadasDropdown.has(ik)
                                            }
                                            disabled={linhaJaNoOrcamento}
                                            onChange={() => {
                                              if (!linhaJaNoOrcamento) toggleLinhaDropdown(ik);
                                            }}
                                          >
                                            <span
                                              className={`text-xs leading-snug pt-0.5 ${
                                                linhaJaNoOrcamento
                                                  ? 'text-gray-500 dark:text-gray-400'
                                                  : 'text-gray-700 dark:text-gray-300'
                                              }`}
                                            >
                                              <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                                                {i.codigo}
                                              </span>
                                              <span className="text-gray-400 dark:text-gray-500"> · </span>
                                              <span className="text-[13px]">{i.descricao}</span>
                                              {linhaJaNoOrcamento && (
                                                <span className="ml-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                                  (já no orçamento)
                                                </span>
                                              )}
                                            </span>
                                          </ServicosDropdownCheckbox>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { addSubtitulosSelecionadosAoOrcamento(); setShowServicosDropdown(false); }}
                    className="h-10 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 inline-flex items-center gap-2 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar ({linhasSelecionadasDropdown.size})
                  </button>
                </div>

                {linhasSelecionadasDropdown.size > 0 && subtitulosAdicionados.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                    {linhasSelecionadasDropdown.size} linha(s) selecionada(s). Use o checkbox do grupo para marcar todas
                    as composições ou escolha linhas específicas. Depois clique em <strong>Adicionar</strong>.
                  </p>
                )}

                {subtitulosAdicionados.length > 0 && (
                  <>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDetalhesFinanceiros(v => !v)}
                        className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        {showDetalhesFinanceiros ? 'Ocultar detalhes financeiros' : 'Ver detalhes financeiros'}
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
                      <table className="min-w-[1210px] w-full border-collapse text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                              Item
                            </th>
                            <th className="w-[88px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Código</th>
                            <th className="w-[88px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Banco</th>
                            <th className="min-w-[260px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Descrição</th>
                            <th className="w-14 px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Un.</th>
                            <th className="w-[104px] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Qtd.</th>
                            <th className="w-[104px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">MÃO DE OBRA</th>
                            <th className="w-[104px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">MATERIAL</th>
                            <th className="w-[104px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Custo dir.</th>
                            {showDetalhesFinanceiros && (
                              <>
                                <th className="w-[108px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Sub M.O.</th>
                                <th className="w-[108px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Sub mat.</th>
                              </>
                            )}
                            <th className="w-[112px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Total</th>
                            <th className="w-[72px] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Peso %</th>
                            <th className="w-[88px] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                              Ações
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                          {(() => {
                            const colunasTotais = 12 + (showDetalhesFinanceiros ? 2 : 0);
                            const servicoNumero = new Map<string, number>();
                            let nextMain = 0;
                            for (const b of subtitulosAdicionados) {
                              if (!servicoNumero.has(b.servicoNome)) {
                                servicoNumero.set(b.servicoNome, ++nextMain);
                              }
                            }
                            return subtitulosAdicionados.map((bloco, blocoIndex) => {
                        const rowsDoBloco = itensCalculados.filter(r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome);
                        const mesmoTituloSubtitulo =
                          bloco.servicoNome.trim().toLowerCase() === bloco.subtituloNome.trim().toLowerCase();
                        const main = servicoNumero.get(bloco.servicoNome) ?? 0;
                        const subIdx = subtitulosAdicionados
                          .slice(0, blocoIndex + 1)
                          .filter(b => b.servicoNome === bloco.servicoNome).length;
                        const blocoAnt = blocoIndex > 0 ? subtitulosAdicionados[blocoIndex - 1] : null;
                        const mostrarTituloServico =
                          !blocoAnt ||
                          normalizarNomeServicoOrcamento(blocoAnt.servicoNome) !==
                            normalizarNomeServicoOrcamento(bloco.servicoNome);
                        return (
                          <React.Fragment key={bloco.key}>
                            {mostrarTituloServico && (
                            <tr className="bg-red-600 dark:bg-red-950/90">
                              <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-bold tabular-nums text-white">
                                {main}
                              </td>
                              <td colSpan={colunasTotais - 1} className="px-3 py-2.5">
                                <span className="text-xs font-bold uppercase tracking-wide text-left text-white">
                                  {bloco.servicoNome}
                                </span>
                              </td>
                            </tr>
                            )}
                            <tr className="border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900">
                              <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                {`${main}.${subIdx}`}
                              </td>
                              <td colSpan={colunasTotais - 1} className="px-3 py-1.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                    {mesmoTituloSubtitulo ? bloco.servicoNome : bloco.subtituloNome}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeSubtituloDoOrcamento(bloco.key)}
                                    className="shrink-0 rounded p-1.5 text-gray-700 hover:bg-gray-300/80 dark:text-gray-200 dark:hover:bg-gray-700/80"
                                    title="Remover este subtítulo do orçamento"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                                  {rowsDoBloco.map((row, itemIdx) => {
                                    const usaDimensoes = !!row.dimensoes?.linhas?.length;
                                    const dim = dimensoesPorItem[row.key] || { tipoUnidade: 'm3' as const, linhas: [] };
                                    const tipoAuto = inferirTipoUnidadePorDimensao(dim.linhas);
                                    const ehCacamba4m3 = ehComposicaoCacamba4m3(row.item.descricao);
                                    const pesoPctOrcamento = total > 0 ? (row.total / total) * 100 : 0;
                                    return (
                                    <React.Fragment key={row.key}>
                                    <tr className="border-b border-gray-100/90 bg-white hover:bg-gray-50/90 dark:border-gray-700/90 dark:bg-gray-800 dark:hover:bg-gray-800/95">
                                      <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2 align-middle text-center text-xs font-medium tabular-nums text-gray-700 dark:text-gray-300">
                                        {`${main}.${subIdx}.${itemIdx + 1}`}
                                      </td>
                                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 align-middle text-center border-l border-gray-200 dark:border-gray-700">{row.item.codigo}</td>
                                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 align-middle text-center border-l border-gray-200 dark:border-gray-700">{row.item.banco}</td>
                                      <td className="min-w-[260px] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 align-middle max-w-md border-l border-gray-200 dark:border-gray-700"><div className="truncate" title={row.item.descricao}>{row.item.descricao}</div></td>
                                      <td className="px-2 py-2 text-center align-middle border-l border-gray-200 dark:border-gray-700">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                          {row.unidadeComposicao?.trim()
                                            ? row.unidadeComposicao.trim()
                                            : (usaDimensoes ? (tipoAuto === 'm3' ? 'm³' : tipoAuto === 'm2' ? 'm²' : tipoAuto === 'm' ? 'm' : 'UN') : 'UN')}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-center align-middle tabular-nums border-l border-gray-200 dark:border-gray-700">
                                        {row.tipoUnidade !== 'un' || ehCacamba4m3 ? (
                                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                        ) : (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={draftCalc[`qtd|${row.key}`] ?? (row.quantidade === 0 ? '' : String(row.quantidade))}
                                            onChange={e => setDraftCalc(p => ({ ...p, [`qtd|${row.key}`]: e.target.value }))}
                                            onBlur={e => handleCalcBlur(`qtd|${row.key}`, draftCalc[`qtd|${row.key}`] ?? e.target.value, n => setQuantidadeItem(row.key, Math.max(0, n)))}
                                            placeholder="0"
                                            className="w-[4.5rem] min-w-0 px-2 py-1 text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm mx-auto block"
                                          />
                                        )}
                                      </td>
                                      <td className="px-2 py-2 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.maoDeObraUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-2 py-2 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.materialUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-2 py-2 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.precoUnitario} className="text-sm" />
                                      </td>
                                      {showDetalhesFinanceiros && (
                                        <>
                                          <td className="px-2 py-2 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                            <MoedaCelula valor={row.subMaoDeObra} className="text-sm" />
                                          </td>
                                          <td className="px-2 py-2 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                            <MoedaCelula valor={row.subMaterial} className="text-sm" />
                                          </td>
                                        </>
                                      )}
                                      <td className="px-2 py-2 text-sm align-middle whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.total} className="text-sm font-semibold" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-2 py-2 text-sm text-center align-middle text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap border-l border-gray-200 dark:border-gray-700">
                                        {pesoPctOrcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                      </td>
                                      <td className="px-2 py-2 align-middle text-center border-l border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => removerItemComposicaoDoOrcamento(row.key)}
                                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                                          title="Remover composição do orçamento"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                        </div>
                                      </td>
                                    </tr>
                                    </React.Fragment>
                                    );
                                  })}
                          </React.Fragment>
                        );
                      });
                          })()}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                        Fechamento financeiro
                      </h4>
                      <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                        {[
                          ['TOTAL', resumoFinanceiro.totalBase],
                          [`Desconto (${(resumoFinanceiro.descontoPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`, resumoFinanceiro.valorDesconto],
                          ['Total com desconto', resumoFinanceiro.totalComDesconto],
                          [`Total geral com desconto e BDI (${(resumoFinanceiro.bdiPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`, resumoFinanceiro.totalComDescontoEBdi],
                          [`1º reajuste IPCA (${(resumoFinanceiro.ipca1Pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`, resumoFinanceiro.reajuste1],
                          [`2º reajuste IPCA (${(resumoFinanceiro.ipca2Pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`, resumoFinanceiro.reajuste2],
                          [`3º reajuste IPCA (${(resumoFinanceiro.ipca3Pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`, resumoFinanceiro.reajuste3]
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0"
                          >
                            <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                              {label}
                            </dt>
                            <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                              R$ {Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-300/80 dark:border-gray-600 pt-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                          Valor final
                        </span>
                        <span className="shrink-0 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50 text-right">
                          R$ {resumoFinanceiro.reajuste3.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={exportarOrcamentoDetalhado}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                        title="Exporta o orçamento"
                      >
                        <FileSpreadsheet className="w-5 h-5 shrink-0" />
                        Exportar Orçamento
                      </button>
                    </div>

                  </>
                )}
                </div>
              </CardContent>
            </Card>
            )
          )}

          {/* Tab: Composições */}
          {activeTab === 'composicoes' && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Arquivo de composições</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Importe uma planilha Excel com os itens (Código, Banco, Chave, Descrição, UND, M.O, Material, Custo Direto)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors">
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{isUploading ? 'Processando...' : 'Importar planilha'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileUploadComposicoes}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={apagarPlanilhaComposicoes}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Apagar planilha de composições carregada"
                    >
                      <Trash2 className="w-4 h-4" />
                      Apagar planilha
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por código, banco, descrição..."
                      value={searchComposicao}
                      onChange={e => setSearchComposicao(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    />
                  </div>
                </div>
                {composicoes.length === 0 ? (
                  <p className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Nenhuma composição carregada. Importe uma planilha para começar.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Código</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Banco</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Chave</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Descrição</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 w-16">UND</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">M.O</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Material</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Custo Direto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {composicoesFiltradas.map((c, i) => (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-2 text-sm text-center">{c.codigo}</td>
                            <td className="px-4 py-2 text-sm text-center">{c.banco}</td>
                            <td className="px-4 py-2 text-sm">{c.chave}</td>
                            <td className="px-4 py-2 text-sm max-w-xs truncate">{c.descricao}</td>
                            <td className="px-4 py-2 text-sm text-center">{c.unidade || '—'}</td>
                            <td className="px-4 py-2 text-sm">
                              <MoedaCelula valor={c.maoDeObraUnitario ?? 0} className="text-sm" />
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <MoedaCelula valor={c.materialUnitario ?? 0} className="text-sm" />
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <MoedaCelula valor={c.precoUnitario} className="text-sm" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </MainLayout>
      <Modal
        isOpen={editarDadosOpen}
        onClose={() => setEditarDadosOpen(false)}
        title="Editar dados do orçamento"
        size="lg"
        closeOnOverlayClick
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do orçamento *</label>
              <input
                value={editarDadosDraft.nomeOrcamento}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, nomeOrcamento: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: Orçamento 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS/Nº da pasta</label>
              <input
                value={editarDadosDraft.osNumeroPasta}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, osNumeroPasta: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prazo de execução (dias)</label>
              <input
                value={editarDadosDraft.prazoExecucaoDias}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, prazoExecucaoDias: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de abertura</label>
              <input
                type="date"
                value={editarDadosDraft.dataAbertura}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, dataAbertura: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de envio</label>
              <input
                type="date"
                value={editarDadosDraft.dataEnvio}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, dataEnvio: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável pelo orçamento</label>
              <input
                value={editarDadosDraft.responsavelOrcamento}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, responsavelOrcamento: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Orçamento realizado por</label>
              <input
                value={editarDadosDraft.orcamentoRealizadoPor}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, orcamentoRealizadoPor: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
              <input
                value={editarDadosDraft.descricao}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, descricao: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditarDadosOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarEdicaoDados}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              Salvar dados
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={novoOrcamentoMetaOpen}
        onClose={() => setNovoOrcamentoMetaOpen(false)}
        title="Criar novo orçamento"
        size="lg"
        closeOnOverlayClick
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Informe os dados base do orçamento. A revisão inicia como <strong>Sem revisão</strong> e ao salvar será <strong>R01</strong>, <strong>R02</strong>…
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS/Nº da pasta *</label>
              <input
                value={novoOrcamentoMetaDraft.osNumeroPasta}
                onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, osNumeroPasta: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: XX/2025 - Nº241"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prazo de execução (dias)</label>
              <input
                value={novoOrcamentoMetaDraft.prazoExecucaoDias}
                onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, prazoExecucaoDias: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: 150"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de abertura *</label>
              <input
                type="date"
                value={novoOrcamentoMetaDraft.dataAbertura}
                onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, dataAbertura: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de envio</label>
              <input
                type="date"
                value={novoOrcamentoMetaDraft.dataEnvio}
                onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, dataEnvio: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Observação: ao salvar, a data de envio será atualizada automaticamente.
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável pelo orçamento</label>
              <select
                value={novoOrcamentoMetaDraft.responsavelOrcamento}
                onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, responsavelOrcamento: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                disabled={loadingEmployeeOptions}
              >
                <option value="">
                  {loadingEmployeeOptions ? 'Carregando funcionários...' : 'Selecione o responsável'}
                </option>
                {employeeOptions.map((employee) => (
                  <option key={employee.id} value={employee.name}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição *</label>
              <input
                value={novoOrcamentoMetaDraft.descricao}
                onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, descricao: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: Manutenção geral da unidade"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNovoOrcamentoMetaOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarCriacaoNovoOrcamento}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium"
            >
              Criar orçamento
            </button>
          </div>
        </div>
      </Modal>
    </ProtectedRoute>
  );
}
