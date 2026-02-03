import { Router } from 'express';
import { CostCenterController } from '../controllers/CostCenterController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const costCenterController = new CostCenterController();

router.use(authenticate);

// Listar todos os centros de custo (todos podem ver)
router.get('/', (req, res, next) => 
  costCenterController.getAllCostCenters(req, res, next)
);

// Obter centro de custo por ID
router.get('/:id', (req, res, next) => 
  costCenterController.getCostCenterById(req, res, next)
);

// Criar centro de custo (apenas administrador ou departamento pessoal)
router.post('/', requireRole(['ADMIN', 'DEPARTAMENTO_PESSOAL']), (req, res, next) => 
  costCenterController.createCostCenter(req, res, next)
);

// Atualizar centro de custo (apenas administrador ou departamento pessoal)
router.patch('/:id', requireRole(['ADMIN', 'DEPARTAMENTO_PESSOAL']), (req, res, next) => 
  costCenterController.updateCostCenter(req, res, next)
);

// Deletar centro de custo (apenas administrador ou departamento pessoal)
router.delete('/:id', requireRole(['ADMIN', 'DEPARTAMENTO_PESSOAL']), (req, res, next) => 
  costCenterController.deleteCostCenter(req, res, next)
);

export default router;
