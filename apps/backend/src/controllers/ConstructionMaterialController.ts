import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class ConstructionMaterialController {
  /**
   * Lista todos os materiais de construção
   */
  async getAllMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 50, search, isActive } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      // Filtro de busca
      if (search) {
        where.OR = [
          { sinapiCode: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      // Filtro de status ativo/inativo
      if (isActive !== undefined) {
        const isActiveValue = Array.isArray(isActive) ? isActive[0] : isActive;
        const isActiveStr = String(isActiveValue).toLowerCase();
        where.isActive = isActiveStr === 'true' || isActiveStr === '1';
      }

      const [materials, total] = await Promise.all([
        prisma.engineeringMaterial.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { description: 'asc' }
        }),
        prisma.engineeringMaterial.count({ where })
      ]);

      res.json({
        success: true,
        data: materials,
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
   * Obtém um material por ID
   */
  async getMaterialById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const material = await prisma.engineeringMaterial.findUnique({
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
   * Cria um novo material
   */
  async createMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { sinapiCode, name, description, unit, medianPrice, state, referenceMonth, referenceYear, categoryId, costCenterId, isActive = true } = req.body;

      console.log('📦 Dados recebidos:', { sinapiCode, name, description, unit });

      // Validações
      if (!sinapiCode || !description || !unit) {
        throw createError('Código SINAPI, descrição e unidade de medida são obrigatórios', 400);
      }

      // Preparar dados para criação
      const materialData: any = {
        sinapiCode: String(sinapiCode).trim().toUpperCase(),
        description: String(description).trim(),
        unit: String(unit).trim(),
        isActive: isActive !== false
      };

      // Adicionar campo name se fornecido
      if (name !== undefined && name !== null && String(name).trim()) {
        materialData.name = String(name).trim();
      }

      // Adicionar campos opcionais
      if (medianPrice !== undefined && medianPrice !== null && medianPrice !== '') {
        materialData.medianPrice = Number(medianPrice);
      }
      if (state !== undefined && state !== null && String(state).trim()) {
        materialData.state = String(state).trim();
      }
      if (referenceMonth !== undefined && referenceMonth !== null && referenceMonth !== '') {
        materialData.referenceMonth = Number(referenceMonth);
      }
      if (referenceYear !== undefined && referenceYear !== null && referenceYear !== '') {
        materialData.referenceYear = Number(referenceYear);
      }
      if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
        materialData.categoryId = String(categoryId).trim();
      }
      if (costCenterId !== undefined && costCenterId !== null && costCenterId !== '') {
        materialData.costCenterId = String(costCenterId).trim();
      }

      // Tentar criar o material
      let material;
      try {
        material = await prisma.engineeringMaterial.create({
          data: materialData
        });
      } catch (prismaError: any) {
        // Se o erro for relacionado ao campo 'name', tentar sem ele primeiro e depois atualizar
        if (prismaError.message && prismaError.message.includes('name')) {
          const dataWithoutName = { ...materialData };
          delete dataWithoutName.name;
          
          material = await prisma.engineeringMaterial.create({
            data: dataWithoutName
          });
          
          // Se tiver name, atualizar usando SQL direto
          if (materialData.name) {
            await prisma.$executeRawUnsafe(
              `UPDATE "engineering_materials" SET "name" = $1 WHERE "id" = $2`,
              materialData.name,
              material.id
            );
            // Buscar o material atualizado
            material = await prisma.engineeringMaterial.findUnique({
              where: { id: material.id }
            });
          }
        } else {
          throw prismaError;
        }
      }

      res.status(201).json({
        success: true,
        data: material,
        message: 'Material criado com sucesso'
      });
    } catch (error: any) {
      if (error.statusCode) {
        return next(error);
      }
      
      if (error.name === 'PrismaClientValidationError') {
        return next(createError('Dados inválidos fornecidos: ' + error.message, 400));
      }
      
      if (error.name === 'PrismaClientKnownRequestError') {
        if (error.code === 'P2002') {
          return next(createError('Material com este código SINAPI já existe', 409));
        }
        return next(createError('Erro ao processar a solicitação do banco de dados: ' + error.message, 500));
      }
      
      return next(createError(error.message || 'Erro ao criar material', 500));
    }
  }

  /**
   * Atualiza um material
   */
  async updateMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { sinapiCode, name, description, unit, medianPrice, state, referenceMonth, referenceYear, categoryId, costCenterId, isActive } = req.body;

      // Verificar se o material existe
      const existing = await prisma.engineeringMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      const updateData: any = {};
      if (sinapiCode !== undefined) updateData.sinapiCode = sinapiCode.trim().toUpperCase();
      if (name !== undefined) updateData.name = name?.trim() || null;
      if (description !== undefined) updateData.description = description.trim();
      if (unit !== undefined) updateData.unit = unit.trim();
      if (medianPrice !== undefined) updateData.medianPrice = medianPrice ? Number(medianPrice) : null;
      if (state !== undefined) updateData.state = state?.trim() || null;
      if (referenceMonth !== undefined) updateData.referenceMonth = referenceMonth ? Number(referenceMonth) : null;
      if (referenceYear !== undefined) updateData.referenceYear = referenceYear ? Number(referenceYear) : null;
      if (categoryId !== undefined) updateData.categoryId = categoryId || null;
      if (costCenterId !== undefined) updateData.costCenterId = costCenterId || null;
      if (isActive !== undefined) updateData.isActive = isActive;

      const material = await prisma.engineeringMaterial.update({
        where: { id },
        data: updateData
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
   * Deleta um material
   */
  async deleteMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Verificar se o material existe
      const existing = await prisma.engineeringMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      await prisma.engineeringMaterial.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Material excluído com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Importa materiais de um arquivo CSV/JSON
   */
  async importMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { materials } = req.body;

      if (!materials || !Array.isArray(materials) || materials.length === 0) {
        throw createError('Lista de materiais é obrigatória e deve ser um array', 400);
      }

      const results = {
        created: 0,
        errors: [] as string[]
      };

      for (const materialData of materials) {
        try {
          const { sinapiCode, name, description, unit, medianPrice, state, referenceMonth, referenceYear, categoryId, costCenterId, isActive = true } = materialData;

          // Se não tiver sinapiCode, tentar usar 'name' como fallback para compatibilidade
          const code = sinapiCode || materialData.code;
          
          if (!code || !description || !unit) {
            results.errors.push(`Material sem código SINAPI, descrição ou unidade: ${JSON.stringify(materialData)}`);
            continue;
          }

          await prisma.engineeringMaterial.create({
            data: {
              sinapiCode: code.trim().toUpperCase(),
              name: name?.trim() || null,
              description: description.trim(),
              unit: unit.trim(),
              medianPrice: medianPrice ? Number(medianPrice) : null,
              state: state?.trim() || null,
              referenceMonth: referenceMonth ? Number(referenceMonth) : null,
              referenceYear: referenceYear ? Number(referenceYear) : null,
              categoryId: categoryId || null,
              costCenterId: costCenterId || null,
              isActive: isActive !== false
            } as any
          });

          results.created++;
        } catch (error: any) {
          const materialName = materialData.description || materialData.name || materialData.sinapiCode || 'material';
          results.errors.push(`Erro ao importar ${materialName}: ${error.message}`);
        }
      }

      res.json({
        success: true,
        message: `Importação concluída: ${results.created} materiais criados`,
        data: results
      });
    } catch (error) {
      next(error);
    }
  }
}
