import { Router } from 'express';
import { MaterialRequestController } from '../controllers/MaterialRequestController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const materialRequestController = new MaterialRequestController();

// Todas as rotas requerem autenticação
router.use(authenticate);
router.use(requireRole(['EMPLOYEE']));

// Criar requisição de material
router.post('/', (req, res, next) => 
  materialRequestController.createMaterialRequest(req, res, next)
);

// Listar requisições
router.get('/', (req, res, next) => 
  materialRequestController.listMaterialRequests(req, res, next)
);

// Obter requisição por ID
router.get('/:id', (req, res, next) => 
  materialRequestController.getMaterialRequestById(req, res, next)
);

// Atualizar status da requisição (compras)
router.patch('/:id/status', (req, res, next) => 
  materialRequestController.updateMaterialRequestStatus(req, res, next)
);

// Cancelar requisição
router.post('/:id/cancel', (req, res, next) => 
  materialRequestController.cancelMaterialRequest(req, res, next)
);

// Atualizar status de um item
router.patch('/items/:itemId/status', (req, res, next) => 
  materialRequestController.updateItemStatus(req, res, next)
);

// Endpoints auxiliares para formulários
router.get('/cost-centers', (req, res, next) => 
  materialRequestController.listCostCenters(req, res, next)
);

router.get('/projects', (req, res, next) => 
  materialRequestController.listProjects(req, res, next)
);

router.get('/materials', (req, res, next) => 
  materialRequestController.listMaterials(req, res, next)
);

router.get('/categories', (req, res, next) => 
  materialRequestController.listMaterialCategories(req, res, next)
);

export default router;
