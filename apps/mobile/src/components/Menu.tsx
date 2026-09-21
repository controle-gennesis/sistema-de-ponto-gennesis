import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Easing,
  Alert,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Moon, Sun, LogOut, X, Clock, Calendar } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { formatCpfDisplay } from '../lib/cpf';
import { formatMenuDisplayName } from '../lib/formatDisplayName';
import UserAvatar from './UserAvatar';
import type { RootStackParamList } from '../../App';

interface MenuProps {
  visible: boolean;
  onClose: () => void;
}

const PANEL_WIDTH = Math.min(
  Platform.OS === 'android' ? 340 : 360,
  Math.round(Dimensions.get('window').width * (Platform.OS === 'android' ? 0.88 : 0.88)),
);
const CORNER = Platform.OS === 'android' ? 20 : 24;

function MenuItemRow({
  label,
  icon: Icon,
  color,
  onPress,
  anim,
  index,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  onPress: () => void;
  anim: Animated.Value;
  index: number;
}) {
  const start = Math.min(0.12 * index, 0.55);
  const opacity = anim.interpolate({
    inputRange: [start, Math.min(start + 0.35, 1)],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateX = anim.interpolate({
    inputRange: [start, Math.min(start + 0.35, 1)],
    outputRange: [-16, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.65}>
        <Icon size={20} color={color} strokeWidth={2} />
        <Text style={[styles.itemLabel, { color }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function Menu({ visible, onClose }: MenuProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { canSeePonto } = usePermissions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const itemsAnim = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(false);
  const wasOpen = useRef(false);

  const displayName = formatMenuDisplayName(user?.name);
  const displayCpf = formatCpfDisplay(user?.cpf);

  const closeThen = useCallback(
    (action: () => void) => {
      onClose();
      setTimeout(action, 200);
    },
    [onClose],
  );

  const go = useCallback(
    (name: keyof RootStackParamList | 'Home') => {
      closeThen(() => {
        let nav: any = navigation;
        for (let i = 0; i < 6; i++) {
          const names: string[] | undefined = nav?.getState?.()?.routeNames;
          if (name === 'Home') {
            if (names?.includes('Main')) {
              nav.navigate('Main', { screen: 'Home' });
              return;
            }
          } else if (names?.includes(name)) {
            nav.navigate(name);
            return;
          }
          const parent = nav?.getParent?.();
          if (!parent) break;
          nav = parent;
        }
        if (name === 'Home') {
          (navigation as any).navigate('Main', { screen: 'Home' });
          return;
        }
        navigation.navigate(name as never);
      });
    },
    [closeThen, navigation],
  );

  const links = [
    { key: 'home', label: 'Início', icon: Home, onPress: () => go('Home') },
    { key: 'agenda', label: 'Agenda', icon: Calendar, onPress: () => go('Agenda') },
    ...(canSeePonto
      ? [
          {
            key: 'time-records',
            label: 'Registros de ponto',
            icon: Clock,
            onPress: () => go('TimeRecords'),
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (visible) {
      wasOpen.current = true;
      setIsVisible(true);
      slideAnim.setValue(-PANEL_WIDTH);
      itemsAnim.setValue(0);

      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(itemsAnim, {
          toValue: 1,
          duration: 320,
          delay: 40,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!wasOpen.current) return;

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -PANEL_WIDTH,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(itemsAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        wasOpen.current = false;
        setIsVisible(false);
      }
    });
  }, [visible, slideAnim, itemsAnim]);

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          closeThen(() => {
            void logout();
          });
        },
      },
    ]);
  };

  const headerOpacity = itemsAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const headerShift = itemsAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [-10, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Fundo escuro sólido — igual notificações (sem opacity animada) */}
      <View style={styles.root}>
        <View style={styles.row}>
          <Animated.View
            style={[
              styles.panelSlide,
              { width: PANEL_WIDTH, transform: [{ translateX: slideAnim }] },
            ]}
          >
            <View
              collapsable={false}
              style={[
                styles.panel,
                {
                  backgroundColor: colors.surface ?? colors.background,
                  paddingTop:
                    (Platform.OS === 'android'
                      ? insets.top > 0
                        ? insets.top
                        : StatusBar.currentHeight ?? 24
                      : insets.top) + 12,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.profileBlock,
                  {
                    borderBottomColor: colors.border,
                    opacity: headerOpacity,
                    transform: [{ translateX: headerShift }],
                  },
                ]}
              >
                <View style={styles.profileHeader}>
                  <TouchableOpacity
                    style={styles.profileRow}
                    activeOpacity={0.7}
                    onPress={() => go('Profile')}
                    accessibilityLabel="Abrir perfil"
                  >
                    <UserAvatar
                      uri={user?.profilePhotoUrl}
                      size={Platform.OS === 'android' ? 48 : 52}
                      backgroundColor={colors.primary}
                      iconColor="#fff"
                    />
                    <View style={styles.profileText}>
                      <Text
                        style={[styles.profileName, { color: colors.text }]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {displayName}
                      </Text>
                      {displayCpf ? (
                        <Text
                          style={[styles.profileCpf, { color: colors.textSecondary }]}
                          numberOfLines={1}
                        >
                          {displayCpf}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.closeBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar menu"
                  >
                    <X size={20} color={colors.text} strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.contentInner}
              >
                {links.map((item, index) => (
                  <MenuItemRow
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    color={colors.text}
                    onPress={item.onPress}
                    anim={itemsAnim}
                    index={index}
                  />
                ))}
              </ScrollView>

              <Animated.View
                style={[
                  styles.footer,
                  {
                    borderTopColor: colors.border,
                    opacity: headerOpacity,
                    transform: [{ translateY: headerShift }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.themeRow}
                  onPress={toggleTheme}
                  activeOpacity={0.65}
                >
                  {isDark ? (
                    <Sun size={20} color={colors.text} strokeWidth={2} />
                  ) : (
                    <Moon size={20} color={colors.text} strokeWidth={2} />
                  )}
                  <Text style={[styles.itemLabel, { color: colors.text }]}>
                    {isDark ? 'Tema claro' : 'Tema escuro'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.themeRow}
                  onPress={handleLogout}
                  activeOpacity={0.65}
                >
                  <LogOut size={20} color={colors.primary} strokeWidth={2} />
                  <Text style={[styles.itemLabel, { color: colors.primary }]}>Sair</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>

          <TouchableOpacity
            style={styles.dismissArea}
            activeOpacity={1}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar menu"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  panelSlide: {
    height: '100%',
    maxWidth: 360,
    ...Platform.select({
      android: {
        elevation: 16,
      },
      default: {},
    }),
  },
  panel: {
    flex: 1,
    paddingHorizontal: 20,
    borderTopRightRadius: CORNER,
    borderBottomRightRadius: CORNER,
    overflow: 'hidden',
  },
  dismissArea: {
    flex: 1,
  },
  profileBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 18,
    marginBottom: 10,
    paddingTop: Platform.OS === 'android' ? 4 : 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
    minHeight: 52,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  profileCpf: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  content: {
    flexGrow: 1,
    flexShrink: 1,
  },
  contentInner: {
    paddingBottom: 16,
    flexGrow: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 4,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
});
