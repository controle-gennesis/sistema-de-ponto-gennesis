import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import { useChromeScroll } from '../navigation/ChromeVisibilityContext';
import { onFabBarPress } from '../navigation/fabBarEvents';
import { Eye, LogIn, Utensils, RotateCw, LogOut } from 'lucide-react-native';
import api from '../services/api';

type RootStackParamList = {
  Main: undefined;
  Punch: undefined;
  TimeRecords: undefined;
};

type TimeRecord = {
  id: string;
  type: string;
  timestamp: string;
  observation?: string;
};

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { scrollProps: chromeScroll, headerOffset } = useChromeScroll();
  const [todayRecords, setTodayRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    fetchTodayRecords();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchTodayRecords();
    }, []),
  );

  const fetchTodayRecords = async () => {
    try {
      const response = await api.get('/api/time-records/my-records/today');

      if (response.ok) {
        const data = await response.json();
        const records = data.data?.records || [];
        setTodayRecords(records);
      }
    } catch (error) {
      console.error('Erro ao buscar registros de hoje:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTodayRecords();
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatDate = () => {
    const date = new Date();
    const formattedDate = date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  };

  const getFirstName = () => {
    if (!user?.name) return 'colaborador';
    return user.name.split(' ')[0];
  };

  const allPunchTypes = [
    { type: 'ENTRY', label: 'Entrada', icon: LogIn },
    { type: 'LUNCH_START', label: 'Almoço', icon: Utensils },
    { type: 'LUNCH_END', label: 'Retorno', icon: RotateCw },
    { type: 'EXIT', label: 'Saída', icon: LogOut },
  ];

  const punchRecordsDisplay = allPunchTypes.map((punchType) => {
    const record = todayRecords.find((r) => r.type === punchType.type);
    return {
      ...punchType,
      time: record ? formatTime(record.timestamp) : '--:--:--',
    };
  });

  const getNextPunchType = useCallback(() => {
    const hasEntry = todayRecords.some((r) => r.type === 'ENTRY');
    const hasLunchStart = todayRecords.some((r) => r.type === 'LUNCH_START');
    const hasLunchEnd = todayRecords.some((r) => r.type === 'LUNCH_END');
    const hasExit = todayRecords.some((r) => r.type === 'EXIT');

    if (!hasEntry) return 'ENTRADA';
    if (!hasLunchStart) return 'ALMOÇO';
    if (!hasLunchEnd) return 'RETORNO';
    if (!hasExit) return 'SAÍDA';
    return 'COMPLETO';
  }, [todayRecords]);

  const openPunch = useCallback(() => {
    if (getNextPunchType() === 'COMPLETO') {
      Alert.alert('Ponto', 'Todos os pontos do dia já foram registrados.');
      return;
    }
    const parent = navigation.getParent();
    if (parent) parent.navigate('Punch' as never);
    else navigation.navigate('Punch');
  }, [getNextPunchType, navigation]);

  useEffect(() => {
    const sub = onFabBarPress('Ponto', openPunch);
    return () => sub.remove();
  }, [openPunch]);

  const openTimeRecords = () => {
    const parent = navigation.getParent();
    if (parent) parent.navigate('TimeRecords' as never);
    else navigation.navigate('TimeRecords');
  };

  return (
    <View style={styles.safeArea}>
      <AppHeader />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerOffset + 8 }]}
        showsVerticalScrollIndicator={false}
        {...chromeScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.greetingRow}>
          <Text style={styles.greetingEyebrow}>Olá,</Text>
          <Text style={styles.greetingName} numberOfLines={1}>
            {getFirstName()}!
          </Text>
        </View>

        <View style={styles.todaySection}>
          <View style={styles.titleContainer}>
            <Text style={styles.recordsTitle}>Registros</Text>
            <Text style={styles.dateSubtitle}>{formatDate()}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.recordsGrid}>
              {punchRecordsDisplay.map((punch, index) => {
                const IconComponent = punch.icon;
                return (
                  <View key={index} style={styles.recordCard}>
                    <View style={styles.recordIcon}>
                      <IconComponent size={26} color={colors.primary} />
                    </View>
                    <Text style={styles.recordLabel}>{punch.label}</Text>
                    <Text
                      style={[
                        styles.recordTime,
                        punch.time === '--:--:--' && styles.recordTimeEmpty,
                      ]}
                    >
                      {punch.time}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity style={styles.seeMoreButton} onPress={openTimeRecords}>
            <Eye size={18} color={colors.primary} />
            <Text style={styles.seeMoreText}>Ver mais</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, _isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.screenRoot,
    },
    container: {
      flex: 1,
      backgroundColor: colors.screenRoot,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingBottom: 120,
    },
    greetingRow: {
      marginBottom: 24,
    },
    greetingEyebrow: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    greetingName: {
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.6,
      color: colors.text,
    },
    todaySection: {
      paddingBottom: 8,
    },
    titleContainer: {
      alignItems: 'center',
      marginBottom: 20,
    },
    recordsTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    dateSubtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
    },
    recordsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    recordCard: {
      flex: 1,
      minWidth: '45%',
      borderRadius: 25,
      padding: 14,
      alignItems: 'center',
    },
    recordIcon: {
      marginBottom: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recordLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 16,
    },
    recordTime: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primary,
    },
    recordTimeEmpty: {
      color: colors.textSecondary,
    },
    seeMoreButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: 12,
      gap: 8,
      marginTop: 20,
    },
    seeMoreText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
