import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

type ScrollHandlers = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: () => void;
  scrollEventThrottle: number;
};

type ChromeVisibilityContextValue = {
  progress: Animated.Value;
  visible: boolean;
  headerHeight: number;
  setHeaderHeight: (height: number) => void;
  reveal: () => void;
  conceal: () => void;
  menuOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  scrollHandlers: ScrollHandlers;
};

const ChromeVisibilityContext = createContext<ChromeVisibilityContextValue | null>(null);

const HIDE_DY = 10;
const SHOW_DY = 8;
const TOP_REVEAL = 18;
const BOTTOM_LOCK = 28;
const STOP_REVEAL_MS = 240;
export const CHROME_HEADER_FALLBACK = 88;

export function ChromeVisibilityProvider({ children }: { children: ReactNode }) {
  const progress = useRef(new Animated.Value(1)).current;
  const visibleRef = useRef(true);
  const lastYRef = useRef(0);
  const ignoreNextDyRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [visible, setVisible] = useState(true);
  const [headerHeight, setHeaderHeightState] = useState(CHROME_HEADER_FALLBACK);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const setHeaderHeight = useCallback((height: number) => {
    if (height <= 0) return;
    setHeaderHeightState((prev) => (Math.abs(prev - height) > 1 ? height : prev));
  }, []);

  const clearStopTimer = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const animate = useCallback(
    (show: boolean) => {
      if (visibleRef.current === show) return;
      visibleRef.current = show;
      setVisible(show);
      animRef.current?.stop();
      animRef.current = Animated.timing(progress, {
        toValue: show ? 1 : 0,
        duration: show ? 280 : 220,
        easing: show ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      });
      animRef.current.start();
    },
    [progress],
  );

  const reveal = useCallback(() => {
    ignoreNextDyRef.current = true;
    clearStopTimer();
    animate(true);
  }, [animate, clearStopTimer]);

  const conceal = useCallback(() => {
    clearStopTimer();
    animate(false);
  }, [animate, clearStopTimer]);

  const scheduleReveal = useCallback(() => {
    clearStopTimer();
    stopTimerRef.current = setTimeout(() => {
      stopTimerRef.current = null;
      animate(true);
    }, STOP_REVEAL_MS);
  }, [animate, clearStopTimer]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const rawY = contentOffset.y;
      const maxY = Math.max(0, contentSize.height - layoutMeasurement.height);

      if (maxY <= 24) {
        lastYRef.current = rawY;
        clearStopTimer();
        animate(true);
        return;
      }

      if (rawY < -2 || rawY > maxY + 2) {
        lastYRef.current = Math.min(Math.max(rawY, 0), maxY);
        return;
      }

      const y = Math.min(Math.max(rawY, 0), maxY);
      if (ignoreNextDyRef.current) {
        ignoreNextDyRef.current = false;
        lastYRef.current = y;
        return;
      }
      const dy = y - lastYRef.current;
      lastYRef.current = y;

      if (y <= TOP_REVEAL) {
        clearStopTimer();
        animate(true);
        return;
      }

      if (y >= maxY - BOTTOM_LOCK) {
        if (dy < -SHOW_DY) {
          clearStopTimer();
          animate(true);
        }
        return;
      }

      if (dy > HIDE_DY) {
        clearStopTimer();
        animate(false);
        return;
      }
      if (dy < -SHOW_DY) {
        clearStopTimer();
        animate(true);
      }
    },
    [animate, clearStopTimer],
  );

  const onScrollBeginDrag = useCallback(() => {
    clearStopTimer();
  }, [clearStopTimer]);

  const onMomentumScrollBegin = useCallback(() => {
    clearStopTimer();
  }, [clearStopTimer]);

  const onScrollEndDrag = useCallback(() => {
    scheduleReveal();
  }, [scheduleReveal]);

  const onMomentumScrollEnd = useCallback(() => {
    scheduleReveal();
  }, [scheduleReveal]);

  useEffect(() => () => clearStopTimer(), [clearStopTimer]);

  const scrollHandlers = useMemo<ScrollHandlers>(
    () => ({
      onScroll,
      onScrollBeginDrag,
      onScrollEndDrag,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
      scrollEventThrottle: 16,
    }),
    [onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd],
  );

  const value = useMemo(
    () => ({
      progress,
      visible,
      headerHeight,
      setHeaderHeight,
      reveal,
      conceal,
      menuOpen,
      openMenu,
      closeMenu,
      scrollHandlers,
    }),
    [progress, visible, headerHeight, setHeaderHeight, reveal, conceal, menuOpen, openMenu, closeMenu, scrollHandlers],
  );

  return (
    <ChromeVisibilityContext.Provider value={value}>
      {children}
    </ChromeVisibilityContext.Provider>
  );
}

export function useChromeVisibility() {
  return useContext(ChromeVisibilityContext);
}

export function useChromeScroll() {
  const chrome = useContext(ChromeVisibilityContext);
  const reveal = chrome?.reveal;

  useFocusEffect(
    useCallback(() => {
      reveal?.();
    }, [reveal]),
  );

  return {
    scrollProps: chrome?.scrollHandlers ?? {},
    headerOffset: chrome?.headerHeight ?? CHROME_HEADER_FALLBACK,
  };
}
