import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class CostCenterController {
  /**
   * Listar todos os centros de custo
   */
  async getAllCostCenters(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { code: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const costCenters = await prisma.costCenter.findMany({
        where,
        orderBy: { code: 'asc' }
      });

      res.json({
        success: true,
        data: costCenters
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter centro de custo por ID
   */
  async getCostCenterById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const costCenter = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!costCenter) {
        throw createError('Centro de custo não encontrado', 404);
      }

      res.json({
        success: true,
        data: costCenter
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar novo centro de custo
   */
  async createCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { code, name, description, isActive } = req.body;

      if (!code || !name) {
        throw createError('Código e nome são obrigatórios', 400);
      }

      // Verificar se já existe um centro de custo com o mesmo código
      const existing = await prisma.costCenter.findUnique({
        where: { code }
      });

      if (existing) {
        throw createError('Já existe um centro de custo com este código', 409);
      }

      const costCenter = await prisma.costCenter.create({
        data: {
          code,
          name,
          description: description || null,
          isActive: isActive !== undefined ? isActive : true
        }
      });

      res.status(201).json({
        success: true,
        data: costCenter,
        message: 'Centro de custo criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar centro de custo
   */
  async updateCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { code, name, description, isActive } = req.body;

      // Verificar se o centro de custo existe
      const existing = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Centro de custo não encontrado', 404);
      }

      // Se o código está sendo alterado, verificar se não existe outro com o mesmo código
      if (code && code !== existing.code) {
        const codeExists = await prisma.costCenter.findUnique({
          where: { code }
        });

        if (codeExists) {
          throw createError('Já existe um centro de custo com este código', 409);
        }
      }

      const costCenter = await prisma.costCenter.update({
        where: { id },
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive })
        }
      });

      res.json({
        success: true,
        data: costCenter,
        message: 'Centro de custo atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar centro de custo
   */
  async deleteCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Verificar se o centro de custo existe
      const existing = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Centro de custo não encontrado', 404);
      }

      await prisma.costCenter.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Centro de custo deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}

