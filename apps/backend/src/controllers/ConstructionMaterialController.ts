import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class ConstructionMaterialController {
  /**
   * Listar todos os materiais de construção
   */
  async getAllMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const materials = await prisma.constructionMaterial.findMany({
        where,
        orderBy: { name: 'asc' }
      });

      res.json({
        success: true,
        data: materials
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter material por ID
   */
  async getMaterialById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const material = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!material) {
        throw createError('Material não encontrado', 404);
      }

      res.json({
        success: true,
        data: material
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar novo material
   */
  async createMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, description, unit, isActive } = req.body;

      if (!name || !unit) {
        throw createError('Nome e unidade são obrigatórios', 400);
      }

      const material = await prisma.constructionMaterial.create({
        data: {
          name,
          description: description || null,
          unit,
          isActive: isActive !== undefined ? isActive : true
        }
      });

      res.status(201).json({
        success: true,
        data: material,
        message: 'Material criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar material
   */
  async updateMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, description, unit, isActive } = req.body;

      // Verificar se o material existe
      const existing = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      const material = await prisma.constructionMaterial.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(unit && { unit }),
          ...(isActive !== undefined && { isActive })
        }
      });

      res.json({
        success: true,
        data: material,
        message: 'Material atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar material
   */
  async deleteMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Verificar se o material existe
      const existing = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      await prisma.constructionMaterial.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Material deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}

