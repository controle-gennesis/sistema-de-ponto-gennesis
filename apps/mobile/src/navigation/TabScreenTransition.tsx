import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useIsFocused, useNavigationState } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

type Props = {
  children: React.ReactNode;
};

/**
 * A UITabBar nativa troca a tela na hora (sem cross-fade).
 * Este wrapper anima saída/entrada do conteúdo (fade + leve shift)
 * sem alterar a tab bar nativa.
 */
export default function TabScreenTransition({ children }: Props) {
  const focused = useIsFocused();
  const index = useNavigationState((s) => s.index);
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const prevIndexRef = useRef(index);
  /** Só a aba inicial (já focada no mount) pula a 1ª animação. */
  const skipInitialFocused = useRef(focused);
  const wasFocusedRef = useRef(focused);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  // Ao perder o foco, some rápido pra não ficar sobreposta com a próxima.
  useLayoutEffect(() => {
    if (focused) {
      wasFocusedRef.current = true;
      return;
    }
    if (!wasFocusedRef.current) return;
    wasFocusedRef.current = false;
    animRef.current?.stop();
    animRef.current = Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animRef.current.start();
  }, [focused, opacity]);

  useEffect(() => {
    if (!focused) return;

    if (skipInitialFocused.current) {
      skipInitialFocused.current = false;
      prevIndexRef.current = index;
      opacity.setValue(1);
      translateX.setValue(0);
      return;
    }

    const from = prevIndexRef.current;
    prevIndexRef.current = index;
    const dir = index > from ? 1 : index < from ? -1 : 0;

    animRef.current?.stop();
    opacity.setValue(0);
    translateX.setValue(dir * 18);

    animRef.current = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 300,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
    ]);
    animRef.current.start();
  }, [focused, index, opacity, translateX]);

  return (
    <Animated.View
      style={[
        styles.root,
        {
          // Transparente pra o padrão do ThemeBackground aparecer (não cobrir com cinza).
          backgroundColor: colors.screenRoot,
          opacity,
          transform: [{ translateX }],
        },
      ]}
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
