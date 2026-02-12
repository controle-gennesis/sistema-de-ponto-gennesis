import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { MaterialRequestService } from '../services/MaterialRequestService';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const router = Router();
const materialRequestService = new MaterialRequestService();

// Todas as rotas requerem autenticação
router.use(authenticate);

// Endpoint auxiliar para listar materiais (deve vir antes de /:id)
router.get('/materials', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const materials = await prisma.engineeringMaterial.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        name: 'asc'
      },
      select: {
        id: true,
        sinapiCode: true,
        name: true,
        description: true,
        unit: true,
        medianPrice: true,
        state: true,
        referenceMonth: true,
        referenceYear: true
      }
    });

    // Mapear para formato esperado pelo frontend
    const mappedMaterials = materials.map(m => ({
      id: m.id,
      code: m.sinapiCode,
      name: m.name || m.description,
      description: m.description,
      unit: m.unit,
      medianPrice: m.medianPrice,
      state: m.state,
      referenceMonth: m.referenceMonth,
      referenceYear: m.referenceYear
    }));

    res.json({
      success: true,
      data: mappedMaterials
    });
  } catch (error) {
    next(error);
  }
});

// Listar requisições
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { 
      status, 
      costCenterId, 
      projectId, 
      requestedBy, 
      priority,
      page = '1',
      limit = '20'
    } = req.query;

    const result = await materialRequestService.listMaterialRequests({
      status: status as string,
      costCenterId: costCenterId as string,
      projectId: projectId as string,
      requestedBy: requestedBy as string,
      priority: priority as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string)
    });

    res.json({
      success: true,
      data: result.requests,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

// Criar requisição de material
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      throw createError('Usuário não autenticado', 401);
    }

    const { costCenterId, projectId, description, priority, items } = req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    const request = await materialRequestService.createMaterialRequest({
      requestedBy: req.user.id,
      costCenterId,
      projectId,
      description,
      priority: priority || 'MEDIUM',
      items: items.map((item: any) => ({
        materialId: item.materialId,
        quantity: item.quantity,
        notes: item.observation || item.notes
      }))
    });

    res.status(201).json({
      success: true,
      data: request,
      message: 'Requisição de material criada com sucesso'
    });
  } catch (error) {
    next(error);
  }
});

// Obter requisição por ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
});

export default router;
