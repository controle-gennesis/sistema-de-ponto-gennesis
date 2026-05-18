import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getTotvsRmRelatorioFinService } from '../services/TotvsRmRelatorioFinService';

export type ExtratoCaixaItem = {
  codColigada: number | null;
  codCxa: string;
  codCCusto: string;
  valor: number;
  codFilial: number | null;
  data: string | null;
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
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

function dateSortKey(data: string | null): number {
  if (!data) return Number.NEGATIVE_INFINITY;
  const t = new Date(data).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function mapRow(row: Record<string, unknown>): ExtratoCaixaItem {
  const codColigadaRaw = pickField(row, 'CODCOLIGADA');
  const codFilialRaw = pickField(row, 'CODFILIAL');
  return {
    codColigada: codColigadaRaw != null ? toNumber(codColigadaRaw) : null,
    codCxa: String(pickField(row, 'CODCXA') ?? '').trim(),
    codCCusto: String(pickField(row, 'CODCCUSTO') ?? '').trim(),
    valor: toNumber(pickField(row, 'VALOR')),
    codFilial: codFilialRaw != null ? toNumber(codFilialRaw) : null,
    data: toIsoDate(pickField(row, 'DATA')),
  };
}

export class ExtratoCaixaController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: true,
          data: {
            configured: false,
            items: [] as ExtratoCaixaItem[],
            total: 0,
            message:
              'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN.',
          },
        });
        return;
      }

      try {
        const rows = await svc.fetchExtratoCaixaRows();
        const items = rows
          .map(mapRow)
          .sort((a, b) => dateSortKey(b.data) - dateSortKey(a.data));
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
        console.warn(`[TOTVS RM EXTRATOPROJETOS]: ${message}`);
        res.json({
          success: false,
          message,
          data: {
            configured: true,
            items: [] as ExtratoCaixaItem[],
            total: 0,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
}
