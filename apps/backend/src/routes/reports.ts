import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { ReportController } from '../controllers/ReportController';

const router = express.Router();
const reportController = new ReportController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.getAllReports);
router.get('/:id', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.getReportById);
router.post('/generate', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.generateReport);
router.get('/:id/download', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.downloadReport);

// Relatórios específicos
router.get('/attendance/summary', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.getAttendanceSummary);
router.get('/productivity/analysis', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.getProductivityAnalysis);
router.get('/overtime/summary', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.getOvertimeSummary);
router.get('/vacation/summary', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), reportController.getVacationSummary);

export default router;
