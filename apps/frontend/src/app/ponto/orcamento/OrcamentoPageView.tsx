'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, startTransition, memo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
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
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
  FileDown,
  Download,
  CheckCircle,
  CheckCircle2,
  FileText,
  Table2,
  ClipboardList,
  Pencil,
  ListPlus,
  MoreVertical,
  Eye,
  ChevronLeft,
  ChevronRight,
  DownloadCloud,
  Calendar,
  CalendarCheck,
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import api from '@/lib/api';
import { FichaDemandaApprovalFormModal } from '@/components/engenharia/FichaDemandaApprovalFormModal';
import {
  currencyDigitsToFormatted,
  formatCurrencyInput,
  formToApiPayload,
  type FichaDemandaApprovalFormState,
  type PoloFd,
} from '@/lib/fichaDemandaApproval';
import {
  loadOrcafascioOrcamentosList,
  peekOrcafascioOrcamentosCache,
  prefetchOrcafascioOrcamentosList,
} from '@/lib/orcafascioOrcamentosCache';
import {
  hydrateOrcamentoDetailCache,
  invalidateOrcamentoDetailCache,
  loadOrcamentoDetailCached,
  peekOrcamentoDetailCache,
  prefetchOrcamentoDetail,
  seedOrcamentoDetailCache,
} from '@/lib/orcamentoDetailCache';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { Modal } from '@/components/ui/Modal';
import { AppModalTabButton } from '@/components/ui/AppTabButton';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { formatCadastroListId } from '@/components/ui/CadastroListSummary';
import { Checkbox, TableCheckbox } from '@/components/ui/Checkbox';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { OrcamentoMedicaoPainel } from './OrcamentoMedicaoPainel';
import { OrcamentoCronogramaPainel } from './OrcamentoCronogramaPainel';
import { TabelaJanelaSpacer, useOrcamentoTabelaJanela } from './useOrcamentoTabelaJanela';
import {
  calcularDataFimOrcamento,
  calcularStatusCronograma,
  CRONOGRAMA_STATUS_LABEL,
  cronogramaVazio,
  diasEntre,
  formatDataBr,
  normalizarCronograma,
  type CronogramaLinhaServico,
  type CronogramaLinhaSubtitulo,
  type CronogramaPersist
} from './orcamentoCronogramaTypes';
import { calcularResumoCronograma, montarLinhasTimeline } from './orcamentoCronogramaCalc';
import {
  gradeTableCls,
  gradeTituloSubtituloRowTrCls,
  gradeTableRowTrCls,
  inputGradeCls,
  inputGradeMoedaCls,
  moedaGradeFieldWrapperCls,
  selectGradeSemSetaCls,
  tdPlanilhaTipoCls,
  planilhaTipoVazioCls
} from './orcamentoGradeCellClasses';
import {
  calcV,
  calcularQuantidadeLinha,
  calcularQuantidadeContagem,
  inferirTipoUnidadePorDimensao
} from './orcamentoMedicaoCalc';
import type { LinhaMedicao, LinhaContagem, DimensoesItem, TipoUnidadeFormula } from './orcamentoMedicaoTypes';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
export type { LinhaMedicao, TipoUnidadeFormula, DimensoesItem } from './orcamentoMedicaoTypes';

export type OrcamentoPageProps = {
  /** Centro de custo fixo (ex.: página dentro do contrato). */
  lockedCostCenterId?: string | null;
  /** Contrato para permissão `ProtectedRoute` e link “voltar”. */
  embeddedContractId?: string | null;
  /** Nome do contrato (breadcrumb / título quando a lista está aberta). */
  embeddedContractName?: string | null;
  /** Id do orçamento na URL (`/contratos/:id/orcamento/:orcamentoId`); lista quando omitido. */
  embeddedOrcamentoIdFromRoute?: string | null;
  /** Só a aba Cronograma (página dedicada `/ponto/cronogramas/...`). */
  cronogramaOnly?: boolean;
};

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
  codigo?: string;
  banco?: string;
  tipoLabel?: string;
}

export interface AnaliticoComposicao {
  total: number;
  linhas: LinhaAnaliticoComposicao[];
}

// ─── Tipos da API Orçafascio ──────────────────────────────────────────────────

export interface OrcafascioComposicaoListItem {
  id: string;
  code: string;
  second_code: string | null;
  description: string;
  type: string;
  unit: string;
  is_sicro: boolean;
  created_at: string;
  /** Preenchido quando a listagem vem do modo «todas as bases». */
  __orcafascio_base?: string;
}

export interface OrcafascioComposicaoItem {
  banco: string;
  code: string;
  description: string;
  type: string;
  unit: string;
  unitary_pnd: number;
  unitary_pd: number;
  coefficient: number;
  pnd: number;
  pd: number;
  is_resource: boolean;
}

export interface OrcafascioComposicaoDetalhe {
  id: string;
  code: string;
  second_code: string | null;
  description: string;
  /** Base de referência da composição (ex.: SINAPI, ORSE, SEINFRA). */
  base?: string;
  type: string;
  unit: string;
  is_sicro: boolean;
  labor: boolean;
  calculation_method: { type: number; description: string };
  prices: { pnd: number; pd: number };
  items: OrcafascioComposicaoItem[];
  created_at: string;
}

export interface OrcafascioOrcamentoItem {
  id: string;
  description?: string;
  code?: string;
  created_at?: string;
  updated_at?: string;
  department_id?: string;
  company_id?: string;
  [key: string]: unknown;
}

export interface OrcafascioOrcamentosResponse {
  budgets: OrcafascioOrcamentoItem[];
  total?: number;
  current_page?: number;
  per_page?: number;
}

/**
 * Orçafascio às vezes devolve entidades HTML literais (`&quot;`, `&#34;`, etc.).
 * Decodifica para exibição/persistência sem interpretar markup.
 */
function decodificarEntidadesHtml(raw: string): string {
  if (!raw || raw.indexOf('&') === -1) return raw;
  if (!/&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/.test(raw)) return raw;
  return raw
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0*34;/g, '"')
    .replace(/&#x0*22;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => {
      const code = Number(n);
      if (!Number.isFinite(code) || code <= 0) return _m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _m;
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/gi, (_m, h: string) => {
      const code = parseInt(h, 16);
      if (!Number.isFinite(code) || code <= 0) return _m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return _m;
      }
    })
    .replace(/&amp;/gi, '&');
}

/** Descrição em linhas de relatório Orçafascio (`descr` vs `desc` conforme endpoint). */
function textoDescricaoOrcafascio(row: Record<string, unknown>): string {
  const raw =
    row.descr ??
    row.Descr ??
    row.desc ??
    row.text ??
    row.Text ??
    row.label ??
    row.description ??
    row.Description ??
    row.descricao ??
    row.Descricao ??
    row.note ??
    row.name ??
    '';
  if (raw == null) return '';
  const text = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  return text ? decodificarEntidadesHtml(text) : '';
}

/** Converte texto numérico da API (BR ou float) ou número para um valor finito ou null */
function valorNumericoOrcafascio(val: unknown): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return null;
  if (typeof val === 'string') {
    const t = val.trim().replace(/\s+/g, '');
    if (!t) return null;
    if (/^-?\d+([.,]\d+)?$/.test(t)) {
      let s = t;
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma !== -1 && lastDot !== -1) {
        const decSep = lastComma > lastDot ? ',' : '.';
        if (decSep === ',') s = s.replace(/\./g, '').replace(',', '.');
      } else if (lastComma !== -1 && /^-?\d{1,3}(\.\d{3})*,\d+$/.test(s.replace(/^-/, ''))) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (/^-?\d+,\d{2}$/.test(s)) {
        s = s.replace(',', '.');
      }
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Primeiro campo numérico não nulo dentro de objeto (exceto só zeros se houver outros) */
function extrairValorDeObjPrecos(obj: Record<string, unknown>): number | null {
  const prefs = [
    'plus_bdi',
    'Plus_bdi',
    'plus_bi',
    'price_plus_bdi',
    'with_bdi',
    'unit_price_with_bdi',
    'without_bdi',
    'without',
    'bdi',
    'unit_price',
    'pd',
    'pnd',
    'valor',
    'value',
    'total',
  ];
  let bestNonZero: number | null = null;
  let bestZero: number | null = null;
  for (const k of prefs) {
    if (!(k in obj)) continue;
    const n = valorNumericoOrcafascio(obj[k]);
    if (n == null || !Number.isFinite(n)) continue;
    if (n !== 0) {
      bestNonZero = n;
      break;
    }
    if (bestZero === null) bestZero = n;
  }
  if (bestNonZero != null) return bestNonZero;
  if (bestZero !== null && bestZero === 0) {
    // Varre o restante (nomes diferentes na API)
    for (const [, v] of Object.entries(obj)) {
      const n =
        typeof v === 'object' && v !== null && !Array.isArray(v)
          ? extrairValorDeObjPrecos(v as Record<string, unknown>)
          : valorNumericoOrcafascio(v);
      if (n != null && n !== 0) return n;
    }
  }
  return bestZero;
}

/** Preço unitário visível na aba analítica (prioriza valores != 0 dentro de prices). */
function precoOrcafascioAnalitico(row: Record<string, unknown>): number | null {
  const direto =
    valorNumericoOrcafascio(row.unit_price_with_bdi) ??
    valorNumericoOrcafascio(row.unit_price) ??
    valorNumericoOrcafascio(row.price) ??
    valorNumericoOrcafascio(row.total_price);
  if (direto != null && direto !== 0) return direto;
  const p = row.prices;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const n = extrairValorDeObjPrecos(p as Record<string, unknown>);
    if (n != null) return n;
  }
  if (direto != null) return direto;
  return valorNumericoOrcafascio(row.total_price);
}

/** Split Mão de obra / Material em preços do Orçafascio (sintético ou analítico). */
function precosMoMatDeLinhaOrcafascio(row: Record<string, unknown>): {
  mo: number | null;
  mat: number | null;
} {
  const p =
    row.prices && typeof row.prices === 'object' && !Array.isArray(row.prices)
      ? (row.prices as Record<string, unknown>)
      : null;
  const mo =
    valorNumericoOrcafascio(p?.type_mdo) ??
    valorNumericoOrcafascio(p?.mdo) ??
    valorNumericoOrcafascio(p?.labor) ??
    valorNumericoOrcafascio(row.type_mdo) ??
    valorNumericoOrcafascio(row.mdo_price) ??
    valorNumericoOrcafascio(row.labor_price);
  const mat =
    valorNumericoOrcafascio(p?.type_mat) ??
    valorNumericoOrcafascio(p?.mat) ??
    valorNumericoOrcafascio(p?.material) ??
    valorNumericoOrcafascio(row.type_mat) ??
    valorNumericoOrcafascio(row.mat_price) ??
    valorNumericoOrcafascio(row.material_price);
  return { mo, mat };
}

function linhaEhMaoDeObraOrcafascio(row: Record<string, unknown>): boolean {
  if (row.mdo === true || row.labor === true) return true;
  const kind = String(row.kind ?? row.type ?? '').toLowerCase();
  if (kind.includes('labor') || kind.includes('mao') || kind.includes('mão')) return true;
  return false;
}

/** Preenche MO/MAT a partir do analítico gravado na linha (orçamentos já importados). */
function moMatUnitarioDeItemOuComposicao(
  item: {
    maoDeObraUnitario?: number;
    materialUnitario?: number;
    precoUnitario?: number;
    descricao?: string;
    analiticoLinhas?: LinhaAnaliticoComposicao[];
  },
  composicao: ComposicaoItem | null | undefined
): { mo: number; mat: number } {
  let mo = Number(item.maoDeObraUnitario ?? composicao?.maoDeObraUnitario ?? 0) || 0;
  let mat = Number(item.materialUnitario ?? composicao?.materialUnitario ?? 0) || 0;
  const linhas =
    item.analiticoLinhas && item.analiticoLinhas.length > 0
      ? item.analiticoLinhas
      : composicao?.analiticoLinhas;
  if (linhas && linhas.length > 0) {
    if (!(mo > 0)) {
      mo = linhas
        .filter((l) => l.categoria === 'MÃO DE OBRA')
        .reduce((s, l) => s + (Number(l.total) || 0), 0);
    }
    if (!(mat > 0)) {
      mat = linhas
        .filter((l) => l.categoria === 'MATERIAL')
        .reduce((s, l) => s + (Number(l.total) || 0), 0);
    }
  }
  const preco = Number(item.precoUnitario ?? composicao?.precoUnitario ?? 0) || 0;
  // Composição só de mão de obra: o preço unitário inteiro cai em MO.
  if (!(mo > 0) && !(mat > 0) && preco > 0 && linhas && linhas.length > 0) {
    const soMo = linhas.every((l) => l.categoria === 'MÃO DE OBRA');
    if (soMo) mo = preco;
  }
  // Orçamentos já importados só com preço total (sem split): mão de obra típica de planilha.
  if (!(mo > 0) && !(mat > 0) && preco > 0) {
    const desc = `${item.descricao ?? ''} ${composicao?.descricao ?? ''}`.toUpperCase();
    if (
      /ENGENHEIRO|ARQUITETO|MESTRE|ENCARREGADO|T[ÉE]CNICO|ALMOXARIFE|APONTADOR|APROPRIADOR|PEDREIRO|SERVENTE|AUXILIAR|OPERADOR|MOTORISTA|VIGIA|PORTEIRO|ENCARGOS/.test(
        desc
      )
    ) {
      mo = preco;
    }
  }
  return { mo: mo > 0 ? mo : 0, mat: mat > 0 ? mat : 0 };
}

/** Id enviado aos endpoints /orcamentos/:id (lista pode trazer só `_id` ou `budget_id`). */
function idOrcamentoOrcafascioParaApi(item: OrcafascioOrcamentoItem): string {
  const o = item as Record<string, unknown>;
  const raw = item.id ?? o._id ?? o.budget_id;
  return raw != null ? String(raw).trim() : '';
}

/** Código para buscar a composição no catálogo a partir de uma linha sintético/analítico do orçamento. */
function codigoCatalogoLinhaOrcamentoOrcafascio(row: Record<string, unknown>): string | null {
  const raw =
    row.code ??
    row.Code ??
    row.composition_code ??
    row.Composition_code ??
    row.reference_code ??
    row.catalog_code ??
    row.service_code ??
    row.composition_number ??
    row.codigo ??
    row.Código ??
    row.Codigo ??
    row.number ??
    row.numero ??
    row.second_code ??
    row.secondCode;
  const code = raw != null ? String(raw).trim() : '';
  if (!code || code === '—') return null;
  const kind = String(row.kind ?? row.type ?? '').toLowerCase();
  if (kind && /^(group|chapter|divider|titulo|etapa|cabeça|cabeca|stage)$/.test(kind)) return null;
  return code;
}

function variantesCodigoOrcafascio(code: string): string[] {
  const base = String(code ?? '').trim();
  if (!base) return [];
  const out: string[] = [];
  const add = (v?: string | null) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t || out.includes(t)) return;
    out.push(t);
  };
  const semPrefixo = base.replace(/^(os|orc|orcamento|orçamento)\s+/i, '');
  const semEspacos = semPrefixo.replace(/\s+/g, '');
  const apenasDigitos = semPrefixo.replace(/[^\d]/g, '');
  add(base);
  add(semPrefixo);
  add(semEspacos);
  if (apenasDigitos.length >= 5) {
    add(apenasDigitos);
    const semZeros = apenasDigitos.replace(/^0+/, '') || '0';
    if (semZeros !== apenasDigitos) add(semZeros);
  }
  return out;
}

function normalizarCodigoOrcamentoMatchNorm(raw: string): string {
  return String(raw ?? '').replace(/[^\dA-Za-z]/g, '').toLowerCase();
}

/** Código na linha do analítico (campos variam por endpoint). */
function codigoLinhaRelatorioAnaliticoOrcamento(aa: Record<string, unknown>): string {
  const raw =
    aa.code ??
    aa.Code ??
    aa.composition_code ??
    aa.service_code ??
    aa.reference_code ??
    aa.catalog_code ??
    aa.composition_number ??
    aa.codigo ??
    aa.number ??
    aa.numero;
  return raw != null ? String(raw).trim() : '';
}

/**
 * Cruza linha do sintético com o analítico do orçamento fixo.
 * Trata: build_item_id, zeros à esquerda no código, base vazia no analítico vs base preenchida no sintético.
 */
function encontrarLinhaAnaliticoParaComposicaoOrcamentoFixo(
  row: Record<string, unknown>,
  analitico: Record<string, unknown>[]
): Record<string, unknown> | undefined {
  const lista = analitico?.length ? analitico : [];
  const code = codigoCatalogoLinhaOrcamentoOrcafascio(row) ?? '';
  const buildItemIdRaw = row.build_item_id != null ? String(row.build_item_id).trim() : '';
  const rowBase = String(row.base ?? '').trim().toLowerCase();

  const variantesBuildItemId = (() => {
    const raw = String(buildItemIdRaw || '').trim();
    if (!raw) return [] as string[];
    const out = new Set<string>();
    out.add(raw);
    out.add(raw.replace(/[^\d]/g, ''));
    out.add(raw.replace(/\.0+$/, ''));
    return Array.from(out).filter(Boolean);
  })();

  const variantesCode = variantesCodigoOrcafascio(code);
  const codeNormSet = new Set(
    variantesCode.map((v) => normalizarCodigoOrcamentoMatchNorm(v)).filter(Boolean)
  );

  if (buildItemIdRaw) {
    const porId = lista.find((a) => {
      const aa = a as Record<string, unknown>;
      const candidatos = [aa.id, aa.build_item_id, aa.buildId, aa.build_id, aa.item_id, aa.itemId]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean);
      if (candidatos.length === 0) return false;
      return candidatos.some((cand) => {
        const candDigits = cand.replace(/[^\d]/g, '');
        return variantesBuildItemId.some((v) => v === cand || (Boolean(candDigits) && v === candDigits));
      });
    });
    if (porId) return porId as Record<string, unknown>;
  }

  if (codeNormSet.size === 0) return undefined;

  const candidatos = lista.filter((a) => {
    const aCodeNorm = normalizarCodigoOrcamentoMatchNorm(codigoLinhaRelatorioAnaliticoOrcamento(a as Record<string, unknown>));
    return !!aCodeNorm && codeNormSet.has(aCodeNorm);
  });

  if (candidatos.length === 0) return undefined;

  if (rowBase) {
    const mesmoBase = candidatos.filter((a) => {
      const aBase = String((a as Record<string, unknown>).base ?? '').trim().toLowerCase();
      return aBase === rowBase;
    });
    if (mesmoBase.length > 0) return mesmoBase[0] as Record<string, unknown>;

    const baseAnaliticoVazia = candidatos.filter((a) => {
      const aBase = String((a as Record<string, unknown>).base ?? '').trim().toLowerCase();
      return !aBase;
    });
    if (baseAnaliticoVazia.length > 0) return baseAnaliticoVazia[0] as Record<string, unknown>;
  }

  // Fallback por descrição quando o código existe em mais de uma base/linha.
  const rowDesc = normalizarTextoBusca(textoDescricaoOrcafascio(row));
  if (rowDesc) {
    const porDescricao = candidatos.filter((a) => {
      const desc = normalizarTextoBusca(textoDescricaoOrcafascio(a as Record<string, unknown>));
      return !!desc && (desc === rowDesc || desc.includes(rowDesc) || rowDesc.includes(desc));
    });
    if (porDescricao.length === 1) return porDescricao[0] as Record<string, unknown>;
  }

  if (candidatos.length === 1) return candidatos[0] as Record<string, unknown>;

  return undefined;
}

/** Todas as listas de linhas no mesmo objeto (espelha o backend `coletarArraysRelatorio`). */
function colecionarArraysOrcamentoNoObjeto(o: Record<string, unknown>): Record<string, unknown>[] {
  const chaves = [
    'records',
    'items',
    'rows',
    'list',
    'compositions',
    'services',
    'budget_items',
    'budget_items_services',
    'budget_lines',
    'synthetic',
    'lines',
    'budget_services',
    'analytical',
    'analytical_with_unit_price',
    'results',
    'children',
    'chapters',
    'works',
  ];
  const out: Record<string, unknown>[] = [];
  for (const k of chaves) {
    const v = o[k];
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first))
      out.push(...(v as Record<string, unknown>[]));
  }
  return out;
}

/** Primeira lista de objetos “linha de orçamento” dentro de payloads aninhados da API Orçafascio */
function extrairPrimeiroArrayOrcamento(body: unknown, depth = 0): Record<string, unknown>[] {
  if (body == null || depth > 8) return [];
  if (Array.isArray(body)) {
    return body.filter(x => x !== null && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[];
  }
  if (typeof body !== 'object') return [];
  const o = body as Record<string, unknown>;

  const mergedTop = colecionarArraysOrcamentoNoObjeto(o);
  if (mergedTop.length > 0) return mergedTop;

  const nestedData = o.data;
  if (nestedData !== undefined && nestedData !== null) {
    const inner = extrairPrimeiroArrayOrcamento(nestedData, depth + 1);
    if (inner.length > 0) return inner;
  }
  for (const v of Object.values(o)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const inner = extrairPrimeiroArrayOrcamento(v, depth + 1);
      if (inner.length > 0) return inner;
    }
  }
  let best: Record<string, unknown>[] = [];
  for (const v of Object.values(o)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first) && v.length > best.length) {
      best = v as Record<string, unknown>[];
    }
  }
  return best;
}

/** Lista vinda dos endpoints sintético/analítico ou do detalhe (array ou objeto envelopado). */
function normalizarListaApiOrcamento(body: unknown): Record<string, unknown>[] {
  return extrairPrimeiroArrayOrcamento(body);
}

function textoItemizacaoOrcafascio(row: Record<string, unknown>): string {
  const raw = row.itemization ?? row.original_itemization ?? row.order ?? row.sequence;
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

function textoKindOrcafascio(row: Record<string, unknown>): string {
  const raw = row.kind ?? row.type ?? row.category;
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

function textoVersaoBaseOrcafascio(row: Record<string, unknown>): string {
  const raw = row.base_version ?? row.version ?? row.versoin;
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

/** Filhos da composição no JSON analítico: objeto ou array (API variável). */
function colecionarObjetosSubitensAnaliticoOrcamento(row: Record<string, unknown>): Record<string, unknown>[] {
  const chaves = [
    'subitems',
    'sub_items',
    'items',
    'children',
    'insumos',
    'resources',
    'inputs',
    'components',
    'composition_items',
    'compositionItems',
  ] as const;
  for (const key of chaves) {
    const sub = row[key];
    if (sub == null) continue;
    if (Array.isArray(sub)) {
      const objs = sub.filter(
        (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
      ) as Record<string, unknown>[];
      if (objs.length > 0) return objs;
      continue;
    }
    if (typeof sub === 'object') {
      const objs = Object.values(sub as Record<string, unknown>).filter(
        (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
      ) as Record<string, unknown>[];
      if (objs.length > 0) return objs;
    }
  }
  // Às vezes o analítico aninha a composição em `composition` / `composicao`.
  for (const nestKey of ['composition', 'composicao', 'detail', 'detalhe'] as const) {
    const nested = row[nestKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const fromNested = colecionarObjetosSubitensAnaliticoOrcamento(nested as Record<string, unknown>);
      if (fromNested.length > 0) return fromNested;
    }
  }
  return [];
}

function detalheCatalogoAPartirAnaliticoOrcamento(row: Record<string, unknown>): OrcafascioComposicaoDetalhe {
  const itemsRaw = colecionarObjetosSubitensAnaliticoOrcamento(row);
  const items = itemsRaw.map((it) => {
    const s = it as Record<string, unknown>;
    const prices =
      s.prices && typeof s.prices === 'object' && !Array.isArray(s.prices)
        ? (s.prices as Record<string, unknown>)
        : {};
    const qty = valorNumericoOrcafascio(s.qty ?? s.coefficient ?? s.quantity) ?? 0;
    const unitary =
      valorNumericoOrcafascio(
        prices.unitary ?? prices.unit_price ?? prices.pnd ?? s.unitary_pnd ?? s.unit_price
      ) ?? 0;
    const totalLinha =
      valorNumericoOrcafascio(
        prices.plus_ls ?? prices.plus_ls_qty ?? s.pnd ?? s.pd ?? s.total ?? s.total_price
      ) ??
      (unitary > 0 && qty > 0 ? unitary * qty : null) ??
      valorNumericoOrcafascio(prices.type_mdo) ??
      valorNumericoOrcafascio(prices.type_mat) ??
      0;
    const unitaryFinal = unitary > 0 ? unitary : qty > 0 ? totalLinha / qty : totalLinha;
    return {
      banco: String(s.base ?? row.base ?? '—'),
      code: String(s.code ?? '—'),
      description: textoDescricaoOrcafascio(s),
      type: String(s.type ?? ''),
      unit: String(s.unity ?? s.unit ?? '—'),
      unitary_pnd: unitaryFinal,
      unitary_pd: unitaryFinal,
      coefficient: qty,
      pnd: totalLinha,
      pd: totalLinha,
      is_resource: String(s.kind ?? '').toLowerCase() === 'resource',
    };
  });
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? '—'),
    second_code: (row.code_2 as string) ?? null,
    description: textoDescricaoOrcafascio(row),
    base: String(row.base ?? row.base_name ?? row.reference_base ?? '').trim() || undefined,
    type: String(row.type ?? ''),
    unit: String(row.unity ?? row.unit ?? '—'),
    is_sicro: false,
    labor: Boolean(row.mdo) || Boolean(row.labor),
    calculation_method: { type: 0, description: '' },
    prices: { pnd: precoOrcafascioAnalitico(row) ?? 0, pd: precoOrcafascioAnalitico(row) ?? 0 },
    items,
    created_at: '',
  };
}

/** Preferir linhas que tenham código de composição no catálogo; senão manter todas (evita zerar a lista). */
function priorizarLinhasComposicaoDoOrcamento(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length > 0) {
    const comCodigo = rows.filter((r) => !!codigoCatalogoLinhaOrcamentoOrcafascio(r));
    if (comCodigo.length > 0) return comCodigo;
  }
  return rows;
}


/** Formata percentual de meta em pt-BR (ex.: 24.98 → "24,98"). */
function formatPercentualMetaPt(pctPoints: number, maxFrac = 2): string {
  if (!Number.isFinite(pctPoints)) return '0';
  return pctPoints.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

/** Totais da linha sintética Orçafascio (mesma lógica do extrator financeiro). */
function totaisLinhaOrcafascio(row: Record<string, unknown>): {
  semBdi: number | null;
  bdi: number | null;
  comBdi: number | null;
} {
  const plus = valorNumericoOrcafascio(row.total_price_plus_bdi);
  const ofBdi = valorNumericoOrcafascio(row.total_price_of_bdi);
  let bare = valorNumericoOrcafascio(row.total_price);
  if (
    bare != null &&
    plus != null &&
    ofBdi != null &&
    ofBdi > 0 &&
    Math.abs(bare - plus) < 0.01
  ) {
    bare = plus - ofBdi;
  }
  if (bare == null && plus != null && ofBdi != null) bare = plus - ofBdi;
  return {
    semBdi: bare != null && Number.isFinite(bare) ? bare : null,
    bdi: ofBdi != null && Number.isFinite(ofBdi) ? ofBdi : null,
    comBdi: plus != null && Number.isFinite(plus) ? plus : null
  };
}

/**
 * Extrai BDI (%) e totais do sintético Orçafascio.
 * Campos: pct_bdi_applied, total_price, total_price_of_bdi, total_price_plus_bdi.
 */
function extrairMetaFinanceiraOrcafascio(linhas: Record<string, unknown>[]): {
  bdiPercentual: string;
  descontoPercentual: string;
  totalSemBdi: number;
  totalBdi: number;
  totalComBdi: number;
} {
  let totalSemBdi = 0;
  let totalBdi = 0;
  let totalComBdi = 0;

  for (const row of linhas) {
    const kind = String(row.kind ?? row.type ?? '').toLowerCase().trim();
    // Só ignora cabeçalhos explícitos — itens sem código ainda entram no total financeiro.
    if (/^(group|chapter|divider|titulo|etapa|cabeça|cabeca|stage|header|section)$/.test(kind)) {
      continue;
    }

    const plus = valorNumericoOrcafascio(row.total_price_plus_bdi);
    const ofBdi = valorNumericoOrcafascio(row.total_price_of_bdi);
    let bare = valorNumericoOrcafascio(row.total_price);
    const qty = valorNumericoOrcafascio(row.qty ?? row.quantity);

    const temPreco =
      (plus != null && Number.isFinite(plus) && Math.abs(plus) > 0) ||
      (ofBdi != null && Number.isFinite(ofBdi) && Math.abs(ofBdi) > 0) ||
      (bare != null && Number.isFinite(bare) && Math.abs(bare) > 0);
    if (!temPreco) continue;
    // Título sem quantidade e sem código de composição: não soma.
    if (!(qty != null && qty > 0) && !codigoCatalogoLinhaOrcamentoOrcafascio(row) && ehLinhaTituloOrcafascio(row)) {
      continue;
    }

    if (plus != null && Number.isFinite(plus)) totalComBdi += plus;
    if (ofBdi != null && Number.isFinite(ofBdi)) totalBdi += ofBdi;

    if (
      bare != null &&
      plus != null &&
      ofBdi != null &&
      ofBdi > 0 &&
      Math.abs(bare - plus) < 0.01
    ) {
      bare = plus - ofBdi;
    }
    if (bare == null && plus != null && ofBdi != null) bare = plus - ofBdi;
    if (bare != null && Number.isFinite(bare)) totalSemBdi += bare;
  }

  // Fonte da verdade: com BDI e parcela de BDI → orçamento = diferença.
  if (totalComBdi > 0 && totalBdi > 0) {
    totalSemBdi = totalComBdi - totalBdi;
  } else if (totalSemBdi <= 0 && totalComBdi > 0 && totalBdi > 0) {
    totalSemBdi = totalComBdi - totalBdi;
  } else if (totalBdi <= 0 && totalComBdi > totalSemBdi && totalSemBdi > 0) {
    totalBdi = totalComBdi - totalSemBdi;
  } else if (totalComBdi <= 0 && totalSemBdi > 0 && totalBdi > 0) {
    totalComBdi = totalSemBdi + totalBdi;
  }

  // % BDI sempre pela razão dos totais (bate com o Orçafascio); não usa moda de pct por linha.
  const bdiPts =
    totalSemBdi > 0 && totalBdi > 0 ? (totalBdi / totalSemBdi) * 100 : 0;

  return {
    bdiPercentual: formatPercentualMetaPt(bdiPts, 2),
    descontoPercentual: '0',
    totalSemBdi,
    totalBdi,
    totalComBdi,
  };
}

/** Preço unitário sem BDI a partir da linha sintética (preferência sobre price_plus_bdi). */
function precoUnitarioSemBdiOrcafascio(row: Record<string, unknown>): number | null {
  const qty = valorNumericoOrcafascio(row.qty ?? row.quantity);
  const plusUnit = valorNumericoOrcafascio(row.price_plus_bdi);
  const ofBdiUnit = valorNumericoOrcafascio(row.price_of_bdi);
  const bareUnit = valorNumericoOrcafascio(
    row.price ?? row.unit_price ?? row.unitary_price ?? row.unit_price_without_bdi
  );

  const totalPlus = valorNumericoOrcafascio(row.total_price_plus_bdi);
  const totalOfBdi = valorNumericoOrcafascio(row.total_price_of_bdi);
  let totalBare = valorNumericoOrcafascio(row.total_price);
  if (
    totalBare != null &&
    totalPlus != null &&
    totalOfBdi != null &&
    totalOfBdi > 0 &&
    Math.abs(totalBare - totalPlus) < 0.01
  ) {
    totalBare = totalPlus - totalOfBdi;
  }
  if (totalBare == null && totalPlus != null && totalOfBdi != null) {
    totalBare = totalPlus - totalOfBdi;
  }

  if (bareUnit != null && bareUnit > 0) return bareUnit;
  if (qty != null && qty > 0 && totalBare != null && totalBare > 0) return totalBare / qty;
  if (plusUnit != null && ofBdiUnit != null && ofBdiUnit > 0 && plusUnit > ofBdiUnit) {
    return plusUnit - ofBdiUnit;
  }
  if (qty != null && qty > 0 && totalPlus != null && totalOfBdi != null && totalPlus > totalOfBdi) {
    return (totalPlus - totalOfBdi) / qty;
  }

  const pctRaw = valorNumericoOrcafascio(row.pct_bdi_applied ?? row.pct_bdi);
  if (plusUnit != null && plusUnit > 0 && pctRaw != null && pctRaw > 0) {
    const frac = pctRaw > 1 ? pctRaw / 100 : pctRaw;
    if (frac > 0 && frac < 5) return plusUnit / (1 + frac);
  }
  return null;
}

/** Preço unitário COM BDI (Val. c/ BDI) a partir da linha sintética. */
function precoUnitarioComBdiOrcafascio(row: Record<string, unknown>): number | null {
  const qty = valorNumericoOrcafascio(row.qty ?? row.quantity);
  const plusUnit = valorNumericoOrcafascio(row.price_plus_bdi);
  if (plusUnit != null && plusUnit > 0) return plusUnit;
  const totalPlus = valorNumericoOrcafascio(row.total_price_plus_bdi);
  if (qty != null && qty > 0 && totalPlus != null && totalPlus > 0) return totalPlus / qty;
  const sem = precoUnitarioSemBdiOrcafascio(row);
  const pctRaw = valorNumericoOrcafascio(row.pct_bdi_applied ?? row.pct_bdi);
  if (sem != null && sem > 0 && pctRaw != null && pctRaw > 0) {
    const frac = pctRaw > 1 ? pctRaw / 100 : pctRaw;
    if (frac > 0 && frac < 5) return sem * (1 + frac);
  }
  return sem;
}


function ehLinhaTituloOrcafascio(row: Record<string, unknown>): boolean {
  const kind = String(row.kind ?? row.type ?? '').toLowerCase().trim();
  if (/^(group|chapter|divider|titulo|etapa|cabeça|cabeca|stage|header|section)$/.test(kind)) {
    return true;
  }
  const code = codigoCatalogoLinhaOrcamentoOrcafascio(row);
  if (code) return false;
  const desc = textoDescricaoOrcafascio(row).trim();
  if (!desc) return false;
  // Sem código de composição e com descrição: trata como título/subtítulo.
  return true;
}

function nivelItemizacaoOrcafascio(row: Record<string, unknown>): number {
  const raw = textoItemizacaoOrcafascio(row);
  if (!raw || raw === '—') return 0;
  const parts = String(raw)
    .split(/[.\-/]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length;
}

function bancoLinhaOrcafascio(row: Record<string, unknown>): string {
  const base = String(row.base ?? row.base_name ?? row.reference_base ?? '').trim();
  const locals = String(row.base_locals ?? '').trim();
  if (base && locals) return `${base}/${locals}`;
  return base || 'Orçafascio';
}

/** Exibe só o nome do banco (sem «/BA», «/GO», «/central» etc.). */
function nomeBancoParaExibicao(banco: string | null | undefined): string {
  const raw = String(banco ?? '').trim();
  if (!raw) return '—';
  const semLocal = raw.replace(/\/[^/]*\s*$/, '').trim();
  return semLocal || raw;
}

/**
 * Converte linhas sintéticas (+ analítico opcional) do orçamento Orçafascio em árvore
 * serviço → subtítulo → itens, no formato do orçamento local.
 */
function montarServicosDeLinhasOrcafascio(
  linhasSintetico: Record<string, unknown>[],
  linhasAnalitico: Record<string, unknown>[] = []
): { servicos: ServicoPadrao[]; composicoes: ComposicaoItem[] } {
  const analiticoPorCodigo = new Map<string, Record<string, unknown>>();
  for (const row of linhasAnalitico) {
    const code = codigoCatalogoLinhaOrcamentoOrcafascio(row);
    if (!code) continue;
    for (const v of variantesCodigoOrcafascio(code)) {
      if (!analiticoPorCodigo.has(v)) analiticoPorCodigo.set(v, row);
    }
  }

  type ServicoAcc = { nome: string; subtitulos: Map<string, ItemServico[]> };
  const servicosMap = new Map<string, ServicoAcc>();
  const composicoesMap = new Map<string, ComposicaoItem>();

  let topicoAtual = '';
  let subdivisaoAtual = '';

  const garantirServico = (nome: string): ServicoAcc => {
    let s = servicosMap.get(nome);
    if (!s) {
      s = { nome, subtitulos: new Map() };
      servicosMap.set(nome, s);
    }
    return s;
  };

  for (const row of linhasSintetico) {
    const desc = textoDescricaoOrcafascio(row).trim();
    const code = codigoCatalogoLinhaOrcamentoOrcafascio(row);
    const nivel = nivelItemizacaoOrcafascio(row);
    const kind = String(row.kind ?? row.type ?? '').toLowerCase().trim();

    if (ehLinhaTituloOrcafascio(row)) {
      if (!desc) continue;
      const ehCapitulo =
        /^(chapter|divider|etapa|stage|header|section)$/.test(kind) || nivel === 1 || (!nivel && !subdivisaoAtual && !topicoAtual);
      const ehGrupo = /^(group|titulo|cabeça|cabeca)$/.test(kind) || nivel === 2;
      if (ehCapitulo && !ehGrupo) {
        topicoAtual = desc;
        subdivisaoAtual = '';
      } else if (ehGrupo || (topicoAtual && nivel >= 2)) {
        if (!topicoAtual) topicoAtual = desc;
        else subdivisaoAtual = desc;
      } else if (!topicoAtual) {
        topicoAtual = desc;
        subdivisaoAtual = '';
      } else {
        subdivisaoAtual = desc;
      }
      continue;
    }

    if (!code && !desc) continue;

    if (!topicoAtual) topicoAtual = 'Serviços';
    const nomeSub = subdivisaoAtual || topicoAtual;
    const banco = bancoLinhaOrcafascio(row);
    const codigo = code || String(row.code ?? '').trim() || `item-${servicosMap.size}`;
    const chave = normalizarChave(codigo, banco);

    let analiticoRow: Record<string, unknown> | undefined;
    for (const v of variantesCodigoOrcafascio(codigo)) {
      analiticoRow = analiticoPorCodigo.get(v);
      if (analiticoRow) break;
    }

    const precoSinteticoSemBdi = precoUnitarioSemBdiOrcafascio(row);
    let precoUnitario =
      precoSinteticoSemBdi ??
      valorNumericoOrcafascio(
        row.price_plus_bdi ?? row.price_of_bdi ?? row.price ?? row.unit_price ?? row.unitary_price
      ) ??
      precoOrcafascioAnalitico(row) ??
      0;
    let analiticoLinhas: LinhaAnaliticoComposicao[] | undefined;
    let maoDeObraUnitario: number | undefined;
    let materialUnitario: number | undefined;

    if (analiticoRow) {
      const detalhe = detalheCatalogoAPartirAnaliticoOrcamento(analiticoRow);
      const comp = orcafascioToComposicaoItem(detalhe);
      if (!composicoesMap.has(comp.chave)) composicoesMap.set(comp.chave, comp);
      // Mantém preço do orçamento (sintético) quando existir; catálogo só preenche buraco.
      if (!(precoUnitario > 0) && comp.precoUnitario) precoUnitario = comp.precoUnitario;
      analiticoLinhas = comp.analiticoLinhas;
      maoDeObraUnitario = comp.maoDeObraUnitario;
      materialUnitario = comp.materialUnitario;
    } else {
      const bare: ComposicaoItem = {
        codigo,
        banco,
        chave,
        descricao: desc || codigo,
        unidade: String(row.unity ?? row.unit ?? '').trim() || undefined,
        precoUnitario: precoUnitario || 0,
      };
      if (!composicoesMap.has(chave)) composicoesMap.set(chave, bare);
    }

    // Preferir split explícito do analítico/sintético (type_mdo / type_mat).
    const splitAna = analiticoRow ? precosMoMatDeLinhaOrcafascio(analiticoRow) : { mo: null, mat: null };
    const splitSint = precosMoMatDeLinhaOrcafascio(row);
    const moSplit = splitAna.mo ?? splitSint.mo;
    const matSplit = splitAna.mat ?? splitSint.mat;
    if (!(maoDeObraUnitario != null && maoDeObraUnitario > 0) && moSplit != null && moSplit > 0) {
      maoDeObraUnitario = moSplit;
    }
    if (!(materialUnitario != null && materialUnitario > 0) && matSplit != null && matSplit > 0) {
      materialUnitario = matSplit;
    }
    // Composição de mão de obra sem material: preço unitário vai para MO.
    if (
      !(maoDeObraUnitario != null && maoDeObraUnitario > 0) &&
      !(materialUnitario != null && materialUnitario > 0) &&
      precoUnitario > 0 &&
      (linhaEhMaoDeObraOrcafascio(row) || (analiticoRow != null && linhaEhMaoDeObraOrcafascio(analiticoRow)))
    ) {
      maoDeObraUnitario = precoUnitario;
    }

    const qty = valorNumericoOrcafascio(row.qty ?? row.quantity ?? null);
    const precoComBdi =
      precoUnitarioComBdiOrcafascio(row) ??
      (precoUnitario > 0 ? precoUnitario : null);
    const totaisLinha = totaisLinhaOrcafascio(row);
    let totalSemBdiImp = totaisLinha.semBdi;
    let totalComBdiImp = totaisLinha.comBdi;
    if (
      (totalSemBdiImp == null || !(totalSemBdiImp > 0)) &&
      qty != null &&
      qty > 0 &&
      precoUnitario > 0
    ) {
      totalSemBdiImp = precoUnitario * qty;
    }
    if (
      (totalComBdiImp == null || !(totalComBdiImp > 0)) &&
      qty != null &&
      qty > 0 &&
      precoComBdi != null &&
      precoComBdi > 0
    ) {
      totalComBdiImp = precoComBdi * qty;
    }
    if (
      (totalSemBdiImp == null || !(totalSemBdiImp > 0)) &&
      totalComBdiImp != null &&
      totaisLinha.bdi != null
    ) {
      totalSemBdiImp = totalComBdiImp - totaisLinha.bdi;
    }

    const item: ItemServico = {
      chave,
      codigo,
      banco,
      descricao: desc || codigo,
      precoUnitario: precoUnitario || 0,
      ...(precoComBdi != null && precoComBdi > 0 ? { precoUnitarioComBdi: precoComBdi } : {}),
      ...(maoDeObraUnitario != null && maoDeObraUnitario > 0 ? { maoDeObraUnitario } : {}),
      ...(materialUnitario != null && materialUnitario > 0 ? { materialUnitario } : {}),
      ...(String(row.unity ?? row.unit ?? '').trim()
        ? { unidade: String(row.unity ?? row.unit ?? '').trim() }
        : {}),
      ...(analiticoLinhas && analiticoLinhas.length > 0 ? { analiticoLinhas } : {}),
      ...(qty != null && qty > 0 && Number.isFinite(qty)
        ? { quantidadePlanilha: qty, quantidadeImportada: qty }
        : {}),
      ...(totalSemBdiImp != null && Number.isFinite(totalSemBdiImp)
        ? { totalSemBdiImportado: totalSemBdiImp }
        : {}),
      ...(totalComBdiImp != null && Number.isFinite(totalComBdiImp)
        ? { totalComBdiImportado: totalComBdiImp }
        : {})
    };

    const servico = garantirServico(topicoAtual);
    let itensSub = servico.subtitulos.get(nomeSub) || [];
    // Mesmo código no mesmo subtítulo: mantém as duas linhas (chave única) — não descarta total.
    const qtdMesmoCodigo = itensSub.filter(
      (x) => x.chave === item.chave || (x.codigo === item.codigo && x.banco === item.banco)
    ).length;
    const itemFinal: ItemServico =
      qtdMesmoCodigo > 0
        ? { ...item, chave: `${item.chave}#${qtdMesmoCodigo + 1}` }
        : item;
    itensSub = [...itensSub, itemFinal];
    servico.subtitulos.set(nomeSub, itensSub);
  }

  // Se só vieram itens sem títulos, tudo em um serviço único.
  if (servicosMap.size === 0) {
    const fallbackItens: ItemServico[] = [];
    for (const row of linhasSintetico) {
      const code = codigoCatalogoLinhaOrcamentoOrcafascio(row);
      const desc = textoDescricaoOrcafascio(row).trim();
      if (!code && !desc) continue;
      if (ehLinhaTituloOrcafascio(row)) continue;
      const banco = bancoLinhaOrcafascio(row);
      const codigo = code || String(row.code ?? '').trim() || `item-${fallbackItens.length + 1}`;
      const chave = normalizarChave(codigo, banco);
      const qty = valorNumericoOrcafascio(row.qty ?? row.quantity ?? null);
      const preco =
        precoUnitarioSemBdiOrcafascio(row) ??
        valorNumericoOrcafascio(row.price_plus_bdi ?? row.price ?? row.unit_price) ??
        precoOrcafascioAnalitico(row) ??
        0;
      const precoComBdiFb = precoUnitarioComBdiOrcafascio(row);
      const totaisFb = totaisLinhaOrcafascio(row);
      fallbackItens.push({
        chave,
        codigo,
        banco,
        descricao: desc || codigo,
        precoUnitario: preco || 0,
        ...(precoComBdiFb != null && precoComBdiFb > 0 ? { precoUnitarioComBdi: precoComBdiFb } : {}),
        ...(qty != null && qty > 0
          ? { quantidadePlanilha: qty, quantidadeImportada: qty }
          : {}),
        ...(totaisFb.semBdi != null ? { totalSemBdiImportado: totaisFb.semBdi } : {}),
        ...(totaisFb.comBdi != null ? { totalComBdiImportado: totaisFb.comBdi } : {})
      });
    }
    if (fallbackItens.length > 0) {
      servicosMap.set('Serviços', {
        nome: 'Serviços',
        subtitulos: new Map([['Geral', fallbackItens]]),
      });
    }
  }

  const servicos: ServicoPadrao[] = Array.from(servicosMap.values())
    .filter((v) => Array.from(v.subtitulos.values()).some((itens) => itens.length > 0))
    .map((v) => ({
      id: crypto.randomUUID(),
      nome: v.nome,
      subtitulos: Array.from(v.subtitulos.entries())
        .filter(([, itens]) => itens.length > 0)
        .map(([nomeSub, itens]) => ({
          id: crypto.randomUUID(),
          nome: nomeSub,
          itens,
        })),
    }));

  return { servicos, composicoes: Array.from(composicoesMap.values()) };
}

function chaveDeItemKeyOrcamento(key: string): string {
  const parts = String(key).split('|');
  return parts.length >= 3 ? parts.slice(2).join('|') : key;
}

function remapearRegistroPorChave<T>(
  prev: Record<string, T>,
  chaveParaNovaKey: Map<string, string>
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [oldKey, val] of Object.entries(prev)) {
    const nova = chaveParaNovaKey.get(oldKey) ?? chaveParaNovaKey.get(chaveDeItemKeyOrcamento(oldKey));
    if (nova && next[nova] === undefined) next[nova] = val;
  }
  return next;
}

function remapearListaChavesOrcamento(prev: string[], chaveParaNovaKey: Map<string, string>): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const k of prev) {
    const insumoIdx = k.indexOf('|insumo|');
    if (insumoIdx > 0) {
      const parent = k.slice(0, insumoIdx);
      const suffix = k.slice(insumoIdx);
      const novaParent =
        chaveParaNovaKey.get(parent) ?? chaveParaNovaKey.get(chaveDeItemKeyOrcamento(parent));
      if (novaParent) {
        const nk = `${novaParent}${suffix}`;
        if (!seen.has(nk)) {
          seen.add(nk);
          next.push(nk);
        }
      }
      continue;
    }
    const nova = chaveParaNovaKey.get(k) ?? chaveParaNovaKey.get(chaveDeItemKeyOrcamento(k));
    if (nova && !seen.has(nova)) {
      seen.add(nova);
      next.push(nova);
    }
  }
  return next;
}

function coletarChavesComposicao(servicos: ServicoPadrao[]): Set<string> {
  const out = new Set<string>();
  for (const s of servicos) {
    for (const sub of s.subtitulos) {
      for (const it of sub.itens) out.add(it.chave);
    }
  }
  return out;
}

/** Reaproveita ids de serviço/subtítulo pelo nome para não perder quantidade e memória. */
function mesclarArvoreServicosOrcafascio(
  atuais: ServicoPadrao[],
  novos: ServicoPadrao[]
): { servicos: ServicoPadrao[]; chaveParaNovaKey: Map<string, string>; chavesNovas: Set<string> } {
  const servicoPorNome = new Map(atuais.map((s) => [s.nome.trim().toLowerCase(), s]));
  const chaveParaNovaKey = new Map<string, string>();
  const chavesNovas = new Set<string>();

  const servicos = novos.map((ns) => {
    const existente = servicoPorNome.get(ns.nome.trim().toLowerCase());
    const id = existente?.id ?? crypto.randomUUID();
    const subPorNome = new Map((existente?.subtitulos ?? []).map((s) => [s.nome.trim().toLowerCase(), s]));
    return {
      id,
      nome: ns.nome,
      subtitulos: ns.subtitulos.map((nsub) => {
        const exSub = subPorNome.get(nsub.nome.trim().toLowerCase());
        const subId = exSub?.id ?? crypto.randomUUID();
        for (const it of nsub.itens) {
          const newKey = `${id}|${subId}|${it.chave}`;
          chavesNovas.add(newKey);
          chaveParaNovaKey.set(it.chave, newKey);
          chaveParaNovaKey.set(newKey, newKey);
          const exItem = exSub?.itens.find((x) => x.chave === it.chave);
          if (exItem) chaveParaNovaKey.set(`${id}|${subId}|${exItem.chave}`, newKey);
        }
        return { id: subId, nome: nsub.nome, itens: nsub.itens };
      }),
    };
  });

  for (const s of atuais) {
    for (const sub of s.subtitulos) {
      for (const it of sub.itens) {
        const oldKey = `${s.id}|${sub.id}|${it.chave}`;
        if (!chaveParaNovaKey.has(oldKey)) {
          const nova = chaveParaNovaKey.get(it.chave);
          if (nova) chaveParaNovaKey.set(oldKey, nova);
        }
      }
    }
  }

  return { servicos, chaveParaNovaKey, chavesNovas };
}

function parseOrcafascioBudgetIdMeta(metaRaw: Record<string, unknown> | undefined): string | undefined {
  const v = metaRaw?.orcafascioBudgetId;
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

type OrcafascioDadosMeta = {
  code?: string;
  description?: string;
  state?: string;
  socialCharges?: boolean;
  /** true = desonerado · false = onerado */
  exempt?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

function parseBoolFlagOrcafascio(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true' || v === 'True') return true;
  if (v === 0 || v === '0' || v === 'false' || v === 'False') return false;
  return undefined;
}

function extrairDadosCabecalhoOrcafascio(
  raw: Record<string, unknown> | null | undefined
): OrcafascioDadosMeta | undefined {
  if (!raw) return undefined;
  const code = String(raw.code ?? raw.codigo ?? '').trim();
  const description = String(raw.description ?? raw.descricao ?? '').trim();
  const state = String(raw.state ?? raw.uf ?? raw.estado ?? '').trim();
  const socialCharges = parseBoolFlagOrcafascio(
    raw.socialCharges ?? raw.social_charges ?? raw.leis_sociais
  );
  const exempt = parseBoolFlagOrcafascio(raw.exempt ?? raw.desonerado ?? raw.is_exempt);
  const createdAt = String(raw.createdAt ?? raw.created_at ?? '').trim();
  const updatedAt = String(raw.updatedAt ?? raw.updated_at ?? '').trim();
  if (!code && !description && !state && socialCharges == null && exempt == null && !createdAt && !updatedAt) {
    return undefined;
  }
  return {
    ...(code ? { code } : {}),
    ...(description ? { description } : {}),
    ...(state ? { state } : {}),
    ...(socialCharges != null ? { socialCharges } : {}),
    ...(exempt != null ? { exempt } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function parseOrcafascioDadosMeta(raw: unknown): OrcafascioDadosMeta | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return extrairDadosCabecalhoOrcafascio(raw as Record<string, unknown>);
}

function formatarDataHoraOrcafascio(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('pt-BR');
}

function rotuloEncargosOrcafascio(exempt?: boolean): string {
  if (exempt == null) return '—';
  return exempt ? 'Desonerado' : 'Onerado';
}

function rotuloSimNaoOrcafascio(v?: boolean): string {
  if (v == null) return '—';
  return v ? 'Sim' : 'Não';
}

function rotuloModoArredondamentoDados(modo?: ModoArredondamento): string {
  if (modo === 'truncar') return 'Truncar';
  if (modo === 'arredondar') return 'Arredondar';
  if (modo === 'nenhum') return 'Não arredondar';
  return '—';
}

function acharCabecalhoOrcafascioNaCache(
  budgetId?: string,
  code?: string
): OrcafascioDadosMeta | undefined {
  const idNorm = (budgetId || '').trim();
  const codeNorm = (code || '').trim().toLowerCase();
  if (!idNorm && !codeNorm) return undefined;
  const searches = Array.from(new Set(['', codeNorm].filter((s) => s != null)));
  for (const search of searches) {
    const items = peekOrcafascioOrcamentosCache(search)?.items ?? [];
    const hit = items.find((i) => {
      const id = idOrcamentoOrcafascioParaApi(i as OrcafascioOrcamentoItem);
      if (idNorm && id === idNorm) return true;
      if (codeNorm && String(i.code || '').trim().toLowerCase() === codeNorm) return true;
      return false;
    });
    if (hit) return extrairDadosCabecalhoOrcafascio(hit as Record<string, unknown>);
  }
  return undefined;
}

function DadosCampo({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2 xl:col-span-3' : 'min-w-0'}>
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
        {children}
      </dd>
    </div>
  );
}

export interface OrcafascioListResponse<T> {
  total: number;
  per_page: number;
  current_page: number;
  records: T[];
  _aggregated?: boolean;
  _bases?: Array<{ segment: string; total: number }>;
  /** Modo agregado: última página útil (max entre bases). */
  _aggregated_page_limit?: number;
  /** Segmento REST efetivo da última listagem (slug ou ID Mongo). */
  _orcafascio_segment?: string;
  /** True quando caiu no catálogo genérico (mybase etc.) — mistura várias tabelas no mesmo total. */
  _orcafascio_mix_fallback?: boolean;
  /** REST não expôs /orse — lista veio do agregado após 404 nos slugs. */
  _orcafascio_rest_orse_404?: boolean;
}

/**
 * Infere banco/tabela de referência (a API GET não envia o campo). Ordem: is_sicro → texto na descrição
 * (incl. REF. SINAPI) → código numérico oficial → prefixos de código (CONFEA, SENAC, MP…).
 */
function inferirBancoOrcafascio(
  comp: Pick<OrcafascioComposicaoListItem, 'code' | 'description' | 'is_sicro' | 'second_code'>
): string {
  const desc = comp.description ?? '';
  const code = (comp.code ?? '').trim();
  const sec = (comp.second_code ?? '').trim();
  const texto = `${desc} ${sec}`;
  const du = texto.toUpperCase();

  if (comp.is_sicro) {
    if (/SICRO\s*3|SICRO3/i.test(texto)) return 'SICRO3';
    return 'SICRO';
  }

  const copiaDa = du.match(/COPIA\s+DA\s+(SINAPI|SICRO\S*)/);
  if (copiaDa) return copiaDa[1].replace(/\s+/g, '');

  if (/\bSICRO\s*3\b|\bSICRO3\b/i.test(texto)) return 'SICRO3';
  if (/\bSINAPI\b/i.test(texto)) return 'SINAPI';
  if (/\bSICRO\b/i.test(texto)) return 'SICRO';

  if (/REF\.?\s*SINAPI/i.test(desc)) return 'SINAPI';
  if (/CAT[AÁ]LOGO\s+SINAPI/i.test(du)) return 'SINAPI';
  if (/\bORSE\b/i.test(texto)) return 'ORSE';

  // Código só dígitos longos (tabelas oficiais no site Orçafascio)
  if (/^\d{5,}$/.test(code)) return 'SINAPI';

  /* Sem menção explícita à tabela: usar prefixo do código como origem do cadastro */
  if (/^CONFEA-/i.test(code)) return 'CONFEA';
  if (/^COMP\.?\s*SENAC\b/i.test(code)) return 'SENAC';
  if (/^COMP\.?\s*MP\b/i.test(code)) return 'MP';
  if (/^COMS\d/i.test(code)) return 'COMS';

  return '—';
}

/** Rotula o segmento `/v1/base/{segment}/…` na tabela (IDs Mongo longos). */
function rotuloSegmentoOrcafascioApi(seg: string | undefined): string {
  if (!seg) return '—';
  if (seg.length <= 22) return seg;
  return `${seg.slice(0, 10)}…${seg.slice(-8)}`;
}

/** Formata a data de criação como MM/YYYY. */
function formatDataOrcafascio(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return '—'; }
}

/** Extrai apenas o mês (01–12) de uma data Orçafascio. */
function formatMesOrcafascio(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return String(d.getMonth() + 1).padStart(2, '0');
  } catch { return '—'; }
}

/** Extrai apenas o ano de uma data Orçafascio. */
function formatAnoOrcafascio(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return String(d.getFullYear());
  } catch { return '—'; }
}

/** Converte um item da composição Orçafascio na categoria analítica correta. */
function categoriaOrcafascioItem(item: OrcafascioComposicaoItem): 'MATERIAL' | 'MÃO DE OBRA' {
  // Itens que são sub-composições (serviços) → Mão de Obra
  if (!item.is_resource) return 'MÃO DE OBRA';
  // Insumos com type numérico: 3 = Mão de Obra no SINAPI
  const typeNum = Number(item.type);
  if (!isNaN(typeNum) && typeNum === 3) return 'MÃO DE OBRA';
  return 'MATERIAL';
}

const TIPO_INSUMO_LABEL_POR_CODIGO: Record<number, string> = {
  0: 'Mão de obra',
  1: 'Equipamento',
  2: 'Equipamento para Aquisição Permanente',
  3: 'Mão de obra',
  4: 'Material',
  5: 'Serviços',
  6: 'Taxas',
  7: 'Outros',
  8: 'Franquia',
  9: 'Administração',
  10: 'Aluguel',
  11: 'Verba',
  12: 'Consultoria',
  13: 'Transporte',
  14: 'Despesas Complementares',
};

function tipoInsumoCodigoParaDescricao(tipo: unknown): string {
  if (tipo == null) return '—';
  const s = String(tipo).trim();
  if (!s) return '—';
  if (/^\d+(\.0+)?$/.test(s)) {
    const codigo = Math.trunc(Number(s));
    return TIPO_INSUMO_LABEL_POR_CODIGO[codigo] || s;
  }
  return s;
}

/** Converte a resposta detalhada do Orçafascio para o formato ComposicaoItem do sistema. */
function orcafascioToComposicaoItem(comp: OrcafascioComposicaoDetalhe): ComposicaoItem {
  const itemsSrc =
    Array.isArray(comp.items) && comp.items.length > 0
      ? comp.items
      : (detalheCatalogoAPartirAnaliticoOrcamento(
          comp as unknown as Record<string, unknown>
        ).items ?? []);
  const analiticoLinhas: LinhaAnaliticoComposicao[] = itemsSrc.map(item => ({
    categoria: categoriaOrcafascioItem(item),
    descricao: decodificarEntidadesHtml(String(item.description ?? '')),
    unidade: item.unit,
    quantidade: item.coefficient,
    precoUnitario: item.unitary_pnd,
    total: item.pnd,
    codigo: item.code,
    banco: item.banco,
    tipoLabel: tipoInsumoCodigoParaDescricao(item.type),
  }));

  const maoDeObraUnitario = analiticoLinhas
    .filter(l => l.categoria === 'MÃO DE OBRA')
    .reduce((s, l) => s + (l.total ?? 0), 0);

  const materialUnitario = analiticoLinhas
    .filter(l => l.categoria === 'MATERIAL')
    .reduce((s, l) => s + (l.total ?? 0), 0);

  const preco = comp.prices?.pnd ?? 0;
  let mo = maoDeObraUnitario;
  let mat = materialUnitario;
  // Sem breakdown nos insumos: composição marcada como mão de obra → preço inteiro em MO.
  if (!(mo > 0) && !(mat > 0) && comp.labor && preco > 0) {
    mo = preco;
  }

  const banco = String(comp.base ?? '').trim() || 'Orçafascio';
  return {
    codigo: comp.code,
    banco,
    chave: normalizarChave(String(comp.code ?? ''), banco),
    descricao: decodificarEntidadesHtml(String(comp.description ?? '')),
    unidade: comp.unit,
    precoUnitario: preco,
    maoDeObraUnitario: mo > 0 ? mo : undefined,
    materialUnitario: mat > 0 ? mat : undefined,
    analiticoLinhas,
  };
}

type InsumoAnaliticoManual = {
  id: string;
  parentKey: string;
  tipo: string;
  codigo: string;
  banco: string;
  descricao: string;
  und: string;
  quant: string;
  quantidadeReal: string;
  quantidadeOrcada: string;
  valorUnit: string;
};

export interface ItemServico {
  chave: string;
  codigo: string;
  banco: string;
  descricao: string;
  precoUnitario?: number;
  /** Unitário com BDI (Orçafascio price_plus_bdi) — coluna Val. c/ BDI. */
  precoUnitarioComBdi?: number;
  maoDeObraUnitario?: number;
  materialUnitario?: number;
  /** Unidade da composição (ex. Orçafascio); persiste com a linha. */
  unidade?: string;
  /** Analítico gravado na linha ao incluir a composição — sobrevive ao F5 sem depender do catálogo global. */
  analiticoLinhas?: LinhaAnaliticoComposicao[];
  /** Só leitura na importação da planilha; removido antes de persistir. */
  quantidadePlanilha?: number;
  /** Quantidade original do Orçafascio (persistida — para escalar totais se a qtd mudar). */
  quantidadeImportada?: number;
  /** Total sem BDI da linha no Orçafascio (`total_price`) — fonte da coluna/custo direto. */
  totalSemBdiImportado?: number;
  /** Total com BDI da linha no Orçafascio (`total_price_plus_bdi`) — fonte da coluna Total. */
  totalComBdiImportado?: number;
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

/** Remove campo temporário da importação antes de gravar no servidor. */
function servicosSemQuantidadePlanilha(servicos: ServicoPadrao[]): ServicoPadrao[] {
  return servicos.map(svc => ({
    ...svc,
    subtitulos: svc.subtitulos.map(sub => ({
      ...sub,
      itens: sub.itens.map(({ quantidadePlanilha: _qp, ...rest }) => rest)
    }))
  }));
}

/** Só campos persistíveis — remove propriedades extras que inflam o JSON no localStorage. */
function servicosParaLocalStorage(servicos: ServicoPadrao[]): ServicoPadrao[] {
  return servicos.map((svc) => ({
    id: String(svc.id ?? ''),
    nome: String(svc.nome ?? ''),
    subtitulos: (svc.subtitulos ?? []).map((sub) => ({
      id: String(sub.id ?? ''),
      nome: String(sub.nome ?? ''),
      itens: (sub.itens ?? []).map((it) => {
        const row: ItemServico = {
          chave: String(it.chave ?? ''),
          codigo: String(it.codigo ?? ''),
          banco: String(it.banco ?? ''),
          descricao: decodificarEntidadesHtml(String(it.descricao ?? ''))
        };
        if (it.precoUnitario != null) row.precoUnitario = it.precoUnitario;
        if (it.precoUnitarioComBdi != null) row.precoUnitarioComBdi = it.precoUnitarioComBdi;
        if (it.maoDeObraUnitario != null) row.maoDeObraUnitario = it.maoDeObraUnitario;
        if (it.materialUnitario != null) row.materialUnitario = it.materialUnitario;
        if (it.quantidadeImportada != null && Number.isFinite(it.quantidadeImportada)) {
          row.quantidadeImportada = it.quantidadeImportada;
        }
        if (it.totalSemBdiImportado != null && Number.isFinite(it.totalSemBdiImportado)) {
          row.totalSemBdiImportado = it.totalSemBdiImportado;
        }
        if (it.totalComBdiImportado != null && Number.isFinite(it.totalComBdiImportado)) {
          row.totalComBdiImportado = it.totalComBdiImportado;
        }
        const u = it.unidade != null ? String(it.unidade).trim() : '';
        if (u) row.unidade = u;
        if (Array.isArray(it.analiticoLinhas) && it.analiticoLinhas.length > 0) {
          row.analiticoLinhas = it.analiticoLinhas.map((ln) => ({
            categoria: ln.categoria === 'MÃO DE OBRA' ? 'MÃO DE OBRA' : 'MATERIAL',
            descricao: decodificarEntidadesHtml(String(ln.descricao ?? '')),
            unidade: String(ln.unidade ?? ''),
            quantidade: Number(ln.quantidade) || 0,
            precoUnitario: Number(ln.precoUnitario) || 0,
            total: Number(ln.total) || 0,
            ...(ln.codigo != null && String(ln.codigo).trim() ? { codigo: String(ln.codigo).trim() } : {}),
            ...(ln.banco != null && String(ln.banco).trim() ? { banco: String(ln.banco).trim() } : {}),
            ...(ln.tipoLabel != null ? { tipoLabel: ln.tipoLabel } : {})
          }));
        }
        return row;
      })
    }))
  }));
}

/**
 * Snapshot já grava `servicos` — omitir `servicosDocumento` evita duplicar a árvore inteira (planilha importada).
 * Recuperação usa `snapshot.servicos` com `setServicos`.
 */
function sessaoOrcamentoParaSnapshot(sessao: SessaoOrcamentoPersist): SessaoOrcamentoPersist {
  const { servicosDocumento: _dup, ...rest } = sessao;
  return rest;
}

const STORAGE_PREFIX = 'orcamento';
const STORAGE_IMPORTS = 'orcamento-imports';
/** Histórico local de recuperação: cada entrada repete serviços + sessão — manter poucos para não estourar quota. */
const ORCAMENTO_SNAPSHOT_MAX = 4;

/** `orcamentoId` só para dados do orçamento (serviços, imports, sessão); composições não usam. */
function storageKey(centroCustoId: string, base: string, orcamentoId?: string | null) {
  const suffix = orcamentoId ? `-${orcamentoId}` : '';
  return `${STORAGE_PREFIX}-${base}-${centroCustoId}${suffix}`;
}

function isLocalStorageQuotaError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22)) ||
    (err instanceof Error && err.name === 'QuotaExceededError')
  );
}

/** Libera espaço para rascunho: nível 1 = snapshots; 2 = + cortar histórico de imports; 3 = + cache de composições locais. */
function evictOrcamentoDraftStorage(centroCustoId: string, level: 1 | 2 | 3): void {
  if (typeof window === 'undefined') return;
  const snapPrefix = `${STORAGE_PREFIX}-snapshots-${centroCustoId}-`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(snapPrefix)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));

  if (level >= 2) {
    try {
      const ik = storageKey(centroCustoId, 'imports');
      const raw = localStorage.getItem(ik);
      if (raw) {
        const list = JSON.parse(raw) as unknown;
        if (Array.isArray(list) && list.length > 5) {
          localStorage.setItem(ik, JSON.stringify(list.slice(0, 5)));
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (level >= 3) {
    try {
      localStorage.removeItem(storageKey(centroCustoId, 'composicoes'));
    } catch {
      /* ignore */
    }
  }
}

let servicosLocalStorageQuotaWarnAt = 0;

export interface ImportRecord {
  id: string;
  fileName: string;
  date: string;
  tipo: 'orçamento' | 'composições';
  origem?: 'orcamento-perfeito' | 'orcamento-documento' | 'composicoes';
  servicosCount?: number;
  itensCount?: number;
}

type OrcamentoStatusAprovacao =
  | 'rascunho'
  | 'pronta'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'em_correcao'
  | 'reprovado';

type OrcamentoListaEntry = {
  id: string;
  nome: string;
  updatedAt: string;
  statusAprovacao?: OrcamentoStatusAprovacao | string;
  fichaDemandaPct?: number;
  /** BDI em pontos percentuais (ex.: 28.35). */
  bdiPercentual?: number;
  totalComBdi?: number;
};

const ORCAMENTO_STATUS_LABELS: Record<OrcamentoStatusAprovacao, string> = {
  rascunho: 'Rascunho',
  pronta: 'FD pronta',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  em_correcao: 'Em correção',
  reprovado: 'Reprovado',
};

function normalizarStatusAprovacaoOrcamento(
  raw: unknown
): OrcamentoStatusAprovacao {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (
    s === 'pronta' ||
    s === 'aguardando_aprovacao' ||
    s === 'aprovado' ||
    s === 'em_correcao' ||
    s === 'reprovado' ||
    s === 'rascunho'
  ) {
    return s;
  }
  return 'rascunho';
}

function orcamentoStatusBadgeClass(status: OrcamentoStatusAprovacao): string {
  const base =
    'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap';
  switch (status) {
    case 'pronta':
      return `${base} bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200`;
    case 'aguardando_aprovacao':
      return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
    case 'aprovado':
      return `${base} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200`;
    case 'em_correcao':
      return `${base} bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200`;
    case 'reprovado':
      return `${base} bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200`;
    default:
      // Mesmo padrão do badge "Lançado" no Controle Financeiro
      return `${base} bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200`;
  }
}

function inferirPoloFdDeTexto(texto: string): PoloFd | '' {
  const t = texto.toUpperCase();
  if (/\bDF\b/.test(t) || t.includes('- DF') || t.endsWith(' DF')) return 'DF';
  if (/\bGO\b/.test(t) || t.includes('- GO') || t.endsWith(' GO')) return 'GO';
  return '';
}

type OrcamentoMeta = {
  osNumeroPasta: string;
  dataAbertura: string; // yyyy-mm-dd — data de início
  dataEnvio: string; // yyyy-mm-dd — data de fim
  prazoExecucaoDias: string; // mantém como string p/ input
  responsavelOrcamento: string;
  descricao: string;
  orcamentoRealizadoPor: string;
  descontoPercentual: string; // ex.: "25,01"
  bdiPercentual: string; // ex.: "28,35"
  reajustes: Array<{ nome: string; percentual: string }>; // percentual em %
  revisaoCount: number; // 0 = sem revisão; ao salvar vira 1 => R01
  /** Orçamento criado pela importação da planilha: quantidades vêm da planilha; memória de cálculo oculta. */
  importadoPlanilha?: boolean;
  /**
   * Escolha feita na importação do Orçafascio: usar memória de cálculo pra preencher as quantidades.
   * `true` = quantidades zeradas na importação, coluna travada, preenchimento pela aba Memória de Cálculo.
   * `false` = quantidades vêm do Orçafascio e ficam travadas (sem edição).
   * `undefined` = orçamento antigo/de outra origem — mantém o comportamento anterior (coluna "un" editável direto).
   */
  usarMemoriaCalculo?: boolean;
  /**
   * Escolha feita na importação do Orçafascio: como calcular os subtotais por item.
   * `undefined` = orçamento antigo/de outra origem — mantém o comportamento anterior (truncar, igual sempre foi).
   */
  modoArredondamento?: ModoArredondamento;
  /** Id do orçamento no Orçafascio — usado para atualizar composições depois da importação. */
  orcafascioBudgetId?: string;
  /** Cabeçalho do orçamento no Orçafascio (desonerado, UF, leis sociais, etc.). */
  orcafascioDados?: OrcafascioDadosMeta;
  /** Totais do sintético Orçafascio (referência na importação; a barra usa a soma das linhas). */
  totaisOrcafascio?: {
    semBdi: number;
    bdi: number;
    comBdi: number;
  };
  /** Status do ciclo de aprovação da ficha de demanda vinculada ao orçamento. */
  statusAprovacao?: OrcamentoStatusAprovacao;
  /** Progresso da ficha de demanda (0–100), espelhado na lista. */
  fichaDemandaPct?: number;
  /** Total com BDI (R$), espelhado na lista. */
  totalComBdi?: number;
  /** Resumo do cronograma, espelhado na lista de cronogramas. */
  cronogramaResumo?: {
    progressoFisico: number;
    concluido: number;
    totalEtapas: number;
    atrasado: number;
  };
  /** Id da ficha de demanda enviada para aprovação (quando houver). */
  fichaDemandaApprovalId?: string;
};

const ORCAMENTO_REAJUSTES_PADRAO: Array<{ nome: string; percentual: string }> = [
  { nome: '1º reajuste IPCA', percentual: '3,93583' },
  { nome: '2º reajuste IPCA', percentual: '3,92595' },
  { nome: '3º reajuste IPCA', percentual: '5,31964' }
];

function normalizarCronogramaResumoMeta(raw: unknown): OrcamentoMeta['cronogramaResumo'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const progressoFisico = Number(o.progressoFisico);
  const concluido = Number(o.concluido);
  const totalEtapas = Number(o.totalEtapas);
  const atrasado = Number(o.atrasado);
  if (![progressoFisico, concluido, totalEtapas, atrasado].every((n) => Number.isFinite(n))) {
    return undefined;
  }
  return {
    progressoFisico: Math.max(0, Math.min(100, progressoFisico)),
    concluido: Math.max(0, Math.round(concluido)),
    totalEtapas: Math.max(0, Math.round(totalEtapas)),
    atrasado: Math.max(0, Math.round(atrasado)),
  };
}

function metaNovoOrcamentoPadrao(): OrcamentoMeta {
  return {
    ...sessaoVazia().meta!,
    descontoPercentual: '0',
    bdiPercentual: '0',
    reajustes: [],
    dataAbertura: todayInputDate()
  };
}

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

/** Caixa do ícone em estados vazios e cabeçalhos (fundo vermelho suave + anel leve). */
const ORCAMENTO_ICON_SOFT_BOX =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-red-600/[0.12] dark:bg-red-500/15 ring-1 ring-red-600/20 dark:ring-red-500/25';
const ORCAMENTO_ICON_SOFT_GLYPH = 'h-7 w-7 shrink-0 text-red-600 dark:text-red-400';

/** Cartão de estado vazio (Memória de cálculo, Orçamento sem itens, etc.). */
const ORCAMENTO_SECAO_VAZIA_SHELL =
  'flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-5 py-12 sm:py-14 text-center';

function buildItemKeyOrcamento(blocoKey: string, chave: string) {
  return `${blocoKey}|${chave}`;
}

/** Prefixo na seleção em lote da aba Orçamento — subtítulo sem composições visíveis. */
const SELECAO_MONTAGEM_BLOCO_PREFIX = 'montagem-bloco:';

function chaveSelecaoBlocoMontagem(blocoKey: string) {
  return `${SELECAO_MONTAGEM_BLOCO_PREFIX}${blocoKey}`;
}

function isChaveComposicaoMontagem(key: string) {
  return !key.startsWith(SELECAO_MONTAGEM_BLOCO_PREFIX);
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

function parseBlocoKeyOrcamento(blocoKey: string): { servicoId: string; subtituloId: string } | null {
  const i = blocoKey.lastIndexOf('|');
  if (i <= 0 || i >= blocoKey.length - 1) return null;
  return { servicoId: blocoKey.slice(0, i), subtituloId: blocoKey.slice(i + 1) };
}

function findSubtituloPorBlocoKey(list: ServicoPadrao[], blocoKey: string): Subtitulo | null {
  for (const s of list) {
    for (const sub of s.subtitulos) {
      if (`${s.id}|${sub.id}` === blocoKey) return sub;
    }
  }
  return null;
}

/** Assinatura do item para cruzar catálogo do contrato × importação (UUIDs diferentes). */
function itemSigParaOrcamento(it: ItemServico): string {
  const k = String(it.chave || '').trim();
  if (k) return k;
  return normalizarChave(String(it.codigo || ''), String(it.banco || ''));
}

function coletarAssinaturasItensServicos(list: ServicoPadrao[]): Set<string> {
  const s = new Set<string>();
  for (const svc of list) {
    for (const sub of svc.subtitulos) {
      for (const it of sub.itens) s.add(itemSigParaOrcamento(it));
    }
  }
  return s;
}

/** Catálogo completo do contrato + grupos só da planilha importada (itens fora do catálogo). */
function mergeServicosPadraoComDocumentoImportado(padrao: ServicoPadrao[], doc: ServicoPadrao[]): ServicoPadrao[] {
  if (padrao.length === 0) return doc;
  const sigPad = coletarAssinaturasItensServicos(padrao);
  const extras = doc.filter(svc =>
    svc.subtitulos.some(sub => sub.itens.some(it => !sigPad.has(itemSigParaOrcamento(it))))
  );
  try {
    return [...structuredClone(padrao), ...extras];
  } catch {
    return [...(JSON.parse(JSON.stringify(padrao)) as ServicoPadrao[]), ...extras];
  }
}

/** Garante serviço/subtítulo do catálogo no estado persistido do orçamento ao adicionar pelo dropdown. */
function incorporarNovosBlocosNoEstadoServicos(
  atual: ServicoPadrao[],
  novosBlocosKeys: string[],
  fonte: ServicoPadrao[]
): ServicoPadrao[] {
  if (novosBlocosKeys.length === 0) return atual;
  const blocosPresentes = new Set(atual.flatMap(s => s.subtitulos.map(sub => `${s.id}|${sub.id}`)));
  const next: ServicoPadrao[] = atual.map(s => ({
    ...s,
    subtitulos: s.subtitulos.map(sub => ({
      ...sub,
      itens: sub.itens.map(it => ({ ...it }))
    }))
  }));
  for (const bk of novosBlocosKeys) {
    if (blocosPresentes.has(bk)) continue;
    const sep = bk.lastIndexOf('|');
    if (sep <= 0) continue;
    const servicoId = bk.slice(0, sep);
    const subtituloId = bk.slice(sep + 1);
    const svcFonte = fonte.find(s => s.id === servicoId);
    const subFonte = svcFonte?.subtitulos.find(sb => sb.id === subtituloId);
    if (!svcFonte || !subFonte) continue;
    const subCopy: Subtitulo = {
      ...subFonte,
      itens: subFonte.itens.map(it => ({ ...it }))
    };
    const idxSvc = next.findIndex(s => s.id === servicoId);
    if (idxSvc < 0) {
      next.push({ id: svcFonte.id, nome: svcFonte.nome, subtitulos: [subCopy] });
    } else {
      const svc = next[idxSvc]!;
      if (!svc.subtitulos.some(sb => sb.id === subtituloId)) {
        next[idxSvc] = { ...svc, subtitulos: [...svc.subtitulos, subCopy] };
      }
    }
    blocosPresentes.add(bk);
  }
  return next;
}

/** Parse número no formato brasileiro (ex.: 1.416,00) para campos da planilha analítica. */
function parsePlanilhaPtBr(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta número digitado (aceita "=8*10" e decimal com vírgula). */
function parseCalcOrNumber(raw: string): number | null {
  const r = evalSimpleExpr(raw);
  if (r !== null) return r;
  const rawSemIgual = String(raw || '').trim().replace(/^=/, '').replace(/,/g, '.');
  if (!rawSemIgual) return null;
  const n = Number(rawSemIgual);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta número da planilha (pt-BR), também aceitando fórmula com "=". */
function parsePlanilhaCalcOrPtBr(raw: string): number | null {
  const r = evalSimpleExpr(raw);
  if (r !== null) return r;
  return parsePlanilhaPtBr(raw);
}

/**
 * Parse ao sair do campo (blur) na memória de cálculo / dimensões: evita que decimais com ponto
 * (ex.: "1.3" vindos de `String(número)` ou digitação en-US) sejam lidos como milhar pt-BR
 * (`parsePlanilhaPtBr` removeria o ponto e viraria "13").
 */
function parseMedicaoBlurNumber(raw: string): number | null {
  const r = evalSimpleExpr(raw);
  if (r !== null) return r;
  const t = String(raw ?? '')
    .trim()
    .replace(/^=/, '')
    .trim();
  if (!t) return null;
  if (t.includes(',')) {
    return parsePlanilhaPtBr(t);
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const normalized = t.replace(/\./g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Converte campo percentual (ex.: "25,01") para decimal (0.2501). */
function parsePercentualMeta(raw: string | undefined): number {
  if (!raw) return 0;
  const limpo = String(raw).replace('%', '').trim();
  if (!limpo) return 0;
  const n = parsePlanilhaPtBr(limpo);
  if (n === null || !Number.isFinite(n)) return 0;
  return n / 100;
}

function tipoPlanilhaInsumo(categoria: string): string {
  const u = categoria.toUpperCase();
  if (u.includes('MÃO') || u.includes('OBRA')) return 'MO';
  return 'MA';
}

/** Migra sessões antigas que gravavam MAT → MA. */
function normalizarPlanilhaTipoInsumo(
  raw: Record<string, unknown> | undefined | null
): Record<string, 'MO' | 'MA' | 'LO'> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, 'MO' | 'MA' | 'LO'> = {};
  for (const [k, v] of Object.entries(raw)) {
    const s = String(v ?? '');
    if (s === 'MAT' || s === 'MA') out[k] = 'MA';
    else if (s === 'MO' || s === 'LO') out[k] = s;
  }
  return out;
}

/** Exibição na ficha/export (compatível com legado MAT). */
function tipoFichaDemandaLabel(tipo: string | undefined): string {
  if (!tipo) return '—';
  return tipo === 'MAT' ? 'MA' : tipo;
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
  if (lev >= 80.99) {
    return 'font-medium bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200';
  }
  return '';
}

/** Formatação condicional col. % Valor total. */
function classeValorTotalCondicional(valorPct: number): string {
  if (!Number.isFinite(valorPct)) return '';
  if (valorPct >= 0 && valorPct <= 49) {
    return 'bg-green-50 text-green-950 dark:bg-green-950/35 dark:text-green-100';
  }
  if (valorPct >= 50 && valorPct <= 60) {
    return 'font-medium bg-yellow-50 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200';
  }
  if (valorPct >= 61) {
    return 'font-medium bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200';
  }
  return '';
}

type EmployeeOption = {
  id: string;
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
};

/** Estado da montagem do orçamento (persistido por contrato). */
interface SessaoOrcamentoPersist {
  subtitulosNoOrcamento: string[];
  quantidadesPorItem: Record<string, number>;
  dimensoesPorItem: Record<string, DimensoesItem>;
  /** Planilha analítica: chaves = linha analítica (composição ou insumo). */
  planilhaQuantidadeCompra: Record<string, number>;
  planilhaValorUnitCompraReal: Record<string, number>;
  planilhaTipoInsumo: Record<string, 'MO' | 'MA' | 'LO'>;
  meta?: OrcamentoMeta;
  /**
   * Chaves `servicoId|subtituloId|chave` ocultas na montagem (removidas pelo usuário).
   * Não apagamos do catálogo `servicos` para poder restaurar sem reimportar.
   */
  itensOcultosNoOrcamento?: string[];
  /** Chaves `${composicaoKey}|insumo|${i}` ocultas na aba Orçamento analítico. */
  insumosAnaliticoOcultos?: string[];
  /**
   * Só em orçamentos `meta.importadoPlanilha`: árvore de serviços deste documento (importação + blocos adicionados).
   * O catálogo da planilha perfeita do contrato continua em `servicos-padrao.json` e vem em GET `servicos`.
   */
  servicosDocumento?: ServicoPadrao[];
  /** Prazos e andamento por item/bloco do orçamento (aba Cronograma). */
  cronograma?: CronogramaPersist;
}

interface OrcamentoRecoverySnapshot {
  createdAt: string;
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist;
}

function sessaoVazia(): SessaoOrcamentoPersist {
  return {
    subtitulosNoOrcamento: [],
    quantidadesPorItem: {},
    dimensoesPorItem: {},
    planilhaQuantidadeCompra: {},
    planilhaValorUnitCompraReal: {},
    planilhaTipoInsumo: {},
    itensOcultosNoOrcamento: [],
    insumosAnaliticoOcultos: [],
    cronograma: cronogramaVazio(),
    meta: {
      osNumeroPasta: '',
      dataAbertura: '',
      dataEnvio: '',
      prazoExecucaoDias: '',
      responsavelOrcamento: '',
      descricao: '',
      orcamentoRealizadoPor: '',
      descontoPercentual: '25,01',
      bdiPercentual: '28,35',
      reajustes: ORCAMENTO_REAJUSTES_PADRAO.map((r) => ({ ...r })),
      revisaoCount: 0,
      statusAprovacao: 'rascunho'
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
          descontoPercentual:
            typeof metaRaw.descontoPercentual === 'string' ? metaRaw.descontoPercentual : '25,01',
          bdiPercentual: typeof metaRaw.bdiPercentual === 'string' ? metaRaw.bdiPercentual : '28,35',
          reajustes: Array.isArray(metaRaw.reajustes)
            ? metaRaw.reajustes.map((r: any, idx: number) => ({
                nome: typeof r?.nome === 'string' && r.nome.trim()
                  ? r.nome
                  : `Reajuste ${idx + 1}`,
                percentual: typeof r?.percentual === 'string' ? r.percentual : ''
              }))
            : ORCAMENTO_REAJUSTES_PADRAO.map((r) => ({ ...r })),
          revisaoCount:
            typeof metaRaw.revisaoCount === 'number' && isFinite(metaRaw.revisaoCount) ? metaRaw.revisaoCount : 0,
          importadoPlanilha: metaRaw.importadoPlanilha === true,
          usarMemoriaCalculo:
            typeof metaRaw.usarMemoriaCalculo === 'boolean' ? metaRaw.usarMemoriaCalculo : undefined,
          modoArredondamento:
            metaRaw.modoArredondamento === 'truncar' ||
            metaRaw.modoArredondamento === 'arredondar' ||
            metaRaw.modoArredondamento === 'nenhum'
              ? metaRaw.modoArredondamento
              : undefined,
          orcafascioBudgetId: parseOrcafascioBudgetIdMeta(metaRaw),
          orcafascioDados: parseOrcafascioDadosMeta(metaRaw.orcafascioDados),
          statusAprovacao: normalizarStatusAprovacaoOrcamento(metaRaw.statusAprovacao),
          fichaDemandaPct: (() => {
            const n = Number(metaRaw.fichaDemandaPct);
            return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
          })(),
          totalComBdi: (() => {
            const n = Number(metaRaw.totalComBdi);
            if (!Number.isFinite(n) || n <= 0) return undefined;
            // Total semeado do sintético Orçafascio costuma divergir da montagem — ignora.
            const orca = Number(
              metaRaw.totaisOrcafascio && typeof metaRaw.totaisOrcafascio === 'object'
                ? (metaRaw.totaisOrcafascio as { comBdi?: unknown }).comBdi
                : undefined
            );
            if (Number.isFinite(orca) && Math.abs(n - orca) < 0.02) return undefined;
            return n;
          })(),
          cronogramaResumo: normalizarCronogramaResumoMeta(metaRaw.cronogramaResumo),
          fichaDemandaApprovalId:
            typeof metaRaw.fichaDemandaApprovalId === 'string' && metaRaw.fichaDemandaApprovalId.trim()
              ? metaRaw.fichaDemandaApprovalId.trim()
              : undefined,
        totaisOrcafascio: (() => {
          const t = metaRaw.totaisOrcafascio;
          if (!t || typeof t !== 'object') return undefined;
          const semBdi = Number((t as { semBdi?: unknown }).semBdi);
          const bdi = Number((t as { bdi?: unknown }).bdi);
          const comBdi = Number((t as { comBdi?: unknown }).comBdi);
          if (![semBdi, bdi, comBdi].every((n) => Number.isFinite(n))) return undefined;
          return { semBdi, bdi, comBdi };
        })(),
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
      planilhaTipoInsumo:
        p.planilhaTipoInsumo && typeof p.planilhaTipoInsumo === 'object'
          ? normalizarPlanilhaTipoInsumo(p.planilhaTipoInsumo as Record<string, unknown>)
          : {},
      itensOcultosNoOrcamento: Array.isArray(p.itensOcultosNoOrcamento) ? p.itensOcultosNoOrcamento : [],
      insumosAnaliticoOcultos: Array.isArray(p.insumosAnaliticoOcultos) ? p.insumosAnaliticoOcultos : [],
      cronograma: normalizarCronograma((p as { cronograma?: unknown }).cronograma),
      meta,
      ...(Array.isArray(p.servicosDocumento) ? { servicosDocumento: p.servicosDocumento as ServicoPadrao[] } : {})
    };
  } catch {
    return null;
  }
}

function sessaoTemDados(s: SessaoOrcamentoPersist | null | undefined): boolean {
  if (!s) return false;
  return (
    s.subtitulosNoOrcamento.length > 0 ||
    (s.itensOcultosNoOrcamento ?? []).length > 0 ||
    Object.keys(s.quantidadesPorItem).length > 0 ||
    Object.keys(s.dimensoesPorItem).length > 0 ||
    Object.keys(s.planilhaQuantidadeCompra ?? {}).length > 0 ||
    Object.keys(s.planilhaValorUnitCompraReal ?? {}).length > 0 ||
    Object.keys(s.planilhaTipoInsumo ?? {}).length > 0
  );
}

/** Evita tratar o catálogo do contrato como árvore do documento importado após reload. */
function arvoreServicosPareceCatalogoContrato(
  arvore: ServicoPadrao[],
  catalogo: ServicoPadrao[]
): boolean {
  if (arvore.length === 0 || catalogo.length === 0) return false;
  try {
    return JSON.stringify(arvore) === JSON.stringify(catalogo);
  } catch {
    return false;
  }
}

function loadOrcamentoSnapshots(centroCustoId: string | null, orcamentoId: string | null): OrcamentoRecoverySnapshot[] {
  if (typeof window === 'undefined' || !centroCustoId || !orcamentoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'snapshots', orcamentoId));
    const parsed = s ? JSON.parse(s) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrcamentoSnapshot(
  centroCustoId: string | null,
  orcamentoId: string | null,
  payload: { servicos: ServicoPadrao[]; imports: ImportRecord[]; sessaoOrcamento: SessaoOrcamentoPersist }
) {
  if (typeof window === 'undefined' || !centroCustoId || !orcamentoId) return;
  try {
    const current = loadOrcamentoSnapshots(centroCustoId, orcamentoId);
    const next: OrcamentoRecoverySnapshot[] = [
      ...current,
      {
        createdAt: new Date().toISOString(),
        servicos: servicosParaLocalStorage(servicosSemQuantidadePlanilha(payload.servicos)),
        imports: payload.imports,
        sessaoOrcamento: sessaoOrcamentoParaSnapshot(payload.sessaoOrcamento)
      }
    ];
    const limited = next.slice(-ORCAMENTO_SNAPSHOT_MAX);
    localStorage.setItem(storageKey(centroCustoId, 'snapshots', orcamentoId), JSON.stringify(limited));
  } catch {
    /* quota */
  }
}

function getLatestUsefulSnapshot(
  centroCustoId: string | null,
  orcamentoId: string | null
): OrcamentoRecoverySnapshot | null {
  const snapshots = loadOrcamentoSnapshots(centroCustoId, orcamentoId);
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const sn = snapshots[i];
    if (!sn) continue;
    const hasData =
      Array.isArray(sn.servicos) && sn.servicos.length > 0 ||
      Array.isArray(sn.imports) && sn.imports.length > 0 ||
      sessaoTemDados(sn.sessaoOrcamento);
    if (hasData) return sn;
  }
  return null;
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
  if (typeof window === 'undefined') return;
  const key = storageKey(centroCustoId, 'servicos');
  const payload = servicosParaLocalStorage(servicosSemQuantidadePlanilha(servicos));
  const tryWrite = () => localStorage.setItem(key, JSON.stringify(payload));

  try {
    tryWrite();
    return;
  } catch (err) {
    if (!isLocalStorageQuotaError(err)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Não foi possível salvar serviços no armazenamento local:', err);
      }
      return;
    }
  }

  for (const level of [1, 2, 3] as const) {
    evictOrcamentoDraftStorage(centroCustoId, level);
    try {
      tryWrite();
      return;
    } catch {
      /* tenta nível seguinte */
    }
  }

  const now = Date.now();
  if (now - servicosLocalStorageQuotaWarnAt > 60_000) {
    servicosLocalStorageQuotaWarnAt = now;
    console.warn(
      'Armazenamento local cheio: rascunho dos serviços não coube. Os snapshots de recuperação e parte do cache local foram limpos; use Salvar no servidor para não perder dados. Se o aviso voltar, limpe dados do site ou reduza o tamanho do orçamento.'
    );
  }
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
  try {
    localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(list));
  } catch (err) {
    console.warn('Não foi possível salvar histórico de importações no armazenamento local:', err);
  }
}

async function fetchOrcamentosLista(centroCustoId: string): Promise<{
  orcamentos: OrcamentoListaEntry[];
  ultimoOrcamentoId: string | null;
}> {
  const res = await api.get(`/orcamento/${centroCustoId}`, { timeout: 60000 });
  const d = res.data;
  return {
    orcamentos: Array.isArray(d?.orcamentos) ? d.orcamentos : [],
    ultimoOrcamentoId: d?.ultimoOrcamentoId ?? null
  };
}

const ORCAMENTOS_LISTA_STALE_MS = 60_000;
const orcamentosListaCache = new Map<
  string,
  {
    data: {
      orcamentos: { id: string; nome: string; updatedAt: string }[];
      ultimoOrcamentoId: string | null;
    };
    fetchedAt: number;
  }
>();

function peekOrcamentosListaCache(centroCustoId: string) {
  const hit = orcamentosListaCache.get(centroCustoId);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt >= ORCAMENTOS_LISTA_STALE_MS) return null;
  return hit.data;
}

function seedOrcamentosListaCache(
  centroCustoId: string,
  data: {
    orcamentos: { id: string; nome: string; updatedAt: string }[];
    ultimoOrcamentoId: string | null;
  }
) {
  orcamentosListaCache.set(centroCustoId, { data, fetchedAt: Date.now() });
}

/** Retry curto — falhas intermitentes de S3/rede/token não devem derrubar a tela. */
async function fetchOrcamentosListaComRetry(
  centroCustoId: string,
  attempts = 3
): Promise<{
  orcamentos: { id: string; nome: string; updatedAt: string }[];
  ultimoOrcamentoId: string | null;
}> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchOrcamentosLista(centroCustoId);
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string; name?: string })?.code;
      if (code === 'ERR_CANCELED' || (err as { name?: string })?.name === 'CanceledError') {
        throw err;
      }
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 350 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function parseOrcamentoDetailRaw(d: {
  servicos?: unknown;
  imports?: unknown;
  sessaoOrcamento?: unknown;
}): {
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist | null;
} | null {
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
        descontoPercentual:
          typeof metaRaw.descontoPercentual === 'string' ? metaRaw.descontoPercentual : '25,01',
        bdiPercentual: typeof metaRaw.bdiPercentual === 'string' ? metaRaw.bdiPercentual : '28,35',
        reajustes: Array.isArray(metaRaw.reajustes)
          ? metaRaw.reajustes.map((r: any, idx: number) => ({
              nome: typeof r?.nome === 'string' && r.nome.trim()
                ? r.nome
                : `Reajuste ${idx + 1}`,
              percentual: typeof r?.percentual === 'string' ? r.percentual : ''
            }))
          : ORCAMENTO_REAJUSTES_PADRAO.map((r) => ({ ...r })),
        revisaoCount:
          typeof metaRaw.revisaoCount === 'number' && isFinite(metaRaw.revisaoCount) ? metaRaw.revisaoCount : 0,
        importadoPlanilha: metaRaw.importadoPlanilha === true,
        usarMemoriaCalculo:
          typeof metaRaw.usarMemoriaCalculo === 'boolean' ? metaRaw.usarMemoriaCalculo : undefined,
        modoArredondamento:
          metaRaw.modoArredondamento === 'truncar' ||
          metaRaw.modoArredondamento === 'arredondar' ||
          metaRaw.modoArredondamento === 'nenhum'
            ? metaRaw.modoArredondamento
            : undefined,
        orcafascioBudgetId: parseOrcafascioBudgetIdMeta(metaRaw),
        orcafascioDados: parseOrcafascioDadosMeta(metaRaw.orcafascioDados),
        statusAprovacao: normalizarStatusAprovacaoOrcamento(metaRaw.statusAprovacao),
        fichaDemandaPct: (() => {
          const n = Number(metaRaw.fichaDemandaPct);
          return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
        })(),
        totalComBdi: (() => {
          const n = Number(metaRaw.totalComBdi);
          if (!Number.isFinite(n) || n <= 0) return undefined;
          const orca = Number(
            metaRaw.totaisOrcafascio && typeof metaRaw.totaisOrcafascio === 'object'
              ? (metaRaw.totaisOrcafascio as { comBdi?: unknown }).comBdi
              : undefined
          );
          if (Number.isFinite(orca) && Math.abs(n - orca) < 0.02) return undefined;
          return n;
        })(),
        cronogramaResumo: normalizarCronogramaResumoMeta(metaRaw.cronogramaResumo),
        fichaDemandaApprovalId:
          typeof metaRaw.fichaDemandaApprovalId === 'string' && metaRaw.fichaDemandaApprovalId.trim()
            ? metaRaw.fichaDemandaApprovalId.trim()
            : undefined,
        totaisOrcafascio: (() => {
          const t = metaRaw.totaisOrcafascio;
          if (!t || typeof t !== 'object') return undefined;
          const semBdi = Number((t as { semBdi?: unknown }).semBdi);
          const bdi = Number((t as { bdi?: unknown }).bdi);
          const comBdi = Number((t as { comBdi?: unknown }).comBdi);
          if (![semBdi, bdi, comBdi].every((n) => Number.isFinite(n))) return undefined;
          return { semBdi, bdi, comBdi };
        })(),
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
          planilhaTipoInsumo:
            so.planilhaTipoInsumo && typeof so.planilhaTipoInsumo === 'object'
              ? normalizarPlanilhaTipoInsumo(so.planilhaTipoInsumo as Record<string, unknown>)
              : {},
          itensOcultosNoOrcamento: Array.isArray(so.itensOcultosNoOrcamento) ? so.itensOcultosNoOrcamento : [],
          cronograma: normalizarCronograma(so.cronograma),
          meta,
          ...(Array.isArray(so.servicosDocumento) ? { servicosDocumento: so.servicosDocumento as ServicoPadrao[] } : {})
        }
      : null;
  return {
    servicos: Array.isArray(d.servicos) ? (d.servicos as ServicoPadrao[]) : [],
    imports: Array.isArray(d.imports) ? (d.imports as ImportRecord[]) : [],
    sessaoOrcamento
  };
}

async function fetchOrcamentoDetail(centroCustoId: string, orcamentoId: string): Promise<{
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist | null;
} | null> {
  try {
    const cached = await loadOrcamentoDetailCached(centroCustoId, orcamentoId);
    if (!cached) return null;
    return parseOrcamentoDetailRaw(cached);
  } catch {
    return null;
  }
}

/** Pinta na hora com o que já está no aparelho (RAM / sessão / backup). O GET só confirma. */
function tryHydrateLocalOrcamento(
  centroCustoId: string,
  orcamentoId: string
): {
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist | null;
} | null {
  const cachedRaw = peekOrcamentoDetailCache(centroCustoId, orcamentoId);
  if (cachedRaw) {
    const parsed = parseOrcamentoDetailRaw(cachedRaw);
    if (parsed) return parsed;
  }
  const sessaoLocal = loadSessaoOrcamento(centroCustoId, orcamentoId);
  const doc = sessaoLocal?.servicosDocumento;
  if (Array.isArray(doc) && doc.length > 0) {
    return {
      servicos: doc,
      imports: loadImports(centroCustoId),
      sessaoOrcamento: sessaoLocal,
    };
  }
  const snapshot = getLatestUsefulSnapshot(centroCustoId, orcamentoId);
  if (snapshot && Array.isArray(snapshot.servicos) && snapshot.servicos.length > 0) {
    return {
      servicos: snapshot.servicos,
      imports: Array.isArray(snapshot.imports) ? snapshot.imports : loadImports(centroCustoId),
      sessaoOrcamento: snapshot.sessaoOrcamento ?? sessaoLocal,
    };
  }
  return null;
}

/**
 * Monta o body do PUT. Orçamentos importados enviam `servicos` só no **arquivo deste orçamento**
 * (espelho de `servicosDocumento`), para `getOrcamento` não preencher `servicos` com o catálogo
 * do contrato quando a chave root não existia — caso em que o F5 mostrava a base e “sumiam” as composições.
 */
function montarPayloadSalvarOrcamento(
  servicos: ServicoPadrao[],
  imports: ImportRecord[],
  sessao: SessaoOrcamentoPersist
): {
  servicos?: ServicoPadrao[];
  imports?: ImportRecord[];
  sessaoOrcamento?: SessaoOrcamentoPersist | null;
} {
  if (sessao.meta?.importadoPlanilha === true) {
    const doc = servicosSemQuantidadePlanilha(servicos);
    return {
      imports,
      servicos: doc,
      sessaoOrcamento: {
        ...sessao,
        servicosDocumento: doc
      }
    };
  }
  const { servicosDocumento: _doc, ...sessaoSemDoc } = sessao;
  return {
    servicos,
    imports,
    sessaoOrcamento: sessaoSemDoc
  };
}

/** Importação/gravação de orçamento grande no S3 passa fácil dos 30s padrão do axios. */
const ORCAMENTO_API_WRITE_TIMEOUT_MS = 240000;

function isOrcamentoRequestTimeout(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : String((err as { message?: string } | null)?.message || '');
  return code === 'ECONNABORTED' || /timeout/i.test(message);
}

async function saveOrcamentoToApi(
  centroCustoId: string,
  orcamentoId: string,
  data: {
    servicos?: ServicoPadrao[];
    imports?: ImportRecord[];
    sessaoOrcamento?: SessaoOrcamentoPersist | null;
  }
): Promise<void> {
  await api.put(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, data, {
    timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
  });
  seedOrcamentoDetailCache(centroCustoId, orcamentoId, {
    servicos: data.servicos,
    imports: data.imports,
    sessaoOrcamento: data.sessaoOrcamento ?? null,
  });
}

async function criarOrcamentoApi(
  centroCustoId: string,
  nome?: string
): Promise<{ id: string; nome: string; updatedAt: string }> {
  const res = await api.post(`/orcamento/${centroCustoId}/orcamentos`, { nome }, {
    timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
  });
  return res.data;
}

async function excluirOrcamentoApi(centroCustoId: string, orcamentoId: string): Promise<void> {
  await api.delete(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, {
    timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
  });
  invalidateOrcamentoDetailCache(centroCustoId, orcamentoId);
}

async function renomearOrcamentoApi(centroCustoId: string, orcamentoId: string, nome: string): Promise<void> {
  await api.patch(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, { nome }, {
    timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
  });
}

async function saveServicosPadraoToApi(
  centroCustoId: string,
  data: { servicos: ServicoPadrao[]; imports: ImportRecord[] }
): Promise<void> {
  await api.put(`/orcamento/${centroCustoId}/servicos-padrao`, data, {
    timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
  });
}

async function fetchServicosPadraoFromApi(
  centroCustoId: string
): Promise<{ servicos: ServicoPadrao[]; imports: ImportRecord[] } | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}/servicos-padrao`, {
      timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
    });
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

const COMPOSICOES_GERAL_STALE_MS = 10 * 60 * 1000;
let composicoesGeralCache: { items: ComposicaoItem[]; fetchedAt: number } | null = null;
let composicoesGeralInflight: Promise<ComposicaoItem[]> | null = null;

async function fetchComposicoesGeral(): Promise<ComposicaoItem[]> {
  const now = Date.now();
  if (
    composicoesGeralCache &&
    now - composicoesGeralCache.fetchedAt < COMPOSICOES_GERAL_STALE_MS
  ) {
    return composicoesGeralCache.items;
  }
  if (composicoesGeralInflight) return composicoesGeralInflight;
  composicoesGeralInflight = (async () => {
    try {
      const res = await api.get('/orcamento/composicoes/geral', { timeout: 90000 });
      const items = Array.isArray(res.data) ? (res.data as ComposicaoItem[]) : [];
      composicoesGeralCache = { items, fetchedAt: Date.now() };
      return items;
    } catch {
      return composicoesGeralCache?.items ?? [];
    } finally {
      composicoesGeralInflight = null;
    }
  })();
  return composicoesGeralInflight;
}

async function saveComposicoesGeralToApi(items: ComposicaoItem[]) {
  try {
    await api.put('/orcamento/composicoes/geral', { items }, {
      timeout: ORCAMENTO_API_WRITE_TIMEOUT_MS,
    });
    composicoesGeralCache = { items, fetchedAt: Date.now() };
  } catch (err) {
    console.warn('Erro ao salvar composições no S3:', err);
  }
}

function parsePreco(val: any): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  let s = String(val).replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
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

/** Mesmo capítulo repetido no subtítulo (ex.: "PINTURAS" e "PINTURAS EM TETO" com ITEM nível 1 nas duas). */
function descricaoPareceSubtituloDoBloco(descricao: string, nomeTopico: string): boolean {
  const d = normalizarTextoBusca(descricao);
  const t = normalizarTextoBusca(nomeTopico);
  if (!d || !t || t.length < 4) return false;
  if (d === t) return true;
  if (d.startsWith(`${t} `)) return true;
  if (d.startsWith(`${t}-`) || d.startsWith(`${t}—`)) return true;
  if (d.startsWith(t) && d.length > t.length) {
    const next = d.charAt(t.length);
    if (next === ' ' || next === '-' || next === '—' || next === ':' || next === '.') return true;
  }
  return false;
}

/** Cabeçalhos alinhados ao export detalhado; colunas de importação: ITEM, CÓDIGO, BANCO, DESCRIÇÃO, MAT + M.O., MÃO DE OBRA, MATERIAL (use "MÃO DE OBRA", não "M.O." — o importador não reconhece "M.O." sozinho). */
const MODELO_ORCAMENTO_PERFEITO_COLS = [
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
] as const;

const MODELO_ORCAMENTO_COL_WIDTHS = [
  { wch: 10 },
  { wch: 14 },
  { wch: 12 },
  { wch: 16 },
  { wch: 52 },
  { wch: 10 },
  { wch: 12 },
  { wch: 14 },
  { wch: 12 },
  { wch: 14 },
  { wch: 16 },
  { wch: 14 },
  { wch: 16 },
  { wch: 10 }
];

/** Planilha modelo: aba Orçamento já começa no cabeçalho (linha 1). Instruções ficam na 2ª aba. */
function baixarModeloOrcamentoPerfeitoXlsx() {
  const nCol = MODELO_ORCAMENTO_PERFEITO_COLS.length;
  const pad = (cells: (string | number)[]) => {
    const row = [...cells];
    while (row.length < nCol) row.push('');
    return row;
  };

  const dados: (string | number)[][] = [
    pad([...MODELO_ORCAMENTO_PERFEITO_COLS]),
    pad(['1', '', '', '', 'Pintura de paredes', '', '', '', '', '', '', '', '', '']),
    pad(['1.1', '', '', '', 'Área interna', '', '', '', '', '', '', '', '', '']),
    pad(['1.1.1', '88495', 'SINAPI', '88495SINAPI', 'Pintura látex PVA duas demãos', 'M2', 10, '8,50', '12,30', '20,80', '', '', '', '']),
    pad(['1.1.2', '88496', 'SINAPI', '88496SINAPI', 'Massa corrida PVA', 'M2', 10, '6,20', '9,40', '15,60', '', '', '', '']),
    pad(['2', '', '', '', 'Instalação elétrica', '', '', '', '', '', '', '', '', '']),
    pad(['2.1', '', '', '', 'Pontos de tomada', '', '', '', '', '', '', '', '', '']),
    pad(['2.1.1', '91737', 'SINAPI', '91737SINAPI', 'Ponto de tomada 2P+T 10A', 'UN', 4, '22,00', '18,50', '40,50', '', '', '', '']),
  ];

  const wsDados = XLSX.utils.aoa_to_sheet(dados);
  wsDados['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: dados.length - 1, c: nCol - 1 }
  });
  wsDados['!cols'] = MODELO_ORCAMENTO_COL_WIDTHS;
  wsDados['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(nCol - 1)}1` };
  wsDados['!views'] = [{ state: 'frozen', ySplit: 1, topLeft: 'A2' }];

  const instrucoes: (string | number)[][] = [
    ['Como importar'],
    [''],
    ['Use a aba Orçamento. A primeira linha já é o cabeçalho — não renomeie as colunas.'],
    ['Apague as linhas de exemplo e cole os dados reais a partir da linha 2.'],
    [''],
    ['Coluna', 'O que preencher'],
    ['ITEM', '1 = serviço; 1.1 = subtítulo; 1.1.1 = composição'],
    ['CÓDIGO', 'Obrigatório só na linha da composição (ex.: 88495)'],
    ['BANCO', 'Obrigatório na composição (ex.: SINAPI)'],
    ['CHAVE', 'Opcional (código + banco juntos)'],
    ['DESCRIÇÃO', 'Nome do serviço, do subtítulo ou da composição'],
    ['UNIDADE', 'Opcional (M2, UN, M3…)'],
    ['QUANTIDADE', 'Opcional'],
    ['MÃO DE OBRA', 'Preço unitário de mão de obra'],
    ['MATERIAL', 'Preço unitário de material'],
    ['MAT + M.O', 'Preço unitário total (mão de obra + material)'],
    ['SUB… e PESO %', 'Opcionais — o sistema calcula se ficar em branco'],
    [''],
    ['Não use a coluna ITEM com texto. Serviço/subtítulo: preencha só ITEM + DESCRIÇÃO.'],
  ];
  const wsHelp = XLSX.utils.aoa_to_sheet(instrucoes);
  wsHelp['!cols'] = [{ wch: 18 }, { wch: 72 }];
  if (!wsHelp['!merges']) wsHelp['!merges'] = [];
  wsHelp['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });
  wsHelp['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } });
  wsHelp['!merges'].push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDados, 'Orçamento');
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Instruções');
  XLSX.writeFile(wb, `modelo-orcamento-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

/** Agrupa preço de compra real no rodapé: prioriza o tipo escolhido na planilha (MO/MA/LO). */
function grupoPrecoCompraInsumoPlanilha(
  key: string,
  categoria: string,
  descricao: string,
  planilhaTipo: Record<string, 'MO' | 'MA' | 'LO'>
): 'MA' | 'MO' | 'LO' {
  const raw = planilhaTipo[key];
  const t = String(raw ?? '') === 'MAT' ? 'MA' : raw;
  if (t === 'MO' || t === 'MA' || t === 'LO') return t;
  return grupoPrecoCompraInsumoRodape(categoria, descricao);
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

type ParsePlanilhaOrcamentoPerfeitoResult =
  | { ok: true; servicos: ServicoPadrao[]; composicoesAnaliticas: ComposicaoItem[] }
  | { ok: false; message: string };

/** Índices de coluna após normalizar cabeçalhos (NFD, minúsculas). */
function indicesColunasOrcamentoPerfeito(header: string[]) {
  const itemIdx = header.findIndex(
    h => h === 'item' || h === 'itens' || h.startsWith('item ') || h.startsWith('item.')
  );
  const codigoIdx = header.findIndex(h => h.includes('codigo'));
  const bancoIdx = header.findIndex(h => h === 'banco' || h.startsWith('banco') || /\bbanco\b/.test(h));
  const descIdx = header.findIndex(h => {
    if (!h.includes('descri')) return false;
    if (/^sub\s/.test(h)) return false;
    return true;
  });
  const matMoIdx = header.findIndex(h => {
    if (h.includes('sub mat') || /^sub\s/.test(h)) return false;
    return (
      (h.includes('mat') && (h.includes('m.o') || h.includes('m. o') || h.includes('mo'))) ||
      h === 'mat + m.o' ||
      h === 'mat+m.o' ||
      h.includes('mat+mo')
    );
  });
  const maoIdx = header.findIndex(h => {
    if (h.includes('sub mao') || /^sub\s/.test(h)) return false;
    return (
      (h.includes('mao') && h.includes('obra')) ||
      h === 'mo' ||
      h === 'm.o' ||
      h.startsWith('m.o')
    );
  });
  const materialIdx = header.findIndex(h => {
    if (h.includes('sub material') || /^sub\s/.test(h)) return false;
    return h === 'material' || h === 'mat' || h.includes(' material');
  });
  const quantidadeIdx = header.findIndex(h => {
    if (/^sub\s/.test(h)) return false;
    if (h.includes('quantidade real') || h.includes('qtd real')) return false;
    if (h === 'quantidade' || h === 'qtde' || h === 'qtd') return true;
    const semPonto = h.replace(/\./g, '');
    if (semPonto === 'quant' || semPonto.startsWith('quant ')) return true;
    return h.startsWith('quant') && !h.includes('real');
  });
  return {
    itemIdx,
    codigoIdx,
    bancoIdx,
    descIdx,
    matMoIdx,
    maoIdx,
    materialIdx,
    quantidadeIdx
  };
}

/** Localiza a linha do cabeçalho: planilhas exportadas (linha 1), títulos acima, ou modelo (linha 11). ITEM e BANCO são opcionais. */
function encontrarLinhaCabecalhoOrcamentoPerfeito(rows: any[][]): number | null {
  const maxScan = Math.min(rows.length, 60);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
    const { codigoIdx, descIdx } = indicesColunasOrcamentoPerfeito(header);
    if (codigoIdx >= 0 && descIdx >= 0) {
      return r;
    }
  }
  if (rows.length > 10) {
    const header = (rows[10] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
    const { codigoIdx, descIdx } = indicesColunasOrcamentoPerfeito(header);
    if (codigoIdx >= 0 && descIdx >= 0) {
      return 10;
    }
  }
  return null;
}

/** Primeira aba que contém cabeçalho de orçamento (CÓDIGO + DESCRIÇÃO). */
function encontrarPrimeiraPlanilhaOrcamentoNoArquivo(workbook: {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}): { rows: any[][]; headerRow: number } | null {
  for (let si = 0; si < workbook.SheetNames.length; si++) {
    const sheet = workbook.Sheets[workbook.SheetNames[si]];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    if (rows.length < 2) continue;
    const headerRow = encontrarLinhaCabecalhoOrcamentoPerfeito(rows);
    if (headerRow !== null) return { rows, headerRow };
  }
  return null;
}

/** Detecta cabeçalho de aba analítica (CÓDIGO/BANCO/DESCRIÇÃO/TIPO/UND...). */
function encontrarLinhaCabecalhoAnalitico(rows: any[][]): number | null {
  const maxScan = Math.min(rows.length, 80);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map((h: any) => normalizarCabecalhoColuna(String(h || '')));
    const temCodigo = header.some((h: string) => h.includes('codigo'));
    const temDescricao = header.some((h: string) => h.includes('descri'));
    const temTipo = header.some((h: string) => h === 'tipo');
    const temUnd = header.some((h: string) => h === 'und' || h === 'un' || h.includes('unidade'));
    if (temCodigo && temDescricao && (temTipo || temUnd)) return r;
  }
  return null;
}

/** Lê a 2ª aba (analítico) e associa insumos às composições; ignora coluna "Porcent." quando existir. */
function parseComposicoesAnaliticasDaSegundaAba(workbook: {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}, servicosImportados: ServicoPadrao[]): ComposicaoItem[] {
  if (workbook.SheetNames.length < 2) return [];
  const secondSheet = workbook.Sheets[workbook.SheetNames[1]];
  if (!secondSheet) return [];
  // raw:false preserva o valor formatado (evita Excel converter códigos em número e "comer" pontos/zeros).
  const rows = XLSX.utils.sheet_to_json(secondSheet, { header: 1, defval: '', raw: false }) as any[][];
  if (rows.length < 2) return [];

  const headerRow = encontrarLinhaCabecalhoAnalitico(rows);
  if (headerRow === null) return [];
  const header = (rows[headerRow] || []).map((h: any) => normalizarCabecalhoColuna(String(h || '')));

  const itemIdx = header.findIndex(h => h === 'item' || h === 'itens');
  const codigoIdx = header.findIndex(h => h.includes('codigo'));
  const codigoBancoIdx = header.findIndex(h => h.includes('codigobanco'));
  const bancoIdx = header.findIndex(h => h === 'banco');
  const descIdx = header.findIndex(h => h === 'descricao' || h.includes('descri'));
  const tipoIdx = header.findIndex(h => h === 'tipo'); // coluna "Tipo" da planilha (será ignorada no mapeamento do sistema)
  const undIdx = header.findIndex(h => h === 'und' || h === 'un' || h.includes('unidade'));
  const quantIdx = header.findIndex(h => h.includes('quant'));
  const valorUnitIdx = header.findIndex(h => h.includes('valorunit') || h === 'valoruni');
  const totalIdx = header.findIndex(h => h === 'total');

  // "Tipo" do sistema vem da 1ª coluna de linha (Composição/Insumo/Auxiliar...),
  // não da coluna "Tipo" da planilha (Conservação, Material, Equipamento...).
  const detectarColunaTipoLinha = (): number => {
    const candidates = new Map<number, number>();
    const start = Math.max(0, headerRow + 1);
    const end = Math.min(rows.length, start + 150);
    for (let r = start; r < end; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < Math.min(row.length, 8); c++) {
        const v = normalizarTextoBusca(String(row[c] ?? ''));
        if (!v) continue;
        if (v.includes('composicao') || v.includes('insumo') || v.includes('auxiliar')) {
          candidates.set(c, (candidates.get(c) ?? 0) + 1);
        }
      }
    }
    let bestIdx = -1;
    let bestScore = -1;
    candidates.forEach((score, idx) => {
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    // fallback: normalmente fica à esquerda de "Código"
    if (bestIdx < 0 && codigoIdx > 0) return codigoIdx - 1;
    return bestIdx;
  };
  const tipoLinhaIdx = detectarColunaTipoLinha();

  const detectarTipoLinhaPorRow = (row: any[]): string => {
    // Busca "Composição/Insumo/Auxiliar" nas primeiras colunas da linha,
    // porque em alguns blocos do Excel essa coluna muda de posição.
    const maxCols = Math.min(row.length, 6);
    for (let c = 0; c < maxCols; c++) {
      const raw = String(row[c] ?? '').trim();
      const n = normalizarTextoBusca(raw);
      if (!n) continue;
      if (n.includes('composicao') || n.includes('insumo') || n.includes('auxiliar')) {
        return n;
      }
    }
    const fallback = String((tipoLinhaIdx >= 0 ? row[tipoLinhaIdx] : '') || '').trim();
    return normalizarTextoBusca(fallback);
  };

  const refsByCodigo = new Map<string, Array<{ codigo: string; banco: string; chave: string }>>();
  for (const svc of servicosImportados) {
    for (const sub of svc.subtitulos) {
      for (const it of sub.itens) {
        const codigoNorm = String(it.codigo || '').replace(/[\s.]+/g, '').toUpperCase();
        if (!codigoNorm) continue;
        const arr = refsByCodigo.get(codigoNorm) ?? [];
        arr.push({
          codigo: String(it.codigo || '').trim(),
          banco: String(it.banco || '').trim(),
          chave: String(it.chave || normalizarChave(it.codigo, it.banco))
        });
        refsByCodigo.set(codigoNorm, arr);
      }
    }
  }

  const compMap = new Map<string, ComposicaoItem>();
  let composicaoAtualKey: string | null = null;

  const isTextoEstrutural = (val: string) => {
    const n = normalizarTextoBusca(val);
    return (
      n === 'composicao' ||
      n === 'insumo' ||
      n === 'item' ||
      n === 'auxiliar' ||
      n.includes('codigo') ||
      n.includes('banco') ||
      n.includes('descricao') ||
      n.includes('tipo')
    );
  };

  const limparTextoCelula = (val: unknown): string =>
    String(val ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .trim();

  const ehBancoProvavel = (val: string) => /^[A-Za-z]{2,12}(?:\/[A-Za-z]{1,12})*$/.test(val);
  const extrairBancoDeTexto = (val: string): string => {
    const t = limparTextoCelula(val);
    if (!t) return '';
    if (ehBancoProvavel(t)) return t;
    // Ex.: "CPOS/CH U" ou "CPOS/CH\nU" → pega só o token que parece banco.
    const tokens = t.split(' ').filter(Boolean);
    for (const tok of tokens) {
      if (ehBancoProvavel(tok)) return tok;
    }
    return '';
  };

  const parseCodigoBancoRow = (row: any[]): { codigo: string; banco: string } => {
    let codigo = codigoIdx >= 0 ? limparTextoCelula(row[codigoIdx]) : '';
    let banco = bancoIdx >= 0 ? extrairBancoDeTexto(limparTextoCelula(row[bancoIdx])) : '';

    // Em alguns arquivos, o código vem quebrado entre as colunas "Código" e "Banco" (ex.: "S" + "04 000 2672").
    if (codigo && banco && !/[0-9]/.test(codigo) && /[0-9]/.test(banco) && !isTextoEstrutural(banco)) {
      codigo = `${codigo} ${banco}`.trim();
      const bancoProximo = String(row[bancoIdx + 1] ?? '').trim();
      if (ehBancoProvavel(bancoProximo) && !isTextoEstrutural(bancoProximo)) banco = bancoProximo;
      else banco = '';
    }

    if ((!codigo || !banco) && codigoBancoIdx >= 0) {
      const codigoBancoRaw = limparTextoCelula(row[codigoBancoIdx]);
      if (codigoBancoRaw) {
        const parts = codigoBancoRaw.split(/\s+/).filter(Boolean);
        if (!codigo && parts.length >= 1) codigo = parts[0] ?? '';
        if (!banco && parts.length >= 2) banco = extrairBancoDeTexto(parts.slice(1).join(' '));
      }
      if (!banco) {
        const maybeBancoNext = limparTextoCelula(row[codigoBancoIdx + 1]);
        const b = extrairBancoDeTexto(maybeBancoNext);
        if (b && !isTextoEstrutural(b)) banco = b;
      }
    }

    // Heurística para layout com cabeçalhos mesclados: busca código/banco nas primeiras colunas úteis.
    const inicio = Math.max(0, Math.min(
      ...[itemIdx, codigoIdx, codigoBancoIdx, bancoIdx].filter((v) => v >= 0)
    ));
    const fim = Math.min(row.length - 1, Math.max(inicio + 6, descIdx >= 0 ? descIdx : inicio + 6));

    if (!codigo || isTextoEstrutural(codigo)) {
      for (let c = inicio; c <= fim; c++) {
        const val = limparTextoCelula(row[c]);
        if (!val || isTextoEstrutural(val)) continue;
        // Código costuma conter dígitos e pode ter pontos.
        if (/[0-9]/.test(val)) {
          codigo = val;
          break;
        }
      }
    }

    if (!banco || isTextoEstrutural(banco)) {
      for (let c = inicio; c <= fim; c++) {
        const val = limparTextoCelula(row[c]);
        if (!val || isTextoEstrutural(val)) continue;
        // Banco normalmente é sigla textual (FDE, SINAPI, ORSE, CPOS/CH, etc).
        const b = extrairBancoDeTexto(val);
        if (b) {
          banco = b;
          break;
        }
      }
    }

    // Fallback para linhas onde o código vem repartido, ex.: "S" + "04 000 2672".
    if (!codigo && bancoIdx > 0) {
      const codigoPrefixo = limparTextoCelula(row[bancoIdx - 1]);
      const codigoNumero = limparTextoCelula(row[bancoIdx]);
      if (/^[A-Za-z]{1,3}$/.test(codigoPrefixo) && /[0-9]/.test(codigoNumero)) {
        codigo = `${codigoPrefixo} ${codigoNumero}`.trim();
      }
      if (!banco) {
        const maybeBancoNext = limparTextoCelula(row[bancoIdx + 1]);
        if (ehBancoProvavel(maybeBancoNext) && !isTextoEstrutural(maybeBancoNext)) banco = maybeBancoNext;
      }
    }

    if (isTextoEstrutural(codigo)) codigo = '';
    if (banco && !ehBancoProvavel(banco)) banco = extrairBancoDeTexto(banco);
    if (isTextoEstrutural(banco)) banco = '';
    return { codigo, banco };
  };

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const parsedCodigoBanco = parseCodigoBancoRow(row);
    const codigo = parsedCodigoBanco.codigo;
    const banco = parsedCodigoBanco.banco;
    const descricao = descIdx >= 0 ? String(row[descIdx] ?? '').trim() : '';
    if (!descricao) continue;

    const chave = normalizarChave(codigo, banco);
    const tipoLinhaNorm = detectarTipoLinhaPorRow(row);
    const ehComposicaoAuxiliar = tipoLinhaNorm.includes('composicao') && tipoLinhaNorm.includes('auxiliar');
    const tipoLinhaRaw = tipoLinhaNorm
      ? (ehComposicaoAuxiliar
          ? 'Composição auxiliar'
          : tipoLinhaNorm.includes('composicao')
            ? 'Composição'
            : tipoLinhaNorm.includes('auxiliar')
              ? 'Auxiliar'
              : 'Insumo')
      : '';
    const ehComposicao = tipoLinhaNorm.includes('composicao') && !ehComposicaoAuxiliar;
    const ehInsumo = tipoLinhaNorm.includes('insumo') || tipoLinhaNorm.includes('auxiliar');
    if (!ehComposicao && !ehInsumo) continue;

    const codigoNormLinha = String(codigo || '').replace(/[\s.]+/g, '').toUpperCase();
    const ehComposicaoPrincipalDoOrcamento = codigoNormLinha ? refsByCodigo.has(codigoNormLinha) : false;
    const composicaoAninhada =
      ehComposicao &&
      !ehComposicaoPrincipalDoOrcamento &&
      !!composicaoAtualKey;

    if (ehComposicao && (codigo || banco || chave) && !composicaoAninhada) {
      const unidade = undIdx >= 0 ? String(row[undIdx] ?? '').trim() || undefined : undefined;
      const quantidade = quantIdx >= 0 ? parsePreco(row[quantIdx]) : 0;
      const total = totalIdx >= 0 ? parsePreco(row[totalIdx]) : 0;
      const precoUnitario = valorUnitIdx >= 0
        ? parsePreco(row[valorUnitIdx])
        : (quantidade > 0 ? total / quantidade : 0);
      const comp: ComposicaoItem = {
        codigo,
        banco,
        chave,
        descricao,
        unidade,
        precoUnitario,
        maoDeObraUnitario: 0,
        materialUnitario: 0,
        analiticoLinhas: compMap.get(chave)?.analiticoLinhas || []
      };
      compMap.set(chave, comp);
      composicaoAtualKey = chave;
      continue;
    }

    if (ehInsumo || composicaoAninhada) {
      const destinoKey = (chave && compMap.has(chave)) ? chave : composicaoAtualKey;
      if (!destinoKey) continue;
      const comp = compMap.get(destinoKey);
      if (!comp) continue;

      const unidade = undIdx >= 0 ? String(row[undIdx] ?? '').trim() || 'un' : 'un';
      const quantidade = quantIdx >= 0 ? parsePreco(row[quantIdx]) : 0;
      const precoUnitario = valorUnitIdx >= 0 ? parsePreco(row[valorUnitIdx]) : 0;
      const totalInsumo = totalIdx >= 0 ? parsePreco(row[totalIdx]) : (quantidade * precoUnitario);
      const tipoPlanilhaTexto = normalizarTextoBusca(String((tipoIdx >= 0 ? row[tipoIdx] : '') || ''));
      const categoria: CategoriaAnalitico =
        composicaoAninhada
          ? 'MATERIAL'
          : (tipoPlanilhaTexto.includes('mao de obra') || normalizarTextoBusca(descricao).includes('servente'))
          ? 'MÃO DE OBRA'
          : 'MATERIAL';
      // Composição aninhada: espelha a primeira coluna da planilha ("Composição" vs "Composição auxiliar").
      const tipoLabel = composicaoAninhada ? (tipoLinhaRaw || 'Composição') : (tipoLinhaRaw || 'Insumo');

      comp.analiticoLinhas = [
        ...(comp.analiticoLinhas || []),
        {
          categoria,
          descricao,
          unidade,
          quantidade,
          precoUnitario,
          total: totalInsumo,
          codigo: codigo || undefined,
          banco: banco || undefined,
          tipoLabel
        }
      ];
      compMap.set(destinoKey, comp);
    }
  }

  return Array.from(compMap.values())
    .filter(c => c.analiticoLinhas && c.analiticoLinhas.length > 0)
    .map((c) => {
      const codigoNorm = String(c.codigo || '').replace(/[\s.]+/g, '').toUpperCase();
      const refs = refsByCodigo.get(codigoNorm) ?? [];
      if (refs.length === 1) {
        const ref = refs[0]!;
        return {
          ...c,
          codigo: c.codigo || ref.codigo,
          banco: c.banco || ref.banco,
          chave: c.chave || ref.chave
        };
      }
      return {
        ...c,
        chave: c.chave || normalizarChave(c.codigo, c.banco)
      };
    });
}

/** Lê planilha no formato orçamento perfeito; cabeçalho detectado automaticamente ou linha 11 (modelo). Sem efeitos colaterais. */
async function parsePlanilhaOrcamentoPerfeito(file: File): Promise<ParsePlanilhaOrcamentoPerfeitoResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const aba = encontrarPrimeiraPlanilhaOrcamentoNoArquivo(workbook);
    if (!aba) {
      return {
        ok: false,
        message:
          'Não foi possível localizar o cabeçalho em nenhuma aba. É necessário CÓDIGO e DESCRIÇÃO (ITEM e BANCO recomendados, como no modelo).'
      };
    }
    const { rows, headerRow: HEADER_ROW } = aba;
    const header = (rows[HEADER_ROW] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
    const { itemIdx, codigoIdx, bancoIdx, descIdx, matMoIdx, maoIdx, materialIdx, quantidadeIdx } =
      indicesColunasOrcamentoPerfeito(header);
    if (codigoIdx < 0 || descIdx < 0) {
      return {
        ok: false,
        message:
          'Cabeçalho não reconhecido. Inclua CÓDIGO e DESCRIÇÃO (ITEM e BANCO recomendados).'
      };
    }

    type ServicoImport = { nome: string; subtitulos: Map<string, ItemServico[]> };
    const servicosMap = new Map<string, ServicoImport>();

    let topicoAtual = '';
    let subdivisaoAtual = '';
    let lastRowWasItem = false;

    for (let i = HEADER_ROW + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const itemVal = itemIdx >= 0 ? String(row[itemIdx] ?? '').trim() : '';
      const codigo = String(row[codigoIdx] ?? '').trim();
      const banco = bancoIdx >= 0 ? String(row[bancoIdx] ?? '').trim() : '';
      const descricao = String(row[descIdx] ?? '').trim();
      const chave = normalizarChave(codigo, banco);
      const precoUnitario = matMoIdx >= 0 ? parsePreco(row[matMoIdx]) : 0;
      const maoDeObraUnitario = maoIdx >= 0 ? parsePreco(row[maoIdx]) : 0;
      const materialUnitario = materialIdx >= 0 ? parsePreco(row[materialIdx]) : 0;

      const semItemOuVazio = itemIdx < 0 || !itemVal;
      const partes = itemVal ? String(itemVal).split('.').filter(Boolean) : [];
      let nivel = partes.length;

      if (descricao && !codigo && !banco) {
        if (semItemOuVazio) {
          if (!topicoAtual || lastRowWasItem) {
            topicoAtual = descricao;
            subdivisaoAtual = '';
          } else if (!subdivisaoAtual) {
            subdivisaoAtual = descricao;
          } else if (topicoAtual && descricaoPareceSubtituloDoBloco(descricao, topicoAtual)) {
            subdivisaoAtual = descricao;
          } else {
            topicoAtual = descricao;
            subdivisaoAtual = '';
          }
          lastRowWasItem = false;
        } else {
          if (nivel === 1) {
            if (topicoAtual && descricaoPareceSubtituloDoBloco(descricao, topicoAtual)) {
              subdivisaoAtual = descricao;
            } else {
              topicoAtual = descricao;
              subdivisaoAtual = '';
            }
          } else if (nivel === 2) {
            subdivisaoAtual = descricao;
          } else if (nivel >= 3 && topicoAtual && descricaoPareceSubtituloDoBloco(descricao, topicoAtual)) {
            subdivisaoAtual = descricao;
          }
          lastRowWasItem = false;
        }
        continue;
      }

      if (semItemOuVazio && (codigo || banco) && descricao) {
        nivel = subdivisaoAtual ? 3 : 2;
      }

      if (!topicoAtual && (codigo || banco) && descricao) {
        topicoAtual = 'Serviços';
        subdivisaoAtual = '';
      }

      const ehItem = (codigo || banco) && descricao && nivel >= 2;
      if (ehItem && topicoAtual) {
        const nomeSubtitulo = subdivisaoAtual || topicoAtual;
        let quantidadePlanilha: number | undefined;
        if (quantidadeIdx >= 0) {
          const qv = parsePreco(row[quantidadeIdx]);
          if (qv > 0 && Number.isFinite(qv)) quantidadePlanilha = qv;
        }
        const item: ItemServico = {
          chave,
          codigo,
          banco,
          descricao,
          precoUnitario,
          maoDeObraUnitario,
          materialUnitario,
          ...(quantidadePlanilha != null ? { quantidadePlanilha } : {})
        };
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
        lastRowWasItem = true;
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
      return {
        ok: false,
        message:
          'Nenhum serviço encontrado. Confira se há linhas de itens com ITEM (ex.: 1.1.1), CÓDIGO ou BANCO e DESCRIÇÃO, e títulos de serviço (nível 1 e 2) sem código.'
      };
    }
    const composicoesAnaliticas = parseComposicoesAnaliticasDaSegundaAba(workbook, servicosImportados);
    return { ok: true, servicos: servicosImportados, composicoesAnaliticas };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message.trim() : '';
    if (detalhe) {
      console.error('Falha ao ler planilha de orçamento perfeito:', err);
      return {
        ok: false,
        message: `Não foi possível ler a planilha (${detalhe}). Verifique se o arquivo não está corrompido/protegido e se está em .xlsx, .xls ou .csv.`
      };
    }
    return {
      ok: false,
      message: 'Erro ao processar o arquivo. Verifique se a planilha está válida e em .xlsx, .xls ou .csv.'
    };
  }
}

function chavesParaBusca(codigo: string, banco: string, chave: string): string[] {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  const k = String(chave || '').trim();
  const codigoNorm = c.replace(/[\s.]+/g, '').toUpperCase();
  const bancoBase = b.split('/')[0]?.trim() || '';
  const bancoBaseNorm = bancoBase.replace(/[\s.]+/g, '').toUpperCase();
  const nk = normalizarChave(c, b);
  const uniq = new Set<string>();
  // `codigo+banco` primeiro: evita casar só o número com outra base no mapa (analítico trocado após F5).
  uniq.add(nk);
  const kNorm = k.replace(/[\s.]+/g, '').toUpperCase();
  const chaveLegadaSoCodigo = Boolean(k && codigoNorm && kNorm === codigoNorm);
  if (k && k !== nk && !chaveLegadaSoCodigo) uniq.add(k);
  uniq.add(`${c}${b}`.replace(/[\s.]+/g, '')); // sem pontos/espaços (ex: 1680097FDE)
  uniq.add(`${c}_${b}`);
  uniq.add(`${c}-${b}`);
  if (c && bancoBase && bancoBase !== b) {
    uniq.add(normalizarChave(c, bancoBase));
    uniq.add(`${c}${bancoBase}`.replace(/[\s.]+/g, ''));
    uniq.add(`${c}_${bancoBase}`);
    uniq.add(`${c}-${bancoBase}`);
  }
  if (codigoNorm && bancoBaseNorm) {
    uniq.add(`${codigoNorm}${bancoBaseNorm}`);
  }
  if (codigoNorm && !b) {
    uniq.add(codigoNorm);
  }
  return Array.from(uniq);
}

function contagemAnaliticoComposicao(c: ComposicaoItem): number {
  return c.analiticoLinhas?.length ?? 0;
}

/** Evita que alias genéricos (ex.: só dígitos) troquem a composição certa por outra sem analítico. */
function escolherComposicaoParaChaveMapa(prev: ComposicaoItem, next: ComposicaoItem): ComposicaoItem {
  const np = contagemAnaliticoComposicao(prev);
  const nn = contagemAnaliticoComposicao(next);
  if (nn > np) return next;
  if (nn < np) return prev;
  return prev;
}

/** Catálogo global ou snapshot gravado na linha do orçamento (prioridade ao snapshot). */
function composicaoResolvidaDoItemServico(
  item: ItemServico,
  mapa: Record<string, ComposicaoItem>
): ComposicaoItem | null {
  if (item.analiticoLinhas && item.analiticoLinhas.length > 0) {
    return {
      codigo: item.codigo,
      banco: item.banco,
      chave: item.chave,
      descricao: item.descricao,
      precoUnitario: item.precoUnitario ?? 0,
      maoDeObraUnitario: item.maoDeObraUnitario,
      materialUnitario: item.materialUnitario,
      unidade: item.unidade,
      analiticoLinhas: item.analiticoLinhas
    };
  }
  const chaves = chavesParaBusca(item.codigo, item.banco, item.chave);
  for (const k of chaves) {
    const c = mapa[k];
    if (c) return c;
  }
  return null;
}

/** Converte UND da planilha (M, M², M2, M³, M3, M^3, M**3, UN, …) para TipoUnidadeFormula */
function parseUnidadeComposicao(und: string | undefined): TipoUnidadeFormula | null {
  if (!und || !String(und).trim()) return null;
  let u = String(und).toUpperCase().replace(/\s/g, '').replace(/²/g, '2').replace(/³/g, '3');
  u = u.replace(/\^/g, '').replace(/\*+/g, '');
  if (u === 'M3' || u.includes('CUBIC')) return 'm3';
  if (u === 'M2' || u.includes('QUADRAD')) return 'm2';
  if (u === 'M' || u === 'MT' || u === 'METRO' || u === 'METROS') return 'm';
  if (u === 'UN' || u === 'UND' || u === 'UNID' || u.includes('UNIDADE')) return 'un';
  return null;
}

/** Exibe unidade como m³ / m² / m / UN (igual à memória e à carga; M^3 do cadastro vira m³). */
function unidadeComposicaoParaExibicao(und: string | undefined, tipoFallback: TipoUnidadeFormula): string {
  const parsed = parseUnidadeComposicao(und);
  const t = parsed ?? (tipoFallback !== 'un' ? tipoFallback : null);
  if (t === 'm3') return 'm³';
  if (t === 'm2') return 'm²';
  if (t === 'm') return 'm';
  if (t === 'un') return 'UN';
  const raw = und?.trim();
  if (raw) return raw;
  return tipoFallback === 'm3' ? 'm³' : tipoFallback === 'm2' ? 'm²' : tipoFallback === 'm' ? 'm' : 'UN';
}

/** Verifica se a descrição indica composição de Carga Manual de Entulho (UI da memória). */
function ehComposicaoCargaEntulho(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao);
  return d.includes('carga') && d.includes('entulho') && (d.includes('caminhao') || d.includes('basculante'));
}

type AppendComposicaoAoSubtituloResult =
  | { ok: true; next: ServicoPadrao[] }
  | { ok: false; reason: 'no-subtitle' | 'duplicate' };

/** Uma etapa de inclusão no subtítulo; encadear com o estado mais recente ao adicionar vários itens de uma vez. */
function appendComposicaoItemAoSubtitulo(
  servicos: ServicoPadrao[],
  servicoId: string,
  subtituloId: string,
  item: ComposicaoItem
): AppendComposicaoAoSubtituloResult {
  const svc = servicos.find(s => s.id === servicoId);
  const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
  if (!sub) return { ok: false, reason: 'no-subtitle' };
  const existe = sub.itens.some(
    i => i.chave === item.chave || (i.codigo === item.codigo && i.banco === item.banco)
  );
  if (existe) return { ok: false, reason: 'duplicate' };

  const novoItem: ItemServico = {
    chave: item.chave || normalizarChave(item.codigo, item.banco),
    codigo: item.codigo,
    banco: item.banco,
    descricao: item.descricao
  };
  if (item.precoUnitario != null && Number.isFinite(item.precoUnitario)) {
    novoItem.precoUnitario = item.precoUnitario;
  }
  if (item.maoDeObraUnitario != null && Number.isFinite(item.maoDeObraUnitario)) {
    novoItem.maoDeObraUnitario = item.maoDeObraUnitario;
  }
  if (item.materialUnitario != null && Number.isFinite(item.materialUnitario)) {
    novoItem.materialUnitario = item.materialUnitario;
  }
  const und = item.unidade != null ? String(item.unidade).trim() : '';
  if (und) novoItem.unidade = und;
  if (item.analiticoLinhas && item.analiticoLinhas.length > 0) {
    novoItem.analiticoLinhas = item.analiticoLinhas;
  }
  const updated = servicos.map(s => {
    if (s.id !== servicoId) return s;
    return {
      ...s,
      subtitulos: s.subtitulos.map(sb =>
        sb.id === subtituloId ? { ...sb, itens: [...sb.itens, novoItem] } : sb
      )
    };
  });
  return { ok: true, next: updated };
}

/** Fator (40%) aplicado ao valor unit. estimado e ao custo estimado na planilha analítica. */
const PLANILHA_FATOR_CUSTO_ESTIMADO = 0.4;

/** Largura estável para colunas «R$ + valor» (planilha «Valor unit. real», analítico insumo manual). */
const GRADE_COL_MOEDA_UNIT =
  'w-[7.5rem] min-w-[7.5rem] max-w-[8rem] whitespace-nowrap';

/** Textos de ajuda (title): como cada campo da planilha analítica é obtido ou calculado. */
const PLANILHA_ANALITICA_TOOLTIP = {
  item: 'Numeração hierárquica do item no orçamento (estrutura em níveis do serviço).',
  codigo: 'Código do item na tabela de preços ou na composição.',
  banco: 'Origem do banco de preços (ex.: FDE, SEINFRA).',
  servico: 'Descrição do serviço ou do insumo.',
  un: 'Unidade de medida do item.',
  quantidadeComp:
    'Quantidade da composição no orçamento (quantidade de serviço a executar / medir).',
  quantidadeInsumo:
    'Quantidade total no orçamento do insumo: quantidade da composição × consumo unitário do insumo na composição analítica.',
  valorUnitOrcComp:
    'Valor unitário médio da composição: total de orçamento da linha ÷ quantidade da composição (quando aplicável).',
  valorUnitOrcInsumo: 'Valor unitário de referência do insumo no orçamento (composição analítica / banco).',
  totalOrcComp: 'Total de orçamento da composição: quantidade × valor unitário (total da linha no orçamento).',
  totalOrcInsumo: 'Total no orçamento: quantidade × valor unitário de orçamento.',
  qtdCompraComp:
    'Na composição, a quantidade de compra é informada por insumo nas linhas abaixo; esta célula fica vazia.',
  qtdCompraInsumo:
    'Quantidade comprada ou solicitada para o insumo (valor digitado e salvo por linha; base para custos e %).',
  qtdSobraComp:
    'Na composição, a sobra é calculada por insumo nas linhas abaixo; esta célula fica vazia.',
  qtdSobraInsumo:
    'Diferença entre quantidade do orçamento e quantidade comprada/solicitada (quantidade orçamento - quantidade compra).',
  valorUnitEstComp:
    'Na composição não há um único valor unitário estimado; o custo estimado é a soma nos insumos.',
  valorUnitEstInsumo: `Valor unitário estimado: valor unitário orçamento × ${PLANILHA_FATOR_CUSTO_ESTIMADO * 100}% (referência de custo).`,
  custoEstComp: `Custo estimado agregado: soma nos insumos de (quantidade compra × valor unit. orçamento × ${PLANILHA_FATOR_CUSTO_ESTIMADO * 100}%), onde houver quantidade compra.`,
  custoEstInsumo: `Custo estimado: quantidade compra × valor unitário orçamento × ${PLANILHA_FATOR_CUSTO_ESTIMADO * 100}%.`,
  vlCompraRealComp:
    'Soma simples dos valores unitários de compra real informados nos insumos (referência na linha da composição).',
  vlCompraRealInsumo: 'Valor unitário efetivo da compra (valor digitado por linha).',
  custoCompraRealComp:
    'Soma dos custos reais dos insumos: para cada insumo com qtd e valor unitário real, quantidade compra × valor unitário compra real.',
  custoCompraRealInsumo: 'Custo real: quantidade compra × valor unitário compra real.',
  pctLevComp:
    'Composição: (Σ quantidade compra dos insumos ÷ Σ quantidade orçamento dos insumos) × 100. Indica o quanto da quantidade orçada foi coberta pela compra.',
  pctLevInsumo: 'Insumo: (quantidade compra ÷ quantidade orçamento) × 100.',
  pctPuComp:
    'Composição: média ponderada — Σ(qtd compra × vl compra real) ÷ Σ(qtd compra × vl orçamento) × 100 (onde houver dados).',
  pctPuInsumo: 'Insumo: (valor unitário compra real ÷ valor unitário orçamento) × 100.',
  pctFatComp:
    'Composição: (preço compra real total ÷ valor total orçamento) × 100, sendo valor total orçamento a soma dos (qtd compra × vl orçamento) nos insumos.',
  pctFatInsumo:
    'Insumo: (preço compra real ÷ valor total orçamento) × 100, com valor total orçamento = quantidade compra × valor unitário orçamento.',
  pctCvpComp:
    'Composição: (preço compra real ÷ faturamento da composição em R$) × 100, sendo faturamento = quantidade da composição × valor unitário médio.',
  pctCvpInsumo:
    'Insumo: (preço compra real do insumo ÷ faturamento da composição pai em R$) × 100. Mostra a participação do custo pago no faturamento da composição.',
  tipo: 'Classificação do insumo (MA, MO, LO etc.) conforme categoria do item.',
  tipoCompLinha:
    'Linha de composição: não há tipo MA/MO/LO nesta linha (o tipo é exibido em cada insumo abaixo).',
  tituloServico: 'Título do serviço no orçamento (agrupa blocos abaixo).',
  subtituloBloco: 'Subtítulo / bloco de itens dentro do serviço.',
  exportPlanilha: 'Exporta esta planilha para Excel com as mesmas colunas e fórmulas exibidas.',
  theadQuantidade:
    'Composição: quantidade do serviço no orçamento. Insumo: quantidade total = qtd. da composição × consumo unitário do insumo na composição.',
  theadValorUnitOrc:
    'Composição: valor unitário médio (total ÷ quantidade). Insumo: valor unitário de referência do insumo no orçamento.',
  theadTotalOrc:
    'Composição: total de orçamento da linha. Insumo: quantidade × valor unitário de orçamento.',
  theadQtdCompra:
    'Coluna à esquerda do valor unitário real. Composição: preencha a quantidade em cada insumo abaixo. Insumo: quantidade comprada ou solicitada (editável).',
  theadSobra:
    'Diferença entre quantidade do orçamento e quantidade compra. Valor negativo indica compra acima do orçamento.',
  theadValorUnitEst:
    'Composição: sem valor unitário único. Insumo: valor unitário orçamento × 40%.',
  theadCustoEst:
    'Composição: soma nos insumos de (qtd compra × vl orçamento × 40%). Insumo: qtd compra × vl orçamento × 40%.',
  theadVlCompraReal:
    'Composição: soma simples dos valores unitários reais dos insumos. Insumo: valor unitário de compra real (editável).',
  theadCustoCompraReal:
    'Composição: soma dos (qtd compra × vl real) dos insumos. Insumo: qtd compra × vl compra real.',
  theadPctLev:
    'Composição: (Σ qtd compra ÷ Σ qtd orçamento) × 100 nos insumos. Insumo: (qtd compra ÷ qtd orçamento) × 100.',
  theadPctPu:
    'Composição: Σ(qtd×vl real) ÷ Σ(qtd×vl orçamento) × 100. Insumo: (vl compra real ÷ vl orçamento) × 100.',
  theadPctFat:
    'Composição: (preço compra real total ÷ valor total orçamento) × 100. Insumo: (preço compra real ÷ valor total orçamento) × 100.',
  theadPctCvp:
    'Composição: (preço compra real ÷ faturamento da composição) × 100. Insumo: (preço compra real ÷ faturamento da composição pai) × 100.'
} as const;

function roundTo(n: number, decimals: number) {
  const d = Math.pow(10, decimals);
  return Math.round(n * d) / d;
}

/**
 * Arredondamento monetário no estilo Orçafascio: trunca para 2 casas
 * (ex.: 17.280,628 → 17.280,62), em vez de arredondar para cima.
 * Compensa lixo de ponto flutuante (ex.: 13.765,08×5 → 68.825,399999… → 68.825,40).
 */
function truncarMoeda2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const cents = Math.floor(abs * 100 + 1e-8);
  return (sign * cents) / 100;
}

/** Igual a truncarMoeda2, mas arredondando (pra cima ou pra baixo) em vez de truncar. */
function arredondarMoeda2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100 + 1e-8);
  return (sign * cents) / 100;
}

export type ModoArredondamento = 'truncar' | 'arredondar' | 'nenhum';

/**
 * Opção escolhida na importação do Orçafascio (que usa 9 casas decimais internamente) — controla
 * como os subtotais por item são calculados aqui, pra reduzir divergência com o valor de lá:
 * - truncar: trunca em 2 casas (padrão TCU, igual ao truncarMoeda2 — comportamento de sempre).
 * - arredondar: arredonda em 2 casas normalmente.
 * - nenhum: mantém a precisão cheia (sem cortar em 2 casas) — só a exibição arredonda pra tela.
 */
function aplicarModoArredondamento(n: number, modo: ModoArredondamento | undefined): number {
  if (!Number.isFinite(n)) return 0;
  if (modo === 'arredondar') return arredondarMoeda2(n);
  if (modo === 'nenhum') return n;
  return truncarMoeda2(n);
}

function fmtCalcNumero(n: number, casas = 2) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtCalcMoeda(n: number) {
  return `R$ ${fmtCalcNumero(n, 2)}`;
}

/** Exibição em planilha exportada (pt-BR). */
function formatarBRLExport(n: number) {
  return `R$ ${truncarMoeda2(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    <div role="status" className={ORCAMENTO_SECAO_VAZIA_SHELL}>
      <div className={`mb-5 ${ORCAMENTO_ICON_SOFT_BOX}`}>
        <Icon className={ORCAMENTO_ICON_SOFT_GLYPH} aria-hidden />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">{titulo}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">{texto}</p>
      <button
        type="button"
        onClick={onIrOrcamento}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-900/15 transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
      >
        <ListPlus className="h-4 w-4 shrink-0" aria-hidden />
        Ir para a aba Orçamento
      </button>
    </div>
  );
}

/**
 * Mantém linhas da lista montadas durante a animação de colapso/expansão.
 * No leave, colapsa a altura das células (texto é recortado, não some antes).
 */
function OrcListaAnimacaoGrupo({
  aberto,
  children
}: {
  aberto: boolean;
  children: React.ReactNode;
}) {
  const [montado, setMontado] = useState(aberto);
  const [fase, setFase] = useState<'enter' | 'leave' | 'idle'>('idle');
  const primeiroRender = useRef(true);
  const trRefs = useRef<HTMLTableRowElement[]>([]);

  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      setMontado(aberto);
      return;
    }
    if (aberto) {
      setMontado(true);
      setFase('enter');
      const t = window.setTimeout(() => setFase('idle'), 220);
      return () => window.clearTimeout(t);
    }
    setFase('leave');
    const t = window.setTimeout(() => {
      setMontado(false);
      setFase('idle');
      trRefs.current = [];
    }, 240);
    return () => window.clearTimeout(t);
  }, [aberto]);

  useLayoutEffect(() => {
    if (fase !== 'leave') return;
    const rows = trRefs.current.filter(Boolean);
    rows.forEach(tr => {
      tr.style.pointerEvents = 'none';
      Array.from(tr.cells).forEach(td => {
        const cs = window.getComputedStyle(td);
        const h = td.getBoundingClientRect().height;
        td.style.boxSizing = 'border-box';
        td.style.overflow = 'hidden';
        td.style.verticalAlign = 'top';
        td.style.height = `${h}px`;
        td.style.paddingTop = cs.paddingTop;
        td.style.paddingBottom = cs.paddingBottom;
        td.style.borderTopWidth = cs.borderTopWidth;
        td.style.borderBottomWidth = cs.borderBottomWidth;
        void td.offsetHeight;
        td.style.transition =
          'height 0.22s ease-in, padding 0.22s ease-in, border-width 0.22s ease-in';
        td.style.height = '0px';
        td.style.paddingTop = '0px';
        td.style.paddingBottom = '0px';
        td.style.borderTopWidth = '0px';
        td.style.borderBottomWidth = '0px';
      });
    });
  }, [fase]);

  if (!montado) return null;

  const animCls = fase === 'enter' ? 'orc-lista-row-enter' : '';
  const collected: HTMLTableRowElement[] = [];

  const aplicarClasse = (nodes: React.ReactNode): React.ReactNode =>
    React.Children.map(nodes, child => {
      if (!React.isValidElement(child)) return child;
      if (child.type === React.Fragment) {
        const fragProps = child.props as { children?: React.ReactNode };
        return (
          <React.Fragment key={child.key}>
            {aplicarClasse(fragProps.children)}
          </React.Fragment>
        );
      }
      if (child.type !== 'tr') return child;
      const el = child as React.ReactElement<{
        className?: string;
        ref?: React.Ref<HTMLTableRowElement>;
      }>;
      return React.cloneElement(el, {
        className: [el.props.className, animCls].filter(Boolean).join(' '),
        ref: (node: HTMLTableRowElement | null) => {
          if (node) collected.push(node);
          trRefs.current = collected;
          const prev = el.props.ref;
          if (typeof prev === 'function') prev(node);
          else if (prev && typeof prev === 'object') {
            (prev as React.MutableRefObject<HTMLTableRowElement | null>).current = node;
          }
        }
      } as Partial<typeof el.props>);
    });

  return <>{aplicarClasse(children)}</>;
}

/** Colunas em R$: símbolo à esquerda e valor numérico à direita na mesma célula. */
const MoedaCelula = memo(function MoedaCelula({
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
  const formatted = truncarMoeda2(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const titulo = `R$ ${formatted}`;
  return (
    <div
      className={`flex w-full min-w-0 max-w-full items-baseline justify-between gap-2.5 px-0.5 overflow-hidden tabular-nums ${className ?? ''}`}
      title={titulo}
    >
      <span className={`shrink-0 opacity-80 ${simboloClassName ?? ''}`}>R$</span>
      <span className={`min-w-0 flex-1 text-right whitespace-nowrap ${valorClassName ?? ''}`}>{formatted}</span>
    </div>
  );
});

const FD_COMMIT_DEBOUNCE_MS = 180;

/**
 * Input da Ficha de Demanda: estado local enquanto digita.
 * Por padrão só notifica o pai no blur — evita re-render da grade inteira a cada tecla.
 * Campos de moeda passam `mask` + `commitOnChange` para formatar na hora e
 * só recalcular totais depois de uma pausa curta (sem travar a digitação).
 */
const FdCampoLocal = memo(function FdCampoLocal({
  committedValue,
  onCommit,
  className,
  placeholder,
  title,
  inputMode,
  mask,
  commitOnChange,
}: {
  committedValue: string;
  onCommit: (raw: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  mask?: (raw: string) => string;
  commitOnChange?: boolean;
}) {
  const [local, setLocal] = useState(committedValue);
  const focusedRef = useRef(false);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!focusedRef.current) setLocal(committedValue);
  }, [committedValue]);

  useEffect(
    () => () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    []
  );

  const flushCommit = (value: string) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    onCommitRef.current(value);
  };

  const applyValue = (raw: string, shouldCommit: boolean, immediate?: boolean) => {
    const next = mask ? mask(raw) : raw;
    setLocal(next);
    if (!shouldCommit) return;
    if (immediate || !commitOnChange) {
      flushCommit(next);
      return;
    }
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onCommitRef.current(next);
    }, FD_COMMIT_DEBOUNCE_MS);
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      title={title}
      autoComplete="off"
      className={className}
      value={local}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => applyValue(e.target.value, Boolean(commitOnChange))}
      onBlur={(e) => {
        focusedRef.current = false;
        applyValue(e.target.value, true, true);
      }}
    />
  );
});

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

const ORCAMENTO_LISTA_MENU_WIDTH_PX = 224;

/** Sufixo « (código) » no nome da lista — ex.: ORÇAMENTO X (26/7736). */
function codigoFromNomeOrcamento(nome: string): string {
  const m = String(nome ?? '').trim().match(/\(([^)]+)\)\s*$/);
  return m?.[1]?.trim() || '';
}

function nomeOrcamentoSemCodigoSufixo(nome: string): string {
  const raw = String(nome ?? '').trim();
  if (!raw) return '';
  return raw.replace(/\s*\([^)]+\)\s*$/, '').trim() || raw;
}

export function OrcamentoPageView({
  lockedCostCenterId = null,
  embeddedContractId = null,
  embeddedContractName = null,
  embeddedOrcamentoIdFromRoute = null,
  cronogramaOnly = false,
}: OrcamentoPageProps = {}) {
  const router = useRouter();
  const { costCenters, isLoading: loadingCentros } = useCostCenters();
  const [centroCustoId, setCentroCustoId] = useState<string | null>(() => lockedCostCenterId ?? null);
  const [composicoes, setComposicoes] = useState<ComposicaoItem[]>([]);
  const [servicos, setServicos] = useState<ServicoPadrao[]>([]);
  /** Evita falha em lote no Strict Mode: o updater de setServicos pode rodar 2× com o mesmo prev e marcar duplicata. */
  const servicosRef = useRef<ServicoPadrao[]>(servicos);
  servicosRef.current = servicos;
  /** Catálogo base do contrato (API); usado para listar todos os serviços no dropdown quando o doc. é importado. */
  const [servicosPadraoContrato, setServicosPadraoContrato] = useState<ServicoPadrao[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  /** Chaves `servicoId|subtituloId|chave` (ou `…|${DROPDOWN_BLOCO_SEM_ITENS}`) escolhidas no dropdown. */
  const [linhasSelecionadasDropdown, setLinhasSelecionadasDropdown] = useState<Set<string>>(new Set());
  const [subtitulosNoOrcamento, setSubtitulosNoOrcamento] = useState<string[]>([]);
  const [itensOcultosNoOrcamento, setItensOcultosNoOrcamento] = useState<string[]>([]);
  const [quantidadesPorItem, setQuantidadesPorItem] = useState<Record<string, number>>({});
  const [dimensoesPorItem, setDimensoesPorItem] = useState<Record<string, DimensoesItem>>({});
  const [planilhaQuantidadeCompra, setPlanilhaQuantidadeCompra] = useState<Record<string, number>>({});
  const [planilhaValorUnitCompraReal, setPlanilhaValorUnitCompraReal] = useState<Record<string, number>>({});
  const [planilhaTipoInsumo, setPlanilhaTipoInsumo] = useState<Record<string, 'MO' | 'MA' | 'LO'>>({});
  const [fichaDemandaObservacoes, setFichaDemandaObservacoes] = useState<Record<string, string>>({});
  /** Atrasa recálculos pesados da FD após commit — a digitação não espera a grade. */
  const planilhaQtdDeferred = useDeferredValue(planilhaQuantidadeCompra);
  const planilhaVlDeferred = useDeferredValue(planilhaValorUnitCompraReal);
  const [novoServicoNome, setNovoServicoNome] = useState('');
  const [showAddServico, setShowAddServico] = useState(false);
  const [isImportandoOrcamento, setIsImportandoOrcamento] = useState(false);
  const [isAtualizandoOrcafascio, setIsAtualizandoOrcafascio] = useState(false);
  const [servicosExpandidos, setServicosExpandidos] = useState<Set<string>>(new Set());
  const [loadingFromApi, setLoadingFromApi] = useState(false);

  // ── Orçafascio API ──────────────────────────────────────────────────────────
  const [orcafascioModalOpen, setOrcafascioModalOpen] = useState(false);
  const [orcafascioModalSoloOrcamentos, setOrcafascioModalSoloOrcamentos] = useState(false);
  const [orcafascioImportSelectValue, setOrcafascioImportSelectValue] = useState('');
  /** Checkbox do modal de importação: usar memória de cálculo (quantidades zeradas, preenche pela aba Memória de Cálculo). */
  const [orcafascioImportUsarMemoria, setOrcafascioImportUsarMemoria] = useState(false);
  /** Opção de arredondamento do modal de importação — Orçafascio usa 9 casas decimais internamente. */
  const [orcafascioImportModoArredondamento, setOrcafascioImportModoArredondamento] =
    useState<ModoArredondamento>('truncar');
  const [orcafascioImportDetalheModalOpen, setOrcafascioImportDetalheModalOpen] = useState(false);
  const [orcafascioModalTab, setOrcafascioModalTab] = useState<'composicoes' | 'orcamentos'>('composicoes');
  const [orcafascioModalOrcamentosSearch, setOrcafascioModalOrcamentosSearch] = useState('');
  const [orcafascioOrcamentos, setOrcafascioOrcamentos] = useState<OrcafascioOrcamentoItem[] | null>(null);
  const [orcafascioOrcamentosLoading, setOrcafascioOrcamentosLoading] = useState(false);
  const [orcafascioOrcamentosPage, setOrcafascioOrcamentosPage] = useState(1);
  const [orcafascioOrcamentosTotal, setOrcafascioOrcamentosTotal] = useState<number | null>(null);
  const [orcafascioOrcamentoDetalhe, setOrcafascioOrcamentoDetalhe] = useState<OrcafascioOrcamentoItem | null>(null);
  /** Linhas de composição do orçamento (sintético com fallback para detalhe). */
  const [orcafascioOrcamentoComposicoes, setOrcafascioOrcamentoComposicoes] =
    useState<Record<string, unknown>[] | null>(null);
  const [orcafascioOrcamentoComposicoesLoading, setOrcafascioOrcamentoComposicoesLoading] = useState(false);
  /** Linhas do relatório analítico do orçamento. */
  const [orcafascioOrcamentoAnalitico, setOrcafascioOrcamentoAnalitico] =
    useState<Record<string, unknown>[] | null>(null);
  const [orcafascioOrcamentoAnaliticoLoading, setOrcafascioOrcamentoAnaliticoLoading] = useState(false);
  /** Ao clicar numa linha da lista: detalhe de composição do catálogo (insumos/serviços). */
  const [orcafascioOrcamentoLinhaCatalogo, setOrcafascioOrcamentoLinhaCatalogo] =
    useState<OrcafascioComposicaoDetalhe | null>(null);
  const [orcafascioOrcamentoLinhaCatalogoLoading, setOrcafascioOrcamentoLinhaCatalogoLoading] =
    useState(false);
  const [orcafascioOrcamentoLinhaChave, setOrcafascioOrcamentoLinhaChave] = useState<string | null>(null);
  const [novoBlocoModalOpen, setNovoBlocoModalOpen] = useState(false);
  const [novoBlocoModalMode, setNovoBlocoModalMode] = useState<'titulo' | 'subtitulo'>('titulo');
  const [novoBlocoModalServicoId, setNovoBlocoModalServicoId] = useState<string | null>(null);
  const [novoBlocoTituloNome, setNovoBlocoTituloNome] = useState('');
  const [novoBlocoSubtituloNome, setNovoBlocoSubtituloNome] = useState('');
  const [orcafascioSearch, setOrcafascioSearch] = useState('');
  const [orcafascioPage, setOrcafascioPage] = useState(1);
  const [orcafascioLoading, setOrcafascioLoading] = useState(false);
  const [orcafascioResultados, setOrcafascioResultados] = useState<OrcafascioListResponse<OrcafascioComposicaoListItem> | null>(null);
  const [orcafascioDetalhe, setOrcafascioDetalhe] = useState<OrcafascioComposicaoDetalhe | null>(null);
  /** Subpainel dentro do detalhe da composição: cartões ou tabela analítica (mesmos itens da API). */
  const [orcafascioComposicaoDetalheTab, setOrcafascioComposicaoDetalheTab] =
    useState<'itens' | 'analitico'>('itens');
  const [orcafascioDetalheLoading, setOrcafascioDetalheLoading] = useState(false);
  /** UF Sergipe — catálogo ORSE (find_by_code no backend usa SE por padrão). */
  const orcafascioUfOrse = 'SE';
  const [showServicosDropdown, setShowServicosDropdown] = useState(false);
  const [showContratoDropdown, setShowContratoDropdown] = useState(false);
  const [servicosSearch, setServicosSearch] = useState('');
  const [contratoSearch, setContratoSearch] = useState('');
  /** Composições marcadas na grade da aba Orçamento (`servicoId|subtituloId|chave`). */
  const [itensSelecionadosMontagem, setItensSelecionadosMontagem] = useState<Set<string>>(new Set());
  const servicosDropdownRef = useRef<HTMLDivElement | null>(null);
  const contratoDropdownRef = useRef<HTMLDivElement | null>(null);
  const contratoSearchInputRef = useRef<HTMLInputElement | null>(null);
  /** Tabela da aba Orçamento (montagem): listener nativo de contexto para vencer menu do browser em inputs/células. */
  const montagemOrcamentoTableRef = useRef<HTMLDivElement | null>(null);
  /** Input file na aba Importações (orçamento perfeito). */
  const importOrcamentoTabFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importOrcamentoModalOpen, setImportOrcamentoModalOpen] = useState(false);
  const [importOrcamentoModalFile, setImportOrcamentoModalFile] = useState<File | null>(null);
  const [importOrcamentoModalDragging, setImportOrcamentoModalDragging] = useState(false);

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
    'dados' | 'montagem' | 'analitico' | 'memorial' | 'planilhaAnalitica' | 'cronograma'
  >(cronogramaOnly ? 'cronograma' : 'montagem');

  useEffect(() => {
    if (cronogramaOnly) setOrcamentoViewTab('cronograma');
  }, [cronogramaOnly]);
  /** Aba “atrasada”: pill/UI muda na hora; grades pesadas montam depois (evita travar a animação). */
  const deferredOrcamentoViewTab = useDeferredValue(orcamentoViewTab);
  const abaOrcamentoPesada =
    orcamentoViewTab === 'analitico' ||
    orcamentoViewTab === 'planilhaAnalitica' ||
    orcamentoViewTab === 'memorial';
  const deferredAbaOrcamentoPesada =
    deferredOrcamentoViewTab === 'analitico' ||
    deferredOrcamentoViewTab === 'planilhaAnalitica' ||
    deferredOrcamentoViewTab === 'memorial';
  const abaPesadaPendente = abaOrcamentoPesada && deferredOrcamentoViewTab !== orcamentoViewTab;
  const [memorialItemKey, setMemorialItemKey] = useState<string | null>(null);
  // Draft para campos que aceitam cálculos (2+3, 10/2, etc) - avalia no blur
  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const calcCommitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [insumosAnaliticoManuais, setInsumosAnaliticoManuais] = useState<Record<string, InsumoAnaliticoManual[]>>({});
  const [insumosAnaliticoOcultos, setInsumosAnaliticoOcultos] = useState<string[]>([]);
  /** Menu botão direito — composição, insumo do catálogo ou insumo manual. */
  const [menuCtxAnalitico, setMenuCtxAnalitico] = useState<
    | { kind: 'composicao'; left: number; top: number; composicaoKey: string }
    | { kind: 'insumo'; left: number; top: number; parentKey: string; insumoKey: string; descricao: string }
    | { kind: 'manual'; left: number; top: number; parentKey: string; insumoId: string; idx: number }
    | null
  >(null);
  /** Menu botão direito — aba Orçamento (montagem): apagar título do serviço, subtítulo ou composição. */
  const [menuCtxMontagem, setMenuCtxMontagem] = useState<
    | { kind: 'tituloServico'; left: number; top: number; servicoId: string }
    | { kind: 'subtitulo'; left: number; top: number; blocoKey: string }
    | { kind: 'composicao'; left: number; top: number; composicaoKey: string }
    | null
  >(null);
  const [orcamentoAtivoId, setOrcamentoAtivoId] = useState<string | null>(() =>
    embeddedContractId ? embeddedOrcamentoIdFromRoute ?? null : null
  );
  const [listaOrcamentos, setListaOrcamentos] = useState<OrcamentoListaEntry[]>([]);
  /** Com contrato fixo na rota, começa em “carregando” para não restaurar URL com lista ainda vazia no 1º efeito. */
  const [carregandoListaOrcamentos, setCarregandoListaOrcamentos] = useState(() => Boolean(lockedCostCenterId));
  const [nomeOrcamentoRascunho, setNomeOrcamentoRascunho] = useState('');
  const [orcamentosSearch, setOrcamentosSearch] = useState('');
  const [isCreatingOrcamento, setIsCreatingOrcamento] = useState(false);
  const [orcamentoListaActionMenu, setOrcamentoListaActionMenu] = useState<{
    orcamentoId: string;
    nome: string;
    top: number;
    left: number;
  } | null>(null);
  const [orcamentoExcluirConfirm, setOrcamentoExcluirConfirm] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [excluindoOrcamento, setExcluindoOrcamento] = useState(false);
  /** Chaves `t:<servicoId>` / `s:<blocoKey>` das linhas de título/subtítulo recolhidas na montagem. */
  const [linhasListaRecolhidas, setLinhasListaRecolhidas] = useState<Set<string>>(() => new Set());
  const alternarRecolherLinhaLista = useCallback((key: string) => {
    setLinhasListaRecolhidas(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
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
  const autosaveBaselineRef = useRef<{ orcamentoId: string | null; hadData: boolean }>({
    orcamentoId: null,
    hadData: false
  });
  const autosaveProtecaoAvisadaRef = useRef<string | null>(null);

  const embeddedOrcamentoBasePath = embeddedContractId
    ? `/ponto/contratos/${embeddedContractId}/orcamento`
    : null;

  const navigateEmbeddedOrcamentoPath = useCallback(
    (orcamentoId: string | null) => {
      if (!embeddedOrcamentoBasePath) return;
      const target = orcamentoId ? `${embeddedOrcamentoBasePath}/${orcamentoId}` : embeddedOrcamentoBasePath;
      // Abrir: push para a seta do navegador voltar à lista de orçamentos.
      // Fechar/excluir: replace para não deixar o detalhe excluído no histórico.
      if (orcamentoId) {
        router.push(target, { scroll: false });
      } else {
        router.replace(target, { scroll: false });
      }
    },
    [embeddedOrcamentoBasePath, router]
  );

  // useLayoutEffect: evita 1 frame com URL na lista e UI/breadcrumb ainda no orçamento aberto.
  useLayoutEffect(() => {
    if (!embeddedContractId || !centroCustoId) return;
    setOrcamentoAtivoId(embeddedOrcamentoIdFromRoute ?? null);
  }, [embeddedContractId, embeddedOrcamentoIdFromRoute, centroCustoId]);

  // Orçafascio: só no hover do botão Importar (prefetchOrcafascioOrcamentosList) —
  // prefetch automático competia com lista/detalhe e atrasava a abertura.

  const filteredListaOrcamentos = useMemo(() => {
    const q = orcamentosSearch.trim().toLowerCase();
    if (!q) return listaOrcamentos;
    return listaOrcamentos.filter((o) => (o.nome || '').toLowerCase().includes(q));
  }, [listaOrcamentos, orcamentosSearch]);

  const historicoOrcamentoPerfeito = useMemo(
    () => imports.filter((imp) => imp.origem === 'orcamento-perfeito'),
    [imports]
  );

  useEffect(() => {
    if (!centroCustoId) return;
    const importsLimpos = imports.filter((imp) => imp.origem === 'orcamento-perfeito');
    if (importsLimpos.length === imports.length) return;
    setImports(importsLimpos);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(importsLimpos));
    }
    void saveServicosPadraoToApi(centroCustoId, { servicos: servicosPadraoContrato, imports: importsLimpos }).catch(() => {
      // Falha silenciosa: a limpeza local já evita a mistura na UI; sincroniza no próximo save bem-sucedido.
    });
  }, [centroCustoId, imports, servicosPadraoContrato]);

  /** Nome do contrato (centro de custo) selecionado — só o nome, sem código. */
  const rotuloContratoListaOrcamentos = useMemo(() => {
    if (!centroCustoId || !costCenters?.length) return null;
    const cc = costCenters.find((c: { id?: string }) => c.id === centroCustoId) as
      | { name?: string }
      | undefined;
    if (!cc) return null;
    const name = String(cc.name ?? '').trim();
    return name || null;
  }, [centroCustoId, costCenters]);

  const abrirModalImportarOrcamentoExcel = () => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato antes de importar.');
      return;
    }
    setImportOrcamentoModalFile(null);
    setImportOrcamentoModalOpen(true);
  };

  const [meta, setMeta] = useState<OrcamentoMeta>(sessaoVazia().meta!);
  const [cronograma, setCronograma] = useState<CronogramaPersist>(() => cronogramaVazio());

  const dataFimOrcamento = useMemo(
    () => calcularDataFimOrcamento(meta.dataAbertura, meta.dataEnvio, meta.prazoExecucaoDias),
    [meta.dataAbertura, meta.dataEnvio, meta.prazoExecucaoDias]
  );

  useEffect(() => {
    const ini = meta.dataAbertura || '';
    const fim = dataFimOrcamento || '';
    setCronograma((c) => {
      if ((c.config?.dataInicioObra ?? '') === ini && (c.config?.dataFimObra ?? '') === fim) return c;
      return {
        ...c,
        config: {
          ...c.config,
          dataInicioObra: ini,
          dataFimObra: fim
        }
      };
    });
  }, [meta.dataAbertura, dataFimOrcamento]);

  const [novoOrcamentoMetaOpen, setNovoOrcamentoMetaOpen] = useState(false);
  const [novoOrcamentoStep, setNovoOrcamentoStep] = useState<1 | 2 | 3>(1);
  const [novoOrcamentoMetaDraft, setNovoOrcamentoMetaDraft] = useState<OrcamentoMeta & { nomeOrcamento: string }>(
    () => ({ ...metaNovoOrcamentoPadrao(), nomeOrcamento: '' })
  );
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [loadingEmployeeOptions, setLoadingEmployeeOptions] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [fdAprovacaoModalOpen, setFdAprovacaoModalOpen] = useState(false);
  const [fdAprovacaoInitialForm, setFdAprovacaoInitialForm] =
    useState<Partial<FichaDemandaApprovalFormState> | null>(null);
  const [fdAprovacaoPreparando, setFdAprovacaoPreparando] = useState(false);
  const [fdAprovacaoEnviando, setFdAprovacaoEnviando] = useState(false);

  /**
   * Estrutura mesclada (catálogo + grupos só do documento) para resolver nomes de blocos,
   * labels e limpeza de chaves — não usar como lista do seletor “Adicionar serviços”.
   */
  const servicosParaDropdown = useMemo(() => {
    if (meta.importadoPlanilha) {
      return servicos;
    }
    if (servicosPadraoContrato.length > 0) {
      return mergeServicosPadraoComDocumentoImportado(servicosPadraoContrato, servicos);
    }
    return servicos;
  }, [meta.importadoPlanilha, servicosPadraoContrato, servicos]);

  /**
   * Só o catálogo do contrato (GET servicos-padrao). Nunca usar `servicos` do documento aqui:
   * senão títulos/subtítulos criados na montagem aparecem no seletor. Sem catálogo na API, lista fica vazia.
   * Só há “base” de orçamento perfeito com histórico (`origem: orcamento-perfeito`); serviços órfãos no JSON
   * sem import registrado não devem aparecer aqui (alinha com a aba Importações).
   */
  const servicosCatalogoDropdown = useMemo(() => {
    if (meta.importadoPlanilha) {
      return servicos;
    }
    if (historicoOrcamentoPerfeito.length === 0) {
      return [];
    }
    return servicosPadraoContrato;
  }, [meta.importadoPlanilha, servicosPadraoContrato, servicos, historicoOrcamentoPerfeito]);

  useEffect(() => {
    if (!orcamentoListaActionMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOrcamentoListaActionMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [orcamentoListaActionMenu]);

  useEffect(() => {
    if (lockedCostCenterId) {
      setCentroCustoId(lockedCostCenterId);
      return;
    }
    if (costCenters?.length && !centroCustoId) {
      const first = costCenters.find((c: { id?: string }) => c.id);
      if (first?.id) setCentroCustoId(first.id);
    }
  }, [costCenters, centroCustoId, lockedCostCenterId]);

  useEffect(() => {
    let cancelled = false;
    const loadCurrentUser = async () => {
      try {
        const meRes = await api.get('/auth/me');
        if (cancelled) return;
        const userName = meRes?.data?.data?.name ? String(meRes.data.data.name) : '';
        setCurrentUserName(userName);
      } catch {
        /* opcional */
      }
    };
    void loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEmployeeOptionsForMeta = useCallback(async () => {
    if (employeeOptions.length > 0 || loadingEmployeeOptions) return;
    setLoadingEmployeeOptions(true);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const employeesRes = await api.get(
        `/payroll/employees?month=${month}&year=${year}&page=1&limit=500`
      );
      const employees = Array.isArray(employeesRes?.data?.data?.employees)
        ? employeesRes.data.data.employees
        : [];
      const options = employees
        .map((e: any) => ({
          id: String(e?.id ?? ''),
          name: String(e?.name ?? '').trim(),
          cpf: e?.cpf ? String(e.cpf) : null,
          profilePhotoUrl: e?.profilePhotoUrl ? String(e.profilePhotoUrl) : null,
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
      setEmployeeOptions([]);
    } finally {
      setLoadingEmployeeOptions(false);
    }
  }, [employeeOptions.length, loadingEmployeeOptions]);

  const employeeSelectOptions = useMemo(
    () =>
      toPersonSelectOptions(
        employeeOptions.map((employee) => ({
          value: employee.name,
          name: employee.name,
          cpf: employee.cpf,
          profilePhotoUrl: employee.profilePhotoUrl,
        })),
      ),
    [employeeOptions],
  );

  /** Catálogo global (S3) — uma vez por sessão de contrato; não rebuscar a cada orçamento. */
  useEffect(() => {
    if (!centroCustoId) return;
    let cancelled = false;
    fetchComposicoesGeral().then((items) => {
      if (cancelled) return;
      setComposicoes(Array.isArray(items) ? items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [centroCustoId]);

  useEffect(() => {
    if (!centroCustoId) {
      setListaOrcamentos([]);
      setOrcamentoAtivoId(null);
      setServicos([]);
      setImports([]);
      return;
    }
    if (!embeddedContractId) {
      setOrcamentoAtivoId(null);
    }
    // Só limpa a árvore se não há orçamento na rota — evita corrida com o GET do detalhe.
    if (!embeddedOrcamentoIdFromRoute) {
      setServicos([]);
    }
    setImports(loadImports(centroCustoId));
    let cancelled = false;
    const listaCached = peekOrcamentosListaCache(centroCustoId);
    if (listaCached) {
      setListaOrcamentos(listaCached.orcamentos);
      setCarregandoListaOrcamentos(false);
    } else {
      setCarregandoListaOrcamentos(true);
    }
    fetchOrcamentosListaComRetry(centroCustoId)
      .then(data => {
        if (cancelled) return;
        seedOrcamentosListaCache(centroCustoId, data);
        setListaOrcamentos(data.orcamentos);
        // Só aquece o orçamento da rota (se houver). Hover na lista já prefetchea o clique.
        const rotaId = embeddedOrcamentoIdFromRoute;
        if (rotaId && data.orcamentos.some((o) => o.id === rotaId)) {
          prefetchOrcamentoDetail(centroCustoId, rotaId);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const code = (err as { code?: string; name?: string })?.code;
        if (code === 'ERR_CANCELED' || (err as { name?: string })?.name === 'CanceledError') return;
        console.warn('Falha ao carregar lista de orçamentos:', err);
        // Mantém lista anterior se já havia — evita tela vazia + toast em falha transitória.
        setListaOrcamentos((prev) => prev);
        toast.error('Não foi possível carregar a lista de orçamentos.');
      })
      .finally(() => {
        if (!cancelled) setCarregandoListaOrcamentos(false);
      });
    return () => {
      cancelled = true;
    };
    // embeddedOrcamentoIdFromRoute só decide se limpa serviços no mount — não deve re-disparar o GET da lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lista só depende do contrato/centro
  }, [centroCustoId, embeddedContractId]);

  useEffect(() => {
    if (!orcamentoAtivoId || !embeddedContractId) return;
    const meta = listaOrcamentos.find(o => o.id === orcamentoAtivoId);
    if (meta?.nome) setNomeOrcamentoRascunho(meta.nome);
  }, [orcamentoAtivoId, listaOrcamentos, embeddedContractId]);

  /** Com contrato selecionado e sem orçamento aberto: lista de documentos vem do armazenamento compartilhado (API + local). */
  useEffect(() => {
    if (!centroCustoId || orcamentoAtivoId) return;
    let cancelled = false;
    fetchServicosPadraoFromApi(centroCustoId).then(padrao => {
      if (cancelled || !padrao) return;
      setImports(padrao.imports);
      try {
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(padrao.imports));
      } catch {
        /* quota */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [centroCustoId, orcamentoAtivoId]);

  useEffect(() => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    let cancelled = false;
    const oid = orcamentoAtivoId;
    const localReady = tryHydrateLocalOrcamento(centroCustoId, oid);

    // Com dado local: não zera a UI nem espera o S3.
    if (!localReady) {
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
      setPlanilhaTipoInsumo({});
      setFichaDemandaObservacoes({});
      setCronograma(cronogramaVazio());
      setServicosPadraoContrato([]);
      setInsumosAnaliticoManuais({});
      setInsumosAnaliticoOcultos([]);
    } else {
      setLoadingFromApi(false);
    }

    const aplicarSessao = (s: SessaoOrcamentoPersist | null) => {
      if (!s) return;
      setSubtitulosNoOrcamento(s.subtitulosNoOrcamento);
      setItensOcultosNoOrcamento(
        Array.isArray(s.itensOcultosNoOrcamento) ? s.itensOcultosNoOrcamento : []
      );
      setInsumosAnaliticoOcultos(
        Array.isArray(s.insumosAnaliticoOcultos) ? s.insumosAnaliticoOcultos : []
      );
      setQuantidadesPorItem(s.quantidadesPorItem);
      setDimensoesPorItem(s.dimensoesPorItem);
      setPlanilhaQuantidadeCompra(s.planilhaQuantidadeCompra ?? {});
      setPlanilhaValorUnitCompraReal(s.planilhaValorUnitCompraReal ?? {});
      setPlanilhaTipoInsumo(normalizarPlanilhaTipoInsumo(s.planilhaTipoInsumo as Record<string, unknown>));
      setCronograma(normalizarCronograma(s.cronograma));
      setMeta(s.meta ? s.meta : sessaoVazia().meta!);
    };

    const carregarCatalogoContratoEmBackground = (
      servicosDoOrcamento: ServicoPadrao[],
      sessaoApi: SessaoOrcamentoPersist | null,
      importado: boolean
    ) => {
      void fetchServicosPadraoFromApi(centroCustoId).then((padraoContrato) => {
        if (cancelled) return;
        const catalogoContrato =
          Array.isArray(padraoContrato?.servicos) && padraoContrato.servicos.length > 0
            ? padraoContrato.servicos
            : importado
              ? servicosDoOrcamento
              : [];
        setServicosPadraoContrato(catalogoContrato);
        if (!importado) return;

        const doc = sessaoApi?.servicosDocumento;
        const jaTemDoc = Array.isArray(doc) && doc.length > 0;
        if (jaTemDoc) return;

        const rootDoc =
          servicosDoOrcamento.length > 0 &&
          !arvoreServicosPareceCatalogoContrato(servicosDoOrcamento, catalogoContrato)
            ? servicosDoOrcamento
            : null;
        if (rootDoc) {
          setServicos(rootDoc);
          saveServicos(centroCustoId, rootDoc);
          setServicosExpandidos(new Set([rootDoc[0].id]));
          return;
        }
        if (servicosDoOrcamento.length > 0) return;

        const local = loadServicos(centroCustoId);
        if (local.length > 0) {
          setServicos(local);
          setServicosExpandidos(new Set([local[0].id]));
        } else if (catalogoContrato.length > 0) {
          setServicos(catalogoContrato);
          saveServicos(centroCustoId, catalogoContrato);
          setServicosExpandidos(new Set([catalogoContrato[0].id]));
        }
      });
    };

    /** Aplica detalhe na UI na hora; catálogo do contrato completa em background (não segura o spinner). */
    const aplicarApiData = (apiData: {
      servicos: ServicoPadrao[];
      imports: ImportRecord[];
      sessaoOrcamento: SessaoOrcamentoPersist | null;
    }) => {
      if (cancelled) return;
      const servicosDoOrcamento = Array.isArray(apiData.servicos) ? apiData.servicos : [];
      const importsDoOrcamento = Array.isArray(apiData.imports) ? apiData.imports : [];
      const sessaoApi = apiData.sessaoOrcamento ?? loadSessaoOrcamento(centroCustoId, oid);
      const importado = sessaoApi?.meta?.importadoPlanilha === true;

      if (importado) {
        const doc = sessaoApi?.servicosDocumento;
        const rootDocEarly =
          servicosDoOrcamento.length > 0 ? servicosDoOrcamento : null;
        if (Array.isArray(doc) && doc.length > 0) {
          setServicos(doc);
          saveServicos(centroCustoId, doc);
          setServicosExpandidos(new Set([doc[0].id]));
        } else if (rootDocEarly) {
          setServicos(rootDocEarly);
          saveServicos(centroCustoId, rootDocEarly);
          setServicosExpandidos(new Set([rootDocEarly[0].id]));
        }
        aplicarSessao(sessaoApi);
      } else {
        if (servicosDoOrcamento.length > 0) {
          setServicos(servicosDoOrcamento);
          saveServicos(centroCustoId, servicosDoOrcamento);
          setServicosExpandidos(new Set([servicosDoOrcamento[0].id]));
        } else {
          setServicos([]);
          setServicosExpandidos(new Set());
        }
        aplicarSessao(sessaoApi);
      }

      setImports(importsDoOrcamento);
      try {
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(importsDoOrcamento));
      } catch {
        /* quota */
      }

      const docLen = Array.isArray(sessaoApi?.servicosDocumento) ? sessaoApi!.servicosDocumento!.length : 0;
      let carregadoTemDados =
        servicosDoOrcamento.length > 0 ||
        importsDoOrcamento.length > 0 ||
        sessaoTemDados(sessaoApi) ||
        (importado && docLen > 0);
      let recuperadoDoSnapshot = false;
      if (!carregadoTemDados) {
        const snapshot = getLatestUsefulSnapshot(centroCustoId, oid);
        if (snapshot) {
          setServicos(Array.isArray(snapshot.servicos) ? snapshot.servicos : []);
          setImports(Array.isArray(snapshot.imports) ? snapshot.imports : []);
          aplicarSessao(snapshot.sessaoOrcamento ?? null);
          recuperadoDoSnapshot = true;
          carregadoTemDados = true;
          toast.error(
            `Recuperação automática aplicada a partir do backup local de ${new Date(snapshot.createdAt).toLocaleString('pt-BR')}.`
          );
        }
      }
      autosaveBaselineRef.current = {
        orcamentoId: oid,
        hadData: carregadoTemDados || recuperadoDoSnapshot
      };
      autosaveProtecaoAvisadaRef.current = null;

      carregarCatalogoContratoEmBackground(servicosDoOrcamento, sessaoApi, importado);
    };

    let painted = false;
    if (localReady) {
      aplicarApiData(localReady);
      painted = true;
    }

    const apiPromise = fetchOrcamentoDetail(centroCustoId, oid);

    void (async () => {
      if (!painted) {
        const fromDisk = await hydrateOrcamentoDetailCache(centroCustoId, oid);
        if (cancelled) return;
        const parsedDisk = fromDisk ? parseOrcamentoDetailRaw(fromDisk) : null;
        if (parsedDisk) {
          aplicarApiData(parsedDisk);
          setLoadingFromApi(false);
          painted = true;
        }
      }

      const apiData = await apiPromise;
      if (cancelled) return;
      if (apiData) {
        aplicarApiData(apiData);
      } else if (!painted) {
        const sessaoLocal = loadSessaoOrcamento(centroCustoId, oid);
        const importadoLocal = sessaoLocal?.meta?.importadoPlanilha === true;
        const svcs = importadoLocal ? loadServicos(centroCustoId) : [];
        setServicos(svcs);
        setImports(loadImports(centroCustoId));
        if (svcs.length > 0) setServicosExpandidos(new Set([svcs[0].id]));
        aplicarSessao(sessaoLocal);
        const docLoc = Array.isArray(sessaoLocal?.servicosDocumento) ? sessaoLocal!.servicosDocumento!.length : 0;
        let carregadoTemDados = svcs.length > 0 || sessaoTemDados(sessaoLocal) || (importadoLocal && docLoc > 0);
        let recuperadoDoSnapshot = false;
        if (!carregadoTemDados) {
          const snapshot = getLatestUsefulSnapshot(centroCustoId, oid);
          if (snapshot) {
            setServicos(Array.isArray(snapshot.servicos) ? snapshot.servicos : []);
            setImports(Array.isArray(snapshot.imports) ? snapshot.imports : []);
            aplicarSessao(snapshot.sessaoOrcamento ?? null);
            recuperadoDoSnapshot = true;
            carregadoTemDados = true;
            toast.error(
              `Recuperação automática aplicada a partir do backup local de ${new Date(snapshot.createdAt).toLocaleString('pt-BR')}.`
            );
          }
        }
        autosaveBaselineRef.current = {
          orcamentoId: oid,
          hadData: carregadoTemDados || recuperadoDoSnapshot
        };
        autosaveProtecaoAvisadaRef.current = null;
        carregarCatalogoContratoEmBackground(svcs, sessaoLocal, importadoLocal);
      }
      setLoadingFromApi(false);
    })();
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
      planilhaTipoInsumo,
      meta,
      itensOcultosNoOrcamento,
      insumosAnaliticoOcultos,
      cronograma
    };
    servicosImportsRef.current = { servicos, imports };
    if (!centroCustoId || !orcamentoAtivoId) return;
    // localStorage de sessão grande trava a UI se rodar a cada tecla/commit da FD.
    const delayMs = orcamentoViewTab === 'planilhaAnalitica' ? 2500 : 600;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey(centroCustoId, 'sessao', orcamentoAtivoId),
          JSON.stringify(sessaoRef.current)
        );
      } catch {
        /* quota */
      }
    }, delayMs);
    return () => window.clearTimeout(t);
  }, [
    centroCustoId,
    orcamentoAtivoId,
    orcamentoViewTab,
    subtitulosNoOrcamento,
    quantidadesPorItem,
    dimensoesPorItem,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    planilhaTipoInsumo,
    meta,
    itensOcultosNoOrcamento,
    insumosAnaliticoOcultos,
    cronograma,
    servicos,
    imports
  ]);
  useEffect(() => {
    const ORCAMENTO_AUTOSAVE_MS = orcamentoViewTab === 'planilhaAnalitica' ? 2800 : 900;
    if (!centroCustoId || !orcamentoAtivoId || loadingFromApi) return;

    if (orcamentoAutosaveTimerRef.current) clearTimeout(orcamentoAutosaveTimerRef.current);
    orcamentoAutosaveTimerRef.current = setTimeout(() => {
      orcamentoAutosaveTimerRef.current = null;
      const { servicos: s, imports: i } = servicosImportsRef.current;
      const sessaoAtual = sessaoRef.current;
      const atualTemDados =
        s.length > 0 ||
        i.length > 0 ||
        sessaoAtual.subtitulosNoOrcamento.length > 0 ||
        (sessaoAtual.itensOcultosNoOrcamento ?? []).length > 0 ||
        Object.keys(sessaoAtual.quantidadesPorItem).length > 0 ||
        Object.keys(sessaoAtual.dimensoesPorItem).length > 0 ||
        Object.keys(sessaoAtual.planilhaQuantidadeCompra ?? {}).length > 0 ||
        Object.keys(sessaoAtual.planilhaValorUnitCompraReal ?? {}).length > 0;

      const baseline = autosaveBaselineRef.current;
      const bloquearSobrescritaVazia =
        baseline.orcamentoId === orcamentoAtivoId &&
        baseline.hadData &&
        !atualTemDados;

      if (bloquearSobrescritaVazia) {
        if (autosaveProtecaoAvisadaRef.current !== orcamentoAtivoId) {
          autosaveProtecaoAvisadaRef.current = orcamentoAtivoId;
          toast.error('Proteção ativada: salvamento automático bloqueado para evitar sobrescrever orçamento com dados vazios.');
        }
        console.warn('Autosave bloqueado para evitar sobrescrita vazia do orçamento.', {
          orcamentoId: orcamentoAtivoId
        });
        return;
      }

      if (baseline.orcamentoId === orcamentoAtivoId && atualTemDados) {
        autosaveBaselineRef.current = { ...baseline, hadData: true };
        const snapPayload = montarPayloadSalvarOrcamento(s, i, sessaoAtual);
        saveOrcamentoSnapshot(centroCustoId, orcamentoAtivoId, {
          servicos: s,
          imports: i,
          sessaoOrcamento: (snapPayload.sessaoOrcamento ?? sessaoAtual) as SessaoOrcamentoPersist
        });
      }
      saveOrcamentoToApi(
        centroCustoId,
        orcamentoAtivoId,
        montarPayloadSalvarOrcamento(s, i, sessaoRef.current)
      ).catch(err => console.warn('Erro ao salvar orçamento no servidor:', err));
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
    planilhaTipoInsumo,
    meta,
    itensOcultosNoOrcamento,
    cronograma,
    servicos,
    imports,
    orcamentoViewTab,
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
      const d = await fetchOrcamentosListaComRetry(centroCustoId);
      seedOrcamentosListaCache(centroCustoId, d);
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
    const sessao =
      (sessaoOverride !== undefined ? sessaoOverride : sessaoRef.current) ?? sessaoVazia();
    saveOrcamentoToApi(centroCustoId, orcamentoAtivoId, montarPayloadSalvarOrcamento(s, i, sessao)).catch(err => {
      console.warn('Erro ao salvar orçamento no servidor:', err);
      toast.error('Não foi possível salvar o orçamento no servidor. Verifique a conexão e tente de novo.');
    });
  };

  /** Remove um registro do histórico de importações (lista de documentos do contrato). */
  const removerImportDoHistorico = async (importId: string) => {
    if (!centroCustoId) return;
    if (!confirm('Remover este documento da lista de importações?')) return;
    const prev = imports;
    const next = imports.filter(i => i.id !== importId);
    setImports(next);
    try {
      localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(next));
    } catch {
      /* quota */
    }
    try {
      const atual = await fetchServicosPadraoFromApi(centroCustoId);
      const servicosPadraoBase =
        Array.isArray(atual?.servicos)
          ? atual!.servicos
          : (servicosPadraoContrato.length > 0 ? servicosPadraoContrato : servicos);
      const servicosPadrao = next.length === 0 ? [] : servicosPadraoBase;
      await saveServicosPadraoToApi(centroCustoId, { servicos: servicosPadrao, imports: next });
      if (orcamentoAtivoId) {
        persistToApi(servicos, next);
      }
      toast.success('Documento removido da lista.');
    } catch {
      setImports(prev);
      try {
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(prev));
      } catch {
        /* quota */
      }
      toast.error('Não foi possível remover no servidor. Tente novamente.');
    }
  };

  const criarNovoOrcamento = async () => {
    if (!centroCustoId) return;
    setNovoOrcamentoMetaDraft({ ...metaNovoOrcamentoPadrao(), nomeOrcamento: '' });
    setNovoOrcamentoStep(1);
    setNovoOrcamentoMetaOpen(true);
    void loadEmployeeOptionsForMeta();
  };

  const confirmarCriacaoNovoOrcamento = async () => {
    if (!centroCustoId || isCreatingOrcamento) return;
    const nomeTrim = novoOrcamentoMetaDraft.nomeOrcamento.trim();
    if (!nomeTrim) {
      toast.error('Informe o nome do orçamento.');
      return;
    }
    const { nomeOrcamento: _omitNome, ...metaRest } = novoOrcamentoMetaDraft;
    const d = {
      ...metaRest,
      osNumeroPasta: novoOrcamentoMetaDraft.osNumeroPasta.trim(),
      responsavelOrcamento: novoOrcamentoMetaDraft.responsavelOrcamento.trim(),
      descricao: novoOrcamentoMetaDraft.descricao.trim(),
      orcamentoRealizadoPor: currentUserName || novoOrcamentoMetaDraft.orcamentoRealizadoPor.trim(),
      prazoExecucaoDias: novoOrcamentoMetaDraft.prazoExecucaoDias.trim(),
      descontoPercentual: novoOrcamentoMetaDraft.descontoPercentual.trim(),
      bdiPercentual: novoOrcamentoMetaDraft.bdiPercentual.trim(),
      reajustes: (novoOrcamentoMetaDraft.reajustes ?? []).map((r, idx) => ({
        nome: (r.nome || '').trim() || `${idx + 1}º reajuste`,
        percentual: (r.percentual || '').trim()
      })),
      dataAbertura: novoOrcamentoMetaDraft.dataAbertura || todayInputDate(),
      dataEnvio:
        novoOrcamentoMetaDraft.dataEnvio.trim() ||
        calcularDataFimOrcamento(
          novoOrcamentoMetaDraft.dataAbertura || todayInputDate(),
          '',
          novoOrcamentoMetaDraft.prazoExecucaoDias
        )
    };
    if (!d.osNumeroPasta || !d.descricao) {
      toast.error('Preencha OS/Nº da pasta e descrição.');
      return;
    }
    try {
      setIsCreatingOrcamento(true);
      const entry = await criarOrcamentoApi(centroCustoId, nomeTrim);
      setListaOrcamentos(prev => [entry, ...prev.filter(o => o.id !== entry.id)]);
      setNomeOrcamentoRascunho(entry.nome);
      setOrcamentoAtivoId(entry.id);
      navigateEmbeddedOrcamentoPath(entry.id);
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
      setNovoOrcamentoStep(1);
      toast.success('Novo orçamento criado. Preencha os serviços e clique em salvar para gerar a revisão R01.');
    } catch {
      toast.error('Não foi possível criar o orçamento.');
    } finally {
      setIsCreatingOrcamento(false);
    }
  };

  const podeAvancarNovoOrcamento = (step: 1 | 2 | 3) => {
    if (step === 1) {
      return (
        novoOrcamentoMetaDraft.nomeOrcamento.trim().length > 0 &&
        novoOrcamentoMetaDraft.osNumeroPasta.trim().length > 0 &&
        (novoOrcamentoMetaDraft.dataAbertura || '').trim().length > 0
      );
    }
    if (step === 2) {
      return true;
    }
    return true;
  };

  const abrirOrcamentoDaLista = (id: string) => {
    const meta = listaOrcamentos.find(o => o.id === id);
    setOrcamentoViewTab('montagem');
    setNomeOrcamentoRascunho(meta?.nome ?? '');
    setOrcamentoAtivoId(id);
    navigateEmbeddedOrcamentoPath(id);
  };

  const pedirExclusaoOrcamento = (id: string, nome: string) => {
    setOrcamentoExcluirConfirm({ id, nome });
  };

  const confirmarExclusaoOrcamento = async () => {
    if (!centroCustoId || !orcamentoExcluirConfirm) return;
    const { id } = orcamentoExcluirConfirm;
    setExcluindoOrcamento(true);
    try {
      await excluirOrcamentoApi(centroCustoId, id);
      localStorage.removeItem(storageKey(centroCustoId, 'sessao', id));
      setListaOrcamentos(prev => prev.filter(o => o.id !== id));
      if (orcamentoAtivoId === id) {
        navigateEmbeddedOrcamentoPath(null);
        setOrcamentoAtivoId(null);
        setNomeOrcamentoRascunho('');
        setServicos([]);
        setImports([]);
      }
      setOrcamentoExcluirConfirm(null);
      toast.success('Orçamento excluído.');
    } catch {
      toast.error('Não foi possível excluir o orçamento.');
    } finally {
      setExcluindoOrcamento(false);
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
    void loadEmployeeOptionsForMeta();
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
      orcamentoRealizadoPor: editarDadosDraft.orcamentoRealizadoPor.trim(),
      descontoPercentual: editarDadosDraft.descontoPercentual.trim(),
      bdiPercentual: editarDadosDraft.bdiPercentual.trim(),
      reajustes: (editarDadosDraft.reajustes ?? []).map((r, idx) => ({
        nome: (r.nome || '').trim() || `${idx + 1}º reajuste`,
        percentual: (r.percentual || '').trim()
      }))
    };

    try {
      if (nome !== nomeOrcamentoRascunho.trim()) {
        await renomearOrcamentoApi(centroCustoId, orcamentoAtivoId, nome);
        setNomeOrcamentoRascunho(nome);
      }

      const bdiPtsEdit = Math.round(parsePercentualMeta(nextMeta.bdiPercentual) * 10000) / 100;
      setListaOrcamentos(prev =>
        prev.map(o =>
          o.id === orcamentoAtivoId
            ? { ...o, nome, bdiPercentual: bdiPtsEdit }
            : o
        )
      );
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

  // ── Funções Orçafascio API ──────────────────────────────────────────────────

  const buscarComposicoesOrcafascio = async (page = 1) => {
    setOrcafascioLoading(true);
    setOrcafascioDetalhe(null);
    const q = orcafascioSearch.trim();
    try {
      // Código só dígitos (ex.: SINAPI 88418): listagem ignora — usar find_by_code
      if (/^\d+$/.test(q)) {
        const res = await api.get<OrcafascioComposicaoDetalhe>(
          '/orcafascio/composicoes/by-code',
          {
            params: { code: q, state: orcafascioUfOrse },
            timeout: 90000,
          }
        );
        const d = res.data;
        setOrcafascioResultados({
          total: 1,
          per_page: 1,
          current_page: 1,
          records: [
            {
              id: d.id,
              code: d.code,
              second_code: d.second_code,
              description: d.description,
              type: d.type,
              unit: d.unit,
              is_sicro: d.is_sicro,
              created_at: d.created_at,
            },
          ],
        });
        setOrcafascioPage(1);
        return;
      }

      const params: Record<string, unknown> = { page };
      if (q) params.search = q;
      const res = await api.get<OrcafascioListResponse<OrcafascioComposicaoListItem>>(
        '/orcafascio/composicoes',
        { params, timeout: 240000 }
      );
      setOrcafascioResultados(res.data);
      setOrcafascioPage(page);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao buscar composições';
      if (/^\d+$/.test(q) && (status === 404 || String(msg).includes('404'))) {
        toast.error(`Orçafascio: nenhuma composição com o código "${q}" neste estado.`);
      } else {
        toast.error(`Orçafascio: ${msg}`);
      }
      if (/^\d+$/.test(q)) setOrcafascioResultados(null);
    } finally {
      setOrcafascioLoading(false);
    }
  };

  const buscarOrcamentosOrcafascio = async (page = 1, searchOverride?: string, perPage?: number) => {
    setOrcafascioOrcamentosLoading(true);
    const q = (searchOverride !== undefined ? searchOverride : orcafascioModalOrcamentosSearch).trim();
    try {
      const res = await api.get<OrcafascioOrcamentosResponse>(
        '/orcafascio/orcamentos',
        {
          params: {
            page,
            ...(q ? { search: q } : {}),
            ...(perPage && perPage > 0 ? { per_page: perPage } : {}),
          },
          timeout: 60000,
        }
      );
      const data = res.data;
      setOrcafascioOrcamentos(data.budgets ?? []);
      setOrcafascioOrcamentosTotal(data.total ?? null);
      setOrcafascioOrcamentosPage(page);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao buscar orçamentos';
      toast.error(`Orçafascio: ${msg}`);
    } finally {
      setOrcafascioOrcamentosLoading(false);
    }
  };

  const carregarOrcamentosOrcafascioParaSelect = useCallback(async (search = '') => {
    const applyPayload = (payload: {
      items: OrcafascioOrcamentoItem[] | { id?: string; description?: string; code?: string; [k: string]: unknown }[];
      total: number | null;
      incomplete?: boolean;
    }) => {
      setOrcafascioOrcamentos(payload.items as OrcafascioOrcamentoItem[]);
      setOrcafascioOrcamentosTotal(payload.total);
      setOrcafascioOrcamentosPage(1);
      // Mantém “atualizando” enquanto pagina; libera o select assim que há itens.
      setOrcafascioOrcamentosLoading(Boolean(payload.incomplete));
    };

    const cached = peekOrcafascioOrcamentosCache(search);
    if (cached) {
      applyPayload(cached);
    } else {
      setOrcafascioOrcamentosLoading(true);
    }

    try {
      const payload = await loadOrcafascioOrcamentosList({
        search,
        onPartial: (partial) => {
          applyPayload(partial);
        },
      });
      applyPayload({ ...payload, incomplete: false });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao buscar orçamentos';
      toast.error(`Orçafascio: ${msg}`);
      if (!peekOrcafascioOrcamentosCache(search)) {
        setOrcafascioOrcamentos([]);
        setOrcafascioOrcamentosTotal(0);
      }
    } finally {
      setOrcafascioOrcamentosLoading(false);
    }
  }, []);

  const abrirModalImportarOrcafascioOrcamentos = () => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato antes de importar.');
      return;
    }
    setOrcafascioModalSoloOrcamentos(true);
    setOrcafascioImportSelectValue('');
    setOrcafascioImportDetalheModalOpen(false);
    setOrcafascioModalTab('orcamentos');
    setOrcafascioModalOrcamentosSearch('');
    setOrcafascioOrcamentoDetalhe(null);
    setOrcafascioOrcamentoComposicoes(null);
    setOrcafascioOrcamentoAnalitico(null);
    setOrcafascioOrcamentoLinhaCatalogo(null);
    setOrcafascioOrcamentoLinhaChave(null);

    const cached = peekOrcafascioOrcamentosCache('');
    if (cached) {
      setOrcafascioOrcamentos(cached.items as OrcafascioOrcamentoItem[]);
      setOrcafascioOrcamentosTotal(cached.total);
      setOrcafascioOrcamentosPage(1);
      setOrcafascioOrcamentosLoading(Boolean(cached.incomplete));
    } else {
      setOrcafascioOrcamentos(null);
      setOrcafascioOrcamentosLoading(true);
    }

    setOrcafascioModalOpen(true);
    void carregarOrcamentosOrcafascioParaSelect('');
  };

  const verDetalheOrcamentoOrcafascio = async (
    orcamento: OrcafascioOrcamentoItem,
    opts?: { force?: boolean }
  ) => {
    const bid = idOrcamentoOrcafascioParaApi(orcamento);
    const detalheAtualId = orcafascioOrcamentoDetalhe ? idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe) : '';
    if (!bid) {
      toast.error('Este orçamento não tem id para consulta na API.');
      return;
    }
    if (!opts?.force && detalheAtualId === bid) {
      setOrcafascioOrcamentoDetalhe(null);
      setOrcafascioOrcamentoComposicoes(null);
      setOrcafascioOrcamentoAnalitico(null);
      setOrcafascioOrcamentoLinhaCatalogo(null);
      setOrcafascioOrcamentoLinhaChave(null);
      return;
    }
    setOrcafascioOrcamentoDetalhe(orcamento);
    setOrcafascioOrcamentoComposicoes(null);
    setOrcafascioOrcamentoAnalitico(null);
    setOrcafascioOrcamentoLinhaCatalogo(null);
    setOrcafascioOrcamentoLinhaChave(null);
    setOrcafascioOrcamentoComposicoesLoading(true);
    setOrcafascioOrcamentoAnaliticoLoading(true);
    const enc = encodeURIComponent(bid);
    try {
      let listComp: Record<string, unknown>[] = [];
      try {
        const sint = await api.get(`/orcafascio/orcamentos/${enc}/sintetico`, { timeout: 120000 });
        listComp = normalizarListaApiOrcamento(sint.data);
      } catch {
        listComp = [];
      }
      setOrcafascioOrcamentoComposicoes(listComp);
      setOrcafascioOrcamentoComposicoesLoading(false);

      try {
        const ana = await api.get(`/orcafascio/orcamentos/${enc}/analitico`, { timeout: 120000 });
        setOrcafascioOrcamentoAnalitico(normalizarListaApiOrcamento(ana.data));
      } catch {
        setOrcafascioOrcamentoAnalitico([]);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao carregar composições do orçamento';
      toast.error(`Orçafascio: ${msg}`);
      setOrcafascioOrcamentoComposicoes([]);
      setOrcafascioOrcamentoAnalitico([]);
    } finally {
      setOrcafascioOrcamentoComposicoesLoading(false);
      setOrcafascioOrcamentoAnaliticoLoading(false);
    }
  };

  /** Clica na linha do orçamento: abre o analítico da composição no catálogo Orçafascio (mesma API da aba Composições). */
  const abrirCatalogoPorLinhaOrcamento = async (
    row: Record<string, unknown>,
    linhaIdx: number,
    scope: 'orcamento-composicoes'
  ) => {
    const code = codigoCatalogoLinhaOrcamentoOrcafascio(row) ?? '';
    const bid = orcafascioOrcamentoDetalhe ? idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe) : '';
    const buildItemIdRaw = row.build_item_id != null ? String(row.build_item_id).trim() : '';
    const linhaKeyBase = buildItemIdRaw || code || String(row.id ?? linhaIdx);
    const linhaKey = `${scope}-${bid}-${linhaIdx}-${linhaKeyBase}`;
    if (orcafascioOrcamentoLinhaChave === linhaKey && orcafascioOrcamentoLinhaCatalogo) {
      setOrcafascioOrcamentoLinhaCatalogo(null);
      setOrcafascioOrcamentoLinhaChave(null);
      return;
    }
    setOrcafascioOrcamentoLinhaChave(linhaKey);
    setOrcafascioOrcamentoLinhaCatalogoLoading(true);
    setOrcafascioOrcamentoLinhaCatalogo(null);
    try {
      const analiticoRows = orcafascioOrcamentoAnalitico ?? [];
      const analiticoMatch = encontrarLinhaAnaliticoParaComposicaoOrcamentoFixo(row, analiticoRows);

      if (analiticoMatch) {
        setOrcafascioOrcamentoLinhaCatalogo(
          detalheCatalogoAPartirAnaliticoOrcamento(analiticoMatch as Record<string, unknown>)
        );
        return;
      }
      toast.error('Não foi possível vincular esta composição ao analítico do orçamento (build_item_id/id).');
    } finally {
      setOrcafascioOrcamentoLinhaCatalogoLoading(false);
    }
  };

  const orcafascioImportSelectOptions = useMemo(() => {
    return (orcafascioOrcamentos ?? []).map((o) => {
      const id = idOrcamentoOrcafascioParaApi(o);
      const nome = String(o.description ?? '').trim() || 'Orçamento sem nome';
      const codigo = String(o.code ?? '').trim();
      const codigoCompacto = codigo.replace(/[\s/._-]+/g, '');
      return {
        value: id || String(o.id),
        label: nome,
        description: codigo || undefined,
        searchText: [nome, codigo, codigoCompacto, id].filter(Boolean).join(' '),
      };
    });
  }, [orcafascioOrcamentos]);

  const verDetalheComposicaoOrcafascio = async (comp: OrcafascioComposicaoListItem) => {
    setOrcafascioComposicaoDetalheTab('itens');
    setOrcafascioDetalheLoading(true);
    try {
      const res = await api.get<OrcafascioComposicaoDetalhe>(
        `/orcafascio/composicoes/by-code`,
        { params: { code: comp.code, state: orcafascioUfOrse }, timeout: 90000 }
      );
      setOrcafascioDetalhe(res.data);
    } catch {
      // fallback: busca por ID
      try {
        const baseSeg = comp.__orcafascio_base;
        const res = await api.get<OrcafascioComposicaoDetalhe>(
          `/orcafascio/composicoes/${comp.id}`,
          {
            params: baseSeg ? { base: baseSeg } : undefined,
            timeout: 90000,
          }
        );
        setOrcafascioDetalhe(res.data);
      } catch (err: any) {
        toast.error('Erro ao carregar detalhes da composição');
      }
    } finally {
      setOrcafascioDetalheLoading(false);
    }
  };

  const importarComposicaoOrcafascio = async (detalhe: OrcafascioComposicaoDetalhe) => {
    const novaComp = orcafascioToComposicaoItem(detalhe);
    const existe = composicoes.findIndex(c => c.codigo === novaComp.codigo);
    let novas: ComposicaoItem[];
    if (existe >= 0) {
      if (!confirm(`A composição "${novaComp.codigo}" já existe no catálogo. Substituir?`)) return;
      novas = composicoes.map((c, i) => (i === existe ? novaComp : c));
    } else {
      novas = [...composicoes, novaComp];
    }
    setComposicoes(novas);
    try {
      await saveComposicoesGeralToApi(novas);
      toast.success(`Composição ${novaComp.codigo} importada com sucesso!`);
      setOrcafascioModalOpen(false);
      setOrcafascioModalSoloOrcamentos(false);
      setOrcafascioDetalhe(null);
    } catch {
      toast.error('Erro ao salvar composição importada');
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
    toast.success('Serviço criado.');
  };

  const adicionarTituloNoOrcamentoViaMenu = (tituloRaw: string, subtituloRaw: string) => {
    const titulo = tituloRaw.trim();
    if (!titulo) return;
    const subtituloInicial = subtituloRaw.trim();
    if (!subtituloInicial) return;
    const novoServicoId = crypto.randomUUID();
    const novoSubId = crypto.randomUUID();
    const novo: ServicoPadrao = {
      id: novoServicoId,
      nome: titulo,
      subtitulos: [{ id: novoSubId, nome: subtituloInicial, itens: [] }]
    };
    const updated = [...servicos, novo];
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setSubtitulosNoOrcamento((prev) => {
      const bk = `${novoServicoId}|${novoSubId}`;
      if (prev.includes(bk)) return prev;
      return [...prev, bk];
    });
    toast.success(`Serviço "${titulo}" adicionado.`);
  };

  const adicionarSubtituloNoOrcamentoViaMenu = (servicoId: string, subtituloNomeRaw: string) => {
    const subtituloNome = subtituloNomeRaw.trim();
    if (!subtituloNome) return;
    const novoSubId = crypto.randomUUID();
    const updated = servicos.map((s) =>
      s.id === servicoId
        ? { ...s, subtitulos: [...s.subtitulos, { id: novoSubId, nome: subtituloNome, itens: [] }] }
        : s
    );
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setSubtitulosNoOrcamento((prev) => {
      const bk = `${servicoId}|${novoSubId}`;
      if (prev.includes(bk)) return prev;
      return [...prev, bk];
    });
    toast.success(`Subtítulo "${subtituloNome}" adicionado.`);
  };

  const abrirModalNovoTituloViaMenu = () => {
    setNovoBlocoModalMode('titulo');
    setNovoBlocoModalServicoId(null);
    setNovoBlocoTituloNome('');
    setNovoBlocoSubtituloNome('');
    setNovoBlocoModalOpen(true);
  };

  const abrirModalNovoSubtituloViaMenu = (servicoId: string) => {
    setNovoBlocoModalMode('subtitulo');
    setNovoBlocoModalServicoId(servicoId);
    setNovoBlocoSubtituloNome('');
    setNovoBlocoModalOpen(true);
  };

  const confirmarNovoBlocoModal = () => {
    if (novoBlocoModalMode === 'titulo') {
      if (!novoBlocoTituloNome.trim()) {
        toast.error('Informe o nome do serviço.');
        return;
      }
      if (!novoBlocoSubtituloNome.trim()) {
        toast.error('Informe o subtítulo do serviço.');
        return;
      }
      adicionarTituloNoOrcamentoViaMenu(novoBlocoTituloNome, novoBlocoSubtituloNome);
      setNovoBlocoModalOpen(false);
      return;
    }
    if (!novoBlocoModalServicoId) {
      toast.error('Não foi possível identificar o título para incluir o subtítulo.');
      return;
    }
    if (!novoBlocoSubtituloNome.trim()) {
      toast.error('Informe o nome do subtítulo.');
      return;
    }
    adicionarSubtituloNoOrcamentoViaMenu(novoBlocoModalServicoId, novoBlocoSubtituloNome);
    setNovoBlocoModalOpen(false);
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

  const addItemToServico = (
    servicoId: string,
    subtituloId: string,
    item: ComposicaoItem
  ): AppendComposicaoAoSubtituloResult => {
    const r = appendComposicaoItemAoSubtitulo(
      servicosRef.current,
      servicoId,
      subtituloId,
      item
    );
    if (!r.ok) return r;
    servicosRef.current = r.next;
    setServicos(r.next);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, r.next);
      persistToApi(r.next, imports);
    }
    return r;
  };

  /** Orçamento perfeito na aba Importações: atualiza base do contrato (e o orçamento aberto, se houver). */
  const processarImportOrcamentoPerfeitoArquivo = async (file: File): Promise<boolean> => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato (centro de custo) antes de importar.');
      return false;
    }
    setIsImportandoOrcamento(true);
    try {
      const parsed = await parsePlanilhaOrcamentoPerfeito(file);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return false;
      }
      const servicosImportados = parsed.servicos;
      if (parsed.composicoesAnaliticas.length > 0) {
        setComposicoes(parsed.composicoesAnaliticas);
        await saveComposicoesGeralToApi(parsed.composicoesAnaliticas);
      }

      setServicos(servicosImportados);
      saveServicos(centroCustoId, servicosImportados);
      addImport(centroCustoId, {
        fileName: file.name,
        date: new Date().toISOString(),
        tipo: 'orçamento',
        origem: 'orcamento-perfeito',
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
        `${servicosImportados.length} serviço(s) importados na base do contrato (orçamento perfeito). ` +
          (orcamentoAtivoId
            ? 'Sincronizado com o orçamento aberto.'
            : 'Novos orçamentos podem usar essa base; a ficha de demanda fica ao editar cada documento.')
      );
      return true;
    } catch (err) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      const code = (err as { code?: string } | null)?.code;
      const detail = err instanceof Error ? err.message : '';
      if (code === 'ECONNABORTED') {
        toast.error('A planilha foi lida, mas o servidor demorou para salvar (timeout). Tente novamente.');
      } else if (status === 404) {
        toast.error('A planilha foi lida, mas a rota de salvamento não foi encontrada (404).');
      } else if (status && status >= 500) {
        toast.error('A planilha foi lida, mas ocorreu erro no servidor ao salvar.');
      } else if (detail) {
        toast.error(`Falha ao importar orçamento perfeito: ${detail}`);
      } else {
        toast.error('Erro ao processar o arquivo. Verifique o formato.');
      }
      return false;
    } finally {
      setIsImportandoOrcamento(false);
    }
  };

  /**
   * Lista de orçamentos: planilha feita fora do sistema vira um novo documento completo (com abas),
   * sem alterar a base do contrato; abre direto na aba Orçamento (montagem).
   */
  const importarPlanilhaComoNovoOrcamento = async (file: File): Promise<boolean> => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato (centro de custo) antes de importar.');
      return false;
    }
    setIsImportandoOrcamento(true);
    try {
      const parsed = await parsePlanilhaOrcamentoPerfeito(file);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return false;
      }
      const servicosImportados = parsed.servicos;
      if (parsed.composicoesAnaliticas.length > 0) {
        setComposicoes(parsed.composicoesAnaliticas);
        await saveComposicoesGeralToApi(parsed.composicoesAnaliticas);
      }
      const nomeBase = (file.name.replace(/\.[^/.]+$/, '') || 'Planilha').trim().slice(0, 100);
      const nomeLista = (`Importado — ${nomeBase}`).slice(0, 120);

      const entry = await criarOrcamentoApi(centroCustoId);
      const subtitulosNoOrcamento: string[] = [];
      const quantidadesPorItem: Record<string, number> = {};
      for (const s of servicosImportados) {
        for (const sub of s.subtitulos) {
          subtitulosNoOrcamento.push(`${s.id}|${sub.id}`);
          for (const it of sub.itens) {
            const itemKey = `${s.id}|${sub.id}|${it.chave}`;
            const q = it.quantidadePlanilha;
            if (q != null && q > 0 && Number.isFinite(q)) quantidadesPorItem[itemKey] = q;
          }
        }
      }

      const base = sessaoVazia();
      const meta: OrcamentoMeta = {
        ...(base.meta as OrcamentoMeta),
        dataAbertura: todayInputDate(),
        descricao: `Orçamento importado da planilha ${file.name}. Revise OS, valores e as abas de orçamento.`,
        osNumeroPasta: nomeBase.slice(0, 60) || 'Importação',
        orcamentoRealizadoPor: currentUserName || '',
        descontoPercentual: '0',
        bdiPercentual: '0',
        reajustes: [],
        importadoPlanilha: true
      };

      const servicosParaApi = servicosSemQuantidadePlanilha(servicosImportados);
      const padraoContrato = await fetchServicosPadraoFromApi(centroCustoId);
      const importsMesclados: ImportRecord[] = Array.isArray(padraoContrato?.imports) ? padraoContrato.imports : [];

      await saveOrcamentoToApi(centroCustoId, entry.id, {
        imports: importsMesclados,
        servicos: servicosParaApi,
        sessaoOrcamento: {
          ...base,
          subtitulosNoOrcamento,
          quantidadesPorItem,
          meta,
          servicosDocumento: servicosParaApi
        }
      });

      await renomearOrcamentoApi(centroCustoId, entry.id, nomeLista);
      const entryAtualizado = { ...entry, nome: nomeLista };
      setListaOrcamentos(prev => [entryAtualizado, ...prev.filter(o => o.id !== entry.id)]);
      setNomeOrcamentoRascunho(nomeLista);
      setOrcamentoAtivoId(entry.id);
      navigateEmbeddedOrcamentoPath(entry.id);
      setOrcamentoViewTab('montagem');
      toast.success(
        `Novo orçamento criado com ${servicosImportados.length} serviço(s). Você já pode revisar o orçamento e as demais abas.`
      );
      return true;
    } catch (err) {
      if (isOrcamentoRequestTimeout(err)) {
        toast.error('A planilha foi lida, mas o servidor demorou para salvar. Tente novamente.');
      } else {
        toast.error('Não foi possível criar o orçamento a partir da planilha.');
      }
      return false;
    } finally {
      setIsImportandoOrcamento(false);
    }
  };

  const handleImportOrcamentoPerfeito = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processarImportOrcamentoPerfeitoArquivo(file);
  };

  const confirmarImportOrcamentoModal = async () => {
    if (!importOrcamentoModalFile) {
      toast.error('Selecione um arquivo Excel ou CSV.');
      return;
    }
    const ok = await importarPlanilhaComoNovoOrcamento(importOrcamentoModalFile);
    if (ok) {
      setImportOrcamentoModalOpen(false);
      setImportOrcamentoModalFile(null);
    }
  };

  /**
   * Cria um orçamento local a partir do orçamento Orçafascio selecionado no modal,
   * com serviços/composições/quantidades, e abre na montagem.
   */
  const importarOrcamentoOrcafascioComoNovo = async (): Promise<boolean> => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato antes de importar.');
      return false;
    }
    if (!orcafascioOrcamentoDetalhe) {
      toast.error('Selecione um orçamento do Orçafascio.');
      return false;
    }
    if (orcafascioOrcamentoComposicoesLoading) {
      toast.error('Aguarde o carregamento das composições.');
      return false;
    }

    let linhas = orcafascioOrcamentoComposicoes ?? [];
    let analitico = orcafascioOrcamentoAnalitico ?? [];

    // Garante sintético + analítico (MO/MAT vêm do analítico; sintético sozinho só traz preço total).
    const precisaSintetico = linhas.length === 0;
    const precisaAnalitico = analitico.length === 0;
    if (precisaSintetico || precisaAnalitico) {
      const bid = idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe);
      if (!bid && precisaSintetico) {
        toast.error('Este orçamento não tem id para consulta na API.');
        return false;
      }
      if (bid) {
        setIsImportandoOrcamento(true);
        try {
          const enc = encodeURIComponent(bid);
          if (precisaSintetico) {
            try {
              const sint = await api.get(`/orcafascio/orcamentos/${enc}/sintetico`, { timeout: 120000 });
              // Mantém títulos/capítulos para montar a árvore serviço → subtítulo → itens.
              linhas = normalizarListaApiOrcamento(sint.data);
            } catch {
              linhas = [];
            }
          }
          if (precisaAnalitico) {
            try {
              const ana = await api.get(`/orcafascio/orcamentos/${enc}/analitico`, { timeout: 120000 });
              analitico = normalizarListaApiOrcamento(ana.data);
            } catch {
              analitico = [];
            }
          }
        } finally {
          setIsImportandoOrcamento(false);
        }
      }
    }

    if (linhas.length === 0) {
      toast.error('Este orçamento não retornou composições para importar.');
      return false;
    }

    setIsImportandoOrcamento(true);
    try {
      const { servicos: servicosMontados, composicoes: compsMontadas } = montarServicosDeLinhasOrcafascio(
        linhas,
        analitico
      );
      // Não chama find_by_code/listagem do catálogo na importação — o analítico do orçamento
      // já veio na API; enriquecer centenas de códigos flooda e trava o backend.
      const servicosImportados = servicosMontados;
      const compsNovas = compsMontadas;
      if (servicosImportados.length === 0) {
        toast.error('Não foi possível montar serviços a partir deste orçamento.');
        return false;
      }

      if (compsNovas.length > 0) {
        const porChave = new Map(composicoes.map((c) => [c.chave, c]));
        for (const c of compsNovas) {
          if (!porChave.has(c.chave)) porChave.set(c.chave, c);
        }
        const mescladas = Array.from(porChave.values());
        setComposicoes(mescladas);
        await saveComposicoesGeralToApi(mescladas);
      }

      const nomeOrigem = String(
        orcafascioOrcamentoDetalhe.description || orcafascioOrcamentoDetalhe.code || 'Orçafascio'
      )
        .trim()
        .slice(0, 100);
      const codigoOrigem = String(orcafascioOrcamentoDetalhe.code || '').trim();
      const nomeLista = (
        codigoOrigem ? `${nomeOrigem} (${codigoOrigem})` : `Orçafascio — ${nomeOrigem}`
      ).slice(0, 120);

      const entry = await criarOrcamentoApi(centroCustoId, nomeLista);
      const usarMemoriaCalculo = orcafascioImportUsarMemoria;
      const modoArredondamento = orcafascioImportModoArredondamento;
      const subtitulosNoOrcamento: string[] = [];
      const quantidadesPorItem: Record<string, number> = {};
      for (const s of servicosImportados) {
        for (const sub of s.subtitulos) {
          subtitulosNoOrcamento.push(`${s.id}|${sub.id}`);
          // Com "usar memória de cálculo", as quantidades entram zeradas — a pessoa preenche
          // pela aba Memória de Cálculo (dimensões p/ m³/m²/m, lista de locais p/ un).
          if (usarMemoriaCalculo) continue;
          for (const it of sub.itens) {
            const itemKey = `${s.id}|${sub.id}|${it.chave}`;
            const q = it.quantidadePlanilha;
            if (q != null && q > 0 && Number.isFinite(q)) quantidadesPorItem[itemKey] = q;
          }
        }
      }

      const base = sessaoVazia();
      const finApi = extrairMetaFinanceiraOrcafascio(linhas);
      const meta: OrcamentoMeta = {
        ...(base.meta as OrcamentoMeta),
        dataAbertura: todayInputDate(),
        descricao: `Importado do Orçafascio${codigoOrigem ? ` · ${codigoOrigem}` : ''}: ${nomeOrigem}.`,
        osNumeroPasta: (codigoOrigem || nomeOrigem).slice(0, 60),
        orcamentoRealizadoPor: currentUserName || '',
        // BDI/% e desconto vêm do sintético; sem defaults fictícios (25%/28%).
        descontoPercentual: finApi.descontoPercentual,
        bdiPercentual: finApi.bdiPercentual,
        reajustes: [],
        importadoPlanilha: true,
        usarMemoriaCalculo,
        modoArredondamento,
        orcafascioBudgetId: idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe) || undefined,
        orcafascioDados: extrairDadosCabecalhoOrcafascio(
          orcafascioOrcamentoDetalhe as Record<string, unknown>
        ),
        // Não grava totalComBdi do sintético Orçafascio aqui — esse total pode
        // divergir da montagem. O Total da lista vem do rodapé (totalComDescontoEBdi).
        ...(finApi.totalComBdi > 0
          ? {
              totaisOrcafascio: {
                semBdi: finApi.totalSemBdi,
                bdi: finApi.totalBdi,
                comBdi: finApi.totalComBdi,
              },
            }
          : {}),
      };

      const servicosParaApi = servicosSemQuantidadePlanilha(servicosImportados);
      const padraoContrato = await fetchServicosPadraoFromApi(centroCustoId);
      const importsMesclados: ImportRecord[] = Array.isArray(padraoContrato?.imports)
        ? padraoContrato.imports
        : [];

      await saveOrcamentoToApi(centroCustoId, entry.id, {
        imports: importsMesclados,
        servicos: servicosParaApi,
        sessaoOrcamento: {
          ...base,
          subtitulosNoOrcamento,
          quantidadesPorItem,
          meta,
          servicosDocumento: servicosParaApi,
        },
      });

      // Já deixamos o detalhe no cache — abrir o orçamento não espera o S3 de novo.
      seedOrcamentoDetailCache(centroCustoId, entry.id, {
        servicos: servicosParaApi,
        imports: importsMesclados,
        sessaoOrcamento: {
          ...base,
          subtitulosNoOrcamento,
          quantidadesPorItem,
          meta,
          servicosDocumento: servicosParaApi,
        },
      });

      await renomearOrcamentoApi(centroCustoId, entry.id, nomeLista);
      const bdiPtsImport = parsePercentualMeta(finApi.bdiPercentual) * 100;
      const entryAtualizado: OrcamentoListaEntry = {
        ...entry,
        nome: nomeLista,
        bdiPercentual: Math.round(bdiPtsImport * 100) / 100,
      };
      setListaOrcamentos((prev) => [entryAtualizado, ...prev.filter((o) => o.id !== entry.id)]);
      setNomeOrcamentoRascunho(nomeLista);
      setOrcamentoAtivoId(entry.id);
      navigateEmbeddedOrcamentoPath(entry.id);
      setOrcamentoViewTab(usarMemoriaCalculo ? 'memorial' : 'montagem');

      setOrcafascioImportUsarMemoria(false);
      setOrcafascioImportModoArredondamento('truncar');
      setOrcafascioModalOpen(false);
      setOrcafascioModalSoloOrcamentos(false);
      setOrcafascioImportSelectValue('');
      setOrcafascioImportDetalheModalOpen(false);
      setOrcafascioOrcamentoDetalhe(null);
      setOrcafascioOrcamentoComposicoes(null);
      setOrcafascioOrcamentoAnalitico(null);

      const totalItens = servicosImportados.reduce(
        (acc, s) => acc + s.subtitulos.reduce((a, sub) => a + sub.itens.length, 0),
        0
      );
      toast.success(
        `Orçamento «${nomeLista}» criado com ${servicosImportados.length} serviço(s) e ${totalItens} composição(ões)${
          finApi.bdiPercentual && finApi.bdiPercentual !== '0'
            ? ` · BDI ${finApi.bdiPercentual}%`
            : ''
        }.`
      );
      return true;
    } catch (err) {
      if (isOrcamentoRequestTimeout(err)) {
        toast.error('O orçamento é grande e o servidor demorou para salvar. Tente novamente.');
        return false;
      }
      const detail = err instanceof Error ? err.message : '';
      toast.error(
        detail
          ? `Não foi possível importar o orçamento: ${detail}`
          : 'Não foi possível criar o orçamento a partir do Orçafascio.'
      );
      return false;
    } finally {
      setIsImportandoOrcamento(false);
    }
  };

  const orcamentoVeioOrcafascio = Boolean(
    meta.importadoPlanilha &&
      (meta.orcafascioBudgetId ||
        typeof meta.usarMemoriaCalculo === 'boolean' ||
        /Importado do Orçafascio/i.test(meta.descricao || ''))
  );

  const orcafascioDadosExibicao = useMemo(() => {
    if (meta.orcafascioDados) return meta.orcafascioDados;
    if (!orcamentoVeioOrcafascio) return undefined;
    return acharCabecalhoOrcafascioNaCache(meta.orcafascioBudgetId, meta.osNumeroPasta);
  }, [meta.orcafascioDados, meta.orcafascioBudgetId, meta.osNumeroPasta, orcamentoVeioOrcafascio]);

  useEffect(() => {
    if (!orcamentoVeioOrcafascio || meta.orcafascioDados) return;
    const fromCache = acharCabecalhoOrcafascioNaCache(meta.orcafascioBudgetId, meta.osNumeroPasta);
    if (fromCache) {
      setMeta((m) => (m.orcafascioDados ? m : { ...m, orcafascioDados: fromCache }));
      return;
    }
    const search = (meta.osNumeroPasta || '').trim();
    if (!search && !meta.orcafascioBudgetId) return;
    let cancelled = false;
    void loadOrcafascioOrcamentosList({ search: search || undefined })
      .then((listed) => {
        if (cancelled) return;
        const idNorm = (meta.orcafascioBudgetId || '').trim();
        const codeNorm = search.toLowerCase();
        const hit = listed.items.find((i) => {
          const id = idOrcamentoOrcafascioParaApi(i as OrcafascioOrcamentoItem);
          if (idNorm && id === idNorm) return true;
          if (codeNorm && String(i.code || '').trim().toLowerCase() === codeNorm) return true;
          return false;
        });
        const dados = hit ? extrairDadosCabecalhoOrcafascio(hit as Record<string, unknown>) : undefined;
        if (!dados) return;
        setMeta((m) => (m.orcafascioDados ? m : { ...m, orcafascioDados: dados }));
      })
      .catch(() => {
        // Lista do Orçafascio indisponível: a aba segue só com o que já está salvo.
      });
    return () => {
      cancelled = true;
    };
  }, [
    orcamentoVeioOrcafascio,
    meta.orcafascioDados,
    meta.orcafascioBudgetId,
    meta.osNumeroPasta,
  ]);

  const resolverOrcafascioBudgetIdAtual = async (): Promise<string> => {
    if (meta.orcafascioBudgetId) return meta.orcafascioBudgetId;
    const codigo = (meta.osNumeroPasta || '').trim();
    if (!codigo) return '';
    const achar = (items: { id?: string; code?: string; [k: string]: unknown }[]) => {
      const hit = items.find((i) => String(i.code || '').trim().toLowerCase() === codigo.toLowerCase());
      return hit ? idOrcamentoOrcafascioParaApi(hit as OrcafascioOrcamentoItem) : '';
    };
    const caches = [peekOrcafascioOrcamentosCache(''), peekOrcafascioOrcamentosCache(codigo)];
    for (const c of caches) {
      const id = c?.items?.length ? achar(c.items) : '';
      if (id) return id;
    }
    try {
      const listed = await loadOrcafascioOrcamentosList({ search: codigo });
      return achar(listed.items);
    } catch {
      return '';
    }
  };

  const atualizarOrcamentoOrcafascio = async () => {
    if (!centroCustoId || !orcamentoAtivoId) {
      toast.error('Abra um orçamento importado do Orçafascio para atualizar.');
      return;
    }
    if (isAtualizandoOrcafascio) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Atualizar a partir do Orçafascio?\n\nComposições novas entram neste orçamento. As que foram removidas lá saem daqui.\nQuantidade, memória de cálculo e ficha de demanda das linhas que continuam são mantidas.\n\nPara apagar uma composição só neste orçamento, clique com o botão direito na linha.'
      )
    ) {
      return;
    }

    setIsAtualizandoOrcafascio(true);
    if (orcamentoAutosaveTimerRef.current) {
      clearTimeout(orcamentoAutosaveTimerRef.current);
      orcamentoAutosaveTimerRef.current = null;
    }
    try {
      const budgetId = await resolverOrcafascioBudgetIdAtual();
      if (!budgetId) {
        toast.error('Não achei o orçamento correspondente no Orçafascio. Importe de novo ou confira o código da OS.');
        return;
      }

      const enc = encodeURIComponent(budgetId);
      let linhas: Record<string, unknown>[] = [];
      let analitico: Record<string, unknown>[] = [];
      try {
        const sint = await api.get(`/orcafascio/orcamentos/${enc}/sintetico`, { timeout: 120000 });
        linhas = normalizarListaApiOrcamento(sint.data);
      } catch (err) {
        if (isOrcamentoRequestTimeout(err)) {
          toast.error('O Orçafascio demorou para responder o sintético. Tente novamente.');
        } else {
          toast.error('Não foi possível buscar o sintético no Orçafascio.');
        }
        return;
      }
      try {
        const ana = await api.get(`/orcafascio/orcamentos/${enc}/analitico`, { timeout: 120000 });
        analitico = normalizarListaApiOrcamento(ana.data);
      } catch {
        analitico = [];
      }

      if (linhas.length === 0) {
        toast.error('Este orçamento não retornou composições no Orçafascio.');
        return;
      }

      const { servicos: servicosNovos, composicoes: compsNovas } = montarServicosDeLinhasOrcafascio(
        linhas,
        analitico
      );
      if (servicosNovos.length === 0) {
        toast.error('Não foi possível montar os serviços a partir do Orçafascio.');
        return;
      }

      const chavesAntes = coletarChavesComposicao(servicos);
      const chavesDepois = coletarChavesComposicao(servicosNovos);
      let adicionadas = 0;
      let removidas = 0;
      for (const c of chavesDepois) if (!chavesAntes.has(c)) adicionadas += 1;
      for (const c of chavesAntes) if (!chavesDepois.has(c)) removidas += 1;

      const { servicos: servicosMesclados, chaveParaNovaKey } = mesclarArvoreServicosOrcafascio(
        servicos,
        servicosNovos
      );

      if (compsNovas.length > 0) {
        const porChave = new Map(composicoes.map((c) => [c.chave, c]));
        for (const c of compsNovas) {
          if (!porChave.has(c.chave)) porChave.set(c.chave, c);
        }
        const mescladas = Array.from(porChave.values());
        setComposicoes(mescladas);
        await saveComposicoesGeralToApi(mescladas);
      }

      const subtitulosNoOrcamentoNext: string[] = [];
      const quantidadesMescladas = remapearRegistroPorChave(quantidadesPorItem, chaveParaNovaKey);
      const usarMemoriaCalculo = meta.usarMemoriaCalculo === true;
      for (const s of servicosMesclados) {
        for (const sub of s.subtitulos) {
          subtitulosNoOrcamentoNext.push(`${s.id}|${sub.id}`);
          if (usarMemoriaCalculo) continue;
          for (const it of sub.itens) {
            const itemKey = `${s.id}|${sub.id}|${it.chave}`;
            if (quantidadesMescladas[itemKey] != null) continue;
            const q = it.quantidadePlanilha;
            if (q != null && q > 0 && Number.isFinite(q)) quantidadesMescladas[itemKey] = q;
          }
        }
      }

      const dimensoesNext = remapearRegistroPorChave(dimensoesPorItem, chaveParaNovaKey);
      const planilhaQtdNext = remapearRegistroPorChave(planilhaQuantidadeCompra, chaveParaNovaKey);
      const planilhaVlNext = remapearRegistroPorChave(planilhaValorUnitCompraReal, chaveParaNovaKey);
      const planilhaTipoNext = remapearRegistroPorChave(planilhaTipoInsumo, chaveParaNovaKey);
      const observacoesNext = remapearRegistroPorChave(fichaDemandaObservacoes, chaveParaNovaKey);
      const ocultosNext = remapearListaChavesOrcamento(itensOcultosNoOrcamento, chaveParaNovaKey);
      const insumosOcultosNext = remapearListaChavesOrcamento(insumosAnaliticoOcultos, chaveParaNovaKey);
      const manuaisNext = remapearRegistroPorChave(insumosAnaliticoManuais, chaveParaNovaKey);

      const finApi = extrairMetaFinanceiraOrcafascio(linhas);
      const orcafascioDadosRefresh =
        acharCabecalhoOrcafascioNaCache(budgetId, meta.osNumeroPasta) ?? meta.orcafascioDados;
      const nextMeta: OrcamentoMeta = {
        ...meta,
        orcafascioBudgetId: budgetId,
        ...(orcafascioDadosRefresh ? { orcafascioDados: orcafascioDadosRefresh } : {}),
        ...(finApi.totalComBdi > 0
          ? {
              totaisOrcafascio: {
                semBdi: finApi.totalSemBdi,
                bdi: finApi.totalBdi,
                comBdi: finApi.totalComBdi,
              },
            }
          : {}),
      };

      const servicosParaApi = servicosSemQuantidadePlanilha(servicosMesclados);
      const nextSessao: SessaoOrcamentoPersist = {
        ...sessaoRef.current,
        subtitulosNoOrcamento: subtitulosNoOrcamentoNext,
        quantidadesPorItem: quantidadesMescladas,
        dimensoesPorItem: dimensoesNext,
        planilhaQuantidadeCompra: planilhaQtdNext,
        planilhaValorUnitCompraReal: planilhaVlNext,
        planilhaTipoInsumo: planilhaTipoNext,
        itensOcultosNoOrcamento: ocultosNext,
        insumosAnaliticoOcultos: insumosOcultosNext,
        meta: nextMeta,
        servicosDocumento: servicosParaApi,
      };
      sessaoRef.current = nextSessao;
      servicosImportsRef.current = { servicos: servicosParaApi, imports };

      await saveOrcamentoToApi(
        centroCustoId,
        orcamentoAtivoId,
        montarPayloadSalvarOrcamento(servicosParaApi, imports, nextSessao)
      );

      setServicos(servicosParaApi);
      setSubtitulosNoOrcamento(subtitulosNoOrcamentoNext);
      setQuantidadesPorItem(quantidadesMescladas);
      setDimensoesPorItem(dimensoesNext);
      setPlanilhaQuantidadeCompra(planilhaQtdNext);
      setPlanilhaValorUnitCompraReal(planilhaVlNext);
      setPlanilhaTipoInsumo(planilhaTipoNext);
      setFichaDemandaObservacoes(observacoesNext);
      setItensOcultosNoOrcamento(ocultosNext);
      setInsumosAnaliticoOcultos(insumosOcultosNext);
      setInsumosAnaliticoManuais(manuaisNext);
      setMeta(nextMeta);

      const partes: string[] = [];
      if (adicionadas > 0) partes.push(`${adicionadas} nova(s)`);
      if (removidas > 0) partes.push(`${removidas} removida(s)`);
      toast.success(
        partes.length > 0
          ? `Orçamento atualizado do Orçafascio: ${partes.join(', ')}.`
          : 'Orçamento já estava igual ao Orçafascio.'
      );
    } catch (err) {
      if (isOrcamentoRequestTimeout(err)) {
        toast.error('A atualização demorou demais. Tente novamente.');
        return;
      }
      const detail = err instanceof Error ? err.message : '';
      toast.error(detail ? `Não foi possível atualizar: ${detail}` : 'Não foi possível atualizar do Orçafascio.');
    } finally {
      setIsAtualizandoOrcafascio(false);
    }
  };

  function removeSubtituloDoOrcamento(key: string) {
    setSubtitulosNoOrcamento(prev => prev.filter(k => k !== key));
    setItensOcultosNoOrcamento(prev => prev.filter(k => !k.startsWith(`${key}|`)));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(key + '|')) delete next[k];
      });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(key + '|')) delete next[k];
      });
      return next;
    });
  }

  const removeItemFromServico = (servicoId: string, subtituloId: string, chave: string) => {
    const itemKey = `${servicoId}|${subtituloId}|${chave}`;
    const blocoKey = `${servicoId}|${subtituloId}`;
    const svc = servicos.find(s => s.id === servicoId);
    const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);

    const nextOcultos = itensOcultosNoOrcamento.includes(itemKey)
      ? itensOcultosNoOrcamento
      : [...itensOcultosNoOrcamento, itemKey];
    const allHidden =
      !!sub &&
      sub.itens.length > 0 &&
      sub.itens.every(i => nextOcultos.includes(`${blocoKey}|${i.chave}`));

    if (allHidden) {
      removeSubtituloDoOrcamento(blocoKey);
      toast.success('Última composição removida; subtítulo retirado do orçamento');
      return;
    }

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
    setInsumosAnaliticoOcultos(prev => prev.filter(k => !k.startsWith(`${itemKey}|insumo`)));
    const baseOcultos = sessaoRef.current.itensOcultosNoOrcamento ?? [];
    const nextOcultosPersist = baseOcultos.includes(itemKey) ? baseOcultos : [...baseOcultos, itemKey];
    if (centroCustoId && orcamentoAtivoId) {
      persistToApi(servicos, imports, { ...sessaoRef.current, itensOcultosNoOrcamento: nextOcultosPersist });
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

  const apagarItensSelecionadosMontagem = () => {
    const keys = Array.from(itensSelecionadosMontagem);
    if (keys.length === 0) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        keys.length === 1
          ? 'Apagar o item selecionado?'
          : `Apagar ${keys.length} itens selecionados?`
      )
    ) {
      return;
    }

    const itemKeys = keys.filter(isChaveComposicaoMontagem);
    const blocoKeys = keys
      .filter(k => k.startsWith(SELECAO_MONTAGEM_BLOCO_PREFIX))
      .map(k => k.slice(SELECAO_MONTAGEM_BLOCO_PREFIX.length));

    let nextOcultos = [...itensOcultosNoOrcamento];
    const nextQuantidades = { ...quantidadesPorItem };
    const nextDimensoes = { ...dimensoesPorItem };
    let nextSubtitulos = [...subtitulosNoOrcamento];
    const blocosAfetados = new Set<string>(blocoKeys);

    for (const itemKey of itemKeys) {
      if (!nextOcultos.includes(itemKey)) nextOcultos.push(itemKey);
      delete nextQuantidades[itemKey];
      delete nextDimensoes[itemKey];
      const parsed = parseItemKeyOrcamento(itemKey);
      if (parsed) blocosAfetados.add(parsed.blocoKey);
    }

    for (const blocoKey of Array.from(blocosAfetados)) {
      const sub = findSubtituloPorBlocoKey(servicos, blocoKey);
      const blocoVazioSelecionado = blocoKeys.includes(blocoKey);
      if (blocoVazioSelecionado) {
        nextSubtitulos = nextSubtitulos.filter(k => k !== blocoKey);
        nextOcultos = nextOcultos.filter(k => !k.startsWith(`${blocoKey}|`));
        Object.keys(nextQuantidades).forEach(k => {
          if (k.startsWith(`${blocoKey}|`)) delete nextQuantidades[k];
        });
        Object.keys(nextDimensoes).forEach(k => {
          if (k.startsWith(`${blocoKey}|`)) delete nextDimensoes[k];
        });
        continue;
      }
      if (!sub || sub.itens.length === 0) continue;
      const allHidden = sub.itens.every(i =>
        nextOcultos.includes(buildItemKeyOrcamento(blocoKey, i.chave))
      );
      if (!allHidden) continue;
      nextSubtitulos = nextSubtitulos.filter(k => k !== blocoKey);
      nextOcultos = nextOcultos.filter(k => !k.startsWith(`${blocoKey}|`));
      Object.keys(nextQuantidades).forEach(k => {
        if (k.startsWith(`${blocoKey}|`)) delete nextQuantidades[k];
      });
      Object.keys(nextDimensoes).forEach(k => {
        if (k.startsWith(`${blocoKey}|`)) delete nextDimensoes[k];
      });
    }

    setSubtitulosNoOrcamento(nextSubtitulos);
    setItensOcultosNoOrcamento(nextOcultos);
    setQuantidadesPorItem(nextQuantidades);
    setDimensoesPorItem(nextDimensoes);
    setItensSelecionadosMontagem(new Set());

    if (centroCustoId && orcamentoAtivoId) {
      persistToApi(servicos, imports, {
        ...sessaoRef.current,
        subtitulosNoOrcamento: nextSubtitulos,
        itensOcultosNoOrcamento: nextOcultos
      });
    }
    toast.success(keys.length === 1 ? 'Item removido' : `${keys.length} itens removidos`);
  };


  const subtitulosAdicionados = useMemo(() => {
    return subtitulosNoOrcamento
      .map(key => {
        const sep = key.lastIndexOf('|');
        if (sep <= 0) return null;
        const servicoId = key.slice(0, sep);
        const subtituloId = key.slice(sep + 1);
        const svc = servicos.find(s => s.id === servicoId) ?? servicosParaDropdown.find(s => s.id === servicoId);
        const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
        return sub ? { key, servicoNome: svc!.nome, subtituloNome: sub.nome, itens: sub.itens } : null;
      })
      .filter(Boolean) as { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[];
  }, [subtitulosNoOrcamento, servicos, servicosParaDropdown]);

  const assinaturasItensVisiveisNoOrcamento = useMemo(() => {
    const s = new Set<string>();
    const ocultos = new Set(itensOcultosNoOrcamento);
    for (const bloco of subtitulosAdicionados) {
      for (const it of bloco.itens) {
        const ik = `${bloco.key}|${it.chave}`;
        if (!ocultos.has(ik)) s.add(itemSigParaOrcamento(it));
      }
    }
    return s;
  }, [subtitulosAdicionados, itensOcultosNoOrcamento]);

  /** Retira do orçamento blocos já sem nenhuma composição visível (ex.: tudo em itens ocultos ou subtítulo órfão). */
  useEffect(() => {
    if (loadingFromApi || servicos.length === 0) return;
    const keysToRemove = subtitulosNoOrcamento.filter(blocoKey => {
      const sep = blocoKey.lastIndexOf('|');
      if (sep <= 0) return true;
      const servicoId = blocoKey.slice(0, sep);
      const subtituloId = blocoKey.slice(sep + 1);
      const svc = servicos.find(s => s.id === servicoId) ?? servicosParaDropdown.find(s => s.id === servicoId);
      const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
      // Mantém subtítulos vazios/criados manualmente; remove apenas referências órfãs.
      return !sub;
    });
    if (keysToRemove.length === 0) return;
    setSubtitulosNoOrcamento(prev => prev.filter(k => !keysToRemove.includes(k)));
    setItensOcultosNoOrcamento(prev =>
      prev.filter(k => !keysToRemove.some(bk => k.startsWith(`${bk}|`)))
    );
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      keysToRemove.forEach(bk => {
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${bk}|`)) delete next[k];
        });
      });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      keysToRemove.forEach(bk => {
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${bk}|`)) delete next[k];
        });
      });
      return next;
    });
  }, [loadingFromApi, subtitulosNoOrcamento, itensOcultosNoOrcamento, servicos, servicosParaDropdown]);

  useLayoutEffect(() => {
    const el = montagemOrcamentoTableRef.current;
    if (!el) return;
    const onContextMenuNative = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const tr = target.closest('tr[data-orc-ctx-montagem]');
      if (!tr || !el.contains(tr)) return;
      e.preventDefault();
      e.stopPropagation();
      const kind = tr.getAttribute('data-orc-ctx-montagem');
      const mw = 224;
      const mh = 188;
      let left = e.clientX;
      let top = e.clientY;
      left = Math.min(left, window.innerWidth - mw - 8);
      top = Math.min(top, window.innerHeight - mh - 8);
      if (kind === 'tituloServico') {
        const servicoId = tr.getAttribute('data-servico-id');
        if (servicoId) setMenuCtxMontagem({ kind: 'tituloServico', left, top, servicoId });
      } else if (kind === 'subtitulo') {
        const blocoKey = tr.getAttribute('data-bloco-key');
        if (blocoKey) setMenuCtxMontagem({ kind: 'subtitulo', left, top, blocoKey });
      } else if (kind === 'composicao') {
        const composicaoKey = tr.getAttribute('data-item-key');
        if (composicaoKey) setMenuCtxMontagem({ kind: 'composicao', left, top, composicaoKey });
      }
    };
    el.addEventListener('contextmenu', onContextMenuNative, { capture: true });
    return () => el.removeEventListener('contextmenu', onContextMenuNative, { capture: true });
  }, [subtitulosAdicionados.length, orcamentoViewTab]);

  const todosSubtitulos = useMemo(() => {
    const list: { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[] = [];
    servicosCatalogoDropdown.forEach(s =>
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
  }, [servicosCatalogoDropdown]);

  const todosSubtitulosFiltradosPesquisa = useMemo(() => {
    const q = servicosSearch.trim().toLowerCase();
    if (!q) return todosSubtitulos;
    return todosSubtitulos.filter(t => {
      const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
      if (label.includes(q)) return true;
      return t.itens.some(
        i =>
          (i.codigo || '').toLowerCase().includes(q) ||
          (i.descricao || '').toLowerCase().includes(q)
      );
    });
  }, [todosSubtitulos, servicosSearch]);

  const linhasDisponiveisDropdown = useMemo(() => {
    const keys = new Set<string>();
    const ocultosSet = new Set(itensOcultosNoOrcamento);
    const visiveis = assinaturasItensVisiveisNoOrcamento;
    for (const t of todosSubtitulos) {
      const blocoPorKey = subtitulosNoOrcamento.includes(t.key);
      if (t.itens.length === 0) {
        if (!blocoPorKey) keys.add(buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS));
        continue;
      }
      for (const i of t.itens) {
        const ik = buildItemKeyOrcamento(t.key, i.chave);
        const jaVisivel = visiveis.has(itemSigParaOrcamento(i));
        if (!jaVisivel) keys.add(ik);
        else if (blocoPorKey && ocultosSet.has(ik)) keys.add(ik);
      }
    }
    return keys;
  }, [
    todosSubtitulos,
    subtitulosNoOrcamento,
    itensOcultosNoOrcamento,
    assinaturasItensVisiveisNoOrcamento
  ]);

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
    const blocoPorKey = subtitulosNoOrcamento.includes(t.key);
    const visiveis = assinaturasItensVisiveisNoOrcamento;
    const keys =
      t.itens.length === 0
        ? blocoPorKey
          ? []
          : [buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS)]
        : t.itens
            .filter(i => {
              const ik = buildItemKeyOrcamento(t.key, i.chave);
              const jaVisivel = visiveis.has(itemSigParaOrcamento(i));
              if (!jaVisivel) return true;
              return blocoPorKey && itensOcultosNoOrcamento.includes(ik);
            })
            .map(i => buildItemKeyOrcamento(t.key, i.chave));
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
    const servicosParaSalvar =
      novosBlocos.length > 0
        ? incorporarNovosBlocosNoEstadoServicos(servicos, novosBlocos, servicosCatalogoDropdown)
        : servicos;
    if (novosBlocos.length > 0) {
      setServicos(servicosParaSalvar);
      if (centroCustoId) saveServicos(centroCustoId, servicosParaSalvar);
    }
    setItensOcultosNoOrcamento(prev => {
      let next = prev.filter(k => !restaurarKeys.includes(k));
      for (const blocoKey of novosBlocos) {
        const chavesSel = porBlocoNovo.get(blocoKey);
        const sub = findSubtituloPorBlocoKey(servicosCatalogoDropdown, blocoKey);
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
        const sub = findSubtituloPorBlocoKey(servicosCatalogoDropdown, blocoKey);
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
      persistToApi(servicosParaSalvar, imports, { ...sessaoRef.current, itensOcultosNoOrcamento: nextOcultosPersist });
    }
    setLinhasSelecionadasDropdown(new Set());
    const msgs: string[] = [];
    if (restaurarKeys.length === 1) msgs.push('1 linha readicionada ao orçamento');
    else if (restaurarKeys.length > 1) msgs.push(`${restaurarKeys.length} linhas readicionadas ao orçamento`);
    if (novosBlocos.length === 1) msgs.push('1 serviço adicionado (linhas selecionadas)');
    else if (novosBlocos.length > 1) msgs.push(`${novosBlocos.length} serviços adicionados (linhas selecionadas)`);
    if (msgs.length > 0) toast.success(msgs.join('. ') + '.');
  };

  /** Remove do orçamento todos os subtítulos/itens daquele serviço (linha vermelha de título). */
  const removerTituloServicoDoOrcamento = (servicoId: string) => {
    const prefix = `${servicoId}|`;
    setSubtitulosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setItensOcultosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setLinhasSelecionadasDropdown(prev => new Set(Array.from(prev).filter(k => !k.startsWith(prefix))));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(prefix)) delete next[k];
      });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(prefix)) delete next[k];
      });
      return next;
    });
    toast.success('Serviço removido do orçamento');
  };

  const mapaComposicoes = useMemo(() => {
    const m: Record<string, ComposicaoItem> = {};
    composicoes.forEach((c) => {
      const chaves = chavesParaBusca(c.codigo, c.banco, c.chave);
      chaves.forEach((k) => {
        if (!k) return;
        const prev = m[k];
        m[k] = prev ? escolherComposicaoParaChaveMapa(prev, c) : c;
      });
    });
    return m;
  }, [composicoes]);

  const { itensCalculados, total, totalComBdi: totalGeralComBdi } = useMemo(() => {
    const lista: {
      key: string;
      blocoKey: string;
      servicoNome: string;
      subtituloNome: string;
      item: ItemServico;
      precoUnitario: number;
      precoUnitarioComBdi: number;
      maoDeObraUnitario: number;
      materialUnitario: number;
      subMaoDeObra: number;
      subMaterial: number;
      subMatMaisMo: number;
      quantidade: number;
      total: number;
      totalComBdi: number;
      dimensoes?: DimensoesItem;
      tipoUnidade: TipoUnidadeFormula;
      unidadeComposicao?: string;
    }[] = [];
    const ocultosSet = new Set(itensOcultosNoOrcamento);
    for (const bloco of subtitulosAdicionados) {
      for (const i of bloco.itens) {
        const itemKey = `${bloco.key}|${i.chave}`;
        if (ocultosSet.has(itemKey)) continue;
        const composicao = composicaoResolvidaDoItemServico(i, mapaComposicoes);
        const precoItem = Number(i.precoUnitario);
        const precoComp = Number(composicao?.precoUnitario);
        const preco =
          precoItem > 0 ? precoItem : precoComp > 0 ? precoComp : 0;
        const precoComBdiItem = Number(i.precoUnitarioComBdi);
        const precoComBdi =
          precoComBdiItem > 0
            ? precoComBdiItem
            : preco > 0
              ? preco * (1 + parsePercentualMeta(meta.bdiPercentual))
              : 0;
        const { mo: maoDeObraUnitario, mat: materialUnitario } = moMatUnitarioDeItemOuComposicao(
          i,
          composicao
        );
        const dim = dimensoesPorItem[itemKey];
        const tipoAuto = inferirTipoUnidadePorDimensao(dim?.linhas);
        const tipoDaComp = parseUnidadeComposicao(composicao?.unidade ?? i.unidade);
        const tipoUnidade: TipoUnidadeFormula = (tipoDaComp && tipoDaComp !== 'un') ? tipoDaComp : tipoAuto;
        let qtd = 0;
        if (tipoUnidade === 'un') {
          qtd =
            meta.usarMemoriaCalculo === true
              ? calcularQuantidadeContagem(dim?.linhasContagem)
              : Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        } else if (dim?.linhas?.length) {
          qtd = dim.linhas.reduce(
            (s, ln) => (ln.cabecalhoSecao ? s : s + calcularQuantidadeLinha(ln, tipoUnidade)),
            0
          );
        } else {
          qtd = Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        }
        const moUnit = maoDeObraUnitario;
        const matUnit = materialUnitario;
        const modoArred = meta.modoArredondamento;
        const subMaoDeObra = aplicarModoArredondamento(moUnit * qtd, modoArred);
        const subMaterial = aplicarModoArredondamento(matUnit * qtd, modoArred);
        const subMatMaisMo = aplicarModoArredondamento(subMaoDeObra + subMaterial, modoArred);

        // Importado: usa total da linha do Orçafascio (não recalcula unitário×qtd).
        const qOrig = Number(i.quantidadeImportada);
        const temTotaisImportados =
          meta.importadoPlanilha === true &&
          ((i.totalSemBdiImportado != null && Number.isFinite(i.totalSemBdiImportado)) ||
            (i.totalComBdiImportado != null && Number.isFinite(i.totalComBdiImportado)));
        const fatorQtd =
          temTotaisImportados && qOrig > 0 && Number.isFinite(qOrig)
            ? qtd / qOrig
            : 1;
        let totalItem: number;
        let totalComBdiItem: number;
        if (temTotaisImportados) {
          const semImp = Number(i.totalSemBdiImportado);
          const comImp = Number(i.totalComBdiImportado);
          totalItem =
            Number.isFinite(semImp) && semImp !== 0
              ? aplicarModoArredondamento(semImp * fatorQtd, modoArred)
              : aplicarModoArredondamento(preco * qtd, modoArred);
          totalComBdiItem =
            Number.isFinite(comImp) && comImp !== 0
              ? aplicarModoArredondamento(comImp * fatorQtd, modoArred)
              : aplicarModoArredondamento((precoComBdi > 0 ? precoComBdi : preco) * qtd, modoArred);
        } else {
          totalItem = aplicarModoArredondamento(preco * qtd, modoArred);
          totalComBdiItem = aplicarModoArredondamento((precoComBdi > 0 ? precoComBdi : preco) * qtd, modoArred);
        }
        const precisaDecodeDesc =
          typeof i.descricao === 'string' && i.descricao.includes('&');
        const precisaDecodeAnalitico =
          Array.isArray(i.analiticoLinhas) &&
          i.analiticoLinhas.some(
            (ln) => typeof ln.descricao === 'string' && ln.descricao.includes('&')
          );
        const itemExibicao: ItemServico =
          precisaDecodeDesc || precisaDecodeAnalitico
            ? {
                ...i,
                ...(precisaDecodeDesc
                  ? { descricao: decodificarEntidadesHtml(i.descricao) }
                  : {}),
                ...(precisaDecodeAnalitico
                  ? {
                      analiticoLinhas: i.analiticoLinhas!.map((ln) =>
                        typeof ln.descricao === 'string' && ln.descricao.includes('&')
                          ? { ...ln, descricao: decodificarEntidadesHtml(ln.descricao) }
                          : ln
                      )
                    }
                  : {})
              }
            : i;
        lista.push({
          key: itemKey,
          blocoKey: bloco.key,
          servicoNome: bloco.servicoNome,
          subtituloNome: bloco.subtituloNome,
          item: itemExibicao,
          precoUnitario: preco,
          precoUnitarioComBdi: precoComBdi,
          maoDeObraUnitario: moUnit,
          materialUnitario: matUnit,
          subMaoDeObra,
          subMaterial,
          subMatMaisMo,
          quantidade: qtd,
          total: totalItem,
          totalComBdi: totalComBdiItem,
          dimensoes: dim,
          tipoUnidade,
          unidadeComposicao: composicao?.unidade
        });
      }
    }
    const soma = lista.reduce((acc, x) => acc + x.total, 0);
    const somaComBdi = lista.reduce((acc, x) => acc + x.totalComBdi, 0);
    return { itensCalculados: lista, total: soma, totalComBdi: somaComBdi };
  }, [
    meta.bdiPercentual,
    meta.importadoPlanilha,
    meta.usarMemoriaCalculo,
    meta.modoArredondamento,
    subtitulosAdicionados,
    quantidadesPorItem,
    dimensoesPorItem,
    mapaComposicoes,
    itensOcultosNoOrcamento,
  ]);

  const itensCalculadosPorBlocoNome = useMemo(() => {
    const m = new Map<string, typeof itensCalculados>();
    for (const r of itensCalculados) {
      const k = `${r.servicoNome}\0${r.subtituloNome}`;
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return m;
  }, [itensCalculados]);

  const itensCalculadosPorServicoNome = useMemo(() => {
    const m = new Map<string, typeof itensCalculados>();
    for (const r of itensCalculados) {
      const arr = m.get(r.servicoNome);
      if (arr) arr.push(r);
      else m.set(r.servicoNome, [r]);
    }
    return m;
  }, [itensCalculados]);

  /** Todos os itens do orçamento na ordem da memória de cálculo (inclui UN e medições dimensionais). */
  const itensMemoriaCalculoLista = useMemo(() => itensCalculados, [itensCalculados]);

  const chavesItensMontagemVisiveis = useMemo(
    () => itensCalculados.map(row => row.key),
    [itensCalculados]
  );
  const chavesMontagemPorServicoNome = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of itensCalculados) {
      const list = m.get(row.servicoNome) ?? [];
      list.push(row.key);
      m.set(row.servicoNome, list);
    }
    return m;
  }, [itensCalculados]);
  const chavesMontagemPorBlocoKey = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const bloco of subtitulosAdicionados) {
      m.set(
        bloco.key,
        itensCalculados
          .filter(r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome)
          .map(r => r.key)
      );
    }
    return m;
  }, [subtitulosAdicionados, itensCalculados]);
  const chavesSelecionaveisMontagem = useMemo(() => {
    const keys = [...chavesItensMontagemVisiveis];
    for (const bloco of subtitulosAdicionados) {
      if ((chavesMontagemPorBlocoKey.get(bloco.key) ?? []).length === 0) {
        keys.push(chaveSelecaoBlocoMontagem(bloco.key));
      }
    }
    return keys;
  }, [chavesItensMontagemVisiveis, subtitulosAdicionados, chavesMontagemPorBlocoKey]);
  const montagemChavesGrupoSubtitulo = (blocoKey: string) => {
    const itemKeys = chavesMontagemPorBlocoKey.get(blocoKey) ?? [];
    if (itemKeys.length > 0) return itemKeys;
    return [chaveSelecaoBlocoMontagem(blocoKey)];
  };
  const montagemChavesGrupoTitulo = (servicoNome: string) => {
    const itemKeys = chavesMontagemPorServicoNome.get(servicoNome) ?? [];
    const blocoKeysVazios = subtitulosAdicionados
      .filter(b => b.servicoNome === servicoNome)
      .filter(b => (chavesMontagemPorBlocoKey.get(b.key) ?? []).length === 0)
      .map(b => chaveSelecaoBlocoMontagem(b.key));
    return [...itemKeys, ...blocoKeysVazios];
  };
  const todosItensMontagemSelecionados =
    chavesSelecionaveisMontagem.length > 0 &&
    chavesSelecionaveisMontagem.every(key => itensSelecionadosMontagem.has(key));
  const algumItemMontagemSelecionado = chavesSelecionaveisMontagem.some(key =>
    itensSelecionadosMontagem.has(key)
  );

  useEffect(() => {
    setItensSelecionadosMontagem(prev => {
      const validas = new Set(chavesSelecionaveisMontagem);
      const next = new Set(Array.from(prev).filter(key => validas.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [chavesSelecionaveisMontagem]);

  const estadoCheckboxGrupoMontagem = (keys: string[]) => {
    if (keys.length === 0) {
      return { checked: false, indeterminate: false };
    }
    const selecionados = keys.filter(key => itensSelecionadosMontagem.has(key)).length;
    return {
      checked: selecionados === keys.length,
      indeterminate: selecionados > 0 && selecionados < keys.length
    };
  };

  const alternarGrupoMontagem = (keys: string[], checked: boolean) => {
    setItensSelecionadosMontagem(prev => {
      const next = new Set(prev);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

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
    // Sempre monta a árvore (também fora das abas pesadas) para exportar Orçamento completo.
    if (subtitulosAdicionados.length === 0) return out;
    const insumosOcultosSet = new Set(insumosAnaliticoOcultos);
    const itensPorBlocoNome = itensCalculadosPorBlocoNome;

    const servicoNumero = new Map<string, number>();
    let nextMain = 0;
    for (const b of subtitulosAdicionados) {
      if (!servicoNumero.has(b.servicoNome)) {
        servicoNumero.set(b.servicoNome, ++nextMain);
      }
    }

    for (let blocoIndex = 0; blocoIndex < subtitulosAdicionados.length; blocoIndex++) {
      const bloco = subtitulosAdicionados[blocoIndex];
      const rowsDoBloco =
        itensPorBlocoNome.get(`${bloco.servicoNome}\0${bloco.subtituloNome}`) ?? [];
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
        const comp = composicaoResolvidaDoItemServico(row.item, mapaComposicoes);
        const und = (row.unidadeComposicao || comp?.unidade || row.item.unidade || '').trim() || '—';
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

        const unitAnalitico = comp?.analiticoLinhas?.length
          ? {
              total: comp.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0),
              linhas: comp.analiticoLinhas
            }
          : { total: 0, linhas: [] };

        for (let i = 0; i < unitAnalitico.linhas.length; i++) {
          const ln = unitAnalitico.linhas[i];
          const insumoKey = `${key}|insumo|${i}`;
          if (insumosOcultosSet.has(insumoKey)) continue;
          const quantBase = ln.quantidade || 0;
          const qtd = quantBase * (row.quantidade || 0);
          const valorUnitInsumo = ln.precoUnitario || 0;
          const totalInsumo = qtd * valorUnitInsumo;
          out.push({
            kind: 'insumo',
            key: insumoKey,
            parentKey: key,
            item: `${itemComp}.${i + 1}`,
            codigo: ln.codigo ?? '',
            banco: ln.banco ?? row.item.banco ?? '',
            tipo: ln.tipoLabel ? tipoInsumoCodigoParaDescricao(ln.tipoLabel) : 'Insumo',
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
  }, [
    subtitulosAdicionados,
    itensCalculadosPorBlocoNome,
    mapaComposicoes,
    insumosAnaliticoOcultos,
  ]);

  /** Lookups O(1) para render do analítico / ficha (evita .find/.filter por linha). */
  const analiticoComposicaoPorKey = useMemo(() => {
    const m = new Map<
      string,
      Extract<(typeof linhasAnaliticoOrcamento)[number], { kind: 'composicao' }>
    >();
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'composicao') m.set(l.key, l);
    }
    return m;
  }, [linhasAnaliticoOrcamento]);

  const analiticoInsumosCountPorParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'insumo') {
        m.set(l.parentKey, (m.get(l.parentKey) ?? 0) + 1);
      }
    }
    return m;
  }, [linhasAnaliticoOrcamento]);

  /** Número do item como na planilha analítica (ex. 1.2.3) — memória de cálculo. */
  const rotuloItemComposicaoPorKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'composicao') m.set(l.key, l.item);
    }
    return m;
  }, [linhasAnaliticoOrcamento]);

  const linhasCronograma = useMemo((): CronogramaLinhaServico[] => {
    type Acc = CronogramaLinhaServico & { blocosMap: Map<string, CronogramaLinhaSubtitulo> };
    const map = new Map<string, Acc>();
    for (const row of itensCalculados) {
      const blocoKey = row.blocoKey;
      const sep = blocoKey.lastIndexOf('|');
      const servicoKey = sep > 0 ? blocoKey.slice(0, sep) : blocoKey;
      const compRef = {
        chave: row.item.chave,
        codigo: row.item.codigo,
        descricao: row.item.descricao,
        subtituloNome: row.subtituloNome,
        quantidade: row.quantidade,
        unidade: row.item.unidade
      };
      let linha = map.get(servicoKey);
      if (!linha) {
        linha = {
          servicoKey,
          servicoNome: row.servicoNome,
          valorTotal: 0,
          qtdItens: 0,
          composicoes: [],
          subtitulos: [],
          blocosMap: new Map()
        };
        map.set(servicoKey, linha);
      }
      linha.valorTotal += row.total;
      linha.qtdItens += 1;
      linha.composicoes.push(compRef);

      let bloco = linha.blocosMap.get(blocoKey);
      if (!bloco) {
        bloco = {
          blocoKey,
          subtituloNome: row.subtituloNome,
          valorTotal: 0,
          qtdItens: 0,
          composicoes: []
        };
        linha.blocosMap.set(blocoKey, bloco);
      }
      bloco.valorTotal += row.total;
      bloco.qtdItens += 1;
      bloco.composicoes.push(compRef);
    }
    return Array.from(map.values()).map(({ blocosMap, ...linha }) => ({
      ...linha,
      subtitulos: Array.from(blocosMap.values())
    }));
  }, [itensCalculados]);

  const resumoCronograma = useMemo(
    () => calcularResumoCronograma(linhasCronograma, cronograma),
    [linhasCronograma, cronograma]
  );

  // Espelha resumo do cronograma na meta (autosave → índice da lista).
  useEffect(() => {
    if (!orcamentoAtivoId) return;
    const nextResumo = {
      progressoFisico: Math.round(resumoCronograma.progressoFisico * 10) / 10,
      concluido: resumoCronograma.porStatus.concluido,
      totalEtapas: resumoCronograma.totalEtapas,
      atrasado: resumoCronograma.porStatus.atrasado,
    };
    const prev = meta.cronogramaResumo;
    if (
      prev &&
      prev.progressoFisico === nextResumo.progressoFisico &&
      prev.concluido === nextResumo.concluido &&
      prev.totalEtapas === nextResumo.totalEtapas &&
      prev.atrasado === nextResumo.atrasado
    ) {
      return;
    }
    startTransition(() => {
      setMeta((m) => ({ ...m, cronogramaResumo: nextResumo }));
    });
  }, [
    orcamentoAtivoId,
    resumoCronograma.progressoFisico,
    resumoCronograma.porStatus.concluido,
    resumoCronograma.porStatus.atrasado,
    resumoCronograma.totalEtapas,
    meta.cronogramaResumo,
  ]);

  const nomeOrcamentoAtivo = useMemo(
    () => listaOrcamentos.find((o) => o.id === orcamentoAtivoId)?.nome ?? '',
    [listaOrcamentos, orcamentoAtivoId]
  );

  const nomeContratoBreadcrumb = useMemo(() => {
    const fromProp = String(embeddedContractName ?? '').trim();
    if (fromProp) return fromProp;
    return rotuloContratoListaOrcamentos ?? '';
  }, [embeddedContractName, rotuloContratoListaOrcamentos]);

  /** Remove sufixo « (código) » do nome — código fica só no subtítulo / coluna Código. */
  const nomeOrcamentoSemCodigo = useMemo(
    () => nomeOrcamentoSemCodigoSufixo(nomeOrcamentoAtivo || nomeOrcamentoRascunho || ''),
    [nomeOrcamentoAtivo, nomeOrcamentoRascunho]
  );

  const codigoOrcamentoAtivo = useMemo(() => {
    const fromMeta = String(meta.osNumeroPasta ?? '').trim();
    if (fromMeta) return fromMeta;
    return codigoFromNomeOrcamento(nomeOrcamentoAtivo || nomeOrcamentoRascunho || '');
  }, [meta.osNumeroPasta, nomeOrcamentoAtivo, nomeOrcamentoRascunho]);

  const tituloPaginaOrcamento = useMemo(() => {
    if (cronogramaOnly && orcamentoAtivoId) {
      return nomeOrcamentoSemCodigo || 'Orçamento';
    }
    if (orcamentoAtivoId) {
      return nomeOrcamentoSemCodigo || 'Orçamento';
    }
    return nomeContratoBreadcrumb || 'Orçamento';
  }, [cronogramaOnly, orcamentoAtivoId, nomeOrcamentoSemCodigo, nomeContratoBreadcrumb]);

  const subtituloPaginaOrcamento = useMemo(() => {
    if (cronogramaOnly && orcamentoAtivoId) {
      return codigoOrcamentoAtivo || 'Prazos e andamento da obra';
    }
    if (orcamentoAtivoId) {
      return codigoOrcamentoAtivo || 'Orçamento';
    }
    return 'Gerencie os orçamentos do contrato';
  }, [cronogramaOnly, orcamentoAtivoId, codigoOrcamentoAtivo]);

  const statusAprovacaoAtivo = useMemo(
    () => normalizarStatusAprovacaoOrcamento(meta.statusAprovacao),
    [meta.statusAprovacao]
  );

  // Espelha o status do detalhe na lista (útil ao voltar sem refetch).
  useEffect(() => {
    if (!orcamentoAtivoId) return;
    setListaOrcamentos((prev) => {
      let changed = false;
      const next = prev.map((o) => {
        if (o.id !== orcamentoAtivoId) return o;
        if (o.statusAprovacao === statusAprovacaoAtivo) return o;
        changed = true;
        return { ...o, statusAprovacao: statusAprovacaoAtivo };
      });
      return changed ? next : prev;
    });
  }, [orcamentoAtivoId, statusAprovacaoAtivo]);

  // Fonte da verdade = URL (evita breadcrumb “fantasma” do orçamento ao voltar pela lista).
  const orcamentoIdNaRota = embeddedContractId
    ? embeddedOrcamentoIdFromRoute ?? null
    : orcamentoAtivoId;

  const breadcrumbOrcamentoTrail = useMemo(() => {
    if (!embeddedContractId) return null;
    const listHref = cronogramaOnly
      ? '/ponto/cronogramas'
      : `/ponto/contratos/${embeddedContractId}/orcamento`;
    const contractHref = `/ponto/contratos/${embeddedContractId}`;
    const crumbs: { label: string; href?: string }[] = [];

    if (cronogramaOnly) {
      // Não usar fallback «Cronograma» — colide com o crumb da rota e some do breadcrumb.
      if (orcamentoIdNaRota && nomeOrcamentoSemCodigo) {
        crumbs.push({ label: nomeOrcamentoSemCodigo });
      }
      return crumbs;
    }

    // Só inclui o contrato quando o nome real já existe (evita crumb genérico «Contrato»).
    // O layout também publica o nome (priority 0); labels iguais são mesclados.
    if (nomeContratoBreadcrumb) {
      crumbs.push({ label: nomeContratoBreadcrumb, href: contractHref });
    }
    crumbs.push({ label: 'Orçamentos', href: listHref });
    if (orcamentoIdNaRota) {
      crumbs.push({ label: nomeOrcamentoSemCodigo || 'Orçamento' });
    }

    return crumbs;
  }, [
    embeddedContractId,
    orcamentoIdNaRota,
    nomeContratoBreadcrumb,
    nomeOrcamentoSemCodigo,
    cronogramaOnly,
  ]);

  useBreadcrumbEntity(breadcrumbOrcamentoTrail, { priority: 1 });
  useDocumentTitle(
    orcamentoIdNaRota
      ? tituloPaginaOrcamento
      : nomeContratoBreadcrumb
        ? `Orçamentos ${nomeContratoBreadcrumb}`
        : 'Orçamentos'
  );

  /** Árvore da FD sem valores digitados — não reconstrói a cada tecla. */
  const linhasAnaliticoFichaBase = useMemo(() => {
    if (orcamentoViewTab !== 'planilhaAnalitica' || deferredOrcamentoViewTab !== 'planilhaAnalitica') return [];
    const composicaoPorKey = analiticoComposicaoPorKey;
    const totalInsumosBasePorComposicao = analiticoInsumosCountPorParent;
    const linhasAnaliticoFicha: typeof linhasAnaliticoOrcamento = [];
    for (let i = 0; i < linhasAnaliticoOrcamento.length; i++) {
      const row = linhasAnaliticoOrcamento[i];
      if (row.kind !== 'composicao' && row.kind !== 'insumo') continue;
      linhasAnaliticoFicha.push(row);

      if (row.kind === 'composicao') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const composicaoSemInsumoBase =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.key;
        if (composicaoSemInsumoBase) {
          const manuais = insumosAnaliticoManuais[row.key] ?? [];
          const base = totalInsumosBasePorComposicao.get(row.key) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = Number(row.quantidadeReal) || 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            linhasAnaliticoFicha.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.key,
              item: `${row.item}.${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }

      if (row.kind === 'insumo') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const ultimoInsumoDaComposicao =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.parentKey;
        if (ultimoInsumoDaComposicao) {
          const manuais = insumosAnaliticoManuais[row.parentKey] ?? [];
          const comp = composicaoPorKey.get(row.parentKey);
          const base = totalInsumosBasePorComposicao.get(row.parentKey) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = comp ? Number(comp.quantidadeReal) || 0 : 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            linhasAnaliticoFicha.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.parentKey,
              item: comp ? `${comp.item}.${base + idx + 1}` : `${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }
    }
    return linhasAnaliticoFicha;
  }, [
    orcamentoViewTab,
    deferredOrcamentoViewTab,
    linhasAnaliticoOrcamento,
    analiticoComposicaoPorKey,
    analiticoInsumosCountPorParent,
    insumosAnaliticoManuais,
  ]);

  /** Ficha de demanda: só composições e insumos (sem faixas de título/subtítulo). */
  const linhasFichaDemanda = useMemo(() => {
    if (orcamentoViewTab !== 'planilhaAnalitica' || deferredOrcamentoViewTab !== 'planilhaAnalitica') return [];
    const linhasAnaliticoFicha = linhasAnaliticoFichaBase;

    const insumosPorComposicao = new Map<
      string,
      Array<{ key: string; valorUnit: number; quantOrc: number }>
    >();
    for (const row of linhasAnaliticoFicha) {
      if (row.kind === 'insumo') {
        const arr = insumosPorComposicao.get(row.parentKey) ?? [];
        arr.push({ key: row.key, valorUnit: row.valorUnit, quantOrc: row.quantidadeReal });
        insumosPorComposicao.set(row.parentKey, arr);
      }
    }

    /** Faturamento (R$) da composição = quant × valor unit. orç. — usado no % custo/valor pago dos insumos. */
    const faturamentoMonetarioPorComposicao = new Map<string, number>();
    for (const row of linhasAnaliticoFicha) {
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
        const qC = planilhaQtdDeferred[ins.key];
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
        const qC = planilhaQtdDeferred[ins.key];
        const vReal = planilhaVlDeferred[ins.key];
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
      let temQtdCompraInformadaMaiorZero = false;
      for (const ins of filhos) {
        const qO = ins.quantOrc;
        if (!Number.isFinite(qO)) continue;
        sumQO += qO;
        const qC = planilhaQtdDeferred[ins.key];
        if (qC !== undefined && Number.isFinite(qC)) {
          sumQC += qC;
          if (qC > 0) temQtdCompraInformadaMaiorZero = true;
        }
      }
      if (!temQtdCompraInformadaMaiorZero || sumQO <= 0) return undefined;
      return (sumQC / sumQO) * 100;
    };

    /** Média ponderada (vl compra real / vl orçamento) — % preço unitário na composição. */
    const precoUnitarioPctAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumQcvR = 0;
      let sumQcvO = 0;
      for (const ins of filhos) {
        const qC = planilhaQtdDeferred[ins.key];
        const vR = planilhaVlDeferred[ins.key];
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
      /** Mesma coluna "Tipo" da planilha (MO/MA); composição: vazio. */
      tipo: string;
      /** Mesma coluna "Quantidade" da planilha analítica (quantidade total no orçamento; insumo = coef. × qtd composição). */
      quantidadeOrcamento: number;
      /** Mesma chave que na planilha: `planilhaQuantidadeCompra[key]` (só insumos costumam ter valor). */
      quantidadeCompra: number | undefined;
      /** Coluna "Valor unit. orçamento" da planilha (`valorUnit`). */
      custoUnitarioOrcamento: number;
      /** Insumo: `planilhaValorUnitCompraReal[key]`; composição: sem valor na ficha (só insumos). */
      custoUnitarioCompraReal: number | undefined;
      /** qtd compra × custo unit. orçamento; na composição, soma dos insumos. */
      valorTotalOrcamento: number | undefined;
      /** valor total orçamento × 0,4 (composição = total agregado × 0,4). */
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
    for (const l of linhasAnaliticoFicha) {
      if (l.kind !== 'composicao' && l.kind !== 'insumo') continue;
      const qCompra = planilhaQtdDeferred[l.key];
      const vReal =
        l.kind === 'insumo' ? planilhaVlDeferred[l.key] : undefined;
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
        valorTotalOrcamento !== undefined ? valorTotalOrcamento * PLANILHA_FATOR_CUSTO_ESTIMADO : undefined;
      const precoCompraReal =
        l.kind === 'composicao'
          ? precoCompraRealAgregado(l.key)
          : qCompra !== undefined &&
              vReal !== undefined &&
              Number.isFinite(qCompra) &&
              Number.isFinite(vReal)
            ? qCompra * vReal
            : undefined;
      const qOrcNum = Number(l.quantidadeReal);
      const qCompraNum =
        qCompra !== undefined && Number.isFinite(Number(qCompra)) ? Number(qCompra) : undefined;
      const vOrcNum = Number(l.valorUnit);
      const levantamentoPct =
        l.kind === 'composicao'
          ? levantamentoPctAgregado(l.key)
          : qCompraNum !== undefined &&
              Number.isFinite(qCompraNum) &&
              qCompraNum > 0 &&
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
        tipo:
          l.kind === 'insumo'
            ? planilhaTipoInsumo[l.key] ?? tipoPlanilhaInsumo(l.categoria || '')
            : '',
        quantidadeOrcamento: l.quantidadeReal,
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
  }, [
    orcamentoViewTab,
    deferredOrcamentoViewTab,
    linhasAnaliticoFichaBase,
    planilhaQtdDeferred,
    planilhaVlDeferred,
    planilhaTipoInsumo,
  ]);

  const linhasAnaliticoComManuais = useMemo(() => {
    if (
      (orcamentoViewTab !== 'planilhaAnalitica' && orcamentoViewTab !== 'analitico') ||
      (deferredOrcamentoViewTab !== 'planilhaAnalitica' && deferredOrcamentoViewTab !== 'analitico')
    ) {
      return [];
    }
    const out: typeof linhasAnaliticoOrcamento = [];
    const totalInsumosBasePorComposicao = analiticoInsumosCountPorParent;
    for (let i = 0; i < linhasAnaliticoOrcamento.length; i++) {
      const row = linhasAnaliticoOrcamento[i];
      out.push(row);
      if (row.kind === 'insumo') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const ultimoInsumoDaComposicao =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.parentKey;
        if (ultimoInsumoDaComposicao) {
          const manuais = insumosAnaliticoManuais[row.parentKey] ?? [];
          const comp = analiticoComposicaoPorKey.get(row.parentKey);
          const base = totalInsumosBasePorComposicao.get(row.parentKey) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = comp ? Number(comp.quantidadeReal) || 0 : 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            out.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.parentKey,
              item: comp ? `${comp.item}.${base + idx + 1}` : `${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }
      if (row.kind === 'composicao') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const composicaoSemInsumoBase =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.key;
        if (composicaoSemInsumoBase) {
          const manuais = insumosAnaliticoManuais[row.key] ?? [];
          const base = totalInsumosBasePorComposicao.get(row.key) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = Number(row.quantidadeReal) || 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            out.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.key,
              item: `${row.item}.${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }
    }
    return out;
  }, [
    orcamentoViewTab,
    deferredOrcamentoViewTab,
    linhasAnaliticoOrcamento,
    analiticoComposicaoPorKey,
    analiticoInsumosCountPorParent,
    insumosAnaliticoManuais,
  ]);

  const janelaAnalitico = useOrcamentoTabelaJanela(
    orcamentoViewTab === 'analitico' ? linhasAnaliticoOrcamento.length : 0,
    { rowHeight: 44, overscan: 28, enabled: orcamentoViewTab === 'analitico' }
  );
  const janelaFd = useOrcamentoTabelaJanela(
    orcamentoViewTab === 'planilhaAnalitica' ? linhasAnaliticoComManuais.length : 0,
    { rowHeight: 48, overscan: 28, enabled: orcamentoViewTab === 'planilhaAnalitica' }
  );

  const resumoSecoesFicha = useMemo(() => {
    const empty = {
      porTitulo: new Map<string, { custoOrc: number; custoEst: number; custoReal: number }>(),
      porSubtitulo: new Map<string, { custoOrc: number; custoEst: number; custoReal: number }>(),
    };
    if (orcamentoViewTab !== 'planilhaAnalitica' || deferredOrcamentoViewTab !== 'planilhaAnalitica') return empty;
    const porTitulo = new Map<string, { custoOrc: number; custoEst: number; custoReal: number }>();
    const porSubtitulo = new Map<string, { custoOrc: number; custoEst: number; custoReal: number }>();
    for (const row of linhasAnaliticoComManuais) {
      if (row.kind !== 'insumo') continue;
      const partes = String(row.item || '').split('.');
      if (partes.length < 3) continue;
      const chaveTitulo = partes[0];
      const chaveSubtitulo = `${partes[0]}.${partes[1]}`;
      const custoOrc = Number(row.total) || 0;
      const custoEst = custoOrc * PLANILHA_FATOR_CUSTO_ESTIMADO;
      const qC = planilhaQtdDeferred[row.key];
      const vReal = planilhaVlDeferred[row.key];
      const custoReal =
        qC !== undefined &&
        vReal !== undefined &&
        Number.isFinite(qC) &&
        Number.isFinite(vReal)
          ? qC * vReal
          : 0;

      const atualTit = porTitulo.get(chaveTitulo) ?? { custoOrc: 0, custoEst: 0, custoReal: 0 };
      atualTit.custoOrc += custoOrc;
      atualTit.custoEst += custoEst;
      atualTit.custoReal += custoReal;
      porTitulo.set(chaveTitulo, atualTit);

      const atualSub = porSubtitulo.get(chaveSubtitulo) ?? { custoOrc: 0, custoEst: 0, custoReal: 0 };
      atualSub.custoOrc += custoOrc;
      atualSub.custoEst += custoEst;
      atualSub.custoReal += custoReal;
      porSubtitulo.set(chaveSubtitulo, atualSub);
    }
    return {
      porTitulo,
      porSubtitulo,
    };
  }, [orcamentoViewTab, deferredOrcamentoViewTab, linhasAnaliticoComManuais, planilhaQtdDeferred, planilhaVlDeferred]);

  /** Indicadores % iguais à Ficha de demanda (levantamento, preço unit. rel., faturamento) por chave de linha. */
  const pctFichaDemandaPorKey = useMemo(() => {
    const m = new Map<
      string,
      {
        levantamentoPct: number | undefined;
        precoUnitarioRelPct: number | undefined;
        faturamentoPct: number | undefined;
        pctCustoValorPago: number | undefined;
      }
    >();
    for (const r of linhasFichaDemanda) {
      m.set(r.key, {
        levantamentoPct: r.levantamentoPct,
        precoUnitarioRelPct: r.precoUnitarioRelPct,
        faturamentoPct: r.faturamentoPct,
        pctCustoValorPago: r.pctCustoValorPago
      });
    }
    return m;
  }, [linhasFichaDemanda]);

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

  const [barraTotaisSidebarLeftPx, setBarraTotaisSidebarLeftPx] = useState(80);

  useEffect(() => {
    if (!orcamentoAtivoId || subtitulosAdicionados.length === 0) return;
    const sync = () => {
      if (typeof window === 'undefined') return;
      // No mobile a sidebar é off-canvas; no desktop acompanha a largura real do painel.
      if (window.matchMedia('(min-width: 1024px)').matches) {
        const el = document.querySelector('[data-app-sidebar]');
        const w = el?.getBoundingClientRect().width;
        setBarraTotaisSidebarLeftPx(w && w > 0 ? Math.round(w) : 80);
      } else {
        setBarraTotaisSidebarLeftPx(0);
      }
    };
    sync();
    const el = document.querySelector('[data-app-sidebar]');
    const ro = el ? new ResizeObserver(sync) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [orcamentoAtivoId, subtitulosAdicionados.length]);

  const resumoFinanceiro = useMemo(() => {
    const descontoPct = parsePercentualMeta(meta.descontoPercentual);
    const bdiPctMeta = parsePercentualMeta(meta.bdiPercentual);

    // Fonte da verdade: soma das linhas da montagem (custo direto / total com BDI),
    // igual às linhas vermelhas e à coluna Total — não usa totaisOrcafascio.
    const totalBase = total;
    const valorDesconto = totalBase * descontoPct;
    const totalComDesconto = totalBase - valorDesconto;
    const totalComDescontoEBdi =
      descontoPct === 0 && totalGeralComBdi > 0
        ? totalGeralComBdi
        : totalComDesconto * (1 + bdiPctMeta);
    const valorBdi = Math.max(0, totalComDescontoEBdi - totalComDesconto);
    const bdiPct =
      totalComDesconto > 0 && valorBdi > 0 ? valorBdi / totalComDesconto : bdiPctMeta;

    const reajustes = (meta.reajustes ?? []).map((r, idx) => ({
      idx,
      nome: (r.nome || '').trim() || `${idx + 1}º reajuste`,
      percentualPct: parsePercentualMeta(r.percentual)
    }));

    let acumulado = totalComDescontoEBdi;
    const reajustesAplicados = reajustes.map((r) => {
      acumulado = acumulado * (1 + r.percentualPct);
      return {
        ...r,
        valor: acumulado
      };
    });
    const valorFinal = reajustesAplicados.length > 0
      ? reajustesAplicados[reajustesAplicados.length - 1]!.valor
      : totalComDescontoEBdi;

    return {
      descontoPct,
      bdiPct,
      totalBase,
      valorDesconto,
      totalComDesconto,
      valorBdi,
      totalComDescontoEBdi,
      reajustesAplicados,
      valorFinal
    };
  }, [meta.bdiPercentual, meta.descontoPercentual, meta.reajustes, total, totalGeralComBdi]);

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
      const qC = planilhaQtdDeferred[l.key];
      const vReal = planilhaVlDeferred[l.key];
      if (qC === undefined || !Number.isFinite(qC) || vReal === undefined || !Number.isFinite(vReal)) continue;
      const val = qC * vReal;
      const g = grupoPrecoCompraInsumoPlanilha(l.key, l.categoria || '', l.descricao || '', planilhaTipoInsumo);
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

    const valorFinalOrc = resumoFinanceiro.valorFinal;
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
    planilhaQtdDeferred,
    planilhaVlDeferred,
    planilhaTipoInsumo,
    linhasFichaDemanda,
    resumoFinanceiro.valorFinal
  ]);

  /** Progresso da ficha de demanda: cada insumo precisa de qtd. compra + valor unit. compra real. */
  const fichaDemandaProgresso = useMemo(() => {
    const insumos = linhasAnaliticoOrcamento.filter((l) => l.kind === 'insumo');
    const total = insumos.length;
    if (total === 0) {
      return { total: 0, filled: 0, pct: 0, completa: false };
    }
    let filled = 0;
    for (const l of insumos) {
      const q = planilhaQtdDeferred[l.key];
      const v = planilhaVlDeferred[l.key];
      if (
        q !== undefined &&
        Number.isFinite(q) &&
        v !== undefined &&
        Number.isFinite(v)
      ) {
        filled += 1;
      }
    }
    const pct = Math.round((filled / total) * 100);
    return {
      total,
      filled,
      pct,
      completa: filled === total,
    };
  }, [linhasAnaliticoOrcamento, planilhaQtdDeferred, planilhaVlDeferred]);

  const podeEnviarFdAprovacao =
    fichaDemandaProgresso.completa &&
    (statusAprovacaoAtivo === 'rascunho' ||
      statusAprovacaoAtivo === 'pronta' ||
      statusAprovacaoAtivo === 'em_correcao');

  // Espelha FD %, BDI % e Total do rodapé na meta/lista (autosave persiste — sem POST a cada tecla).
  useEffect(() => {
    if (!orcamentoAtivoId) return;
    const pct = fichaDemandaProgresso.pct;
    const bdiPercentual =
      Math.round(resumoFinanceiro.bdiPct * 10000) / 100; // pontos % com 2 casas
    const totalComBdi = truncarMoeda2(resumoFinanceiro.totalComDescontoEBdi);
    const metaAtual = sessaoRef.current.meta;
    const metaMudou =
      metaAtual?.fichaDemandaPct !== pct || metaAtual?.totalComBdi !== totalComBdi;

    if (metaMudou) {
      startTransition(() => {
        setMeta((prev) => ({ ...prev, fichaDemandaPct: pct, totalComBdi }));
      });
    }

    startTransition(() => {
      setListaOrcamentos((prev) => {
        let changed = false;
        const next = prev.map((o) => {
          if (o.id !== orcamentoAtivoId) return o;
          if (
            o.fichaDemandaPct === pct &&
            o.bdiPercentual === bdiPercentual &&
            o.totalComBdi === totalComBdi
          ) {
            return o;
          }
          changed = true;
          return { ...o, fichaDemandaPct: pct, bdiPercentual, totalComBdi };
        });
        if (changed && centroCustoId) {
          const cached = orcamentosListaCache.get(centroCustoId);
          if (cached) {
            orcamentosListaCache.set(centroCustoId, {
              ...cached,
              data: {
                ...cached.data,
                orcamentos: next as typeof cached.data.orcamentos,
              },
            });
          }
        }
        return changed ? next : prev;
      });
    });

    if (metaMudou) {
      sessaoRef.current = {
        ...sessaoRef.current,
        meta: {
          ...(sessaoRef.current.meta ?? metaNovoOrcamentoPadrao()),
          fichaDemandaPct: pct,
          totalComBdi,
        },
      };
    }
  }, [
    orcamentoAtivoId,
    centroCustoId,
    fichaDemandaProgresso.pct,
    resumoFinanceiro.bdiPct,
    resumoFinanceiro.totalComDescontoEBdi,
  ]);

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

  const addLinhaMedicao = (itemKey: string, inserirAposIdx?: number) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] || { tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] };
    const novaLinha = { descricao: '', C: 0, L: 0, H: 0, N: 1, empolamento: 1 };
    const linhas = [...atual.linhas];
    if (
      inserirAposIdx !== undefined &&
      inserirAposIdx >= 0 &&
      inserirAposIdx < linhas.length
    ) {
      linhas.splice(inserirAposIdx + 1, 0, novaLinha);
    } else {
      linhas.push(novaLinha);
    }
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        linhas
      }
    }));
  };

  const addLinhaCabecalhoSecaoMedicao = (itemKey: string, inserirAposIdx?: number) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] || { tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] };
    const novaLinha: LinhaMedicao = {
      cabecalhoSecao: true,
      descricao: 'DESCRIÇÃO: ',
      C: 0,
      L: 0,
      H: 0,
      N: 1,
      empolamento: 1
    };
    const linhas = [...atual.linhas];
    if (
      inserirAposIdx !== undefined &&
      inserirAposIdx >= 0 &&
      inserirAposIdx < linhas.length
    ) {
      linhas.splice(inserirAposIdx + 1, 0, novaLinha);
    } else {
      linhas.push(novaLinha);
    }
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        linhas
      }
    }));
  };

  const updateLinhaMedicao = (itemKey: string, idx: number, campo: keyof LinhaMedicao, valor: number | string) => {
    setDimensoesPorItem(prev => {
      const atual = prev[itemKey];
      if (!atual?.linhas?.[idx]) return prev;
      const novaLinhas = [...atual.linhas];
      const v = campo === 'descricao' ? valor : (typeof valor === 'number' ? valor : parseFloat(String(valor)) || 0);
      const updated: LinhaMedicao = { ...novaLinhas[idx], [campo]: v } as LinhaMedicao;
      if (campo === 'C' || campo === 'L' || campo === 'H' || campo === 'N') {
        updated.valorManual = undefined;
      }
      novaLinhas[idx] = updated;
      return { ...prev, [itemKey]: { ...atual, linhas: novaLinhas } };
    });
  };

  const updateRotuloColunaMedicao = (
    itemKey: string,
    campo: 'descricao' | 'C' | 'L' | 'H' | 'N' | 'pct',
    rotulo: string
  ) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] ||
      ({ tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] } as DimensoesItem);
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        rotulosColunas: {
          ...(atual.rotulosColunas ?? {}),
          [campo]: rotulo
        }
      }
    }));
  };

  const handleCalcBlur = (draftKey: string, raw: string, onCommit: (n: number) => void) => {
    const pending = calcCommitTimersRef.current[draftKey];
    if (pending) {
      clearTimeout(pending);
      delete calcCommitTimersRef.current[draftKey];
    }
    const n = parseMedicaoBlurNumber(raw);
    onCommit(n ?? 0);
    setDraftCalc(p => { const next = { ...p }; delete next[draftKey]; return next; });
  };

  const handleCalcChange = (draftKey: string, raw: string, onCommit: (n: number) => void) => {
    setDraftCalc(p => ({ ...p, [draftKey]: raw }));
    const n = parseMedicaoBlurNumber(raw);
    if (n === null && String(raw ?? '').trim() !== '') return;
    const timers = calcCommitTimersRef.current;
    if (timers[draftKey]) clearTimeout(timers[draftKey]);
    timers[draftKey] = setTimeout(() => {
      delete timers[draftKey];
      startTransition(() => {
        onCommit(n ?? 0);
      });
    }, FD_COMMIT_DEBOUNCE_MS);
  };

  const commitPlanilhaQtdCompra = useCallback((lineKey: string, raw: string) => {
    const n = parsePlanilhaCalcOrPtBr(raw);
    startTransition(() => {
      setPlanilhaQuantidadeCompra((prev) => {
        const next = { ...prev };
        if (n === null) delete next[lineKey];
        else next[lineKey] = Math.max(0, n);
        return next;
      });
    });
  }, []);

  const commitPlanilhaVlCompraReal = useCallback((lineKey: string, raw: string) => {
    const n = parsePlanilhaCalcOrPtBr(raw);
    startTransition(() => {
      setPlanilhaValorUnitCompraReal((prev) => {
        const current = prev[lineKey];
        if (n === null) {
          if (current === undefined) return prev;
          const next = { ...prev };
          delete next[lineKey];
          return next;
        }
        const clamped = Math.max(0, n);
        if (current === clamped) return prev;
        return { ...prev, [lineKey]: clamped };
      });
    });
  }, []);

  const commitFichaDemandaObservacao = useCallback((lineKey: string, raw: string) => {
    startTransition(() => {
      setFichaDemandaObservacoes((prev) => {
        if ((prev[lineKey] ?? '') === raw) return prev;
        return { ...prev, [lineKey]: raw };
      });
    });
  }, []);

  const novoInsumoManualAnaliticoVazio = (parentKey: string): InsumoAnaliticoManual => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentKey,
    tipo: 'Insumo',
    codigo: '',
    banco: '',
    descricao: '',
    und: '',
    quant: '',
    quantidadeReal: '',
    quantidadeOrcada: '',
    valorUnit: ''
  });

  const addInsumoManualAnalitico = (parentKey: string) => {
    const novo = novoInsumoManualAnaliticoVazio(parentKey);
    setInsumosAnaliticoManuais((prev) => ({
      ...prev,
      [parentKey]: [...(prev[parentKey] ?? []), novo]
    }));
  };

  const addInsumoManualAnaliticoApos = (parentKey: string, inserirAposIdx: number) => {
    const novo = novoInsumoManualAnaliticoVazio(parentKey);
    setInsumosAnaliticoManuais((prev) => {
      const lista = [...(prev[parentKey] ?? [])];
      const pos = Math.min(Math.max(0, inserirAposIdx + 1), lista.length);
      lista.splice(pos, 0, novo);
      return { ...prev, [parentKey]: lista };
    });
  };

  const updateInsumoManualAnalitico = (
    parentKey: string,
    id: string,
    campo: keyof Omit<InsumoAnaliticoManual, 'id' | 'parentKey'>,
    valor: string
  ) => {
    setInsumosAnaliticoManuais((prev) => ({
      ...prev,
      [parentKey]: (prev[parentKey] ?? []).map((ins) => (ins.id === id ? { ...ins, [campo]: valor } : ins))
    }));
  };

  const removerInsumoManualAnalitico = (parentKey: string, id: string) => {
    setInsumosAnaliticoManuais((prev) => ({
      ...prev,
      [parentKey]: (prev[parentKey] ?? []).filter((ins) => ins.id !== id)
    }));
  };

  const ocultarInsumoAnalitico = (insumoKey: string) => {
    setInsumosAnaliticoOcultos(prev => (prev.includes(insumoKey) ? prev : [...prev, insumoKey]));
  };

  const normalizarNumeroManualAnalitico = (
    parentKey: string,
    id: string,
    campo: 'quant' | 'quantidadeReal' | 'quantidadeOrcada' | 'valorUnit',
    casas = 2
  ) => {
    const atual = (insumosAnaliticoManuais[parentKey] ?? []).find((ins) => ins.id === id);
    if (!atual) return;
    const raw = atual[campo];
    const n = parseCalcOrNumber(raw);
    if (n === null) return;
    updateInsumoManualAnalitico(
      parentKey,
      id,
      campo,
      n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    );
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

  /**
   * Memória de cálculo pra itens "un" quando o orçamento usa `usarMemoriaCalculo`: lista de
   * quantidades por local (sem fórmula C×L×H) — mesmo padrão de estado de addLinhaMedicao/
   * updateLinhaMedicao/removeLinhaMedicao, só que sobre `linhasContagem`.
   */
  const addLinhaContagem = (itemKey: string, inserirAposIdx?: number) => {
    const atual = dimensoesPorItem[itemKey] || { tipoUnidade: 'un' as TipoUnidadeFormula, linhas: [] };
    const prev = atual.linhasContagem ?? [];
    const nova = { descricao: '', quantidade: 0 };
    const linhasContagem =
      inserirAposIdx == null || inserirAposIdx < 0 || inserirAposIdx >= prev.length - 1
        ? [...prev, nova]
        : [...prev.slice(0, inserirAposIdx + 1), nova, ...prev.slice(inserirAposIdx + 1)];
    setDimensoesPorItem(prevDim => ({ ...prevDim, [itemKey]: { ...atual, linhasContagem } }));
  };

  const updateLinhaContagem = (
    itemKey: string,
    idx: number,
    campo: 'descricao' | 'quantidade',
    valor: string | number
  ) => {
    setDimensoesPorItem(prev => {
      const atual = prev[itemKey];
      if (!atual?.linhasContagem?.[idx]) return prev;
      const novaLinhas = [...atual.linhasContagem];
      const v = campo === 'descricao' ? String(valor) : Math.max(0, Number(valor) || 0);
      novaLinhas[idx] = { ...novaLinhas[idx], [campo]: v } as LinhaContagem;
      return { ...prev, [itemKey]: { ...atual, linhasContagem: novaLinhas } };
    });
  };

  const removeLinhaContagem = (itemKey: string, idx: number) => {
    const atual = dimensoesPorItem[itemKey];
    if (!atual?.linhasContagem?.length) return;
    const novaLinhas = atual.linhasContagem.filter((_, i) => i !== idx);
    setDimensoesPorItem(prev => ({ ...prev, [itemKey]: { ...atual, linhasContagem: novaLinhas } }));
  };

  const montarSheetOrcamentoDetalhado = (): XLSX.WorkSheet | null => {
    if (itensCalculados.length === 0) {
      return null;
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
          formatarBRLExport(row.totalComBdi),
          formatarPesoPctExport(totalGeralComBdi > 0 ? (row.totalComBdi / totalGeralComBdi) * 100 : 0)
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
    rf.reajustesAplicados.forEach((r) => {
      pushLinhaResumo(`${r.nome.toUpperCase()} (${pctLabel5(r.percentualPct)}%)`, r.valor);
    });

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
    return ws;
  };

  const exportarOrcamentoDetalhado = () => {
    const ws = montarSheetOrcamentoDetalhado();
    if (!ws) {
      toast.error('Não há itens no orçamento para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
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

      const composicaoDaLinha = composicaoResolvidaDoItemServico(item, mapaComposicoes);

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

      return {
        info,
        data: { total: 0, linhas: [] },
        seedKeyParaCache: null
      };
    },
    [mapaComposicoes]
  );

  /**
   * Memória de cálculo só existe quando o checkbox foi marcado na importação
   * (ou em orçamento criado no sistema, que não é importado).
   */
  const memorialDisponivel = meta.usarMemoriaCalculo === true || meta?.importadoPlanilha !== true;

  useEffect(() => {
    if (!memorialDisponivel && orcamentoViewTab === 'memorial') {
      setOrcamentoViewTab('montagem');
    }
  }, [memorialDisponivel, orcamentoViewTab]);

  useEffect(() => {
    if (orcamentoViewTab !== 'memorial' || !memorialDisponivel) return;
    if (itensMemoriaCalculoLista.length === 0) {
      setMemorialItemKey(null);
      return;
    }
    const existe = memorialItemKey && itensMemoriaCalculoLista.some(r => r.key === memorialItemKey);
    if (!existe) {
      setMemorialItemKey(itensMemoriaCalculoLista[0].key);
    }
  }, [orcamentoViewTab, itensMemoriaCalculoLista, memorialItemKey, memorialDisponivel]);

  useEffect(() => {
    if (orcamentoViewTab !== 'memorial' || !memorialItemKey || !memorialDisponivel) return;
    const el = document.getElementById(`memorial-medicoes-${memorialItemKey}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [orcamentoViewTab, memorialItemKey, memorialDisponivel]);

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

      const composicaoDaLinha = composicaoResolvidaDoItemServico(item, mapaComposicoes);

      const unitAnalitico = composicaoDaLinha?.analiticoLinhas?.length
        ? {
            total: composicaoDaLinha.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0),
            linhas: composicaoDaLinha.analiticoLinhas
          }
        : { total: 0, linhas: [] };

      for (const l of unitAnalitico.linhas) {
        rows.push([
          linha.servicoNome,
          linha.subtituloNome,
          item.codigo,
          item.banco,
          item.descricao || '',
          l.tipoLabel ? tipoInsumoCodigoParaDescricao(l.tipoLabel) : l.categoria,
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
  const montarSheetOrcamentoAnalitico = (): XLSX.WorkSheet | null => {
    if (linhasAnaliticoOrcamento.length === 0) {
      return null;
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
          l.quantidadeReal,
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
        l.quantidadeReal,
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
    return ws;
  };

  const exportarOrcamentoAnaliticoTabela = () => {
    const ws = montarSheetOrcamentoAnalitico();
    if (!ws) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analítico');
    const nomeArquivo = `Orcamento_Analitico_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Orçamento analítico exportado com sucesso.');
  };

  /** Planilha analítica (compras e custos) — alinhado à grade da aba. */
  const montarSheetFichaDemanda = (): XLSX.WorkSheet | null => {
    if (linhasAnaliticoOrcamento.length === 0) {
      return null;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const pctExportMap = new Map<
      string,
      {
        levantamentoPct?: number;
        precoUnitarioRelPct?: number;
        faturamentoPct?: number;
        pctCustoValorPago?: number;
      }
    >();
    for (const r of linhasFichaDemanda) {
      pctExportMap.set(r.key, {
        levantamentoPct: r.levantamentoPct,
        precoUnitarioRelPct: r.precoUnitarioRelPct,
        faturamentoPct: r.faturamentoPct,
        pctCustoValorPago: r.pctCustoValorPago
      });
    }
    const fmtPctPlanilhaExport = (p: number | undefined) =>
      p !== undefined && Number.isFinite(p)
        ? `${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
        : '';
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
        'Descrição',
        'Tipo',
        'UN',
        'Quantidade',
        'Valor unit. orçamento',
        'Total orçamento',
        'Valor unit. estimado',
        'Custo estimado',
        'Quantidade compra',
        'Valor unit. compra real',
        'Custo compra real',
        '% Qtd. solicitada',
        '% Valor total',
        '% Custo / valor pago',
        'Observação'
      ]
    ];
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'tituloServico') {
        rows.push([l.main, '', '', l.servicoNome, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'subtituloBloco') {
        rows.push([`${l.main}.${l.subIdx}`, '', '', l.texto, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'composicao') {
        const filhos = insumosPlanilhaPorComposicao.get(l.key) ?? [];
        let sumQtdCompra = 0;
        const sumCustoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
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
            if (vReal !== undefined && Number.isFinite(vReal)) {
              sumCustoReal += qC * vReal;
              sumQtdCompraComVlReal += qC;
            }
          }
        }
        const vlUnitCompraRealAgreg = temAlgumVlUnitCompraReal ? somaVlUnitCompraRealInsumos : null;
        const pe = pctExportMap.get(l.key);
        rows.push([
          l.item,
          l.codigo,
          l.banco,
          l.descricao,
          '',
          l.und,
          l.quantidadeReal,
          l.valorUnit,
          l.total,
          '',
          roundTo(sumCustoEst, 2),
          temQtdCompra ? sumQtdCompra : '',
          vlUnitCompraRealAgreg !== null ? roundTo(vlUnitCompraRealAgreg, 2) : '',
          sumQtdCompraComVlReal > 0 ? roundTo(sumCustoReal, 2) : '',
          fmtPctPlanilhaExport(pe?.levantamentoPct),
          fmtPctPlanilhaExport(pe?.faturamentoPct),
          fmtPctPlanilhaExport(pe?.pctCustoValorPago),
          ''
        ]);
        continue;
      }
      const qC = planilhaQuantidadeCompra[l.key];
      const vReal = planilhaValorUnitCompraReal[l.key];
      const vOrc = l.valorUnit;
      const custoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
      const custoCompraR =
        qC !== undefined && vReal !== undefined && Number.isFinite(qC) && Number.isFinite(vReal)
          ? qC * vReal
          : null;
      const pi = pctExportMap.get(l.key);
      rows.push([
        l.item,
        l.codigo || '—',
        l.banco || '—',
        l.descricao,
        planilhaTipoInsumo[l.key] ?? tipoPlanilhaInsumo(l.categoria || ''),
        l.und || '—',
        l.quantidadeReal,
        l.valorUnit,
        l.total,
        roundTo(vOrc * PLANILHA_FATOR_CUSTO_ESTIMADO, 2),
        roundTo(custoEst, 2),
        qC !== undefined && Number.isFinite(qC) ? qC : '',
        vReal !== undefined && Number.isFinite(vReal) ? roundTo(vReal, 2) : '',
        custoCompraR !== null ? roundTo(custoCompraR, 2) : '',
        fmtPctPlanilhaExport(pi?.levantamentoPct),
        fmtPctPlanilhaExport(pi?.faturamentoPct),
        fmtPctPlanilhaExport(pi?.pctCustoValorPago),
        fichaDemandaObservacoes[l.key] ?? ''
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 44 }, { wch: 12 }, { wch: 6 },
      { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 28 }
    ];
    return ws;
  };

  const exportarPlanilhaAnalitica = () => {
    const ws = montarSheetFichaDemanda();
    if (!ws) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha analítica');
    const nomeArquivo = `Planilha_Analitica_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Planilha analítica exportada com sucesso.');
  };

  const montarSheetMemoriaCalculo = (): XLSX.WorkSheet | null => {
    if (itensCalculados.length === 0) return null;

    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

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
        'LEGENDA: C= Comprimento | L= Largura | H= Altura | A= Área | V= Volume | % Empolamento= fator 1,10/1,20/1,30 | M= Metro | UN= quantidade nas colunas N e Subtotal',
      ],
      [''],
      ['DISCRIMINAÇÃO DOS SERVIÇOS'],
      ['CÓDIGO', 'DESCRIÇÃO', 'UN', 'C', 'L', 'H', '%', 'N', 'A', 'V', 'SUBTOTAL'],
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
          row.quantidade,
        ]);
        idxServico++;
        continue;
      }

      if (row.dimensoes?.linhas?.length) {
        rows.push([codigo, descricaoBase, un, '', '', '', '', '', '', '', '']);
        for (let i = 0; i < row.dimensoes.linhas.length; i++) {
          const ln = row.dimensoes.linhas[i];
          const descBase = ln.descricao?.trim() || `Medição ${i + 1}`;
          const descLinha = ln.origemComposicaoRotulo?.trim()
            ? `${ln.origemComposicaoRotulo.trim()} ${descBase}`.trim()
            : descBase;
          const unLinha =
            ln.linhaAgregadaCarga && ln.tipoOrigemMedicao
              ? unidadeLabel(ln.tipoOrigemMedicao)
              : un;
          if (ln.cabecalhoSecao) {
            rows.push(['', descLinha, unLinha, '', '', '', '', '', '', '', '']);
            continue;
          }
          const empolRaw =
            ln.empolamento ??
            ((ln as unknown as { percPerda?: number }).percPerda != null
              ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100
              : 0);
          const empol = empolRaw != null && empolRaw > 0 ? empolRaw : 1;
          rows.push([
            '',
            descLinha,
            unLinha,
            ln.C ?? '',
            ln.L ?? '',
            ln.H ?? '',
            empol,
            ln.N ?? 1,
            '',
            '',
            '',
          ]);
          const r = rows.length;
          const col = (c: number) => String.fromCharCode(64 + c);
          const D = col(4);
          const E = col(5);
          const F = col(6);
          const G = col(7);
          const H = col(8);
          const I = col(9);
          const J = col(10);
          const K = col(11);
          const tipo = tipoAuto;
          if (ln.linhaAgregadaCarga) {
            const vol = calcV(ln, tipo);
            const sub = calcularQuantidadeLinha(ln, tipo);
            rows[r - 1][8] = ln.tipoOrigemMedicao === 'm2' ? (ln.volumeM3BrutoSomado ?? 0) : '';
            rows[r - 1][9] = vol;
            rows[r - 1][10] = sub;
            continue;
          }
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
            rows[rows.length - 1][8] = qtd;
            rows[rows.length - 1][9] = qtd;
            rows[rows.length - 1][10] = qtd;
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
      { wch: 8 },
      { wch: 50 },
      { wch: 6 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 6 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
    ];
    return ws;
  };

  /** Pacote: Orçamento + Memória de cálculo + Analítico + Ficha de demanda no mesmo .xlsx. */
  const exportarOrcamentoCompleto = () => {
    const wsOrc = montarSheetOrcamentoDetalhado();
    const wsMem = montarSheetMemoriaCalculo();
    const wsAna = montarSheetOrcamentoAnalitico();
    const wsFicha = montarSheetFichaDemanda();
    if (!wsOrc && !wsMem && !wsAna && !wsFicha) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const wb = XLSX.utils.book_new();
    if (wsOrc) XLSX.utils.book_append_sheet(wb, wsOrc, 'Orçamento');
    if (wsMem) XLSX.utils.book_append_sheet(wb, wsMem, 'Memória de cálculo');
    if (wsAna) XLSX.utils.book_append_sheet(wb, wsAna, 'Analítico');
    if (wsFicha) XLSX.utils.book_append_sheet(wb, wsFicha, 'Ficha de demanda');
    const nomeArquivo = `Orcamento_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Orçamento exportado (Orçamento, Memória de cálculo, Analítico e Ficha de demanda).');
  };

  const exportarCronogramaExcel = () => {
    if (linhasCronograma.length === 0) {
      toast.error('Não há serviços no cronograma para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const linhasTl = montarLinhasTimeline(linhasCronograma, cronograma);
    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['CRONOGRAMA DA OBRA'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'Serviço',
        'Início Plan.',
        'Fim Plan.',
        'Início Real',
        'Fim Real',
        'Dias',
        '% Exec.',
        'Status'
      ]
    ];
    for (const row of linhasTl) {
      const indent = '  '.repeat(row.indentLevel ?? (row.isSub ? 1 : 0));
      const status = calcularStatusCronograma(row.dados);
      const dias = diasEntre(row.dados.dataInicio, row.dados.dataFim);
      const pct =
        row.dados.percentualExecutado != null && Number.isFinite(row.dados.percentualExecutado)
          ? `${Math.round(row.dados.percentualExecutado)}%`
          : '0%';
      rows.push([
        `${indent}${row.label}`,
        formatDataBr(row.dados.dataInicio),
        formatDataBr(row.dados.dataFim),
        formatDataBr(row.dados.dataInicioReal),
        formatDataBr(row.dados.dataFimReal),
        dias ?? '—',
        pct,
        CRONOGRAMA_STATUS_LABEL[status]
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 48 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 8 },
      { wch: 10 },
      { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cronograma');
    const nomeArquivo = `Cronograma_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Cronograma exportado com sucesso.');
  };

  const abrirEnvioFichaDemandaAprovacao = async () => {
    if (!orcamentoAtivoId) return;
    if (!fichaDemandaProgresso.completa) {
      toast.error(
        `Preencha a ficha de demanda por completo antes de enviar (${fichaDemandaProgresso.pct}% — faltam ${fichaDemandaProgresso.total - fichaDemandaProgresso.filled} de ${fichaDemandaProgresso.total} insumos).`
      );
      return;
    }
    if (
      statusAprovacaoAtivo !== 'rascunho' &&
      statusAprovacaoAtivo !== 'pronta' &&
      statusAprovacaoAtivo !== 'em_correcao'
    ) {
      toast.error('Este orçamento já foi enviado ou aprovado.');
      return;
    }
    if (!embeddedContractId && !centroCustoId) {
      toast.error('Contrato não identificado para a ficha de demanda.');
      return;
    }

    setFdAprovacaoPreparando(true);
    try {
      const anexos: FichaDemandaApprovalFormState['anexos'] = [];
      const nomeContratoSafe = (embeddedContractName || nomeContratoBreadcrumb || 'Contrato')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 40);
      const dataIso = new Date().toISOString().slice(0, 10);
      const uploadXlsx = async (wb: XLSX.WorkBook, fileName: string, kind: 'orcamento' | 'fd') => {
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const file = new File([new Uint8Array(out as ArrayLike<number>)], fileName, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await api.post('/demand-sheet-approvals/upload-attachment', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploaded = uploadRes.data?.data as { url?: string; originalName?: string } | undefined;
        const url = String(uploaded?.url || '').trim();
        if (!url) return;
        anexos.push({
          id: crypto.randomUUID(),
          name: uploaded?.originalName || fileName,
          url,
          kind,
        });
      };

      const wsOrc = montarSheetOrcamentoDetalhado();
      const wsMem = montarSheetMemoriaCalculo();
      const wsAna = montarSheetOrcamentoAnalitico();
      if (wsOrc || wsMem || wsAna) {
        const wbOrc = XLSX.utils.book_new();
        if (wsOrc) XLSX.utils.book_append_sheet(wbOrc, wsOrc, 'Orçamento');
        if (wsMem) XLSX.utils.book_append_sheet(wbOrc, wsMem, 'Memória de cálculo');
        if (wsAna) XLSX.utils.book_append_sheet(wbOrc, wsAna, 'Analítico');
        await uploadXlsx(wbOrc, `Orcamento_${nomeContratoSafe}_${dataIso}.xlsx`, 'orcamento');
      }

      const wsFicha = montarSheetFichaDemanda();
      if (wsFicha) {
        const wbFd = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wbFd, wsFicha, 'Ficha de demanda');
        await uploadXlsx(wbFd, `Ficha_Demanda_${nomeContratoSafe}_${dataIso}.xlsx`, 'fd');
      }

      const codigoFdBase = (codigoOrcamentoAtivo || orcamentoAtivoId.slice(0, 8)).replace(/\s+/g, '');
      const poloInferido = inferirPoloFdDeTexto(
        `${embeddedContractName || ''} ${nomeContratoBreadcrumb || ''} ${nomeOrcamentoSemCodigo || ''}`
      );
      const custo = resumoFinanceiro.totalComDesconto;
      const fat = resumoFinanceiro.totalComDescontoEBdi;

      setFdAprovacaoInitialForm({
        contratoId: embeddedContractId || '',
        obra: nomeOrcamentoSemCodigo || nomeOrcamentoRascunho || '',
        codigoPedido: meta.osNumeroPasta.trim() || codigoFdBase,
        codFichaDemanda: `FD-${codigoFdBase}`,
        faturamentoEstimado: formatCurrencyInput(fat),
        custoEstimado: formatCurrencyInput(custo),
        observacao:
          meta.descricao.trim() ||
          `Ficha de demanda gerada a partir do orçamento ${nomeOrcamentoSemCodigo || nomeOrcamentoRascunho || codigoFdBase}.`,
        polo: poloInferido,
        anexos,
      });
      setFdAprovacaoModalOpen(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível preparar o envio da ficha de demanda.');
    } finally {
      setFdAprovacaoPreparando(false);
    }
  };

  const confirmarEnvioFichaDemandaAprovacao = async (form: FichaDemandaApprovalFormState) => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    if (!fichaDemandaProgresso.completa) {
      toast.error('Preencha a ficha de demanda por completo antes de enviar para aprovação.');
      return;
    }
    setFdAprovacaoEnviando(true);
    try {
      const res = await api.post('/demand-sheet-approvals', {
        ...formToApiPayload(form),
        orcamentoCentroCustoId: centroCustoId,
        orcamentoId: orcamentoAtivoId,
      });
      const createdId = String(res.data?.data?.id || '').trim() || undefined;
      const nextMeta: OrcamentoMeta = {
        ...meta,
        statusAprovacao: 'aguardando_aprovacao',
        ...(createdId ? { fichaDemandaApprovalId: createdId } : {}),
      };
      setMeta(nextMeta);
      const nextSessao: SessaoOrcamentoPersist = {
        ...sessaoRef.current,
        meta: nextMeta,
      };
      sessaoRef.current = nextSessao;
      persistToApi(servicos, imports, nextSessao);
      setListaOrcamentos((prev) =>
        prev.map((o) =>
          o.id === orcamentoAtivoId
            ? { ...o, statusAprovacao: 'aguardando_aprovacao', updatedAt: new Date().toISOString() }
            : o
        )
      );
      setFdAprovacaoModalOpen(false);
      setFdAprovacaoInitialForm(null);
      toast.success('Ficha de demanda enviada para aprovação.');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data
              ?.error ||
            (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível enviar a ficha de demanda.');
    } finally {
      setFdAprovacaoEnviando(false);
    }
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
      'Est.40%',
      'P.real',
      '%C/V',
      'Tipo',
      'Obs.'
    ];
    const colW = [11, 10, 10, 32, 7, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11, 9, 8, 16];
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
        trunc(tipoFichaDemandaLabel(r.tipo), 8),
        trunc(fichaDemandaObservacoes[r.key] ?? '', 40)
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

  const protectedRoute = cronogramaOnly
    ? ({
        route: '/ponto/cronogramas' as const,
        contractId: embeddedContractId || undefined,
      })
    : embeddedContractId
      ? ({ route: '/ponto/orcamento' as const, contractId: embeddedContractId })
      : ({ route: '/ponto/orcamento' as const, contractId: undefined as string | undefined });

  return (
    <ProtectedRoute route={protectedRoute.route} contractId={protectedRoute.contractId}>
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
              {tituloPaginaOrcamento}
            </h1>
            <p
              className={
                orcamentoAtivoId
                  ? 'mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400'
                  : 'mt-2 text-base sm:text-lg text-gray-600 dark:text-gray-400'
              }
            >
              {subtituloPaginaOrcamento}
            </p>
          </div>

          {orcamentoAtivoId &&
            orcamentoViewTab === 'cronograma' &&
            !loadingFromApi &&
            linhasCronograma.length > 0 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
                <FilterStatCard
                  label="Progresso físico"
                  count={`${resumoCronograma.progressoFisico.toFixed(1).replace('.', ',')}%`}
                  icon={TrendingUp}
                  iconBg="bg-red-100 dark:bg-red-900/30"
                  iconColor="text-red-600 dark:text-red-400"
                  subtitle={`${resumoCronograma.valorExecutado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de ${resumoCronograma.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                />
                <FilterStatCard
                  label="Concluídos"
                  count={`${resumoCronograma.porStatus.concluido}/${resumoCronograma.totalEtapas}`}
                  icon={CheckCircle2}
                  iconBg="bg-green-100 dark:bg-green-900/30"
                  iconColor="text-green-600 dark:text-green-400"
                  subtitle={`${
                    resumoCronograma.totalEtapas > 0
                      ? (
                          (resumoCronograma.porStatus.concluido / resumoCronograma.totalEtapas) *
                          100
                        )
                          .toFixed(1)
                          .replace('.', ',')
                      : '0,0'
                  }% das etapas`}
                />
                <FilterStatCard
                  label="Atrasados"
                  count={resumoCronograma.porStatus.atrasado}
                  icon={AlertTriangle}
                  iconBg={
                    resumoCronograma.porStatus.atrasado > 0
                      ? 'bg-red-100 dark:bg-red-900/30'
                      : 'bg-amber-100 dark:bg-amber-900/30'
                  }
                  iconColor={
                    resumoCronograma.porStatus.atrasado > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }
                  subtitle={`de ${resumoCronograma.totalEtapas} etapas`}
                />
                <FilterStatCard
                  label="Com prazo"
                  count={resumoCronograma.servicosComDatas}
                  icon={CalendarCheck}
                  iconBg="bg-sky-100 dark:bg-sky-900/30"
                  iconColor="text-sky-600 dark:text-sky-400"
                  subtitle={
                    resumoCronograma.etapasSemDatasReais > 0
                      ? `${resumoCronograma.etapasSemDatasReais} sem datas reais`
                      : `de ${resumoCronograma.totalEtapas} etapas`
                  }
                />
              </div>
            )}

          {/* Seletor de Contrato (Centro de Custo) — oculto quando o orçamento está dentro do contrato */}
          {!lockedCostCenterId && (
          <Card>
            <CardContent className="py-5">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4">
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
            </CardContent>
          </Card>
          )}

          {/* Lista / detalhe de orçamentos */}
          {!centroCustoId ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
                  Selecione um contrato acima para criar orçamentos.
                </CardContent>
              </Card>
            ) : !orcamentoAtivoId ? (
              <Card className="w-full shadow-none">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <Calculator className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orçamentos</h3>
                        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                          Crie, importe e acompanhe os orçamentos deste contrato.
                        </p>
                      </div>
                    </div>
                    <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      {!carregandoListaOrcamentos && listaOrcamentos.length > 0 && (
                        <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                          <input
                            type="text"
                            value={orcamentosSearch}
                            onChange={(e) => setOrcamentosSearch(e.target.value)}
                            placeholder="Buscar orçamento..."
                            className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={abrirModalImportarOrcafascioOrcamentos}
                        onMouseEnter={() => prefetchOrcafascioOrcamentosList('')}
                        onFocus={() => prefetchOrcafascioOrcamentosList('')}
                        disabled={carregandoListaOrcamentos || !centroCustoId}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
                        title="Importar do Orçafascio"
                        aria-label="Importar do Orçafascio"
                      >
                        {isImportandoOrcamento ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Upload className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (listaOrcamentos.length === 0) {
                            toast.error('Não há orçamento para exportar.');
                            return;
                          }
                          toast.error('Abra o orçamento na lista para exportar a planilha.');
                        }}
                        disabled={carregandoListaOrcamentos || listaOrcamentos.length === 0}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
                        title="Exportar Excel"
                        aria-label="Exportar Excel"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={criarNovoOrcamento}
                        disabled={carregandoListaOrcamentos}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 active:bg-red-200/80 disabled:pointer-events-none disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40 dark:active:bg-red-900/55"
                      >
                        {carregandoListaOrcamentos ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        Novo orçamento
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {carregandoListaOrcamentos ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-600 dark:text-gray-400">
                      <Loader2 className="h-8 w-8 shrink-0 animate-spin text-red-600 dark:text-red-400" aria-hidden />
                      <span className="text-sm font-medium">Carregando orçamentos…</span>
                    </div>
                  ) : listaOrcamentos.length === 0 ? (
                    <div className="py-8 text-center">
                      <Calculator className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nenhum orçamento ainda.</p>
                      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
                        Importe um orçamento do Orçafascio pelo ícone de importar ou crie um orçamento em branco.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span>
                          Mostrando {filteredListaOrcamentos.length > 0 ? 1 : 0} a {filteredListaOrcamentos.length} de{' '}
                          {filteredListaOrcamentos.length} {filteredListaOrcamentos.length === 1 ? 'orçamento' : 'orçamentos'}
                        </span>
                        <span>Página 1 de 1</span>
                      </div>
                      <div className="table-scroll">
                        <table className="w-full table-fixed text-sm">
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%] min-w-[5.5rem]">
                                Código
                              </th>
                              <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Descrição
                              </th>
                              <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%]">
                                Status
                              </th>
                              <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[7%]">
                                FD
                              </th>
                              <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%]">
                                BDI
                              </th>
                              <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[14%]">
                                Total
                              </th>
                              <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[14%]">
                                Atualizado
                              </th>
                              <th className={listTableRowClasses.actionTh}>Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {filteredListaOrcamentos.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                  Nenhum orçamento encontrado para essa busca.
                                </td>
                              </tr>
                            ) : (
                              filteredListaOrcamentos.map((o) => {
                                const codigoLista = codigoFromNomeOrcamento(o.nome);
                                const nomeLista = nomeOrcamentoSemCodigoSufixo(o.nome) || o.nome;
                                const statusLista = normalizarStatusAprovacaoOrcamento(o.statusAprovacao);
                                const fdPctLista =
                                  typeof o.fichaDemandaPct === 'number' && Number.isFinite(o.fichaDemandaPct)
                                    ? Math.max(0, Math.min(100, Math.round(o.fichaDemandaPct)))
                                    : 0;
                                const bdiPctLista =
                                  typeof o.bdiPercentual === 'number' && Number.isFinite(o.bdiPercentual)
                                    ? o.bdiPercentual
                                    : 0;
                                const totalComBdiLista =
                                  typeof o.totalComBdi === 'number' && Number.isFinite(o.totalComBdi)
                                    ? o.totalComBdi
                                    : 0;
                                return (
                                <tr
                                  key={o.id}
                                  onClick={() => abrirOrcamentoDaLista(o.id)}
                                  onMouseEnter={() => {
                                    if (centroCustoId) prefetchOrcamentoDetail(centroCustoId, o.id);
                                  }}
                                  onFocus={() => {
                                    if (centroCustoId) prefetchOrcamentoDetail(centroCustoId, o.id);
                                  }}
                                  className={getListTableRowClassName(true)}
                                  aria-label={`Abrir orçamento ${nomeLista}`}
                                >
                                  <td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-gray-900 dark:text-gray-100 sm:px-6">
                                    {formatCadastroListId(codigoLista || null)}
                                  </td>
                                  <td className="max-w-0 px-3 py-3 align-middle sm:px-6">
                                    <ListRowNavigableLabel className="block truncate font-medium">
                                      {nomeLista}
                                    </ListRowNavigableLabel>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-center sm:px-6">
                                    <span className={orcamentoStatusBadgeClass(statusLista)}>
                                      {ORCAMENTO_STATUS_LABELS[statusLista]}
                                    </span>
                                  </td>
                                  <td
                                    className={`whitespace-nowrap px-3 py-3 text-center text-sm font-semibold tabular-nums sm:px-6 ${
                                      fdPctLista === 100
                                        ? 'text-green-700 dark:text-green-300'
                                        : 'text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    {fdPctLista}%
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums sm:px-6">
                                    {bdiPctLista.toLocaleString('pt-BR', {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2,
                                    })}
                                    %
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums sm:px-6">
                                    {formatarBRLExport(totalComBdiLista)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 tabular-nums sm:px-6">
                                    {o.updatedAt ? new Date(o.updatedAt).toLocaleString('pt-BR') : '—'}
                                  </td>
                                  <td
                                    className={listTableRowClasses.actionTd}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                          setOrcamentoListaActionMenu((prev) => {
                                            if (prev?.orcamentoId === o.id) return null;
                                            let left = r.right - ORCAMENTO_LISTA_MENU_WIDTH_PX;
                                            left = Math.max(
                                              8,
                                              Math.min(left, window.innerWidth - ORCAMENTO_LISTA_MENU_WIDTH_PX - 8)
                                            );
                                            return { orcamentoId: o.id, nome: o.nome, top: r.bottom + 4, left };
                                          });
                                        }}
                                        className={rowActionMenuButtonClass(orcamentoListaActionMenu?.orcamentoId === o.id)}
                                        aria-label="Abrir ações"
                                        aria-expanded={orcamentoListaActionMenu?.orcamentoId === o.id}
                                        aria-haspopup="menu"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                      {orcamentoListaActionMenu && (
                        <ActionMenuOverlay
                          open
                          onClose={() => setOrcamentoListaActionMenu(null)}
                          top={orcamentoListaActionMenu.top}
                          left={orcamentoListaActionMenu.left}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = orcamentoListaActionMenu.orcamentoId;
                              setOrcamentoListaActionMenu(null);
                              abrirOrcamentoDaLista(id);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span>Ver detalhes</span>
                          </button>
                          {embeddedContractId && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                const id = orcamentoListaActionMenu.orcamentoId;
                                setOrcamentoListaActionMenu(null);
                                router.push(
                                  `/ponto/cronogramas/${embeddedContractId}/${id}`
                                );
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <Calendar className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                              <span>Cronograma</span>
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              const { orcamentoId, nome } = orcamentoListaActionMenu;
                              setOrcamentoListaActionMenu(null);
                              pedirExclusaoOrcamento(orcamentoId, nome);
                            }}
                            className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            <span>Excluir</span>
                          </button>
                        </ActionMenuOverlay>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
            <Card className="shadow-none">
              {!cronogramaOnly && (
              <CardHeader className="!border-b-0">
                <div className="flex justify-center">
                  <SegmentedControl
                    aria-label="Abas do orçamento"
                    value={orcamentoViewTab}
                    onChange={(next) => {
                      // Troca imediata do pill; conteúdo pesado segue no deferred.
                      setOrcamentoViewTab(next);
                    }}
                    className="h-auto max-w-full flex-nowrap overflow-x-auto rounded-xl border border-gray-200 bg-gray-100/80 p-1.5 dark:border-gray-700 dark:bg-gray-800/70"
                    pillClassName="rounded-lg bg-red-600 shadow-sm top-1.5 bottom-1.5"
                    buttonClassName="px-3 py-2 text-xs sm:px-4 sm:text-sm"
                    activeButtonClassName="font-semibold text-white"
                    inactiveButtonClassName="font-semibold text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                    options={[
                      { value: 'dados', label: 'Dados' },
                      { value: 'montagem', label: 'Orçamento' },
                      ...(memorialDisponivel
                        ? [{ value: 'memorial' as const, label: 'Memória de cálculo' }]
                        : []),
                      { value: 'analitico', label: 'Analítico' },
                      { value: 'planilhaAnalitica', label: 'Ficha de demanda' },
                    ]}
                  />
                </div>
              </CardHeader>
              )}
              <CardContent className="space-y-4">
                {loadingFromApi && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-8 sm:py-10">
                    <div className="flex flex-col items-center justify-center text-center gap-3">
                      <Loader2 className="w-7 h-7 animate-spin text-red-600 dark:text-red-400" />
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Carregando orçamento…
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Buscando dados salvos. Na próxima abertura fica mais rápido.
                      </p>
                    </div>
                  </div>
                )}
                {abaPesadaPendente && (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-600 dark:text-gray-400">
                    <Loader2 className="h-7 w-7 shrink-0 animate-spin text-red-600 dark:text-red-400" aria-hidden />
                    <span className="text-sm font-medium">Montando a aba…</span>
                  </div>
                )}

                {!loadingFromApi && orcamentoViewTab === 'dados' && (
                  <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                    <div className="px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 break-words">
                            {nomeOrcamentoRascunho || 'Orçamento sem nome'}
                          </h3>
                          <span className={orcamentoStatusBadgeClass(statusAprovacaoAtivo)}>
                            {ORCAMENTO_STATUS_LABELS[statusAprovacaoAtivo]}
                          </span>
                          {orcamentoVeioOrcafascio && orcafascioDadosExibicao?.exempt != null ? (
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                                orcafascioDadosExibicao.exempt
                                  ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200'
                                  : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
                              }`}
                            >
                              {rotuloEncargosOrcafascio(orcafascioDadosExibicao.exempt)}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={abrirEdicaoDados}
                          className="inline-flex items-center p-1.5 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                          aria-label="Editar dados"
                          title="Editar dados"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="px-4 sm:px-5 py-5 space-y-6">
                      <div>
                        <p className="mb-3 text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                          Identificação
                        </p>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                          <DadosCampo label="OS/Nº da pasta">{meta.osNumeroPasta || '—'}</DadosCampo>
                          <DadosCampo label="Prazo de execução (dias)">{meta.prazoExecucaoDias || '—'}</DadosCampo>
                          <DadosCampo label="Origem">
                            {orcamentoVeioOrcafascio
                              ? 'Orçafascio'
                              : meta.importadoPlanilha
                                ? 'Planilha'
                                : 'Manual'}
                          </DadosCampo>
                          <DadosCampo label="Data de início">{formatDataBr(meta.dataAbertura)}</DadosCampo>
                          <DadosCampo label="Data de fim">
                            {formatDataBr(
                              meta.dataEnvio ||
                                calcularDataFimOrcamento(
                                  meta.dataAbertura,
                                  meta.dataEnvio,
                                  meta.prazoExecucaoDias
                                )
                            )}
                          </DadosCampo>
                          <DadosCampo label="Responsável pelo orçamento">
                            {meta.responsavelOrcamento || '—'}
                          </DadosCampo>
                          <DadosCampo label="Orçamento realizado por">
                            {meta.orcamentoRealizadoPor || '—'}
                          </DadosCampo>
                          <DadosCampo label="Desconto (%)">{meta.descontoPercentual || '0'}</DadosCampo>
                          <DadosCampo label="BDI (%)">{meta.bdiPercentual || '0'}</DadosCampo>
                          {typeof meta.usarMemoriaCalculo === 'boolean' ? (
                            <DadosCampo label="Memória de cálculo">
                              {rotuloSimNaoOrcafascio(meta.usarMemoriaCalculo)}
                            </DadosCampo>
                          ) : null}
                          {meta.modoArredondamento ? (
                            <DadosCampo label="Arredondamento">
                              {rotuloModoArredondamentoDados(meta.modoArredondamento)}
                            </DadosCampo>
                          ) : null}
                          {typeof meta.fichaDemandaPct === 'number' ? (
                            <DadosCampo label="Ficha de demanda">{`${meta.fichaDemandaPct}%`}</DadosCampo>
                          ) : null}
                        </dl>
                      </div>

                      {orcamentoVeioOrcafascio ? (
                        <div>
                          <p className="mb-3 text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                            Orçafascio
                          </p>
                          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                            <DadosCampo label="Código">
                              {orcafascioDadosExibicao?.code || meta.osNumeroPasta || '—'}
                            </DadosCampo>
                            <DadosCampo label="Encargos">
                              {rotuloEncargosOrcafascio(orcafascioDadosExibicao?.exempt)}
                            </DadosCampo>
                            <DadosCampo label="Leis sociais">
                              {rotuloSimNaoOrcafascio(orcafascioDadosExibicao?.socialCharges)}
                            </DadosCampo>
                            <DadosCampo label="UF">{orcafascioDadosExibicao?.state || '—'}</DadosCampo>
                            <DadosCampo label="Criado em">
                              {formatarDataHoraOrcafascio(orcafascioDadosExibicao?.createdAt)}
                            </DadosCampo>
                            <DadosCampo label="Atualizado em">
                              {formatarDataHoraOrcafascio(orcafascioDadosExibicao?.updatedAt)}
                            </DadosCampo>
                            {meta.orcafascioBudgetId ? (
                              <DadosCampo label="ID Orçafascio">
                                <span className="break-all font-mono text-xs">{meta.orcafascioBudgetId}</span>
                              </DadosCampo>
                            ) : null}
                            {meta.totaisOrcafascio ? (
                              <>
                                <DadosCampo label="Total sem BDI (Orçafascio)">
                                  {fmtCalcMoeda(meta.totaisOrcafascio.semBdi)}
                                </DadosCampo>
                                <DadosCampo label="BDI (Orçafascio)">
                                  {fmtCalcMoeda(meta.totaisOrcafascio.bdi)}
                                </DadosCampo>
                                <DadosCampo label="Total com BDI (Orçafascio)">
                                  {fmtCalcMoeda(meta.totaisOrcafascio.comBdi)}
                                </DadosCampo>
                              </>
                            ) : null}
                            {orcafascioDadosExibicao?.description ? (
                              <DadosCampo label="Descrição no Orçafascio" wide>
                                {orcafascioDadosExibicao.description}
                              </DadosCampo>
                            ) : null}
                          </dl>
                        </div>
                      ) : null}

                      <div>
                        <p className="mb-3 text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                          Descrição e reajustes
                        </p>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                          <DadosCampo label="Descrição" wide>
                            {meta.descricao || '—'}
                          </DadosCampo>
                          <DadosCampo label="Reajustes (%)" wide>
                            {(meta.reajustes ?? []).length > 0
                              ? meta.reajustes
                                  .map((r, idx) => `${r.nome || `Reajuste ${idx + 1}`}: ${r.percentual || '0'}%`)
                                  .join(' · ')
                              : '—'}
                          </DadosCampo>
                        </dl>
                      </div>
                    </div>
                  </section>
                )}

                {!loadingFromApi && !abaPesadaPendente && orcamentoViewTab === 'analitico' && (
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
                    <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                      <table className={`min-w-full border-collapse ${gradeTableCls}`}>
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                          <tr className={gradeTableRowTrCls}>
                            <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Item</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Tipo</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Código</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Banco</th>
                            <th className="min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Descrição</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Unidade</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Quantidade</th>
                            <th className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quantidade real</th>
                            <th className="whitespace-nowrap px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quantidade orçada</th>
                            <th className={`${GRADE_COL_MOEDA_UNIT} px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600`}>Valor unitário</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Total</th>
                          </tr>
                        </thead>
                        <tbody ref={janelaAnalitico.tbodyRef} className="divide-y divide-gray-200/80 dark:divide-gray-700">
                          <TabelaJanelaSpacer height={janelaAnalitico.topPad} colSpan={11} />
                          {linhasAnaliticoOrcamento.slice(janelaAnalitico.start, janelaAnalitico.end).map((l, i) => {
                            const idxLinha = janelaAnalitico.start + i;
                            if (l.kind === 'tituloServico') {
                              return (
                                <tr key={l.key} className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls} ${gradeTituloSubtituloRowTrCls}`}>
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-bold tabular-nums text-white">
                                    {l.main}
                                  </td>
                                  <td
                                    colSpan={10}
                                    className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-left text-white align-middle"
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
                                  className={`border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900 ${gradeTableRowTrCls} ${gradeTituloSubtituloRowTrCls}`}
                                >
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                    {`${l.main}.${l.subIdx}`}
                                  </td>
                                  <td colSpan={10} className="px-3 py-2.5 align-middle">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                      {l.texto}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                            if (l.kind === 'composicao') {
                              return (
                                <React.Fragment key={l.key}>
                                  <tr
                                    className={`bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                                    onContextMenuCapture={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const mw = 280;
                                      const mh = 120;
                                      let left = e.clientX;
                                      let top = e.clientY;
                                      left = Math.min(left, window.innerWidth - mw - 8);
                                      top = Math.min(top, window.innerHeight - mh - 8);
                                      setMenuCtxAnalitico({
                                        kind: 'composicao',
                                        left,
                                        top,
                                        composicaoKey: l.key
                                      });
                                    }}
                                  >
                                    <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                                      {l.item}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">{tipoInsumoCodigoParaDescricao(l.tipo)}</td>
                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo}</td>
                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{nomeBancoParaExibicao(l.banco)}</td>
                                    <td className="min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                      <div className="whitespace-normal break-words">{l.descricao}</div>
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">{l.und}</td>
                                    <td className="px-3 py-2.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                    <td className="px-3 py-2.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                    <td className="px-3 py-2.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeOrcada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                    <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      <MoedaCelula
                                        valor={l.valorUnit}
                                        className="font-medium text-gray-900 dark:text-gray-100"
                                      />
                                    </td>
                                    <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      <MoedaCelula
                                        valor={l.total}
                                        className="font-semibold text-gray-900 dark:text-gray-50"
                                        valorClassName="font-semibold"
                                      />
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            }
                            const proximaLinha = linhasAnaliticoOrcamento[idxLinha + 1];
                            const ultimoInsumoDaComposicao =
                              !proximaLinha ||
                              proximaLinha.kind !== 'insumo' ||
                              proximaLinha.parentKey !== l.parentKey;
                            const manuais = insumosAnaliticoManuais[l.parentKey] ?? [];
                            const composicaoPai = analiticoComposicaoPorKey.get(l.parentKey);
                            const baseInsumos = analiticoInsumosCountPorParent.get(l.parentKey) ?? 0;
                            return (
                              <React.Fragment key={l.key}>
                              <tr
                                className={`bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800 ${gradeTableRowTrCls}`}
                                onContextMenuCapture={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const mw = 280;
                                  const mh = 120;
                                  let left = e.clientX;
                                  let top = e.clientY;
                                  left = Math.min(left, window.innerWidth - mw - 8);
                                  top = Math.min(top, window.innerHeight - mh - 8);
                                  setMenuCtxAnalitico({
                                    kind: 'insumo',
                                    left,
                                    top,
                                    parentKey: l.parentKey,
                                    insumoKey: l.key,
                                    descricao: l.descricao
                                  });
                                }}
                              >
                                <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                                  {l.item}
                                </td>
                                <td className="px-3 py-2.5 text-center text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">{tipoInsumoCodigoParaDescricao(l.tipo)}</td>
                                <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo || '---'}</td>
                                <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco || '---'}</td>
                                <td className="min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                  <div className="whitespace-normal break-words">{l.descricao}</div>
                                </td>
                                <td className="px-3 py-2.5 text-center text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">{l.und || '---'}</td>
                                <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quant.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeOrcada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                  <MoedaCelula valor={l.valorUnit} className="text-gray-700 dark:text-gray-300" />
                                </td>
                                <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                  <MoedaCelula valor={l.total} className="text-gray-900 dark:text-gray-100" />
                                </td>
                              </tr>
                              {ultimoInsumoDaComposicao && manuais.map((ins, idx) => {
                                const itemManual = composicaoPai
                                    ? `${composicaoPai.item}.${baseInsumos + idx + 1}`
                                    : `${baseInsumos + idx + 1}`;
                                const quantUnitNum = parsePlanilhaCalcOrPtBr(ins.quant);
                                const qtdComp = composicaoPai
                                    ? Number(composicaoPai.quantidadeReal) || 0
                                    : 0;
                                const qtdRealNum = quantUnitNum !== null ? quantUnitNum * qtdComp : null;
                                const vUnitNum = parsePlanilhaCalcOrPtBr(ins.valorUnit);
                                const totalManual =
                                  qtdRealNum !== null && vUnitNum !== null ? qtdRealNum * vUnitNum : null;
                                return (
                                  <tr
                                    key={ins.id}
                                    className={`bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                                    onContextMenuCapture={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const mw = 220;
                                      const mh = 104;
                                      let left = e.clientX;
                                      let top = e.clientY;
                                      left = Math.min(left, window.innerWidth - mw - 8);
                                      top = Math.min(top, window.innerHeight - mh - 8);
                                      setMenuCtxAnalitico({
                                        kind: 'manual',
                                        left,
                                        top,
                                        parentKey: l.parentKey,
                                        insumoId: ins.id,
                                        idx
                                      });
                                    }}
                                  >
                                    <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                                      {itemManual}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      Insumo
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input type="text" value={ins.codigo} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'codigo', e.target.value)} className={`${inputGradeCls} text-center`} placeholder="Código" />
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input type="text" value={ins.banco} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'banco', e.target.value)} className={`${inputGradeCls} text-center`} placeholder="Banco" />
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input
                                        type="text"
                                        value={ins.descricao}
                                        onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'descricao', e.target.value)}
                                        className={`${inputGradeCls} text-left`}
                                        placeholder="Descrição do insumo"
                                      />
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <select
                                        value={ins.und}
                                        onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'und', e.target.value)}
                                        className={selectGradeSemSetaCls}
                                        title="Unidade (UND)"
                                      >
                                        <option value="">UND</option>
                                        <option value="UN">UN</option>
                                        <option value="M">M</option>
                                        <option value="M²">M²</option>
                                        <option value="M³">M³</option>
                                        <option value="H">H</option>
                                        <option value="DIA">DIA</option>
                                        <option value="KG">KG</option>
                                        <option value="L">L</option>
                                        <option value="CJ">CJ</option>
                                        <option value="VB">VB</option>
                                      </select>
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input type="text" inputMode="decimal" value={ins.quant} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'quant', e.target.value)} onBlur={() => normalizarNumeroManualAnalitico(l.parentKey, ins.id, 'quant', 2)} className={`${inputGradeCls} text-center tabular-nums`} placeholder="0,00" />
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      {qtdRealNum !== null
                                        ? qtdRealNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      {qtdRealNum !== null
                                        ? qtdRealNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : '—'}
                                    </td>
                                    <td className={`p-0 border-l border-gray-200 dark:border-gray-700 ${GRADE_COL_MOEDA_UNIT}`}>
                                      <div className={moedaGradeFieldWrapperCls}>
                                        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                          R$
                                        </span>
                                        <input type="text" inputMode="decimal" value={ins.valorUnit} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'valorUnit', e.target.value)} onBlur={() => normalizarNumeroManualAnalitico(l.parentKey, ins.id, 'valorUnit', 2)} className={`${inputGradeMoedaCls} text-right`} placeholder="0,00" />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 text-right text-gray-900 dark:text-gray-100">
                                      {totalManual !== null ? (
                                        <MoedaCelula valor={totalManual} className="w-full text-sm text-gray-900 dark:text-gray-100" />
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              </React.Fragment>
                            );
                          })}
                          <TabelaJanelaSpacer height={janelaAnalitico.bottomPad} colSpan={11} />
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
                    {menuCtxAnalitico && (
                      <ActionMenuOverlay
                        open
                        onClose={() => setMenuCtxAnalitico(null)}
                        top={menuCtxAnalitico.top}
                        left={menuCtxAnalitico.left}
                        panelClassName="min-w-[17rem] max-w-[min(100vw-1rem,22rem)] py-1"
                      >
                            {menuCtxAnalitico.kind === 'composicao' ? (
                              <>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
                                  onClick={() => {
                                    addInsumoManualAnalitico(menuCtxAnalitico.composicaoKey);
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                  Adicionar insumo manual
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={() => {
                                    if (
                                      typeof window !== 'undefined' &&
                                      !window.confirm(
                                        'Remover esta composição inteira do orçamento? Os insumos manuais ligados a ela também serão desconsiderados na próxima montagem da lista.'
                                      )
                                    ) {
                                      setMenuCtxAnalitico(null);
                                      return;
                                    }
                                    removerItemComposicaoDoOrcamento(menuCtxAnalitico.composicaoKey);
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                                  Excluir composição do orçamento
                                </button>
                              </>
                            ) : menuCtxAnalitico.kind === 'insumo' ? (
                              <>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
                                  onClick={() => {
                                    addInsumoManualAnalitico(menuCtxAnalitico.parentKey);
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                  Adicionar insumo manual
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={() => {
                                    ocultarInsumoAnalitico(menuCtxAnalitico.insumoKey);
                                    setMenuCtxAnalitico(null);
                                    toast.success('Insumo removido do orçamento analítico.');
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                                  Excluir insumo
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
                                  onClick={() => {
                                    addInsumoManualAnaliticoApos(
                                      menuCtxAnalitico.parentKey,
                                      menuCtxAnalitico.idx
                                    );
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                  Adicionar insumo abaixo
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={() => {
                                    removerInsumoManualAnalitico(
                                      menuCtxAnalitico.parentKey,
                                      menuCtxAnalitico.insumoId
                                    );
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                                  Excluir insumo
                                </button>
                              </>
                            )}
                      </ActionMenuOverlay>
                    )}
                    </>
                    )}
                  </div>
                )}

                {!loadingFromApi && !abaPesadaPendente && orcamentoViewTab === 'planilhaAnalitica' && (
                  <div className="space-y-3">
                    {linhasAnaliticoOrcamento.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Ficha de demanda vazia"
                        texto="Adicione itens na aba Orçamento para acompanhar custos estimados, compras e valores unitários."
                        Icon={FileSpreadsheet}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                        <>
                        <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                          <table className={`min-w-full border-collapse ${gradeTableCls}`}>
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                              <tr className={gradeTableRowTrCls}>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.item}
                                  className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide"
                                >
                                  Item
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.codigo}
                                  className="min-w-[5.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Código
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.banco}
                                  className="min-w-[5.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Banco
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.servico}
                                  className="min-w-[220px] max-w-[min(520px,55vw)] px-3 py-2.5 text-left text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Descrição
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.tipo}
                                  className="w-14 min-w-[3.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Tipo
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.un}
                                  className="min-w-[5.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Unidade
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadQuantidade}
                                  className="min-w-[6.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Quantidade
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadValorUnitOrc}
                                  className="min-w-[7.5rem] max-w-[9rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Valor unitário orçamento
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadTotalOrc}
                                  className="min-w-[7.5rem] max-w-[9rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Custo orçamento
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadValorUnitEst}
                                  className="min-w-[7.5rem] max-w-[9rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Valor unitário estimado (40%)
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadCustoEst}
                                  className="min-w-[7.5rem] max-w-[9rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Custo estimado (40%)
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadQtdCompra}
                                  className="min-w-[6.5rem] max-w-[8rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Quantidade compra
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadSobra}
                                  className="min-w-[5rem] max-w-[6.5rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Sobra
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadVlCompraReal}
                                  className="min-w-[7.5rem] max-w-[9rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Valor unitário real
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadCustoCompraReal}
                                  className="min-w-[6.5rem] max-w-[8rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Custo real
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadPctLev}
                                  className="min-w-[6.5rem] max-w-[8rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  % Quantidade solicitada
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadPctFat}
                                  className="min-w-[5.5rem] max-w-[7rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  % Valor total
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadPctCvp}
                                  className="min-w-[7rem] max-w-[9rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  % Custo / valor pago
                                </th>
                                <th className="min-w-[12rem] px-2 py-2.5 text-center text-[11px] font-semibold leading-tight text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                                  Observação
                                </th>
                              </tr>
                            </thead>
                            <tbody ref={janelaFd.tbodyRef} className="divide-y divide-gray-200/80 dark:divide-gray-700">
                              <TabelaJanelaSpacer height={janelaFd.topPad} colSpan={19} />
                              {linhasAnaliticoComManuais.slice(janelaFd.start, janelaFd.end).map((l) => {
                                const itemW =
                                  'w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm tabular-nums';
                                if (l.kind === 'tituloServico') {
                                  const resumo = resumoSecoesFicha.porTitulo.get(String(l.main)) ?? {
                                    custoOrc: 0,
                                    custoEst: 0,
                                    custoReal: 0
                                  };
                                  return (
                                    <tr key={l.key} className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls} ${gradeTituloSubtituloRowTrCls}`}>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.item}
                                        className={`${itemW} font-bold text-white`}
                                      >
                                        {l.main}
                                      </td>
                                      <td title={PLANILHA_ANALITICA_TOOLTIP.tituloServico} colSpan={7} className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-left text-white align-middle">
                                        {l.servicoNome}
                                      </td>
                                      <td className="px-3 py-2.5 text-sm tabular-nums border-l border-red-400/50 dark:border-red-800">
                                        <MoedaCelula valor={resumo.custoOrc} className="text-white font-bold" valorClassName="font-bold" />
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 text-sm tabular-nums border-l border-red-400/50 dark:border-red-800">
                                        <MoedaCelula valor={resumo.custoEst} className="text-white font-bold" valorClassName="font-bold" />
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 text-sm tabular-nums border-l border-red-400/50 dark:border-red-800">
                                        <MoedaCelula valor={resumo.custoReal} className="text-white font-bold" valorClassName="font-bold" />
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                    </tr>
                                  );
                                }
                                if (l.kind === 'subtituloBloco') {
                                  const resumo = resumoSecoesFicha.porSubtitulo.get(`${l.main}.${l.subIdx}`) ?? {
                                    custoOrc: 0,
                                    custoEst: 0,
                                    custoReal: 0
                                  };
                                  return (
                                    <tr
                                      key={l.key}
                                      className={`border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900 ${gradeTableRowTrCls} ${gradeTituloSubtituloRowTrCls}`}
                                    >
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.item}
                                        className={`${itemW} text-xs font-semibold text-gray-800 dark:text-gray-200`}
                                      >
                                        {`${l.main}.${l.subIdx}`}
                                      </td>
                                      <td title={PLANILHA_ANALITICA_TOOLTIP.subtituloBloco} colSpan={7} className="px-3 py-2.5 align-middle">
                                        {l.texto ? (
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                            {l.texto}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums border-l border-gray-300 dark:border-gray-700`}
                                      >
                                        <MoedaCelula valor={resumo.custoOrc} className="font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums border-l border-gray-300 dark:border-gray-700`}
                                      >
                                        <MoedaCelula valor={resumo.custoEst} className="font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums border-l border-gray-300 dark:border-gray-700`}
                                      >
                                        <MoedaCelula valor={resumo.custoReal} className="font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                    </tr>
                                  );
                                }
                                if (l.kind === 'composicao') {
                                  const filhos = insumosPlanilhaPorComposicao.get(l.key) ?? [];
                                  let sumQtdCompra = 0;
                                  const sumCustoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                  let sumCustoReal = 0;
                                  let sumQtdCompraComVlReal = 0;
                                  let temQtdCompra = false;
                                  /** Soma dos vl. unit. compra real dos insumos (col. "Valor unit. compra real" na linha da composição). */
                                  let somaVlUnitCompraRealInsumos = 0;
                                  let temAlgumVlUnitCompraReal = false;
                                  for (const ins of filhos) {
                                    const qC = planilhaQtdDeferred[ins.key];
                                    const vReal = planilhaVlDeferred[ins.key];
                                    const vOrc = ins.valorUnit;
                                    if (vReal !== undefined && Number.isFinite(vReal)) {
                                      somaVlUnitCompraRealInsumos += vReal;
                                      temAlgumVlUnitCompraReal = true;
                                    }
                                    if (qC !== undefined && Number.isFinite(qC)) {
                                      temQtdCompra = true;
                                      sumQtdCompra += qC;
                                      if (vReal !== undefined && Number.isFinite(vReal)) {
                                        sumCustoReal += qC * vReal;
                                        sumQtdCompraComVlReal += qC;
                                      }
                                    }
                                  }
                                  const vlUnitCompraRealAgreg =
                                    temAlgumVlUnitCompraReal ? somaVlUnitCompraRealInsumos : null;
                                  const pctRow = pctFichaDemandaPorKey.get(l.key);
                                  const pctLev = pctRow?.levantamentoPct;
                                  const pctFat = pctRow?.faturamentoPct;
                                  const pctCvp = pctRow?.pctCustoValorPago;
                                  const custoEstCompCalc = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                  const levantamentoCondComp =
                                    pctLev !== undefined && Number.isFinite(pctLev)
                                      ? classeLevantamentoCondicional(pctLev)
                                      : '';
                                  const valorTotalCondComp =
                                    pctFat !== undefined && Number.isFinite(pctFat)
                                      ? classeValorTotalCondicional(pctFat)
                                      : '';
                                  return (
                                    <tr
                                      key={l.key}
                                      className={`bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                                    >
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.item}
                                        className={`${itemW} font-semibold text-gray-900 dark:text-gray-50`}
                                      >
                                        {l.item}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.codigo}
                                        className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center"
                                      >
                                        {l.codigo}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.banco}
                                        className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center"
                                      >
                                        {nomeBancoParaExibicao(l.banco)}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.servico}
                                        className="min-w-[220px] px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        <div className="max-w-[min(520px,55vw)] whitespace-normal break-words">
                                          {l.descricao}
                                        </div>
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.tipoCompLinha}
                                        className={tdPlanilhaTipoCls}
                                      >
                                        <span className={planilhaTipoVazioCls} aria-hidden>
                                          —
                                        </span>
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.un}
                                        className="px-3 py-2.5 text-center text-sm font-medium text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        {l.und}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.quantidadeComp}
                                        className={`px-3 py-2.5 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700`}
                                      >
                                        {l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.valorUnitOrcComp}
                                        className={`px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700`}
                                      >
                                        <MoedaCelula valor={l.valorUnit} />
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700`}
                                      >
                                        <MoedaCelula valor={l.total} className="font-semibold" valorClassName="font-semibold" />
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.valorUnitEstComp}
                                        className="px-3 py-2.5 text-sm text-right tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        <MoedaCelula valor={l.valorUnit * PLANILHA_FATOR_CUSTO_ESTIMADO} />
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700`}
                                      >
                                        <MoedaCelula valor={custoEstCompCalc} />
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.qtdCompraComp}
                                        className="px-3 py-2.5 text-center text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      />
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.qtdSobraComp}
                                        className="px-3 py-2.5 text-sm text-right tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      />
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.vlCompraRealComp}
                                        className={`px-2 py-2.5 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700 ${GRADE_COL_MOEDA_UNIT}`}
                                      >
                                        {vlUnitCompraRealAgreg !== null ? <MoedaCelula valor={vlUnitCompraRealAgreg} /> : null}
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700`}
                                      >
                                        {sumQtdCompraComVlReal > 0 ? (
                                          <MoedaCelula valor={sumCustoReal} />
                                        ) : null}
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                          levantamentoCondComp || 'text-gray-800 dark:text-gray-200'
                                        }`}
                                      >
                                        {pctLev !== undefined && Number.isFinite(pctLev)
                                          ? `${pctLev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                          : (
                                              <span className="text-gray-500 dark:text-gray-400">—</span>
                                            )}
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                          valorTotalCondComp || 'text-gray-800 dark:text-gray-200'
                                        }`}
                                      >
                                        {pctFat !== undefined && Number.isFinite(pctFat)
                                          ? `${pctFat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                          : (
                                              <span className="text-gray-500 dark:text-gray-400">—</span>
                                            )}
                                      </td>
                                      <td
                                        className="px-3 py-2.5 text-sm text-center tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        {pctCvp !== undefined && Number.isFinite(pctCvp) ? (
                                          <span>{`${pctCvp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                        ) : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )}
                                      </td>
                                      <td className="border-l border-gray-200 dark:border-gray-700 p-0">
                                        <span className="block px-3 py-2.5 text-sm text-gray-400 dark:text-gray-600">—</span>
                                      </td>
                                    </tr>
                                  );
                                }
                                const qCLive = planilhaQuantidadeCompra[l.key];
                                const vRealLive = planilhaValorUnitCompraReal[l.key];
                                const qC = planilhaQtdDeferred[l.key];
                                const vReal = planilhaVlDeferred[l.key];
                                const vOrc = l.valorUnit;
                                const valorUnitEstimado = vOrc * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                const custoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                const custoCompraR =
                                  qC !== undefined &&
                                  vReal !== undefined &&
                                  Number.isFinite(qC) &&
                                  Number.isFinite(vReal)
                                    ? qC * vReal
                                    : null;
                                const pctInsumo = pctFichaDemandaPorKey.get(l.key);
                                const pctLevIn = pctInsumo?.levantamentoPct;
                                const pctFatIn = pctInsumo?.faturamentoPct;
                                const pctCvpIn = pctInsumo?.pctCustoValorPago;
                                const composicaoPaiParaPct = analiticoComposicaoPorKey.get(l.parentKey);
                                const faturamentoComposicaoPai = composicaoPaiParaPct
                                    ? composicaoPaiParaPct.quantidadeReal * composicaoPaiParaPct.valorUnit
                                    : 0;
                                const valorTotalCondIn =
                                  pctFatIn !== undefined && Number.isFinite(pctFatIn)
                                    ? classeValorTotalCondicional(pctFatIn)
                                    : '';
                                const sobraInsumo =
                                  qC !== undefined && Number.isFinite(qC) ? l.quantidadeReal - qC : null;
                                const levantamentoCondIn =
                                  pctLevIn !== undefined && Number.isFinite(pctLevIn)
                                    ? classeLevantamentoCondicional(pctLevIn)
                                    : '';
                                return (
                                  <tr key={l.key} className={`bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800 ${gradeTableRowTrCls}`}>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.item}
                                      className={`${itemW} text-gray-700 dark:text-gray-300`}
                                    >
                                      {l.item}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.codigo}
                                      className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center"
                                    >
                                      {l.codigo || '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.banco}
                                      className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center"
                                    >
                                      {nomeBancoParaExibicao(l.banco)}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.servico}
                                      className="min-w-[220px] px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      <div className="max-w-[min(520px,55vw)] whitespace-normal break-words">
                                        {l.descricao}
                                      </div>
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.tipo}
                                      className={tdPlanilhaTipoCls}
                                    >
                                      <select
                                        value={
                                          (String(planilhaTipoInsumo[l.key] ?? '') === 'MAT'
                                            ? 'MA'
                                            : planilhaTipoInsumo[l.key]) ?? tipoPlanilhaInsumo(l.categoria)
                                        }
                                        onChange={(e) =>
                                          setPlanilhaTipoInsumo((prev) => ({
                                            ...prev,
                                            [l.key]: e.target.value as 'MO' | 'MA' | 'LO'
                                          }))
                                        }
                                        className={selectGradeSemSetaCls}
                                        title="Selecione o tipo do insumo"
                                      >
                                        <option value="MO">MO</option>
                                        <option value="MA">MA</option>
                                        <option value="LO">LO</option>
                                      </select>
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.un}
                                      className="px-3 py-2.5 text-center text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      {l.und || '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.quantidadeInsumo}
                                      className={`px-3 py-2.5 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700`}
                                    >
                                      {l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.valorUnitOrcInsumo}
                                      className={`px-3 py-2.5 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700`}
                                    >
                                      <MoedaCelula valor={l.valorUnit} />
                                    </td>
                                    <td
                                      className={`px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700`}
                                    >
                                      <MoedaCelula valor={l.total} />
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.valorUnitEstInsumo}
                                      className="px-3 py-2.5 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      <MoedaCelula valor={valorUnitEstimado} />
                                    </td>
                                    <td
                                      className={`px-3 py-2.5 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700`}
                                    >
                                      <MoedaCelula valor={custoEst} />
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.qtdCompraInsumo}
                                      className={`p-0 border-l border-gray-200 dark:border-gray-700`}
                                    >
                                      <FdCampoLocal
                                        committedValue={
                                          qCLive !== undefined
                                            ? qCLive.toLocaleString('pt-BR', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 4,
                                              })
                                            : ''
                                        }
                                        onCommit={(raw) => commitPlanilhaQtdCompra(l.key, raw)}
                                        placeholder="0"
                                        title={PLANILHA_ANALITICA_TOOLTIP.qtdCompraInsumo}
                                        inputMode="decimal"
                                        className={`${inputGradeCls} text-center tabular-nums`}
                                      />
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.qtdSobraInsumo}
                                      className={`px-3 py-2.5 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                        sobraInsumo !== null && sobraInsumo < 0
                                          ? 'font-semibold bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200'
                                          : 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {sobraInsumo !== null ? (
                                        <span>{sobraInsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                      ) : '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.vlCompraRealInsumo}
                                      className={`p-0 align-middle border-l border-gray-200 dark:border-gray-700 ${GRADE_COL_MOEDA_UNIT}`}
                                    >
                                      <div className={moedaGradeFieldWrapperCls}>
                                        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                          R$
                                        </span>
                                        <FdCampoLocal
                                          committedValue={
                                            vRealLive !== undefined
                                              ? vRealLive.toLocaleString('pt-BR', {
                                                  minimumFractionDigits: 2,
                                                  maximumFractionDigits: 2,
                                                })
                                              : ''
                                          }
                                          onCommit={(raw) => commitPlanilhaVlCompraReal(l.key, raw)}
                                          mask={currencyDigitsToFormatted}
                                          commitOnChange
                                          placeholder="0,00"
                                          title={PLANILHA_ANALITICA_TOOLTIP.vlCompraRealInsumo}
                                          inputMode="numeric"
                                          className={`${inputGradeMoedaCls} text-right`}
                                        />
                                      </div>
                                    </td>
                                    <td
                                      className={`px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700`}
                                    >
                                      {custoCompraR !== null ? (
                                        <MoedaCelula valor={custoCompraR} />
                                      ) : '—'}
                                    </td>
                                    <td
                                      className={`px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                        levantamentoCondIn ||
                                        'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {pctLevIn !== undefined && Number.isFinite(pctLevIn) ? (
                                        <span>{`${pctLevIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td
                                      className={`px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                        valorTotalCondIn || 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {pctFatIn !== undefined && Number.isFinite(pctFatIn) ? (
                                        <span>{`${pctFatIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td
                                      className="px-3 py-2.5 text-sm text-center tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      {pctCvpIn !== undefined && Number.isFinite(pctCvpIn) ? (
                                        <span>{`${pctCvpIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="border-l border-gray-200 dark:border-gray-700 p-0">
                                      <FdCampoLocal
                                        committedValue={fichaDemandaObservacoes[l.key] ?? ''}
                                        onCommit={(raw) => commitFichaDemandaObservacao(l.key, raw)}
                                        placeholder="Adicionar observação..."
                                        className={`${inputGradeCls} text-left`}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                              <TabelaJanelaSpacer height={janelaFd.bottomPad} colSpan={19} />
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
                            onClick={exportarPlanilhaAnalitica}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                            title={PLANILHA_ANALITICA_TOOLTIP.exportPlanilha}
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
                        </>
                    )}
                  </div>
                )}


                {!loadingFromApi && orcamentoViewTab === 'cronograma' && (
                  linhasCronograma.length === 0 ? (
                    <OrcamentoSecaoVazia
                      titulo="Cronograma vazio"
                      texto="Adicione serviços na aba Orçamento para planejar prazos e acompanhar o andamento da obra."
                      Icon={Calendar}
                      onIrOrcamento={() => {
                        if (cronogramaOnly && embeddedContractId && orcamentoAtivoId) {
                          router.push(
                            `/ponto/contratos/${embeddedContractId}/orcamento/${orcamentoAtivoId}`
                          );
                          return;
                        }
                        setOrcamentoViewTab('montagem');
                      }}
                    />
                  ) : (
                    <OrcamentoCronogramaPainel
                      linhas={linhasCronograma}
                      cronograma={cronograma}
                      onChange={setCronograma}
                      centroCustoId={centroCustoId}
                      orcamentoId={orcamentoAtivoId}
                      dataInicioObra={meta.dataAbertura}
                      dataFimObra={dataFimOrcamento}
                      onDataFimObraChange={(dataEnvio) =>
                        setMeta((m) => ({ ...m, dataEnvio }))
                      }
                      onExport={exportarCronogramaExcel}
                    />
                  )
                )}

                {!loadingFromApi && !abaPesadaPendente && orcamentoViewTab === 'memorial' && !memorialDisponivel && (
                  <OrcamentoSecaoVazia
                    titulo="Memória de cálculo não disponível"
                    texto="Este orçamento veio de uma planilha: as quantidades já estão na importação e não há levantamento por dimensões nesta aba. Para editar a grade, use Orçamento; para custos e compras, Orçamento analítico e Ficha de demanda."
                    Icon={Calculator}
                    onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                  />
                )}

                {!loadingFromApi && !abaPesadaPendente && orcamentoViewTab === 'memorial' && memorialDisponivel && (
                  <div className="space-y-5">
                    {itensCalculados.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Memória de cálculo vazia"
                        texto="Adicione itens na aba Orçamento para editar medições por dimensão e exportar a memória em planilha."
                        Icon={Calculator}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                      <div className="space-y-8">
                        {itensMemoriaCalculoLista.map((row, rowIdx) => (
                          <section key={row.key} id={`memorial-medicoes-${row.key}`} className="scroll-mt-6">
                            <OrcamentoMedicaoPainel
                              rowKey={row.key}
                              tipoUnidade={row.tipoUnidade}
                              itemRotulo={
                                rotuloItemComposicaoPorKey.get(row.key) ?? String(rowIdx + 1)
                              }
                              itemDescricao={row.item.descricao || ''}
                              unidadeMedida={unidadeComposicaoParaExibicao(row.unidadeComposicao, row.tipoUnidade)}
                              quantidadeUn={row.quantidade}
                              quantidadeUnReadOnly={false}
                              onQuantidadeUnChange={n => setQuantidadeItem(row.key, n)}
                              modoContagemLista={meta.usarMemoriaCalculo === true}
                              onAddLinhaContagem={apos => addLinhaContagem(row.key, apos)}
                              onUpdateLinhaContagem={(idx, campo, valor) =>
                                updateLinhaContagem(row.key, idx, campo, valor)
                              }
                              onRemoveLinhaContagem={idx => removeLinhaContagem(row.key, idx)}
                              dim={
                                dimensoesPorItem[row.key] ?? {
                                  tipoUnidade: row.tipoUnidade,
                                  linhas: []
                                }
                              }
                              ehCargaEntulho={ehComposicaoCargaEntulho(row.item.descricao)}
                              draftCalc={draftCalc}
                              setDraftCalc={setDraftCalc}
                              handleCalcChange={handleCalcChange}
                              handleCalcBlur={handleCalcBlur}
                              updateLinhaMedicao={updateLinhaMedicao}
                              updateRotuloColunaMedicao={(campo, rotulo) =>
                                updateRotuloColunaMedicao(row.key, campo, rotulo)
                              }
                              addLinhaMedicao={addLinhaMedicao}
                              addLinhaCabecalhoSecaoMedicao={addLinhaCabecalhoSecaoMedicao}
                              removeLinhaMedicao={removeLinhaMedicao}
                            />
                          </section>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!loadingFromApi && orcamentoViewTab === 'montagem' && (
                <div className="space-y-6">
                {subtitulosAdicionados.length === 0 && !loadingFromApi && (
                  <div role="status" className={ORCAMENTO_SECAO_VAZIA_SHELL}>
                    <div className={`mb-5 ${ORCAMENTO_ICON_SOFT_BOX}`}>
                      <ClipboardList className={ORCAMENTO_ICON_SOFT_GLYPH} aria-hidden />
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                      Orçamento ainda sem itens
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      Importe um orçamento do Orçafascio pela lista ou crie o primeiro serviço para montar a estrutura.
                    </p>
                    <button
                      type="button"
                      onClick={() => abrirModalNovoTituloViaMenu()}
                      className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-900/15 transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    >
                      <Plus className="h-4 w-4 shrink-0" aria-hidden />
                      Criar primeiro serviço
                    </button>
                  </div>
                )}

                {subtitulosAdicionados.length > 0 && (
                  <>
                    {itensSelecionadosMontagem.size > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={apagarItensSelecionadosMontagem}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Apagar ({itensSelecionadosMontagem.size})
                        </button>
                      </div>
                    )}
                    <div
                      ref={montagemOrcamentoTableRef}
                      className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    >
                      <table className={`min-w-[1580px] w-full border-collapse text-sm ${gradeTableCls}`}>
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                          <tr className={gradeTableRowTrCls}>
                            <th className="w-12 min-w-[3rem] px-2 py-2.5 text-center">
                              <div className="flex justify-center">
                                <TableCheckbox
                                  checked={todosItensMontagemSelecionados}
                                  indeterminate={algumItemMontagemSelecionado && !todosItensMontagemSelecionados}
                                  onChange={checked => {
                                    if (checked) {
                                      setItensSelecionadosMontagem(new Set(chavesSelecionaveisMontagem));
                                    } else {
                                      setItensSelecionadosMontagem(new Set());
                                    }
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  ariaLabel="Selecionar todas as composições do orçamento"
                                />
                              </div>
                            </th>
                            <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">
                              Item
                            </th>
                            <th className="w-[88px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Código</th>
                            <th className="w-[88px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Banco</th>
                            <th className="min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Descrição</th>
                            <th className="min-w-[5.5rem] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Unidade</th>
                            <th className="min-w-[6.5rem] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Quantidade</th>
                            <th className="min-w-[9.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">MÃO DE OBRA</th>
                            <th className="min-w-[9.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">MATERIAL</th>
                            <th className="min-w-[9.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Custo direto</th>
                            <th className="min-w-[10.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Valor com BDI</th>
                            <th className="min-w-[9.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Total</th>
                            <th className="w-[72px] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Peso</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                          {(() => {
                            const somarLinhasMontagem = (
                              rows: typeof itensCalculados
                            ): {
                              mo: number;
                              mat: number;
                              custoDir: number;
                              totalComBdi: number;
                              totalLinha: number;
                              pesoPct: number;
                            } => {
                              let mo = 0;
                              let mat = 0;
                              let custoDir = 0;
                              let totalComBdi = 0;
                              let totalLinha = 0;
                              for (const r of rows) {
                                mo += r.subMaoDeObra;
                                mat += r.subMaterial;
                                custoDir += r.total;
                                totalComBdi += r.totalComBdi;
                                totalLinha += r.total;
                              }
                              return {
                                mo,
                                mat,
                                custoDir,
                                totalComBdi,
                                totalLinha,
                                // Peso sobre o total geral com BDI (como no Orçafascio).
                                pesoPct: totalGeralComBdi > 0 ? (totalComBdi / totalGeralComBdi) * 100 : 0
                              };
                            };
                            const servicoNumero = new Map<string, number>();
                            let nextMain = 0;
                            for (const b of subtitulosAdicionados) {
                              if (!servicoNumero.has(b.servicoNome)) {
                                servicoNumero.set(b.servicoNome, ++nextMain);
                              }
                            }
                            return subtitulosAdicionados.map((bloco, blocoIndex) => {
                        const rowsDoBloco =
                          itensCalculadosPorBlocoNome.get(`${bloco.servicoNome}\0${bloco.subtituloNome}`) ?? [];
                        const rowsDoTitulo = itensCalculadosPorServicoNome.get(bloco.servicoNome) ?? [];
                        const resumoSubtitulo = somarLinhasMontagem(rowsDoBloco);
                        const resumoTitulo = somarLinhasMontagem(rowsDoTitulo);
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
                        const chavesGrupoTitulo = montagemChavesGrupoTitulo(bloco.servicoNome);
                        const chavesGrupoSubtitulo = montagemChavesGrupoSubtitulo(bloco.key);
                        const checkboxTitulo = estadoCheckboxGrupoMontagem(chavesGrupoTitulo);
                        const checkboxSubtitulo = estadoCheckboxGrupoMontagem(chavesGrupoSubtitulo);
                        const borderTitulo = 'border-l border-red-500/30 dark:border-red-900/40';
                        const borderSub = 'border-l border-gray-200 dark:border-gray-700';
                        const servicoIdLista = bloco.key.split('|')[0] || bloco.key;
                        const chaveTituloLista = `t:${servicoIdLista}`;
                        const chaveSubLista = `s:${bloco.key}`;
                        const tituloRecolhido = linhasListaRecolhidas.has(chaveTituloLista);
                        const subRecolhido = linhasListaRecolhidas.has(chaveSubLista);
                        return (
                          <React.Fragment key={bloco.key}>
                            {mostrarTituloServico && (
                            <tr
                              className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls} ${gradeTituloSubtituloRowTrCls}`}
                              data-orc-ctx-montagem="tituloServico"
                              data-servico-id={bloco.key.split('|')[0] ?? ''}
                              title="Clique com o botão direito para apagar este serviço do orçamento"
                            >
                              <td className="w-12 min-w-[3rem] px-2 py-2.5 align-middle">
                                <div className="flex justify-center">
                                  <TableCheckbox
                                    checked={checkboxTitulo.checked}
                                    indeterminate={checkboxTitulo.indeterminate}
                                    onChange={checked => alternarGrupoMontagem(chavesGrupoTitulo, checked)}
                                    onClick={e => e.stopPropagation()}
                                    ariaLabel={`Selecionar todas as composições de ${bloco.servicoNome}`}
                                  />
                                </div>
                              </td>
                              <td className={`w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-bold tabular-nums text-white ${borderTitulo}`}>
                                {main}
                              </td>
                              <td className={`px-3 py-2.5 align-middle text-center ${borderTitulo}`} />
                              <td className={`px-3 py-2.5 align-middle text-center ${borderTitulo}`} />
                              <td className={`min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 align-middle ${borderTitulo}`}>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      alternarRecolherLinhaLista(chaveTituloLista);
                                    }}
                                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/90 hover:bg-white/15"
                                    title={tituloRecolhido ? 'Expandir serviço' : 'Minimizar serviço'}
                                    aria-label={tituloRecolhido ? 'Expandir serviço' : 'Minimizar serviço'}
                                    aria-expanded={!tituloRecolhido}
                                  >
                                    <ChevronDown
                                      className={`h-4 w-4 transition-transform duration-200 ease-out ${tituloRecolhido ? '-rotate-90' : 'rotate-0'}`}
                                      aria-hidden
                                    />
                                  </button>
                                  <span className="block min-w-0 flex-1 leading-5 whitespace-normal break-words text-xs font-bold uppercase tracking-wide text-left text-white">
                                    {bloco.servicoNome}
                                  </span>
                                </div>
                              </td>
                              <td className={`px-2 py-2.5 text-center align-middle ${borderTitulo}`} />
                              <td className={`px-2 py-2.5 text-center align-middle ${borderTitulo}`} />
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderTitulo}`}>
                                <MoedaCelula valor={resumoTitulo.mo} className="text-sm text-white font-semibold" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderTitulo}`}>
                                <MoedaCelula valor={resumoTitulo.mat} className="text-sm text-white font-semibold" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderTitulo}`}>
                                <MoedaCelula valor={resumoTitulo.custoDir} className="text-sm text-white font-semibold" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderTitulo}`}>
                                <MoedaCelula valor={resumoTitulo.totalComBdi} className="text-sm text-white font-semibold" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderTitulo}`}>
                                <MoedaCelula valor={resumoTitulo.totalComBdi} className="text-sm text-white font-semibold" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-2 py-2.5 text-sm text-center align-middle text-white tabular-nums whitespace-nowrap font-semibold ${borderTitulo}`}>
                                {resumoTitulo.pesoPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                              </td>
                            </tr>
                            )}
                            <OrcListaAnimacaoGrupo aberto={!tituloRecolhido}>
                            <tr
                              className={`border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900 ${gradeTableRowTrCls} ${gradeTituloSubtituloRowTrCls}`}
                              data-orc-ctx-montagem="subtitulo"
                              data-bloco-key={bloco.key}
                            >
                              <td className="w-12 min-w-[3rem] px-2 py-2.5 align-middle">
                                <div className="flex justify-center">
                                  <TableCheckbox
                                    checked={checkboxSubtitulo.checked}
                                    indeterminate={checkboxSubtitulo.indeterminate}
                                    onChange={checked => alternarGrupoMontagem(chavesGrupoSubtitulo, checked)}
                                    onClick={e => e.stopPropagation()}
                                    ariaLabel={`Selecionar composições de ${mesmoTituloSubtitulo ? bloco.servicoNome : bloco.subtituloNome}`}
                                  />
                                </div>
                              </td>
                              <td className={`w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200 ${borderSub}`}>
                                {`${main}.${subIdx}`}
                              </td>
                              <td className={`px-3 py-2.5 align-middle text-center ${borderSub}`} />
                              <td className={`px-3 py-2.5 align-middle text-center ${borderSub}`} />
                              <td className={`min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 align-middle ${borderSub}`}>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      alternarRecolherLinhaLista(chaveSubLista);
                                    }}
                                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-700 hover:bg-black/5 dark:text-gray-200 dark:hover:bg-white/10"
                                    title={subRecolhido ? 'Expandir subtítulo' : 'Minimizar subtítulo'}
                                    aria-label={subRecolhido ? 'Expandir subtítulo' : 'Minimizar subtítulo'}
                                    aria-expanded={!subRecolhido}
                                  >
                                    <ChevronDown
                                      className={`h-4 w-4 transition-transform duration-200 ease-out ${subRecolhido ? '-rotate-90' : 'rotate-0'}`}
                                      aria-hidden
                                    />
                                  </button>
                                  <span className="block min-w-0 flex-1 leading-5 whitespace-normal break-words text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                    {mesmoTituloSubtitulo ? bloco.servicoNome : bloco.subtituloNome}
                                  </span>
                                </div>
                              </td>
                              <td className={`px-2 py-2.5 text-center align-middle ${borderSub}`} />
                              <td className={`px-2 py-2.5 text-center align-middle ${borderSub}`} />
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderSub}`}>
                                <MoedaCelula valor={resumoSubtitulo.mo} className="text-sm font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderSub}`}>
                                <MoedaCelula valor={resumoSubtitulo.mat} className="text-sm font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderSub}`}>
                                <MoedaCelula valor={resumoSubtitulo.custoDir} className="text-sm font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderSub}`}>
                                <MoedaCelula valor={resumoSubtitulo.totalComBdi} className="text-sm font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums ${borderSub}`}>
                                <MoedaCelula valor={resumoSubtitulo.totalComBdi} className="text-sm font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                              </td>
                              <td className={`px-2 py-2.5 text-sm text-center align-middle text-gray-800 dark:text-gray-200 tabular-nums whitespace-nowrap font-semibold ${borderSub}`}>
                                {resumoSubtitulo.pesoPct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                              </td>
                            </tr>
                                  <OrcListaAnimacaoGrupo aberto={!tituloRecolhido && !subRecolhido}>
                                  {rowsDoBloco.map((row, itemIdx) => {
                                    const usaDimensoes = !!row.dimensoes?.linhas?.length;
                                    const dim = dimensoesPorItem[row.key] || { tipoUnidade: 'm3' as const, linhas: [] };
                                    const tipoAuto = inferirTipoUnidadePorDimensao(dim.linhas);
                                    const pesoPctOrcamento =
                                      totalGeralComBdi > 0 ? (row.totalComBdi / totalGeralComBdi) * 100 : 0;
                                    return (
                                    <React.Fragment key={row.key}>
                                    <tr
                                      className={`border-b border-gray-100/90 bg-white hover:bg-gray-50/90 dark:border-gray-700/90 dark:bg-gray-800 dark:hover:bg-gray-800/95 ${gradeTableRowTrCls}`}
                                      data-orc-ctx-montagem="composicao"
                                      data-item-key={row.key}
                                    >
                                      <td className="w-12 min-w-[3rem] px-2 py-2.5 align-middle">
                                        <div className="flex justify-center">
                                          <TableCheckbox
                                            checked={itensSelecionadosMontagem.has(row.key)}
                                            onChange={checked => {
                                              setItensSelecionadosMontagem(prev => {
                                                const next = new Set(prev);
                                                if (checked) next.add(row.key);
                                                else next.delete(row.key);
                                                return next;
                                              });
                                            }}
                                            onClick={e => e.stopPropagation()}
                                            ariaLabel={`Selecionar composição ${row.item.descricao}`}
                                          />
                                        </div>
                                      </td>
                                      <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-xs font-medium tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                        {`${main}.${subIdx}.${itemIdx + 1}`}
                                      </td>
                                      <td className="px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 align-middle text-center border-l border-gray-200 dark:border-gray-700">{row.item.codigo}</td>
                                      <td className="px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 align-middle text-center border-l border-gray-200 dark:border-gray-700">{nomeBancoParaExibicao(row.item.banco)}</td>
                                      <td className="min-w-[260px] max-w-[min(520px,55vw)] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 align-middle border-l border-gray-200 dark:border-gray-700">
                                        <div className="whitespace-normal break-words">{row.item.descricao}</div>
                                      </td>
                                      <td className="px-2 py-2.5 text-center align-middle border-l border-gray-200 dark:border-gray-700">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                          {unidadeComposicaoParaExibicao(
                                            row.unidadeComposicao,
                                            usaDimensoes ? tipoAuto : 'un'
                                          )}
                                        </span>
                                      </td>
                                      <td className={`text-center align-middle tabular-nums border-l border-gray-200 dark:border-gray-700 ${row.tipoUnidade !== 'un' || meta.usarMemoriaCalculo != null ? 'px-2 py-2.5' : 'p-0'}`}>
                                        {row.tipoUnidade !== 'un' || meta.usarMemoriaCalculo != null ? (
                                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                        ) : (
                                          <FdCampoLocal
                                            committedValue={
                                              row.quantidade === 0
                                                ? ''
                                                : row.quantidade.toLocaleString('pt-BR', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 4
                                                  })
                                            }
                                            onCommit={raw =>
                                              setQuantidadeItem(row.key, Math.max(0, parseMedicaoBlurNumber(raw) ?? 0))
                                            }
                                            inputMode="decimal"
                                            placeholder="0"
                                            className={`${inputGradeCls} text-center tabular-nums`}
                                          />
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.maoDeObraUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.materialUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.precoUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.precoUnitarioComBdi} className="text-sm" />
                                      </td>
                                      <td className="px-3 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.totalComBdi} className="text-sm font-semibold" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-2 py-2.5 text-sm text-center align-middle text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap border-l border-gray-200 dark:border-gray-700">
                                        {pesoPctOrcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                      </td>
                                    </tr>
                                    </React.Fragment>
                                    );
                                  })}
                                  </OrcListaAnimacaoGrupo>
                            </OrcListaAnimacaoGrupo>
                          </React.Fragment>
                        );
                      });
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {menuCtxMontagem && (
                      <ActionMenuOverlay
                        open
                        onClose={() => setMenuCtxMontagem(null)}
                        top={menuCtxMontagem.top}
                        left={menuCtxMontagem.left}
                        panelClassName="w-56 py-1"
                      >
                            {menuCtxMontagem.kind === 'composicao' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60"
                                onClick={() => {
                                  setMenuCtxMontagem(null);
                                  abrirModalNovoTituloViaMenu();
                                }}
                              >
                                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                Adicionar título
                              </button>
                            )}
                            {menuCtxMontagem.kind === 'composicao' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60"
                                onClick={() => {
                                  const parsedItem = parseItemKeyOrcamento(menuCtxMontagem.composicaoKey);
                                  const parsedBloco = parsedItem ? parseBlocoKeyOrcamento(parsedItem.blocoKey) : null;
                                  const servicoId = parsedBloco?.servicoId ?? null;
                                  setMenuCtxMontagem(null);
                                  if (!servicoId) {
                                    toast.error('Não foi possível identificar o título para incluir o subtítulo.');
                                    return;
                                  }
                                  abrirModalNovoSubtituloViaMenu(servicoId);
                                }}
                              >
                                <ListPlus className="h-4 w-4 shrink-0" aria-hidden />
                                Adicionar subtítulo
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => {
                                if (menuCtxMontagem.kind === 'tituloServico') {
                                  if (
                                    typeof window !== 'undefined' &&
                                    !window.confirm(
                                      'Remover este serviço inteiro do orçamento? Todos os subtítulos e composições dele serão retirados.'
                                    )
                                  ) {
                                    setMenuCtxMontagem(null);
                                    return;
                                  }
                                  removerTituloServicoDoOrcamento(menuCtxMontagem.servicoId);
                                } else if (menuCtxMontagem.kind === 'subtitulo') {
                                  removeSubtituloDoOrcamento(menuCtxMontagem.blocoKey);
                                } else {
                                  removerItemComposicaoDoOrcamento(menuCtxMontagem.composicaoKey);
                                }
                                setMenuCtxMontagem(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                              Apagar
                            </button>
                      </ActionMenuOverlay>
                    )}

                  </>
                )}
                </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>

        {orcamentoAtivoId && !cronogramaOnly && subtitulosAdicionados.length > 0 && (
          <>
            <div className="h-16 shrink-0" aria-hidden />
            <div
              className="fixed bottom-0 right-0 z-40 border-t border-gray-200 bg-white/95 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95 left-0 lg:left-[var(--orc-footer-left,5rem)]"
              style={
                {
                  '--orc-footer-left': `${barraTotaisSidebarLeftPx}px`
                } as React.CSSProperties
              }
              role="status"
              aria-label="Totais do orçamento"
            >
              <div className="flex items-center justify-between gap-4 px-3 py-2.5 sm:px-5 lg:px-8">
                <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-2 sm:gap-x-10">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Orçamento
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums tracking-tight text-gray-900 dark:text-gray-100 sm:text-base whitespace-nowrap">
                      {formatarBRLExport(resumoFinanceiro.totalComDesconto)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {`BDI (${(resumoFinanceiro.bdiPct * 100).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}%)`}
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums tracking-tight text-gray-900 dark:text-gray-100 sm:text-base whitespace-nowrap">
                      {formatarBRLExport(resumoFinanceiro.valorBdi)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums tracking-tight text-gray-900 dark:text-gray-100 sm:text-base whitespace-nowrap">
                      {formatarBRLExport(resumoFinanceiro.totalComDescontoEBdi)}
                    </p>
                  </div>
                  <div
                    className="hidden h-8 w-px shrink-0 self-center bg-gray-200 dark:bg-gray-600 sm:block"
                    aria-hidden
                  />
                  <div
                    className="min-w-0"
                    title={
                      fichaDemandaProgresso.total === 0
                        ? 'Sem insumos na ficha de demanda'
                        : `Ficha de demanda: ${fichaDemandaProgresso.filled} de ${fichaDemandaProgresso.total} insumos preenchidos (qtd. compra + valor unit. real)`
                    }
                  >
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        fichaDemandaProgresso.completa
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      FD
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-bold tabular-nums tracking-tight sm:text-base whitespace-nowrap ${
                        fichaDemandaProgresso.completa
                          ? 'text-green-700 dark:text-green-300'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {fichaDemandaProgresso.pct}%
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {orcamentoVeioOrcafascio && (
                    <button
                      type="button"
                      onClick={() => void atualizarOrcamentoOrcafascio()}
                      disabled={isAtualizandoOrcafascio || !orcamentoAtivoId}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 dark:focus-visible:ring-offset-gray-900"
                      title="Atualizar composições do Orçafascio (inclui novas e remove as que saíram de lá)"
                      aria-label="Atualizar do Orçafascio"
                    >
                      {isAtualizandoOrcafascio ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={exportarOrcamentoCompleto}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 dark:focus-visible:ring-offset-gray-900"
                    title="Exportar Orçamento"
                    aria-label="Exportar Orçamento"
                  >
                    <Download className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={exportarCronogramaExcel}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600 dark:focus-visible:ring-offset-gray-900"
                    title="Exportar Cronograma"
                    aria-label="Exportar Cronograma"
                  >
                    <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void abrirEnvioFichaDemandaAprovacao()}
                    disabled={
                      fdAprovacaoPreparando || fdAprovacaoEnviando || !podeEnviarFdAprovacao
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-600 bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700 hover:border-red-700 active:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:border-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500 dark:hover:border-red-500 dark:active:bg-red-700 dark:focus-visible:ring-offset-gray-900"
                    title={
                      !fichaDemandaProgresso.completa
                        ? `Preencha a ficha de demanda (${fichaDemandaProgresso.pct}%)`
                        : statusAprovacaoAtivo === 'aguardando_aprovacao' ||
                            statusAprovacaoAtivo === 'aprovado'
                          ? 'Orçamento já enviado ou aprovado'
                          : 'Enviar para aprovação'
                    }
                    aria-label="Enviar para aprovação"
                  >
                    {fdAprovacaoPreparando ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </MainLayout>

      <FichaDemandaApprovalFormModal
        isOpen={fdAprovacaoModalOpen}
        onClose={() => {
          if (fdAprovacaoEnviando) return;
          setFdAprovacaoModalOpen(false);
          setFdAprovacaoInitialForm(null);
        }}
        initialForm={fdAprovacaoInitialForm}
        onSave={(form) => {
          void confirmarEnvioFichaDemandaAprovacao(form);
        }}
        isSaving={fdAprovacaoEnviando}
        title="Enviar ficha de demanda para aprovação"
      />

      {orcamentoExcluirConfirm && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (excluindoOrcamento) return;
              setOrcamentoExcluirConfirm(null);
            }}
          />
          <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden />
            </div>
            <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
              Excluir orçamento?
            </h3>
            <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja excluir o orçamento{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {orcamentoExcluirConfirm.nome}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={() => setOrcamentoExcluirConfirm(null)}
                disabled={excluindoOrcamento}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarExclusaoOrcamento()}
                disabled={excluindoOrcamento}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {excluindoOrcamento ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </AppModalOverlay>
      )}

      {/* ── Modal simples: Importar orçamento (select list) ───────────────── */}
      <Modal
        isOpen={orcafascioModalOpen && orcafascioModalSoloOrcamentos}
        onClose={() => {
          setOrcafascioModalOpen(false);
          setOrcafascioModalSoloOrcamentos(false);
          setOrcafascioImportSelectValue('');
          setOrcafascioImportDetalheModalOpen(false);
          setOrcafascioOrcamentoDetalhe(null);
          setOrcafascioOrcamentoComposicoes(null);
          setOrcafascioOrcamentoAnalitico(null);
          setOrcafascioOrcamentoLinhaCatalogo(null);
          setOrcafascioOrcamentoLinhaChave(null);
        }}
        title="Importar orçamento"
        size="md"
        contentOverflowVisible
      >
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Orçamento
        </label>
        {orcafascioOrcamentosLoading && orcafascioOrcamentos === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin text-red-600" aria-hidden />
            Carregando orçamentos do Orçafascio…
          </div>
        ) : (
          <SingleSelectSearchDropdown
            value={orcafascioImportSelectValue}
            onChange={(v) => {
              setOrcafascioImportSelectValue(v);
              setOrcafascioImportDetalheModalOpen(false);
              if (!v) {
                setOrcafascioOrcamentoDetalhe(null);
                setOrcafascioOrcamentoComposicoes(null);
                setOrcafascioOrcamentoAnalitico(null);
                setOrcafascioOrcamentoLinhaCatalogo(null);
                setOrcafascioOrcamentoLinhaChave(null);
                return;
              }
              const o = (orcafascioOrcamentos ?? []).find(
                (x) => idOrcamentoOrcafascioParaApi(x) === v || String(x.id) === v
              );
              if (o) void verDetalheOrcamentoOrcafascio(o, { force: true });
            }}
            options={orcafascioImportSelectOptions}
            allowEmpty
            emptyOptionLabel="Selecione o orçamento"
            placeholder={
              orcafascioOrcamentosLoading
                ? 'Carregando…'
                : orcafascioImportSelectOptions.length === 0
                  ? 'Nenhum orçamento disponível'
                  : 'Selecione o orçamento'
            }
            searchPlaceholder="Pesquisar por nome ou código..."
            emptyOptionsMessage="Nenhum orçamento encontrado"
            emptySearchMessage={
              orcafascioOrcamentosLoading
                ? 'Carregando lista completa… tente de novo em instantes'
                : 'Nenhum orçamento corresponde à busca'
            }
            disabled={orcafascioOrcamentos === null}
            noFocusRing
            preferOpenDown
            listMaxHeight={280}
          />
        )}
        {orcafascioOrcamentosLoading && orcafascioOrcamentos !== null ? (
          <p className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Carregando lista completa do Orçafascio…
          </p>
        ) : null}
        {orcafascioImportSelectValue && orcafascioOrcamentoComposicoesLoading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregando composições do orçamento…
          </p>
        ) : null}
        {orcafascioOrcamentoDetalhe && !orcafascioOrcamentoComposicoesLoading ? (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {(orcafascioOrcamentoDetalhe.description as string) || 'Orçamento'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {(orcafascioOrcamentoDetalhe.code as string) || '—'}
                {' · '}
                {(orcafascioOrcamentoComposicoes?.length ?? 0).toLocaleString('pt-BR')} composição
                {(orcafascioOrcamentoComposicoes?.length ?? 0) === 1 ? '' : 'ões'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOrcafascioImportDetalheModalOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              title="Ver todos os dados"
              aria-label="Ver todos os dados do orçamento"
            >
              <Eye className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}

        {orcafascioOrcamentoDetalhe && !orcafascioOrcamentoComposicoesLoading ? (
          <div className="mt-4 space-y-4">
            <Checkbox
              checked={orcafascioImportUsarMemoria}
              onChange={setOrcafascioImportUsarMemoria}
              label="Usar memória de cálculo"
            />
            <div>
              <p className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Arredondamento
              </p>
              <SegmentedControl
                aria-label="Arredondamento"
                value={orcafascioImportModoArredondamento}
                onChange={setOrcafascioImportModoArredondamento}
                className="h-auto w-full rounded-xl border border-gray-200 bg-gray-100/80 p-1 dark:border-gray-700 dark:bg-gray-800/70"
                pillClassName="rounded-lg bg-red-600 shadow-sm top-1 bottom-1"
                buttonClassName="flex-1 px-2 py-1.5 text-xs sm:text-sm"
                activeButtonClassName="font-semibold text-white"
                inactiveButtonClassName="font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                options={[
                  { value: 'truncar', label: 'Truncar' },
                  { value: 'arredondar', label: 'Arredondar' },
                  { value: 'nenhum', label: 'Não arredondar' },
                ]}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              if (isImportandoOrcamento) return;
              setOrcafascioModalOpen(false);
              setOrcafascioModalSoloOrcamentos(false);
              setOrcafascioImportSelectValue('');
              setOrcafascioImportDetalheModalOpen(false);
              setOrcafascioOrcamentoDetalhe(null);
              setOrcafascioOrcamentoComposicoes(null);
              setOrcafascioOrcamentoAnalitico(null);
              setOrcafascioOrcamentoLinhaCatalogo(null);
              setOrcafascioOrcamentoLinhaChave(null);
              setOrcafascioImportUsarMemoria(false);
              setOrcafascioImportModoArredondamento('truncar');
            }}
            disabled={isImportandoOrcamento}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void importarOrcamentoOrcafascioComoNovo()}
            disabled={
              isImportandoOrcamento ||
              !orcafascioImportSelectValue ||
              !orcafascioOrcamentoDetalhe ||
              orcafascioOrcamentoComposicoesLoading
            }
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
          >
            {isImportandoOrcamento ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Adicionando…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                Adicionar em Orçamentos
              </>
            )}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={
          orcafascioImportDetalheModalOpen &&
          Boolean(orcafascioOrcamentoDetalhe) &&
          orcafascioModalSoloOrcamentos
        }
        onClose={() => setOrcafascioImportDetalheModalOpen(false)}
        title="Detalhes do orçamento"
        size="5xl"
        elevated
      >
        {orcafascioOrcamentoDetalhe ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {(orcafascioOrcamentoDetalhe.description as string) || 'Orçamento'}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Código</p>
                  <p className="font-mono text-gray-900 dark:text-gray-100">
                    {(orcafascioOrcamentoDetalhe.code as string) || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Encargos</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {rotuloEncargosOrcafascio(
                      parseBoolFlagOrcafascio(
                        (orcafascioOrcamentoDetalhe as Record<string, unknown>).exempt
                      )
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Leis sociais</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {rotuloSimNaoOrcafascio(
                      parseBoolFlagOrcafascio(
                        (orcafascioOrcamentoDetalhe as Record<string, unknown>).social_charges
                      )
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">UF</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {String((orcafascioOrcamentoDetalhe as Record<string, unknown>).state || '').trim() || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Atualizado</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {orcafascioOrcamentoDetalhe.updated_at
                      ? new Date(orcafascioOrcamentoDetalhe.updated_at as string).toLocaleString('pt-BR')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Criado em</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {orcafascioOrcamentoDetalhe.created_at
                      ? new Date(orcafascioOrcamentoDetalhe.created_at as string).toLocaleString('pt-BR')
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Composições</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {(orcafascioOrcamentoComposicoes?.length ?? 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Linhas analíticas</p>
                  <p className="text-gray-900 dark:text-gray-100">
                    {(orcafascioOrcamentoAnalitico?.length ?? 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">ID Orçafascio</p>
                  <p className="break-all font-mono text-xs text-gray-900 dark:text-gray-100">
                    {idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe) || '—'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                Composições do orçamento
              </h3>
              {orcafascioOrcamentoComposicoesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin text-red-600" aria-hidden />
                  Carregando composições…
                </div>
              ) : !orcafascioOrcamentoComposicoes || orcafascioOrcamentoComposicoes.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma composição encontrada neste orçamento.
                </p>
              ) : (
                <>
                  <div className={cadastroListClasses.listSummary}>
                    <span>
                      Mostrando 1 a {orcafascioOrcamentoComposicoes.length} de{' '}
                      {orcafascioOrcamentoComposicoes.length}{' '}
                      {orcafascioOrcamentoComposicoes.length === 1 ? 'item' : 'itens'}
                    </span>
                  </div>
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={`${cadastroListClasses.table} min-w-[56rem]`}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>Item</th>
                          <th className={cadastroListClasses.th}>Tipo</th>
                          <th className={cadastroListClasses.th}>Base</th>
                          <th className={cadastroListClasses.th}>Código</th>
                          <th className={cadastroListClasses.th}>Descrição</th>
                          <th className={cadastroListClasses.th}>Unidade</th>
                          <th className={cadastroListClasses.th}>Versão</th>
                          <th className={cadastroListClasses.thNumeric}>Quantidade</th>
                          <th className={cadastroListClasses.thNumeric}>Unitário</th>
                          <th className={cadastroListClasses.thNumeric}>Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {orcafascioOrcamentoComposicoes.map((item, idx) => {
                          const row = item as Record<string, unknown>;
                          const descr = textoDescricaoOrcafascio(row);
                          const qty = valorNumericoOrcafascio(row.qty ?? row.quantity ?? null);
                          const total = valorNumericoOrcafascio(
                            row.total_price_plus_bdi ?? row.total_price ?? row.total ?? row.total_price_synthetic
                          );
                          const precUni =
                            valorNumericoOrcafascio(
                              row.price_plus_bdi ?? row.price_of_bdi ?? row.price ?? row.unit_price
                            ) ?? precoOrcafascioAnalitico(row);
                          return (
                            <tr key={(row.id as string) ?? `comp-${idx}`} className={getListTableRowClassName(false)}>
                              <td className={cadastroListClasses.tdMono}>{textoItemizacaoOrcafascio(row)}</td>
                              <td className={cadastroListClasses.td}>{textoKindOrcafascio(row)}</td>
                              <td className={cadastroListClasses.tdMono}>
                                {`${(row.base as string) || '—'}${row.base_locals ? `/${String(row.base_locals)}` : ''}`}
                              </td>
                              <td className={cadastroListClasses.tdMono}>{(row.code as string) || '—'}</td>
                              <td className={cadastroListClasses.tdTruncate}>
                                <span className="line-clamp-2">{descr || '—'}</span>
                              </td>
                              <td className={cadastroListClasses.tdMono}>
                                {(row.unity as string) || (row.unit as string) || '—'}
                              </td>
                              <td className={cadastroListClasses.tdMono}>{textoVersaoBaseOrcafascio(row)}</td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {qty != null ? qty.toLocaleString('pt-BR') : '—'}
                              </td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {precUni != null && precUni !== 0
                                  ? precUni.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                  : precUni === 0
                                    ? 'R$ 0,00'
                                    : '—'}
                              </td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {total != null && total !== 0
                                  ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                  : total === 0
                                    ? 'R$ 0,00'
                                    : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {importOrcamentoModalOpen && (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black bg-opacity-50">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isImportandoOrcamento) {
                setImportOrcamentoModalOpen(false);
                setImportOrcamentoModalFile(null);
              }
            }}
            aria-hidden
          />
          <div className="relative mx-4 max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importar planilha</h3>
              <button
                type="button"
                onClick={() => {
                  if (!isImportandoOrcamento) {
                    setImportOrcamentoModalOpen(false);
                    setImportOrcamentoModalFile(null);
                  }
                }}
                disabled={isImportandoOrcamento}
                className="rounded p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Baixe o modelo, preencha serviço, subtítulo e composições (ITEM, CÓDIGO, BANCO, DESCRIÇÃO e preços) e envie o Excel. Isso cria um orçamento novo neste contrato.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => baixarModeloOrcamentoPerfeitoXlsx()}
                  className="flex shrink-0 items-center space-x-2 rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Baixar Modelo</span>
                </button>
              </div>

              <div>
                <input
                  id="import-orcamento-modal-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
                      toast.error('Apenas arquivos .xlsx, .xls ou .csv');
                      return;
                    }
                    setImportOrcamentoModalFile(f);
                  }}
                />

                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setImportOrcamentoModalDragging(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    setImportOrcamentoModalDragging(false);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setImportOrcamentoModalDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) setImportOrcamentoModalFile(f);
                    else toast.error('Apenas arquivos .xlsx, .xls ou .csv');
                  }}
                  className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${
                  importOrcamentoModalDragging
                    ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/30'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
                }
                ${importOrcamentoModalFile ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
              `}
                >
                  {importOrcamentoModalFile ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center">
                        <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {importOrcamentoModalFile.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {(importOrcamentoModalFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportOrcamentoModalFile(null)}
                        className="text-xs text-red-600 underline hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remover arquivo
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center">
                        <div
                          className={`rounded-full p-4 transition-colors ${
                            importOrcamentoModalDragging
                              ? 'bg-red-100 dark:bg-red-900/40'
                              : 'bg-gray-100 dark:bg-gray-700'
                          }`}
                        >
                          <Upload
                            className={`h-10 w-10 ${
                              importOrcamentoModalDragging
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {importOrcamentoModalDragging
                            ? 'Solte o arquivo aqui'
                            : 'Arraste e solte o arquivo Excel aqui'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">ou</p>
                      </div>
                      <label
                        htmlFor="import-orcamento-modal-file"
                        className="inline-flex cursor-pointer items-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-red-700 hover:shadow-md dark:bg-red-700 dark:hover:bg-red-800"
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Escolher arquivo
                      </label>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Formatos aceitos: .xlsx, .xls ou .csv
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    if (!isImportandoOrcamento) {
                      setImportOrcamentoModalOpen(false);
                      setImportOrcamentoModalFile(null);
                    }
                  }}
                  disabled={isImportandoOrcamento}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarImportOrcamentoModal()}
                  disabled={isImportandoOrcamento || !importOrcamentoModalFile}
                  className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
                >
                  {isImportandoOrcamento ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Importando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Importar planilha</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </AppModalOverlay>
      )}

      <Modal
        isOpen={novoBlocoModalOpen}
        onClose={() => setNovoBlocoModalOpen(false)}
        title={novoBlocoModalMode === 'titulo' ? 'Adicionar serviço' : 'Adicionar novo subtítulo'}
        size="md"
        closeOnOverlayClick
      >
        <div className="space-y-4">
          {novoBlocoModalMode === 'titulo' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome do serviço
              </label>
              <input
                value={novoBlocoTituloNome}
                onChange={(e) => setNovoBlocoTituloNome(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/35 dark:focus:border-red-500 dark:focus:ring-red-500/30"
                placeholder="Ex.: CANTEIRO DE OBRAS"
                autoFocus
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subtítulo do serviço
            </label>
            <input
              value={novoBlocoSubtituloNome}
              onChange={(e) => setNovoBlocoSubtituloNome(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/35 dark:focus:border-red-500 dark:focus:ring-red-500/30"
              placeholder="Ex.: SERVIÇOS PRELIMINARES"
              autoFocus={novoBlocoModalMode === 'subtitulo'}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setNovoBlocoModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarNovoBlocoModal}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              Adicionar
            </button>
          </div>
        </div>
      </Modal>

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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de início</label>
              <DatePickerField
                value={editarDadosDraft.dataAbertura}
                onChange={(dataAbertura) => setEditarDadosDraft((p) => ({ ...p, dataAbertura }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
                aria-label="Data de início"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de fim</label>
              <DatePickerField
                value={editarDadosDraft.dataEnvio}
                onChange={(dataEnvio) => setEditarDadosDraft((p) => ({ ...p, dataEnvio }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
                aria-label="Data de fim"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável pelo orçamento</label>
              <SingleSelectSearchDropdown
                value={editarDadosDraft.responsavelOrcamento}
                onChange={(responsavelOrcamento) => setEditarDadosDraft((p) => ({ ...p, responsavelOrcamento }))}
                options={employeeSelectOptions}
                allowEmpty
                disabled={loadingEmployeeOptions}
                placeholder={loadingEmployeeOptions ? 'Carregando funcionários...' : 'Selecione o responsável'}
                searchPlaceholder="Pesquisar..."
                emptyOptionsMessage="Nenhum funcionário encontrado"
                noFocusRing
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desconto (%)</label>
              <input
                value={editarDadosDraft.descontoPercentual}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, descontoPercentual: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: 25,01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BDI (%)</label>
              <input
                value={editarDadosDraft.bdiPercentual}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, bdiPercentual: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: 28,35"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reajustes (%)</label>
                <button
                  type="button"
                  onClick={() =>
                    setEditarDadosDraft((p) => ({
                      ...p,
                      reajustes: [...(p.reajustes ?? []), { nome: `${(p.reajustes?.length ?? 0) + 1}º reajuste`, percentual: '' }]
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  + Adicionar reajuste
                </button>
              </div>
              <div className="space-y-2">
                {(editarDadosDraft.reajustes ?? []).map((r, idx) => (
                  <div key={`edit-reajuste-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_auto] gap-2">
                    <input
                      value={r.nome}
                      onChange={(e) =>
                        setEditarDadosDraft((p) => ({
                          ...p,
                          reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, nome: e.target.value } : rr))
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                      placeholder={`Reajuste ${idx + 1}`}
                    />
                    <input
                      value={r.percentual}
                      onChange={(e) =>
                        setEditarDadosDraft((p) => ({
                          ...p,
                          reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, percentual: e.target.value } : rr))
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                      placeholder="%"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditarDadosDraft((p) => ({
                          ...p,
                          reajustes: (p.reajustes ?? []).filter((_, i) => i !== idx)
                        }))
                      }
                      className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-300 hover:bg-red-50/60 dark:hover:bg-red-950/30 text-xs font-medium"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
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
        onClose={() => {
          if (!isCreatingOrcamento) {
            setNovoOrcamentoMetaOpen(false);
            setNovoOrcamentoStep(1);
          }
        }}
        title="Criar novo orçamento"
        size="xl"
        closeOnOverlayClick={!isCreatingOrcamento}
      >
        <div className="space-y-4">
          <div className="px-1 py-1">
            <div className="flex items-center justify-between">
              {[
                { id: 1 as const, label: 'Dados básicos', icon: FileText },
                { id: 2 as const, label: 'Financeiro', icon: Calculator },
                { id: 3 as const, label: 'Descrição', icon: ClipboardList }
              ].map((s, index, arr) => {
                const isActive = novoOrcamentoStep === s.id;
                const isCompleted = novoOrcamentoStep > s.id;
                const Icon = s.icon;
                return (
                  <React.Fragment key={s.id}>
                    <div className="flex items-center">
                      <div className="flex flex-col items-center transition-all duration-200">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                            isActive
                              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500 text-white shadow-sm'
                              : isCompleted
                              ? 'bg-green-500 dark:bg-green-600 border-green-500 dark:border-green-600 text-white'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </div>
                        <span
                          className={`mt-1.5 text-xs font-medium transition-colors duration-200 ${
                            isActive
                              ? 'text-red-600 dark:text-red-400'
                              : isCompleted
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                    </div>
                    {index < arr.length - 1 && (
                      <div
                        className={`flex-1 h-px mx-3 transition-all duration-200 ${
                          isCompleted
                            ? 'bg-green-500/90 dark:bg-green-400/90'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {novoOrcamentoStep === 1 && (
            <div className="space-y-6">
              <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dados básicos</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações iniciais do orçamento</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nome do orçamento *
                </label>
                <input
                  value={novoOrcamentoMetaDraft.nomeOrcamento}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, nomeOrcamento: e.target.value }))}
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Ex: Orçamento reforma bloco A"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">OS/Nº da pasta *</label>
                <input
                  value={novoOrcamentoMetaDraft.osNumeroPasta}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, osNumeroPasta: e.target.value }))}
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Ex: XX/2025 - Nº241"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Prazo de execução (dias)</label>
                <input
                  value={novoOrcamentoMetaDraft.prazoExecucaoDias}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, prazoExecucaoDias: e.target.value }))}
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Ex: 150"
                  inputMode="numeric"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data de início *</label>
                <DatePickerField
                  value={novoOrcamentoMetaDraft.dataAbertura}
                  onChange={(dataAbertura) => setNovoOrcamentoMetaDraft((p) => ({ ...p, dataAbertura }))}
                  placeholder="dd/mm/aaaa"
                  disabled={isCreatingOrcamento}
                  noFocusRing
                  aria-label="Data de início"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data de fim</label>
                <DatePickerField
                  value={novoOrcamentoMetaDraft.dataEnvio}
                  onChange={(dataEnvio) => setNovoOrcamentoMetaDraft((p) => ({ ...p, dataEnvio }))}
                  placeholder="dd/mm/aaaa"
                  disabled={isCreatingOrcamento}
                  noFocusRing
                  aria-label="Data de fim"
                />
              </div>
            </div>
            </div>
          )}

          {novoOrcamentoStep === 2 && (
            <div className="space-y-6">
              <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Financeiro</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Responsável, percentuais e reajustes</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Responsável pelo orçamento</label>
                  <SingleSelectSearchDropdown
                    value={novoOrcamentoMetaDraft.responsavelOrcamento}
                    onChange={(responsavelOrcamento) =>
                      setNovoOrcamentoMetaDraft((p) => ({ ...p, responsavelOrcamento }))
                    }
                    options={employeeSelectOptions}
                    allowEmpty
                    disabled={loadingEmployeeOptions || isCreatingOrcamento}
                    placeholder={loadingEmployeeOptions ? 'Carregando funcionários...' : 'Selecione o responsável'}
                    searchPlaceholder="Pesquisar..."
                    emptyOptionsMessage="Nenhum funcionário encontrado"
                    noFocusRing
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Desconto (%)</label>
                  <input
                    value={novoOrcamentoMetaDraft.descontoPercentual}
                    onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, descontoPercentual: e.target.value }))}
                    className={FORM_FIELD_INPUT_CLS}
                    placeholder="Ex: 25,01"
                    disabled={isCreatingOrcamento}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">BDI (%)</label>
                  <input
                    value={novoOrcamentoMetaDraft.bdiPercentual}
                    onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, bdiPercentual: e.target.value }))}
                    className={FORM_FIELD_INPUT_CLS}
                    placeholder="Ex: 28,35"
                    disabled={isCreatingOrcamento}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-4 dark:border-gray-700 dark:bg-gray-800/60">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reajustes (%)</label>
                  <button
                    type="button"
                    onClick={() =>
                      setNovoOrcamentoMetaDraft((p) => ({
                        ...p,
                        reajustes: [...(p.reajustes ?? []), { nome: `${(p.reajustes?.length ?? 0) + 1}º reajuste`, percentual: '' }]
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
                    disabled={isCreatingOrcamento}
                  >
                    + Adicionar reajuste
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {(novoOrcamentoMetaDraft.reajustes ?? []).map((r, idx) => (
                    <div key={`new-reajuste-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_auto] gap-2">
                      <input
                        value={r.nome}
                        onChange={(e) =>
                          setNovoOrcamentoMetaDraft((p) => ({
                            ...p,
                            reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, nome: e.target.value } : rr))
                          }))
                        }
                        className={FORM_FIELD_INPUT_CLS}
                        placeholder={`Reajuste ${idx + 1}`}
                        disabled={isCreatingOrcamento}
                      />
                      <input
                        value={r.percentual}
                        onChange={(e) =>
                          setNovoOrcamentoMetaDraft((p) => ({
                            ...p,
                            reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, percentual: e.target.value } : rr))
                          }))
                        }
                        className={FORM_FIELD_INPUT_CLS}
                        placeholder="%"
                        disabled={isCreatingOrcamento}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNovoOrcamentoMetaDraft((p) => ({
                            ...p,
                            reajustes: (p.reajustes ?? []).filter((_, i) => i !== idx)
                          }))
                        }
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                        disabled={isCreatingOrcamento}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {novoOrcamentoStep === 3 && (
            <div className="space-y-6">
              <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Descrição</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Detalhes complementares do orçamento</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Descrição *</label>
                <input
                  value={novoOrcamentoMetaDraft.descricao}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, descricao: e.target.value }))}
                  className={FORM_FIELD_INPUT_CLS}
                  placeholder="Ex: Manutenção geral da unidade"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-200">
                <p><strong>Nome:</strong> {novoOrcamentoMetaDraft.nomeOrcamento.trim() || '—'}</p>
                <p><strong>OS/Nº da pasta:</strong> {novoOrcamentoMetaDraft.osNumeroPasta || '—'}</p>
                <p><strong>Data de início:</strong> {formatDataBr(novoOrcamentoMetaDraft.dataAbertura)}</p>
                <p><strong>Data de fim:</strong> {formatDataBr(novoOrcamentoMetaDraft.dataEnvio || calcularDataFimOrcamento(novoOrcamentoMetaDraft.dataAbertura, novoOrcamentoMetaDraft.dataEnvio, novoOrcamentoMetaDraft.prazoExecucaoDias))}</p>
                <p><strong>Responsável:</strong> {novoOrcamentoMetaDraft.responsavelOrcamento || '—'}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setNovoOrcamentoMetaOpen(false);
                setNovoOrcamentoStep(1);
              }}
              disabled={isCreatingOrcamento}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
            >
              Cancelar
            </button>
            {novoOrcamentoStep > 1 && (
              <button
                type="button"
                onClick={() => setNovoOrcamentoStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                disabled={isCreatingOrcamento}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
              >
                Anterior
              </button>
            )}
            {novoOrcamentoStep < 3 ? (
              <button
                type="button"
                onClick={() => setNovoOrcamentoStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
                disabled={isCreatingOrcamento || !podeAvancarNovoOrcamento(novoOrcamentoStep)}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Próximo
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmarCriacaoNovoOrcamento}
                disabled={isCreatingOrcamento}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isCreatingOrcamento ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{isCreatingOrcamento ? 'Criando...' : 'Criar orçamento'}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </Modal>
    </ProtectedRoute>
  );
}
