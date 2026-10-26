import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, SquareKanban } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../../App';

/** Atalho da tela inicial para o quadro do Tasks (abre o favorito ou o do setor). */
export default function HomeTasksButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => navigation.navigate('KanbanBoard', {})}
      accessibilityRole="button"
      accessibilityLabel="Abrir Tasks"
    >
      <View style={styles.iconWrap}>
        <SquareKanban size={20} color={colors.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          Abrir o seu quadro
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textSecondary} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

function getStyles(colors: any) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    text: { flex: 1, minWidth: 0 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    subtitle: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  });
}
