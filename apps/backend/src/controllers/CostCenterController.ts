import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class CostCenterController {
  /**
   * Lista todos os centros de custo
   */
  async getAllCostCenters(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 50, search, isActive } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      // Filtro de busca
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { code: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      // Filtro de status ativo/inativo
      if (isActive !== undefined) {
        const isActiveValue = Array.isArray(isActive) ? isActive[0] : isActive;
        const isActiveStr = String(isActiveValue).toLowerCase();
        where.isActive = isActiveStr === 'true' || isActiveStr === '1';
      }

      const [costCenters, total] = await Promise.all([
        prisma.costCenter.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' }
        }),
        prisma.costCenter.count({ where })
      ]);

      res.json({
        success: true,
        data: costCenters,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém um centro de custo por ID
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
   * Cria um novo centro de custo
   */
  async createCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { code, name, description, isActive = true } = req.body;

      // Validações
      if (!code || !name) {
        throw createError('Código e nome são obrigatórios', 400);
      }

      // Verificar se já existe um centro de custo com o mesmo código
      const existing = await prisma.costCenter.findUnique({
        where: { code: code.trim().toUpperCase() }
      });

      if (existing) {
        throw createError('Já existe um centro de custo com este código', 400);
      }

      const costCenter = await prisma.costCenter.create({
        data: {
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description?.trim() || null,
          isActive: isActive !== false
        }
      });

      res.status(201).json({
        success: true,
        data: costCenter,
        message: 'Centro de custo criado com sucesso'
      });
    } catch (error: any) {
      console.error('Erro ao criar centro de custo:', error);
      
      // Tratar erros do Prisma
      if (error.code === 'P2002') {
        return next(createError('Já existe um centro de custo com este código', 400));
      }
      
      // Tratar erro de tabela não encontrada
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        return next(createError('Tabela de centros de custo não encontrada. Execute a migração do banco de dados.', 500));
      }
      
      // Se já é um erro criado pelo createError, passar adiante
      if (error.statusCode) {
        return next(error);
      }
      
      // Erro genérico
      return next(createError(error.message || 'Erro ao criar centro de custo', 500));
    }
  }

  /**
   * Atualiza um centro de custo
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
          throw createError('Já existe um centro de custo com este código', 400);
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
   * Deleta um centro de custo
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

      // Verificar se há relacionamentos (projetos, requisições, materiais)
      const [projects, materialRequests, engineeringMaterials] = await Promise.all([
        prisma.project.count({ where: { costCenterId: id } }),
        prisma.materialRequest.count({ where: { costCenterId: id } }),
        prisma.engineeringMaterial.count({ where: { costCenterId: id } })
      ]);

      if (projects > 0 || materialRequests > 0 || engineeringMaterials > 0) {
        throw createError(
          'Não é possível excluir este centro de custo pois ele está sendo utilizado em projetos, requisições ou materiais',
          400
        );
      }

      await prisma.costCenter.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Centro de custo excluído com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}
