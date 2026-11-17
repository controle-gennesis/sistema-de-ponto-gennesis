import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Circle, Ellipse } from 'react-native-svg';
import { Fingerprint } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { getTabBarHeight } from '../navigation/tabBarLayout';
import { useChromeVisibility } from '../navigation/ChromeVisibilityContext';

const SIZE = 58;
const MARGIN = 12;
const STORAGE_KEY = 'mobile:draggable-punch-fab';
const TAP_SLOP = 10;

type SavedPos = { x: number; y: number };

/** Anel que sai do botão e some, a cada ~3,5 s: chama atenção sem ficar piscando. */
function FabPulse({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(2100),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        borderRadius: SIZE / 2,
        borderWidth: 2,
        borderColor: color,
        opacity: pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}

/** Esfera vermelha com brilho: gradiente radial (luz no alto à esquerda) + reflexo suave. */
function PunchOrb() {
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="orb" cx="32%" cy="26%" rx="85%" ry="85%" fx="32%" fy="26%">
          <Stop offset="0" stopColor="#ff8a80" />
          <Stop offset="0.45" stopColor="#ef4444" />
          <Stop offset="1" stopColor="#b91c1c" />
        </RadialGradient>
        <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill="url(#orb)" />
      <Ellipse cx="34" cy="24" rx="22" ry="13" fill="url(#glow)" />
    </Svg>
  );
}

export default function DraggablePunchFab() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chrome = useChromeVisibility();
  const { width: winW, height: winH } = useWindowDimensions();

  const minX = MARGIN;
  const maxX = winW - SIZE - MARGIN;
  const minY = insets.top + MARGIN + 56;
  const tabBarH = getTabBarHeight(insets.bottom);
  const createFabStack = 0; // o "+" saiu do canto (agora fica na linha de busca das listas)
  const maxY = winH - SIZE - tabBarH - MARGIN - createFabStack;

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    }),
    [maxX, maxY, minX, minY],
  );

  const defaultPos = useMemo(
    () => clamp(winW - SIZE - MARGIN - 4, winH - SIZE - tabBarH - MARGIN - createFabStack - 4),
    [clamp, createFabStack, tabBarH, winH, winW],
  );

  const pos = useRef(new Animated.ValueXY(defaultPos)).current;
  const [ready, setReady] = useState(false);
  const startRef = useRef({ x: defaultPos.x, y: defaultPos.y });
  const movedRef = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !cancelled) {
          const saved = JSON.parse(raw) as SavedPos;
          const next = clamp(saved.x, saved.y);
          pos.setValue(next);
          startRef.current = next;
        } else {
          pos.setValue(defaultPos);
          startRef.current = defaultPos;
        }
      } catch {
        pos.setValue(defaultPos);
        startRef.current = defaultPos;
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clamp, defaultPos, pos]);

  useEffect(() => {
    if (!ready) return;
    const current = { x: (pos.x as any)._value ?? startRef.current.x, y: (pos.y as any)._value ?? startRef.current.y };
    const next = clamp(current.x, current.y);
    pos.setValue(next);
    startRef.current = next;
  }, [clamp, pos, ready, winH, winW]);

  const openPunch = useCallback(() => {
    let nav: any = navigation;
    for (let i = 0; i < 6; i++) {
      const names: string[] | undefined = nav?.getState?.()?.routeNames;
      if (names?.includes('Punch')) {
        nav.navigate('Punch');
        return;
      }
      const parent = nav?.getParent?.();
      if (!parent) break;
      nav = parent;
    }
    (navigation as any).navigate('Punch');
  }, [navigation]);

  const savePos = useCallback(async (x: number, y: number) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
    } catch {
      // ignore
    }
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          // Afunda um pouco ao encostar.
          Animated.timing(pressScale, {
            toValue: 0.88,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
          movedRef.current = false;
          dragOrigin.current = { ...startRef.current };
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > TAP_SLOP || Math.abs(g.dy) > TAP_SLOP) {
            movedRef.current = true;
          }
          const next = clamp(dragOrigin.current.x + g.dx, dragOrigin.current.y + g.dy);
          pos.setValue(next);
        },
        onPanResponderRelease: (_, g) => {
          const next = clamp(dragOrigin.current.x + g.dx, dragOrigin.current.y + g.dy);
          // Snap to nearest horizontal edge
          const mid = (minX + maxX) / 2;
          const snapped = clamp(next.x < mid ? minX : maxX, next.y);
          startRef.current = snapped;
          Animated.spring(pos, {
            toValue: snapped,
            useNativeDriver: false,
            friction: 7,
            tension: 120,
          }).start(() => {
            void savePos(snapped.x, snapped.y);
          });
          if (!movedRef.current) {
            // Toque: volta ao tamanho normal sem quique e abre a tela de ponto na hora.
            Animated.timing(pressScale, {
              toValue: 1,
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }).start();
            openPunch();
          } else {
            Animated.spring(pressScale, {
              toValue: 1,
              friction: 5,
              tension: 200,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(pressScale, {
            toValue: 1,
            friction: 5,
            tension: 200,
            useNativeDriver: true,
          }).start();
        },
      }),
    [clamp, maxX, minX, openPunch, pos, pressScale, savePos],
  );

  if (!ready) return null;

  // Some com a chrome (navbar/tabbar) — sem bolinha solta na tela.
  if (chrome && !chrome.visible) {
    return null;
  }

  // Dois níveis: o de fora é movido pelo arrasto (animação em JS); o de dentro faz escala, anel e
  // giro (nativo). Misturar os dois no mesmo Animated.View dá erro de driver.
  return (
    <Animated.View
      accessible
      accessibilityRole="button"
      accessibilityLabel="Bater ponto"
      style={[styles.wrap, { transform: pos.getTranslateTransform() }]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          styles.face,
          {
            shadowColor: '#dc2626',
            shadowOpacity: isDark ? 0.55 : 0.4,
            transform: [{ scale: pressScale }],
          },
        ]}
      >
        <PunchOrb />
        <View style={styles.inner} pointerEvents="none">
          <Fingerprint size={28} color="#fff" strokeWidth={2} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    zIndex: 100,
    elevation: 28,
  },
  face: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
      },
      android: {},
    }),
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
