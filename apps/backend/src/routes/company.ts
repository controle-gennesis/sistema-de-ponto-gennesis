import express from 'express';
import { authenticate, requireAdministrator } from '../middleware/auth';
import { CompanyController } from '../controllers/CompanyController';

const router = express.Router();
const companyController = new CompanyController();

// Rotas públicas
router.get('/settings', (req, res, next) => companyController.getCompanySettings(req, res, next));

// Rotas protegidas
router.use(authenticate);
router.put('/settings', requireAdministrator, (req, res, next) =>
  companyController.updateCompanySettings(req, res, next)
);

export default router;
