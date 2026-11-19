import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Pressable, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Radio } from 'lucide-react-native';
import { PLANNER_ICON_MAP } from '../lib/plannerIcons';
import { useTheme } from '../context/ThemeContext';
import { fetchPlannerEvents } from '../services/plannerEvents';
import { fetchGestaoOsAgenda } from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type DayItem = {
  id: string;
  title: string;
  sortAt: number;
  expiresAt: number;
  timeTop: string;
  timeBottom: string | null;
  icon?: string | null;
  attendeesCount: number;
  accent: string;
  ongoing: boolean;
  workOrderId?: string;
};

type AgendaLike = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  color?: string | null;
  workOrderId?: string;
  icon?: string | null;
  attendeesCount?: number;
};

const MAX_ITEMS = 3;
const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Segunda-feira da semana de `date` (a semana do app começa na segunda). */
function mondayOf(date: Date): Date {
  const d = startOfDay(date);
  return addDays(d, -((d.getDay() + 6) % 7));
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Eventos que tocam o dia `day`, com o horário certo para aquele dia (início, «Até», «Dia todo»). */
function buildDayItems(events: AgendaLike[], day: Date, nowMs: number): DayItem[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const items: DayItem[] = [];

  for (const ev of events) {
    const start = new Date(ev.startAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(ev.endAt);
    const endMs = Number.isNaN(end.getTime()) ? start.getTime() : end.getTime();
    // Toca o dia? (término exatamente à meia-noite não ocupa o dia seguinte)
    if (!(start.getTime() < dayEnd && (endMs > dayStart || start.getTime() >= dayStart))) continue;

    const hasEnd = !Number.isNaN(end.getTime()) && endMs > start.getTime();
    const startLabel = formatClock(start);
    const endLabel = hasEnd ? formatClock(end) : null;
    const startsToday = start.getTime() >= dayStart;
    const endsToday = endMs <= dayEnd;

    let timeTop = startLabel;
    let timeBottom: string | null = endLabel;
    if (startLabel === '00:00' && endLabel === '23:59') {
      timeTop = 'Dia todo';
      timeBottom = null;
    } else if (!startsToday && !endsToday) {
      timeTop = 'Dia todo';
      timeBottom = null;
    } else if (!startsToday && endsToday) {
      timeTop = 'Até';
      timeBottom = endLabel;
    } else if (startsToday && !endsToday) {
      timeBottom = null;
    }

    items.push({
      id: ev.id,
      title: ev.title,
      sortAt: start.getTime(),
      expiresAt: endMs,
      timeTop,
      timeBottom,
      icon: ev.icon ?? null,
      attendeesCount: ev.attendeesCount ?? 0,
      accent: ev.color || '#3B82F6',
      ongoing: start.getTime() <= nowMs && endMs >= nowMs,
      workOrderId: ev.workOrderId,
    });
  }

  return items.sort((a, b) => a.sortAt - b.sortAt);
}

export default function HomeAgendaCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Carrossel: dias soltos, 120 para trás e 240 para frente de hoje.
  const DAYS_BEFORE = 120;
  const baseDay = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: DAYS_BEFORE + 240 }, (_, i) => addDays(baseDay, i - DAYS_BEFORE)),
    [baseDay],
  );
  const [anchor, setAnchor] = useState(baseDay); // primeiro dia visível no carrossel
  const [stripW, setStripW] = useState(0);
  const stripRef = useRef<FlatList<Date>>(null);

  const GAP = 7;
  const itemLength = stripW > 0 ? (stripW - GAP * 6) / 7 + GAP : 0;

  /** Eventos da semana de `d` e das vizinhas (a busca é por janela, igual para quem olha e para quem seleciona). */
  const fetchWindow = async (monday: Date): Promise<AgendaLike[]> => {
    const from = addDays(monday, -14);
    const to = addDays(monday, 28);
    const [{ events }, osItems] = await Promise.all([
      fetchPlannerEvents(from, to),
      fetchGestaoOsAgenda(from, to),
    ]);
    const planner: AgendaLike[] = events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      startAt: ev.startAt,
      endAt: ev.endAt,
      color: ev.color,
      icon: ev.icon,
      attendeesCount: ev.attendees?.length ?? 0,
    }));
    const os: AgendaLike[] = osItems.map((item) => ({
      id: item.id,
      title: item.title,
      startAt: item.startAt,
      endAt: item.endAt,
      color: item.color,
      workOrderId: item.workOrderId,
      icon: item.kind === 'plan' ? 'check' : 'wrench',
    }));
    return [...os, ...planner];
  };

  const anchorMonday = mondayOf(anchor);
  const selectedMonday = mondayOf(selected);
  const anchorQuery = useQuery({
    queryKey: ['planner-events', 'home-days-v1', anchorMonday.toISOString()],
    queryFn: () => fetchWindow(anchorMonday),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const selectedQuery = useQuery({
    queryKey: ['planner-events', 'home-days-v1', selectedMonday.toISOString()],
    queryFn: () => fetchWindow(selectedMonday),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const isLoading = selectedQuery.isLoading && !selectedQuery.data;

  // Junta as duas janelas (sem repetir): o dia selecionado nunca perde os eventos ao arrastar.
  const weekEvents = useMemo(() => {
    const map = new Map<string, AgendaLike>();
    for (const ev of [...(anchorQuery.data ?? []), ...(selectedQuery.data ?? [])]) {
      map.set(`${ev.id}|${ev.startAt}`, ev);
    }
    return [...map.values()];
  }, [anchorQuery.data, selectedQuery.data]);

  const isToday = sameDay(selected, now);

  // Todos os eventos do dia; os que já terminaram ficam apagados (e não somem, para a lista bater com o pontinho).
  const dayItems = useMemo(
    () => buildDayItems(weekEvents, selected, now.getTime()),
    [weekEvents, selected, now],
  );

  // Dias com evento (bolinha embaixo do número): marca cada dia que o evento ocupa.
  const busyKeys = useMemo(() => {
    const set = new Set<string>();
    for (const ev of weekEvents) {
      const st = new Date(ev.startAt);
      if (Number.isNaN(st.getTime())) continue;
      let en = new Date(ev.endAt);
      if (Number.isNaN(en.getTime()) || en.getTime() < st.getTime()) en = st;
      // término exatamente à meia-noite não ocupa o dia seguinte
      const endDay =
        en.getHours() === 0 && en.getMinutes() === 0 && startOfDay(en).getTime() > startOfDay(st).getTime()
          ? addDays(startOfDay(en), -1)
          : startOfDay(en);
      let guard = 0;
      for (let d = startOfDay(st); d.getTime() <= endDay.getTime() && guard < 62; d = addDays(d, 1), guard++) {
        set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      }
    }
    return set;
  }, [weekEvents]);

  const heading = useMemo(() => {
    const text = selected.toLocaleDateString('pt-BR', {
      weekday: isToday ? undefined : 'long',
      day: 'numeric',
      month: 'long',
    });
    return isToday ? `Hoje, ${text}` : text.replace(/^./, (c) => c.toUpperCase());
  }, [selected, isToday]);

  // Mês dos dias que estão na tela: «Novembro» ou «Nov – Dez» quando a fileira atravessa dois meses.
  const visibleMonthLabel = useMemo(() => {
    const first = anchor;
    const last = addDays(anchor, 6);
    const full = (d: Date) =>
      d.toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
    const short = (d: Date) =>
      d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').replace(/^./, (c) => c.toUpperCase());
    return first.getMonth() === last.getMonth() ? full(first) : `${short(first)} – ${short(last)}`;
  }, [anchor]);

  const stripExtra = useMemo(() => [selected, busyKeys, now], [selected, busyKeys, now]);

  const onStripScrolled = (x: number) => {
    if (itemLength <= 0) return;
    const idx = Math.max(0, Math.min(days.length - 1, Math.round(x / itemLength)));
    setAnchor(days[idx]);
  };

  /** Rola o carrossel para deixar `day` perto do meio (o dia selecionado não muda ao arrastar). */
  const scrollToDay = (day: Date, animated = true) => {
    const idx = days.findIndex((d) => sameDay(d, day));
    if (idx < 0 || itemLength <= 0) return;
    stripRef.current?.scrollToOffset({ offset: Math.max(0, (idx - 3) * itemLength), animated });
  };

  const goToday = () => {
    setSelected(startOfDay(new Date()));
    setAnchor(baseDay);
    scrollToDay(baseDay);
  };

  // «Hoje» só aparece quando você está longe dele (outro dia selecionado ou carrossel fora de hoje).
  const showBackToToday =
    !sameDay(selected, now) || Math.abs(anchor.getTime() - baseDay.getTime()) > 3 * 86_400_000;

  // No máximo 3 eventos: hoje, o último que passou + o que está rolando + os próximos; o resto fica em «Ver mais».
  const { visibleItems, hiddenCount } = useMemo(() => {
    if (!isToday || dayItems.length <= MAX_ITEMS) {
      const shown = dayItems.slice(0, MAX_ITEMS);
      return { visibleItems: shown, hiddenCount: dayItems.length - shown.length };
    }
    const nowMs = now.getTime();
    const firstActive = dayItems.findIndex((i) => i.expiresAt >= nowMs);
    let pick: DayItem[];
    if (firstActive === -1) {
      pick = dayItems.slice(-MAX_ITEMS); // tudo já passou: os últimos do dia
    } else {
      const past = dayItems.slice(0, firstActive);
      const upcoming = dayItems.slice(firstActive);
      const lastPast = past.slice(-1);
      pick = [...lastPast, ...upcoming.slice(0, MAX_ITEMS - lastPast.length)];
      if (pick.length < MAX_ITEMS) {
        // poucos eventos pela frente: completa com os que passaram há pouco
        const morePast = past.slice(0, past.length - lastPast.length).slice(-(MAX_ITEMS - pick.length));
        pick = [...morePast, ...pick];
      }
    }
    return { visibleItems: pick, hiddenCount: dayItems.length - pick.length };
  }, [dayItems, isToday, now]);
  const openAgenda = () => navigation.navigate('Agenda');

  return (
    <View style={styles.wrap}>
      <View style={styles.headingBar}>
        <TouchableOpacity
          style={styles.headingRow}
          onPress={openAgenda}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Abrir agenda"
        >
          <Text style={styles.heading} numberOfLines={1}>
            {heading}
          </Text>
          <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2.4} />
        </TouchableOpacity>
        {showBackToToday ? (
          <TouchableOpacity
            onPress={goToday}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityLabel="Voltar para hoje"
            style={styles.todayLink}
          >
            <Text style={styles.todayLinkText}>Hoje</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.monthLabel}>{visibleMonthLabel}</Text>

      <View style={styles.weekWrap} onLayout={(e) => setStripW(e.nativeEvent.layout.width)}>
        {itemLength > 0 ? (
          <FlatList
            ref={stripRef}
            data={days}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(d) => d.toISOString()}
            getItemLayout={(_, index) => ({ length: itemLength, offset: itemLength * index, index })}
            initialScrollIndex={DAYS_BEFORE - 3}
            snapToInterval={itemLength}
            snapToAlignment="start"
            decelerationRate="fast"
            extraData={stripExtra}
            onScroll={(e) => onStripScrolled(e.nativeEvent.contentOffset.x)}
            scrollEventThrottle={48}
            onMomentumScrollEnd={(e) => onStripScrolled(e.nativeEvent.contentOffset.x)}
            onScrollEndDrag={(e) => onStripScrolled(e.nativeEvent.contentOffset.x)}
            windowSize={9}
            initialNumToRender={10}
            renderItem={({ item: d }) => {
              const sel = sameDay(d, selected);
              const today = sameDay(d, now);
              const busy = busyKeys.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
              return (
                <Pressable
                  onPress={() => setSelected(startOfDay(d))}
                  style={[styles.dayPill, { width: itemLength - GAP, marginRight: GAP }]}
                  accessibilityRole="button"
                  accessibilityLabel={d.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                >
                  <Text style={styles.dayName}>{WEEKDAYS[(d.getDay() + 6) % 7]}</Text>
                  <View style={[styles.dayCircle, sel && styles.dayCircleSel]}>
                    <Text
                      style={[
                        styles.dayNum,
                        today && !sel && { color: colors.primary },
                        sel && styles.dayNumSel,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </View>
                  <View style={[styles.dot, busy && { backgroundColor: colors.primary }]} />
                </Pressable>
              );
            }}
          />
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : dayItems.length === 0 ? (
        <Text style={styles.empty}>{isToday ? 'Nenhum evento para hoje.' : 'Nenhum evento neste dia.'}</Text>
      ) : (
        <View style={styles.list}>
          {visibleItems.map((item, index) => {
            const IconCmp = item.icon ? PLANNER_ICON_MAP[item.icon] : undefined;
            const ended = isToday && item.expiresAt < now.getTime();
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.eventRow,
                  index === 0 ? styles.eventRowFirst : styles.eventRowDivider,
                  ended && { opacity: 0.5 },
                ]}
                onPress={() => {
                  if (item.workOrderId) {
                    navigation.navigate('GestaoOsDetail', { id: item.workOrderId });
                    return;
                  }
                  openAgenda();
                }}
                activeOpacity={0.7}
              >
                {IconCmp ? (
                  <View style={[styles.iconTile, { backgroundColor: `${item.accent}1F` }]}>
                    <IconCmp size={14} color={item.accent} strokeWidth={2.2} />
                  </View>
                ) : null}
                <View style={styles.eventMain}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.eventTitle, { flexShrink: 1 }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.ongoing ? (
                      <View accessibilityLabel="Em andamento" style={styles.ongoingBadge}>
                        <Radio size={13} color={colors.primary} strokeWidth={2.4} />
                      </View>
                    ) : null}
                  </View>
                  {item.attendeesCount > 0 ? (
                    <Text style={styles.eventMeta} numberOfLines={1}>
                      {`${item.attendeesCount} pessoa${item.attendeesCount === 1 ? '' : 's'}`}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.times}>
                  <Text style={styles.timeStartText}>{item.timeTop}</Text>
                  {item.timeBottom ? <Text style={styles.timeEndText}>{item.timeBottom}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}

          {hiddenCount > 0 ? (
            <TouchableOpacity onPress={openAgenda} activeOpacity={0.7} hitSlop={6}>
              <Text style={styles.more}>
                Ver mais {hiddenCount} evento{hiddenCount === 1 ? '' : 's'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    // Flutuando: sem fundo e sem borda.
    wrap: { marginTop: 14, marginBottom: 34 },
    headingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, height: 32 },
    headingRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    todayLink: {
      paddingHorizontal: 12,
      height: 28,
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(206,55,54,0.2)' : 'rgba(206,55,54,0.1)',
    },
    todayLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    heading: { flexShrink: 1, fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    monthLabel: { marginBottom: 8, fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.2 },
    weekWrap: { minHeight: 88 },
    week: { flexDirection: 'row', gap: 7 },
    dayPill: {
      alignItems: 'center',
      paddingTop: 12,
      paddingBottom: 6,
      borderRadius: 28,
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.08)',
    },
    dayName: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 },
    dayCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
    },
    // Selecionado: bolinha no vermelho padrão do app.
    dayCircleSel: { backgroundColor: colors.primary },
    dayNum: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    dayNumSel: { color: '#ffffff', fontWeight: '700' },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3, backgroundColor: 'transparent' },
    loadingWrap: { paddingVertical: 18, alignItems: 'flex-start' },
    empty: { marginTop: 16, fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    list: { marginTop: 12 },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 2,
    },
    eventRowFirst: { paddingTop: 2 },
    eventRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    iconTile: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventMain: { flex: 1, minWidth: 0, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eventTitle: { fontSize: 15, fontWeight: '600', color: colors.text, lineHeight: 20 },
    eventMeta: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    ongoingBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.2)' : 'rgba(206,55,54,0.1)',
    },
    times: { alignItems: 'flex-end', minWidth: 44 },
    timeStartText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    timeEndText: {
      marginTop: 2,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
      opacity: 0.7,
      fontVariant: ['tabular-nums'],
    },
    more: { marginTop: 8, fontSize: 12, fontWeight: '600', color: colors.primary },
  });
