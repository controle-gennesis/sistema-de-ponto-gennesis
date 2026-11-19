import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Keyboard,
  Platform,
} from 'react-native';
import { SquarePen } from 'lucide-react-native';
import GlassBg from '../components/GlassBg';
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
import HomeTarefasResumo from '../components/HomeTarefasResumo';
import HomeQuickAccess from '../components/HomeQuickAccess';
import HomeFeedbackCard from '../components/HomeFeedbackCard';
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
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Teclado aberto: abre espaço embaixo para o botão de enviar a avaliação não ficar escondido.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { scrollProps: chromeScroll, headerOffset, bottomContentInset } = useChromeScroll();

  const displayName = formatMenuDisplayName(user?.name);

  const goProfile = () => {
    (navigation as any).navigate('Profile');
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
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerOffset + 16, paddingBottom: keyboardHeight > 0 ? keyboardHeight + 16 : Math.max(0, bottomContentInset - 16) }, // o último cartão já tem 16 de margem embaixo
        ]}
        keyboardShouldPersistTaps="handled"
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
            onPress={goProfile}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Editar perfil"
            hitSlop={8}
            style={styles.editBtn}
          >
            {/* Fundo translúcido liso: o vidro real piscava ao voltar para esta tela. */}
            <View style={styles.editBtnInner}>
              <GlassBg radius={23} />
              <SquarePen size={20} color={colors.text} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        </View>

        <HomeQuickAccess />

        <HomeAprovacoesCard />

        <HomeAgendaCard />

        <HomeTarefasResumo />

        <HomeFeedbackCard
          onInputFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 320)}
        />
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
    editBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    editBtnInner: {
      width: 46,
      height: 46,
      borderRadius: 23,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
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
