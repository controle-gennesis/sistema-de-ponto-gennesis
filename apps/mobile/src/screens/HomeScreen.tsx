import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { syncPunchReminders } from '../notifications/punchReminders';
import { useTheme } from '../context/ThemeContext';
import { useChromeScroll } from '../navigation/ChromeVisibilityContext';
import UserAvatar from '../components/UserAvatar';
import HomeAgendaCard from '../components/HomeAgendaCard';
import HomeAprovacoesCard from '../components/HomeAprovacoesCard';
import HomeTarefasCard from '../components/HomeTarefasCard';
import HomeQuickAccess from '../components/HomeQuickAccess';
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
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { scrollProps: chromeScroll, headerOffset, bottomContentInset } = useChromeScroll();

  const displayName = formatMenuDisplayName(user?.name);

  const goProfile = () => {
    (navigation as any).navigate('Profile');
  };

  const confirmLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me-permissions'] }),
        queryClient.invalidateQueries({ queryKey: ['planner-events'] }),
        queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] }),
        queryClient.invalidateQueries({ queryKey: ['approvals'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['me-permissions'] });
    }, [queryClient]),
  );

  // Renova os lembretes de ponto sempre que a tela inicial ganha foco (ex.: depois de bater o ponto).
  useFocusEffect(
    useCallback(() => {
      void syncPunchReminders(user);
    }, [user]),
  );

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerOffset + 16, paddingBottom: bottomContentInset },
        ]}
        showsVerticalScrollIndicator={false}
        {...chromeScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressViewOffset={headerOffset}
          />
        }
      >
        <View style={styles.greetingRow}>
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
          <View style={styles.greetingTextWrap}>
            <Text style={styles.greetingEyebrow}>{greetingPrefix()},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>
              {displayName}!
            </Text>
          </View>
          <TouchableOpacity
            onPress={confirmLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Sair"
            hitSlop={8}
            style={styles.logoutBtn}
          >
            <LogOut size={20} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <HomeQuickAccess />

        <HomeAprovacoesCard />

        <HomeAgendaCard />

        <HomeTarefasCard />
      </ScrollView>
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
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 28,
    },
    greetingTextWrap: { flex: 1, minWidth: 0 },
    logoutBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
  });
