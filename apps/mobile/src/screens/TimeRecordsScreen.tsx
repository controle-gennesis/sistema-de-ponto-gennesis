import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import {
  LogIn,
  LogOut,
  Utensils,
  RotateCw,
  Coffee,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import api from '../services/api';

export type TimeRecord = {
  id: string;
  type: string;
  timestamp: string;
  isValid: boolean;
  observation?: string;
  reason?: string;
  punchLocationName?: string | null;
  faceMatchStatus?: string | null;
};

interface GroupedRecords {
  [date: string]: TimeRecord[];
}

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const TYPE_LABELS: Record<string, string> = {
  ENTRY: 'Entrada',
  EXIT: 'Saída',
  LUNCH_START: 'Almoço',
  LUNCH_END: 'Retorno',
  BREAK_START: 'Início pausa',
  BREAK_END: 'Fim pausa',
};

const TYPE_ICONS: Record<string, typeof Clock> = {
  ENTRY: LogIn,
  EXIT: LogOut,
  LUNCH_START: Utensils,
  LUNCH_END: RotateCw,
  BREAK_START: Coffee,
  BREAK_END: Coffee,
};

export default function TimeRecordsScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    void fetchRecords();
  }, [selectedMonth, selectedYear]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);

      const res = await api.get(
        `/api/time-records/my-records?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&limit=200`,
      );

      if (!res.ok) {
        throw new Error('Erro ao carregar registros');
      }

      const data = await res.json();
      const list = (data.data || data) as TimeRecord[];
      setRecords(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar registros');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void fetchRecords();
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getWeekday = (timestamp: string) => {
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return days[new Date(timestamp).getDay()];
  };

  const groupedRecords: GroupedRecords = records.reduce((acc, record) => {
    const date = formatDate(record.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(record);
    return acc;
  }, {} as GroupedRecords);

  const sortedDates = Object.keys(groupedRecords).sort(
    (a, b) =>
      new Date(b.split('/').reverse().join('-')).getTime() -
      new Date(a.split('/').reverse().join('-')).getTime(),
  );

  const changeMonth = (delta: number) => {
    const next = new Date(selectedYear, selectedMonth + delta);
    setSelectedMonth(next.getMonth());
    setSelectedYear(next.getFullYear());
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack
        title="Registros de ponto"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() => changeMonth(-1)}
            style={styles.monthButton}
            hitSlop={8}
            accessibilityLabel="Mês anterior"
          >
            <ChevronLeft size={22} color={colors.primary} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {MONTH_NAMES[selectedMonth]} {selectedYear}
          </Text>
          <TouchableOpacity
            onPress={() => changeMonth(1)}
            style={styles.monthButton}
            hitSlop={8}
            accessibilityLabel="Próximo mês"
          >
            <ChevronRight size={22} color={colors.primary} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listHeading}>Pontos do mês</Text>
          <Text style={styles.listHeadingMeta}>{records.length}</Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && !refreshing ? (
          <ActivityIndicator style={{ marginTop: 28 }} color={colors.primary} />
        ) : sortedDates.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Clock size={28} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum registro</Text>
            <Text style={styles.emptyText}>
              Não há pontos neste mês. Troque o período acima para consultar outro.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {sortedDates.map((date) => (
              <View key={date} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayDate}>{date}</Text>
                  <Text style={styles.dayWeekday}>
                    {getWeekday(groupedRecords[date][0].timestamp)}
                  </Text>
                </View>

                {groupedRecords[date]
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                  )
                  .map((record) => {
                    const IconComponent = TYPE_ICONS[record.type] || Clock;
                    return (
                      <View key={record.id} style={styles.recordRow}>
                        <View style={styles.recordIconWrap}>
                          <IconComponent size={18} color={colors.primary} strokeWidth={2.2} />
                        </View>
                        <View style={styles.recordTextWrap}>
                          <Text style={styles.recordLabel}>
                            {TYPE_LABELS[record.type] || record.type}
                          </Text>
                          {record.punchLocationName ? (
                            <Text style={styles.recordMeta}>{record.punchLocationName}</Text>
                          ) : null}
                          {record.reason ? (
                            <Text style={styles.recordMeta} numberOfLines={2}>
                              {record.reason}
                            </Text>
                          ) : null}
                          {!record.isValid ? (
                            <Text style={styles.invalidBadge}>Inválido</Text>
                          ) : null}
                        </View>
                        <Text style={styles.recordTime}>{formatTime(record.timestamp)}</Text>
                      </View>
                    );
                  })}
              </View>
            ))}
          </View>
        )}
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
      paddingBottom: 40,
    },
    monthSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.06)',
      marginBottom: 18,
    },
    monthButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
    },
    monthText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    listHeading: { color: colors.text, fontSize: 16, fontWeight: '700' },
    listHeadingMeta: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    errorCard: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fee2e2',
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#ef4444',
    },
    errorText: {
      color: '#dc2626',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
    empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 24 },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.card : colors.surface,
      marginBottom: 14,
    },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    list: { gap: 10 },
    dayCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.06)',
    },
    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    dayDate: { fontSize: 15, fontWeight: '700', color: colors.text },
    dayWeekday: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    recordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    recordIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.1)',
    },
    recordTextWrap: { flex: 1, minWidth: 0, gap: 2 },
    recordLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
    recordMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
    recordTime: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
      fontVariant: ['tabular-nums'],
    },
    invalidBadge: {
      alignSelf: 'flex-start',
      fontSize: 10,
      color: '#ef4444',
      fontWeight: '700',
      backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : '#fee2e2',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      overflow: 'hidden',
    },
  });
