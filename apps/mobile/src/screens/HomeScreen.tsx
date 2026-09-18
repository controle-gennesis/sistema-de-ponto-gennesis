import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  PanResponder,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useChromeScroll, useChromeVisibility } from '../navigation/ChromeVisibilityContext';
import UserAvatar from '../components/UserAvatar';
import HomeAgendaCard from '../components/HomeAgendaCard';
import HomeTarefasCard from '../components/HomeTarefasCard';
import { formatMenuDisplayName } from '../lib/formatDisplayName';
import type { RootStackParamList } from '../../App';

function greetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { scrollProps: chromeScroll, headerOffset } = useChromeScroll();
  const chrome = useChromeVisibility();
  const openMenu = chrome?.openMenu;

  const edgePan = useMemo(
    () =>
      PanResponder.create({
        // Só compete com o pager quando o gesto é claramente abrir o menu (→).
        onMoveShouldSetPanResponder: (_, g) =>
          g.dx > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.25,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          g.dx > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.35,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, g) => {
          if (g.dx > 48 || g.vx > 0.3) openMenu?.();
        },
        onPanResponderTerminate: (_, g) => {
          if (g.dx > 48 || g.vx > 0.3) openMenu?.();
        },
      }),
    [openMenu],
  );

  const displayName = formatMenuDisplayName(user?.name);

  const goProfile = () => {
    (navigation as any).navigate('Profile');
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['planner-events'] }),
        queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerOffset + 16 }]}
        showsVerticalScrollIndicator={false}
        {...chromeScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.greetingRow}>
          <View style={styles.greetingTextWrap}>
            <Text style={styles.greetingEyebrow}>{greetingPrefix()},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>
              {displayName}!
            </Text>
          </View>
          <TouchableOpacity
            onPress={goProfile}
            activeOpacity={0.8}
            accessibilityLabel="Abrir perfil"
            hitSlop={6}
          >
            <UserAvatar
              uri={user?.profilePhotoUrl}
              size={60}
              backgroundColor={colors.primary}
              iconColor="#fff"
              borderColor={isDark ? colors.border : 'rgba(15, 23, 42, 0.08)'}
              borderWidth={StyleSheet.hairlineWidth * 1.5}
            />
          </TouchableOpacity>
        </View>

        <HomeAgendaCard />

        <HomeTarefasCard />
      </ScrollView>
      {/* Só a faixa da esquerda — View full-screen (mesmo box-none) atrapalha o swipe do pager */}
      <View style={styles.edgeHit} {...edgePan.panHandlers} />
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 28,
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 28,
    },
    greetingTextWrap: { flex: 1, minWidth: 0 },
    greetingEyebrow: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: -0.1,
      marginBottom: 2,
    },
    greetingName: {
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.5,
      color: colors.text,
    },
    edgeHit: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 32,
      zIndex: 12,
    },
  });
