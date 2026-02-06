import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserController } from '../controllers/UserController';
import { getBirthdayEmployees } from '../controllers/EmployeeController';
import { importEmployees, importEmployeesPreview, importEmployeesBulk } from '../controllers/EmployeeImportController';
import { uploadImport, handleUploadError } from '../middleware/upload';

const router = express.Router();
const userController = new UserController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rota para aniversariantes (DEVE vir antes de /:id)
router.get('/birthdays', authorize('EMPLOYEE'), getBirthdayEmployees);

// Rota para preview/validação de importação (DEVE vir antes de /:id)
router.post('/import/preview', authorize('EMPLOYEE'), uploadImport.single('file'), handleUploadError, importEmployeesPreview);

// Rota para importação em massa a partir de dados processados (DEVE vir antes de /:id)
router.post('/import/bulk', authorize('EMPLOYEE'), importEmployeesBulk);

// Rota para importação em massa (DEVE vir antes de /:id)
router.post('/import', authorize('EMPLOYEE'), uploadImport.single('file'), handleUploadError, importEmployees);

// Rota para verificar se CPF existe (DEVE vir antes de /:id)
router.get('/check-cpf', authorize('EMPLOYEE'), userController.checkCpfExists);

// Rota para verificar se email existe (DEVE vir antes de /:id)
router.get('/check-email', authorize('EMPLOYEE'), userController.checkEmailExists);

// Rotas para funcionários - agora todos têm acesso
router.get('/', authorize('EMPLOYEE'), userController.getAllUsers);
router.get('/me/employee', userController.getMyEmployeeData);
router.put('/me/employee', userController.updateMyEmployeeData);
router.post('/', authorize('EMPLOYEE'), userController.createUser);

// Rotas para funcionários
router.get('/department/:department', authorize('EMPLOYEE'), userController.getUsersByDepartment);

// Rotas com parâmetros (DEVEM vir por último)
router.get('/:id', authorize('EMPLOYEE'), userController.getUserById);
router.put('/:id', authorize('EMPLOYEE'), userController.updateUser);
router.delete('/:id', authorize('EMPLOYEE'), userController.deleteUser);

export default router;
