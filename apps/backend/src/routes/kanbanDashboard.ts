import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  KANBAN_DASHBOARD_GROUPS,
  KanbanDashboardGroup,
  KanbanDashboardService,
} from '../services/KanbanDashboardService';

const router = Router();
const service = new KanbanDashboardService();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Não autenticado' });
      return;
    }
    const boardId = typeof req.query.boardId === 'string' && req.query.boardId ? req.query.boardId : undefined;
    const assigneeUserId =
      typeof req.query.assigneeUserId === 'string' && req.query.assigneeUserId ? req.query.assigneeUserId : undefined;
    const data = await service.getDashboard(userId, { boardId, assigneeUserId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/cards', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Não autenticado' });
      return;
    }
    const group = String(req.query.group ?? 'total') as KanbanDashboardGroup;
    if (!KANBAN_DASHBOARD_GROUPS.includes(group)) {
      res.status(400).json({ success: false, message: 'Grupo inválido' });
      return;
    }
    const boardId = typeof req.query.boardId === 'string' && req.query.boardId ? req.query.boardId : undefined;
    const assigneeUserId =
      typeof req.query.assigneeUserId === 'string' && req.query.assigneeUserId ? req.query.assigneeUserId : undefined;
    const data = await service.listCards(userId, group, { boardId, assigneeUserId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
