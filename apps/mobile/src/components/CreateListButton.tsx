import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '../context/ThemeContext';
import { LIQUID_GLASS } from './GlassBg';
import {
  emitFabBarLongPress,
  emitFabBarPress,
  type FabBarTabName,
} from '../navigation/fabBarEvents';

/**
 * Botão "Novo" da linha de busca das listas (no lugar do "+" flutuante). Dispara o mesmo evento
 * que o botão flutuante disparava, então cada tela continua abrindo o seu formulário/menu.
 * Redondo, na altura da busca: fundo vermelho com "+" branco; no iOS 26 o vidro nativo vai por cima.
 */
export default function CreateListButton({
  tab,
  onPress,
  accessibilityLabel = 'Novo',
}: {
  tab?: FabBarTabName;
  /** Quando a tela abre o próprio formulário (em vez do evento da barra de abas). */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: colors.primary }]}
      onPress={() => (onPress ? onPress() : tab ? emitFabBarPress(tab) : undefined)}
      onLongPress={tab && !onPress ? () => emitFabBarLongPress(tab) : undefined}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {LIQUID_GLASS ? (
        <View style={StyleSheet.absoluteFill}>
          <GlassView
            isInteractive
            glassEffectStyle="regular"
            tintColor={colors.primary}
            style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
          />
        </View>
      ) : null}
      <Plus size={24} color="#ffffff" strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
