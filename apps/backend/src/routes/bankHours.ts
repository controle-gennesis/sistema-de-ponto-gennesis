import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { BankHoursController } from '../controllers/BankHoursController';

const router = express.Router();
const bankHoursController = new BankHoursController();
const bankHoursModule = pathToModuleKey('/ponto/banco-horas');

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Retorna banco de horas de TODOS os funcionários (não é autoconsulta) — mesma
// permissão que já gateia a página "Banco de Horas" no frontend.
router.get('/employees', requireModuleAccess(bankHoursModule), bankHoursController.getBankHoursByEmployee);

export default router;
