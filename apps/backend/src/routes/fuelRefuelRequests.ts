import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireFuelApproverAccess, requireFuelSuppliesAccess } from '../middleware/permissionAuth';
import { fuelRefuelRequestController } from '../controllers/FuelRefuelRequestController';

const router = Router();

router.use(authenticate);

router.get('/pending-count', (req, res, next) =>
  fuelRefuelRequestController.pendingCount(req, res, next),
);
router.get(
  '/aprovacoes',
  requireFuelApproverAccess,
  (req, res, next) => fuelRefuelRequestController.listManagerApprovals(req, res, next),
);
router.get('/', requireFuelSuppliesAccess, (req, res, next) =>
  fuelRefuelRequestController.list(req, res, next),
);
router.put('/:id/supplies-approve', requireFuelSuppliesAccess, (req, res, next) =>
  fuelRefuelRequestController.suppliesApprove(req, res, next),
);
router.put('/:id/supplies-reject', requireFuelSuppliesAccess, (req, res, next) =>
  fuelRefuelRequestController.suppliesReject(req, res, next),
);
router.get('/:id', (req, res, next) => fuelRefuelRequestController.getById(req, res, next));
router.put('/:id/manager-approve', requireFuelApproverAccess, (req, res, next) =>
  fuelRefuelRequestController.approve(req, res, next),
);
router.put('/:id/manager-reject', requireFuelApproverAccess, (req, res, next) =>
  fuelRefuelRequestController.reject(req, res, next),
);
router.post('/:id/approve', requireFuelApproverAccess, (req, res, next) =>
  fuelRefuelRequestController.approve(req, res, next),
);
router.post('/:id/reject', requireFuelApproverAccess, (req, res, next) =>
  fuelRefuelRequestController.reject(req, res, next),
);
router.post('/:id/cancel', (req, res, next) =>
  fuelRefuelRequestController.cancel(req, res, next),
);

export default router;
