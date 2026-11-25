import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

/** iPhone com iOS 26 ou mais novo: usa o Liquid Glass nativo do sistema (o mesmo do WhatsApp). */
export const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();
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

/**
 * Vidro dos botões do topo (menu, notificações): desfoque de verdade no iPhone, com a borda clara fininha.
 * Vai como primeiro filho de um contêiner sem fundo próprio; no Android fica um fundo liso.
 */
export function GlassBlur({
  radius = 22,
  frosted = false,
  white = false,
  glassOnIos = false,
}: {
  radius?: number;
  frosted?: boolean;
  /** Fundo branco liso (tema escuro: cor do cartão), com a borda fininha. */
  white?: boolean;
  /** No iPhone ignora `white` e usa o vidro (Liquid Glass no iOS 26); no Android continua branco liso. */
  glassOnIos?: boolean;
}) {
  const { colors, isDark } = useTheme();
  if (white && !(glassOnIos && Platform.OS === 'ios')) {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            backgroundColor: isDark ? colors.card : '#ffffff',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)',
          },
        ]}
      />
    );
  }
  // `frosted` força o vidro fosco (desfoque comum), mesmo onde existe o Liquid Glass nativo.
  if (LIQUID_GLASS && !frosted) {
    return (
      // Sem pointerEvents="none": o vidro precisa receber o toque para fazer a animação nativa
      // (o toque sobe até o botão pai, que continua tratando o clique normalmente).
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius }]}>
        {/* Fundo de reserva: o vidro nativo some sobre fundo liso claro ou dentro de telas que fazem fade. */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.30)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)',
            },
          ]}
        />
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          colorScheme={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      </View>
    );
  }
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        pointerEvents="none"
        intensity={70}
        tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
          },
        ]}
      />
    );
  }
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          backgroundColor: isDark ? colors.card : colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isDark ? 'transparent' : 'rgba(15,23,42,0.08)',
        },
      ]}
    />
  );
}
