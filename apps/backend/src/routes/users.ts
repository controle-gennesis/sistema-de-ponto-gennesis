import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserController } from '../controllers/UserController';
import { getBirthdayEmployees } from '../controllers/EmployeeController';

const router = express.Router();
const userController = new UserController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rota para aniversariantes (DEVE vir antes de /:id)
router.get('/birthdays', authorize('EMPLOYEE'), getBirthdayEmployees);

// Rota para verificar se CPF existe (DEVE vir antes de /:id)
router.get('/check-cpf', authorize('EMPLOYEE'), userController.checkCpfExists);

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
