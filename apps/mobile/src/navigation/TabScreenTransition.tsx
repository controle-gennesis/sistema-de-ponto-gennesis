import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation, useNavigationState } from '@react-navigation/native';
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
  const navigation = useNavigation();
  const index = useNavigationState((s) => s.index);
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const prevIndexRef = useRef(index);
  /** Só a aba inicial (já focada no mount) pula a 1ª animação. */
  const skipInitialFocused = useRef(focused);
  const wasFocusedRef = useRef(focused);
  /** Perdeu o foco só porque uma página abriu por cima (aba não mudou): não faz o fade. */
  const coveredRef = useRef(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  /**
   * Tela focada e parada: o contêiner larga opacidade e deslocamento animados. O vidro nativo do iOS 26
   * (Liquid Glass) não desenha dentro de uma view com opacidade/transform animados.
   */
  const [settled, setSettled] = useState(focused);

  // Ao perder o foco, some rápido pra não ficar sobreposta com a próxima.
  useLayoutEffect(() => {
    if (focused) {
      wasFocusedRef.current = true;
      return;
    }
    if (!wasFocusedRef.current) return;
    wasFocusedRef.current = false;
    // Página aberta por cima da pilha (a aba continua a mesma): não some, senão ao voltar
    // a tela reaparece em fade e o fundo pisca. Troca de aba mantém o fade de sempre.
    const parent = navigation.getParent();
    if (parent && !parent.isFocused()) {
      coveredRef.current = true;
      return;
    }
    animRef.current?.stop();
    setSettled(false);
    animRef.current = Animated.timing(opacity, {
      toValue: 0,
      duration: 140,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animRef.current.start();
  }, [focused, opacity, navigation]);

  useEffect(() => {
    if (!focused) return;

    if (skipInitialFocused.current) {
      skipInitialFocused.current = false;
      prevIndexRef.current = index;
      opacity.setValue(1);
      translateX.setValue(0);
      setSettled(true);
      return;
    }

    if (coveredRef.current) {
      coveredRef.current = false;
      prevIndexRef.current = index;
      animRef.current?.stop();
      opacity.setValue(1);
      translateX.setValue(0);
      setSettled(true);
      return;
    }

    const from = prevIndexRef.current;
    prevIndexRef.current = index;
    const dir = index > from ? 1 : index < from ? -1 : 0;

    animRef.current?.stop();
    setSettled(false);
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
    animRef.current.start(({ finished }) => {
      if (finished) setSettled(true);
    });
  }, [focused, index, opacity, translateX]);

  return (
    <Animated.View
      style={[
        styles.root,
        {
          // Transparente pra o padrão do ThemeBackground aparecer (não cobrir com cinza).
          backgroundColor: colors.screenRoot,
          ...(settled ? null : { opacity, transform: [{ translateX }] }),
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * TESTE: `false` tira o fade ao trocar de aba. O vidro nativo do iOS 26 (Liquid Glass) não desenha dentro
 * de uma view com opacidade animada; sem o fade ele aparece em todas as listas. Volte para `true` para
 * recuperar a transição.
 */
const TAB_FADE_ENABLED = false;

function wrapTabScreen<P extends object>(Screen: React.ComponentType<P>) {
  function Wrapped(props: P) {
    const { colors } = useTheme();
    if (!TAB_FADE_ENABLED) {
      return (
        <View style={[styles.root, { backgroundColor: colors.screenRoot }]}>
          <Screen {...props} />
        </View>
      );
    }
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
