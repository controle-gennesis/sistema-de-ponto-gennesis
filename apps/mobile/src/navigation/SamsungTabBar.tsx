import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Fuel, CarFront, Inbox, Wrench, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { emitFabBarPress, type FabBarTabName } from './fabBarEvents';
import { useChromeVisibility } from './ChromeVisibilityContext';
import {
  getSamsungTabBarHeight,
  SAMSUNG_TAB_ICON,
  SAMSUNG_TAB_LABEL_GAP,
  SAMSUNG_TAB_LABEL_LINE,
  SAMSUNG_TAB_V_PAD,
} from './tabBarLayout';

const ICONS: Record<string, LucideIcon> = {
  Home: House,
  Combustivel: Fuel,
  Reservas: CarFront,
  DpRequests: Inbox,
  GestaoOs: Wrench,
};

const LABELS: Record<string, string> = {
  Home: 'Início',
  Combustivel: 'Abastecimento',
  Reservas: 'Frota',
  DpRequests: 'Solicitações',
  GestaoOs: 'Chamados',
};

const FAB_TABS = new Set(['Combustivel', 'Reservas', 'DpRequests', 'GestaoOs']);

export default function SamsungTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const chrome = useChromeVisibility();
  const safeBottom = insets.bottom > 10 ? insets.bottom : 0;
  const height = getSamsungTabBarHeight(insets.bottom);

  const active = colors.primary;
  const inactive = isDark ? '#9ca3af' : '#6b7280';
  const bg = isDark ? '#111827' : '#ffffff';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';

  return (
    <View
      style={[
        styles.bar,
        {
          height,
          paddingTop: SAMSUNG_TAB_V_PAD,
          paddingBottom: SAMSUNG_TAB_V_PAD + safeBottom,
          backgroundColor: bg,
          borderTopColor: border,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const color = focused ? active : inactive;
        const Icon = ICONS[route.name] ?? House;
        const label = LABELS[route.name] ?? options.title ?? route.name;
        const isLong = route.name === 'Combustivel';

        const onPress = () => {
          chrome?.reveal();
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (focused && FAB_TABS.has(route.name)) {
            emitFabBarPress(route.name as FabBarTabName);
            return;
          }
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            android_ripple={null}
            style={styles.item}
          >
            <Icon size={SAMSUNG_TAB_ICON} color={color} strokeWidth={1.85} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={isLong}
              minimumFontScale={isLong ? 0.72 : 1}
              style={[styles.label, { color, marginTop: SAMSUNG_TAB_LABEL_GAP }]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
    lineHeight: SAMSUNG_TAB_LABEL_LINE,
  },
});
