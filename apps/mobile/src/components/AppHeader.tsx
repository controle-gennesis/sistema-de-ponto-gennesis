import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Menu as MenuIcon, ArrowLeft, Bell } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import { useChromeVisibility } from '../navigation/ChromeVisibilityContext';
import { ThemePatternFill } from './ThemeBackground';
import Menu from './Menu';

/** Folga abaixo da status bar — no Android evitar padding duplo (insets + StatusBar). */
const HEADER_TOP_GAP = Platform.OS === 'ios' ? 6 : 2;
const HEADER_BOTTOM_PAD = Platform.OS === 'ios' ? 12 : 8;

type AppHeaderProps = {
  showBack?: boolean;
  onBack?: () => void;
  /** Título centralizado (páginas fora da tab bar) */
  title?: string;
  /** Substitui o sino de notificações (ex.: trocar quadro) */
  rightAction?: React.ReactNode;
};

function HeaderIconButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress?: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      style={styles.iconBtn}
      activeOpacity={0.7}
    >
      {children}
    </TouchableOpacity>
  );
}

function NotificationBell({ iconColor }: { iconColor: string }) {
  const { unreadCount, openSheet } = useNotifications();
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <HeaderIconButton onPress={openSheet} accessibilityLabel="Notificações">
      <View style={styles.bellWrap}>
        <Bell size={22} color={iconColor} strokeWidth={2.1} />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </HeaderIconButton>
  );
}

export default function AppHeader({
  showBack = false,
  onBack,
  title,
  rightAction,
}: AppHeaderProps) {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const chrome = useChromeVisibility();
  const [localMenu, setLocalMenu] = useState(false);
  const showMenu = chrome?.menuOpen ?? localMenu;
  const openMenu = chrome?.openMenu ?? (() => setLocalMenu(true));
  const closeMenu = chrome?.closeMenu ?? (() => setLocalMenu(false));

  const iconColor = colors.text;
  const handleBack = onBack ?? (() => navigation.goBack());
  // Android edge-to-edge: insets.top já inclui a status bar. Só usa StatusBar se insets vier 0.
  const topPad =
    (Platform.OS === 'android'
      ? insets.top > 0
        ? insets.top
        : StatusBar.currentHeight ?? 24
      : insets.top) + HEADER_TOP_GAP;

  if (showBack) {
    return (
      <View style={[styles.topSafe, { paddingTop: topPad }]}>
        <View style={styles.stackHeader}>
          <View style={styles.side}>
            <TouchableOpacity
              onPress={handleBack}
              hitSlop={8}
              accessibilityLabel="Voltar"
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <ArrowLeft size={24} color={iconColor} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={styles.center} pointerEvents="none">
            {title ? (
              <Text
                style={[styles.stackTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : null}
          </View>

          <View style={[styles.side, styles.sideRight]}>
            {rightAction ?? <NotificationBell iconColor={iconColor} />}
          </View>
        </View>
      </View>
    );
  }

  const headerInner = (
    <View
      style={[styles.topSafe, { paddingTop: topPad }]}
      onLayout={(e) => chrome?.setHeaderHeight(e.nativeEvent.layout.height)}
    >
      <View style={styles.header}>
        <View style={styles.side}>
          <HeaderIconButton
            onPress={openMenu}
            accessibilityLabel="Menu"
          >
            <MenuIcon size={22} color={iconColor} strokeWidth={2.2} />
          </HeaderIconButton>
        </View>

        <View style={styles.center} pointerEvents="none">
          <Image
            source={
              isDark
                ? require('../../assets/logobrancavermelha.png')
                : require('../../assets/logo.png')
            }
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={[styles.side, styles.sideRight]}>
          <NotificationBell iconColor={iconColor} />
        </View>
      </View>
    </View>
  );

  if (!chrome) {
    return (
      <>
        {headerInner}
        <Menu visible={showMenu} onClose={closeMenu} />
      </>
    );
  }

  return (
    <>
      <Animated.View
        // box-none: não engole swipe das abas se o overlay crescer demais
        pointerEvents={chrome.visible ? 'box-none' : 'none'}
        style={[
          styles.overlay,
          {
            opacity: chrome.progress,
            transform: [
              {
                translateY: chrome.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-160, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View pointerEvents="box-none" style={styles.headerShell}>
          <ThemePatternFill />
          {headerInner}
        </View>
      </Animated.View>

      <Menu visible={showMenu} onClose={closeMenu} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerShell: {
    position: 'relative',
    overflow: 'hidden',
  },
  topSafe: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: HEADER_BOTTOM_PAD,
    minHeight: 52,
    backgroundColor: 'transparent',
  },
  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: HEADER_BOTTOM_PAD,
    minHeight: 48,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  side: {
    width: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  sideRight: { alignItems: 'flex-end' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  logo: {
    width: 168,
    height: 44,
  },
  bellWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 14,
    height: 14,
    borderRadius: 4,
    paddingHorizontal: 3,
    backgroundColor: '#ce3736',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 1.2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    letterSpacing: -0.2,
  },
});
