import dotenv from 'dotenv';
import path from 'path';

// Garantir que .env seja carregado antes de ler process.env (imports são avaliados antes do index)
dotenv.config({ path: path.join(__dirname, '../../.env') });

import axios, { AxiosError } from 'axios';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

export interface FluigDatasetValues {
  content?: {
    values?: Record<string, unknown>[];
    columns?: string[];
  };
  message?: string | null;
}

interface DatasetCacheEntry {
  data: FluigDatasetValues;
  fetchedAt: number;
  refreshing: boolean;
}

// Cache: dados frescos por 8 min, utilizáveis por 25 min (stale-while-revalidate)
const CACHE_FRESH_TTL_MS = 8 * 60 * 1000;
const CACHE_STALE_TTL_MS = 25 * 60 * 1000;

export interface FluigDatasetStructure {
  content?: {
    datasetId: string;
    fields: Array<{ fieldName: string; dataType: string }>;
    lastReset: number;
    lastUpdate: number;
  };
  message?: string | null;
}

function isRetryableError(err: unknown): boolean {
  const axiosErr = err as AxiosError;
  const status = axiosErr?.response?.status;
  if (status === 404) return true;
  if (status === 500) {
    const data = axiosErr?.response?.data;
    if (data && typeof data === 'object' && 'code' in data) {
      const code = String((data as { code?: string }).code);
      return code.includes('NotFoundException') || code.includes('NotFound');
    }
    return true; // 500 sem detalhes - tentar path alternativo
  }
  return false;
}

/** Paths de API dataset do Fluig. /api/public + /ecm/dataset/ = /api/public/ecm/dataset/ (exige OAuth 1.0) */
const DATASET_BASE_PATHS = [
  '/api/public',       // path que responde; Bearer dá 401, OAuth 1.0 funciona
  '/portal/api/rest',
  '/api/public/2.0',
  '',
  '/webdesk/api/public',
];

export class FluigService {
  private baseUrl: string;
  private datasetBaseUrl: string;
  private datasetBasePaths: string[];
  private workingDatasetBase: string | null = null;
  private oauth: OAuth;
  private token: { key: string; secret: string };
  private datasetCache = new Map<string, DatasetCacheEntry>();

  constructor() {
    const domain = (process.env.FLUIG_BASE_URL || 'https://gennesisengenharia160516.fluig.cloudtotvs.com.br').replace(/\/$/, '');
    const apiPath = process.env.FLUIG_API_PATH || '/portal/api/rest';
    const datasetPath = process.env.FLUIG_DATASET_API_PATH;
    this.baseUrl = domain + apiPath;
    this.datasetBaseUrl = datasetPath ? domain + datasetPath : domain + apiPath;
    if (datasetPath) {
      this.datasetBasePaths = [this.datasetBaseUrl];
    } else {
      this.datasetBasePaths = DATASET_BASE_PATHS.map((p) => (p ? domain + p : domain));
    }
    const consumerKey = process.env.FLUIG_CONSUMER_KEY || '';
    const consumerSecret = process.env.FLUIG_CONSUMER_SECRET || '';
    const accessToken = process.env.FLUIG_ACCESS_TOKEN || '';
    const accessTokenSecret = process.env.FLUIG_ACCESS_TOKEN_SECRET || '';

    if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
      console.warn('Fluig: Configure as variáveis OAuth (FLUIG_CONSUMER_KEY, FLUIG_CONSUMER_SECRET, FLUIG_ACCESS_TOKEN, FLUIG_ACCESS_TOKEN_SECRET)');
    }

    this.oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function: (baseString: string, key: string) =>
        crypto.createHmac('sha1', key).update(baseString).digest('base64'),
    });

    this.token = { key: accessToken, secret: accessTokenSecret };
  }

  private getAuthHeaders(url: string, method: string, useOAuth?: boolean): Record<string, string> {
    const hasOAuth = !!(process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN);
    // Importante: não enviar Authorization Bearer.
    // Alguns ambientes Fluig rejeitam Bearer (401) e funcionam apenas via OAuth 1.0.
    // Por isso sempre tentamos apenas OAuth quando disponível.
    if (hasOAuth) {
      const requestData = { url, method };
      const authData = this.oauth.authorize(requestData, this.token);
      return this.oauth.toHeader(authData) as unknown as Record<string, string>;
    }
    return {};
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: {
      useDatasetBase?: boolean;
      timeout?: number;
      extraHeaders?: Record<string, string>;
    }
  ): Promise<T> {
    const bases = options?.useDatasetBase !== false
      ? (this.workingDatasetBase ? [this.workingDatasetBase] : this.datasetBasePaths)
      : [this.baseUrl];

    const hasOAuth = !!(process.env.FLUIG_CONSUMER_KEY && process.env.FLUIG_ACCESS_TOKEN);
    let lastErr: unknown;
    for (const base of bases) {
      const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
      // Não tentar Bearer: vai direto para OAuth (quando existir).
      for (const useOAuth of [true] as const) {
        if (useOAuth && !hasOAuth) break;
        const headers = this.getAuthHeaders(url, method, useOAuth);
        const config: {
          method: 'GET' | 'POST';
          url: string;
          headers: Record<string, string>;
          timeout: number;
          data?: unknown;
        } = {
          method,
          url,
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(options?.extraHeaders || {}),
          },
          timeout: options?.timeout ?? 30000,
        };
        if (body && method === 'POST') config.data = body;

        try {
          const response = await axios.request<T>(config);
          if (options?.useDatasetBase !== false && !this.workingDatasetBase) {
            this.workingDatasetBase = base;
            console.log(`Fluig: Path funcionando: ${base} (auth: OAuth 1.0)`);
          }
          return response.data;
        } catch (err) {
          lastErr = err;
          // Se falhar, tenta o próximo path/base.
          const status = (err as AxiosError)?.response?.status;
          if (isRetryableError(err) && bases.length > 1) {
            console.warn(`Fluig: Falha em ${url} (${status}), tentando próximo path...`);
            break;
          }
          throw err;
        }
      }
    }
    throw lastErr;
  }

  async getAvailableDatasets(): Promise<string[]> {
    const result = await this.request<string[]>('GET', '/ecm/dataset/availableDatasets');
    return Array.isArray(result) ? result : [];
  }

  async getDatasetStructure(datasetId: string): Promise<FluigDatasetStructure> {
    return this.request<FluigDatasetStructure>(
      'GET',
      '/ecm/dataset/datasetStructure/' + encodeURIComponent(datasetId)
    );
  }

  private datasetCacheKey(
    datasetId: string,
    options?: { fields?: string[]; constraints?: unknown[]; order?: string[] }
  ): string {
    if (!options?.fields?.length && !options?.constraints?.length && !options?.order?.length) {
      return `dataset:${datasetId}`;
    }
    return `dataset:${datasetId}:${JSON.stringify(options)}`;
  }

  private isEmptyDatasetPayload(data: FluigDatasetValues | null | undefined): boolean {
    const values = data?.content?.values;
    return !Array.isArray(values) || values.length === 0;
  }

  private async fetchDatasetDirect(
    datasetId: string,
    options?: {
      fields?: string[];
      constraints?: Array<{
        _field: string;
        _initialValue?: string;
        _finalValue?: string;
        _type?: number;
        _likeSearch?: boolean;
      }>;
      order?: string[];
    }
  ): Promise<FluigDatasetValues> {
    const body = {
      name: datasetId,
      fields: options?.fields || [],
      constraints: options?.constraints || [],
      order: options?.order || [],
    };
    const dataTimeout = Number(process.env.FLUIG_DATASET_TIMEOUT_MS) || 120000;
    return this.request<FluigDatasetValues>('POST', '/ecm/dataset/datasets', body, {
      timeout: dataTimeout,
    });
  }

  async getDatasetData(
    datasetId: string,
    options?: {
      fields?: string[];
      constraints?: Array<{
        _field: string;
        _initialValue?: string;
        _finalValue?: string;
        _type?: number;
        _likeSearch?: boolean;
      }>;
      order?: string[];
    }
  ): Promise<FluigDatasetValues> {
    const cacheKey = this.datasetCacheKey(datasetId, options);
    const cached = this.datasetCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      const emptyCached = this.isEmptyDatasetPayload(cached.data);

      // Resposta vazia no cache costuma ser falha transitória do Fluig — não servir por minutos.
      if (emptyCached) {
        this.datasetCache.delete(cacheKey);
      } else if (age <= CACHE_STALE_TTL_MS) {
        // Retorna do cache imediatamente
        if (age > CACHE_FRESH_TTL_MS && !cached.refreshing) {
          // Cache ficou stale: dispara refresh em background sem bloquear a resposta
          cached.refreshing = true;
          this.fetchDatasetDirect(datasetId, options)
            .then((data) => {
              if (this.isEmptyDatasetPayload(data)) {
                cached.refreshing = false;
                console.warn(`⚠️  Fluig refresh BG retornou vazio (${datasetId}); mantendo cache anterior`);
                return;
              }
              this.datasetCache.set(cacheKey, { data, fetchedAt: Date.now(), refreshing: false });
              console.log(`✅ Fluig cache atualizado em BG: ${datasetId} (${data.content?.values?.length ?? 0} rows)`);
            })
            .catch((err) => {
              cached.refreshing = false;
              console.warn(`⚠️  Fluig cache BG refresh falhou (${datasetId}):`, (err as Error).message);
            });
        }
        return cached.data;
      }
    }

    // Cache vazio ou expirado: busca síncrona
    const data = await this.fetchDatasetDirect(datasetId, options);
    const rowCount = data?.content?.values?.length ?? 0;
    if (this.isEmptyDatasetPayload(data)) {
      console.warn(`⚠️  Fluig dataset ${datasetId} retornou 0 registros — não cacheando`);
      return data;
    }
    this.datasetCache.set(cacheKey, { data, fetchedAt: Date.now(), refreshing: false });
    console.log(`✅ Fluig dataset ${datasetId}: ${rowCount} registro(s) em cache`);
    return data;
  }

  /** Pré-aquece o cache dos datasets informados (executar após subir o servidor). */
  async warmupDatasets(datasetIds: string[]): Promise<void> {
    console.log(`🔥 Fluig: pré-carregando ${datasetIds.length} dataset(s) em background...`);
    await Promise.allSettled(
      datasetIds.map((id) =>
        this.getDatasetData(id)
          .then(() => console.log(`✅ Fluig cache warm: ${id}`))
          .catch((err) =>
            console.warn(`⚠️  Fluig warmup ${id} falhou:`, (err as Error).message)
          )
      )
    );
  }

  /**
   * Inicia refresh periódico dos datasets para manter o cache sempre quente.
   * Retorna o NodeJS.Timeout para que o chamador possa cancelar se necessário.
   */
  startPeriodicRefresh(
    datasetIds: string[],
    intervalMs = 8 * 60 * 1000
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      for (const id of datasetIds) {
        const cacheKey = this.datasetCacheKey(id);
        const entry = this.datasetCache.get(cacheKey);
        if (entry?.refreshing) continue;

        if (entry) entry.refreshing = true;
        this.fetchDatasetDirect(id)
          .then((data) => {
            if (!Array.isArray(data?.content?.values) || data.content.values.length === 0) {
              if (entry) entry.refreshing = false;
              console.warn(`⚠️  Fluig refresh periódico ${id} retornou vazio; mantendo cache anterior`);
              return;
            }
            this.datasetCache.set(cacheKey, { data, fetchedAt: Date.now(), refreshing: false });
            console.log(`✅ Fluig refresh periódico: ${id} (${data.content?.values?.length ?? 0} rows)`);
          })
          .catch((err) => {
            if (entry) entry.refreshing = false;
            console.warn(`⚠️  Fluig refresh periódico ${id} falhou:`, (err as Error).message);
          });
      }
    }, intervalMs);
  }

  async searchDataset(
    datasetId: string,
    options?: {
      searchField?: string;
      searchValue?: string;
      filterFields?: string[];
      resultFields?: string[];
      likeField?: string;
      likeValue?: string;
      limit?: number;
      orderBy?: string;
    }
  ): Promise<FluigDatasetValues> {
    const body = {
      datasetId,
      searchField: options?.searchField || '',
      searchValue: options?.searchValue || '',
      filterFields: options?.filterFields || [],
      resultFields: options?.resultFields || [],
      likeField: options?.likeField || '',
      likeValue: options?.likeValue || '',
      limit: String(options?.limit || 100),
      orderBy: options?.orderBy || '',
    };
    const dataTimeout = Number(process.env.FLUIG_DATASET_TIMEOUT_MS) || 120000;
    return this.request<FluigDatasetValues>('POST', '/ecm/dataset/search', body, {
      timeout: dataTimeout,
    });
  }

  private domainBase(): string {
    return (process.env.FLUIG_BASE_URL || 'https://gennesisengenharia160516.fluig.cloudtotvs.com.br').replace(
      /\/$/,
      ''
    );
  }

  /** Aceita URL absoluta ou caminho relativo do Fluig (`/portal/...`, `/webdesk/...`). */
  private normalizeFluigFileUrl(raw: string | null | undefined): string | null {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    if (t.startsWith('/')) return `${this.domainBase()}${t}`;
    return null;
  }

  private extractDownloadUrl(payload: unknown): string | null {
    if (typeof payload === 'string') {
      return this.normalizeFluigFileUrl(payload);
    }
    if (!payload || typeof payload !== 'object') return null;
    const obj = payload as Record<string, unknown>;
    const content = obj.content;
    if (typeof content === 'string') {
      const fromContent = this.normalizeFluigFileUrl(content);
      if (fromContent) return fromContent;
    }
    if (content && typeof content === 'object') {
      const nested = content as Record<string, unknown>;
      for (const key of ['downloadURL', 'downloadUrl', 'url', 'content']) {
        const fromNested = this.normalizeFluigFileUrl(
          typeof nested[key] === 'string' ? (nested[key] as string) : null
        );
        if (fromNested) return fromNested;
      }
    }
    for (const key of ['downloadURL', 'downloadUrl', 'url']) {
      const fromObj = this.normalizeFluigFileUrl(
        typeof obj[key] === 'string' ? (obj[key] as string) : null
      );
      if (fromObj) return fromObj;
    }
    return null;
  }

  private fluigCompanyIdHeader(): Record<string, string> {
    const companyId = String(process.env.FLUIG_COMPANY_ID || '1').trim() || '1';
    return {
      companyId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /** Resolve URL temporária de download do documento no Fluig (GED). */
  async getDocumentDownloadUrl(documentId: string): Promise<string | null> {
    const id = String(documentId || '').trim();
    if (!/^\d+$/.test(id)) return null;

    const paths = [
      `/ecm/document/downloadURL/${encodeURIComponent(id)}`,
      `/2.0/documents/getDownloadURL/${encodeURIComponent(id)}`,
      `/ecm/document/liveurl/${encodeURIComponent(id)}`,
    ];

    for (const path of paths) {
      try {
        const data = await this.request<unknown>('GET', path, undefined, {
          useDatasetBase: true,
          timeout: 60000,
          extraHeaders: this.fluigCompanyIdHeader(),
        });
        const url = this.extractDownloadUrl(data);
        if (url) return url;
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        console.warn(`Fluig: downloadURL falhou em ${path} (${status ?? 'erro'})`);
      }
    }
    return null;
  }

  private getBearerAuthHeaders(): Record<string, string> | null {
    const bearer = (process.env.FLUIG_BEARER_TOKEN || '').trim();
    if (!bearer) return null;
    return { Authorization: `Bearer ${bearer}` };
  }

  /** Fluig às vezes responde 200 com texto de erro no corpo (não é o arquivo). */
  private assertFluigFileBuffer(
    buffer: Buffer,
    contentType: string | null
  ): void {
    if (!buffer.length) {
      throw Object.assign(new Error('Arquivo vazio retornado pelo Fluig'), { status: 502 });
    }

    const ct = (contentType || '').toLowerCase();
    const looksBinary =
      ct.includes('pdf') ||
      ct.includes('image/') ||
      ct.includes('octet-stream') ||
      ct.includes('spreadsheet') ||
      ct.includes('msword') ||
      ct.includes('officedocument') ||
      ct.includes('zip') ||
      ct.includes('excel');

    // PDF / ZIP / Office começam com assinaturas binárias conhecidas.
    const head = buffer.subarray(0, Math.min(buffer.length, 8));
    const isPdf = head.length >= 4 && head.toString('utf8', 0, 4) === '%PDF';
    const isZip = head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b; // xlsx/docx
    if (isPdf || isZip) return;
    if (looksBinary && buffer.length > 512) return;

    const sample = buffer
      .subarray(0, Math.min(buffer.length, 400))
      .toString('utf8')
      .replace(/\u0000/g, '')
      .trim();
    const lower = sample.toLowerCase();
    if (
      lower.includes('not allowed') ||
      lower.includes('não possui permissão') ||
      lower.includes('nao possui permissao') ||
      lower.includes('sem permissão') ||
      lower.includes('sem permissao') ||
      lower.includes('user not allowed') ||
      lower.includes('access denied') ||
      lower.includes('forbidden')
    ) {
      throw Object.assign(
        new Error(
          'O usuário da integração Fluig não tem permissão para ver este anexo no GED. No Fluig, libere leitura/download de documentos para o usuário OAuth (PowerBI) ou use um usuário com papel admin.'
        ),
        { status: 403 }
      );
    }

    // Redirect HTML de login (/portal/home) = API de stream sem sessão válida.
    if (
      lower.includes('window.location') ||
      lower.includes('/portal/home') ||
      lower.includes('<html')
    ) {
      throw Object.assign(
        new Error(
          'Fluig devolveu a tela de login em vez do arquivo. Confirme que o dataset DS_DownloadDocumento está publicado e, no Fluig, teste-o com a constraint documentId = ID do anexo. Depois tente Ver/Baixar de novo.'
        ),
        { status: 502 }
      );
    }

    // Corpo curto em texto/html provavelmente é página de erro.
    if (
      buffer.length < 2048 &&
      (ct.includes('text/') || ct.includes('html') || ct.includes('json') || !ct)
    ) {
      throw Object.assign(
        new Error('Fluig recusou o download do arquivo'),
        { status: 502 }
      );
    }
  }

  private async fetchBinaryFromUrl(
    url: string,
    auth: 'none' | 'oauth' | 'bearer'
  ): Promise<{ buffer: Buffer; contentType: string | null }> {
    let headers: Record<string, string> = {};
    if (auth === 'oauth') headers = this.getAuthHeaders(url, 'GET');
    if (auth === 'bearer') {
      const bearerHeaders = this.getBearerAuthHeaders();
      if (!bearerHeaders) {
        throw Object.assign(new Error('FLUIG_BEARER_TOKEN não configurado'), { status: 500 });
      }
      headers = bearerHeaders;
    }
    const response = await axios.get<ArrayBuffer>(url, {
      headers,
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 80 * 1024 * 1024,
      maxBodyLength: 80 * 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const contentType =
      typeof response.headers['content-type'] === 'string'
        ? response.headers['content-type']
        : null;
    const buffer = Buffer.from(response.data);
    this.assertFluigFileBuffer(buffer, contentType);
    return { buffer, contentType };
  }

  /**
   * Dataset Fluig opcional que gera URL com `fluigAPI.getDocumentService().getDownloadURL`.
   * Env: FLUIG_DOCUMENT_URL_DATASET (padrão: DS_DownloadDocumento).
   */
  private async getDocumentDownloadUrlViaDataset(documentId: string): Promise<string | null> {
    const datasetId = (process.env.FLUIG_DOCUMENT_URL_DATASET || 'DS_DownloadDocumento').trim();
    if (!datasetId) return null;
    try {
      const data = await this.fetchDatasetDirect(datasetId, {
        constraints: [
          {
            _field: 'documentId',
            _initialValue: documentId,
            _finalValue: documentId,
            _type: 1,
            _likeSearch: false,
          },
        ],
      });
      const rows = data?.content?.values;
      if (!Array.isArray(rows) || rows.length === 0) {
        console.warn(`Fluig: dataset ${datasetId} sem linhas para documentId=${documentId}`);
        return null;
      }
      const row = rows[0] as Record<string, unknown>;
      const erro =
        String(row.erro ?? row.ERRO ?? row.error ?? row.ERROR ?? '').trim();
      if (erro && !/^ok$/i.test(erro)) {
        console.warn(`Fluig: dataset ${datasetId} retornou erro: ${erro}`);
      }
      for (const key of Object.keys(row)) {
        if (/url|download|link/i.test(key)) {
          const fromKey = this.normalizeFluigFileUrl(String(row[key] ?? ''));
          if (fromKey) return fromKey;
        }
      }
      for (const v of Object.values(row)) {
        const fromVal = this.normalizeFluigFileUrl(String(v ?? ''));
        if (fromVal) return fromVal;
      }
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      // Dataset ainda não publicado → 404/500; seguimos para os fallbacks.
      console.warn(
        `Fluig: dataset ${datasetId} para download falhou (${status ?? 'erro'}). ` +
          'Confirme se está publicado (não só salvo) com o código exato DS_DownloadDocumento.'
      );
    }
    return null;
  }

  /**
   * Baixa o binário do documento Fluig para proxy no nosso backend
   * (visualizar/baixar no sistema sem abrir o portal).
   */
  /** Decodifica segmentos base64 de `/volume/stream/...` e devolve o mapa de query. */
  private parseFluigVolumeUrlParams(url: string): URLSearchParams | null {
    try {
      const u = new URL(url);
      const marker = '/volume/stream/';
      const idx = u.pathname.indexOf(marker);
      if (idx < 0) return null;
      const segments = u.pathname
        .slice(idx + marker.length)
        .split('/')
        .filter(Boolean)
        .map((s) => decodeURIComponent(s));
      for (const seg of segments) {
        let decoded = '';
        try {
          decoded = Buffer.from(seg, 'base64').toString('utf8');
        } catch {
          continue;
        }
        if (!decoded.includes('id=') && !decoded.includes('file=') && !decoded.includes('size=')) {
          continue;
        }
        return new URLSearchParams(decoded.replace(/^\?/, ''));
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractFilenameFromFluigVolumeUrl(url: string): string | null {
    const params = this.parseFluigVolumeUrlParams(url);
    if (!params) return null;
    const raw = String(params.get('file') || '').trim();
    if (!raw) return null;
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' ')).trim() || null;
    } catch {
      return raw.replace(/\+/g, ' ').trim() || null;
    }
  }

  /**
   * Metadados leves do anexo (nome real no GED + se está vazio),
   * sem baixar o binário — usado para corrigir ordem nomes/ids do dataset.
   */
  async getDocumentFileMeta(documentId: string): Promise<{
    documentId: string;
    filename: string | null;
    empty: boolean;
  }> {
    const id = String(documentId || '').trim();
    if (!/^\d+$/.test(id)) {
      return { documentId: id, filename: null, empty: true };
    }
    const fromDataset = await this.getDocumentDownloadUrlViaDataset(id);
    const fromApi = fromDataset ? null : await this.getDocumentDownloadUrl(id);
    const url = fromDataset || fromApi;
    if (!url) {
      return { documentId: id, filename: null, empty: false };
    }
    if (this.isEmptyFluigVolumeUrl(url)) {
      return { documentId: id, filename: null, empty: true };
    }
    return {
      documentId: id,
      filename: this.extractFilenameFromFluigVolumeUrl(url),
      empty: false,
    };
  }

  /** URLs do volume Fluig com size=0 / file vazio = documento sem conteúdo baixável. */
  private isEmptyFluigVolumeUrl(url: string): boolean {
    const params = this.parseFluigVolumeUrlParams(url);
    if (params) {
      const size = String(params.get('size') || '').trim();
      const file = String(params.get('file') || '').trim();
      if (size === '0' || size === '0.0' || size === '0.00') return true;
      if (!file && Number(size || '0') === 0) return true;
      return false;
    }
    return /[?&]size=0(\.0+)?(?:&|$)/i.test(url) && /[?&]file=(?:&|$)/i.test(url);
  }

  async downloadDocumentFile(documentId: string): Promise<{
    buffer: Buffer;
    contentType: string;
  }> {
    const id = String(documentId || '').trim();
    if (!/^\d+$/.test(id)) {
      throw Object.assign(new Error('ID de documento inválido'), { status: 400 });
    }

    const urlCandidates: string[] = [];
    const fromDataset = await this.getDocumentDownloadUrlViaDataset(id);
    if (fromDataset) urlCandidates.push(fromDataset);
    const fromApi = await this.getDocumentDownloadUrl(id);
    if (fromApi && !urlCandidates.includes(fromApi)) urlCandidates.push(fromApi);

    for (const u of urlCandidates) {
      if (this.isEmptyFluigVolumeUrl(u)) {
        throw Object.assign(
          new Error(
            'Este anexo não tem arquivo no Fluig (documento vazio ou só pasta). Tente o PDF/Excel da lista.'
          ),
          { status: 404 }
        );
      }
    }

    urlCandidates.push(
      `${this.domainBase()}/webdesk/streamcontrol/${encodeURIComponent(id)}/1000/${encodeURIComponent(id)}`
    );

    const authModes: Array<'none' | 'oauth' | 'bearer'> = ['none', 'oauth'];
    if (this.getBearerAuthHeaders()) authModes.push('bearer');

    let lastPermissionError: Error | null = null;
    let lastError: Error | null = null;
    let hadDatasetOrApiUrl = Boolean(fromDataset || fromApi);

    for (const url of urlCandidates) {
      for (const auth of authModes) {
        try {
          const file = await this.fetchBinaryFromUrl(url, auth);
          return {
            buffer: file.buffer,
            contentType: file.contentType || 'application/octet-stream',
          };
        } catch (err) {
          const e = err as Error & { status?: number };
          lastError = e;
          if (e.status === 403 || /permiss/i.test(e.message || '')) {
            lastPermissionError = e;
          } else {
            console.warn(
              `Fluig: download falhou (${auth}) ${url.slice(0, 80)}…`,
              e.message
            );
          }
        }
      }
    }

    if (lastPermissionError) {
      throw lastPermissionError;
    }
    if (hadDatasetOrApiUrl) {
      throw Object.assign(
        new Error(
          'O Fluig gerou o link do anexo, mas o arquivo não baixou (documento vazio ou indisponível). Tente outro anexo da lista.'
        ),
        { status: 502 }
      );
    }
    throw Object.assign(
      lastError || new Error('Não foi possível obter o arquivo no Fluig'),
      { status: (lastError as { status?: number })?.status || 502 }
    );
  }
}
