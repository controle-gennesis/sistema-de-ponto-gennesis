import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import {
  assertLiberadoContractAccess,
  getLiberadoContractAccessForUser,
} from '../lib/contractAccess';
import {
  RelatorioFotograficoService,
  RelatorioFotograficoData,
  RelatorioCamposData,
} from '../services/RelatorioFotograficoService';

const service = new RelatorioFotograficoService();

export class RelatorioFotograficoController {
  /** Lista global: relatórios de todos os contratos Liberado para o usuário (admin: todos). */
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: 'Não autenticado.' });
      const access = await getLiberadoContractAccessForUser(req.user.id, req.user.isAdmin);
      if (access.filter === 'none') return res.json({ success: true, data: [] });

      const contracts = await prisma.contract.findMany({
        where: access.filter === 'ids' ? { id: { in: access.ids } } : {},
        orderBy: { name: 'asc' },
        select: { id: true, name: true, number: true },
      });
      const lists = await Promise.all(
        contracts.map(async (c) => {
          try {
            const idx = await service.getIndex(c.id);
            return idx.relatorios.map((r) => ({
              ...r,
              contractId: c.id,
              contractName: c.name,
              contractNumber: c.number,
            }));
          } catch {
            return [];
          }
        })
      );
      const data = lists
        .flat()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      return res.json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  async getList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertLiberadoContractAccess(req, contractId);
      const idx = await service.getIndex(contractId);
      res.json({ success: true, data: idx.relatorios });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertLiberadoContractAccess(req, contractId);
      const { titulo, campos } = req.body as {
        titulo?: string;
        campos?: Partial<RelatorioCamposData>;
      };
      if (!titulo?.trim()) {
        return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
      }
      const entry = await service.createRelatorio(contractId, titulo.trim(), campos);
      return res.status(201).json({ success: true, data: entry });
    } catch (err) {
      return next(err);
    }
  }

  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      await assertLiberadoContractAccess(req, contractId);
      const data = await service.getRelatorio(contractId, relatorioId);
      if (!data) {
        return res.status(404).json({ success: false, message: 'Relatório não encontrado.' });
      }
      return res.json({ success: true, data });
    } catch (err) {
      return next(err);
    }
  }

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      await assertLiberadoContractAccess(req, contractId);
      const { data, titulo } = req.body as { data: RelatorioFotograficoData; titulo?: string };
      if (!data) {
        return res.status(400).json({ success: false, message: 'Dados do relatório são obrigatórios.' });
      }
      await service.saveRelatorio(contractId, relatorioId, data, titulo);
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async rename(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      await assertLiberadoContractAccess(req, contractId);
      const { titulo } = req.body as { titulo?: string };
      if (!titulo?.trim()) {
        return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
      }
      await service.renameRelatorio(contractId, relatorioId, titulo.trim());
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, relatorioId } = req.params;
      await assertLiberadoContractAccess(req, contractId);
      await service.deleteRelatorio(contractId, relatorioId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
