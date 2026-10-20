import { requestResetCode, resetPasswordWithCode } from '../services/PasswordResetCodeService';
import express from 'express';
import multer from 'multer';
import {
  authenticate,
  authenticateForRefresh,
  requireAdministrator,
} from '../middleware/auth';
import { AuthController } from '../controllers/AuthController';

const router = express.Router();
const authController = new AuthController();

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Rotas públicas
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
// Redefinição por código de 6 dígitos enviado por e-mail. Cobertas pelos mesmos limitadores de
// '/forgot-password' e '/reset-password' (prefixo).
router.post('/forgot-password/code', async (req, res, next) => {
  try {
    const result = await requestResetCode(req.body?.identifier);
    return res.json({
      success: true,
      data: result,
      message: result.sent
        ? `Enviamos um código para ${result.maskedEmail}.`
        : 'Se houver uma conta com e-mail cadastrado, enviaremos o código em instantes.',
    });
  } catch (error) {
    return next(error);
  }
});
router.post('/reset-password/code', async (req, res, next) => {
  try {
    await resetPasswordWithCode(req.body?.identifier, req.body?.code, req.body?.newPassword);
    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso. Faça login com a nova senha.',
    });
  } catch (error) {
    return next(error);
  }
});
router.get('/reset-password/validate', authController.validateResetToken);
router.post('/reset-password', authController.resetPassword);
// Aceita access token válido ou expirado dentro da janela de graça
router.post('/refresh-token', authenticateForRefresh, authController.publicRefreshToken);

// Registro apenas para administradores autenticados (criação de usuários também existe em /users)
router.post('/register', authenticate, requireAdministrator, authController.register);

// Rotas protegidas
router.use(authenticate);
router.post('/logout', authController.logout);
router.get('/me', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.patch('/me/photo', uploadAvatar.single('profileAvatar'), authController.uploadProfilePhoto);
router.post(
  '/me/profile-setup',
  uploadAvatar.single('profileAvatar'),
  authController.completeProfileSetup
);
router.delete('/me/photo', authController.removeProfilePhoto);
router.patch('/me/face-photo', uploadAvatar.single('facePhoto'), authController.uploadMyFacePhoto);
router.put('/change-password', authController.changePassword);
router.post(
  '/impersonate/:userId',
  requireAdministrator,
  authController.startImpersonation
);
router.post('/stop-impersonation', authController.stopImpersonation);
// Rota protegida de refresh (para compatibilidade, mantém a antiga)
router.post('/refresh-token-protected', authController.refreshToken);

export default router;
