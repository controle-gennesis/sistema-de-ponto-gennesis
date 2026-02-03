import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { MaterialRequestService, CreateMaterialRequestData, UpdateMaterialRequestStatusData } from '../services/MaterialRequestService';
import { prisma } from '../lib/prisma';

const materialRequestService = new MaterialRequestService();

export class MaterialRequestController {
  /**
   * Cria uma nova requisição de material
   */
  async createMaterialRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { costCenterId, projectId, serviceOrder, description, priority, items } = req.body;

      if (!req.user?.id) {
        throw createError('Usuário não autenticado', 401);
      }

      if (!costCenterId) {
        throw createError('Centro de custo é obrigatório', 400);
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        throw createError('É necessário informar pelo menos um item', 400);
      }

      // Usar serviceOrder se fornecido, caso contrário usar projectId (para compatibilidade)
      const projectIdOrServiceOrder = serviceOrder || projectId;

      const data: CreateMaterialRequestData = {
        requestedBy: req.user.id,
        costCenterId,
        projectId: projectIdOrServiceOrder,
        description,
        priority: priority || 'MEDIUM',
        items
      };

      const request = await materialRequestService.createMaterialRequest(data);

      res.json({
        success: true,
        message: 'Requisição de material criada com sucesso',
        data: request
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista requisições de material
   */
  async listMaterialRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        status,
        costCenterId,
        projectId,
        requestedBy,
        priority,
        page,
        limit
      } = req.query;

      const filters: any = {};

      if (status) filters.status = status;
      if (costCenterId) filters.costCenterId = costCenterId as string;
      if (projectId) filters.projectId = projectId as string;
      if (requestedBy) filters.requestedBy = requestedBy as string;
      if (priority) filters.priority = priority as string;
      if (page) filters.page = parseInt(page as string);
      if (limit) filters.limit = parseInt(limit as string);

      const result = await materialRequestService.listMaterialRequests(filters);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém uma requisição por ID
   */
  async getMaterialRequestById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const request = await materialRequestService.getMaterialRequestById(id);

      if (!request) {
        throw createError('Requisição não encontrada', 404);
      }

      res.json({
        success: true,
        data: request
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualiza status da requisição (apenas compras)
   */
  async updateMaterialRequestStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, rejectionReason } = req.body;

      if (!req.user?.id) {
        throw createError('Usuário não autenticado', 401);
      }

      if (!status) {
        throw createError('Status é obrigatório', 400);
      }

      const data: UpdateMaterialRequestStatusData = {
        status,
        rejectionReason
      };

      if (status === 'APPROVED') {
        data.approvedBy = req.user.id;
      }

      if (status === 'REJECTED') {
        data.rejectedBy = req.user.id;
        if (!rejectionReason) {
          throw createError('Motivo da rejeição é obrigatório', 400);
        }
      }

      const request = await materialRequestService.updateMaterialRequestStatus(id, data, req.user.id);

      res.json({
        success: true,
        message: 'Status da requisição atualizado com sucesso',
        data: request
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancela uma requisição
   */
  async cancelMaterialRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!req.user?.id) {
        throw createError('Usuário não autenticado', 401);
      }

      const request = await materialRequestService.cancelMaterialRequest(id, req.user.id);

      res.json({
        success: true,
        message: 'Requisição cancelada com sucesso',
        data: request
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualiza status de um item
   */
  async updateItemStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { itemId } = req.params;
      const { status, fulfilledQuantity } = req.body;

      if (!status) {
        throw createError('Status é obrigatório', 400);
      }

      const item = await materialRequestService.updateItemStatus(
        itemId,
        status,
        fulfilledQuantity
      );

      res.json({
        success: true,
        message: 'Status do item atualizado com sucesso',
        data: item
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista centros de custo disponíveis
   */
  async listCostCenters(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const costCenters = await prisma.costCenter.findMany({
        where: {
          isActive: true
        },
        orderBy: {
          name: 'asc'
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true
        }
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
   * Lista projetos/obras disponíveis
   */
  async listProjects(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { costCenterId } = req.query;

      const where: any = {
        isActive: true
      };

      if (costCenterId) {
        where.costCenterId = costCenterId as string;
      }

      const projects = await prisma.project.findMany({
        where,
        orderBy: {
          name: 'asc'
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          status: true,
          costCenter: {
            select: {
              id: true,
              code: true,
              name: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: projects
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista materiais disponíveis para requisição
   */
  async listMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        categoryId, 
        costCenterId, 
        search,
        state,
        page,
        limit 
      } = req.query;

      const pageNum = page ? parseInt(page as string) : 1;
      const limitNum = limit ? parseInt(limit as string) : 50;
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        isActive: true
      };

      if (categoryId) {
        where.categoryId = categoryId as string;
      }

      if (costCenterId) {
        where.costCenterId = costCenterId as string;
      }

      if (state) {
        where.state = state as string;
      }

      if (search) {
        where.OR = [
          { description: { contains: search as string, mode: 'insensitive' } },
          { sinapiCode: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [materials, total] = await Promise.all([
        prisma.engineeringMaterial.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: {
            description: 'asc'
          },
          select: {
            id: true,
            sinapiCode: true,
            description: true,
            unit: true,
            medianPrice: true,
            state: true,
            referenceMonth: true,
            referenceYear: true,
            category: {
              select: {
                id: true,
                code: true,
                name: true
              }
            },
            costCenter: {
              select: {
                id: true,
                code: true,
                name: true
              }
            }
          }
        }),
        prisma.engineeringMaterial.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          materials,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista categorias de materiais
   */
  async listMaterialCategories(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.materialCategory.findMany({
        where: {
          isActive: true
        },
        orderBy: {
          name: 'asc'
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true
        }
      });

      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      next(error);
    }
  }
}
