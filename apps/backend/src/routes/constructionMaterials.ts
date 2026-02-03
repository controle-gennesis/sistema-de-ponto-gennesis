import { Router } from 'express';
import { ConstructionMaterialController } from '../controllers/ConstructionMaterialController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const constructionMaterialController = new ConstructionMaterialController();

router.use(authenticate);

// Listar todos os materiais (todos podem ver)
router.get('/', (req, res, next) => 
  constructionMaterialController.getAllMaterials(req, res, next)
);

// Obter material por ID
router.get('/:id', (req, res, next) => 
  constructionMaterialController.getMaterialById(req, res, next)
);

// Criar novo material (apenas administrador ou departamento pessoal)
router.post('/', requireRole(['ADMIN', 'DEPARTAMENTO_PESSOAL']), (req, res, next) => 
  constructionMaterialController.createMaterial(req, res, next)
);

// Atualizar material (apenas administrador ou departamento pessoal)
router.patch('/:id', requireRole(['ADMIN', 'DEPARTAMENTO_PESSOAL']), (req, res, next) => 
  constructionMaterialController.updateMaterial(req, res, next)
);

// Deletar material (apenas administrador ou departamento pessoal)
router.delete('/:id', requireRole(['ADMIN', 'DEPARTAMENTO_PESSOAL']), (req, res, next) => 
  constructionMaterialController.deleteMaterial(req, res, next)
);

export default router;

