import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/**
 * Fundo «vidro» para caixas e botões das telas: translúcido no iPhone e liso no Android. Fica atrás
 * do conteúdo (absoluto) e não recebe toques.
 */
export default function GlassBg({ radius = 14 }: { radius?: number }) {
  const { colors, isDark } = useTheme();
  // Translúcido liso, e não o BlurView: dentro das telas que fazem fade ao voltar (início e listas),
  // o vidro real do iPhone piscava. Sobre o fundo claro da tela o resultado é praticamente o mesmo.
  const bg =
    Platform.OS === 'ios'
      ? isDark
        ? 'rgba(255,255,255,0.09)'
        : 'rgba(255,255,255,0.78)'
      : isDark
        ? colors.card
        : colors.surface;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: bg }]}
    />
  );
}

/** Contêiner com o vidro: tira o fundo liso no iPhone (o vidro desenha por baixo) e põe a borda fina clara. */
export function glassBoxStyle(isDark: boolean) {
  if (Platform.OS !== 'ios') return null;
  return {
    backgroundColor: 'transparent',
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  } as const;
}
