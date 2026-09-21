import { Platform } from 'react-native';

/** Detecta Samsung pra padding da tab bar (3 botões / One UI). */
export function isSamsungDevice() {
  if (Platform.OS !== 'android') return false;
  const c = Platform.constants as { Brand?: string; Manufacturer?: string } | undefined;
  const brand = `${c?.Brand ?? ''} ${c?.Manufacturer ?? ''}`;
  return /samsung/i.test(brand);
}

/** Constantes da tab bar custom Samsung (folga igual cima/baixo). */
export const SAMSUNG_TAB_V_PAD = 14;
export const SAMSUNG_TAB_ICON = 22;
export const SAMSUNG_TAB_LABEL_GAP = 2;
export const SAMSUNG_TAB_LABEL_LINE = 12;

export function getSamsungTabBarHeight(insetsBottom: number) {
  const safe = insetsBottom > 10 ? insetsBottom : 0;
  return (
    SAMSUNG_TAB_V_PAD +
    SAMSUNG_TAB_ICON +
    SAMSUNG_TAB_LABEL_GAP +
    SAMSUNG_TAB_LABEL_LINE +
    SAMSUNG_TAB_V_PAD +
    safe
  );
}

/** Altura total da tab bar Android. */
export function getAndroidTabBarHeight(insetsBottom: number) {
  if (isSamsungDevice()) {
    return getSamsungTabBarHeight(insetsBottom);
  }
  const contentH = 56;
  const bottomPad = insetsBottom > 10 ? insetsBottom + 6 : 28;
  return contentH + bottomPad;
}

/** Padding superior da tab bar Android (só barra padrão). */
export function getAndroidTabBarTopPad() {
  return 8;
}

/** Padding inferior da tab bar Android (só barra padrão). */
export function getAndroidTabBarBottomPad(insetsBottom: number) {
  return insetsBottom > 10 ? insetsBottom + 6 : 28;
}

/** Altura aproximada da UITabBar nativa no iOS. */
export function getIosTabBarHeight(insetsBottom: number) {
  return 49 + insetsBottom;
}

export function getTabBarHeight(insetsBottom: number) {
  return Platform.OS === 'ios'
    ? getIosTabBarHeight(insetsBottom)
    : getAndroidTabBarHeight(insetsBottom);
}
