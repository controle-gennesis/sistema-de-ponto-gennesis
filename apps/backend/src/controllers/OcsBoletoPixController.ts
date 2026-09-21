import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getTotvsRmRelatorioFinService } from '../services/TotvsRmRelatorioFinService';
import { resolveGastosPoloForContract } from '../lib/gastosOperacionaisPolo';

export type OcsBoletoPixItem = {
  /** Código numérico de polo/coligada retornado pelo TOTVS (coluna POLO). Usado junto com numeroOc como chave para os dados extras (NF/vencimento manuais). */
  coligada: number | null;
  filial: number | null;
  /** Sigla do polo (DF, GO, RS, PB, ...) resolvida a partir do centro de custo. */
  poloSigla: string | null;
  idMov: number | null;
  numeroMovimento: string;
  dataEmissao: string | null;
  fornecedor: string;
  valorLiquido: number;
  condicaoDePagamento: string;
  centroCusto: string;
  status: string;
  dataVencimento: string | null;
  numeroNf: string | null;
  dataEmissaoNf: string | null;
};

/** Mapa de fallback quando o centro de custo não identifica um polo conhecido. */
const POLO_CODE_FALLBACK: Record<number, string> = {
  1: 'DF',
  2: 'RS',
  4: 'PB',
  5: 'GO',
};

function pickField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const found = Object.keys(row).find((rk) => rk.toUpperCase() === key.toUpperCase());
    if (found && row[found] !== undefined && row[found] !== null) return row[found];
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return 0;
    const normalized = trimmed.includes(',')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toNullableNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = toNumber(v);
  return Number.isFinite(n) ? n : null;
}

/** Retorna YYYY-MM-DD sem deslocar o dia por fuso horário. */
function toCalendarDateString(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateSortKey(data: string | null): number {
  if (!data) return Number.NEGATIVE_INFINITY;
  const iso = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }
  const t = new Date(data).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function parseOptionalDateInput(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const ymd = toCalendarDateString(v);
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function extraKey(coligada: number, idMov: number): string {
  return `${coligada}:${idMov}`;
}

function mapRow(row: Record<string, unknown>): OcsBoletoPixItem {
  const status = String(pickField(row, 'STATUS') ?? '').trim();
  const centroCusto = String(
    pickField(row, 'CENTRO_DE_CUSTO', 'CENTRODECUSTO') ?? ''
  ).trim();
  const filial = toNullableNumber(pickField(row, 'POLO'));
  const poloSigla =
    resolveGastosPoloForContract(centroCusto) ||
    (filial != null ? POLO_CODE_FALLBACK[filial] ?? null : null);
  const numeroOc = toNullableNumber(pickField(row, 'NUMERO_DA_OC'));

  return {
    // TOTVS não retorna coligada nesta consulta; POLO faz o papel de agrupador junto com o
    // número da OC para identificar a linha ao salvar dados extras (NF de emissão manual).
    coligada: filial,
    filial,
    poloSigla,
    idMov: numeroOc,
    numeroMovimento: numeroOc != null ? String(numeroOc) : '',
    dataEmissao: toCalendarDateString(pickField(row, 'DATA_EMISSAO')),
    fornecedor: String(pickField(row, 'FORNECEDOR') ?? '').trim(),
    valorLiquido: toNumber(pickField(row, 'VALOR')),
    condicaoDePagamento: String(pickField(row, 'COND_DE_PAG') ?? '').trim(),
    centroCusto,
    status,
    dataVencimento: toCalendarDateString(pickField(row, 'DATA_VENC')),
    numeroNf: String(pickField(row, 'NUMERO_DA_NF') ?? '').trim() || null,
    dataEmissaoNf: null,
  };
}

export class OcsBoletoPixController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: true,
          data: {
            configured: false,
            items: [] as OcsBoletoPixItem[],
            total: 0,
            message:
              'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN.',
          },
        });
        return;
      }

      try {
        const [rows, extras] = await Promise.all([
          svc.fetchOcsBoletoPixRows(),
          prisma.ocsBoletoPixExtra.findMany(),
        ]);

        const extrasByKey = new Map(
          extras.map((e) => [
            extraKey(e.coligada, e.idMov),
            {
              dataVencimento: toCalendarDateString(e.dataVencimento),
              numeroNf: e.numeroNf?.trim() || null,
              dataEmissaoNf: toCalendarDateString(e.dataEmissaoNf),
            },
          ])
        );

        const items = rows
          .map(mapRow)
          .map((item) => {
            if (item.coligada == null || item.idMov == null) return item;
            const extra = extrasByKey.get(extraKey(item.coligada, item.idMov));
            if (!extra) return item;
            return {
              ...item,
              dataVencimento: extra.dataVencimento,
              numeroNf: extra.numeroNf,
              dataEmissaoNf: extra.dataEmissaoNf,
            };
          })
          .sort((a, b) => {
            const byDate = dateSortKey(b.dataEmissao) - dateSortKey(a.dataEmissao);
            if (byDate !== 0) return byDate;
            return (b.idMov ?? 0) - (a.idMov ?? 0);
          });

        res.json({
          success: true,
          data: {
            configured: true,
            items,
            total: items.length,
            message: null as string | null,
          },
        });
      } catch (err) {
        const message = svc.formatAxiosError(err);
        console.warn(`[TOTVS RM OCSBOLETOPIX]: ${message}`);
        res.json({
          success: false,
          message,
          data: {
            configured: true,
            items: [] as OcsBoletoPixItem[],
            total: 0,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async upsertExtra(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const coligada = toNullableNumber(req.body?.coligada);
      const idMov = toNullableNumber(req.body?.idMov);
      const filial = toNullableNumber(req.body?.filial);

      if (coligada == null || idMov == null) {
        res.status(400).json({
          success: false,
          message: 'coligada e idMov são obrigatórios para salvar os dados da OC.',
        });
        return;
      }

      const dataVencimento = parseOptionalDateInput(req.body?.dataVencimento);
      const dataEmissaoNf = parseOptionalDateInput(req.body?.dataEmissaoNf);
      const numeroNfRaw = req.body?.numeroNf;
      const numeroNf =
        numeroNfRaw == null || String(numeroNfRaw).trim() === ''
          ? null
          : String(numeroNfRaw).trim();

      const saved = await prisma.ocsBoletoPixExtra.upsert({
        where: {
          coligada_idMov: { coligada, idMov },
        },
        create: {
          coligada,
          idMov,
          filial,
          dataVencimento,
          numeroNf,
          dataEmissaoNf,
          updatedById: req.user?.id ?? null,
        },
        update: {
          filial,
          dataVencimento,
          numeroNf,
          dataEmissaoNf,
          updatedById: req.user?.id ?? null,
        },
      });

      res.json({
        success: true,
        data: {
          coligada: saved.coligada,
          idMov: saved.idMov,
          filial: saved.filial,
          dataVencimento: toCalendarDateString(saved.dataVencimento),
          numeroNf: saved.numeroNf,
          dataEmissaoNf: toCalendarDateString(saved.dataEmissaoNf),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
