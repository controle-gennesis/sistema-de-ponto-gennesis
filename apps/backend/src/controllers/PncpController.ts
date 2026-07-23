import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { PNCP_KEYWORDS_OBJETO_PADRAO, PNCP_MODALIDADES } from '../services/PncpConsultaService';
import { consultarContratacoesLocais } from '../services/PncpLocalConsultaService';
import {
  getPncpSyncStatus,
  startPncpIngestBackground,
} from '../services/PncpIngestService';

function parseModalidade(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (s === 'all' || s === 'todos' || s === '0') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export class PncpController {
  listModalidades(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: PNCP_MODALIDADES });
  }

  listKeywords(_req: AuthRequest, res: Response) {
    const unique = Array.from(
      new Set(PNCP_KEYWORDS_OBJETO_PADRAO.map((k) => k.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json({ success: true, data: unique });
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

      // Espelho local (já filtrado por keywords na ingestão).
      const result = await consultarContratacoesLocais({
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
      next(createError(message, 500));
    }
  }

  async syncStatus(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const status = await getPncpSyncStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  }

  async startSync(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = startPncpIngestBackground('manual');
      const status = await getPncpSyncStatus();
      if (result.alreadyRunning) {
        res.status(202).json({
          success: true,
          data: status,
          message: 'Sincronização já em andamento.',
        });
        return;
      }
      res.status(202).json({
        success: true,
        data: status,
        message: 'Sincronização iniciada em segundo plano.',
      });
    } catch (err) {
      next(err);
    }
  }
}
