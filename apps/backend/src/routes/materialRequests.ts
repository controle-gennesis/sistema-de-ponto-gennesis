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
// Prioriza Materiais de Construção - garante que cada um tenha correspondente em EngineeringMaterial
router.get('/materials', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const constructionMaterials = await prisma.constructionMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    const mappedMaterials: { id: string; code: string; sinapiCode?: string; name: string; description: string; unit: string; medianPrice: number | null }[] = [];

    for (const cm of constructionMaterials) {
      const sinapiCode = `CM-${cm.id}`;
      let eng = await prisma.engineeringMaterial.findUnique({
        where: { sinapiCode }
      });
      if (!eng) {
        eng = await prisma.engineeringMaterial.create({
          data: {
            sinapiCode,
            name: cm.name,
            description: cm.description || cm.name,
            unit: cm.unit,
            isActive: cm.isActive
          }
        });
      }
      mappedMaterials.push({
        id: eng.id,
        code: cm.name,
        sinapiCode: eng.sinapiCode,
        name: cm.description || cm.name || eng.description || eng.name || '',
        description: cm.description || eng.description || '',
        unit: eng.unit,
        medianPrice: eng.medianPrice ? Number(eng.medianPrice) : null
      });
    }

    // Incluir também EngineeringMaterials que não vêm de ConstructionMaterial (ex: importados SINAPI)
    const engMaterials = await prisma.engineeringMaterial.findMany({
      where: {
        isActive: true,
        sinapiCode: { not: { startsWith: 'CM-' } }
      },
      orderBy: { name: 'asc' }
    });
    for (const m of engMaterials) {
      if (!mappedMaterials.some((x) => x.id === m.id)) {
        mappedMaterials.push({
          id: m.id,
          code: m.sinapiCode,
          name: m.name || m.description,
          description: m.description,
          unit: m.unit,
          medianPrice: m.medianPrice ? Number(m.medianPrice) : null
        });
      }
    }
    mappedMaterials.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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

// Atualizar status da requisição
router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    const request = await materialRequestService.updateMaterialRequestStatus(id, {
      status,
      approvedBy: status === 'APPROVED' ? req.user.id : undefined,
      rejectedBy: status === 'REJECTED' ? req.user.id : undefined,
      rejectionReason: status === 'REJECTED' ? rejectionReason : undefined
    }, req.user.id);
    res.json({ success: true, data: request, message: 'Status atualizado' });
  } catch (error) {
    next(error);
  }
});

export default router;
