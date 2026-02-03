import { Router } from 'express';
import { ConstructionMaterialController } from '../controllers/ConstructionMaterialController';
import { authenticate } from '../middleware/auth';
import { checkAdminOrPessoal } from '../middleware/adminOrPessoal';

const router = Router();
const materialController = new ConstructionMaterialController();

router.use(authenticate);

// Listar todos os materiais (todos podem ver)
router.get('/', (req, res, next) => 
  materialController.getAllMaterials(req, res, next)
);

// Obter material por ID
router.get('/:id', (req, res, next) => 
  materialController.getMaterialById(req, res, next)
);

// Criar material (apenas administrador ou departamento pessoal)
router.post('/', checkAdminOrPessoal, (req, res, next) => 
  materialController.createMaterial(req, res, next)
);

// Importar materiais (apenas administrador ou departamento pessoal)
router.post('/import', checkAdminOrPessoal, (req, res, next) => 
  materialController.importMaterials(req, res, next)
);

// Atualizar material (apenas administrador ou departamento pessoal)
router.patch('/:id', checkAdminOrPessoal, (req, res, next) => 
  materialController.updateMaterial(req, res, next)
);

// Deletar material (apenas administrador ou departamento pessoal)
router.delete('/:id', checkAdminOrPessoal, (req, res, next) => 
  materialController.deleteMaterial(req, res, next)
);

export default router;
