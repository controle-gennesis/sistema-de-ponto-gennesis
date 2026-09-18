import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useIsFocused, useNavigationState } from '@react-navigation/native';

type Props = {
  children: React.ReactNode;
};

/**
 * A UITabBar nativa troca a tela na hora (sem cross-fade).
 * Este wrapper anima a entrada do conteúdo novo (fade + leve shift).
 */
export default function TabScreenTransition({ children }: Props) {
  const focused = useIsFocused();
  const index = useNavigationState((s) => s.index);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const prevIndexRef = useRef(index);
  const skipFirst = useRef(true);

  useEffect(() => {
    if (!focused) return;

    if (skipFirst.current) {
      skipFirst.current = false;
      prevIndexRef.current = index;
      return;
    }

    const from = prevIndexRef.current;
    prevIndexRef.current = index;
    const dir = index > from ? 1 : index < from ? -1 : 0;

    opacity.setValue(0);
    translateX.setValue(dir * 22);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 280,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, index, opacity, translateX]);

  return (
    <Animated.View
      style={[styles.root, { opacity, transform: [{ translateX }] }]}
    >
      {children}
    </Animated.View>
  );
}

function wrapTabScreen<P extends object>(Screen: React.ComponentType<P>) {
  function Wrapped(props: P) {
    return (
      <TabScreenTransition>
        <Screen {...props} />
      </TabScreenTransition>
    );
  }
  Wrapped.displayName = `TabTransition(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return Wrapped;
}

export { wrapTabScreen };

const styles = StyleSheet.create({
  root: { flex: 1 },
});
