import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarDays, ChevronRight, ListChecks, Star } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fetchPlannerTaskLists, type PlannerTask } from '../services/plannerTasks';
import type { RootStackParamList } from '../../App';

export type TarefasFilter = 'today' | 'overdue' | 'starred' | 'all';

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Resumo das tarefas na tela inicial: um bloco vermelho com quatro cartões translúcidos
 * (Hoje, Atrasadas, Destacadas e Pendentes). Cada cartão abre a página de Tarefas já filtrada.
 */
export default function HomeTarefasResumo() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const { data: lists = [] } = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const open: PlannerTask[] = lists.flatMap((l) => l.tasks || []).filter((t) => !t.completed);
    const today = startOfDay(new Date());
    let todayN = 0;
    let overdue = 0;
    let starred = 0;
    for (const t of open) {
      if (t.starred) starred++;
      if (!t.dueDate) continue;
      const due = new Date(t.dueDate);
      if (Number.isNaN(due.getTime())) continue;
      const d = startOfDay(due);
      if (d < today) overdue++;
      else if (d === today) todayN++;
    }
    return { today: todayN, overdue, starred, all: open.length };
  }, [lists]);

  const cards: { key: TarefasFilter; label: string; value: number; Icon: LucideIcon }[] = [
    { key: 'today', label: 'Hoje', value: counts.today, Icon: CalendarDays },
    { key: 'overdue', label: 'Atrasadas', value: counts.overdue, Icon: AlarmClock },
    { key: 'starred', label: 'Destacadas', value: counts.starred, Icon: Star },
    { key: 'all', label: 'Pendentes', value: counts.all, Icon: ListChecks },
  ];

  const open = (filter?: TarefasFilter) => navigation.navigate('Tarefas', filter ? { filter } : undefined);

  return (
    <View style={styles.block}>
      <View style={styles.head}>
        <Text style={styles.headline}>
          <Text style={styles.headlineSoft}>Comece </Text>
          as tarefas de hoje.
        </Text>
      </View>

      <View style={styles.grid}>
        {cards.map(({ key, label, value, Icon }) => (
          <TouchableOpacity
            key={key}
            style={styles.card}
            onPress={() => open(key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value} tarefa${value === 1 ? '' : 's'}`}
          >
            <View style={styles.cardTop}>
              <View style={styles.iconCircle}>
                <Icon size={18} color={colors.primary} strokeWidth={2.2} />
              </View>
              <Text style={styles.cardLabel} numberOfLines={1}>
                {label}
              </Text>
            </View>
            <View style={styles.cardBottom}>
              <Text style={styles.count}>{String(value).padStart(2, '0')}</Text>
              <Text style={styles.countUnit}>{value === 1 ? 'Tarefa' : 'Tarefas'}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Todas as tarefas</Text>
        <TouchableOpacity
          onPress={() => open()}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Ver todas as tarefas"
        >
          <View style={styles.footerLinkRow}>
            <Text style={styles.footerLink}>Ver tudo</Text>
            <ChevronRight size={15} color="rgba(255,255,255,0.85)" strokeWidth={2.4} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getStyles(colors: any) {
  return StyleSheet.create({
    block: {
      backgroundColor: colors.primary,
      borderRadius: 26,
      padding: 16,
      marginBottom: 16,
      overflow: 'hidden',
      ...Platform.select({ ios: {}, android: {}, default: {} }),
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      paddingHorizontal: 4,
    },
    headline: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: -0.8,
    },
    headlineSoft: { color: 'rgba(255,255,255,0.62)' },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 18,
      paddingHorizontal: 4,
      paddingBottom: 2,
    },
    footerTitle: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },
    footerLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
    footerLink: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    card: {
      width: '48.4%',
      minHeight: 164,
      borderRadius: 20,
      padding: 14,
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.28)',
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconCircle: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#fff' },
    cardBottom: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    count: {
      fontSize: 42,
      fontWeight: '300',
      color: '#fff',
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
    },
    countUnit: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.75)' },
  });
}
