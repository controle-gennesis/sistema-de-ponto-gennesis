import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { OvertimeController } from '../controllers/OvertimeController';

const router = express.Router();
const overtimeController = new OvertimeController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para funcionários
router.post('/request', overtimeController.requestOvertime);
router.get('/my-overtime', overtimeController.getMyOvertime);
router.get('/my-overtime/balance', overtimeController.getOvertimeBalance);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), overtimeController.getAllOvertime);
router.get('/pending', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), overtimeController.getPendingOvertime);
router.put('/:id/approve', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), overtimeController.approveOvertime);
router.put('/:id/reject', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), overtimeController.rejectOvertime);

// Relatórios
router.get('/reports/summary', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), overtimeController.getOvertimeSummary);

export default router;
