import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  consultarContratacoesPublicacao,
  PNCP_MODALIDADES,
} from '../services/PncpConsultaService';

function parseModalidade(raw: unknown): number | null {
  if (raw == null || raw === '') return 6;
  const s = String(raw).trim().toLowerCase();
  if (s === 'all' || s === 'todos' || s === '0') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) return 6;
  return n;
}

export class PncpController {
  listModalidades(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: PNCP_MODALIDADES });
  }

  async listContratacoes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dataInicial = String(req.query.dataInicial || '');
      const dataFinal = String(req.query.dataFinal || '');
      const uf = String(req.query.uf || '');
      const codigoModalidadeContratacao = parseModalidade(req.query.codigoModalidadeContratacao);
      const pagina = Number(req.query.pagina || 1);
      const tamanhoPagina = Number(req.query.tamanhoPagina || 50);
      const q = req.query.q != null ? String(req.query.q) : undefined;

      if (!dataInicial || !dataFinal || !uf) {
        throw createError('Informe dataInicial, dataFinal e uf.', 400);
      }

      const result = await consultarContratacoesPublicacao({
        dataInicial,
        dataFinal,
        uf,
        codigoModalidadeContratacao,
        pagina,
        tamanhoPagina,
        q,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao consultar PNCP';
      if (
        message.includes('inválida') ||
        message.includes('Informe') ||
        message.includes('não pode')
      ) {
        next(createError(message, 400));
        return;
      }
      if (/limite de requisi/i.test(message)) {
        next(createError(message, 429));
        return;
      }
      next(createError(message, 502));
    }
  }
}
