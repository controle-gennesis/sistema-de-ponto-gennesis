'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ClipboardList,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Building2,
  FileDown,
  FileText,
  RotateCcw,
  Pencil,
  Save,
  ArrowLeft,
  ListPlus
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';

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

/** Linha de medição para memória de cálculo dos quantitativos (C, L, H, N, empolamento, descrição) */
export interface LinhaMedicao {
  descricao?: string;
  origemLinhaId?: string;
  origemComposicaoDescricao?: string;
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number; // fator 1,00 / 1,10 / 1,20 / 1,30 (legado: percPerda convertido)
  valorManual?: number; // quando C,L,H vazios: valor digitado diretamente (área ou volume)
  editavelC?: boolean;
  editavelL?: boolean;
  editavelH?: boolean;
}

export type TipoUnidadeFormula = 'm3' | 'm2' | 'm' | 'un';

export interface DimensoesItem {
  tipoUnidade: TipoUnidadeFormula;
  linhas: LinhaMedicao[];
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

function formatRevisaoLabel(revisaoCount: number | null | undefined): string {
  const n = typeof revisaoCount === 'number' && isFinite(revisaoCount) ? revisaoCount : 0;
  if (n <= 0) return 'Sem revisão';
  return `R${String(n).padStart(2, '0')}`;
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
  itensOcultosNoOrcamento: string[];
  showDetalhesFinanceiros: boolean;
  meta?: OrcamentoMeta;
}

function sessaoVazia(): SessaoOrcamentoPersist {
  return {
    subtitulosNoOrcamento: [],
    quantidadesPorItem: {},
    dimensoesPorItem: {},
    itensOcultosNoOrcamento: [],
    showDetalhesFinanceiros: false,
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
      itensOcultosNoOrcamento: Array.isArray(p.itensOcultosNoOrcamento) ? p.itensOcultosNoOrcamento : [],
      showDetalhesFinanceiros: Boolean(p.showDetalhesFinanceiros),
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
            itensOcultosNoOrcamento: Array.isArray(so.itensOcultosNoOrcamento) ? so.itensOcultosNoOrcamento : [],
            showDetalhesFinanceiros: Boolean(so.showDetalhesFinanceiros),
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

/** Calcula A (área) = C×L×N, V (volume) = A×H ou C×L×H×N */
function calcA(linha: LinhaMedicao): number {
  const { C, L, N } = linha;
  return (C || 0) * (L || 0) * (N && N > 0 ? N : 1);
}
function calcV(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  const { C, H, N } = linha;
  const A = calcA(linha);
  const n = N && N > 0 ? N : 1;
  switch (tipo) {
    case 'm3': return A * (H || 0);
    case 'm2': return A;
    case 'm': return (C || 0) * n;
    default: return 1;
  }
}
/** Calcula SUBTOTAL = V × empolamento. Se C,L,H vazios e valorManual preenchido, usa valorManual. */
function calcularQuantidadeLinha(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  const fator = (linha.empolamento != null && linha.empolamento > 0)
    ? linha.empolamento
    : ((linha as unknown as { percPerda?: number }).percPerda != null ? 1 + (linha as unknown as { percPerda: number }).percPerda / 100 : 1);
  const temDimensoes = (linha.C || 0) !== 0 || (linha.L || 0) !== 0 || (linha.H || 0) !== 0;
  if (!temDimensoes && linha.valorManual != null && linha.valorManual >= 0) {
    return linha.valorManual * fator;
  }
  return calcV(linha, tipo) * fator;
}

function inferirTipoUnidadePorDimensao(linhas: LinhaMedicao[] | undefined): TipoUnidadeFormula {
  if (!linhas?.length) return 'un';
  const hasH = linhas.some(ln => (ln.H || 0) > 0);
  if (hasH) return 'm3';
  const hasL = linhas.some(ln => (ln.L || 0) > 0);
  if (hasL) return 'm2';
  const hasC = linhas.some(ln => (ln.C || 0) > 0);
  if (hasC) return 'm';
  return 'un';
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

export default function OrcamentoPage() {
  const router = useRouter();
  const { costCenters, isLoading: loadingCentros } = useCostCenters();
  const [centroCustoId, setCentroCustoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'composicoes' | 'servicos' | 'orcamento'>('orcamento');
  const [composicoes, setComposicoes] = useState<ComposicaoItem[]>([]);
  const [servicos, setServicos] = useState<ServicoPadrao[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchComposicao, setSearchComposicao] = useState('');
  const [subtitulosSelecionados, setSubtitulosSelecionados] = useState<Set<string>>(new Set());
  const [subtitulosNoOrcamento, setSubtitulosNoOrcamento] = useState<string[]>([]);
  const [quantidadesPorItem, setQuantidadesPorItem] = useState<Record<string, number>>({});
  const [dimensoesPorItem, setDimensoesPorItem] = useState<Record<string, DimensoesItem>>({});
  const [novoServicoNome, setNovoServicoNome] = useState('');
  const [showAddServico, setShowAddServico] = useState(false);
  const [isImportandoOrcamento, setIsImportandoOrcamento] = useState(false);
  const [servicosExpandidos, setServicosExpandidos] = useState<Set<string>>(new Set());
  const [itensComDimensoesAbertos, setItensComDimensoesAbertos] = useState<Set<string>>(new Set());
  const [itensOcultosNoOrcamento, setItensOcultosNoOrcamento] = useState<Set<string>>(new Set());
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
  const [analiticoModalOpen, setAnaliticoModalOpen] = useState(false);
  const [analiticoModalInfo, setAnaliticoModalInfo] = useState<null | { codigo: string; banco: string; descricao: string }>(null);
  const [analiticoModalData, setAnaliticoModalData] = useState<null | AnaliticoComposicao>(null);
  // Cache do analítico por composição (por item) para não recalcular a cada clique.
  const [analiticoCache, setAnaliticoCache] = useState<Record<string, AnaliticoComposicao>>({});
  // Draft para campos que aceitam cálculos (2+3, 10/2, etc) - avalia no blur
  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const [salvandoOrcamento, setSalvandoOrcamento] = useState(false);
  const [orcamentoAtivoId, setOrcamentoAtivoId] = useState<string | null>(null);
  const [listaOrcamentos, setListaOrcamentos] = useState<{ id: string; nome: string; updatedAt: string }[]>([]);
  const [carregandoListaOrcamentos, setCarregandoListaOrcamentos] = useState(false);
  const [nomeOrcamentoRascunho, setNomeOrcamentoRascunho] = useState('');
  const [orcamentosSearch, setOrcamentosSearch] = useState('');
  const sessaoRef = useRef<SessaoOrcamentoPersist>(sessaoVazia());

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
    setSubtitulosSelecionados(new Set());
    setQuantidadesPorItem({});
    setDimensoesPorItem({});
    setItensComDimensoesAbertos(new Set());
    setItensOcultosNoOrcamento(new Set());
    setShowDetalhesFinanceiros(false);

    const aplicarSessao = (s: SessaoOrcamentoPersist | null) => {
      if (!s) return;
      setSubtitulosNoOrcamento(s.subtitulosNoOrcamento);
      setQuantidadesPorItem(s.quantidadesPorItem);
      setDimensoesPorItem(s.dimensoesPorItem);
      setItensOcultosNoOrcamento(new Set(s.itensOcultosNoOrcamento));
      setShowDetalhesFinanceiros(s.showDetalhesFinanceiros);
      setMeta(s.meta ? s.meta : sessaoVazia().meta!);
    };

    const oid = orcamentoAtivoId;
    fetchOrcamentoDetail(centroCustoId, oid).then(apiData => {
      if (cancelled) return;
      if (apiData) {
        setServicos(apiData.servicos);
        setImports(apiData.imports);
        saveServicos(centroCustoId, apiData.servicos);
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(apiData.imports));
        if (apiData.servicos.length > 0) {
          setServicosExpandidos(new Set([apiData.servicos[0].id]));
        }
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
      itensOcultosNoOrcamento: Array.from(itensOcultosNoOrcamento),
      showDetalhesFinanceiros,
      meta
    };
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
    itensOcultosNoOrcamento,
    showDetalhesFinanceiros,
    meta
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

  const salvarOrcamento = async () => {
    if (!centroCustoId || !orcamentoAtivoId) {
      toast.error('Abra ou crie um orçamento na lista para salvar.');
      return;
    }
    setSalvandoOrcamento(true);
    try {
      const nextMeta: OrcamentoMeta = {
        ...meta,
        revisaoCount: (meta.revisaoCount || 0) + 1,
        dataEnvio: todayInputDate()
      };
      const nextSessao: SessaoOrcamentoPersist = {
        ...sessaoRef.current,
        meta: nextMeta
      };
      await saveOrcamentoToApi(centroCustoId, orcamentoAtivoId, {
        servicos,
        imports,
        sessaoOrcamento: nextSessao
      });
      setMeta(nextMeta);
      await refreshListaOrcamentos();
      toast.success('Orçamento salvo. Você pode fechar e voltar depois para continuar editando.');
    } catch {
      toast.error('Não foi possível salvar no servidor. O rascunho permanece neste navegador.');
    } finally {
      setSalvandoOrcamento(false);
    }
  };

  const voltarParaListaOrcamentos = () => {
    setOrcamentoAtivoId(null);
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

  /** Copia serviços + histórico de imports de outro orçamento do mesmo contrato (equivale a repetir o orçamento perfeito já importado lá). */
  const apagarOrcamento = () => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    if (!confirm('Tem certeza que deseja apagar este orçamento? Esta ação não pode ser desfeita.')) return;
    void (async () => {
      try {
        await excluirOrcamentoApi(centroCustoId, orcamentoAtivoId);
        const oid = orcamentoAtivoId;
        localStorage.removeItem(storageKey(centroCustoId, 'sessao', oid));
        setListaOrcamentos(prev => prev.filter(o => o.id !== oid));
        setOrcamentoAtivoId(null);
        setNomeOrcamentoRascunho('');
        setServicos([]);
        setImports([]);
        toast.success('Orçamento apagado.');
      } catch {
        toast.error('Não foi possível apagar no servidor.');
      }
    })();
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
    setSubtitulosSelecionados(prev => new Set(Array.from(prev).filter(k => !k.startsWith(prefix))));
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
    setQuantidadesPorItem(prev => { const next = { ...prev }; delete next[itemKey]; return next; });
    setDimensoesPorItem(prev => { const next = { ...prev }; delete next[itemKey]; return next; });
    setItensComDimensoesAbertos(prev => { const s = new Set(prev); s.delete(itemKey); return s; });
    const updated = servicos.map(s => {
      if (s.id !== servicoId) return s;
      return {
        ...s,
        subtitulos: s.subtitulos.map(sub =>
          sub.id === subtituloId ? { ...sub, itens: sub.itens.filter(i => i.chave !== chave) } : sub
        )
      };
    });
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    toast.success('Item removido');
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
    const list: { key: string; servicoNome: string; subtituloNome: string }[] = [];
    servicos.forEach(s =>
      s.subtitulos.forEach(sub =>
        list.push({ key: `${s.id}|${sub.id}`, servicoNome: s.nome, subtituloNome: sub.nome })
      )
    );
    return list;
  }, [servicos]);

  const toggleSubtituloSelecionado = (key: string) => {
    setSubtitulosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selecionarTodosSubtitulos = () => {
    setSubtitulosSelecionados(new Set(todosSubtitulos.map(t => t.key)));
  };

  const desmarcarTodosSubtitulos = () => {
    setSubtitulosSelecionados(new Set());
  };

  const addSubtitulosSelecionadosAoOrcamento = () => {
    const paraAdicionar = Array.from(subtitulosSelecionados).filter(k => !subtitulosNoOrcamento.includes(k));
    if (paraAdicionar.length === 0) {
      toast.error('Nenhum subtítulo selecionado ou todos já estão no orçamento');
      return;
    }
    setSubtitulosNoOrcamento(prev => [...prev, ...paraAdicionar]);
    setSubtitulosSelecionados(new Set());
    toast.success(`${paraAdicionar.length} serviço(s) adicionado(s) ao orçamento`);
  };

  const removeSubtituloDoOrcamento = (key: string) => {
    setSubtitulosNoOrcamento(prev => prev.filter(k => k !== key));
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
    setItensOcultosNoOrcamento(prev => new Set(Array.from(prev).filter(k => !k.startsWith(key + '|'))));
  };

  const ocultarItemDoOrcamento = (itemKey: string) => {
    setItensOcultosNoOrcamento(prev => new Set(prev).add(itemKey));
    setQuantidadesPorItem(prev => { const next = { ...prev }; delete next[itemKey]; return next; });
    setDimensoesPorItem(prev => { const next = { ...prev }; delete next[itemKey]; return next; });
    setItensComDimensoesAbertos(prev => { const s = new Set(prev); s.delete(itemKey); return s; });
    toast.success('Item removido do orçamento. Use "Restaurar" para incluí-lo novamente.');
  };

  const restaurarItemNoOrcamento = (itemKey: string) => {
    setItensOcultosNoOrcamento(prev => { const s = new Set(prev); s.delete(itemKey); return s; });
    toast.success('Item restaurado ao orçamento.');
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
    for (const bloco of subtitulosAdicionados) {
      for (const i of bloco.itens) {
        const itemKey = `${bloco.key}|${i.chave}`;
        if (itensOcultosNoOrcamento.has(itemKey)) continue;
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
    const atual = dimensoesPorItem[itemKey] || { tipoUnidade: 'm3', linhas: [] };
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        linhas: [...atual.linhas, { descricao: '', C: 0, L: 0, H: 0, N: 1, empolamento: 0 }]
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
      toast.error('Não há itens no orçamento para gerar a memória de cálculo.');
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
      ['LEGENDA: C= Comprimento | L= Largura | H= Altura | A= Área | V= Volume | % Empolamento= fator 1,10/1,20/1,30 | M= Metro'],
      [''],
      ['DISCRIMINAÇÃO DOS SERVIÇOS'],
      ['CÓDIGO', 'DESCRIÇÃO', 'UN', 'C', 'L', 'H', '% EMPOL.', 'N', 'A', 'V', 'SUBTOTAL', 'Preço Unit.', 'TOTAL (R$)']
    ];

    const unidadeLabel = (t: TipoUnidadeFormula) => ({ m3: 'M³', m2: 'M²', m: 'M', un: 'UN' }[t] || 'UN');
    let idxServico = 0;
    const formulaCells: { cell: string; formula: string }[] = [];

    for (const row of itensCalculados) {
      const codigo = `${Math.floor(idxServico / 10) + 1}.${(idxServico % 10) + 1}`;
      const descricaoBase = `${row.item.codigo} ${row.item.banco} - ${row.item.descricao || ''}`;
      const tipoAuto = row.tipoUnidade ?? inferirTipoUnidadePorDimensao(row.dimensoes?.linhas);
      const un = row.unidadeComposicao?.trim() || unidadeLabel(tipoAuto);
      const preco = row.precoUnitario;
      const totalItem = row.total;

      if (row.dimensoes?.linhas?.length) {
        for (let i = 0; i < row.dimensoes.linhas.length; i++) {
          const ln = row.dimensoes.linhas[i];
          const descLinha = ln.descricao?.trim() || (i === 0 ? descricaoBase : '');
          const descCol = i === 0 ? descricaoBase : descLinha;
          const empolRaw = ln.empolamento ?? ((ln as unknown as { percPerda?: number }).percPerda != null ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100 : 0);
          const empol = (empolRaw != null && empolRaw > 0) ? empolRaw : 1;
          rows.push([
            i === 0 ? codigo : '',
            descCol,
            un,
            ln.C ?? '',
            ln.L ?? '',
            ln.H ?? '',
            empol,
            ln.N ?? 1,
            '',
            '',
            '',
            i === 0 ? preco : '',
            i === 0 ? totalItem : ''
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
        rows.push([codigo, descricaoBase, un, '', '', '', '', '', row.quantidade, row.quantidade, row.quantidade, preco, totalItem]);
      }
      idxServico++;
    }

    rows.push(['']);
    rows.push(['', '', '', '', '', '', '', '', '', 'TOTAL GERAL', '', '', total]);

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
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }
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

  const abrirAnaliticoDaComposicao = (linha: any) => {
    const item: ItemServico = linha?.item;
    if (!item) return;

    const composicaoDaLinha = (() => {
      const chaves = chavesParaBusca(item.codigo, item.banco, item.chave);
      for (const k of chaves) {
        const c = mapaComposicoes[k];
        if (c) return c;
      }
      return null;
    })();

    if (composicaoDaLinha?.analiticoLinhas?.length) {
      const totalAnalitico = composicaoDaLinha.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0);
      setAnaliticoModalInfo({
        codigo: item.codigo,
        banco: item.banco,
        descricao: item.descricao || ''
      });
      setAnaliticoModalData({
        total: totalAnalitico,
        linhas: composicaoDaLinha.analiticoLinhas
      });
      setAnaliticoModalOpen(true);
      return;
    }

    const materialUnitario = Number(linha?.materialUnitario ?? 0);
    const maoDeObraUnitario = Number(linha?.maoDeObraUnitario ?? 0);

    const seedKey = `${item.codigo}|${item.banco}|${item.chave || ''}`;
    const unitAnalitico = analiticoCache[seedKey] ?? gerarAnaliticoComposicaoUnit(materialUnitario, maoDeObraUnitario, seedKey);

    if (!analiticoCache[seedKey]) {
      setAnaliticoCache(prev => ({ ...prev, [seedKey]: unitAnalitico }));
    }

    setAnaliticoModalInfo({
      codigo: item.codigo,
      banco: item.banco,
      descricao: item.descricao || ''
    });
    // O modal exibe o analítico unitário da composição (CPU), não o total escalado pela qtd. do item.
    setAnaliticoModalData(unitAnalitico);
    setAnaliticoModalOpen(true);
  };

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
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        <FileDown className="w-4 h-4 inline mr-1.5" />
                        {loadingFromApi ? 'Carregando do S3...' : `Documentos deste orçamento (${imports.length})`}
                      </p>
                      {(servicos.length > 0 || composicoes.length > 0) && (
                        <button
                          type="button"
                          onClick={apagarOrcamento}
                          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Apagar
                        </button>
                      )}
                    </div>
                    {imports.length > 0 ? (
                      <div className="mt-2 max-h-24 overflow-y-auto text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        {imports.slice(0, 5).map(imp => (
                          <div key={imp.id} className="truncate">
                            {imp.fileName} — {imp.tipo} — {imp.date ? new Date(imp.date).toLocaleString('pt-BR') : ''}
                            {imp.servicosCount != null && ` (${imp.servicosCount} serviços)`}
                            {imp.itensCount != null && ` (${imp.itensCount} itens)`}
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
              { id: 'orcamento', label: 'Novo Orçamento', icon: Calculator },
              { id: 'composicoes', label: 'Composições', icon: FileSpreadsheet },
              { id: 'servicos', label: 'Serviços Padrão', icon: ClipboardList }
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
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={voltarParaListaOrcamentos}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-sm"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Voltar à lista
                    </button>
                    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[200px]">
                      <input
                        type="text"
                        value={nomeOrcamentoRascunho}
                        onChange={e => setNomeOrcamentoRascunho(e.target.value)}
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                        placeholder="Nome do orçamento"
                      />
                      <button
                        type="button"
                        onClick={salvarNomeOrcamento}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Pencil className="w-4 h-4" />
                        Salvar nome
                      </button>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Montar orçamento</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Selecione um serviço padrão e informe a quantidade para calcular o valor total
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      Dados do orçamento
                    </div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Revisão: <span className="text-gray-900 dark:text-gray-100">{formatRevisaoLabel(meta.revisaoCount)}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">OS/Nº da pasta</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{meta.osNumeroPasta || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Data de abertura</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{meta.dataAbertura || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Data de envio</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{meta.dataEnvio || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Prazo de execução (dias)</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{meta.prazoExecucaoDias || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Responsável pelo orçamento</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{meta.responsavelOrcamento || '—'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Orçamento realizado por</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{meta.orcamentoRealizadoPor || '—'}</div>
                    </div>
                    <div className="sm:col-span-2 xl:col-span-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/20 px-3 py-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Descrição</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 break-words">{meta.descricao || '—'}</div>
                    </div>
                  </div>
                </div>

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
                      <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                      <span className="block pr-6 truncate">
                        {subtitulosSelecionados.size === 0
                          ? (todosSubtitulos.length === 0 ? 'Nenhum serviço disponível' : 'Selecione os serviços')
                          : subtitulosSelecionados.size === todosSubtitulos.filter(t => !subtitulosNoOrcamento.includes(t.key)).length
                            ? 'Todos selecionados'
                            : `${subtitulosSelecionados.size} selecionado(s)`}
                      </span>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                        {showServicosDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>
                  {showServicosDropdown && (
                    <div className="absolute left-0 right-0 top-full z-[201] mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3 max-h-[min(24rem,70vh)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={servicosSearch}
                        onChange={(e) => setServicosSearch(e.target.value)}
                        className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                      />
                      <div className="flex items-center justify-between gap-2 mb-2">
                        {(() => {
                          const disp = todosSubtitulos.filter(t => !subtitulosNoOrcamento.includes(t.key));
                          const allChecked = disp.length > 0 && disp.every(t => subtitulosSelecionados.has(t.key));
                          return (
                            <label className="flex items-center gap-3 cursor-pointer group" htmlFor="select-all-servicos">
                              <div className="relative">
                                <input
                                  id="select-all-servicos"
                                  type="checkbox"
                                  checked={allChecked}
                                  onChange={(e) => e.target.checked ? selecionarTodosSubtitulos() : desmarcarTodosSubtitulos()}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                                  allChecked ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                }`}>
                                  {allChecked && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                            </label>
                          );
                        })()}
                      </div>
                      <div>
                        {todosSubtitulos.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                            Nenhum serviço disponível. Importe o orçamento perfeito na aba Serviços Padrão.
                          </p>
                        ) : (
                          todosSubtitulos
                            .filter(t => {
                              const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
                              return label.includes(servicosSearch.trim().toLowerCase());
                            })
                            .map(t => {
                              const jaNoOrcamento = subtitulosNoOrcamento.includes(t.key);
                              const checked = subtitulosSelecionados.has(t.key);
                              return (
                                <label
                                  key={t.key}
                                  className={`flex items-center gap-3 py-1.5 cursor-pointer group ${jaNoOrcamento ? 'opacity-50' : ''}`}
                                >
                                  <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked ? 'bg-red-600 dark:bg-red-500 border-red-600' : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500'}`}>
                                    {checked && (
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleSubtituloSelecionado(t.key)}
                                    disabled={jaNoOrcamento}
                                    className="sr-only"
                                  />
                                  <span className="text-sm text-gray-900 dark:text-gray-100">
                                    {t.servicoNome} › {t.subtituloNome}
                                    {jaNoOrcamento && ' (já no orçamento)'}
                                  </span>
                                </label>
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
                    Adicionar ({subtitulosSelecionados.size})
                  </button>
                </div>

                {subtitulosSelecionados.size > 0 && subtitulosAdicionados.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                    {subtitulosSelecionados.size} serviço(s) selecionado(s). Clique em <strong>Adicionar</strong> para incluí-los no orçamento.
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
                    <div className="space-y-6">
                      {subtitulosAdicionados.map(bloco => {
                        const rowsDoBloco = itensCalculados.filter(r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome);
                        const mesmoTituloSubtitulo =
                          bloco.servicoNome.trim().toLowerCase() === bloco.subtituloNome.trim().toLowerCase();
                        const bordaEntreFaixas = 'border-b border-gray-200 dark:border-gray-700';
                        return (
                          <div key={bloco.key} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm dark:shadow-none">
                            <div
                              className={`relative flex items-center justify-center py-2.5 px-10 bg-gray-50 dark:bg-gray-900 ${bordaEntreFaixas}`}
                            >
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase text-center leading-tight">
                                {bloco.servicoNome}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSubtituloDoOrcamento(bloco.key)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-200/80 dark:hover:bg-gray-800/80"
                                title="Remover este serviço"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            {!mesmoTituloSubtitulo && (
                              <div
                                className={`flex items-center justify-center py-2 px-4 bg-white dark:bg-gray-800 ${bordaEntreFaixas}`}
                              >
                                <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase text-center leading-tight">
                                  {bloco.subtituloNome}
                                </span>
                              </div>
                            )}
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead>
                                  <tr className="bg-white dark:bg-gray-900/10">
                                    <th className="w-[90px] px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Código</th>
                                    <th className="w-[90px] px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Banco</th>
                                    <th className="min-w-[280px] px-4 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Descrição</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-600 dark:text-gray-400 uppercase w-20">Un.</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase w-28">Quantidade</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">MÃO DE OBRA</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">MATERIAL</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Custo Direto</th>
                                    {showDetalhesFinanceiros && (
                                      <>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">SUB MÃO DE OBRA</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">SUB MATERIAL</th>
                                      </>
                                    )}
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Total</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400 uppercase w-24">Peso %</th>
                                    <th className="px-4 py-2 w-24"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                  {rowsDoBloco.map((row, rowIdx) => {
                                    const [servicoId, subtituloId] = bloco.key.split('|');
                                    const usaDimensoes = !!row.dimensoes?.linhas?.length;
                                    const aberto = itensComDimensoesAbertos.has(row.key);
                                    const dim = dimensoesPorItem[row.key] || { tipoUnidade: 'm3' as const, linhas: [] };
                                    const tipoAuto = inferirTipoUnidadePorDimensao(dim.linhas);
                                    const ehCargaEntulho = ehComposicaoCargaEntulho(row.item.descricao);
                                    const ehCacamba4m3 = ehComposicaoCacamba4m3(row.item.descricao);
                                    const pesoPctOrcamento = total > 0 ? (row.total / total) * 100 : 0;
                                    return (
                                    <React.Fragment key={row.key}>
                                    <tr className={`${rowIdx % 2 === 0 ? 'bg-white dark:bg-gray-900/10' : 'bg-gray-50/40 dark:bg-gray-900/20'} hover:bg-gray-50 dark:hover:bg-gray-800/50`}>
                                      <td className="w-[90px] px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{row.item.codigo}</td>
                                      <td className="w-[90px] px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{row.item.banco}</td>
                                      <td className="min-w-[280px] px-4 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-md truncate">{row.item.descricao}</td>
                                      <td className="px-4 py-2 text-center">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                          {row.unidadeComposicao?.trim()
                                            ? row.unidadeComposicao.trim()
                                            : (usaDimensoes ? (tipoAuto === 'm3' ? 'm³' : tipoAuto === 'm2' ? 'm²' : tipoAuto === 'm' ? 'm' : 'UN') : 'UN')}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-right">
                                        {row.tipoUnidade !== 'un' || ehCacamba4m3 ? (
                                          <span className="text-sm font-medium">{row.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                        ) : (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={draftCalc[`qtd|${row.key}`] ?? (row.quantidade === 0 ? '' : String(row.quantidade))}
                                            onChange={e => setDraftCalc(p => ({ ...p, [`qtd|${row.key}`]: e.target.value }))}
                                            onBlur={e => handleCalcBlur(`qtd|${row.key}`, draftCalc[`qtd|${row.key}`] ?? e.target.value, n => setQuantidadeItem(row.key, Math.max(0, n)))}
                                            placeholder="0"
                                            className="w-20 px-2 py-1 text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                          />
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right">
                                        R$ {row.maoDeObraUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right">
                                        R$ {row.materialUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right">
                                        R$ {row.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      {showDetalhesFinanceiros && (
                                        <>
                                          <td className="px-4 py-2 text-sm text-right">
                                            R$ {row.subMaoDeObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </td>
                                          <td className="px-4 py-2 text-sm text-right">
                                            R$ {row.subMaterial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </td>
                                        </>
                                      )}
                                      <td className="px-4 py-2 text-sm text-right font-medium">
                                        R$ {row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-4 py-2 text-sm text-right text-gray-700 dark:text-gray-300 tabular-nums">
                                        {pesoPctOrcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                      </td>
                                      <td className="px-4 py-2 flex items-center justify-end gap-1 whitespace-nowrap">
                                        {row.tipoUnidade !== 'un' && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!usaDimensoes) {
                                              addLinhaMedicao(row.key);
                                              setItensComDimensoesAbertos(prev => { const s = new Set(prev); s.add(row.key); return s; });
                                            } else {
                                              setItensComDimensoesAbertos(prev => { const s = new Set(prev); s.has(row.key) ? s.delete(row.key) : s.add(row.key); return s; });
                                            }
                                          }}
                                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                                          title={aberto ? 'Fechar dimensões' : 'Editar linhas (comprimento C, L, H)'}
                                        >
                                          <Pencil className="w-4 h-4" />
                                        </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => abrirAnaliticoDaComposicao(row)}
                                          className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                                          title="Ver analítico da composição"
                                        >
                                          <FileText className="w-4 h-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => ocultarItemDoOrcamento(row.key)}
                                          className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                                          title="Remover do orçamento (pode restaurar depois)"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </td>
                                    </tr>
                                    {aberto && usaDimensoes && (
                                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                                      <td colSpan={8 + (showDetalhesFinanceiros ? 2 : 0) + 3} className="px-4 py-4">
                                        <div className="space-y-4">
                                          <div className="space-y-3">
                                            {(() => {
                                              const renderLinhaCampos = (ln: LinhaMedicao, idx: number) => (
                                                <>
                                                  {(() => {
                                                  const tipo = row.tipoUnidade;
                                                  const temDimensoes = (ln.C || 0) !== 0 || (ln.L || 0) !== 0 || (ln.H || 0) !== 0;
                                                  const valorA = calcA(ln);
                                                  const valorV = calcV(ln, tipo);
                                                  const valorSubtotal = calcularQuantidadeLinha(ln, tipo);
                                                  const empolVal = ln.empolamento ?? ((ln as unknown as { percPerda?: number }).percPerda != null ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100 : 0);
                                                  const mostrarC = tipo !== 'un';
                                                  const mostrarL = tipo === 'm2' || tipo === 'm3';
                                                  const mostrarH = tipo === 'm3';
                                                  const mostrarN = tipo !== 'un';
                                                  const mostrarA = tipo === 'm2' || tipo === 'un' || ehCargaEntulho;
                                                  const mostrarV = tipo === 'm3' || tipo === 'un';
                                                  const podeEditarCNaCarga = ehCargaEntulho && !!ln.editavelC;
                                                  const podeEditarLNaCarga = ehCargaEntulho && !!ln.editavelL;
                                                  const podeEditarHNaCarga = ehCargaEntulho && !!ln.editavelH;
                                                  const descricaoComposicaoLinha = `${row.item.codigo} ${row.item.banco} - ${row.item.descricao || ''}`.trim().slice(0, 120);
                                                  const bloquearDescricao = ehCargaEntulho;
                                                  const bloquearN = ehCargaEntulho;
                                                  return (
                                                    <div className="flex flex-wrap items-end gap-2">
                                                      <div className="flex-1 min-w-[200px]">
                                                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">Descrição</label>
                                                        <input
                                                          type="text"
                                                          placeholder="Ex: COBERTURA DAS CALDEIRAS"
                                                          value={ln.descricao || ''}
                                                          onChange={e => !bloquearDescricao && updateLinhaMedicao(row.key, idx, 'descricao', e.target.value)}
                                                          readOnly={bloquearDescricao}
                                                          className={`w-full h-9 px-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${bloquearDescricao ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                        />
                                                      </div>
                                                      {mostrarC && (
                                                        <div className="w-[90px] shrink-0">
                                                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">C (m)</label>
                                                          <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            placeholder="0"
                                                            value={draftCalc[`${row.key}|${idx}|C`] ?? ((ln.C || 0) === 0 ? '' : String(ln.C))}
                                                            onChange={e => (ehCargaEntulho ? podeEditarCNaCarga : true) && setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|C`]: e.target.value }))}
                                                            onBlur={e => (ehCargaEntulho ? podeEditarCNaCarga : true) && handleCalcBlur(`${row.key}|${idx}|C`, draftCalc[`${row.key}|${idx}|C`] ?? e.target.value, (n) => updateLinhaMedicao(row.key, idx, 'C', n))}
                                                            readOnly={ehCargaEntulho ? !podeEditarCNaCarga : false}
                                                            className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${(ehCargaEntulho ? !podeEditarCNaCarga : false) ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                          />
                                                        </div>
                                                      )}
                                                      {mostrarL && (
                                                        <div className="w-[90px] shrink-0">
                                                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">L (m)</label>
                                                          <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            placeholder="0"
                                                            value={draftCalc[`${row.key}|${idx}|L`] ?? ((ln.L || 0) === 0 ? '' : String(ln.L))}
                                                            onChange={e => (ehCargaEntulho ? podeEditarLNaCarga : true) && setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|L`]: e.target.value }))}
                                                            onBlur={e => (ehCargaEntulho ? podeEditarLNaCarga : true) && handleCalcBlur(`${row.key}|${idx}|L`, draftCalc[`${row.key}|${idx}|L`] ?? e.target.value, (n) => updateLinhaMedicao(row.key, idx, 'L', n))}
                                                            readOnly={ehCargaEntulho ? !podeEditarLNaCarga : false}
                                                            className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${(ehCargaEntulho ? !podeEditarLNaCarga : false) ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                          />
                                                        </div>
                                                      )}
                                                      {mostrarH && (
                                                        <div className="w-[90px] shrink-0">
                                                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">H (m)</label>
                                                          <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            placeholder="0"
                                                            value={draftCalc[`${row.key}|${idx}|H`] ?? ((ln.H || 0) === 0 ? '' : String(ln.H))}
                                                            onChange={e => (ehCargaEntulho ? podeEditarHNaCarga : true) && setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|H`]: e.target.value }))}
                                                            onBlur={e => (ehCargaEntulho ? podeEditarHNaCarga : true) && handleCalcBlur(`${row.key}|${idx}|H`, draftCalc[`${row.key}|${idx}|H`] ?? e.target.value, (n) => updateLinhaMedicao(row.key, idx, 'H', n))}
                                                            readOnly={ehCargaEntulho ? !podeEditarHNaCarga : false}
                                                            className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${(ehCargaEntulho ? !podeEditarHNaCarga : false) ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                          />
                                                        </div>
                                                      )}
                                                      {mostrarN && (
                                                        <div className="w-[70px] shrink-0">
                                                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">N</label>
                                                          <input
                                                            type="text"
                                                            inputMode="decimal"
                                                            placeholder="1"
                                                            value={draftCalc[`${row.key}|${idx}|N`] ?? String(ln.N ?? 1)}
                                                            onChange={e => !bloquearN && setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|N`]: e.target.value }))}
                                                            onBlur={e => !bloquearN && handleCalcBlur(`${row.key}|${idx}|N`, draftCalc[`${row.key}|${idx}|N`] ?? e.target.value, (n) => updateLinhaMedicao(row.key, idx, 'N', Math.max(1, n)))}
                                                            readOnly={bloquearN}
                                                            className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${bloquearN ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                          />
                                                        </div>
                                                      )}
                                                      <div className="w-[90px] shrink-0">
                                                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">%</label>
                                                        <input
                                                          type="text"
                                                          inputMode="decimal"
                                                          placeholder="1"
                                                          value={draftCalc[`${row.key}|${idx}|empol`] ?? (empolVal === 0 ? '0' : (empolVal === 1 ? '1' : String(empolVal)))}
                                                          onChange={e => setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|empol`]: e.target.value }))}
                                                          onBlur={e => handleCalcBlur(`${row.key}|${idx}|empol`, draftCalc[`${row.key}|${idx}|empol`] ?? e.target.value, (n) => updateLinhaMedicao(row.key, idx, 'empolamento', Math.max(0, n)))}
                                                          className="w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500"
                                                        />
                                                      </div>
                                                      {mostrarA && (
                                                        <div className="w-[90px] shrink-0">
                                                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">A</label>
                                                          {!temDimensoes ? (
                                                            <input
                                                              type="text"
                                                              inputMode="decimal"
                                                              placeholder="0"
                                                              value={draftCalc[`${row.key}|${idx}|A`] ?? (ln.valorManual == null || ln.valorManual === 0 ? '' : String(ln.valorManual))}
                                                              onChange={e => !ehCargaEntulho && setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|A`]: e.target.value }))}
                                                              onBlur={e => !ehCargaEntulho && handleCalcBlur(`${row.key}|${idx}|A`, draftCalc[`${row.key}|${idx}|A`] ?? e.target.value, n => updateLinhaMedicao(row.key, idx, 'valorManual', n))}
                                                              readOnly={ehCargaEntulho}
                                                              className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                            />
                                                          ) : (
                                                            <div className={`h-9 px-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-end ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45' : 'bg-white dark:bg-gray-800'}`}>
                                                              {valorA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                            </div>
                                                          )}
                                                        </div>
                                                      )}
                                                      {mostrarV && (
                                                        <div className="w-[90px] shrink-0">
                                                          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">V</label>
                                                          {!temDimensoes ? (
                                                            <input
                                                              type="text"
                                                              inputMode="decimal"
                                                              placeholder="0"
                                                              value={draftCalc[`${row.key}|${idx}|V`] ?? (ln.valorManual == null || ln.valorManual === 0 ? '' : String(ln.valorManual))}
                                                              onChange={e => !ehCargaEntulho && setDraftCalc(p => ({ ...p, [`${row.key}|${idx}|V`]: e.target.value }))}
                                                              onBlur={e => !ehCargaEntulho && handleCalcBlur(`${row.key}|${idx}|V`, draftCalc[`${row.key}|${idx}|V`] ?? e.target.value, n => updateLinhaMedicao(row.key, idx, 'valorManual', n))}
                                                              readOnly={ehCargaEntulho}
                                                              className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
                                                            />
                                                          ) : (
                                                            <div className={`h-9 px-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-end ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45' : 'bg-white dark:bg-gray-800'}`}>
                                                              {valorV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                            </div>
                                                          )}
                                                        </div>
                                                      )}
                                                      <div className="w-[110px] shrink-0">
                                                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">Subtotal</label>
                                                        <div className="h-9 px-2 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-sm font-semibold text-red-700 dark:text-red-300 flex items-center justify-end">
                                                          {valorSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                                        </div>
                                                      </div>
                                                      {!ehCargaEntulho && (
                                                        <div className="w-[34px] shrink-0">
                                                          <label className="text-[11px] font-medium text-transparent block mb-1">.</label>
                                                          <button
                                                            type="button"
                                                            onClick={() => removeLinhaMedicao(row.key, idx)}
                                                            className="h-9 w-9 flex items-center justify-center shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                                                            title="Remover linha"
                                                          >
                                                            <Trash2 className="w-4 h-4" />
                                                          </button>
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })()}
                                                </>
                                              );

                                              if (!ehCargaEntulho) {
                                                return (
                                                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/60 p-4 space-y-3">
                                                    {dim.linhas.map((ln, idx) => (
                                                      <div key={idx} className={idx > 0 ? 'pt-3 border-t border-gray-200 dark:border-gray-700' : ''}>
                                                        {renderLinhaCampos(ln, idx)}
                                                      </div>
                                                    ))}
                                                    <div className="pt-1">
                                                      <button
                                                        type="button"
                                                        onClick={() => addLinhaMedicao(row.key)}
                                                        className="inline-flex items-center gap-2 h-8 px-3 text-sm font-medium border border-dashed border-gray-400 dark:border-gray-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                                                      >
                                                        <Plus className="w-4 h-4" /> Adicionar linha
                                                      </button>
                                                    </div>
                                                  </div>
                                                );
                                              }

                                              const grupos = new Map<string, { ln: LinhaMedicao; idx: number }[]>();
                                              dim.linhas.forEach((ln, idx) => {
                                                const titulo = `${ln.origemComposicaoDescricao || row.item.descricao || ''}`.trim().slice(0, 120) || `Linha ${idx + 1}`;
                                                const lista = grupos.get(titulo) || [];
                                                lista.push({ ln, idx });
                                                grupos.set(titulo, lista);
                                              });

                                              return Array.from(grupos.entries()).map(([titulo, linhas]) => (
                                                <div key={titulo} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/60 p-4 space-y-3">
                                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{titulo}</div>
                                                  <div className="space-y-3">
                                                    {linhas.map(({ ln, idx }, i) => (
                                                      <div key={idx} className={i > 0 ? 'pt-3 border-t border-gray-200 dark:border-gray-700' : ''}>
                                                        {renderLinhaCampos(ln, idx)}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              ));
                                            })()}
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                    )}
                                    </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {(() => {
                              const itensRemovidos = bloco.itens.filter(i => itensOcultosNoOrcamento.has(`${bloco.key}|${i.chave}`));
                              if (itensRemovidos.length === 0) return null;
                              return (
                                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Itens removidos — clique para restaurar:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {itensRemovidos.map(i => {
                                      const itemKey = `${bloco.key}|${i.chave}`;
                                      return (
                                        <button
                                          key={itemKey}
                                          type="button"
                                          onClick={() => restaurarItemNoOrcamento(itemKey)}
                                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-dashed border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400 hover:border-green-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                          title={`Restaurar: ${i.codigo} ${i.banco}`}
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                          {i.codigo} {i.banco}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
                      <div className="flex items-center justify-center px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase text-center leading-tight">
                          Fechamento financeiro
                        </h4>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {[
                              ['TOTAL', resumoFinanceiro.totalBase],
                              [`DESCONTO (${(resumoFinanceiro.descontoPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`, resumoFinanceiro.valorDesconto],
                              ['TOTAL COM DESCONTO', resumoFinanceiro.totalComDesconto],
                              [`TOTAL GERAL COM DESCONTO E BDI (${(resumoFinanceiro.bdiPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`, resumoFinanceiro.totalComDescontoEBdi],
                              [`1º REAJUSTE IPCA (${(resumoFinanceiro.ipca1Pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`, resumoFinanceiro.reajuste1],
                              [`2º REAJUSTE IPCA (${(resumoFinanceiro.ipca2Pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`, resumoFinanceiro.reajuste2],
                              [`3º REAJUSTE IPCA (${(resumoFinanceiro.ipca3Pct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`, resumoFinanceiro.reajuste3]
                            ].map(([label, value], idx) => (
                              <tr key={String(label)} className={`${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/40 dark:bg-gray-800/60'} hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors`}>
                                <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">{label}</td>
                                <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  R$ {Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/60 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">Valor final</span>
                        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          R$ {resumoFinanceiro.reajuste3.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={salvarOrcamento}
                        disabled={salvandoOrcamento || !centroCustoId || !orcamentoAtivoId}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none font-medium transition-colors"
                        title="Grava o orçamento em montagem (itens, quantidades e medições) no servidor"
                      >
                        {salvandoOrcamento ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        Salvar orçamento
                      </button>
                      <button
                        type="button"
                        onClick={exportarOrcamentoDetalhado}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium transition-colors"
                        title="Exporta o orçamento"
                      >
                        <FileSpreadsheet className="w-5 h-5" />
                        Exportar Orçamento
                      </button>
                      <button
                        type="button"
                        onClick={exportarMemoriaCalculo}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium transition-colors"
                        title="Exporta o memorial de cálculo"
                      >
                        <FileText className="w-5 h-5" />
                        Exportar Memorial
                      </button>
                    </div>

                  </>
                )}
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
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Código</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Banco</th>
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
                            <td className="px-4 py-2 text-sm">{c.codigo}</td>
                            <td className="px-4 py-2 text-sm">{c.banco}</td>
                            <td className="px-4 py-2 text-sm">{c.chave}</td>
                            <td className="px-4 py-2 text-sm max-w-xs truncate">{c.descricao}</td>
                            <td className="px-4 py-2 text-sm text-center">{c.unidade || '—'}</td>
                            <td className="px-4 py-2 text-sm text-right">
                              R$ {(c.maoDeObraUnitario ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-sm text-right">
                              R$ {(c.materialUnitario ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-2 text-sm text-right">
                              R$ {c.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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

          {/* Tab: Serviços Padrão */}
          {activeTab === 'servicos' && (
            !centroCustoId ? (
              <Card><CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">Selecione um contrato acima para importar o orçamento perfeito.</CardContent></Card>
            ) : !orcamentoAtivoId ? (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Serviços padrão (contrato)</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Não precisa criar um orçamento: importe o orçamento perfeito e a estrutura ficará disponível para todos os orçamentos deste contrato.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors">
                    {isImportandoOrcamento ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                    <span>{isImportandoOrcamento ? 'Importando...' : 'Importar orçamento perfeito'}</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleImportOrcamentoPerfeito}
                      disabled={isImportandoOrcamento}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Para editar serviços um a um ou ver o detalhamento, abra um orçamento na aba Novo Orçamento.
                  </p>
                </CardContent>
              </Card>
            ) : (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Serviços padrão</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      A estrutura de serviços é <strong className="font-semibold text-gray-800 dark:text-gray-200">única para este contrato</strong>: importe uma vez e todos os orçamentos passam a usar a mesma lista. Estrutura: Serviço › Subtítulos › Itens
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer transition-colors">
                      {isImportandoOrcamento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{isImportandoOrcamento ? 'Importando...' : 'Importar orçamento perfeito'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleImportOrcamentoPerfeito}
                        className="hidden"
                      />
                    </label>
                    {!showAddServico ? (
                      <button
                        onClick={() => setShowAddServico(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <Plus className="w-4 h-4" />
                        Novo serviço
                      </button>
                    ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nome do serviço"
                        value={novoServicoNome}
                        onChange={e => setNovoServicoNome(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                      <button onClick={addServico} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setShowAddServico(false); setNovoServicoNome(''); }} className="p-2 bg-gray-300 dark:bg-gray-600 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    )}
                  </div>
                </div>
                <div className="px-6 pb-5 -mt-1 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Alterações aqui valem para <strong className="text-gray-700 dark:text-gray-300">todos os orçamentos</strong> deste contrato. Cada orçamento mantém só a montagem (quantidades e itens na aba Novo Orçamento).
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {servicos.map(svc => {
                  const expandido = servicosExpandidos.has(svc.id);
                  const totalItens = svc.subtitulos.reduce((acc, sub) => acc + sub.itens.length, 0);
                  return (
                    <div key={svc.id} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 cursor-pointer"
                        onClick={() =>
                          setServicosExpandidos(prev => {
                            const next = new Set(prev);
                            if (next.has(svc.id)) next.delete(svc.id);
                            else next.add(svc.id);
                            return next;
                          })
                        }
                      >
                        <div className="flex items-center gap-2">
                          {expandido ? (
                            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                          )}
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 uppercase">{svc.nome}</h3>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({svc.subtitulos.length} subtítulos, {totalItens} itens)
                          </span>
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            removeServico(svc.id);
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/40 rounded"
                          title="Excluir serviço"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {expandido && (
                        <div className="border-t border-gray-200 dark:border-gray-700">
                          {svc.subtitulos.map(sub => (
                            <div key={sub.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                              <div className="px-6 py-3 bg-gray-100 dark:bg-gray-800/50">
                                <p className="font-medium text-gray-800 dark:text-gray-200">{sub.nome}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {sub.itens.length} itens
                                </p>
                              </div>
                              <div className="px-6 py-2 space-y-1">
                                {sub.itens.map((i, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between py-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700"
                                  >
                                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                                      {i.codigo} {i.banco} — {i.descricao}
                                    </span>
                                    <button
                                      onClick={() => removeItemFromServico(svc.id, sub.id, i.chave)}
                                      className="ml-2 p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex-shrink-0"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900/30">
                                <select
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (!val) return;
                                    const [codigo, banco] = val.split('|');
                                    const item = composicoes.find(c => c.codigo === codigo && c.banco === banco);
                                    if (item) addItemToServico(svc.id, sub.id, item);
                                    e.target.value = '';
                                  }}
                                  className="text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                                >
                                  <option value="">+ Adicionar item das composições</option>
                                  {composicoes
                                    .filter(c => !sub.itens.some(i => i.chave === (c.chave || normalizarChave(c.codigo, c.banco))))
                                    .map((c, i) => (
                                      <option key={i} value={`${c.codigo}|${c.banco}`}>
                                        {c.codigo} {c.banco} — {c.descricao.slice(0, 50)}...
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            )
          )}
        </div>
      </MainLayout>
      <Modal
        isOpen={analiticoModalOpen}
        onClose={() => setAnaliticoModalOpen(false)}
        title={analiticoModalInfo ? `Analítico da Composição: ${analiticoModalInfo.codigo} (${analiticoModalInfo.banco})` : 'Analítico da Composição'}
        size="lg"
        closeOnOverlayClick
      >
        {analiticoModalInfo && analiticoModalData ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div className="font-medium text-gray-800 dark:text-gray-200">{analiticoModalInfo.descricao}</div>
              <div>
                Custo Direto (Preço Unitário CPU): R${' '}
                {Number(analiticoModalData.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Categoria</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Un.</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24">Qtd.</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-32">Preço Unit.</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-36">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {analiticoModalData.linhas.map((l, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{l.categoria}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{l.descricao}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{l.unidade}</td>
                      <td className="px-4 py-2 text-right text-sm text-gray-700 dark:text-gray-300">
                        {l.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-gray-700 dark:text-gray-300">
                        R$ {l.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                        R$ {l.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3 text-sm">
              <span className="text-gray-600 dark:text-gray-400">Total</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                R$ {analiticoModalData.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">Carregando analítico...</div>
        )}
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
