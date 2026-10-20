import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

/** Aviso discreto de que a lista mostrada é a última carregada (sem conexão agora). */
export default function OfflineBanner({ visible }: { visible: boolean }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 12,
          marginBottom: 12,
          backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.12)',
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'rgba(245,158,11,0.3)' : 'rgba(217,119,6,0.25)',
        },
        text: { flex: 1, fontSize: 12, fontWeight: '600', color: isDark ? '#fbbf24' : '#b45309' },
      }),
    [isDark],
  );
  if (!visible) return null;
  return (
    <View style={styles.wrap} accessibilityRole="alert">
      <WifiOff size={15} color={isDark ? '#fbbf24' : '#b45309'} strokeWidth={2.2} />
      <Text style={styles.text}>Sem conexão — mostrando o que foi carregado por último.</Text>
    </View>
  );
}
