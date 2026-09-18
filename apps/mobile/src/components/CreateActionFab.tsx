import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { emitFabBarLongPress, emitFabBarPress, type FabBarTabName } from '../navigation/fabBarEvents';
import { getTabBarHeight } from '../navigation/tabBarLayout';

const SIZE = 58;
const MARGIN = 16;
const RADIUS = 20;

type Props = {
  tab: FabBarTabName;
};

/** FAB fixo (mesmo visual do bater ponto) pra criar item na aba atual. */
export default function CreateActionFab({ tab }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // Mesma folga embaixo (acima da tab) e à direita
  const bottom = getTabBarHeight(insets.bottom) + MARGIN;

  return (
    <TouchableOpacity
      accessible
      accessibilityRole="button"
      accessibilityLabel="Criar novo"
      activeOpacity={0.88}
      onPress={() => emitFabBarPress(tab)}
      onLongPress={() => emitFabBarLongPress(tab)}
      style={[
        styles.fab,
        {
          right: MARGIN,
          bottom,
          backgroundColor: colors.primary,
          shadowOpacity: isDark ? 0.4 : 0.22,
        },
      ]}
    >
      <View pointerEvents="none">
        <Plus size={28} color="#fff" strokeWidth={2.5} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
    elevation: 26,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
      },
      android: {},
    }),
  },
});
