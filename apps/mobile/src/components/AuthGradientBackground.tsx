import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Fundo vermelho do splash/Login desenhado em código (sem imagem pra carregar, então não
 * tem "piscada" de decodificação). Os valores foram ajustados contra a arte original: um
 * degradê vertical (vermelho médio → vermelho vivo) escurecido por um brilho invertido
 * que parte do canto superior esquerdo.
 */
export const AUTH_BG_TOP = 'rgb(174,48,48)';
export const AUTH_BG_BOTTOM = 'rgb(200,53,53)';

// No tema escuro o fundo não é vermelho: degradê cinza-azulado, mais claro que o formulário
// (#111827) pra ele se destacar, mais fechado em cima e mais claro embaixo.
const DARK_TOP = 'rgb(44,54,72)';
const DARK_BOTTOM = 'rgb(76,88,108)';
const DARK_SHADE = '#000000';

export default function AuthGradientBackground({ style }: { style?: StyleProp<ViewStyle> }) {
  const { isDark } = useTheme();
  const shade = isDark ? DARK_SHADE : '#000000';
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="authBase" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? DARK_TOP : AUTH_BG_TOP} />
            <Stop offset="1" stopColor={isDark ? DARK_BOTTOM : AUTH_BG_BOTTOM} />
          </LinearGradient>
          <RadialGradient id="authShade" cx="0" cy="0" fx="0" fy="0" rx="1.631" ry="1.179">
            <Stop offset="0" stopColor={shade} stopOpacity="0.312" />
            <Stop offset="0.25" stopColor={shade} stopOpacity="0.225" />
            <Stop offset="0.5" stopColor={shade} stopOpacity="0.142" />
            <Stop offset="0.75" stopColor={shade} stopOpacity="0.064" />
            <Stop offset="1" stopColor={shade} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#authBase)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#authShade)" />
      </Svg>
    </View>
  );
}
