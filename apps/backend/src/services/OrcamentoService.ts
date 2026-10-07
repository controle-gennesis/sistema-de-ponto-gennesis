import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { isS3NoSuchKey, s3BodyToString } from '../lib/awsS3Compat';

export interface OrcamentoData {
  servicos: unknown[];
  composicoes: unknown[];
  imports: unknown[];
  /** Rascunho da aba Orçamento (itens no orçamento, quantidades, dimensões, itens ocultos). */
  sessaoOrcamento?: unknown;
}

export interface OrcamentoIndexEntry {
  id: string;
  nome: string;
  updatedAt: string;
  /** Espelha sessao.meta.statusAprovacao para a lista sem abrir o detalhe. */
  statusAprovacao?: string;
  /** Progresso da ficha de demanda (0–100), espelhado da meta. */
  fichaDemandaPct?: number;
  /** BDI em pontos percentuais (ex.: 28.35), espelhado da meta. */
  bdiPercentual?: number;
  /** Total com BDI (R$), espelhado da meta. */
  totalComBdi?: number;
  /** Progresso físico do cronograma (%), espelhado de meta.cronogramaResumo. */
  cronogramaProgressoFisico?: number;
  /** Etapas concluídas no cronograma. */
  cronogramaConcluido?: number;
  /** Total de etapas no cronograma. */
  cronogramaTotalEtapas?: number;
  /** Etapas atrasadas no cronograma. */
  cronogramaAtrasado?: number;
  /** Id da 1ª versão da linhagem (orçamentos antigos: igual ao próprio id). */
  familiaId?: string;
  /** Número da versão (1, 2, 3…). */
  versao?: number;
  /** Versões anteriores ficam congeladas (somente leitura). */
  congelado?: boolean;
  /** Id da versão de onde esta foi clonada. */
  origemVersaoId?: string;
}

/** Normaliza campos de versão no índice (compat com orçamentos antigos). */
export function normalizeOrcamentoVersionFields(entry: OrcamentoIndexEntry): OrcamentoIndexEntry {
  const familiaId =
    typeof entry.familiaId === 'string' && entry.familiaId.trim()
      ? entry.familiaId.trim()
      : entry.id;
  const versaoRaw = Number(entry.versao);
  const versao = Number.isFinite(versaoRaw) && versaoRaw >= 1 ? Math.floor(versaoRaw) : 1;
  const congelado = entry.congelado === true;
  const origemVersaoId =
    typeof entry.origemVersaoId === 'string' && entry.origemVersaoId.trim()
      ? entry.origemVersaoId.trim()
      : undefined;
  return {
    ...entry,
    familiaId,
    versao,
    congelado,
    ...(origemVersaoId ? { origemVersaoId } : {}),
  };
}

export interface OrcamentoIndex {
  ultimoOrcamentoId?: string;
  orcamentos: OrcamentoIndexEntry[];
  /** 2+ = total da lista não usa mais totaisOrcafascio (só rodapé). */
  listaFinVersion?: number;
}

/** Serviços padrão + histórico de importações — compartilhado por todos os orçamentos do contrato. */
export interface ServicosPadraoData {
  servicos: unknown[];
  imports: unknown[];
}

const EMPTY_DATA: OrcamentoData = {
  servicos: [],
  composicoes: [],
  imports: []
};

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** Converte "28,35" / "28.35" / 28.35 → pontos percentuais. */
function parseBdiPercentualPoints(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  const limpo = raw.replace('%', '').trim();
  if (!limpo) return undefined;
  const n = limpo.includes(',')
    ? Number(limpo.replace(/\./g, '').replace(',', '.'))
    : Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

function extractListaFinanceiroFromMeta(meta: Record<string, unknown> | undefined): {
  bdiPercentual?: number;
  totalComBdi?: number;
} {
  if (!meta) return {};
  const bdiPercentual = parseBdiPercentualPoints(meta.bdiPercentual);
  // Só meta.totalComBdi (espelho do rodapé). Não usa totaisOrcafascio — divergem da montagem.
  const totalDirect = Number(meta.totalComBdi);
  if (Number.isFinite(totalDirect) && totalDirect > 0) {
    return { ...(bdiPercentual !== undefined ? { bdiPercentual } : {}), totalComBdi: totalDirect };
  }
  return bdiPercentual !== undefined ? { bdiPercentual } : {};
}

function extractCronogramaResumoFromMeta(meta: Record<string, unknown> | undefined): {
  cronogramaProgressoFisico?: number;
  cronogramaConcluido?: number;
  cronogramaTotalEtapas?: number;
  cronogramaAtrasado?: number;
} {
  if (!meta) return {};
  const raw = meta.cronogramaResumo;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const progressoFisico = Number(o.progressoFisico);
  const concluido = Number(o.concluido);
  const totalEtapas = Number(o.totalEtapas);
  const atrasado = Number(o.atrasado);
  if (![progressoFisico, concluido, totalEtapas, atrasado].every(n => Number.isFinite(n))) {
    return {};
  }
  return {
    cronogramaProgressoFisico: Math.max(0, Math.min(100, progressoFisico)),
    cronogramaConcluido: Math.max(0, Math.round(concluido)),
    cronogramaTotalEtapas: Math.max(0, Math.round(totalEtapas)),
    cronogramaAtrasado: Math.max(0, Math.round(atrasado))
  };
}

export class OrcamentoService {
  private s3: S3Client | null;
  private bucketName: string;
  private useLocal: boolean;
  private localBasePath: string;

  /** Migração legado já feita neste processo (evita N× getObject por request). */
  private migratedCentros = new Set<string>();

  /** Cache SWR do detalhe (padrão Fluig): fresco ~5 min, servível ~20 min. */
  private static readonly DETAIL_FRESH_MS = 5 * 60 * 1000;
  private static readonly DETAIL_STALE_MS = 20 * 60 * 1000;
  private orcamentoDetailCache = new Map<
    string,
    { data: OrcamentoData; fetchedAt: number; refreshing: boolean }
  >();
  private padraoCache = new Map<
    string,
    { data: ServicosPadraoData; fetchedAt: number; refreshing: boolean }
  >();

  constructor() {
    this.useLocal =
      (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local' ||
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY;

    this.s3 = this.useLocal
      ? null
      : new S3Client({
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          },
          region: process.env.AWS_REGION || 'us-east-1'
        });

    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
    this.localBasePath = path.join(process.cwd(), 'uploads', 'orcamentos');
  }

  private getLegacyDataKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/data.json';
  }

  private getIndexKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/index.json';
  }

  private getOrcamentoDataKey(centroCustoId: string, orcamentoId: string): string {
    return 'orcamentos/' + centroCustoId + '/' + orcamentoId + '.json';
  }

  private getServicosPadraoKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/servicos-padrao.json';
  }

  private localServicosPadraoPath(centroCustoId: string): string {
    return path.join(this.localDir(centroCustoId), 'servicos-padrao.json');
  }

  private getComposicoesGeralKey(): string {
    return 'orcamentos/composicoes-geral/data.json';
  }

  private localDir(centroCustoId: string): string {
    return path.join(this.localBasePath, centroCustoId);
  }

  private localLegacyPath(centroCustoId: string): string {
    return path.join(this.localDir(centroCustoId), 'data.json');
  }

  private localIndexPath(centroCustoId: string): string {
    return path.join(this.localDir(centroCustoId), 'index.json');
  }

  private localOrcamentoPath(centroCustoId: string, orcamentoId: string): string {
    return path.join(this.localDir(centroCustoId), `${orcamentoId}.json`);
  }

  private hasOrcamentoPerfeitoImport(imports: unknown[]): boolean {
    if (!Array.isArray(imports) || imports.length === 0) return false;
    return imports.some((imp) => {
      if (!imp || typeof imp !== 'object') return false;
      const origem = (imp as { origem?: unknown }).origem;
      return origem === 'orcamento-perfeito';
    });
  }

  async migrateLegacyIfNeeded(centroCustoId: string): Promise<void> {
    if (this.migratedCentros.has(centroCustoId)) return;
    const indexPath = this.localIndexPath(centroCustoId);
    const legacyPath = this.localLegacyPath(centroCustoId);

    if (this.useLocal || !this.s3) {
      if (!fs.existsSync(legacyPath)) {
        this.migratedCentros.add(centroCustoId);
        return;
      }
      if (fs.existsSync(indexPath)) {
        try {
          const raw = fs.readFileSync(indexPath, 'utf-8');
          const idx = JSON.parse(raw) as OrcamentoIndex;
          if (idx?.orcamentos?.length) {
            this.migratedCentros.add(centroCustoId);
            return;
          }
        } catch {
          /* continua migração */
        }
      }
      let rawLegacy: string;
      try {
        rawLegacy = fs.readFileSync(legacyPath, 'utf-8');
      } catch {
        this.migratedCentros.add(centroCustoId);
        return;
      }
      let legacy: OrcamentoData;
      try {
        legacy = JSON.parse(rawLegacy) as OrcamentoData;
      } catch {
        this.migratedCentros.add(centroCustoId);
        return;
      }
      const id = randomUUID();
      const nome = 'Orçamento (importado)';
      const updatedAt = new Date().toISOString();
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      await this.saveServicosPadrao(centroCustoId, {
        servicos: legacy.servicos || [],
        imports: legacy.imports || []
      });
      fs.writeFileSync(
        this.localOrcamentoPath(centroCustoId, id),
        JSON.stringify({ sessaoOrcamento: legacy.sessaoOrcamento }),
        'utf-8'
      );
      const index: OrcamentoIndex = {
        ultimoOrcamentoId: id,
        orcamentos: [{ id, nome, updatedAt }]
      };
      fs.writeFileSync(indexPath, JSON.stringify(index, null, 0), 'utf-8');
      try {
        fs.renameSync(legacyPath, legacyPath + '.migrated.bak');
      } catch {
        /* ok */
      }
      this.migratedCentros.add(centroCustoId);
      return;
    }

    // S3: migra só se não houver índice com orçamentos
    try {
      const idxObj = await this.s3!.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: this.getIndexKey(centroCustoId) })
      );
      const rawIdx = idxObj.Body ? await s3BodyToString(idxObj.Body) : '';
      if (rawIdx) {
        const idx = JSON.parse(rawIdx) as OrcamentoIndex;
        if (idx?.orcamentos?.length) {
          this.migratedCentros.add(centroCustoId);
          return;
        }
      }
    } catch (err: unknown) {
      if (!isS3NoSuchKey(err)) throw err;
    }

    let legacyBody: string | undefined;
    try {
      const r = await this.s3!.send(
        new GetObjectCommand({ Bucket: this.bucketName, Key: this.getLegacyDataKey(centroCustoId) })
      );
      legacyBody = r.Body ? await s3BodyToString(r.Body) : undefined;
    } catch (err: unknown) {
      if (isS3NoSuchKey(err)) {
        this.migratedCentros.add(centroCustoId);
        return;
      }
      throw err;
    }
    if (!legacyBody) {
      this.migratedCentros.add(centroCustoId);
      return;
    }
    let legacy: OrcamentoData;
    try {
      legacy = JSON.parse(legacyBody) as OrcamentoData;
    } catch {
      this.migratedCentros.add(centroCustoId);
      return;
    }
    const id = randomUUID();
    const nome = 'Orçamento (importado)';
    const updatedAt = new Date().toISOString();
    await this.saveServicosPadrao(centroCustoId, {
      servicos: legacy.servicos || [],
      imports: legacy.imports || []
    });
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getOrcamentoDataKey(centroCustoId, id),
        Body: JSON.stringify({ sessaoOrcamento: legacy.sessaoOrcamento }),
        ContentType: 'application/json'
      })
    );
    const index: OrcamentoIndex = {
      ultimoOrcamentoId: id,
      orcamentos: [{ id, nome, updatedAt }]
    };
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getIndexKey(centroCustoId),
        Body: JSON.stringify(index),
        ContentType: 'application/json'
      })
    );
    this.migratedCentros.add(centroCustoId);
  }

  private async readIndexRaw(centroCustoId: string): Promise<OrcamentoIndex | null> {
    try {
      if (this.useLocal || !this.s3) {
        const p = this.localIndexPath(centroCustoId);
        if (!fs.existsSync(p)) return null;
        const raw = fs.readFileSync(p, 'utf-8');
        const idx = JSON.parse(raw) as OrcamentoIndex;
        const orcamentos = (Array.isArray(idx.orcamentos) ? idx.orcamentos : []).map(
          normalizeOrcamentoVersionFields
        );
        return {
          ultimoOrcamentoId: idx.ultimoOrcamentoId,
          orcamentos,
          ...(typeof idx.listaFinVersion === 'number' ? { listaFinVersion: idx.listaFinVersion } : {})
        };
      }
      const result = await this.s3!.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: this.getIndexKey(centroCustoId)
        })
      );
      if (!result.Body) return null;
      const body = await s3BodyToString(result.Body);
      const idx = JSON.parse(body) as OrcamentoIndex;
      const orcamentos = (Array.isArray(idx.orcamentos) ? idx.orcamentos : []).map(
        normalizeOrcamentoVersionFields
      );
      return {
        ultimoOrcamentoId: idx.ultimoOrcamentoId,
        orcamentos,
        ...(typeof idx.listaFinVersion === 'number' ? { listaFinVersion: idx.listaFinVersion } : {})
      };
    } catch (err: unknown) {
      if (isS3NoSuchKey(err)) return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  async getIndex(centroCustoId: string): Promise<OrcamentoIndex> {
    // 1 leitura: se já tem índice, não chama migrate (antes eram 2× getObject no S3).
    const existing = await this.readIndexRaw(centroCustoId);
    if (existing && existing.orcamentos.length > 0) {
      return this.enrichIndexListaFinanceiro(centroCustoId, existing);
    }

    await this.migrateLegacyIfNeeded(centroCustoId);
    const after = await this.readIndexRaw(centroCustoId);
    const base = after ?? { orcamentos: [] };
    if (base.orcamentos.length === 0) return base;
    return this.enrichIndexListaFinanceiro(centroCustoId, base);
  }

  /** Preenche BDI % no índice; remove Total semeado do Orçafascio (vira 0 até o rodapé sincronizar). */
  private async enrichIndexListaFinanceiro(
    centroCustoId: string,
    index: OrcamentoIndex
  ): Promise<OrcamentoIndex> {
    const LISTA_FIN_VERSION = 2;
    const needsBdiFill = index.orcamentos.some(o => o.bdiPercentual == null);
    const needsOrcafascioScrub = (index.listaFinVersion ?? 0) < LISTA_FIN_VERSION;
    if (!needsBdiFill && !needsOrcafascioScrub) return index;

    let changed = needsOrcafascioScrub;
    const orcamentos: OrcamentoIndexEntry[] = [];

    for (const o of index.orcamentos) {
      if (o.bdiPercentual != null && !needsOrcafascioScrub) {
        orcamentos.push(o);
        continue;
      }

      try {
        const file = await this.readOrcamentoFile(centroCustoId, o.id);
        const metaRaw = (file?.sessaoOrcamento as { meta?: Record<string, unknown> } | undefined)?.meta;
        const fin = extractListaFinanceiroFromMeta(metaRaw);
        const orcaComBdi = Number(
          metaRaw?.totaisOrcafascio && typeof metaRaw.totaisOrcafascio === 'object'
            ? (metaRaw.totaisOrcafascio as { comBdi?: unknown }).comBdi
            : undefined
        );
        const totalEhOrcafascio =
          needsOrcafascioScrub &&
          o.totalComBdi != null &&
          Number.isFinite(orcaComBdi) &&
          Math.abs((o.totalComBdi ?? 0) - orcaComBdi) < 0.02;

        const next: OrcamentoIndexEntry = {
          ...o,
          bdiPercentual:
            o.bdiPercentual != null && o.bdiPercentual > 0
              ? o.bdiPercentual
              : fin.bdiPercentual ?? o.bdiPercentual ?? 0,
          totalComBdi: totalEhOrcafascio
            ? 0
            : o.totalComBdi != null && o.totalComBdi > 0
              ? o.totalComBdi
              : fin.totalComBdi ?? o.totalComBdi ?? 0
        };
        if (next.bdiPercentual !== o.bdiPercentual || next.totalComBdi !== o.totalComBdi) {
          changed = true;
        }
        orcamentos.push(next);
      } catch {
        orcamentos.push({
          ...o,
          bdiPercentual: o.bdiPercentual ?? 0,
          totalComBdi: o.totalComBdi ?? 0
        });
        if (o.bdiPercentual == null) changed = true;
      }
    }

    if (!changed && (index.listaFinVersion ?? 0) >= LISTA_FIN_VERSION) return index;
    const nextIndex: OrcamentoIndex = {
      ...index,
      orcamentos,
      listaFinVersion: LISTA_FIN_VERSION
    };
    try {
      await this.writeIndex(centroCustoId, nextIndex);
    } catch {
      /* leitura ok mesmo se persistir falhar */
    }
    return nextIndex;
  }

  private async writeIndex(centroCustoId: string, index: OrcamentoIndex): Promise<void> {
    const body = JSON.stringify(index);
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localIndexPath(centroCustoId), body, 'utf-8');
      return;
    }
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getIndexKey(centroCustoId),
        Body: body,
        ContentType: 'application/json'
      })
    );
  }

  private async writeOrcamentoFileRaw(
    centroCustoId: string,
    orcamentoId: string,
    data: OrcamentoData | Record<string, unknown>
  ): Promise<void> {
    const body = JSON.stringify(data);
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localOrcamentoPath(centroCustoId, orcamentoId), body, 'utf-8');
      return;
    }
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getOrcamentoDataKey(centroCustoId, orcamentoId),
        Body: body,
        ContentType: 'application/json',
      })
    );
  }

  private isOrcamentoCongelado(
    indexEntry: OrcamentoIndexEntry | undefined,
    file: Partial<OrcamentoData> | null | undefined
  ): boolean {
    if (indexEntry?.congelado === true) return true;
    const meta = (file?.sessaoOrcamento as { meta?: Record<string, unknown> } | undefined)?.meta;
    return meta?.congelado === true;
  }

  /** Lê arquivo JSON do orçamento (sem merge com serviços do contrato). */
  async readOrcamentoFile(centroCustoId: string, orcamentoId: string): Promise<OrcamentoData | null> {
    if (!isUuid(orcamentoId)) return null;
    await this.migrateLegacyIfNeeded(centroCustoId);
    try {
      if (this.useLocal || !this.s3) {
        const p = this.localOrcamentoPath(centroCustoId, orcamentoId);
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as OrcamentoData;
      }
      const result = await this.s3!.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: this.getOrcamentoDataKey(centroCustoId, orcamentoId)
        })
      );
      if (!result.Body) return null;
      const body = await s3BodyToString(result.Body);
      return JSON.parse(body) as OrcamentoData;
    } catch (err: unknown) {
      if (isS3NoSuchKey(err)) return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  async readServicosPadraoFile(centroCustoId: string): Promise<ServicosPadraoData | null> {
    try {
      if (this.useLocal || !this.s3) {
        const p = this.localServicosPadraoPath(centroCustoId);
        if (!fs.existsSync(p)) return null;
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as ServicosPadraoData;
      }
      const result = await this.s3!.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: this.getServicosPadraoKey(centroCustoId)
        })
      );
      if (!result.Body) return null;
      const body = await s3BodyToString(result.Body);
      return JSON.parse(body) as ServicosPadraoData;
    } catch (err: unknown) {
      if (isS3NoSuchKey(err)) return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  /**
   * Se existir orçamento antigo com serviços só no arquivo por ID, copia para servicos-padrao.json uma vez.
   */
  async migrateServicosPadraoFromOrcamentosIfNeeded(centroCustoId: string): Promise<void> {
    const existing = await this.readServicosPadraoFile(centroCustoId);
    const hasPadrao =
      existing &&
      Array.isArray(existing.servicos) &&
      existing.servicos.length > 0;
    if (hasPadrao) return;

    const index = await this.getIndex(centroCustoId);
    for (const o of index.orcamentos) {
      const raw = await this.readOrcamentoFile(centroCustoId, o.id);
      if (!raw) continue;
      const servicos = raw.servicos;
      if (Array.isArray(servicos) && servicos.length > 0) {
        await this.saveServicosPadrao(centroCustoId, {
          servicos,
          imports: Array.isArray(raw.imports) ? raw.imports : []
        });
        return;
      }
    }
  }

  async saveServicosPadrao(centroCustoId: string, data: ServicosPadraoData): Promise<void> {
    const servicos = Array.isArray(data.servicos) ? data.servicos : [];
    const imports = Array.isArray(data.imports) ? data.imports : [];
    const shouldDelete = servicos.length === 0 && imports.length === 0;

    if (shouldDelete) {
      if (this.useLocal || !this.s3) {
        const p = this.localServicosPadraoPath(centroCustoId);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } else {
        await this.s3!.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: this.getServicosPadraoKey(centroCustoId)
          })
        );
      }
      this.invalidatePadraoCache(centroCustoId);
      this.invalidateOrcamentoCache(centroCustoId);
      return;
    }

    const body = JSON.stringify({
      servicos,
      imports
    });
    if (this.useLocal || !this.s3) {
      const dir = this.localDir(centroCustoId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.localServicosPadraoPath(centroCustoId), body, 'utf-8');
    } else {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: this.getServicosPadraoKey(centroCustoId),
          Body: body,
          ContentType: 'application/json'
        })
      );
    }
    this.invalidatePadraoCache(centroCustoId);
    this.invalidateOrcamentoCache(centroCustoId);
  }

  private detailCacheKey(centroCustoId: string, orcamentoId: string): string {
    return `${centroCustoId}::${orcamentoId}`;
  }

  private invalidatePadraoCache(centroCustoId: string): void {
    this.padraoCache.delete(centroCustoId);
  }

  private invalidateOrcamentoCache(centroCustoId: string, orcamentoId?: string): void {
    if (orcamentoId) {
      this.orcamentoDetailCache.delete(this.detailCacheKey(centroCustoId, orcamentoId));
      return;
    }
    const prefix = `${centroCustoId}::`;
    for (const key of this.orcamentoDetailCache.keys()) {
      if (key.startsWith(prefix)) this.orcamentoDetailCache.delete(key);
    }
  }

  private async fetchOrcamentoDirect(
    centroCustoId: string,
    orcamentoId: string
  ): Promise<OrcamentoData | null> {
    const raw = await this.readOrcamentoFile(centroCustoId, orcamentoId);
    if (!raw) return null;
    const rawObj = raw as unknown as Record<string, unknown>;
    const docTemServicos = Object.prototype.hasOwnProperty.call(rawObj, 'servicos');
    // Documento importado já traz a árvore — não espera o catálogo do contrato (outro GET no S3).
    if (docTemServicos && Array.isArray(rawObj.servicos)) {
      return {
        servicos: rawObj.servicos,
        imports: Array.isArray(rawObj.imports) ? rawObj.imports : [],
        composicoes: [],
        sessaoOrcamento: raw.sessaoOrcamento
      };
    }
    const padrao = await this.getServicosPadrao(centroCustoId);
    return {
      servicos: padrao.servicos,
      imports: padrao.imports,
      composicoes: [],
      sessaoOrcamento: raw.sessaoOrcamento
    };
  }

  private async fetchServicosPadraoDirect(centroCustoId: string): Promise<ServicosPadraoData> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    await this.migrateServicosPadraoFromOrcamentosIfNeeded(centroCustoId);
    const f = await this.readServicosPadraoFile(centroCustoId);
    return {
      servicos: Array.isArray(f?.servicos) ? f!.servicos : [],
      imports: Array.isArray(f?.imports) ? f!.imports : []
    };
  }

  /** Serviços padrão do contrato (compartilhado entre todos os orçamentos). */
  async getServicosPadrao(centroCustoId: string): Promise<ServicosPadraoData> {
    const cached = this.padraoCache.get(centroCustoId);
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      if (age <= OrcamentoService.DETAIL_STALE_MS) {
        if (age > OrcamentoService.DETAIL_FRESH_MS && !cached.refreshing) {
          cached.refreshing = true;
          this.fetchServicosPadraoDirect(centroCustoId)
            .then((data) => {
              this.padraoCache.set(centroCustoId, {
                data,
                fetchedAt: Date.now(),
                refreshing: false
              });
            })
            .catch(() => {
              cached.refreshing = false;
            });
        }
        return cached.data;
      }
    }

    const data = await this.fetchServicosPadraoDirect(centroCustoId);
    this.padraoCache.set(centroCustoId, {
      data,
      fetchedAt: Date.now(),
      refreshing: false
    });
    return data;
  }

  /**
   * Resposta da API: serviços/imports do contrato + sessão só deste orçamento.
   * Árvore `servicos` editada na montagem fica no arquivo do orçamento; `servicos-padrao` é só o catálogo (import).
   */
  async getOrcamento(centroCustoId: string, orcamentoId: string): Promise<OrcamentoData | null> {
    if (!isUuid(orcamentoId)) return null;
    const cacheKey = this.detailCacheKey(centroCustoId, orcamentoId);
    const cached = this.orcamentoDetailCache.get(cacheKey);

    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      if (age <= OrcamentoService.DETAIL_STALE_MS) {
        if (age > OrcamentoService.DETAIL_FRESH_MS && !cached.refreshing) {
          cached.refreshing = true;
          this.fetchOrcamentoDirect(centroCustoId, orcamentoId)
            .then((data) => {
              if (!data) {
                cached.refreshing = false;
                return;
              }
              this.orcamentoDetailCache.set(cacheKey, {
                data,
                fetchedAt: Date.now(),
                refreshing: false
              });
            })
            .catch(() => {
              cached.refreshing = false;
            });
        }
        return cached.data;
      }
    }

    const data = await this.fetchOrcamentoDirect(centroCustoId, orcamentoId);
    if (data) {
      this.orcamentoDetailCache.set(cacheKey, {
        data,
        fetchedAt: Date.now(),
        refreshing: false
      });
    }
    return data;
  }

  /**
   * Mescla sessão e/ou árvore de serviços no JSON do orçamento sem apagar o que não veio no patch.
   */
  async mergeOrcamentoArquivo(
    centroCustoId: string,
    orcamentoId: string,
    patch: { sessaoOrcamento?: unknown; servicos?: unknown[] }
  ): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const indexEntry = index.orcamentos.find(o => o.id === orcamentoId);
    if (!indexEntry) throw new Error('Orçamento não encontrado no índice');

    const existing: Partial<OrcamentoData> =
      (await this.readOrcamentoFile(centroCustoId, orcamentoId)) ?? {};
    const indexNorm = normalizeOrcamentoVersionFields(indexEntry);
    if (this.isOrcamentoCongelado(indexNorm, existing)) {
      throw new Error('Orçamento congelado: crie uma nova versão para editar');
    }
    let nextSessao =
      patch.sessaoOrcamento !== undefined ? patch.sessaoOrcamento : existing.sessaoOrcamento;
    const nextServicos = patch.servicos !== undefined ? patch.servicos : existing.servicos;

    // Garante que família/versão não se percam se o cliente omitir os campos na meta.
    if (nextSessao && typeof nextSessao === 'object' && !Array.isArray(nextSessao)) {
      const sessaoObj = { ...(nextSessao as Record<string, unknown>) };
      const metaObj =
        sessaoObj.meta && typeof sessaoObj.meta === 'object' && !Array.isArray(sessaoObj.meta)
          ? { ...(sessaoObj.meta as Record<string, unknown>) }
          : {};
      metaObj.familiaId = indexNorm.familiaId;
      metaObj.versao = indexNorm.versao;
      metaObj.congelado = false;
      if (indexNorm.origemVersaoId) metaObj.origemVersaoId = indexNorm.origemVersaoId;
      sessaoObj.meta = metaObj;
      nextSessao = sessaoObj;
    }

    const payload: Record<string, unknown> = {};
    if (nextSessao !== undefined) payload.sessaoOrcamento = nextSessao;
    if (nextServicos !== undefined) payload.servicos = nextServicos;

    await this.writeOrcamentoFileRaw(centroCustoId, orcamentoId, payload);
    const updatedAt = new Date().toISOString();
    const meta = (nextSessao as { meta?: Record<string, unknown> } | undefined)?.meta;
    const statusFromMeta = (() => {
      const s = meta?.statusAprovacao;
      return typeof s === 'string' && s.trim() ? s.trim() : undefined;
    })();
    const fdPctFromMeta = (() => {
      const n = Number(meta?.fichaDemandaPct);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
    })();
    const finFromMeta = extractListaFinanceiroFromMeta(
      meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : undefined
    );
    const cronoFromMeta = extractCronogramaResumoFromMeta(
      meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : undefined
    );
    const next: OrcamentoIndex = {
      ultimoOrcamentoId: orcamentoId,
      ...(typeof index.listaFinVersion === 'number'
        ? { listaFinVersion: index.listaFinVersion }
        : {}),
      orcamentos: index.orcamentos.map(o =>
        o.id === orcamentoId
          ? {
              ...o,
              updatedAt,
              ...(statusFromMeta !== undefined ? { statusAprovacao: statusFromMeta } : {}),
              ...(fdPctFromMeta !== undefined ? { fichaDemandaPct: fdPctFromMeta } : {}),
              ...(finFromMeta.bdiPercentual !== undefined
                ? { bdiPercentual: finFromMeta.bdiPercentual }
                : {}),
              ...(finFromMeta.totalComBdi !== undefined ? { totalComBdi: finFromMeta.totalComBdi } : {}),
              ...(cronoFromMeta.cronogramaProgressoFisico !== undefined
                ? {
                    cronogramaProgressoFisico: cronoFromMeta.cronogramaProgressoFisico,
                    cronogramaConcluido: cronoFromMeta.cronogramaConcluido,
                    cronogramaTotalEtapas: cronoFromMeta.cronogramaTotalEtapas,
                    cronogramaAtrasado: cronoFromMeta.cronogramaAtrasado
                  }
                : {})
            }
          : o
      )
    };
    await this.writeIndex(centroCustoId, next);
    this.invalidateOrcamentoCache(centroCustoId, orcamentoId);
  }

  async saveOrcamentoSessao(centroCustoId: string, orcamentoId: string, sessaoOrcamento: unknown): Promise<void> {
    await this.mergeOrcamentoArquivo(centroCustoId, orcamentoId, { sessaoOrcamento });
  }

  /** Atualiza só o status de aprovação na meta da sessão (ex.: retorno de FD). */
  async updateStatusAprovacao(
    centroCustoId: string,
    orcamentoId: string,
    statusAprovacao: string
  ): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const existing: Partial<OrcamentoData> =
      (await this.readOrcamentoFile(centroCustoId, orcamentoId)) ?? {};
    const sessaoRaw =
      existing.sessaoOrcamento && typeof existing.sessaoOrcamento === 'object'
        ? (existing.sessaoOrcamento as Record<string, unknown>)
        : {};
    const metaRaw =
      sessaoRaw.meta && typeof sessaoRaw.meta === 'object' && !Array.isArray(sessaoRaw.meta)
        ? (sessaoRaw.meta as Record<string, unknown>)
        : {};
    await this.mergeOrcamentoArquivo(centroCustoId, orcamentoId, {
      sessaoOrcamento: {
        ...sessaoRaw,
        meta: {
          ...metaRaw,
          statusAprovacao,
        },
      },
    });
  }

  /** Grava serviços do contrato + sessão do orçamento (compat com clientes que enviam o payload completo). */
  async saveOrcamento(centroCustoId: string, orcamentoId: string, data: OrcamentoData): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const exists = index.orcamentos.some(o => o.id === orcamentoId);
    if (!exists) throw new Error('Orçamento não encontrado no índice');
    await this.mergeOrcamentoArquivo(centroCustoId, orcamentoId, {
      sessaoOrcamento: data.sessaoOrcamento,
      servicos: Array.isArray(data.servicos) ? data.servicos : undefined
    });
    const imports = Array.isArray(data.imports) ? data.imports : [];
    if (imports.length > 0 && this.hasOrcamentoPerfeitoImport(imports)) {
      const current = await this.getServicosPadrao(centroCustoId);
      await this.saveServicosPadrao(centroCustoId, {
        servicos: current.servicos,
        imports
      });
    }
  }

  async createOrcamento(centroCustoId: string, nome?: string): Promise<OrcamentoIndexEntry> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    const id = randomUUID();
    const index = await this.getIndex(centroCustoId);
    const n = (nome && nome.trim()) || `Orçamento ${index.orcamentos.length + 1}`;
    const updatedAt = new Date().toISOString();
    const entry = normalizeOrcamentoVersionFields({
      id,
      nome: n,
      updatedAt,
      familiaId: id,
      versao: 1,
      congelado: false,
      statusAprovacao: 'rascunho',
    });
    await this.writeOrcamentoFileRaw(centroCustoId, id, {
      sessaoOrcamento: {
        meta: {
          familiaId: id,
          versao: 1,
          congelado: false,
          revisaoCount: 1,
          statusAprovacao: 'rascunho',
        },
      },
    });
    await this.writeIndex(centroCustoId, {
      ultimoOrcamentoId: id,
      orcamentos: [entry, ...index.orcamentos.map(normalizeOrcamentoVersionFields)],
      ...(typeof index.listaFinVersion === 'number'
        ? { listaFinVersion: index.listaFinVersion }
        : {}),
    });
    return entry;
  }

  /**
   * Congela a versão atual e cria uma cópia editável (V+1) na mesma família.
   */
  async createVersao(centroCustoId: string, orcamentoId: string): Promise<OrcamentoIndexEntry> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const origem = index.orcamentos.find((o) => o.id === orcamentoId);
    if (!origem) throw new Error('Orçamento não encontrado');

    const origemNorm = normalizeOrcamentoVersionFields(origem);
    if (origemNorm.congelado) {
      throw new Error('Esta versão já está congelada. Abra a versão atual da família para criar outra.');
    }

    const familiaId = origemNorm.familiaId || origemNorm.id;
    const irmaos = index.orcamentos
      .map(normalizeOrcamentoVersionFields)
      .filter((o) => (o.familiaId || o.id) === familiaId);
    const maxVersao = irmaos.reduce((m, o) => Math.max(m, o.versao ?? 1), 1);
    if ((origemNorm.versao ?? 1) < maxVersao) {
      throw new Error('Só é possível versionar a versão atual (mais recente) da família.');
    }

    const sourceFile = (await this.readOrcamentoFile(centroCustoId, orcamentoId)) ?? {
      servicos: [],
      composicoes: [],
      imports: [],
    };
    const sourceSessao =
      sourceFile.sessaoOrcamento && typeof sourceFile.sessaoOrcamento === 'object'
        ? ({ ...(sourceFile.sessaoOrcamento as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const sourceMeta =
      sourceSessao.meta && typeof sourceSessao.meta === 'object' && !Array.isArray(sourceSessao.meta)
        ? ({ ...(sourceSessao.meta as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    const statusOrigem =
      typeof sourceMeta.statusAprovacao === 'string' ? sourceMeta.statusAprovacao.trim() : '';
    const statusNova = statusOrigem === 'em_correcao' ? 'em_correcao' : 'rascunho';
    const novaVersao = maxVersao + 1;
    const newId = randomUUID();
    const updatedAt = new Date().toISOString();

    // Congela origem (arquivo + índice)
    const origemSessaoCongelada = {
      ...sourceSessao,
      meta: {
        ...sourceMeta,
        familiaId,
        versao: origemNorm.versao ?? 1,
        congelado: true,
        origemVersaoId: origemNorm.origemVersaoId,
        revisaoCount: origemNorm.versao ?? 1,
      },
    };
    await this.writeOrcamentoFileRaw(centroCustoId, orcamentoId, {
      servicos: Array.isArray(sourceFile.servicos) ? sourceFile.servicos : [],
      composicoes: Array.isArray(sourceFile.composicoes) ? sourceFile.composicoes : [],
      imports: Array.isArray(sourceFile.imports) ? sourceFile.imports : [],
      sessaoOrcamento: origemSessaoCongelada,
    });

    const novaSessao = {
      ...sourceSessao,
      meta: {
        ...sourceMeta,
        familiaId,
        versao: novaVersao,
        congelado: false,
        origemVersaoId: orcamentoId,
        revisaoCount: novaVersao,
        statusAprovacao: statusNova,
        fichaDemandaApprovalId: undefined,
      },
    };
    // Remove id de FD pendente de vez (undefined no spread pode persistir)
    delete (novaSessao.meta as Record<string, unknown>).fichaDemandaApprovalId;

    await this.writeOrcamentoFileRaw(centroCustoId, newId, {
      servicos: Array.isArray(sourceFile.servicos)
        ? JSON.parse(JSON.stringify(sourceFile.servicos))
        : [],
      composicoes: Array.isArray(sourceFile.composicoes)
        ? JSON.parse(JSON.stringify(sourceFile.composicoes))
        : [],
      imports: Array.isArray(sourceFile.imports)
        ? JSON.parse(JSON.stringify(sourceFile.imports))
        : [],
      sessaoOrcamento: JSON.parse(JSON.stringify(novaSessao)),
    });

    const newEntry = normalizeOrcamentoVersionFields({
      id: newId,
      nome: origemNorm.nome,
      updatedAt,
      familiaId,
      versao: novaVersao,
      congelado: false,
      origemVersaoId: orcamentoId,
      statusAprovacao: statusNova,
      fichaDemandaPct: origemNorm.fichaDemandaPct,
      bdiPercentual: origemNorm.bdiPercentual,
      totalComBdi: origemNorm.totalComBdi,
      cronogramaProgressoFisico: origemNorm.cronogramaProgressoFisico,
      cronogramaConcluido: origemNorm.cronogramaConcluido,
      cronogramaTotalEtapas: origemNorm.cronogramaTotalEtapas,
      cronogramaAtrasado: origemNorm.cronogramaAtrasado,
    });

    const nextOrcamentos = [
      newEntry,
      ...index.orcamentos.map((o) => {
        const n = normalizeOrcamentoVersionFields(o);
        if (n.id === orcamentoId) {
          return {
            ...n,
            congelado: true,
            familiaId,
            versao: origemNorm.versao ?? 1,
            updatedAt,
          };
        }
        return n;
      }),
    ];

    await this.writeIndex(centroCustoId, {
      ultimoOrcamentoId: newId,
      orcamentos: nextOrcamentos,
      ...(typeof index.listaFinVersion === 'number'
        ? { listaFinVersion: index.listaFinVersion }
        : {}),
    });
    this.invalidateOrcamentoCache(centroCustoId, orcamentoId);
    this.invalidateOrcamentoCache(centroCustoId, newId);
    return newEntry;
  }

  async renameOrcamento(centroCustoId: string, orcamentoId: string, nome: string): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const updatedAt = new Date().toISOString();
    const next: OrcamentoIndex = {
      ...index,
      orcamentos: index.orcamentos.map(o =>
        o.id === orcamentoId ? { ...o, nome: nome.trim() || o.nome, updatedAt } : o
      )
    };
    if (!next.orcamentos.some(o => o.id === orcamentoId)) throw new Error('Orçamento não encontrado');
    await this.writeIndex(centroCustoId, next);
  }

  async deleteOrcamento(centroCustoId: string, orcamentoId: string): Promise<void> {
    if (!isUuid(orcamentoId)) throw new Error('ID de orçamento inválido');
    const index = await this.getIndex(centroCustoId);
    const filtered = index.orcamentos.filter(o => o.id !== orcamentoId);
    if (filtered.length === index.orcamentos.length) throw new Error('Orçamento não encontrado');

    if (this.useLocal || !this.s3) {
      const p = this.localOrcamentoPath(centroCustoId, orcamentoId);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      try {
        await this.s3!.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: this.getOrcamentoDataKey(centroCustoId, orcamentoId)
          })
        );
      } catch {
        /* ok */
      }
    }

    let ultimo = index.ultimoOrcamentoId;
    if (ultimo === orcamentoId) {
      ultimo = filtered[0]?.id;
    }
    await this.writeIndex(centroCustoId, {
      ultimoOrcamentoId: ultimo,
      orcamentos: filtered
    });
    this.invalidateOrcamentoCache(centroCustoId, orcamentoId);
  }

  /** Compat: salva no primeiro orçamento ou cria um se não houver índice (legado). */
  async saveLegacy(centroCustoId: string, data: OrcamentoData): Promise<void> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    let index = await this.getIndex(centroCustoId);
    let targetId = index.ultimoOrcamentoId || index.orcamentos[0]?.id;
    if (!targetId) {
      const created = await this.createOrcamento(centroCustoId, 'Orçamento 1');
      targetId = created.id;
      index = await this.getIndex(centroCustoId);
    }
    await this.saveServicosPadrao(centroCustoId, {
      servicos: data.servicos || [],
      imports: data.imports || []
    });
    await this.saveOrcamentoSessao(centroCustoId, targetId, data.sessaoOrcamento);
  }

  /** @deprecated usar getIndex + getOrcamento */
  async save(centroCustoId: string, data: OrcamentoData): Promise<void> {
    await this.saveLegacy(centroCustoId, data);
  }

  /** @deprecated usar getIndex + getOrcamento */
  async get(centroCustoId: string): Promise<OrcamentoData | null> {
    await this.migrateLegacyIfNeeded(centroCustoId);
    const index = await this.getIndex(centroCustoId);
    const id = index.ultimoOrcamentoId || index.orcamentos[0]?.id;
    if (!id) return null;
    return this.getOrcamento(centroCustoId, id);
  }

  async getComposicoesGeral(): Promise<unknown[] | null> {
    try {
      if (this.useLocal || !this.s3) {
        const filePath = path.join(this.localBasePath, 'composicoes-geral', 'data.json');
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as unknown[];
      }
      const result = await this.s3!.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: this.getComposicoesGeralKey()
        })
      );
      if (!result.Body) return null;
      const body = await s3BodyToString(result.Body);
      return JSON.parse(body) as unknown[];
    } catch (err: unknown) {
      if (isS3NoSuchKey(err)) return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  async saveComposicoesGeral(items: unknown[]): Promise<void> {
    const body = JSON.stringify(items);
    if (this.useLocal || !this.s3) {
      const dir = path.join(this.localBasePath, 'composicoes-geral');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data.json'), body, 'utf-8');
      return;
    }
    await this.s3!.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getComposicoesGeralKey(),
        Body: body,
        ContentType: 'application/json'
      })
    );
  }
}
