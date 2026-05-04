import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class ConstructionMaterialController {
  private buildMaterialData(body: any) {
    const {
      name,
      sinapiCode,
      description,
      unit,
      isActive,
      category,
      dimensions,
      productImageUrl,
      productImageName
    } = body;

    const descTrim = description?.trim() || '';
    const materialName =
      ((name || sinapiCode)?.trim() || (descTrim ? descTrim.slice(0, 255) : '')).toUpperCase();

    return {
      materialName,
      descTrim,
      unitTrim: unit?.trim(),
      fullData: {
        name: materialName,
        description: descTrim,
        unit: unit?.trim(),
        category: category?.trim() || null,
        dimensions: dimensions?.trim() || null,
        productImageUrl: productImageUrl?.trim() || null,
        productImageName: productImageName?.trim() || null,
        isActive: isActive !== undefined ? Boolean(isActive) : true
      } as any
    };
  }

  private isUnknownFieldPrismaError(error: any) {
    if (!error) return false;
    const msg = String(error?.message || '');
    return error.name === 'PrismaClientValidationError' && /Unknown argument|Argument .+ is missing/i.test(msg);
  }

  /**
   * Listar todos os materiais de construção
   */
  async getAllMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive, page = 1, limit = 20 } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
          { unit: { contains: search as string, mode: 'insensitive' } },
          { category: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // Limitar o máximo de registros por página
      const limitNum = Math.min(Number(limit), 100);
      const skip = (Number(page) - 1) * limitNum;

      const [materials, total] = await Promise.all([
        prisma.constructionMaterial.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { name: 'asc' }
        }),
        prisma.constructionMaterial.count({ where })
      ]);

      // Mapear 'name' para 'sinapiCode' para compatibilidade com o frontend
      const mappedMaterials = materials.map(m => ({
        ...m,
        sinapiCode: m.name
      }));

      res.json({
        success: true,
        data: mappedMaterials,
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
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

      // Mapear 'name' para 'sinapiCode' para compatibilidade com o frontend
      const mappedMaterial = {
        ...material,
        sinapiCode: material.name
      };

      res.json({
        success: true,
        data: mappedMaterial
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
      console.log('📦 Dados recebidos para criar material:', req.body);
      
      const { materialName, descTrim, unitTrim, fullData } = this.buildMaterialData(req.body);

      // Validar campos obrigatórios
      if (!materialName) {
        throw createError('Descrição é obrigatória', 400);
      }

      if (!unitTrim) {
        throw createError('Unidade de medida é obrigatória', 400);
      }

      if (!descTrim) {
        throw createError('Descrição é obrigatória', 400);
      }

      console.log('✅ Validação passou. Criando material com:', fullData);

      let material: any;
      try {
        material = await prisma.constructionMaterial.create({
          data: fullData
        });
      } catch (error: any) {
        // Fallback: se o banco/cliente ainda não tiver as novas colunas, salva os campos legados.
        if (!this.isUnknownFieldPrismaError(error)) throw error;

        material = await prisma.constructionMaterial.create({
          data: {
            name: fullData.name,
            description: fullData.description,
            unit: fullData.unit,
            isActive: fullData.isActive
          }
        });
      }

      // Criar correspondente em EngineeringMaterial para aparecer em Solicitar Materiais
      try {
        await prisma.engineeringMaterial.create({
          data: {
            sinapiCode: `CM-${material.id}`,
            name: material.name,
            description: material.description || material.name,
            unit: material.unit,
            isActive: material.isActive
          }
        });
      } catch (engErr) {
        console.warn('Aviso: material criado mas falha ao sincronizar com EngineeringMaterial:', engErr);
      }

      // Mapear 'name' para 'sinapiCode' para compatibilidade com o frontend
      const mappedMaterial = {
        ...material,
        sinapiCode: material.name
      };

      res.status(201).json({
        success: true,
        data: mappedMaterial,
        message: 'Material criado com sucesso'
      });
    } catch (error: any) {
      console.error('❌ Erro ao criar material:', error);
      
      // Se for erro do Prisma, logar mais detalhes
      if (error.code) {
        console.error('Código do erro Prisma:', error.code);
        console.error('Mensagem do erro Prisma:', error.meta);
      }
      
      // Se já for um erro criado com createError, passar adiante
      if (error.statusCode) {
        return next(error);
      }
      
      // Se for erro de validação do Prisma
      if (error.name === 'PrismaClientValidationError') {
        return next(createError('Dados inválidos fornecidos. Verifique os campos obrigatórios.', 400));
      }
      
      // Se for erro de chave única (material já existe)
      if (error.code === 'P2002') {
        return next(createError('Já existe um material com este nome', 409));
      }
      
      next(error);
    }
  }

  /**
   * Atualizar material
   */
  async updateMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        name,
        sinapiCode,
        description,
        unit,
        isActive,
        category,
        dimensions,
        productImageUrl,
        productImageName
      } = req.body;

      // Verificar se o material existe
      const existing = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      const materialName = (name || sinapiCode)?.trim().toUpperCase();

      const updateData: any = {
        ...(materialName && { name: materialName }),
        ...(description !== undefined && {
          description: typeof description === 'string' ? description.trim() : description
        }),
        ...(unit && { unit }),
        ...(category !== undefined && { category: category?.trim() || null }),
        ...(dimensions !== undefined && { dimensions: dimensions?.trim() || null }),
        ...(productImageUrl !== undefined && { productImageUrl: productImageUrl?.trim() || null }),
        ...(productImageName !== undefined && { productImageName: productImageName?.trim() || null }),
        ...(isActive !== undefined && { isActive })
      };
      let material: any;
      try {
        material = await prisma.constructionMaterial.update({
          where: { id },
          data: updateData
        });
      } catch (error: any) {
        // Fallback para ambientes sem as novas colunas.
        if (!this.isUnknownFieldPrismaError(error)) throw error;

        const fallbackData: any = {
          ...(materialName && { name: materialName }),
          ...(description !== undefined && {
            description: typeof description === 'string' ? description.trim() : description
          }),
          ...(unit && { unit }),
          ...(isActive !== undefined && { isActive })
        };

        material = await prisma.constructionMaterial.update({
          where: { id },
          data: fallbackData
        });
      }

      // Mapear 'name' para 'sinapiCode' para compatibilidade com o frontend
      const mappedMaterial = {
        ...material,
        sinapiCode: material.name
      };

      res.json({
        success: true,
        data: mappedMaterial,
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

