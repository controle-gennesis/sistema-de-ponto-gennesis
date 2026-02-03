import { Router } from 'express';
import { BorderController } from '../controllers/BorderController';
import { CnabController } from '../controllers/CnabController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const borderController = new BorderController();
const cnabController = new CnabController();

// Todas as rotas de borderô requerem autenticação
router.use(authenticate);
router.use(requireRole(['EMPLOYEE']));

// Gerar borderô de pagamento em PDF
router.get('/pdf', (req, res, next) => 
  borderController.generateBorderPDF(req, res, next)
);

// Obter dados do borderô em JSON (para preview)
router.get('/data', (req, res, next) => 
  borderController.getBorderData(req, res, next)
);

// Gerar arquivo CNAB400 para remessa de pagamentos
router.get('/cnab400', (req, res, next) => 
  cnabController.generateCnab400(req, res, next)
);

// Obter dados do CNAB em JSON (para preview)
router.get('/cnab400/data', (req, res, next) => 
  cnabController.getCnabData(req, res, next)
);

export default router;
