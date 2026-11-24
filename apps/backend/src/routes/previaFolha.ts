import { Router, Response, NextFunction } from 'express';
import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
  PERMISSION_MODULE_CRUD_ACTIONS,
} from '@sistema-ponto/permission-modules';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import {
  atualizarPreviaFolha,
  obterPreviaFolha,
  previaFolhaAtualizando,
} from '../services/PreviaFolhaService';

/**
 * Prévia da Folha — SOMENTE CONSULTA. Não existe (nem deve existir) rota que grave na folha do TOTVS.
 * POST /atualizar só relê a consulta FOLPAG e guarda a cópia no Conecta.
 */
export const PREVIA_FOLHA_MODULE_KEY = pathToModuleKey('/ponto/metricas/previa-folha');

async function assertAcessoPreviaFolha(req: AuthRequest): Promise<void> {
  if (!req.user?.id) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  const row = await prisma.userPermission.findFirst({
    where: {
      userId: req.user.id,
      module: PREVIA_FOLHA_MODULE_KEY,
      allowed: true,
      action: { in: [PERMISSION_ACCESS_ACTION, ...PERMISSION_MODULE_CRUD_ACTIONS] },
    },
    select: { id: true },
  });
  if (!row) throw createError('Você não tem permissão para acessar a Prévia da Folha', 403);
}

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertAcessoPreviaFolha(req);
    const snap = await obterPreviaFolha();
    res.json({ success: true, data: { ...snap, atualizando: previaFolhaAtualizando() } });
  } catch (error) {
    next(error);
  }
});

router.post('/atualizar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertAcessoPreviaFolha(req);
    const usuario = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    try {
      const snap = await atualizarPreviaFolha('manual', usuario?.name ?? null);
      res.json({ success: true, data: { ...snap, atualizando: false } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw createError(`Não foi possível consultar a folha no TOTVS: ${msg}`, 502);
    }
  } catch (error) {
    next(error);
  }
});

export default router;
