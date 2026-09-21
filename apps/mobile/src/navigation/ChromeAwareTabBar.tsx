import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChromeVisibility } from './ChromeVisibilityContext';
import { getTabBarHeight, isSamsungDevice } from './tabBarLayout';
import SamsungTabBar from './SamsungTabBar';

/**
 * Tab bar animada com o mesmo progresso da navbar (esconde ao rolar pra baixo).
 * Absolute + padding no scene evita “pulo” do conteúdo.
 */
export default function ChromeAwareTabBar(props: BottomTabBarProps) {
  const chrome = useChromeVisibility();
  const insets = useSafeAreaInsets();
  const height = getTabBarHeight(insets.bottom);
  const hideDistance = height + 24;

  const bar = isSamsungDevice() ? <SamsungTabBar {...props} /> : <BottomTabBar {...props} />;

  if (!chrome) {
    return <View style={styles.wrap}>{bar}</View>;
  }

  return (
    <Animated.View
      pointerEvents={chrome.visible ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        {
          // Some por completo — sem pílula/bolinha residual.
          opacity: chrome.progress,
          transform: [
            {
              translateY: chrome.progress.interpolate({
                inputRange: [0, 1],
                outputRange: [hideDistance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {bar}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    elevation: 30,
  },
});
