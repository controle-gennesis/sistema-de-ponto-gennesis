import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { BudgetNatureController } from '../controllers/BudgetNatureController';
import { uploadImport, handleUploadError } from '../middleware/upload';

const router = Router();
const controller = new BudgetNatureController();
const budgetNatureModule = pathToModuleKey('/ponto/natureza-orcamentaria');

// Todas as rotas requerem autenticação
router.use(authenticate);

// Leitura: qualquer usuário autenticado pode listar/ver naturezas (é só um picklist de
// referência usado em outras telas, como o cadastro de Materiais e Serviços — não exige
// a permissão de gerenciar a página "Natureza Orçamentária").
router.get('/', (req, res, next) => controller.getAll(req as any, res as any, next));
router.get('/:id', (req, res, next) => controller.getById(req as any, res as any, next));

// Escrita: só quem tem acesso à página "Natureza Orçamentária".
router.use(requireModuleAccess(budgetNatureModule));

router.post('/import', uploadImport.single('file'), (req: Request, res: Response, next: NextFunction) => controller.importFile(req, res, next), handleUploadError);
router.post('/', (req, res, next) => controller.create(req as any, res as any, next));
router.patch('/:id', (req, res, next) => controller.update(req as any, res as any, next));
router.delete('/:id', (req, res, next) => controller.delete(req as any, res as any, next));

export default router;

