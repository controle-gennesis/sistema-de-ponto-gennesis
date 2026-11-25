import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AuthGradientBackground from './AuthGradientBackground';

export const SPLASH_LOGO_SIZE = 104;
export const SPLASH_BG = '#ce3736';
/** Cor lisa do splash nativo (app.json): a animação parte dela e abre para o degradê. */
export const NATIVE_SPLASH_BG = '#b13030';

/**
 * Abertura do splash: a tela sai do vermelho liso (splash nativo) para o degradê, e a logo
 * aparece crescendo de leve. Roda uma vez, ao montar.
 */
export function useSplashIntro() {
  const cover = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoIntro = useRef(new Animated.Value(0.82)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(cover, {
        toValue: 0,
        duration: 750,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(180),
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(logoIntro, {
            toValue: 1,
            friction: 7,
            tension: 70,
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start();
  }, [cover, logoOpacity, logoIntro]);
  return { cover, logoOpacity, logoIntro };
}

/** Camada de cor lisa que some deixando o degradê aparecer por baixo. */
export function SplashColorCover({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: NATIVE_SPLASH_BG, opacity }]}
    />
  );
}

/** Splash com degradê vermelho e logo branca no centro — mesmo ponto inicial do Login. */
export default function AuthBrandSplash({
  logoSize = SPLASH_LOGO_SIZE,
}: {
  logoSize?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const { cover, logoOpacity, logoIntro } = useSplashIntro();
  const hidNativeSplash = useRef(false);

  const hideNativeSplash = () => {
    if (hidNativeSplash.current) return;
    hidNativeSplash.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  };

  // O fundo é desenhado em código, então pode soltar o splash nativo assim que montar
  // (onLayout); o timeout é só uma garantia.
  useEffect(() => {
    const fallback = setTimeout(hideNativeSplash, 400);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.04,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      clearTimeout(fallback);
      loop.stop();
    };
  }, [pulse]);

  return (
    <View style={styles.root} onLayout={hideNativeSplash}>
      <StatusBar style="light" />
      <AuthGradientBackground />
      <SplashColorCover opacity={cover} />
      <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: Animated.multiply(pulse, logoIntro) }] }}>
        <Image
          source={require('../../assets/logo-auth.png')}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessibilityLabel="Gennesis"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
