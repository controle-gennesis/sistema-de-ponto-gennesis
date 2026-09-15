import React, { useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, Fuel, CarFront, Inbox, Plus, Clock, Wrench, Camera, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { emitFabBarLongPress, emitFabBarPress, FabBarTabName } from './fabBarEvents';
import { useChromeVisibility } from './ChromeVisibilityContext';

const BUTTON = 58;
const RADIUS = 20;
const GAP = 10;
const HORIZONTAL_PADDING = 24;
const BOTTOM_PADDING = 18;
const ANDROID_BOTTOM_PADDING = 34;

const ICONS: Record<string, LucideIcon> = {
  Home: House,
  Ponto: Clock,
  Combustivel: Fuel,
  Reservas: CarFront,
  DpRequests: Inbox,
  GestaoOs: Wrench,
  Fuel,
  Vehicle: CarFront,
};

const SHORT_LABELS: Record<string, string> = {
  Home: 'Início',
  Ponto: 'Ponto',
  Combustivel: 'Abastecimento',
  Reservas: 'Frota',
  DpRequests: 'Solicitações',
  GestaoOs: 'Chamados',
  Fuel: 'Abastecimento',
  Vehicle: 'Frota',
};

const FAB_TABS = new Set(['Combustivel', 'Reservas', 'Fuel', 'Vehicle', 'DpRequests', 'GestaoOs']);

const FAB_ICONS: Record<string, LucideIcon> = {
  Combustivel: Plus,
  Reservas: Plus,
  DpRequests: Plus,
  Fuel: Plus,
  Vehicle: Plus,
  GestaoOs: Camera,
};

const FAB_LABELS: Record<string, string> = {
  Combustivel: 'Nova',
  Reservas: 'Nova',
  DpRequests: 'Nova',
  Fuel: 'Nova',
  Vehicle: 'Nova',
  GestaoOs: 'Escanear QR',
};

function TabIconView({
  Icon,
  focused,
  color,
}: {
  Icon: LucideIcon;
  focused: boolean;
  color: string;
}) {
  return (
    <Icon
      size={focused ? 24 : 22}
      color={color}
      strokeWidth={focused ? 2.4 : 1.85}
    />
  );
}

function SquircleButton({
  children,
  focused,
  isDark,
  isFab,
  primaryColor,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  focused: boolean;
  isDark: boolean;
  isFab?: boolean;
  primaryColor: string;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel: string;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const fabPop = useRef(new Animated.Value(isFab ? 1 : 0)).current;
  const prevFab = useRef(!!isFab);

  useEffect(() => {
    if (prevFab.current === !!isFab) return;
    prevFab.current = !!isFab;
    Animated.spring(fabPop, {
      toValue: isFab ? 1 : 0,
      friction: 7,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [fabPop, isFab]);

  const bg = isFab ? primaryColor : isDark ? '#1f2937' : '#FFFFFF';
  const borderColor = isFab
    ? primaryColor
    : isDark
      ? 'rgba(255,255,255,0.1)'
      : 'rgba(15,23,42,0.06)';

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.32 : isFab ? 0.18 : 0.12,
          shadowRadius: 18,
          elevation: 8,
          transform: [
            { scale: Animated.multiply(pressScale, fabPop.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.02],
            })) },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          Animated.timing(pressScale, {
            toValue: 0.92,
            duration: 80,
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            friction: 6,
            tension: 180,
            useNativeDriver: true,
          }).start();
        }}
        style={[styles.squircle, { backgroundColor: bg, borderColor }]}
      >
        <View style={styles.iconWrap}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const chrome = useChromeVisibility();

  const routes = state.routes;
  const activeRoute = state.routes[state.index]?.name ?? '';

  const iconColor = isDark ? 'rgba(248,250,252,0.92)' : '#111827';
  const activeColor = colors.primary;
  const bottomPad =
    Platform.OS === 'android'
      ? Math.max(insets.bottom + 16, ANDROID_BOTTOM_PADDING)
      : Math.max(insets.bottom, BOTTOM_PADDING);

  useEffect(() => {
    chrome?.reveal();
  }, [state.index, chrome?.reveal]);

  const renderTab = (route: (typeof routes)[number], index: number) => {
    const { options } = descriptors[route.key];
    const focused = state.index === index;
    const asFab = focused && FAB_TABS.has(route.name);
    const label =
      SHORT_LABELS[route.name] ??
      (typeof options.title === 'string' ? options.title : route.name);
    const Icon = ICONS[route.name] ?? House;

    return (
      <SquircleButton
        key={route.key}
        focused={focused}
        isDark={isDark}
        isFab={asFab}
        primaryColor={colors.primary}
        accessibilityLabel={
          asFab
            ? FAB_LABELS[route.name] ?? 'Nova'
            : options.tabBarAccessibilityLabel ?? label
        }
        onPress={() => {
          if (asFab) {
            emitFabBarPress(route.name as FabBarTabName);
            return;
          }
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }}
        onLongPress={() => {
          if (asFab) {
            emitFabBarLongPress(route.name as FabBarTabName);
            return;
          }
          navigation.emit({ type: 'tabLongPress', target: route.key });
        }}
      >
        {asFab ? (
          (() => {
            const FabIcon = FAB_ICONS[route.name] ?? Plus;
            return <FabIcon size={24} color="#FFFFFF" strokeWidth={2.6} />;
          })()
        ) : (
          <TabIconView
            Icon={Icon}
            focused={focused}
            color={focused ? activeColor : iconColor}
          />
        )}
      </SquircleButton>
    );
  };

  const hideDistance = BUTTON + bottomPad + 24;
  const barStyle = [
    styles.safeFill,
    {
      paddingBottom: bottomPad,
      paddingHorizontal: HORIZONTAL_PADDING,
    },
    chrome
      ? {
          transform: [
            {
              translateY: chrome.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [hideDistance, 0],
              }),
            },
          ],
          opacity: chrome.progress.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0, 0.45, 1],
          }),
        }
      : null,
  ];

  if (routes.length === 0) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={chrome && !chrome.visible ? 'none' : 'box-none'}
      style={barStyle}
    >
      <View style={styles.row}>
        <View style={styles.cluster}>
          {routes.map((route, index) => renderTab(route, index))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: BUTTON,
    overflow: 'visible',
  },
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    overflow: 'visible',
  },
  shadowWrap: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: RADIUS,
  },
  squircle: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
