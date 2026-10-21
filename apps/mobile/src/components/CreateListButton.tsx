import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import {
  emitFabBarLongPress,
  emitFabBarPress,
  type FabBarTabName,
} from '../navigation/fabBarEvents';

/**
 * Botão "Novo" da linha de busca das listas (no lugar do "+" flutuante). Dispara o mesmo evento
 * que o botão flutuante disparava, então cada tela continua abrindo o seu formulário/menu.
 * Segue o mesmo formato do botão de filtro: quadradinho arredondado, na altura da busca.
 */
export default function CreateListButton({ tab }: { tab: FabBarTabName }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: colors.primary }]}
      onPress={() => emitFabBarPress(tab)}
      onLongPress={() => emitFabBarLongPress(tab)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Novo"
    >
      <Plus size={22} color="#fff" strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
});
