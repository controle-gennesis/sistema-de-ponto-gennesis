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
        borderRadius: 20,
        borderWidth: 2,
        borderColor: color,
        opacity: pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
      }}
    />
  );
}

/**
 * Relógio de verdade: os ponteiros mostram a hora atual. O das horas e o dos minutos andam
 * suave; o dos segundos dá um "tique" por segundo, com uma mola curtinha (passa um tiquinho e
 * assenta). Só `transform` com driver nativo — leve. Um timer de 1 s só atualiza os alvos.
 */
function AnimatedClockIcon({ size = 26, color = '#fff' }: { size?: number; color?: string }) {
  const angles = () => {
    const now = new Date();
    const sec = now.getSeconds();
    const min = now.getMinutes();
    return {
      sec: sec * 6,
      min: min * 6 + sec * 0.1,
      hour: (now.getHours() % 12) * 30 + min * 0.5,
    };
  };
  const initial = useRef(angles()).current;
  const secondHand = useRef(new Animated.Value(initial.sec)).current;
  const minuteHand = useRef(new Animated.Value(initial.min)).current;
  const hourHand = useRef(new Animated.Value(initial.hour)).current;
  // Ângulos acumulados (não voltam a 0): evita o ponteiro "rebobinar" ao virar o minuto.
  const turns = useRef({ sec: initial.sec, min: initial.min, hour: initial.hour }).current;

  useEffect(() => {
    const tick = () => {
      const next = angles();
      const wrap = (prev: number, target: number) => {
        // leva o alvo para a volta mais próxima do valor atual (só pra frente)
        let t = target;
        while (t < prev - 0.001) t += 360;
        return t;
      };
      turns.sec = wrap(turns.sec, next.sec);
      turns.min = wrap(turns.min, next.min);
      turns.hour = wrap(turns.hour, next.hour);
      Animated.spring(secondHand, {
        toValue: turns.sec,
        friction: 4.2,
        tension: 220,
        useNativeDriver: true,
      }).start();
      Animated.timing(minuteHand, {
        toValue: turns.min,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
      Animated.timing(hourHand, {
        toValue: turns.hour,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hourHand, minuteHand, secondHand, turns]);

  const stroke = 2.2;
  const center = size / 2;
  const hand = (
    value: Animated.Value,
    length: number,
    width: number,
    handColor: string,
    tail = 0,
  ) => (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        alignItems: 'center',
        transform: [
          {
            rotate: value.interpolate({
              inputRange: [0, 360],
              outputRange: ['0deg', '360deg'],
              extrapolate: 'extend',
            }),
          },
        ],
      }}
    >
      {/* o ponteiro sai do centro pra cima; girar o contêiner gira em volta do centro */}
      <View
        style={{
          position: 'absolute',
          top: center - length,
          width,
          height: length + tail,
          borderRadius: width / 2,
          backgroundColor: handColor,
        }}
      />
    </Animated.View>
  );

  return (
    <View style={{ width: size, height: size }}>
      {/* aro separado: assim o centro dos ponteiros é o centro exato do relógio */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* marcas das 12, 3, 6 e 9 */}
      {[0, 90, 180, 270].map((deg) => (
        <View
          key={deg}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            alignItems: 'center',
            transform: [{ rotate: `${deg}deg` }],
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: stroke + 1.5,
              width: 1.6,
              height: 2.4,
              borderRadius: 1,
              backgroundColor: color,
              opacity: 0.7,
            }}
          />
        </View>
      ))}
      {hand(hourHand, size * 0.26, stroke, color)}
      {hand(minuteHand, size * 0.37, stroke, color)}
      {hand(secondHand, size * 0.4, 1.4, 'rgba(255,255,255,0.78)', 2.5)}
      <View
        style={{
          position: 'absolute',
          top: center - 2,
          left: center - 2,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
        }}
      />
    </View>
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
  const burst = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

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
            // Toque: volta com um "boing", solta um anel e dá uma voltinha no relógio;
            // a tela de ponto abre logo em seguida (160 ms) pra a animação aparecer.
            burst.setValue(0);
            spin.setValue(0);
            Animated.parallel([
              Animated.spring(pressScale, {
                toValue: 1,
                friction: 3.2,
                tension: 260,
                useNativeDriver: true,
              }),
              Animated.timing(burst, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(spin, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.back(1.4)),
                useNativeDriver: true,
              }),
            ]).start();
            setTimeout(openPunch, 160);
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
    [burst, clamp, maxX, minX, openPunch, pos, pressScale, savePos, spin],
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
            backgroundColor: colors.primary,
            shadowOpacity: isDark ? 0.4 : 0.22,
            transform: [{ scale: pressScale }],
          },
        ]}
      >
        <FabPulse color={colors.primary} />
        {/* anel do toque: maior e mais forte que o pulso de espera */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            {
              borderColor: colors.primary,
              opacity: burst.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.7, 0] }),
              transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.inner,
            {
              transform: [
                {
                  rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <AnimatedClockIcon size={26} color="#fff" />
        </Animated.View>
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
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
      },
      android: {},
    }),
  },
  burst: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 3,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
