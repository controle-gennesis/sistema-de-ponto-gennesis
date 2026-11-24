const { withAndroidManifest } = require('expo/config-plugins');

/**
 * A Play Console avisa que `screen.portrait` e `wifi` aparecem como recursos de hardware OBRIGATÓRIOS
 * (o app é só em retrato e usa permissões de rede) e isso esconde o app de alguns aparelhos
 * (tablet, desktop, Android XR). Marcamos os dois como opcionais no manifesto.
 */
const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = manifest['uses-feature'] ?? [];
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$?.['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        features.push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }
    manifest['uses-feature'] = features;
    return cfg;
  });
};
