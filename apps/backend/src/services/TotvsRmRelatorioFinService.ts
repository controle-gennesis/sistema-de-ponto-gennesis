import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import axios, { AxiosError } from 'axios';
import https from 'https';
import { isNaturezaExcludedFromContractPaidTotal } from '../constants/contractPaidNaturezaExclusions';

function normPathRel(p: string): string {
  return p.replace(/\/$/, '').trim();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Data em cell RM: texto ISO / dd/MM/yyyy ou serial Excel (~25569 dias desde 1899-12-30). */
export function parseTotvsRowDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = v;
    if (n > 25_000 && n < 600_000) {
      const ms = (n - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (
        !Number.isNaN(d.getTime()) &&
        d.getUTCFullYear() >= 1980 &&
        d.getUTCFullYear() < 2100
      ) {
        return d;
      }
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const day = Number(iso[3]);
    const h = Number(iso[4] ?? 12);
    const mi = Number(iso[5] ?? 0);
    const sec = Number(iso[6] ?? 0);
    const d = new Date(y, mo - 1, day, h, mi, sec);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  if (br) {
    const d = Number(br[1]);
    const mo = Number(br[2]);
    const y = Number(br[3]);
    const dt = new Date(y, mo - 1, d, 12, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function isoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function scoreDateColumn(key: string): number {
  const u = normHeaderKey(key);
  const c = u.replace(/\s/g, '');
  if (c.includes('DATAPAGAMENTO') || (u.includes('DATA') && u.includes('PAG'))) return 36;
  if (u.includes('DATA') && u.includes('LIQUID')) return 32;
  if (u.includes('DATA') && u.includes('LANC')) return 28;
  if (u.includes('DATA') && u.includes('VEN')) return 22;
  if (u.includes('DATA') && u.includes('EMISS')) return 20;
  if (u === 'DATA' || /^DATA\s/.test(u)) return 16;
  if (u.includes('DT ') || u.startsWith('DT_') || u.startsWith('DH_')) return 14;
  if (u.includes('DATA') || u.includes('DT ')) return 8;
  return 0;
}

function norm(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Valores de célula de CC no RM podem vir com NBSP; alinha com norm(). */
function normCcCell(s: string): string {
  return norm(s.replace(/[\u00A0\u2000-\u200B\uFEFF]/g, ' '));
}

/** Normaliza acentos para comparar nomes de colunas vindos do RM (ex.: DESCRIÇÃO). */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** NBSP e espaços unicode → espaço; acentos removidos; caixa e espaços colapsados (headers RM). */
function normHeaderKey(s: string): string {
  return stripAccents(s.replace(/[\u00A0\u2000-\u200B\uFEFF]/g, ' '))
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const SCHEMA_SCAN_ROWS = Math.min(
  5000,
  Math.max(50, Number(process.env.TOTVS_RM_SCHEMA_SCAN_ROWS) || 2000)
);

/** União ordenada das chaves presentes nas primeiras linhas (RM pode omitir chaves null no JSON). */
function allColumnKeys(rows: Record<string, unknown>[], maxRows: number): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const n = Math.min(rows.length, Math.max(1, maxRows));
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    for (const k of Object.keys(row)) {
      if (seen.has(k)) continue;
      seen.add(k);
      order.push(k);
    }
  }
  return order;
}

function rowKeysFromSample(rows: Record<string, unknown>[], exclude?: Set<string>): string[] {
  return allColumnKeys(rows, SCHEMA_SCAN_ROWS).filter((k) => !exclude?.has(k));
}

function rowsFromColumnsValues(o: Record<string, unknown>): Record<string, unknown>[] | null {
  const colsRaw = o.columns ?? o.Columns ?? o.COLUNAS ?? o.colunas;
  const valsRaw = o.values ?? o.Values ?? o.VALORES ?? o.dados ?? o.Dados;
  if (!Array.isArray(colsRaw) || !Array.isArray(valsRaw)) return null;
  if (!colsRaw.length) return [];
  const names = colsRaw.map((c) => String(c));
  const out: Record<string, unknown>[] = [];
  for (const row of valsRaw) {
    if (!Array.isArray(row)) continue;
    const rec: Record<string, unknown> = {};
    for (let i = 0; i < names.length; i++) rec[names[i]] = row[i];
    out.push(rec);
  }
  return out;
}

function parseMoneyBr(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,.-]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const decSep = lastComma > lastDot ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    const n = parseFloat(cleaned.replace(new RegExp(`\\${thouSep}`, 'g'), '').replace(decSep, '.'));
    return Number.isFinite(n) ? n : 0;
  }
  if (cleaned.includes(',')) {
    const n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(cleaned.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normalizeTotvsRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return [];
    if (typeof payload[0] === 'object' && payload[0] !== null && !Array.isArray(payload[0])) {
      return payload as Record<string, unknown>[];
    }
  }
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const key of ['data', 'Data', 'rows', 'Rows', 'result', 'Result']) {
      const arr = o[key];
      if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object' && arr[0] !== null) {
        return arr as Record<string, unknown>[];
      }
    }
    const fromCv = rowsFromColumnsValues(o);
    if (fromCv !== null && fromCv.length) return fromCv;
  }
  return [];
}

function scoreCcColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  let s = 0;
  if (compact === 'CODCENTRODECUSTO' || u === 'COD CENTRO DE CUSTO') s += 24;
  if (u === 'CODCCUSTO' || u === 'CODIGOCCUSTO') s += 20;
  if (u.includes('CCUSTO') && u.includes('COD')) s += 14;
  if (u.includes('CENTRO') && u.includes('CUSTO') && u.includes('COD')) s += 16;
  if (u.includes('CENTRO') && u.includes('CUSTO')) s += 12;
  if (u.includes('CCUSTO')) s += 10;
  if (u.includes('CUSTO') && u.includes('COD')) s += 8;
  if (u === 'CC' || u === 'CODCC') s += 5;
  return s;
}

function scoreValueColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  let s = 0;
  if (u.includes('VALOR') && u.includes('ORIGI')) s += 22;
  if (compact === 'VALORORIGI' || u === 'VALOR ORIGI') s += 22;
  if (u.includes('VALOR') && u.includes('PAGO')) s += 20;
  if (u.includes('VLRLIQUIDO') || u === 'VL_LIQUIDO') s += 18;
  if (u.includes('TOTAL') && u.includes('PAGO')) s += 16;
  if (u === 'VALOR' || u === 'VALORLAN' || u === 'VALORORIGINAL') s += 8;
  if (u.includes('VALOR')) s += 6;
  if (u.includes('PAGO') || u.includes('LIQUIDO')) s += 5;
  if (u.includes('TOTAL')) s += 4;
  if (u.includes('VL')) s += 3;
  return s;
}

function scoreNaturezaColumn(key: string): number {
  const u = normHeaderKey(key);
  const compact = u.replace(/\s/g, '');
  let s = 0;
  // Aliases comuns no RELATORIOFIN / consultas de caixa (RM)
  if (compact === 'NATUREZAFINANCEIRA' || u === 'NATUREZA FINANCEIRA') s += 32;
  if (u.includes('NATUREZA') && u.includes('FINANCEIRA')) s += 30;
  if (compact === 'CODIGONATUREZA' || (u.includes('CODIGO') && u.includes('NATUREZA'))) s += 28;
  if (u.includes('NATUREZA') && (u.includes('DESCR') || u.includes('DESC'))) s += 22;
  if (u === 'NATUREZA' || u === 'NATURAZA') s += 18;
  if (u.includes('NATUREZA')) s += 14;
  if (u.includes('CODNAT') || u.includes('COD_NATUREZ') || u.includes('CODNATUREZA')) s += 12;
  if (u.includes('NOMENAT') || u.includes('DESCNAT')) s += 10;
  if (u.includes('PLANO') && u.includes('CONT')) s += 6;
  return s;
}

function pickColumn(
  rows: Record<string, unknown>[],
  scorer: (k: string) => number,
  envOverride: string | undefined,
  excludeKeys?: Set<string>
): string | null {
  if (!rows.length) return null;
  const keys = rowKeysFromSample(rows, excludeKeys);
  const ex = (envOverride || '').trim();
  if (ex) {
    const exact = keys.find((k) => k === ex);
    if (exact) return exact;
    const exNorm = normHeaderKey(ex);
    const ci = keys.find((k) => normHeaderKey(k) === exNorm || k.toUpperCase() === ex.toUpperCase());
    if (ci) return ci;
  }
  const ranked = keys
    .map((k) => ({ k, score: scorer(k) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.k ?? null;
}

/** Natureza: aliases com espaço (ex.: "NATUREZA FINANCEIRA") + fallback por regex. */
function pickNaturezaColumn(
  rows: Record<string, unknown>[],
  excludeKeys: Set<string>
): string | null {
  const picked = pickColumn(rows, scoreNaturezaColumn, process.env.TOTVS_RM_NATUREZA_COLUMN, excludeKeys);
  if (picked) return picked;
  const keys = rowKeysFromSample(rows, excludeKeys);
  if (!keys.length) return null;
  const reNf = /\bnatureza\b.*\bfinanceira\b|\bfinanceira\b.*\bnatureza\b/i;
  const reCn = /\bcodigo\b.*\bnatureza\b|\bnatureza\b.*\bcodigo\b/i;
  const byDesc = keys.find((k) => reNf.test(stripAccents(k)));
  if (byDesc) return byDesc;
  const byCod = keys.find((k) => reCn.test(stripAccents(k)));
  return byCod || null;
}

/**
 * Após um trecho igual ao código de CC na célula, não pode vir dígito nem '.'
 * (evita que "102.01.01.01" case como filho de "102.01.01.01.034" via p.includes(c)).
 */
function codeFragmentBoundaryOk(before: string | undefined, after: string | undefined): boolean {
  const continuesCode = (ch: string | undefined) => ch !== undefined && ch !== '' && /[0-9.]/.test(ch);
  return !continuesCode(before) && !continuesCode(after);
}

const NAME_SUBSTR_MIN_LEN = Math.max(
  4,
  Math.min(20, Number(process.env.TOTVS_RM_CC_NAME_SUBSTR_MIN_LEN) || 7)
);

/**
 * Compara célula do RM com o CC do contrato (sem p.includes(c), que misturava CC pai/filho).
 * Se a coluna detectada for de código (ex.: COD CENTRO DE CUSTO), usa só o código do contrato.
 */
function ccColumnIsLikelyNumericCodeHeader(ccCol: string | null): boolean {
  if (!ccCol) return false;
  const u = normHeaderKey(ccCol);
  const compact = u.replace(/\s/g, '');
  if (compact === 'CODCENTRODECUSTO' || u === 'COD CENTRO DE CUSTO') return true;
  if (u === 'CODCCUSTO' || u === 'CODIGO CCUSTO' || u === 'CODIGOCCUSTO') return true;
  return (u.includes('COD') || u.includes('CODIGO')) && (u.includes('CCUSTO') || u.includes('CENTRO'));
}

function cellMatchesCostCenterCodeOnly(raw: unknown, code: string): boolean {
  const c = normCcCell(String(raw ?? ''));
  const nc = normCcCell(code).trim();
  if (!c || !nc) return false;
  if (c === nc) return true;
  if (nc.length < 3) return false;
  let from = 0;
  while ((from = c.indexOf(nc, from)) !== -1) {
    const before = from > 0 ? c[from - 1] : undefined;
    const after = from + nc.length < c.length ? c[from + nc.length] : undefined;
    if (codeFragmentBoundaryOk(before, after)) return true;
    from += 1;
  }
  if (c.startsWith(`${nc} `) || c.startsWith(`${nc}-`) || c.startsWith(`${nc}/`)) return true;
  return false;
}

function cellMatchesCostCenter(raw: unknown, code: string, name: string): boolean {
  const c = normCcCell(String(raw ?? ''));
  if (!c) return false;
  const nc = normCcCell(code).trim();
  const nn = normCcCell(name).trim();

  if (nc && c === nc) return true;
  if (nn && c === nn) return true;

  if (nc.length >= 3) {
    let from = 0;
    while ((from = c.indexOf(nc, from)) !== -1) {
      const before = from > 0 ? c[from - 1] : undefined;
      const after = from + nc.length < c.length ? c[from + nc.length] : undefined;
      if (codeFragmentBoundaryOk(before, after)) return true;
      from += 1;
    }
    if (c.startsWith(`${nc} `) || c.startsWith(`${nc}-`) || c.startsWith(`${nc}/`)) return true;
  }

  if (nn.length >= NAME_SUBSTR_MIN_LEN) {
    const delim = (ch: string | undefined) =>
      ch === undefined || ch === '' || /[\s\-/|,;]/.test(ch) || ch === '\u2013' || ch === '\u2014';
    let from = 0;
    while ((from = c.indexOf(nn, from)) !== -1) {
      const before = from > 0 ? c[from - 1] : undefined;
      const after = from + nn.length < c.length ? c[from + nn.length] : undefined;
      if (delim(before) && delim(after)) return true;
      from += 1;
    }
  }

  return false;
}

function cellMatchesCostCenterForRow(
  raw: unknown,
  code: string,
  name: string,
  ccHeader: string | null
): boolean {
  const forceCode =
    String(process.env.TOTVS_RM_CC_MATCH_CODE_ONLY || '')
      .trim()
      .toLowerCase() === '1' ||
    String(process.env.TOTVS_RM_CC_MATCH_CODE_ONLY || '')
      .trim()
      .toLowerCase() === 'true' ||
    String(process.env.TOTVS_RM_CC_MATCH_CODE_ONLY || '')
      .trim()
      .toLowerCase() === 'yes';
  const nc = normCcCell(code).trim();
  if (forceCode || (ccColumnIsLikelyNumericCodeHeader(ccHeader) && nc.length >= 3)) {
    return cellMatchesCostCenterCodeOnly(raw, code);
  }
  return cellMatchesCostCenter(raw, code, name);
}

function scoreStatusColumn(key: string): number {
  const u = normHeaderKey(key);
  if (u === 'STATUS') return 24;
  if (u.includes('STATUS')) return 16;
  return 0;
}

/** Valores de STATUS permitidos na soma (ex.: PAGAMENTO), separados por vírgula; vazio = sem filtro. */
function parseStatusIncludeNormSet(): Set<string> | null {
  const raw = String(process.env.TOTVS_RM_STATUS_INCLUDE || '').trim();
  if (!raw) return null;
  const set = new Set<string>();
  for (const part of raw.split(/[,;]/)) {
    const p = norm(part);
    if (p) set.add(p);
  }
  return set.size ? set : null;
}

export interface TotvsRelatorioFinNaturezaRow {
  natureza: string;
  total: number;
  count: number;
}

export interface TotvsRmPaidLineDetail {
  valor: number;
  natureza: string;
  dataISO: string | null;
}

export interface TotvsRmPaidByCalendarMonth {
  year: number;
  month: number;
  total: number;
  count: number;
  lines: TotvsRmPaidLineDetail[];
}

export interface TotvsRmPaidUndatedBucket {
  total: number;
  count: number;
  lines: TotvsRmPaidLineDetail[];
}

export interface TotvsRelatorioFinSumResult {
  total: number;
  matchedRowCount: number;
  totalRowCount: number;
  ccColumn: string | null;
  valueColumn: string | null;
  naturezaColumn: string | null;
  totalsByNatureza: TotvsRelatorioFinNaturezaRow[];
  /** Amostra dos valores da coluna de CC nas linhas que entraram na soma (conferência do filtro). */
  sampleCcValuesMatched: string[];
  /** Datas via coluna detectada (ou TOTVS_RM_DATE_COLUMN); sem data → paidUndated. */
  dateColumn: string | null;
  paidByCalendarMonth: TotvsRmPaidByCalendarMonth[];
  paidUndated: TotvsRmPaidUndatedBucket | null;
  /**
   * Soma mensal para a linha «Solicitações» no contrato: filtra só pelo CC do contrato + data + valor,
   * sem excluir por natureza operacional (diferente do Total Pago).
   * Opcionalmente usa TOTVS_RM_SOLICITACOES_PATH (outra consulta SQL no RM).
   */
  solicitacoesByCalendarMonth: TotvsRmPaidByCalendarMonth[];
  solicitacoesUndated: TotvsRmPaidUndatedBucket | null;
  solicitacoesMatchedRowCount: number;
  solicitacoesDateColumn: string | null;
  solicitacoesValueColumn: string | null;
  solicitacoesCcColumn: string | null;
}

export class TotvsRmRelatorioFinService {
  isConfigured(): boolean {
    const base = (process.env.TOTVS_RM_BASE_URL || '').trim();
    const bearer = (process.env.TOTVS_RM_BEARER_TOKEN || '').trim();
    const user = (process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim();
    const pass = (process.env.TOTVS_RM_PASSWORD || '').trim();
    return !!base && (!!bearer || (!!user && !!pass));
  }

  private defaultRelatorioPath(): string {
    return (
      (process.env.TOTVS_RM_RELATORIOFIN_PATH || '').trim() ||
      '/api/framework/v1/consultaSQLServer/RealizaConsulta/RELATORIOFIN/0/F'
    );
  }

  private buildUrlFromPath(pathRel: string): string {
    const base = (process.env.TOTVS_RM_BASE_URL || '').replace(/\/$/, '');
    const p = pathRel.startsWith('/') ? pathRel : `/${pathRel}`;
    return `${base}${p}`;
  }

  private authHeader(): string {
    const user = (process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim();
    const pass = (process.env.TOTVS_RM_PASSWORD || '').trim();
    if (!user || !pass) return '';
    return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  }

  async fetchRowsForPath(pathRel: string): Promise<Record<string, unknown>[]> {
    const url = this.buildUrlFromPath(pathRel);
    const bearer = (process.env.TOTVS_RM_BEARER_TOKEN || '').trim();
    const rejectUnauthorized =
      String(process.env.TOTVS_RM_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
    const httpsAgent = new https.Agent({ rejectUnauthorized });
    const timeout = Number(process.env.TOTVS_RM_TIMEOUT_MS) || 120000;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`;
    } else {
      const basic = this.authHeader();
      if (!basic) {
        throw new Error('TOTVS_RM: configure TOTVS_RM_BEARER_TOKEN ou TOTVS_RM_USER + TOTVS_RM_PASSWORD');
      }
      headers.Authorization = basic;
    }

    const res = await axios.get<unknown>(url, {
      headers,
      timeout,
      httpsAgent,
      validateStatus: () => true
    });

    if (res.status < 200 || res.status >= 300) {
      const msg = typeof res.data === 'string' ? res.data.slice(0, 500) : JSON.stringify(res.data).slice(0, 500);
      throw new Error(`RM consulta HTTP ${res.status}: ${msg}`);
    }

    return normalizeTotvsRows(res.data);
  }

  async fetchRelatorioRows(): Promise<Record<string, unknown>[]> {
    return this.fetchRowsForPath(this.defaultRelatorioPath());
  }

  async sumForCostCenterAsync(code: string, name: string): Promise<TotvsRelatorioFinSumResult> {
    const rows = await this.fetchRelatorioRows();
    if (!rows.length) {
      return {
        total: 0,
        matchedRowCount: 0,
        totalRowCount: 0,
        ccColumn: null,
        valueColumn: null,
        naturezaColumn: null,
        totalsByNatureza: [],
        sampleCcValuesMatched: [],
        dateColumn: null,
        paidByCalendarMonth: [],
        paidUndated: null,
        solicitacoesByCalendarMonth: [],
        solicitacoesUndated: null,
        solicitacoesMatchedRowCount: 0,
        solicitacoesDateColumn: null,
        solicitacoesValueColumn: null,
        solicitacoesCcColumn: null
      };
    }

    const ccCol = pickColumn(rows, scoreCcColumn, process.env.TOTVS_RM_CC_COLUMN);
    const ccExclude = ccCol ? new Set<string>([ccCol]) : undefined;
    const valCol = pickColumn(rows, scoreValueColumn, process.env.TOTVS_RM_VALUE_COLUMN, ccExclude);
    const natCol = pickNaturezaColumn(rows, new Set([ccCol, valCol].filter(Boolean) as string[]));

    const statusAllowed = parseStatusIncludeNormSet();
    const excludeForStatus = new Set([ccCol, valCol, natCol].filter(Boolean) as string[]);
    const statusCol =
      statusAllowed && statusAllowed.size > 0
        ? pickColumn(rows, scoreStatusColumn, process.env.TOTVS_RM_STATUS_COLUMN, excludeForStatus)
        : null;
    if (statusAllowed && statusAllowed.size > 0 && !statusCol) {
      console.warn(
        '[TOTVS RM RELATORIOFIN] TOTVS_RM_STATUS_INCLUDE definido, mas coluna STATUS não detectada. Defina TOTVS_RM_STATUS_COLUMN. Somando sem filtro de STATUS.'
      );
    }

    if (!valCol) {
      throw new Error(
        'RELATORIOFIN: não foi possível detectar coluna de valor. Defina TOTVS_RM_VALUE_COLUMN com o nome exato da coluna.'
      );
    }

    const LINE_CAP = Math.min(
      500,
      Math.max(
        20,
        Number(
          String(process.env.TOTVS_RM_PAID_LINES_CAP_PER_MONTH || '')
            .trim()
            .replace(',', '.')
        ) || 200
      )
    );

    const dateExcludeKeys = new Set<string>(
      [ccCol, valCol, natCol, statusCol].filter(Boolean) as string[]
    );
    const dateCol = pickColumn(rows, scoreDateColumn, process.env.TOTVS_RM_DATE_COLUMN, dateExcludeKeys);

    let matchedRowCount = 0;
    let total = 0;
    const naturezaMap = new Map<string, { total: number; count: number }>();
    const sampleCc = new Set<string>();

    type MonthAgg = { total: number; count: number; lines: TotvsRmPaidLineDetail[] };
    const byYm = new Map<string, MonthAgg>();
    let undatedAgg: MonthAgg = { total: 0, count: 0, lines: [] };

    const pushLimited = (bucket: MonthAgg, line: TotvsRmPaidLineDetail) => {
      if (bucket.lines.length < LINE_CAP) bucket.lines.push(line);
    };

    const accumulateIncluded = (row: Record<string, unknown>) => {
      const nkRaw = natCol ? String(row[natCol] ?? '').trim() : '';
      const natLabel = nkRaw === '' ? '—' : nkRaw;
      if (isNaturezaExcludedFromContractPaidTotal(natLabel)) return;

      matchedRowCount += 1;
      const v = parseMoneyBr(row[valCol]);
      total += v;
      if (ccCol) {
        const rawCc = String(row[ccCol] ?? '').trim();
        if (rawCc && sampleCc.size < 24) sampleCc.add(rawCc);
      }
      if (natCol) {
        const cur = naturezaMap.get(natLabel) ?? { total: 0, count: 0 };
        cur.total += v;
        cur.count += 1;
        naturezaMap.set(natLabel, cur);
      }

      const parsed = dateCol ? parseTotvsRowDate(row[dateCol]) : null;
      const line: TotvsRmPaidLineDetail = {
        valor: v,
        natureza: natLabel,
        dataISO: parsed && !Number.isNaN(parsed.getTime()) ? isoDateOnly(parsed) : null
      };

      if (parsed && !Number.isNaN(parsed.getTime())) {
        const ym = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;
        const b = byYm.get(ym) ?? { total: 0, count: 0, lines: [] };
        b.total += v;
        b.count += 1;
        pushLimited(b, line);
        byYm.set(ym, b);
      } else {
        undatedAgg.total += v;
        undatedAgg.count += 1;
        pushLimited(undatedAgg, { valor: v, natureza: natLabel, dataISO: null });
      }
    };

    if (ccCol) {
      for (const row of rows) {
        const cell = row[ccCol];
        if (!cellMatchesCostCenterForRow(cell, code, name, ccCol)) continue;
        if (statusCol && statusAllowed && !statusAllowed.has(norm(String(row[statusCol] ?? '')))) continue;
        accumulateIncluded(row);
      }
    } else {
      const multi = String(process.env.TOTVS_RM_MATCH_ALL_ROWS || '')
        .trim()
        .toLowerCase();
      if (multi === '1' || multi === 'true' || multi === 'yes') {
        for (const row of rows) {
          accumulateIncluded(row);
        }
      } else {
        throw new Error(
          'RELATORIOFIN: não foi possível detectar coluna de centro de custo. Defina TOTVS_RM_CC_COLUMN (ex.: CODCCUSTO ou NOME).'
        );
      }
    }

    // --- Solicitações (contrato): CC + data + valor, sem exclusão por natureza (linha Controle Geral) ---
    const solPathRaw = (process.env.TOTVS_RM_SOLICITACOES_PATH || '').trim();
    const defaultPath = this.defaultRelatorioPath();
    let solicitationRows = rows;
    if (solPathRaw && normPathRel(solPathRaw) !== normPathRel(defaultPath)) {
      try {
        const alt = await this.fetchRowsForPath(solPathRaw);
        if (alt.length) solicitationRows = alt;
      } catch (e) {
        console.warn(
          '[TOTVS RM SOLICITACOES] Falha ao buscar TOTVS_RM_SOLICITACOES_PATH; usando o mesmo dataset do RELATORIOFIN.',
          e instanceof Error ? e.message : e
        );
        solicitationRows = rows;
      }
    }

    const solCcCol = pickColumn(
      solicitationRows,
      scoreCcColumn,
      process.env.TOTVS_RM_SOLICITACOES_CC_COLUMN || process.env.TOTVS_RM_CC_COLUMN
    );
    const solValExclude = solCcCol ? new Set<string>([solCcCol]) : undefined;
    const solValCol = pickColumn(
      solicitationRows,
      scoreValueColumn,
      process.env.TOTVS_RM_SOLICITACOES_VALUE_COLUMN || process.env.TOTVS_RM_VALUE_COLUMN,
      solValExclude
    );
    const solNatCol = pickNaturezaColumn(
      solicitationRows,
      new Set([solCcCol, solValCol].filter(Boolean) as string[])
    );

    const solUseStatus = ['1', 'true', 'yes'].includes(
      String(process.env.TOTVS_RM_SOLICITACOES_USE_STATUS_FILTER || '').trim().toLowerCase()
    );
    const solStatusAllowed = solUseStatus ? parseStatusIncludeNormSet() : null;
    const solExcludeForStatus = new Set([solCcCol, solValCol, solNatCol].filter(Boolean) as string[]);
    const solStatusCol =
      solStatusAllowed && solStatusAllowed.size > 0
        ? pickColumn(
            solicitationRows,
            scoreStatusColumn,
            process.env.TOTVS_RM_SOLICITACOES_STATUS_COLUMN || process.env.TOTVS_RM_STATUS_COLUMN,
            solExcludeForStatus
          )
        : null;

    const solDateExcludeKeys = new Set<string>(
      [solCcCol, solValCol, solNatCol, solStatusCol].filter(Boolean) as string[]
    );
    const solDateCol = pickColumn(
      solicitationRows,
      scoreDateColumn,
      process.env.TOTVS_RM_SOLICITACOES_DATE_COLUMN || process.env.TOTVS_RM_DATE_COLUMN,
      solDateExcludeKeys
    );

    let solicitacoesMatchedRowCount = 0;
    const solByYm = new Map<string, MonthAgg>();
    let solUndatedAgg: MonthAgg = { total: 0, count: 0, lines: [] };

    const accumulateSolicitacao = (row: Record<string, unknown>) => {
      if (!solValCol) return;
      const nkRaw = solNatCol ? String(row[solNatCol] ?? '').trim() : '';
      const natLabel = nkRaw === '' ? '—' : nkRaw;
      if (isNaturezaExcludedFromContractPaidTotal(natLabel)) return;

      solicitacoesMatchedRowCount += 1;
      const v = parseMoneyBr(row[solValCol]);
      const parsed = solDateCol ? parseTotvsRowDate(row[solDateCol]) : null;
      const line: TotvsRmPaidLineDetail = {
        valor: v,
        natureza: natLabel,
        dataISO: parsed && !Number.isNaN(parsed.getTime()) ? isoDateOnly(parsed) : null
      };
      if (parsed && !Number.isNaN(parsed.getTime())) {
        const ym = `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}`;
        const b = solByYm.get(ym) ?? { total: 0, count: 0, lines: [] };
        b.total += v;
        b.count += 1;
        pushLimited(b, line);
        solByYm.set(ym, b);
      } else {
        solUndatedAgg.total += v;
        solUndatedAgg.count += 1;
        pushLimited(solUndatedAgg, { valor: v, natureza: natLabel, dataISO: null });
      }
    };

    if (solCcCol && solValCol) {
      for (const row of solicitationRows) {
        const cell = row[solCcCol];
        if (!cellMatchesCostCenterForRow(cell, code, name, solCcCol)) continue;
        if (
          solStatusCol &&
          solStatusAllowed &&
          solStatusAllowed.size > 0 &&
          !solStatusAllowed.has(norm(String(row[solStatusCol] ?? '')))
        ) {
          continue;
        }
        accumulateSolicitacao(row);
      }
    } else if (!solCcCol && solValCol) {
      const multi = String(process.env.TOTVS_RM_MATCH_ALL_ROWS || '')
        .trim()
        .toLowerCase();
      if (multi === '1' || multi === 'true' || multi === 'yes') {
        for (const row of solicitationRows) {
          accumulateSolicitacao(row);
        }
      } else if (solPathRaw) {
        console.warn(
          '[TOTVS RM SOLICITACOES] Dataset de solicitações sem coluna de centro de custo detectada. Defina TOTVS_RM_SOLICITACOES_CC_COLUMN ou TOTVS_RM_CC_COLUMN.'
        );
      }
    }

    const solicitacoesByCalendarMonth = [...solByYm.entries()]
      .map(([ym, b]) => {
        const parts = ym.split('-');
        const yearN = Number(parts[0]);
        const monthN = Number(parts[1]);
        return { year: yearN, month: monthN, total: b.total, count: b.count, lines: b.lines };
      })
      .filter((x) => Number.isFinite(x.year) && Number.isFinite(x.month))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    const solicitacoesUndated =
      solUndatedAgg.count > 0
        ? { total: solUndatedAgg.total, count: solUndatedAgg.count, lines: solUndatedAgg.lines }
        : null;

    const totalsByNatureza = [...naturezaMap.entries()]
      .map(([natureza, agg]) => ({ natureza, total: agg.total, count: agg.count }))
      .sort((a, b) => b.total - a.total);

    const paidByCalendarMonth = [...byYm.entries()]
      .map(([ym, b]) => {
        const parts = ym.split('-');
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        return { year, month, total: b.total, count: b.count, lines: b.lines };
      })
      .filter((x) => Number.isFinite(x.year) && Number.isFinite(x.month))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    const paidUndated =
      undatedAgg.count > 0
        ? { total: undatedAgg.total, count: undatedAgg.count, lines: undatedAgg.lines }
        : null;

    return {
      total,
      matchedRowCount,
      totalRowCount: rows.length,
      ccColumn: ccCol,
      valueColumn: valCol,
      naturezaColumn: natCol,
      totalsByNatureza,
      sampleCcValuesMatched: [...sampleCc].slice(0, 15),
      dateColumn: dateCol,
      paidByCalendarMonth,
      paidUndated,
      solicitacoesByCalendarMonth,
      solicitacoesUndated,
      solicitacoesMatchedRowCount,
      solicitacoesDateColumn: solDateCol,
      solicitacoesValueColumn: solValCol,
      solicitacoesCcColumn: solCcCol
    };
  }

  formatAxiosError(err: unknown): string {
    const ax = err as AxiosError<{ message?: string }>;
    if (ax?.response?.status) {
      const body =
        typeof ax.response.data === 'string'
          ? ax.response.data
          : ax.response.data?.message || JSON.stringify(ax.response.data);
      return `Erro RM (${ax.response.status}): ${String(body).slice(0, 400)}`;
    }
    if (ax?.message) return ax.message;
    return String(err);
  }
}

let singleton: TotvsRmRelatorioFinService | null = null;

export function getTotvsRmRelatorioFinService(): TotvsRmRelatorioFinService {
  if (!singleton) singleton = new TotvsRmRelatorioFinService();
  return singleton;
}
