import { Router } from 'express';

const router = Router();

/**
 * Versão do app mobile. Pública (sem login): o app antigo precisa conseguir perguntar mesmo
 * deslogado. Configurada por variáveis de ambiente (ex.: no Railway), sem precisar de deploy:
 *
 *   MOBILE_MIN_VERSION      menor versão que ainda pode usar o app (abaixo disso: atualização obrigatória)
 *   MOBILE_LATEST_VERSION   versão mais recente publicada (abaixo disso: aviso opcional)
 *   MOBILE_IOS_URL          link da loja (App Store / TestFlight)
 *   MOBILE_ANDROID_URL      link da loja (Play Store / APK)
 *   MOBILE_UPDATE_MESSAGE   (opcional) texto mostrado junto do aviso
 *
 * Sem as variáveis, o app não mostra nada.
 */
router.get('/', (req, res) => {
  const platform = String(req.query.platform ?? '').toLowerCase();
  const storeUrl =
    platform === 'ios'
      ? process.env.MOBILE_IOS_URL
      : platform === 'android'
        ? process.env.MOBILE_ANDROID_URL
        : undefined;

  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      minVersion: (process.env.MOBILE_MIN_VERSION || '').trim() || null,
      latestVersion: (process.env.MOBILE_LATEST_VERSION || '').trim() || null,
      storeUrl: (storeUrl || '').trim() || null,
      message: (process.env.MOBILE_UPDATE_MESSAGE || '').trim() || null,
    },
  });
});

export default router;
