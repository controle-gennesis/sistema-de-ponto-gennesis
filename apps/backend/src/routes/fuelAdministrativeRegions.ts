import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireFuelSuppliesAccess } from '../middleware/permissionAuth';
import { fuelAdministrativeRegionController } from '../controllers/FuelAdministrativeRegionController';

const router = Router();

router.use(authenticate);
router.use(requireFuelSuppliesAccess);

router.get('/', (req, res, next) => fuelAdministrativeRegionController.list(req, res, next));
router.post('/', (req, res, next) => fuelAdministrativeRegionController.create(req, res, next));
router.put('/:id', (req, res, next) => fuelAdministrativeRegionController.update(req, res, next));
router.delete('/:id', (req, res, next) => fuelAdministrativeRegionController.remove(req, res, next));

router.get('/:regionId/gas-stations', (req, res, next) =>
  fuelAdministrativeRegionController.listStations(req, res, next),
);
router.post('/:regionId/gas-stations', (req, res, next) =>
  fuelAdministrativeRegionController.createStation(req, res, next),
);
router.put('/:regionId/gas-stations/:stationId', (req, res, next) =>
  fuelAdministrativeRegionController.updateStation(req, res, next),
);
router.delete('/:regionId/gas-stations/:stationId', (req, res, next) =>
  fuelAdministrativeRegionController.removeStation(req, res, next),
);

export default router;
