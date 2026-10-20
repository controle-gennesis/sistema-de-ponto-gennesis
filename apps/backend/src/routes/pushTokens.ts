import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import {
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

export default router;
