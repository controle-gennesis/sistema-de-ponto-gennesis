import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Clock as PunchClockIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const SIZE = 58;
const MARGIN = 12;
const STORAGE_KEY = 'mobile:draggable-punch-fab';
const TAP_SLOP = 10;

type SavedPos = { x: number; y: number };

export default function DraggablePunchFab() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const minX = MARGIN;
  const maxX = winW - SIZE - MARGIN;
  const minY = insets.top + MARGIN + 56;
  const maxY = winH - SIZE - Math.max(insets.bottom, 16) - 88;

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    }),
    [maxX, maxY, minX, minY],
  );

  const defaultPos = useMemo(
    () => clamp(winW - SIZE - MARGIN - 4, winH - SIZE - Math.max(insets.bottom, 16) - 120),
    [clamp, insets.bottom, winH, winW],
  );

  const pos = useRef(new Animated.ValueXY(defaultPos)).current;
  const [ready, setReady] = useState(false);
  const startRef = useRef({ x: defaultPos.x, y: defaultPos.y });
  const movedRef = useRef(false);
  const dragOrigin = useRef({ x: 0, y: 0 });

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
            openPunch();
          }
        },
      }),
    [clamp, maxX, minX, openPunch, pos, savePos],
  );

  if (!ready) return null;

  return (
    <Animated.View
      accessible
      accessibilityRole="button"
      accessibilityLabel="Bater ponto"
      style={[
        styles.wrap,
        {
          transform: pos.getTranslateTransform(),
          backgroundColor: colors.primary,
          shadowOpacity: isDark ? 0.4 : 0.22,
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.inner} pointerEvents="none">
        <PunchClockIcon size={26} color="#fff" strokeWidth={2.3} />
      </View>
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
    borderRadius: 20,
    zIndex: 40,
    elevation: 14,
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
