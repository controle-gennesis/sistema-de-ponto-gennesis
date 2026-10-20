import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import AuthGradientBackground from './AuthGradientBackground';

export const SPLASH_LOGO_SIZE = 104;
export const SPLASH_BG = '#ce3736';

/** Splash com degradê vermelho e logo branca no centro — mesmo ponto inicial do Login. */
export default function AuthBrandSplash({
  logoSize = SPLASH_LOGO_SIZE,
}: {
  logoSize?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
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
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AuthGradientBackground />
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
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
