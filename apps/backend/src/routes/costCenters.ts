import { Router } from 'express';
// import { CostCenterController } from '../controllers/CostCenterController';
import { authenticate } from '../middleware/auth';
// import { checkAdminOrPessoal } from '../middleware/adminOrPessoal';

const router = Router();
// const costCenterController = new CostCenterController();

router.use(authenticate);

// Rotas temporariamente desabilitadas - controllers não implementados
// TODO: Implementar CostCenterController e adminOrPessoal middleware
/*
// Listar todos os centros de custo (todos podem ver)
router.get('/', (req, res, next) => 
  costCenterController.getAllCostCenters(req, res, next)
);

// Obter centro de custo por ID
router.get('/:id', (req, res, next) => 
  costCenterController.getCostCenterById(req, res, next)
);

// Criar centro de custo (apenas administrador ou departamento pessoal)
router.post('/', checkAdminOrPessoal, (req, res, next) => 
  costCenterController.createCostCenter(req, res, next)
);

// Atualizar centro de custo (apenas administrador ou departamento pessoal)
router.patch('/:id', checkAdminOrPessoal, (req, res, next) => 
  costCenterController.updateCostCenter(req, res, next)
);

// Deletar centro de custo (apenas administrador ou departamento pessoal)
router.delete('/:id', checkAdminOrPessoal, (req, res, next) => 
  costCenterController.deleteCostCenter(req, res, next)
);
*/

export default router;
