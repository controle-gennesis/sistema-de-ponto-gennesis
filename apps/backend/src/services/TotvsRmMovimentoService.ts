import axios, { AxiosError } from 'axios';
import https from 'https';
import {
  TOTVS_OC_CODTMV,
  TOTVS_OC_FILIAL,
  TOTVS_OC_SERIE,
  totvsCodColigada,
  toTotvsUnit,
} from '../lib/ocTotvsRm';

export type TotvsOcMovimentoItem = {
  sequencial: number;
  produtoCodigo: string;
  produtoId?: number | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  centroCusto: string;
};

export type TotvsOcMovimentoPayload = {
  fornecedorCodigo: string;
  fornecedorColigada?: number | null;
  fornecedorCnpj?: string | null;
  filial?: number | null;
  centroCusto: string;
  centroCustoNome?: string | null;
  codLoc?: string | null;
  condicaoPagamento: string;
  tipoFrete: string;
  /** Valor do frete (TMOV.VALORFRETE) — Fluig G3. */
  valorFrete?: number | null;
  dataEmissao: Date;
  dataEntrega?: Date | null;
  observacao?: string | null;
  bancoAgPix?: string | null;
  items: TotvsOcMovimentoItem[];
};

export type TotvsOcSaveResult = {
  idMov: number;
  codColigada: number;
  numMovimento?: string | null;
  raw: unknown;
};

export type TotvsRmAuthOverride = {
  user: string;
  pass: string;
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function axiosHttpsAgent() {
  const rejectUnauthorized =
    String(process.env.TOTVS_RM_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';
  return new https.Agent({ rejectUnauthorized });
}

function totvsMessageDetail(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') {
    try {
      return totvsMessageDetail(JSON.parse(data));
    } catch {
      return data;
    }
  }
  if (typeof data !== 'object') return '';
  const rec = data as Record<string, unknown>;
  const rows = Array.isArray(rec.messages) ? rec.messages : [];
  const details = rows
    .map((row) =>
      row && typeof row === 'object' ? String((row as { detail?: unknown }).detail || '') : ''
    )
    .filter(Boolean);
  if (details.length) return details.join(' ');
  const msg = rec.message ?? rec.Message ?? rec.error ?? rec.ExceptionMessage ?? rec.detail;
  return typeof msg === 'string' ? msg : '';
}

function totvsOcSaveTimeoutMs(): number {
  const n = Number(process.env.TOTVS_RM_OC_TIMEOUT_MS || process.env.TOTVS_RM_TIMEOUT_MS || 20000);
  if (!Number.isFinite(n) || n <= 0) return 20000;
  return Math.min(Math.trunc(n), 25000);
}

function isTimeoutError(err: unknown): boolean {
  const axiosErr = err as AxiosError;
  const msg = axiosErr?.message || (err instanceof Error ? err.message : String(err || ''));
  return axiosErr?.code === 'ECONNABORTED' || /timeout of \d+ms exceeded|ETIMEDOUT/i.test(msg);
}

function formatRmError(err: unknown, url?: string): string {
  if (isTimeoutError(err)) {
    return 'O TOTVS RM não respondeu a tempo ao gravar a OC nova. Nenhuma OC existente foi alterada.';
  }
  const axiosErr = err as AxiosError;
  const status = axiosErr.response?.status;
  const data = axiosErr.response?.data;
  const detail = totvsMessageDetail(data);
  const fault = typeof data === 'string' ? extractSoapFault(data) : '';
  if (fault) return fault.slice(0, 800);
  if (detail) {
    if (/Unexpected character encountered while parsing value/i.test(detail)) {
      return 'O TOTVS recusou o formato do envio. A OC no Conecta não foi alterada e nenhuma OC existente no RM foi mexida.';
    }
    if (/constraints|foreign-key|non-null|unique/i.test(detail)) {
      const snippet = sanitizeRmSnippet(typeof data === 'string' ? data : JSON.stringify(data));
      return (
        'TOTVS recusou a inclusão da OC nova: algum código não casou com a chave do RM (fornecedor é coligada+código, produto é IDPRD, unidade é TUND). Nenhuma OC existente foi alterada.' +
        (snippet ? ` Detalhe RM: ${snippet}` : '')
      );
    }
    return detail.slice(0, 800);
  }
  if (status === 404) {
    return `TOTVS RM não encontrou o DataServer do movimento (HTTP 404${url ? ` em ${url}` : ''}).`;
  }
  if (status) return `TOTVS RM retornou HTTP ${status} ao gravar o movimento 1.1.26`;
  if (err instanceof Error && err.message) return err.message;
  return 'Falha ao gravar o movimento 1.1.26 no TOTVS RM';
}

function extractSoapFault(xml: string): string {
  const fault =
    xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i)?.[1] ||
    xml.match(/<Message[^>]*>([\s\S]*?)<\/Message>/i)?.[1] ||
    '';
  return decodeXmlEntities(fault).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeRmSnippet(raw: string): string {
  return raw
    .replace(/<tot:Senha>[\s\S]*?<\/tot:Senha>/gi, '<tot:Senha>***</tot:Senha>')
    .replace(/<Senha>[\s\S]*?<\/Senha>/gi, '<Senha>***</Senha>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

function isWsdlOrHtml(raw: string): boolean {
  return /<wsdl:definitions|<definitions[^>]+xmlns:wsdl|<html[\s>]|GetAvailableServices/i.test(raw);
}

function pickIdMov(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1) return Math.trunc(raw);
  if (typeof raw === 'string') {
    let decoded = decodeXmlEntities(raw);
    if (decoded.includes('&lt;') || decoded.includes('&amp;')) decoded = decodeXmlEntities(decoded);
    const patterns = [
      /IDMOV\s*=\s*(\d{2,})/i,
      /<(?:[\w.]+:)?IDMOV[^>]*>\s*(\d{2,})\s*</i,
      /(?:^|[;\s|,])(\d{1,6})[;|,](\d{2,})(?:[<\s]|$)/,
      /(?:^|[;\s|,])(\d{1,6})[|#](\d{2,})(?:[<\s]|$)/,
    ];
    for (const re of patterns) {
      const match = decoded.match(re);
      if (!match) continue;
      const n = Number(match[2] ?? match[1]);
      if (Number.isFinite(n) && n > 1) return Math.trunc(n);
    }
    const trimmed = decoded.replace(/<[^>]+>/g, '').trim();
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 1) return Math.trunc(n);
  }
  if (typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const keys = ['IDMOV', 'IdMov', 'idMov', 'idmov', 'NUMEROMOV', 'NumeroMov'];
  for (const key of keys) {
    const found = pickIdMov(rec[key]);
    if (found) return found;
  }
  if (rec.data != null) return pickIdMov(rec.data);
  if (rec.content != null) return pickIdMov(rec.content);
  if (Array.isArray(rec)) {
    for (const row of rec) {
      const found = pickIdMov(row);
      if (found) return found;
    }
  }
  return null;
}

function pickNumMovimento(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const decoded = decodeXmlEntities(raw);
    const tag = decoded.match(/<(?:NUMEROMOV|NumeroMov)[^>]*>([^<]+)<\/(?:NUMEROMOV|NumeroMov)>/i);
    if (tag?.[1]?.trim()) return tag[1].trim();
  }
  if (typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  for (const key of ['NUMEROMOV', 'NumeroMov', 'numeroMov', 'CODTMVNUMERO']) {
    const v = rec[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  if (rec.data != null) return pickNumMovimento(rec.data);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function collectRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  const root = asRecord(record.MovMovimento) || record;
  const tmovRaw = root.TMOV;
  const tmovs = Array.isArray(tmovRaw) ? tmovRaw : tmovRaw ? [tmovRaw] : [root];
  const rows: Record<string, unknown>[] = [];
  const pushItems = (items: unknown) => {
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && typeof item === 'object') rows.push(item as Record<string, unknown>);
      }
    } else if (items && typeof items === 'object') {
      rows.push(items as Record<string, unknown>);
    }
  };
  for (const tmov of tmovs) {
    if (tmov && typeof tmov === 'object') {
      const row = tmov as Record<string, unknown>;
      rows.push(row);
      pushItems(row.TITMMOV);
    }
  }
  pushItems(root.TITMMOV);
  return rows;
}

function extractFirstTmov(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const wrapped = asRecord(rec.MovMovimento) || asRecord(rec.data) || rec;
  const tmov = wrapped.TMOV;
  if (Array.isArray(tmov) && tmov[0] && typeof tmov[0] === 'object') return tmov[0] as Record<string, unknown>;
  const single = asRecord(tmov);
  if (single) return single;
  if (Array.isArray(rec) && rec[0] && typeof rec[0] === 'object') {
    const first = rec[0] as Record<string, unknown>;
    return asRecord(first.TMOV) || first;
  }
  return rec.CODTMV || rec.CODLOC ? rec : null;
}

/** Inclusão no RM: IDMOV deve ser sempre -1. Qualquer IdMov positivo seria alteração de OC existente. */
function assertInsertOnlyPayload(payload: { xml?: string; record?: Record<string, unknown> }) {
  const xml = payload.xml || '';
  const idMatches = [...xml.matchAll(/<IDMOV>\s*([^<]+)\s*<\/IDMOV>/gi)].map((m) => String(m[1]).trim());
  if (idMatches.some((value) => value !== '-1')) {
    throw new Error('Bloqueado: o envio ao TOTVS só pode incluir OC nova (IDMOV=-1). Alteração de movimento existente é proibida.');
  }
  const record = payload.record;
  if (record) {
    const rows = collectRecords(record);
    if (rows.some((row) => row.IDMOV !== -1 && row.IDMOV !== '-1')) {
      throw new Error('Bloqueado: o envio ao TOTVS só pode incluir OC nova (IDMOV=-1).');
    }
    if (rows.some((row) => {
      if (row.NUMEROMOV == null || String(row.NUMEROMOV).trim() === '') return false;
      return String(row.NUMEROMOV).trim() !== '-1';
    })) {
      throw new Error('Bloqueado: número de movimento só pode ser -1 na inclusão. Alterar OC existente é proibido.');
    }
  }
}

function extractSoapResult(xml: string): string {
  const result =
    xml.match(/<(?:[\w.]+:)?SaveRecordResult[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?SaveRecordResult>/i)?.[1] ||
    xml.match(/<(?:[\w.]+:)?SaveRecordAuthResult[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?SaveRecordAuthResult>/i)?.[1] ||
    xml.match(/<(?:[\w.]+:)?SaveRecordAuthResponse[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?SaveRecordAuthResponse>/i)?.[1] ||
    '';
  return decodeXmlEntities(result).trim();
}

function formatSaveRecordBusinessError(result: string): string {
  const text = decodeXmlEntities(result)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#xD;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/requisitante não foi encontrado|Erro ao criar uma instância no Servidor do Fluig/i.test(text)) {
    return (
      'O TOTVS aceitou incluir a OC nova, mas o Fluig não abriu o G3: o requisitante não foi encontrado ou está inativo. ' +
      'Nenhuma OC existente foi alterada. Verifique o vínculo do seu usuário TOTVS no Fluig (usuário ativo).'
    );
  }
  if (/^erro\b/i.test(text)) return text.slice(0, 800);
  return '';
}

export class TotvsRmMovimentoService {
  private authOverride: TotvsRmAuthOverride | null = null;

  isConfigured(override?: TotvsRmAuthOverride | null): boolean {
    const base = (process.env.TOTVS_RM_BASE_URL || '').trim();
    if (!base) return false;
    const bearer = (process.env.TOTVS_RM_BEARER_TOKEN || '').trim();
    if (bearer) return true;
    const user = (override?.user || process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim();
    const pass = (override?.pass || process.env.TOTVS_RM_PASSWORD || '').trim();
    return !!user && !!pass;
  }

  private credentials() {
    if (this.authOverride?.user && this.authOverride.pass) {
      return { user: this.authOverride.user.trim(), pass: this.authOverride.pass };
    }
    return {
      user: (process.env.TOTVS_RM_USER || process.env.TOTVS_RM_USERNAME || '').trim(),
      pass: (process.env.TOTVS_RM_PASSWORD || '').trim(),
    };
  }

  private authHeaders(): Record<string, string> {
    if (this.authOverride?.user && this.authOverride.pass) {
      const { user, pass } = this.credentials();
      return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}` };
    }
    const bearer = (process.env.TOTVS_RM_BEARER_TOKEN || '').trim();
    if (bearer) return { Authorization: `Bearer ${bearer}` };
    const { user, pass } = this.credentials();
    return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}` };
  }

  private restUrl(): string {
    const base = (process.env.TOTVS_RM_BASE_URL || '').replace(/\/$/, '');
    const configured = (process.env.TOTVS_RM_MOVIMENTO_PATH || '').trim();
    const pathRel =
      configured && !/\/api\/rmsrestdataserver\//i.test(configured)
        ? configured
        : '/RMSRestDataServer/rest/MovMovimentoTBCData';
    const p = pathRel.startsWith('/') ? pathRel : `/${pathRel}`;
    return `${base}${p}`;
  }

  private insertDefaults: { codLoc: string; codMoeda: string } | null = null;
  private produtoByCodigo = new Map<string, { idPrd: number; codigo: string; unidade: string | null }>();
  private locRows: Array<{ filial: number; codigo: string; nome: string }> | null = null;
  private locRowsAt = 0;

  private restBase(): string {
    return (process.env.TOTVS_RM_BASE_URL || '').replace(/\/$/, '');
  }

  private pickDataRecord(raw: unknown): Record<string, unknown> | null {
    const rec = asRecord(raw);
    if (!rec) return null;
    if (Array.isArray(rec.data)) return asRecord(rec.data[0]);
    return asRecord(rec.data) || (rec.CODCFO || rec.IDPRD ? rec : null);
  }

  private async restGetJson(pathRel: string): Promise<unknown> {
    const path = pathRel.startsWith('/') ? pathRel : `/${pathRel}`;
    const coligada = totvsCodColigada();
    const usuario = this.credentials().user;
    const contexto = `CODCOLIGADA=${coligada};CODSISTEMA=T;CODUSUARIO=${usuario}`;
    const response = await axios.get(`${this.restBase()}${path}`, {
      headers: {
        ...this.authHeaders(),
        Accept: 'application/json',
        CODCOLIGADA: String(coligada),
        CODSISTEMA: 'T',
        Context: contexto,
        ...(usuario ? { CODUSUARIO: usuario } : {}),
      },
      httpsAgent: axiosHttpsAgent(),
      timeout: 8000,
      validateStatus: () => true,
      maxRedirects: 0,
    });
    if (response.status >= 400) return null;
    return response.data;
  }

  /** FCFO no RM é (CODCOLIGADA, CODCFO). Premoldados está na coligada 0, não na 1. */
  async resolveFornecedorColigada(codCfo: string): Promise<number> {
    const env = (process.env.TOTVS_RM_CODCOLCFO || '').trim();
    if (env !== '' && Number.isFinite(Number(env))) return Number(env);
    const wanted = (codCfo || '').trim();
    if (!wanted) return 0;
    for (const col of [totvsCodColigada(), 0]) {
      try {
        const raw = await this.restGetJson(`/RMSRestDataServer/rest/FinCFODataBR/${col}$_$${wanted}`);
        const row = this.pickDataRecord(raw);
        if (row && String(row.CODCFO || '').trim() === wanted) {
          const n = Number(row.CODCOLIGADA);
          return Number.isFinite(n) ? n : col;
        }
      } catch {
        /* lookup só leitura; se falhar, tenta a próxima coligada */
      }
    }
    return 0;
  }

  private rememberProduto(row: Record<string, unknown>) {
    const idPrd = Number(row.IDPRD);
    const codigo = String(row.CODIGOPRD || '').trim();
    if (!Number.isFinite(idPrd) || idPrd <= 0 || !codigo) return;
    const unidade =
      String(row.CODUNDCOMPRA || row.CODUNDCONTROLE || row.CODUNDVENDA || '').trim() || null;
    this.produtoByCodigo.set(codigo.toUpperCase(), { idPrd, codigo, unidade });
  }

  async resolveProduto(codigo: string): Promise<{ idPrd: number | null; codigo: string; unidade: string | null }> {
    const wanted = (codigo || '').trim();
    if (!wanted) return { idPrd: null, codigo: '', unidade: null };
    const cached = this.produtoByCodigo.get(wanted.toUpperCase());
    if (cached) return cached;

    if (/^\d+$/.test(wanted)) {
      try {
        const raw = await this.restGetJson(
          `/RMSRestDataServer/rest/EstPrdDataBR/${totvsCodColigada()}$_$${Number(wanted)}`
        );
        const row = this.pickDataRecord(raw);
        if (row) this.rememberProduto(row);
        const byId = this.produtoByCodigo.get(wanted.toUpperCase());
        if (byId) return byId;
        const idPrd = Number(row?.IDPRD);
        if (row && Number.isFinite(idPrd) && idPrd > 0) {
          const found = {
            idPrd,
            codigo: String(row.CODIGOPRD || wanted).trim() || wanted,
            unidade:
              String(row.CODUNDCOMPRA || row.CODUNDCONTROLE || row.CODUNDVENDA || '').trim() || null,
          };
          this.produtoByCodigo.set(found.codigo.toUpperCase(), found);
          return found;
        }
      } catch {
        /* busca paginada abaixo */
      }
    }

    const pageSize = 200;
    const maxPages = 15;
    for (let page = 0; page < maxPages; page++) {
      const raw = await this.restGetJson(
        `/RMSRestDataServer/rest/EstPrdDataBR?start=${page * pageSize}&limit=${pageSize}`
      );
      const rec = asRecord(raw);
      const list = Array.isArray(rec?.data) ? rec.data : [];
      for (const item of list) {
        if (item && typeof item === 'object') this.rememberProduto(item as Record<string, unknown>);
      }
      const hit = this.produtoByCodigo.get(wanted.toUpperCase());
      if (hit) return hit;
      if (list.length < pageSize) break;
    }
    return { idPrd: null, codigo: wanted, unidade: null };
  }

  private async loadEstoqueLocais(): Promise<Array<{ filial: number; codigo: string; nome: string }>> {
    if (this.locRows && Date.now() - this.locRowsAt < 30 * 60 * 1000) return this.locRows;
    const rows: Array<{ filial: number; codigo: string; nome: string }> = [];
    const pageSize = 100;
    for (let start = 0; start < 500; start += pageSize) {
      const raw = await this.restGetJson(
        `/RMSRestDataServer/rest/EstLocData?start=${start}&limit=${pageSize}`
      );
      const rec = asRecord(raw);
      const list = Array.isArray(rec?.data) ? rec.data : [];
      for (const item of list) {
        const row = asRecord(item);
        if (!row || Number(row.INATIVO) === 1) continue;
        const codigo = String(row.CODLOC || '').trim();
        const filial = Number(row.CODFILIAL);
        if (!codigo || !Number.isFinite(filial)) continue;
        rows.push({ filial, codigo, nome: String(row.NOME || '') });
      }
      if (list.length < pageSize) break;
    }
    this.locRows = rows;
    this.locRowsAt = Date.now();
    return rows;
  }

  async resolveCodLoc(filial: number, centroCustoNome?: string | null): Promise<string> {
    const configured = (process.env.TOTVS_RM_CODLOC || this.insertDefaults?.codLoc || '').trim();
    if (configured && configured !== '01') return configured;
    try {
      const rows = (await this.loadEstoqueLocais()).filter((row) => row.filial === filial);
      if (!rows.length) return '';
      const cc = (centroCustoNome || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const lote = cc.match(/LOTE\s*(\d+)/)?.[1];
      let best = rows[0];
      let bestScore = -1;
      for (const row of rows) {
        const nome = row.nome
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();
        let score = 0;
        if (lote && nome.includes(`LOTE ${lote}`)) score += 50;
        if (cc && (nome.includes('SES') && cc.includes('SES'))) score += 20;
        if (nome.includes('ALMOXARIFADO CENTRAL')) score += 15;
        if (nome.includes('ALMOXARIFADO')) score += 8;
        if (score > bestScore) {
          bestScore = score;
          best = row;
        }
      }
      return best.codigo;
    } catch {
      return '';
    }
  }

  private defaultCodLoc(): string {
    const configured = (process.env.TOTVS_RM_CODLOC || this.insertDefaults?.codLoc || '').trim();
    if (configured && configured !== '01') return configured;
    return '';
  }

  private defaultCodMoeda(): string {
    return (process.env.TOTVS_RM_CODMOEDA || this.insertDefaults?.codMoeda || 'R$').trim() || 'R$';
  }

  buildRecord(input: TotvsOcMovimentoPayload): Record<string, unknown> {
    const coligada = totvsCodColigada();
    const filial = Number(input.filial) === 5 ? 5 : Number(TOTVS_OC_FILIAL) || 1;
    const localEstoque = (input.codLoc || this.defaultCodLoc()).trim();
    const valorFrete = Number(input.valorFrete);
    const header: Record<string, unknown> = {
      CODCOLIGADA: coligada,
      IDMOV: -1,
      NUMEROMOV: -1,
      CODFILIAL: filial,
      CODTMV: TOTVS_OC_CODTMV,
      SERIE: TOTVS_OC_SERIE,
      CODCFO: input.fornecedorCodigo,
      CODCOLCFO: input.fornecedorColigada ?? 0,
      CODCCUSTO: input.centroCusto,
      CODCPG: input.condicaoPagamento,
      TIPOFRETE: input.tipoFrete || 'S',
      VALORFRETE: Number.isFinite(valorFrete) && valorFrete > 0 ? valorFrete : 0,
      DATAEMISSAO: `${isoDate(input.dataEmissao)}T00:00:00`,
      TITMMOV: input.items.map((item) => {
        const unidade = toTotvsUnit(item.unidade);
        const row: Record<string, unknown> = {
          CODCOLIGADA: coligada,
          IDMOV: -1,
          NSEQITMMOV: item.sequencial,
          CODIGOPRD: item.produtoCodigo,
          QUANTIDADE: item.quantidade,
          PRECOUNITARIO: item.precoUnitario,
          CODCCUSTO: input.centroCusto,
        };
        if (item.produtoId && item.produtoId > 0) row.IDPRD = item.produtoId;
        if (unidade) row.CODUND = unidade;
        return row;
      }),
    };
    if (localEstoque) header.CODLOC = localEstoque;
    if (input.observacao) header.OBSERVACAO = input.observacao;
    if (input.bancoAgPix) header.CAMPOLIVRE1 = input.bancoAgPix;

    return header;
  }

  buildXml(input: TotvsOcMovimentoPayload): string {
    const coligada = totvsCodColigada();
    const localEstoque = (input.codLoc || this.defaultCodLoc()).trim();
    const filial = Number(input.filial) === 5 ? 5 : Number(TOTVS_OC_FILIAL) || 1;
    const valorFreteRaw = Number(input.valorFrete);
    const valorFrete = Number.isFinite(valorFreteRaw) && valorFreteRaw > 0 ? valorFreteRaw : 0;
    const tmov = [
      ['CODCOLIGADA', coligada],
      ['IDMOV', -1],
      ['NUMEROMOV', -1],
      ['CODFILIAL', filial],
      ['CODTMV', TOTVS_OC_CODTMV],
      ['SERIE', TOTVS_OC_SERIE],
      ['CODCFO', input.fornecedorCodigo],
      ['CODCOLCFO', input.fornecedorColigada ?? 0],
      ['CODCCUSTO', input.centroCusto],
      localEstoque ? ['CODLOC', localEstoque] : null,
      ['CODCPG', input.condicaoPagamento],
      ['TIPOFRETE', input.tipoFrete || 'S'],
      ['VALORFRETE', valorFrete],
      ['DATAEMISSAO', `${isoDate(input.dataEmissao)}T00:00:00`],
      input.observacao ? ['OBSERVACAO', input.observacao] : null,
      input.bancoAgPix ? ['CAMPOLIVRE1', input.bancoAgPix] : null,
    ]
      .filter((row): row is [string, string | number] => Boolean(row))
      .map(([key, value]) => `    <${key}>${xmlEscape(value)}</${key}>`)
      .join('\n');

    const items = input.items
      .map((item) => {
        const body = [
          ['CODCOLIGADA', coligada],
          ['IDMOV', -1],
          ['NSEQITMMOV', item.sequencial],
          item.produtoId && item.produtoId > 0 ? ['IDPRD', item.produtoId] : null,
          ['CODIGOPRD', item.produtoCodigo],
          toTotvsUnit(item.unidade) ? ['CODUND', toTotvsUnit(item.unidade)] : null,
          ['QUANTIDADE', item.quantidade],
          ['PRECOUNITARIO', item.precoUnitario],
          ['CODCCUSTO', input.centroCusto],
        ]
          .filter((row): row is [string, string | number] => Boolean(row))
          .map(([key, value]) => `      <${key}>${xmlEscape(value)}</${key}>`)
          .join('\n');
        return `    <TITMMOV>\n${body}\n    </TITMMOV>`;
      })
      .join('\n');

    return `<MovMovimento>\n  <TMOV>\n${tmov}\n${items}\n  </TMOV>\n</MovMovimento>`;
  }

  private soapEnvelope(xml: string): string {
    const coligada = totvsCodColigada();
    const { user } = this.credentials();
    const contexto = `CODCOLIGADA=${coligada};CODSISTEMA=T;CODUSUARIO=${user}`;
    return (
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tot="http://www.totvs.com/">` +
      `<soapenv:Body>` +
      `<tot:SaveRecord>` +
      `<tot:DataServerName>MovMovimentoTBCData</tot:DataServerName>` +
      `<tot:XML><![CDATA[${xml}]]></tot:XML>` +
      `<tot:Contexto>${xmlEscape(contexto)}</tot:Contexto>` +
      `</tot:SaveRecord>` +
      `</soapenv:Body>` +
      `</soapenv:Envelope>`
    );
  }

  private responseText(data: unknown): string {
    if (data == null) return '';
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data.toString('utf8');
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }

  private finishSave(raw: unknown): TotvsOcSaveResult {
    const idMov = pickIdMov(raw);
    if (!idMov) {
      const snippet = sanitizeRmSnippet(this.responseText(raw));
      throw new Error(`O TOTVS RM respondeu sem IdMov da OC nova. Trecho: ${snippet || '(vazio)'}`);
    }
    return {
      idMov,
      codColigada: totvsCodColigada(),
      numMovimento: pickNumMovimento(raw),
      raw,
    };
  }

  private async saveViaSoap(input: TotvsOcMovimentoPayload): Promise<TotvsOcSaveResult> {
    const base = (process.env.TOTVS_RM_BASE_URL || '').replace(/\/$/, '');
    const xml = this.buildXml(input);
    assertInsertOnlyPayload({ xml });
    const url = `${base}/wsDataServer/IwsDataServer`;
    const response = await axios.post(url, this.soapEnvelope(xml), {
      headers: {
        ...this.authHeaders(),
        Accept: 'text/xml, application/soap+xml, */*',
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://www.totvs.com/IwsDataServer/SaveRecord',
      },
      httpsAgent: axiosHttpsAgent(),
      timeout: totvsOcSaveTimeoutMs(),
      responseType: 'text',
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const raw = this.responseText(response.data);
    console.warn(`[TOTVS OC] SOAP SaveRecord ${response.status} len=${raw.length} :: ${sanitizeRmSnippet(raw)}`);
    if (response.status === 202 || !raw.trim()) {
      throw new Error('O TOTVS RM aceitou a conexão SOAP, mas não executou o SaveRecord.');
    }
    if (isWsdlOrHtml(raw)) {
      throw new Error('O endpoint SOAP devolveu WSDL/HTML em vez do SaveRecord.');
    }
    const fault = extractSoapFault(raw);
    if (fault) throw new Error(fault);
    if (response.status >= 400) {
      throw new Error(formatRmError({ response: { status: response.status, data: raw } }, url));
    }
    const result = extractSoapResult(raw) || raw;
    const businessErr = formatSaveRecordBusinessError(typeof result === 'string' ? result : '');
    if (businessErr) throw new Error(businessErr);
    return this.finishSave(result);
  }

  private async peekInsertDefaults(): Promise<void> {
    if (this.insertDefaults) return;
    this.insertDefaults = {
      codLoc: (process.env.TOTVS_RM_CODLOC || '01').trim() || '01',
      codMoeda: (process.env.TOTVS_RM_CODMOEDA || 'R$').trim() || 'R$',
    };
  }

  private async postRest(
    url: string,
    body: unknown,
    contentType: string
  ): Promise<{ status: number; data: unknown; raw: string }> {
    const coligada = totvsCodColigada();
    const usuario = this.credentials().user;
    const contexto = `CODCOLIGADA=${coligada};CODSISTEMA=T;CODUSUARIO=${usuario}`;
    let response;
    try {
      response = await axios.post(url, body, {
        headers: {
          ...this.authHeaders(),
          Accept: 'application/json, application/xml, text/xml, */*',
          'Content-Type': contentType,
          CODCOLIGADA: String(coligada),
          CODSISTEMA: 'T',
          Context: contexto,
          ...(usuario ? { CODUSUARIO: usuario } : {}),
        },
        httpsAgent: axiosHttpsAgent(),
        timeout: totvsOcSaveTimeoutMs(),
        params: { codColigada: coligada },
        maxRedirects: 0,
        validateStatus: () => true,
      });
    } catch (err) {
      throw new Error(formatRmError(err, url));
    }
    const raw = this.responseText(response.data);
    console.warn(`[TOTVS OC] REST ${response.status} ${contentType} ${url} len=${raw.length} :: ${sanitizeRmSnippet(raw)}`);
    return { status: response.status, data: response.data, raw };
  }

  private async saveViaRest(input: TotvsOcMovimentoPayload): Promise<TotvsOcSaveResult> {
    await this.peekInsertDefaults();
    const record = this.buildRecord(input);
    const xml = this.buildXml(input);
    assertInsertOnlyPayload({ record, xml });
    const url = this.restUrl();
    const attempts: Array<{ body: unknown; contentType: string }> = [
      { body: xml, contentType: 'application/xml' },
      { body: record, contentType: 'application/json' },
      { body: { TMOV: record }, contentType: 'application/json' },
    ];
    let lastErr: Error | null = null;
    for (const attempt of attempts) {
      const response = await this.postRest(url, attempt.body, attempt.contentType);
      if (response.status === 202 || response.status === 404 || response.status === 405) {
        lastErr = new Error(
          `TOTVS RM REST não criou o movimento (HTTP ${response.status}). O Conecta não altera OC existente.`
        );
        continue;
      }
      const fault = extractSoapFault(response.raw);
      if (fault) {
        lastErr = new Error(fault);
        if (/constraints|foreign-key|0007/i.test(fault + response.raw)) continue;
        throw lastErr;
      }
      if (response.status >= 400) {
        lastErr = new Error(formatRmError({ response: { status: response.status, data: response.raw } }, url));
        if (
          /constraints|foreign-key|0007|não casou com a chave|Unexpected character encountered while parsing/i.test(
            lastErr.message + response.raw
          )
        ) {
          continue;
        }
        throw lastErr;
      }
      return this.finishSave(response.data ?? response.raw);
    }
    throw lastErr || new Error('TOTVS RM REST não criou o movimento 1.1.26');
  }

  async saveOc1126(
    input: TotvsOcMovimentoPayload,
    auth?: TotvsRmAuthOverride | null
  ): Promise<TotvsOcSaveResult> {
    // Inclusão de OC exige login/senha do usuário autenticado no Conecta.
    // Nunca usa TOTVS_RM_USER / BEARER do servidor (evita subir OC com conta compartilhada).
    const personalUser = String(auth?.user || '').trim();
    const personalPass = auth?.pass != null ? String(auth.pass) : '';
    if (!personalUser || !personalPass.trim()) {
      throw new Error(
        'Vincule seu usuário TOTVS em Ordens de Compra (botão Vincular usuário Totvs) para enviar a OC via API.'
      );
    }
    if (!(process.env.TOTVS_RM_BASE_URL || '').trim()) {
      throw new Error(
        'Integração TOTVS RM sem URL. Defina TOTVS_RM_BASE_URL no servidor.'
      );
    }

    const prevAuth = this.authOverride;
    this.authOverride = { user: personalUser, pass: personalPass };
    try {
      if (!input.items.length) {
        throw new Error('A OC precisa de ao menos um item para enviar ao TOTVS');
      }

      const fornecedorColigada =
        input.fornecedorColigada ?? (await this.resolveFornecedorColigada(input.fornecedorCodigo));
      const filial = Number(input.filial) === 5 ? 5 : 1;
      const items: TotvsOcMovimentoItem[] = [];
      for (const item of input.items) {
        const lookupKey =
          item.produtoId && item.produtoId > 0 ? String(item.produtoId) : item.produtoCodigo;
        const prd = await this.resolveProduto(lookupKey);
        const idPrd = (item.produtoId && item.produtoId > 0 ? item.produtoId : prd.idPrd) || null;
        if (!idPrd) {
          throw new Error(
            `Produto ${item.produtoCodigo} não foi encontrado no cadastro do TOTVS (IDPRD). Cadastre o identificador no Conecta.`
          );
        }
        items.push({
          ...item,
          produtoCodigo: prd.codigo || item.produtoCodigo,
          produtoId: idPrd,
          unidade: toTotvsUnit(prd.unidade || item.unidade),
        });
      }
      const codLoc = (input.codLoc || (await this.resolveCodLoc(filial, input.centroCustoNome)) || '').trim();
      const resolved: TotvsOcMovimentoPayload = { ...input, fornecedorColigada, filial, items, codLoc };

      console.warn(
        `[TOTVS OC] inclusão 1.1.26 user=${this.credentials().user} coligada=1 filial=${resolved.filial} loc=${resolved.codLoc || '-'} CODCFO=${resolved.fornecedorCodigo} COLCFO=${resolved.fornecedorColigada} CC=${resolved.centroCusto} CPG=${resolved.condicaoPagamento} itens=${resolved.items
          .map((item) => `${item.produtoCodigo}:${item.produtoId || '-'}:${item.unidade || '-'}`)
          .join(',')}`
      );

      const sentHint = `Enviado: coligada 1, filial ${resolved.filial}, local ${resolved.codLoc || '-'}, fornecedor ${resolved.fornecedorCodigo} (col. ${resolved.fornecedorColigada ?? 0}), CC ${resolved.centroCusto}, CPG ${resolved.condicaoPagamento}, itens ${resolved.items
        .map((item) => `${item.produtoCodigo} (IDPRD ${item.produtoId})/${item.unidade || '-'}`)
        .join(', ')}.`;

      try {
        return await this.saveViaSoap(resolved);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/não casou com a chave|não batem com o cadastro|Fluig/i.test(msg)) {
          throw new Error(`${msg} ${sentHint}`);
        }
        throw err instanceof Error ? err : new Error(msg);
      }
    } finally {
      this.authOverride = prevAuth;
    }
  }
}

export const totvsRmMovimentoService = new TotvsRmMovimentoService();
