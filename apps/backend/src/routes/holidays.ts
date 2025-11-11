import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { HolidayController } from '../controllers/HolidayController';

const router = express.Router();
const holidayController = new HolidayController();

// Rotas públicas (não precisam de autenticação)
router.get('/check', holidayController.checkIsHoliday);
router.get('/period', holidayController.getHolidaysByPeriod);
router.get('/working-days', holidayController.countWorkingDays);

// Rotas que precisam de autenticação
router.use(authenticate);

// CRUD de feriados
router.post('/', authorize('EMPLOYEE'), holidayController.createHoliday);
router.get('/', holidayController.getHolidays);
router.get('/:id', holidayController.getHolidayById);
router.put('/:id', authorize('EMPLOYEE'), holidayController.updateHoliday);
router.delete('/:id', authorize('EMPLOYEE'), holidayController.deleteHoliday);

// Importação e geração de feriados
router.post('/import/national', authorize('EMPLOYEE'), holidayController.importNationalHolidays);
router.post('/generate/recurring', authorize('EMPLOYEE'), holidayController.generateRecurringHolidays);

export default router;

