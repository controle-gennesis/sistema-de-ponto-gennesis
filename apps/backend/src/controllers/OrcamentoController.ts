import { Response, NextFunction } from 'express';
import { OrcamentoService } from '../services/OrcamentoService';
import { AuthRequest } from '../middleware/auth';

const orcamentoService = new OrcamentoService();

export class OrcamentoController {
  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      const data = await orcamentoService.get(centroCustoId);
      return res.json(data || { servicos: [], composicoes: [], imports: [] });
    } catch (err) {
      return next(err);
    }
  }

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      const { servicos, imports } = req.body;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      await orcamentoService.save(centroCustoId, {
        servicos: servicos || [],
        composicoes: [],
        imports: imports || []
      });
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async getComposicoesGeral(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await orcamentoService.getComposicoesGeral();
      return res.json(data || []);
    } catch (err) {
      return next(err);
    }
  }

  async saveComposicoesGeral(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { items } = req.body;
      await orcamentoService.saveComposicoesGeral(items || []);
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }
}
