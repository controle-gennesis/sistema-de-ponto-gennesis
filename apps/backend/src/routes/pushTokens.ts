import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import {
  getPushPreferences,
  setPushPreference,
  isValidExpoPushToken,
  registerPushToken,
  removePushToken,
} from '../services/PushNotificationService';

const router = Router();

router.use(authenticate);

/** Registra (ou move pro usuário atual) o token de push do aparelho. */
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { token, platform } = req.body ?? {};
    if (!isValidExpoPushToken(token)) {
      return res.status(400).json({ success: false, message: 'Token de push inválido' });
    }
    await registerPushToken(req.user!.id, token, typeof platform === 'string' ? platform : null);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/** Remove o token (logout): o aparelho deixa de receber avisos dessa conta. */
router.delete('/', async (req: AuthRequest, res, next) => {
  try {
    const { token } = req.body ?? {};
    if (typeof token === 'string' && token) {
      await removePushToken(req.user!.id, token);
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/** Quais tipos de aviso a pessoa recebe (Perfil do app). */
router.get('/preferences', async (req: AuthRequest, res, next) => {
  try {
    return res.json({ success: true, data: await getPushPreferences(req.user!.id) });
  } catch (error) {
    return next(error);
  }
});

router.put('/preferences', async (req: AuthRequest, res, next) => {
  try {
    const { category, enabled } = req.body ?? {};
    if (typeof category !== 'string' || typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'Dados inválidos' });
    }
    await setPushPreference(req.user!.id, category, enabled);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Erro' });
  }
});

export default router;
