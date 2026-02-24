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
      const { search, isActive, page = 1, limit = 20 } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
          { unit: { contains: search as string, mode: 'insensitive' } }
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
      
      const { name, sinapiCode, description, unit, isActive } = req.body;

      // Aceitar tanto 'name' quanto 'sinapiCode' (sinapiCode será usado como name)
      const materialName = (name || sinapiCode)?.trim();

      // Validar campos obrigatórios
      if (!materialName) {
        throw createError('Código SINAPI (ou nome) é obrigatório', 400);
      }

      if (!unit || !unit.trim()) {
        throw createError('Unidade de medida é obrigatória', 400);
      }

      if (!description || !description.trim()) {
        throw createError('Descrição é obrigatória', 400);
      }

      // Preparar dados para criação
      const materialData: any = {
        name: materialName,
        description: description.trim(),
        unit: unit.trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true
      };

      console.log('✅ Validação passou. Criando material com:', materialData);

      const material = await prisma.constructionMaterial.create({
        data: materialData
      });

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
        return next(createError('Já existe um material com este código SINAPI', 409));
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
      const { name, sinapiCode, description, unit, isActive } = req.body;

      // Verificar se o material existe
      const existing = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      // Aceitar tanto 'name' quanto 'sinapiCode' (sinapiCode será usado como name)
      const materialName = name || sinapiCode;

      const material = await prisma.constructionMaterial.update({
        where: { id },
        data: {
          ...(materialName && { name: materialName }),
          ...(description !== undefined && { description }),
          ...(unit && { unit }),
          ...(isActive !== undefined && { isActive })
        }
      });

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

