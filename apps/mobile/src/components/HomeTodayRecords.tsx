import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ChevronRight, LogIn, Utensils, RotateCw, LogOut } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

type TimeRecord = {
  id: string;
  type: string;
  timestamp: string;
};

const PUNCH_TYPES = [
  { type: 'ENTRY', label: 'Entrada', icon: LogIn },
  { type: 'LUNCH_START', label: 'Almoço', icon: Utensils },
  { type: 'LUNCH_END', label: 'Retorno', icon: RotateCw },
  { type: 'EXIT', label: 'Saída', icon: LogOut },
] as const;

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function formatShortDate() {
  const formatted = new Date().toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return formatted.replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

export default function HomeTodayRecords() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [todayRecords, setTodayRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodayRecords = useCallback(async () => {
    try {
      const response = await api.get('/api/time-records/my-records/today');
      if (response.ok) {
        const data = await response.json();
        setTodayRecords(data.data?.records || []);
      }
    } catch (error) {
      console.error('Erro ao buscar registros de hoje:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTodayRecords();
  }, [fetchTodayRecords]);

  useFocusEffect(
    useCallback(() => {
      void fetchTodayRecords();
    }, [fetchTodayRecords]),
  );

  const punchRecordsDisplay = PUNCH_TYPES.map((punchType) => {
    const record = todayRecords.find((r) => r.type === punchType.type);
    return {
      ...punchType,
      time: record ? formatTime(record.timestamp) : '--:--:--',
    };
  });

  const openTimeRecords = () => {
    const parent = navigation.getParent();
    if (parent) parent.navigate('TimeRecords' as never);
    else (navigation as any).navigate('TimeRecords');
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>Hoje</Text>
          <Text style={styles.sectionMeta}>{formatShortDate()}</Text>
        </View>
        <TouchableOpacity
          style={styles.seeMore}
          onPress={openTimeRecords}
          activeOpacity={0.65}
          hitSlop={8}
          accessibilityLabel="Ver mais registros"
        >
          <Text style={styles.seeMoreText}>Ver mais</Text>
          <ChevronRight size={16} color={colors.primary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          punchRecordsDisplay.map((punch, index) => {
            const IconComponent = punch.icon;
            const isLast = index === punchRecordsDisplay.length - 1;
            return (
              <View
                key={punch.type}
                style={[styles.recordRow, !isLast && styles.recordRowBorder]}
              >
                <View style={styles.recordIconWrap}>
                  <IconComponent size={18} color={colors.primary} strokeWidth={2.2} />
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
          })
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    section: {
      paddingBottom: 8,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 12,
    },
    sectionTitleWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 10,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
      color: colors.text,
    },
    sectionMeta: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'capitalize',
    },
    seeMore: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    seeMoreText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
      letterSpacing: -0.1,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 4,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.06)',
    },
    loading: {
      paddingVertical: 28,
      alignItems: 'center',
    },
    recordRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    recordRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    recordIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.1)',
    },
    recordLabel: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.1,
    },
    recordTime: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.primary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.2,
    },
    recordTimeEmpty: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
  });
