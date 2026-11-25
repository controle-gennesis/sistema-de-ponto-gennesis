import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Pressable,
  Switch,
  LayoutAnimation,
  UIManager,
  useWindowDimensions,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  LayoutChangeEvent,
  Linking,
  Image,
} from 'react-native';
import { GlassBlur } from '../components/GlassBg';
import KanbanSheet from '../components/KanbanSheet';
import { PLANNER_ICON_MAP, PLANNER_ICON_OPTIONS } from '../lib/plannerIcons';
import { MemberPickerSheet } from '../components/KanbanMemberUi';
import FormFieldLabel from '../components/FormFieldLabel';
import DateField, { formatDateValue } from '../components/DateField';
import TimeField from '../components/TimeField';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import {
  Plus,
  Check,
  Star,
  Trash2,
  Ban,
  Radio,
  CalendarSync,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  ListTodo,
  X,
  Users,
  Phone,
  BarChart3,
  CheckCircle2,
  Plane,
  Coffee,
  MapPin,
  Briefcase,
  FileText,
  Upload,
  Download,
  Wrench,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader, { HeaderIconButton } from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';
import { PersonPickerListRow } from '../components/PersonPickerUi';
import { formatCpfDisplay } from '../lib/cpf';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  createPlannerEvent,
  deletePlannerEvent,
  deletePlannerEventAta,
  EVENT_COLORS,
  fetchKanbanPickerUsers,
  fetchPlannerEvents,
  updatePlannerEvent,
  uploadPlannerEventAta,
  type KanbanPickerUser,
  type PlannerEvent,
  type PlannerEventAttendee,
  fetchGoogleCalendarStatus,
  fetchGoogleCalendarAuthUrl,
  syncGoogleCalendar,
  disconnectGoogleCalendar,
} from '../services/plannerEvents';
import { fetchGestaoOsAgenda } from '../services/gestaoOs';
import { fetchHolidays } from '../services/holidays';
import {
  createPlannerTask,
  createPlannerTaskList,
  deletePlannerTask,
  deletePlannerTaskList,
  fetchPlannerTaskLists,
  toDateInputValue,
  toTimeInputValue,
  updatePlannerTask,
  updatePlannerTaskList,
  type PlannerTask,
  type PlannerTaskList,
} from '../services/plannerTasks';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import type { RootStackParamList } from '../../App';
import MapView, { Marker } from 'react-native-maps';

type Mode = 'agenda' | 'tasks';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function toLocalIso(date: Date, time = '09:00') {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hh || 9, mm || 0, 0, 0);
  return d.toISOString();
}
function formatMonthTitle(d: Date) {
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function PlannerEventIcon({
  icon,
  color,
}: {
  icon?: string | null;
  color: string;
}) {
  if (!icon) return null;
  const Icon = PLANNER_ICON_MAP[icon];
  if (!Icon) return null;
  return <Icon size={14} color={color} strokeWidth={2.2} />;
}

function AnimatedModeSwitcher({
  mode,
  onChange,
  colors,
  styles,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  colors: any;
  styles: ReturnType<typeof getStyles>;
}) {
  const pillX = useRef(new Animated.Value(0)).current;
  const [halfWidth, setHalfWidth] = useState(0);
  const PAD = 4;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const next = Math.max(0, (w - PAD * 2) / 2);
    setHalfWidth(next);
    pillX.setValue(mode === 'agenda' ? 0 : next);
  };

  useEffect(() => {
    if (halfWidth <= 0) return;
    Animated.timing(pillX, {
      toValue: mode === 'agenda' ? 0 : halfWidth,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [mode, halfWidth, pillX]);

  return (
    <View style={styles.switcher} onLayout={onTrackLayout}>
      {halfWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.switchPill,
            {
              width: halfWidth,
              transform: [{ translateX: pillX }],
              backgroundColor: colors.surface,
            },
          ]}
        />
      )}
      <TouchableOpacity
        style={styles.switchBtn}
        onPress={() => onChange('agenda')}
        activeOpacity={0.8}
      >
        <CalendarIcon
          size={15}
          color={mode === 'agenda' ? colors.primary : colors.textSecondary}
          strokeWidth={2.2}
        />
        <Text style={[styles.switchText, mode === 'agenda' && styles.switchTextActive]}>
          Agenda
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.switchBtn}
        onPress={() => onChange('tasks')}
        activeOpacity={0.8}
      >
        <ListTodo
          size={15}
          color={mode === 'tasks' ? colors.primary : colors.textSecondary}
          strokeWidth={2.2}
        />
        <Text style={[styles.switchText, mode === 'tasks' && styles.switchTextActive]}>
          Tarefas
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function AgendaDayMap({
  events,
  colors,
}: {
  events: PlannerEvent[];
  colors: { textSecondary: string; border: string };
}) {
  const pins = events.filter(
    (ev) => ev.latitude != null && ev.longitude != null && Number.isFinite(Number(ev.latitude))
  );
  if (pins.length === 0) return null;
  const latitudes = pins.map((ev) => Number(ev.latitude));
  const longitudes = pins.map((ev) => Number(ev.longitude));
  const latitude = latitudes.reduce((sum, n) => sum + n, 0) / latitudes.length;
  const longitude = longitudes.reduce((sum, n) => sum + n, 0) / longitudes.length;
  const latSpan = Math.max(0.02, Math.max(...latitudes) - Math.min(...latitudes) + 0.01);
  const lngSpan = Math.max(0.02, Math.max(...longitudes) - Math.min(...longitudes) + 0.01);
  const osm = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=14&size=640x280&maptype=mapnik&markers=${latitudes[0]},${longitudes[0]},red-pushpin`;

  const openMaps = () => {
    const q = `${latitude},${longitude}`;
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {Platform.OS === 'web' ? (
        <TouchableOpacity onPress={openMaps} activeOpacity={0.9}>
          <Image source={{ uri: osm }} style={{ width: '100%', height: 180, borderRadius: 14 }} />
        </TouchableOpacity>
      ) : (
        <MapView
          style={{
            width: '100%',
            height: 180,
            borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: latSpan,
            longitudeDelta: lngSpan,
          }}
          scrollEnabled={false}
          zoomEnabled
          onPress={openMaps}
        >
          {pins.map((ev) => (
            <Marker
              key={ev.id}
              coordinate={{
                latitude: Number(ev.latitude),
                longitude: Number(ev.longitude),
              }}
              title={ev.title}
              description={ev.address || undefined}
            />
          ))}
        </MapView>
      )}
      <Text style={{ marginTop: 6, fontSize: 12, color: colors.textSecondary }}>
        Mapa das OS do dia · toque para abrir o Google Maps
      </Text>
    </View>
  );
}

/**
 * Botão flutuante («Hoje», atualizar): no iPhone usa o vidro translúcido do sistema (mesmo visual
 * da barra de abas); entra com um «pulinho» e encolhe levemente ao toque.
 */
function FloatingGlassButton({
  onPress,
  onLongPress,
  isDark,
  colors,
  styles,
  side = 'left',
  round = false,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  onLongPress?: () => void;
  isDark: boolean;
  colors: any;
  styles: any;
  side?: 'left' | 'right';
  round?: boolean;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(appear, {
      toValue: 1,
      damping: 14,
      stiffness: 180,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [appear]);

  const springTo = (v: number) =>
    Animated.spring(press, {
      toValue: v,
      damping: 16,
      stiffness: 320,
      mass: 0.7,
      useNativeDriver: true,
    }).start();

  const label = children;

  return (
    <Animated.View
      style={[
        styles.floatToday,
        side === 'right' && { left: undefined, right: 20 },
        // Android: sem sombra no contêiner (a sombra leve fica no botão).
        Platform.OS === 'android' && { shadowOpacity: 0, elevation: 0 },
        {
          opacity: appear,
          transform: [
            { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            { scale: press },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => springTo(0.92)}
        onPressOut={() => springTo(1)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View
          style={[
            styles.floatTodayInner,
            round && styles.floatRound,
            // Android: sem vidro nem cartão. Os dois botões são vermelhos lisos, com texto/ícone brancos
            // e sombra leve; a sombra do Android é a elevação, que precisa do fundo na própria View.
            Platform.OS === 'android' && {
              backgroundColor: colors.primary,
              borderWidth: 0,
              elevation: 3,
            },
          ]}
        >
          {Platform.OS === 'ios' ? <GlassBlur radius={999} /> : null}
          {label}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Digita só números e o app põe os dois pontos: 0930 -> 09:30. */
function maskTime(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

type TaskGroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'flat';

type TaskGroup = { key: TaskGroupKey; title: string; tone?: 'danger'; tasks: PlannerTask[] };

/**
 * Separa as tarefas abertas por prazo: Atrasadas, Hoje, Amanhã, Próximos dias, Depois e Sem data.
 * Se nenhuma tarefa tem data, devolve um grupo só, sem título (lista simples).
 */
function groupTasksByDue(open: PlannerTask[]): TaskGroup[] {
  if (!open.some((t) => t.dueDate)) {
    return open.length ? [{ key: 'flat', title: '', tasks: open }] : [];
  }
  const today = startOfDay(new Date()).getTime();
  const DAY = 86_400_000;
  const buckets: Record<Exclude<TaskGroupKey, 'flat'>, PlannerTask[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
    none: [],
  };
  for (const t of open) {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    if (!due || Number.isNaN(due.getTime())) {
      buckets.none.push(t);
      continue;
    }
    const diff = Math.round((startOfDay(due).getTime() - today) / DAY);
    if (diff < 0) buckets.overdue.push(t);
    else if (diff === 0) buckets.today.push(t);
    else if (diff === 1) buckets.tomorrow.push(t);
    else if (diff <= 7) buckets.week.push(t);
    else buckets.later.push(t);
  }
  const byDue = (a: PlannerTask, b: PlannerTask) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return da - db || a.position - b.position;
  };
  const out: TaskGroup[] = [
    { key: 'overdue', title: 'Atrasadas', tone: 'danger', tasks: buckets.overdue.sort(byDue) },
    { key: 'today', title: 'Hoje', tasks: buckets.today.sort(byDue) },
    { key: 'tomorrow', title: 'Amanhã', tasks: buckets.tomorrow.sort(byDue) },
    { key: 'week', title: 'Próximos dias', tasks: buckets.week.sort(byDue) },
    { key: 'later', title: 'Depois', tasks: buckets.later.sort(byDue) },
    {
      key: 'none',
      title: 'Sem data',
      tasks: buckets.none.sort((a, b) =>
        a.starred !== b.starred ? (a.starred ? -1 : 1) : a.position - b.position,
      ),
    },
  ];
  return out.filter((g) => g.tasks.length > 0);
}

// Android: liga as animações de layout (a lista desliza quando a tarefa muda de lugar).
if (Platform.OS === 'android') {
  (UIManager as any).setLayoutAnimationEnabledExperimental?.(true);
}

// Sem efeito de mola: ela passa do ponto e volta, e dava a sensação de a página «abaixar».
const TASK_MOVE_ANIMATION = {
  duration: 240,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

const WEEK_ROW_H = 94;
const MONTH_HEAD_H = 56;
const MONTHS_BEFORE = 12;
const MONTHS_AFTER = 36;
const MAX_PILLS = 3;
const HOLIDAY_BG = 'rgba(22,163,74,0.16)';
const HOLIDAY_FG = '#15803d';

type MonthBlock = {
  key: string;
  year: number;
  month: number;
  weeks: (Date | null)[][];
  height: number;
  offset: number;
};

/** Meses em sequência (segunda-feira primeiro), com altura e posição fixas para a rolagem contínua. */
function buildMonthBlocks(base: Date): MonthBlock[] {
  const blocks: MonthBlock[] = [];
  let offset = 0;
  for (let i = -MONTHS_BEFORE; i <= MONTHS_AFTER; i++) {
    const first = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let k = 0; k < startPad; k++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(first.getFullYear(), first.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let k = 0; k < cells.length; k += 7) weeks.push(cells.slice(k, k + 7));
    const height = MONTH_HEAD_H + weeks.length * WEEK_ROW_H;
    blocks.push({
      key: `${first.getFullYear()}-${first.getMonth()}`,
      year: first.getFullYear(),
      month: first.getMonth(),
      weeks,
      height,
      offset,
    });
    offset += height;
  }
  return blocks;
}

export default function AgendaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { user: meUser } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  // Duas páginas: a rota «Tarefas» abre as listas de tarefas; «Agenda» abre o calendário.
  const mode: Mode = route.name === 'Tarefas' ? 'tasks' : 'agenda';
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [eventModal, setEventModal] = useState<null | {
    mode: 'create' | 'edit';
    event?: PlannerEvent;
  }>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventDate, setEventDate] = useState(() => formatDateValue(new Date()));
  const [eventEndDate, setEventEndDate] = useState(() => formatDateValue(new Date()));
  const [eventAllDay, setEventAllDay] = useState(false);
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('10:00');
  const [eventColor, setEventColor] = useState(EVENT_COLORS[0]);
  const [eventIcon, setEventIcon] = useState<string | null>(null);
  const [eventAttendees, setEventAttendees] = useState<PlannerEventAttendee[]>([]);
  const [eventAtaName, setEventAtaName] = useState<string | null>(null);
  const [eventAtaUrl, setEventAtaUrl] = useState<string | null>(null);
  const [pendingAta, setPendingAta] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [removeAtaOnSave, setRemoveAtaOnSave] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newListTitle, setNewListTitle] = useState('');
  const [listModalOpen, setListModalOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  /** Filtro vindo dos cartões da tela inicial (Hoje, Atrasadas, Destacadas, Pendentes). */
  const routeFilter = (route.params as { filter?: 'today' | 'overdue' | 'starred' | 'all' } | undefined)?.filter;
  const [smartFilter, setSmartFilter] = useState<'today' | 'overdue' | 'starred' | 'all' | null>(routeFilter ?? null);
  useEffect(() => {
    setSmartFilter(routeFilter ?? null);
  }, [routeFilter]);
  const doneRot = useRef(new Animated.Value(0)).current;
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [taskNotes, setTaskNotes] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [taskTime, setTaskTime] = useState('');
  const [taskListId, setTaskListId] = useState<string | null>(null);
  const [listEditId, setListEditId] = useState<string | null>(null);
  /** Tarefas marcadas há instantes: aparecem concluídas (riscadas) antes de deslizar para a seção. */
  const [completingIds, setCompletingIds] = useState<string[]>([]);

  // Busca o mês visível e os vizinhos, para a rolagem contínua não ficar vazia.
  const span = 1;
  const rangeFrom = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() - span, 1));
  const rangeTo = endOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + span, 1));
  const { height: winH } = useWindowDimensions();
  const monthsBase = useMemo(() => startOfMonth(new Date()), []);
  const monthBlocks = useMemo(() => buildMonthBlocks(monthsBase), [monthsBase]);
  const monthListRef = useRef<FlatList<MonthBlock>>(null);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const eventsQuery = useQuery({
    queryKey: ['planner-events', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () => fetchPlannerEvents(rangeFrom, rangeTo),
    enabled: mode === 'agenda',
    placeholderData: keepPreviousData,
  });

  const gestaoOsQuery = useQuery({
    queryKey: ['gestao-os-agenda', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () => fetchGestaoOsAgenda(rangeFrom, rangeTo),
    enabled: mode === 'agenda',
    placeholderData: keepPreviousData,
  });

  const holidaysQuery = useQuery({
    queryKey: ['agenda-holidays', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () => fetchHolidays(rangeFrom, rangeTo),
    enabled: mode === 'agenda',
    placeholderData: keepPreviousData,
    staleTime: 6 * 60 * 60 * 1000,
  });
  const holidays = holidaysQuery.data;

  // ---- Google Agenda (mesma ligação do site) ----
  const googleStatusQuery = useQuery({
    queryKey: ['planner-events', 'google-status'],
    queryFn: fetchGoogleCalendarStatus,
    enabled: mode === 'agenda',
    staleTime: 60_000,
  });
  const googleStatus = googleStatusQuery.data;
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const awaitingGoogle = useRef(false);

  const runGoogleSync = useCallback(
    async (quiet = false) => {
      setSyncingGoogle(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 30);
        const to = new Date();
        to.setDate(to.getDate() + 120);
        const r = await syncGoogleCalendar(from, to);
        await queryClient.invalidateQueries({ queryKey: ['planner-events'] });
        if (!quiet) {
          Toast.show({
            type: 'success',
            text1: 'Google Agenda sincronizado',
            text2: `${r.imported} novos, ${r.updated} atualizados`,
          });
        }
      } catch (e: any) {
        Toast.show({ type: 'error', text1: e?.message || 'Erro ao sincronizar o Google Agenda' });
      } finally {
        setSyncingGoogle(false);
      }
    },
    [queryClient],
  );

  const connectGoogle = useCallback(async () => {
    try {
      // Pergunta de novo ao servidor na hora: não decide pelo estado antigo (que pode ter falhado ao carregar).
      const fresh = await googleStatusQuery.refetch();
      if (fresh.isError || !fresh.data) {
        Toast.show({
          type: 'error',
          text1: 'Não consegui falar com o servidor',
          text2: 'Verifique a internet e tente de novo.',
        });
        return;
      }
      if (!fresh.data.configured) {
        Toast.show({
          type: 'error',
          text1: 'Google Agenda ainda não foi configurado no servidor',
          text2: 'Peça para o time de TI ativar a integração.',
        });
        return;
      }
      const url = await fetchGoogleCalendarAuthUrl();
      awaitingGoogle.current = true;
      await Linking.openURL(url);
    } catch (e: any) {
      awaitingGoogle.current = false;
      Toast.show({ type: 'error', text1: e?.message || 'Não foi possível abrir o Google' });
    }
  }, [googleStatusQuery]);

  const afterGoogleConnected = useCallback(async () => {
    awaitingGoogle.current = false;
    await googleStatusQuery.refetch();
    Toast.show({ type: 'success', text1: 'Google Agenda conectado! Sincronizando…' });
    await runGoogleSync(true);
  }, [googleStatusQuery, runGoogleSync]);

  // Volta do navegador: pelo endereço do app ou, se ele não vier, ao reabrir o aplicativo.
  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (!url.includes('googleCalendar=')) return;
      if (url.includes('googleCalendar=connected')) void afterGoogleConnected();
      else {
        awaitingGoogle.current = false;
        Toast.show({ type: 'error', text1: 'Não foi possível conectar o Google Agenda' });
      }
    };
    const sub = Linking.addEventListener('url', onUrl);
    const appSub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' || !awaitingGoogle.current) return;
      void (async () => {
        const r = await googleStatusQuery.refetch();
        if (r.data?.connected) void afterGoogleConnected();
      })();
    });
    return () => {
      sub.remove();
      appSub.remove();
    };
  }, [afterGoogleConnected, googleStatusQuery]);

  // Ao abrir a Agenda já conectada, sincroniza uma vez (no máximo a cada 5 minutos).
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || !googleStatus?.configured || !googleStatus.connected) return;
    autoSynced.current = true;
    const last = (globalThis as any).__googleAgendaSyncAt as number | undefined;
    if (last && Date.now() - last < 5 * 60_000) return;
    (globalThis as any).__googleAgendaSyncAt = Date.now();
    void runGoogleSync(true);
  }, [googleStatus?.configured, googleStatus?.connected, runGoogleSync]);

  const openGoogleMenu = () => {
    if (!googleStatus?.connected) {
      Alert.alert('Google Agenda', 'Traga os seus eventos do Google para cá.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Conectar ao Google', onPress: () => void connectGoogle() },
      ]);
      return;
    }
    Alert.alert('Google Agenda', 'Conectado à sua conta Google.', [
      { text: 'Sincronizar agora', onPress: () => void runGoogleSync() },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          try {
            await disconnectGoogleCalendar();
            await googleStatusQuery.refetch();
            Toast.show({ type: 'success', text1: 'Google Agenda desconectado' });
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha ao desconectar' });
          }
        },
      },
      { text: 'Fechar', style: 'cancel' },
    ]);
  };

  const listsQuery = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
    enabled: mode === 'tasks',
    // Mesmo prazo do resumo da tela inicial: abre já com os dados dele, sem recarregar na hora.
    staleTime: 60_000,
  });
  /** Só acende o «puxar para atualizar» quando a pessoa puxa (e não a cada recarga em segundo plano). */
  const [pullingTasks, setPullingTasks] = useState(false);

  const pickerUsersQuery = useQuery({
    queryKey: ['kanban-member-picker-users'],
    queryFn: fetchKanbanPickerUsers,
    enabled: memberPickerOpen,
    staleTime: 60_000,
  });

  const plannerEvents = eventsQuery.data?.events ?? [];
  const canWrite = eventsQuery.data?.meta?.canWrite !== false;
  const events = useMemo<PlannerEvent[]>(() => {
    const linked: PlannerEvent[] = (gestaoOsQuery.data || []).map((item) => ({
      id: item.id,
      userId: meUser?.id || '',
      title: item.title,
      description: item.description || '',
      startAt: item.startAt,
      endAt: item.endAt,
      color: item.color,
      icon: item.kind === 'plan' ? 'check' : 'wrench',
      href: item.href,
      source: item.kind === 'plan' ? 'gestao-os-plan' : 'gestao-os',
      workOrderId: item.workOrderId,
      planId: item.planId,
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.address,
    }));
    return [...plannerEvents, ...linked];
  }, [plannerEvents, gestaoOsQuery.data, meUser?.id]);
  const lists = listsQuery.data ?? [];
  const activeList: PlannerTaskList | undefined =
    lists.find((l) => l.id === activeListId) || lists[0];

  const filteredPickerUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const exclude = new Set(eventAttendees.map((a) => a.id));
    return (pickerUsersQuery.data || []).filter((u) => {
      if (exclude.has(u.id)) return false;
      if (meUser?.id && u.id === meUser.id) return false;
      if (!q) return true;
      const cpf = formatCpfDisplay(u.cpf).toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        cpf.includes(q)
      );
    });
  }, [pickerUsersQuery.data, memberSearch, eventAttendees, meUser?.id]);

  useEffect(() => {
    if (!activeListId && lists[0]?.id) setActiveListId(lists[0].id);
  }, [lists, activeListId]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    for (const ev of events) {
      const start = startOfDay(new Date(ev.startAt));
      let end = startOfDay(new Date(ev.endAt));
      if (Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) end = start;
      // Evento que termina exatamente à meia-noite não ocupa o dia seguinte.
      const endRaw = new Date(ev.endAt);
      if (
        end.getTime() > start.getTime() &&
        endRaw.getHours() === 0 &&
        endRaw.getMinutes() === 0
      ) {
        end = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      }
      let guard = 0;
      for (
        let d = new Date(start);
        d.getTime() <= end.getTime() && guard < 62;
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), guard++
      ) {
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const arr = map.get(key) || [];
        arr.push(ev);
        map.set(key, arr);
      }
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(() => {
    const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
    return (eventsByDay.get(key) || []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [eventsByDay, selectedDay]);

  /** Lista de dias (aberta ao tocar num dia): vários meses em volta, para arrastar e ver os outros dias. */
  const dayListRef = useRef<FlatList<Date>>(null);
  const listDays = useMemo(() => {
    if (!dayModalOpen) return [] as Date[];
    const from = new Date(cursor.getFullYear(), cursor.getMonth() - span, 1);
    const to = endOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + span, 1));
    const days: Date[] = [];
    for (let d = new Date(from); d <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      days.push(d);
    }
    return days;
  }, [dayModalOpen, cursor, span]);

  // Quantos dias já renderizar de cara: até o dia tocado (+ folga), para o salto ser imediato.
  const selIdx = useMemo(
    () => listDays.findIndex((d) => sameDay(d, selectedDay)),
    [listDays, selectedDay],
  );

  // A lista só aparece depois de posicionada no dia tocado (sem «correr» até ele).
  const [listReady, setListReady] = useState(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReadySoon = (ms = 70) => {
    if (readyTimer.current) clearTimeout(readyTimer.current);
    readyTimer.current = setTimeout(() => setListReady(true), ms);
  };

  useEffect(() => {
    if (!dayModalOpen) {
      setListReady(false);
      return;
    }
    const idx = listDays.findIndex((d) => sameDay(d, selectedDay));
    if (idx < 0) return;
    const t = setTimeout(() => {
      dayListRef.current?.scrollToIndex({ index: idx, animated: false });
      markReadySoon(40);
    }, 0);
    // Garantia: nunca deixa a lista escondida.
    const safety = setTimeout(() => setListReady(true), 900);
    return () => {
      clearTimeout(t);
      clearTimeout(safety);
    };
  }, [dayModalOpen, selectedDay, listDays]);

  const renderEventCard = (ev: PlannerEvent, index = 0, day?: Date) => {
    const attendees = ev.attendees || [];
    const accent = ev.color || colors.primary;
    const startLabel = formatTime(ev.startAt);
    const endLabel = formatTime(ev.endAt);
    const startMs = new Date(ev.startAt).getTime();
    const endMs = new Date(ev.endAt).getTime();
    const nowMs = Date.now();
    const ongoing =
      !Number.isNaN(startMs) && !Number.isNaN(endMs) && startMs <= nowMs && endMs >= nowMs;
    const allDayEv = startLabel === '00:00' && endLabel === '23:59';
    const startsOnDay = !day || sameDay(day, new Date(ev.startAt));
    const endsOnDay = !day || sameDay(day, new Date(ev.endAt));
    let timeTop = startLabel;
    let timeBottom = endLabel;
    if (allDayEv) {
      timeTop = 'Dia todo';
      timeBottom = '';
    } else if (!startsOnDay && !endsOnDay) {
      timeTop = 'Dia todo';
      timeBottom = '';
    } else if (!startsOnDay && endsOnDay) {
      timeTop = 'Até';
      timeBottom = endLabel;
    } else if (startsOnDay && !endsOnDay) {
      timeTop = startLabel;
      timeBottom = '';
    }

    return (
      <TouchableOpacity
        key={ev.id}
        style={[styles.eventCard, index > 0 ? styles.eventCardDivider : styles.eventCardFirst]}
        onPress={() => {
          if (ev.workOrderId || ev.planId || ev.href || canWrite) openEditEvent(ev);
        }}
        activeOpacity={0.75}
      >
        {ev.icon && PLANNER_ICON_MAP[ev.icon] ? (
          <View style={[styles.eventIconTile, { backgroundColor: `${accent}1F` }]}>
            <PlannerEventIcon icon={ev.icon} color={accent} />
          </View>
        ) : null}
        <View style={styles.eventMain}>
          <View style={styles.eventTitleRow}>
            {ev.ataFileUrl ? (
              <FileText size={13} color={colors.textSecondary} strokeWidth={2.2} />
            ) : null}
            <Text style={[styles.eventTitle, { flex: 0, flexShrink: 1 }]} numberOfLines={2}>
              {ev.title}
            </Text>
            {ongoing ? (
              <View accessibilityLabel="Em andamento" style={styles.ongoingBadge}>
                <Radio size={13} color={colors.primary} strokeWidth={2.4} />
              </View>
            ) : null}
          </View>
          {attendees.length > 0 ? (
            <Text style={styles.eventMeta} numberOfLines={1}>
              {`${attendees.length} pessoa${attendees.length === 1 ? '' : 's'}`}
            </Text>
          ) : null}
        </View>
        {ev.workOrderId && (ev.latitude != null || ev.address) ? (
          <TouchableOpacity
            onPress={() => {
              const q =
                ev.latitude != null && ev.longitude != null
                  ? `${ev.latitude},${ev.longitude}`
                  : encodeURIComponent(ev.address || '');
              void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
            }}
            style={{ padding: 6 }}
          >
            <MapPin size={16} color={accent} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.eventTimes}>
          {timeTop ? <Text style={styles.eventTimeStart}>{timeTop}</Text> : null}
          {timeBottom ? <Text style={styles.eventTimeEnd}>{timeBottom}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderListDay = ({ item: day }: { item: Date }) => {
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const list = (eventsByDay.get(key) || [])
      .slice()
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
    const isSelected = sameDay(day, selectedDay);
    const holiday = holidays?.get(key);
    const label = day
      .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace(/^./, (c) => c.toUpperCase());
    return (
      <View style={styles.listDay}>
        <View style={styles.listDayHead}>
          <Text style={[styles.listDayTitle, isSelected && { color: colors.primary }]}>{label}</Text>
        </View>
        {holiday ? (
          <View style={[styles.listHoliday, { backgroundColor: HOLIDAY_BG }]}>
            <Text style={[styles.listHolidayText, { color: HOLIDAY_FG }]}>{holiday}</Text>
          </View>
        ) : null}
        {list.length === 0 ? (
          holiday ? null : <Text style={styles.listDayEmpty}>Sem eventos</Text>
        ) : (
          <View style={styles.eventList}>{list.map((ev, i) => renderEventCard(ev, i, day))}</View>
        )}
      </View>
    );
  };

  const openCreateEvent = () => {
    setEventTitle('');
    setEventDesc('');
    setEventDate(formatDateValue(new Date()));
    setEventEndDate(formatDateValue(new Date()));
    setEventAllDay(false);
    setEventStart('09:00');
    setEventEnd('10:00');
    setEventColor(EVENT_COLORS[0]);
    setEventIcon(null);
    setEventAttendees([]);
    setEventAtaName(null);
    setEventAtaUrl(null);
    setPendingAta(null);
    setRemoveAtaOnSave(false);
    setMemberPickerOpen(false);
    setMemberSearch('');
    setEventModal({ mode: 'create' });
  };

  const openEditEvent = (ev: PlannerEvent) => {
    if (ev.workOrderId) {
      navigation.navigate('GestaoOsDetail', { id: ev.workOrderId });
      return;
    }
    if (ev.planId || ev.source === 'gestao-os-plan') {
      Alert.alert(
        'Plano de manutenção',
        'Este compromisso vem de um plano. Abra Planos no sistema web para editar ou gerar a OS.'
      );
      return;
    }
    setEventTitle(ev.title);
    setEventDesc(ev.description || '');
    setEventDate(formatDateValue(new Date(ev.startAt)));
    setEventEndDate(formatDateValue(new Date(ev.endAt)));
    setEventAllDay(formatTime(ev.startAt) === '00:00' && formatTime(ev.endAt) === '23:59');
    setEventStart(formatTime(ev.startAt) || '09:00');
    setEventEnd(formatTime(ev.endAt) || '10:00');
    setEventColor(ev.color || EVENT_COLORS[0]);
    setEventIcon(ev.icon || null);
    setEventAttendees(ev.attendees || []);
    setEventAtaName(ev.ataFileName || null);
    setEventAtaUrl(ev.ataFileUrl || null);
    setPendingAta(null);
    setRemoveAtaOnSave(false);
    setMemberPickerOpen(false);
    setMemberSearch('');
    setEventModal({ mode: 'edit', event: ev });
  };

  const pickAtaPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPendingAta({
        uri: asset.uri,
        name: asset.name || 'ata.pdf',
        type: asset.mimeType || 'application/pdf',
      });
      setRemoveAtaOnSave(false);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao selecionar PDF' });
    }
  };

  const saveEvent = async () => {
    const title = eventTitle.trim();
    if (!title) {
      Toast.show({ type: 'error', text1: 'Informe o título' });
      return;
    }
    setSaving(true);
    try {
      const [dy, dm, dd] = eventDate.split('-').map(Number);
      const pickedDay = new Date(dy, (dm || 1) - 1, dd || 1);
      const [ey, em, ed] = (eventEndDate || eventDate).split('-').map(Number);
      const endDay = new Date(ey, (em || 1) - 1, ed || 1);
      const startAt = toLocalIso(pickedDay, eventAllDay ? '00:00' : eventStart);
      const endAt = toLocalIso(endDay, eventAllDay ? '23:59' : eventEnd);
      if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        Toast.show({ type: 'error', text1: 'O término deve ser depois do começo' });
        setSaving(false);
        return;
      }
      const payload = {
        title,
        description: eventDesc.trim(),
        startAt,
        endAt,
        color: eventColor,
        icon: eventIcon,
        attendeeIds: eventAttendees.map((a) => a.id),
      };

      let saved: PlannerEvent;
      if (eventModal?.mode === 'edit' && eventModal.event) {
        saved = await updatePlannerEvent(eventModal.event.id, payload);
        Toast.show({ type: 'success', text1: 'Evento atualizado' });
      } else {
        saved = await createPlannerEvent(payload);
        Toast.show({ type: 'success', text1: 'Evento criado' });
      }

      if (removeAtaOnSave && saved.id) {
        saved = await deletePlannerEventAta(saved.id);
      } else if (pendingAta && saved.id) {
        saved = await uploadPlannerEventAta(saved.id, pendingAta);
      }

      setEventModal(null);
      setPendingAta(null);
      setSelectedDay(startOfDay(pickedDay));
      setCursor(startOfMonth(pickedDay));
      await queryClient.invalidateQueries({ queryKey: ['planner-events'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const assignToMe = () => {
    if (!meUser?.id) return;
    if (eventAttendees.some((a) => a.id === meUser.id)) return;
    setEventAttendees((prev) => [
      ...prev,
      {
        id: meUser.id,
        name: meUser.name,
        email: meUser.email || '',
        profilePhotoUrl: meUser.profilePhotoUrl ?? null,
      },
    ]);
  };

  const addAttendee = (user: KanbanPickerUser) => {
    setEventAttendees((prev) => {
      if (prev.some((a) => a.id === user.id)) return prev;
      return [
        ...prev,
        {
          id: user.id,
          name: user.name,
          email: user.email,
          profilePhotoUrl: user.profilePhotoUrl ?? null,
        },
      ];
    });
    setMemberPickerOpen(false);
    setMemberSearch('');
  };

  const confirmDeleteEvent = (ev: PlannerEvent) => {
    Alert.alert('Excluir evento', `Excluir "${ev.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlannerEvent(ev.id);
            Toast.show({ type: 'success', text1: 'Evento excluído' });
            setEventModal(null);
            await queryClient.invalidateQueries({ queryKey: ['planner-events'] });
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha ao excluir' });
          }
        },
      },
    ]);
  };

  /** Atualiza a tarefa na tela na hora; o servidor confirma depois (e desfaz se falhar). */
  const patchTaskInCache = (id: string, patch: Partial<PlannerTask>) => {
    queryClient.setQueryData<PlannerTaskList[]>(['planner-task-lists'], (old) =>
      (old ?? []).map((l) => ({
        ...l,
        tasks: l.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      })),
    );
  };

  const toggleTask = async (task: PlannerTask) => {
    const next = !task.completed;
    try {
      LayoutAnimation.configureNext(TASK_MOVE_ANIMATION);
      patchTaskInCache(task.id, {
        completed: next,
        completedAt: next ? new Date().toISOString() : null,
      });
      await updatePlannerTask(task.id, { completed: next });
    } catch (e: any) {
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao atualizar' });
    }
  };

  const toggleStar = async (task: PlannerTask) => {
    try {
      patchTaskInCache(task.id, { starred: !task.starred });
      await updatePlannerTask(task.id, { starred: !task.starred });
    } catch (e: any) {
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao atualizar' });
    }
  };

  const openCreateTask = () => {
    setEditingTask(null);
    setNewTaskTitle('');
    setTaskNotes('');
    setTaskDate('');
    setTaskTime('');
    setTaskListId(activeList?.id ?? null);
    setTaskSheetOpen(true);
  };

  const openEditTask = (task: PlannerTask) => {
    setEditingTask(task);
    setNewTaskTitle(task.title);
    setTaskNotes(task.notes || '');
    setTaskDate(toDateInputValue(task.dueDate));
    const t = toTimeInputValue(task.dueDate);
    setTaskTime(t && t !== '00:00' ? t : '');
    setTaskListId(task.listId);
    setTaskSheetOpen(true);
  };

  const saveTask = async () => {
    const title = newTaskTitle.trim();
    const listId = taskListId || activeList?.id;
    if (!title || !listId) return;
    let dueDate: string | null = null;
    if (taskDate) {
      const [y, m, d] = taskDate.split('-').map(Number);
      const [hh, mm] = (taskTime || '00:00').split(':').map(Number);
      dueDate = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).toISOString();
    }
    try {
      if (editingTask) {
        await updatePlannerTask(editingTask.id, {
          title,
          listId,
          notes: taskNotes.trim(),
          dueDate,
        });
      } else {
        await createPlannerTask({ title, listId, notes: taskNotes.trim(), dueDate });
      }
      setNewTaskTitle('');
      setTaskNotes('');
      setTaskSheetOpen(false);
      if (listId !== activeList?.id) setActiveListId(listId);
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
      await queryClient.invalidateQueries({ queryKey: ['planner-tasks'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao salvar a tarefa' });
    }
  };

  const removeTask = (task: PlannerTask) => {
    Alert.alert('Excluir tarefa', `Excluir "${task.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlannerTask(task.id);
            await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha ao excluir' });
          }
        },
      },
    ]);
  };

  const createList = async () => {
    const title = newListTitle.trim();
    if (!title) return;
    try {
      if (listEditId) {
        await updatePlannerTaskList(listEditId, { title });
        setListEditId(null);
        setNewListTitle('');
        setListModalOpen(false);
        await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
        Toast.show({ type: 'success', text1: 'Lista renomeada' });
        return;
      }
      const list = await createPlannerTaskList(title);
      setNewListTitle('');
      setListModalOpen(false);
      setActiveListId(list.id);
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
      Toast.show({ type: 'success', text1: 'Lista criada' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao criar lista' });
    }
  };

  const openNewList = () => {
    setListEditId(null);
    setNewListTitle('');
    setListModalOpen(true);
  };

  const openListMenu = (list: PlannerTaskList) => {
    Alert.alert(list.title, undefined, [
      {
        text: 'Renomear',
        onPress: () => {
          setListEditId(list.id);
          setNewListTitle(list.title);
          setListModalOpen(true);
        },
      },
      {
        text: 'Excluir lista',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            'Excluir lista',
            `Excluir "${list.title}" e as ${list.tasks.length} tarefa(s) dela? Isso não pode ser desfeito.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Excluir',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deletePlannerTaskList(list.id);
                    setActiveListId(null);
                    await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
                    Toast.show({ type: 'success', text1: 'Lista excluída' });
                  } catch (e: any) {
                    Toast.show({ type: 'error', text1: e?.message || 'Falha ao excluir a lista' });
                  }
                },
              },
            ],
          ),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const clearCompleted = () => {
    const done = activeList?.tasks.filter((t) => t.completed) ?? [];
    if (done.length === 0) return;
    Alert.alert(
      'Limpar concluídas',
      `Excluir as ${done.length} tarefa(s) concluída(s) desta lista?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            try {
              await Promise.all(done.map((t) => deletePlannerTask(t.id)));
              await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
            } catch (e: any) {
              Toast.show({ type: 'error', text1: e?.message || 'Falha ao limpar' });
            }
          },
        },
      ],
    );
  };

  const onRefresh = useCallback(() => {
    if (mode === 'agenda') {
      void eventsQuery.refetch();
      void gestaoOsQuery.refetch();
    } else {
      setPullingTasks(true);
      void listsQuery.refetch().finally(() => setPullingTasks(false));
    }
  }, [mode, eventsQuery, listsQuery, gestaoOsQuery]);

  /** Todas as tarefas (abertas e concluídas) que entram no filtro do bloco aberto. */
  const smartAllTasks = useMemo(() => {
    if (!smartFilter) return [] as PlannerTask[];
    const today = startOfDay(new Date()).getTime();
    return lists
      .flatMap((l) => l.tasks)
      .filter((t) => {
        if (smartFilter === 'all') return true;
        if (smartFilter === 'starred') return t.starred;
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        if (Number.isNaN(due.getTime())) return false;
        const d = startOfDay(due).getTime();
        return smartFilter === 'today' ? d === today : d < today;
      });
  }, [lists, smartFilter]);
  const smartOpenTasks = useMemo(() => smartAllTasks.filter((t) => !t.completed), [smartAllTasks]);
  // Barra de progresso: da lista aberta ou, com um bloco aberto, das tarefas daquele filtro.
  const progressTotal = smartFilter ? smartAllTasks.length : (activeList?.tasks.length ?? 0);
  const progressDone = smartFilter
    ? smartAllTasks.filter((t) => t.completed).length
    : (activeList?.tasks.filter((t) => t.completed).length ?? 0);
  const SMART_TITLES = { today: 'Hoje', overdue: 'Atrasadas', starred: 'Destacadas', all: 'Pendentes' } as const;
  const openTasks = smartFilter
    ? smartOpenTasks
    : (activeList?.tasks.filter((t) => !t.completed) ?? []);
  const doneTasks = smartFilter ? [] : (activeList?.tasks.filter((t) => t.completed) ?? []);
  const taskGroups = useMemo(() => groupTasksByDue(openTasks), [activeList, smartFilter, smartOpenTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToday = () => {
    const today = startOfDay(new Date());
    setCursor(startOfMonth(today));
    setSelectedDay(today);
    const idx = monthBlocks.findIndex(
      (m) => m.year === today.getFullYear() && m.month === today.getMonth(),
    );
    if (idx >= 0) monthListRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  /** Atualiza o mês exibido no topo conforme a rolagem. */
  const onMonthsScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y + 60;
    let idx = 0;
    for (let i = 0; i < monthBlocks.length; i++) {
      if (monthBlocks[i].offset <= y) idx = i;
      else break;
    }
    const m = monthBlocks[idx];
    const cur = cursorRef.current;
    if (m && (m.year !== cur.getFullYear() || m.month !== cur.getMonth())) {
      setCursor(new Date(m.year, m.month, 1));
    }
  };

  const renderMonth = ({ item }: { item: MonthBlock }) => {
    const todayRef = new Date();
    return (
      <View style={{ height: item.height }}>
        <View style={styles.monthBlockHead}>
          <Text style={styles.monthBlockTitle}>
            {new Date(item.year, item.month, 1).toLocaleDateString('pt-BR', {
              month: 'long',
            })}
          </Text>
        </View>
        {item.weeks.map((week, weekIdx) => (
          <View key={`w-${item.key}-${weekIdx}`} style={styles.monthWeekLine}>
            {week.map((day, dayIdx) => {
              if (!day) return <View key={`e-${weekIdx}-${dayIdx}`} style={styles.monthDayCell} />;
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
              const dayList = (eventsByDay.get(key) || [])
                .slice()
                .sort((a, b) => a.startAt.localeCompare(b.startAt));
              const selected = dayModalOpen && sameDay(day, selectedDay);
              const today = sameDay(day, todayRef);
              const holiday = holidays?.get(key);
              const slots = holiday ? MAX_PILLS - 1 : MAX_PILLS;
              const extra = dayList.length - slots;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.monthDayCell}
                  onPress={() => {
                    setSelectedDay(startOfDay(day));
                    setCursor(startOfMonth(day));
                    setDayModalOpen(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    collapsable={false}
                    style={[
                      styles.monthDayCircle,
                      today ? styles.dayToday : selected ? styles.daySelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNum,
                        today && styles.dayNumToday,
                        selected && !today && styles.dayNumSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  {holiday ? (
                    <View style={[styles.monthPill, { backgroundColor: HOLIDAY_BG }]}>
                      <Text style={[styles.monthPillText, { color: HOLIDAY_FG }]} numberOfLines={1}>
                        {holiday}
                      </Text>
                    </View>
                  ) : null}
                  {dayList.slice(0, extra > 0 ? slots - 1 : slots).map((ev) => {
                    const accent = ev.color || colors.primary;
                    return (
                      <View
                        key={ev.id}
                        style={[styles.monthPill, { backgroundColor: `${accent}26` }]}
                      >
                        <Text style={[styles.monthPillText, { color: accent }]} numberOfLines={1}>
                          {ev.title}
                        </Text>
                      </View>
                    );
                  })}
                  {extra > 0 ? <Text style={styles.monthMore}>+{extra + 1}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  // Renderizadores estáveis: o calendário e a lista só redesenham quando os dados deles mudam
  // (e não a cada toque/letra no formulário de evento).
  const renderMonthRef = useRef(renderMonth);
  renderMonthRef.current = renderMonth;
  const renderMonthStable = useCallback(
    (info: { item: MonthBlock }) => renderMonthRef.current(info),
    [],
  );
  const monthExtra = useMemo(
    () => [selectedDay, eventsByDay, dayModalOpen, holidays],
    [selectedDay, eventsByDay, dayModalOpen, holidays],
  );
  const renderListDayRef = useRef(renderListDay);
  renderListDayRef.current = renderListDay;
  const renderListDayStable = useCallback(
    (info: { item: Date }) => renderListDayRef.current(info),
    [],
  );
  const listExtra = useMemo(
    () => [eventsByDay, canWrite, holidays, selectedDay],
    [eventsByDay, canWrite, holidays, selectedDay],
  );

  return (
    <View style={styles.safe}>
      <AppHeader
        showBack
        title={mode === 'agenda' ? String(cursor.getFullYear()) : 'Tarefas'}
        onBack={() => (dayModalOpen ? setDayModalOpen(false) : navigation.goBack())}
        rightAction={
          mode === 'agenda' ? (
            canWrite ? (
              <HeaderIconButton onPress={openCreateEvent} accessibilityLabel="Novo evento">
                <Plus size={22} color={colors.text} strokeWidth={2.4} />
              </HeaderIconButton>
            ) : undefined
          ) : (
            <HeaderIconButton
              onPress={() => (activeList ? openCreateTask() : openNewList())}
              accessibilityLabel="Nova tarefa"
            >
              <Plus size={22} color={colors.text} strokeWidth={2.4} />
            </HeaderIconButton>
          )
        }
      />

      {mode === 'agenda' ? (
        <View style={[styles.body, { paddingHorizontal: 20 }]}>
          <View
            style={{ flex: 1, opacity: dayModalOpen ? 0 : 1 }}
            pointerEvents={dayModalOpen ? 'none' : 'auto'}
          >
          <View style={styles.weekRowFixed}>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <Text key={d} style={styles.weekLabel}>
                {d}
              </Text>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            <FlatList
              ref={monthListRef}
              data={monthBlocks}
              keyExtractor={(m) => m.key}
              renderItem={renderMonthStable}
              extraData={monthExtra}
              getItemLayout={(_, index) => ({
                length: monthBlocks[index].height,
                offset: monthBlocks[index].offset,
                index,
              })}
              initialScrollIndex={MONTHS_BEFORE}
              onScroll={onMonthsScroll}
              scrollEventThrottle={32}
              showsVerticalScrollIndicator={false}
              initialNumToRender={3}
              windowSize={5}
              style={styles.monthList}
            />
          </View>
          </View>

          {dayModalOpen ? (
            <View
              style={[StyleSheet.absoluteFill, { zIndex: 5, opacity: listReady ? 1 : 0 }]}
            >
              <FlatList
                ref={dayListRef}
                data={listDays}
                keyExtractor={(d) => d.toISOString()}
                renderItem={renderListDayStable}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 20 }}
                extraData={listExtra}
                initialNumToRender={Math.max(14, selIdx + 8)}
                windowSize={11}
                onScrollToIndexFailed={({ index, averageItemLength }) => {
                  dayListRef.current?.scrollToOffset({
                    offset: averageItemLength * index,
                    animated: false,
                  });
                  setTimeout(() => {
                    dayListRef.current?.scrollToIndex({ index, animated: false });
                    markReadySoon(90);
                  }, 80);
                }}
              />
            </View>
          ) : null}

          {Platform.OS === 'android' ? (
            // Android: uma barra única, escura e centralizada, com «Hoje» e o botão do Google lado a lado.
            <View style={styles.androidBarWrap} pointerEvents="box-none">
              <View style={styles.androidBar}>
                <TouchableOpacity
                  onPress={goToday}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Ir para hoje"
                  style={styles.androidBarToday}
                >
                  <Text style={styles.androidBarText}>Hoje</Text>
                </TouchableOpacity>
                <View style={styles.androidBarDivider} />
                <TouchableOpacity
                  onPress={() => (googleStatus?.connected ? void runGoogleSync() : openGoogleMenu())}
                  onLongPress={openGoogleMenu}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Atualizar com o Google Agenda"
                  style={styles.androidBarSync}
                >
                  {syncingGoogle ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <CalendarSync size={18} color="#ffffff" strokeWidth={2} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
            <FloatingGlassButton
              onPress={goToday}
              isDark={isDark}
              colors={colors}
              styles={styles}
              accessibilityLabel="Ir para hoje"
            >
              <Text style={styles.floatTodayText}>Hoje</Text>
            </FloatingGlassButton>
            <FloatingGlassButton
              side="right"
              round
              onPress={() => (googleStatus?.connected ? void runGoogleSync() : openGoogleMenu())}
              onLongPress={openGoogleMenu}
              isDark={isDark}
              colors={colors}
              styles={styles}
              accessibilityLabel="Atualizar com o Google Agenda"
            >
              {syncingGoogle ? (
                <ActivityIndicator size="small" color={isDark ? '#ffffff' : '#000000'} />
              ) : (
                <CalendarSync size={23} color={isDark ? '#ffffff' : '#000000'} strokeWidth={2} />
              )}
            </FloatingGlassButton>
            </>
          )}
        </View>
      ) : (
        <View style={styles.tkWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.tkChipsRow}
          >
            {lists.map((list) => {
              const active = !smartFilter && activeList?.id === list.id;
              const pending = list.tasks.filter((t) => !t.completed).length;
              return (
                <TouchableOpacity
                  key={list.id}
                  onPress={() => {
                    setSmartFilter(null);
                    setActiveListId(list.id);
                  }}
                  onLongPress={() => openListMenu(list)}
                  delayLongPress={400}
                  activeOpacity={0.7}
                  style={[styles.tkChip, active && styles.tkChipActive]}
                >
                  <Text style={[styles.tkChipText, active && styles.tkChipTextActive]}>
                    {list.title}
                  </Text>
                  <Text style={[styles.tkChipCount, active && styles.tkChipCountActive]}>
                    {pending}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={openNewList}
              activeOpacity={0.7}
              style={[styles.tkChip, styles.tkChipRound]}
              accessibilityLabel="Nova lista"
            >
              <Plus size={16} color={colors.textSecondary} strokeWidth={2.4} />
            </TouchableOpacity>
          </ScrollView>

          <Text style={styles.tkTitle} numberOfLines={1}>
            {smartFilter ? SMART_TITLES[smartFilter] : (activeList?.title ?? 'Tarefas')}
          </Text>
          <Text style={styles.tkSubtitle}>Organize e acompanhe o que precisa ser feito</Text>
          {progressTotal > 0 ? (
            <View style={styles.tkProgressRow}>
              <View style={styles.tkProgressTrack}>
                <View
                  style={[
                    styles.tkProgressFill,
                    {
                      width: `${Math.round((progressDone / progressTotal) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.tkProgressText}>
                {progressDone}/{progressTotal}
              </Text>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={pullingTasks}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {listsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
            ) : !activeList ? (
              <View style={styles.tkEmpty}>
                <View style={styles.tkEmptyIcon}>
                  <CheckCircle2 size={28} color={colors.textSecondary} strokeWidth={1.8} />
                </View>
                <Text style={styles.tkEmptyTitle}>Crie sua primeira lista</Text>
                <Text style={styles.tkEmptySub}>Toque no + acima para organizar suas tarefas.</Text>
              </View>
            ) : (
              <>
                {taskGroups.map((g) => (
                  <View key={g.key}>
                    {g.title ? (
                      <View style={styles.tkGroupHead}>
                        <Text
                          style={[styles.tkGroupTitle, g.tone === 'danger' && { color: colors.primary }]}
                        >
                          {g.title}
                        </Text>
                        <Text style={styles.tkGroupCount}>{g.tasks.length}</Text>
                      </View>
                    ) : null}
                    {g.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        completing={completingIds.includes(task.id)}
                        groupKey={g.key}
                        styles={styles}
                        colors={colors}
                        onOpen={() => openEditTask(task)}
                        onToggle={() => void toggleTask(task)}
                        onStar={() => void toggleStar(task)}
                        onDelete={() => removeTask(task)}
                      />
                    ))}
                  </View>
                ))}

                {openTasks.length === 0 && doneTasks.length === 0 ? (
                  <View style={styles.tkEmpty}>
                    <View style={styles.tkEmptyIcon}>
                      <CheckCircle2 size={28} color={colors.textSecondary} strokeWidth={1.8} />
                    </View>
                    <Text style={styles.tkEmptyTitle}>Tudo em dia</Text>
                    <Text style={styles.tkEmptySub}>Toque no + para adicionar uma tarefa.</Text>
                  </View>
                ) : openTasks.length === 0 ? (
                  <View style={styles.tkEmpty}>
                    <View style={styles.tkEmptyIcon}>
                      <CheckCircle2 size={28} color={colors.textSecondary} strokeWidth={1.8} />
                    </View>
                    <Text style={styles.tkEmptyTitle}>Tudo concluído</Text>
                    <Text style={styles.tkEmptySub}>Bom trabalho! Nada pendente nesta lista.</Text>
                  </View>
                ) : null}

                {doneTasks.length > 0 ? (
                  <>
                    <View style={styles.tkDoneHeadRow}>
                      <TouchableOpacity
                        style={styles.tkDoneHead}
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          }
                          Animated.timing(doneRot, {
                            toValue: doneOpen ? 0 : 1,
                            duration: 220,
                            useNativeDriver: true,
                          }).start();
                          setDoneOpen((v) => !v);
                        }}
                        activeOpacity={1}
                      >
                        <Animated.View
                          style={{
                            transform: [
                              {
                                rotate: doneRot.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0deg', '90deg'],
                                }),
                              },
                            ],
                          }}
                        >
                          <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2.4} />
                        </Animated.View>
                        <Text style={styles.tkDoneHeadText}>Concluídas</Text>
                        <View style={styles.tkDoneBadge}>
                          <Text style={styles.tkDoneBadgeText}>{doneTasks.length}</Text>
                        </View>
                      </TouchableOpacity>
                      {doneOpen ? (
                        <TouchableOpacity onPress={clearCompleted} hitSlop={8}>
                          <Text style={styles.tkClearText}>Limpar</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {doneOpen
                      ? doneTasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            groupKey="flat"
                            styles={styles}
                            colors={colors}
                            onOpen={() => openEditTask(task)}
                            onToggle={() => void toggleTask(task)}
                            onStar={() => void toggleStar(task)}
                            onDelete={() => removeTask(task)}
                          />
                        ))
                      : null}
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* Eventos do dia: abre ao tocar num dia do calendário */}
      {/* Evento: folha padrão do app (fundo só com fade, folha sobe sozinha) */}
      <KanbanSheet
        visible={!!eventModal}
        onClose={() => setEventModal(null)}
        title={eventModal?.mode === 'edit' ? 'Editar evento' : 'Novo evento'}
        leftHeader
      >
        <ScrollView
          style={{ maxHeight: winH * 0.7 }}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formField}>
            <FormFieldLabel label="Título" required style={styles.sheetLabel} />
            <TextInput
              value={eventTitle}
              onChangeText={setEventTitle}
              placeholder="Ex.: Reunião de obra"
              placeholderTextColor={colors.textSecondary}
              style={[styles.sheetInput, styles.sheetInputSingle]}
            />
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Descrição" style={styles.sheetLabel} />
            <TextInput
              value={eventDesc}
              onChangeText={setEventDesc}
              placeholder="Opcional"
              placeholderTextColor={colors.textSecondary}
              style={[styles.sheetInput, { minHeight: 84, textAlignVertical: 'top' }]}
              multiline
            />
          </View>

          <View style={styles.allDayRow}>
            <Text style={styles.allDayLabel}>Dia inteiro</Text>
            <Switch
              value={eventAllDay}
              onValueChange={setEventAllDay}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <View style={styles.dateTimeRow}>
            <View style={{ flex: eventAllDay ? 1 : 1.5 }}>
              <DateField
                label="Começa em"
                required
                hideIcons
                compact
                value={eventDate}
                onChange={(v) => {
                  setEventDate(v);
                  if (!eventEndDate || eventEndDate < v) setEventEndDate(v);
                }}
              />
            </View>
            {eventAllDay ? null : (
              <View style={styles.timeCol}>
                <TimeField hideIcons value={eventStart} onChange={setEventStart} />
              </View>
            )}
          </View>
          <View style={styles.dateTimeRow}>
            <View style={{ flex: eventAllDay ? 1 : 1.5 }}>
              <DateField
                label="Termina em"
                required
                hideIcons
                compact
                value={eventEndDate}
                onChange={setEventEndDate}
              />
            </View>
            {eventAllDay ? null : (
              <View style={styles.timeCol}>
                <TimeField hideIcons value={eventEnd} onChange={setEventEnd} />
              </View>
            )}
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Ícone" style={styles.sheetLabel} />
            <View style={styles.iconRow}>
              {PLANNER_ICON_OPTIONS.map(({ id, label, Icon }) => {
                const active = eventIcon === id;
                return (
                  <Pressable
                    key={id}
                    style={({ pressed }) => [
                      styles.iconTile,
                      active && styles.iconTileActive,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setEventIcon((cur) => (cur === id ? null : id))}
                    accessibilityLabel={label}
                  >
                    <Icon
                      size={18}
                      color={active ? colors.primary : colors.textSecondary}
                      strokeWidth={2.1}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Cor" style={styles.sheetLabel} />
            <View style={styles.colorRow}>
              {EVENT_COLORS.map((c) => {
                const active = eventColor === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setEventColor(c)}
                    accessibilityLabel={`Cor ${c}`}
                    style={[styles.colorRing, active && { borderColor: c }]}
                  >
                    <View style={[styles.colorFill, { backgroundColor: c }]} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Pessoas" style={styles.sheetLabel} />
            <View style={styles.peopleActions}>
              {meUser?.id && !eventAttendees.some((a) => a.id === meUser.id) ? (
                <TouchableOpacity style={styles.assignMeBtn} onPress={assignToMe} activeOpacity={0.8}>
                  <Text style={styles.assignMeText}>Atribuir a mim</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.addPersonBtn}
                onPress={() => setMemberPickerOpen(true)}
                activeOpacity={0.7}
                accessibilityLabel="Adicionar pessoa"
              >
                <Plus size={20} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            {eventAttendees.length === 0 ? null : (
              <View style={styles.peopleList}>
                {eventAttendees.map((u) => (
                  <View key={u.id} style={styles.peopleChip}>
                    <UserAvatar
                      uri={u.profilePhotoUrl}
                      size={28}
                      backgroundColor={colors.primary}
                      iconColor="#fff"
                    />
                    <Text style={styles.peopleChipName} numberOfLines={1}>
                      {u.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setEventAttendees((prev) => prev.filter((a) => a.id !== u.id))}
                      hitSlop={8}
                    >
                      <X size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Anexo" style={styles.sheetLabel} />
            <TouchableOpacity style={styles.ataPickBtn} onPress={() => void pickAtaPdf()}>
              <Upload size={16} color={colors.primary} strokeWidth={2.2} />
              <Text style={styles.ataPickText}>{pendingAta ? 'Trocar anexo' : 'Adicionar anexo'}</Text>
            </TouchableOpacity>
            {pendingAta || (eventAtaUrl && !removeAtaOnSave) ? (
              <View style={styles.ataRow}>
                <FileText size={16} color={colors.textSecondary} />
                <Text style={styles.ataName} numberOfLines={1}>
                  {pendingAta?.name || eventAtaName || 'ata.pdf'}
                  {pendingAta ? ' (novo)' : ''}
                </Text>
                {!pendingAta && eventAtaUrl ? (
                  <TouchableOpacity
                    onPress={() => {
                      const url = resolveMediaUrl(eventAtaUrl);
                      if (url) void Linking.openURL(url);
                    }}
                    hitSlop={8}
                  >
                    <Download size={16} color={colors.primary} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    if (pendingAta) {
                      setPendingAta(null);
                    } else {
                      setRemoveAtaOnSave(true);
                      setEventAtaUrl(null);
                      setEventAtaName(null);
                    }
                  }}
                  hitSlop={8}
                >
                  <Trash2 size={15} color={colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void saveEvent()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Salvar</Text>
            )}
          </TouchableOpacity>
          {eventModal?.mode === 'edit' && eventModal.event ? (
            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={() => confirmDeleteEvent(eventModal.event!)}
            >
              <Trash2 size={16} color={colors.error} />
              <Text style={[styles.dangerBtnText, { color: colors.error }]}>Excluir</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KanbanSheet>

      {/* Adicionar pessoa: a mesma folha de seleção usada nos cards do Tasks */}
      <MemberPickerSheet
        visible={memberPickerOpen}
        onClose={() => setMemberPickerOpen(false)}
        onSelect={(u) => addAttendee(u)}
        excludeUserIds={[...eventAttendees.map((a) => a.id), ...(meUser?.id ? [meUser.id] : [])]}
        title="Adicionar pessoa"
      />

      {/* Tarefa (criar / editar): folha padrão do app */}
      <KanbanSheet
        visible={taskSheetOpen}
        onClose={() => setTaskSheetOpen(false)}
        title={editingTask ? 'Editar tarefa' : 'Nova tarefa'}
        leftHeader
      >
        <ScrollView
          style={{ maxHeight: winH * 0.68 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          <View style={styles.formField}>
            <FormFieldLabel label="Tarefa" required style={styles.sheetLabel} />
            <TextInput
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder="O que precisa ser feito?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.sheetInput, styles.sheetInputSingle]}
              autoFocus={!editingTask}
              returnKeyType="done"
            />
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Detalhes" style={styles.sheetLabel} />
            <TextInput
              value={taskNotes}
              onChangeText={setTaskNotes}
              placeholder="Opcional"
              placeholderTextColor={colors.textSecondary}
              style={[styles.sheetInput, { minHeight: 76, textAlignVertical: 'top' }]}
              multiline
            />
          </View>

          <View style={styles.formField}>
            <FormFieldLabel label="Prazo" style={styles.sheetLabel} />
            <View style={styles.tkQuickRow}>
              {(() => {
                const t0 = startOfDay(new Date());
                const tomorrow = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + 1);
                const nextMon = new Date(
                  t0.getFullYear(),
                  t0.getMonth(),
                  t0.getDate() + (((8 - t0.getDay()) % 7) || 7),
                );
                const opts: { label: string; value: string }[] = [
                  { label: 'Hoje', value: formatDateValue(t0) },
                  { label: 'Amanhã', value: formatDateValue(tomorrow) },
                  { label: 'Próx. semana', value: formatDateValue(nextMon) },
                  { label: 'Sem data', value: '' },
                ];
                return opts.map((o) => {
                  const active = taskDate === o.value;
                  return (
                    <TouchableOpacity
                      key={o.label}
                      onPress={() => {
                        setTaskDate(o.value);
                        if (!o.value) setTaskTime('');
                      }}
                      activeOpacity={0.7}
                      style={[styles.tkChip, styles.tkQuickChip, active && styles.tkChipActive]}
                    >
                      <Text style={[styles.tkChipText, active && styles.tkChipTextActive]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>
            <View style={styles.dateTimeRow}>
              <View style={{ flex: 1.5 }}>
                <DateField
                  label="Data"
                  hideIcons
                  compact
                  value={taskDate}
                  onChange={setTaskDate}
                />
              </View>
              {taskDate ? (
                <View style={styles.timeCol}>
                  <TimeField hideIcons value={taskTime} onChange={setTaskTime} />
                </View>
              ) : null}
            </View>
          </View>

          {lists.length > 1 ? (
            <View style={styles.formField}>
              <FormFieldLabel label="Lista" style={styles.sheetLabel} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {lists.map((l) => {
                    const active = (taskListId || activeList?.id) === l.id;
                    return (
                      <TouchableOpacity
                        key={l.id}
                        onPress={() => setTaskListId(l.id)}
                        activeOpacity={0.7}
                        style={[styles.tkChip, active && styles.tkChipActive]}
                      >
                        <Text style={[styles.tkChipText, active && styles.tkChipTextActive]}>
                          {l.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, !newTaskTitle.trim() && { opacity: 0.5 }]}
            onPress={() => void saveTask()}
            disabled={!newTaskTitle.trim()}
          >
            <Text style={styles.primaryBtnText}>{editingTask ? 'Salvar' : 'Adicionar'}</Text>
          </TouchableOpacity>
          {editingTask ? (
            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={() => {
                const t = editingTask;
                setTaskSheetOpen(false);
                setTimeout(() => removeTask(t), 350);
              }}
            >
              <Trash2 size={16} color={colors.error} />
              <Text style={[styles.dangerBtnText, { color: colors.error }]}>Excluir tarefa</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KanbanSheet>

      {/* Nova lista: folha padrão do app */}
      <KanbanSheet
        visible={listModalOpen}
        onClose={() => setListModalOpen(false)}
        title={listEditId ? 'Renomear lista' : 'Nova lista'}
        subtitle={listEditId ? undefined : 'Agrupe suas tarefas, por exemplo: Pessoal, Obra, Compras.'}
        leftHeader
      >
        <View style={styles.formField}>
          <FormFieldLabel label="Nome da lista" required style={styles.sheetLabel} />
          <TextInput
            value={newListTitle}
            onChangeText={setNewListTitle}
            placeholder="Ex.: Pessoal"
            placeholderTextColor={colors.textSecondary}
            style={[styles.sheetInput, styles.sheetInputSingle]}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void createList()}
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, !newListTitle.trim() && { opacity: 0.5 }]}
          onPress={() => void createList()}
          disabled={!newListTitle.trim()}
        >
          <Text style={styles.primaryBtnText}>{listEditId ? 'Salvar' : 'Criar lista'}</Text>
        </TouchableOpacity>
      </KanbanSheet>
    </View>
  );
}

/** Texto do prazo dentro do grupo: no grupo «Hoje» só a hora; nos de data, o dia curto e a hora. */
function taskDueText(task: PlannerTask, groupKey: TaskGroupKey): { text: string; overdue: boolean } | null {
  if (!task.dueDate) return null;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;
  const time = hasTime ? formatTime(task.dueDate) : '';
  const short = due.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  const weekday = due
    .toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
  const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
  switch (groupKey) {
    case 'today':
    case 'tomorrow':
      return time ? { text: time, overdue: false } : null;
    case 'overdue':
      return { text: join(short, time), overdue: true };
    case 'week':
      return { text: join(weekday, time), overdue: false };
    default:
      return { text: join(short, time), overdue: false };
  }
}

function TaskRow({
  task,
  completing = false,
  groupKey,
  styles,
  colors,
  onOpen,
  onToggle,
  onStar,
  onDelete,
}: {
  task: PlannerTask;
  completing?: boolean;
  groupKey: TaskGroupKey;
  onOpen: () => void;
  styles: ReturnType<typeof getStyles>;
  colors: { text: string; textSecondary: string; primary: string; warning: string };
  onToggle: () => void;
  onStar: () => void;
  onDelete: () => void;
}) {
  const checked = task.completed || completing;
  const due = checked ? null : taskDueText(task, groupKey);
  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onDelete}
      delayLongPress={350}
      style={({ pressed }) => [styles.tkRow, pressed && { opacity: 0.6 }]}
    >
      <TouchableOpacity
        onPress={onToggle}
        disabled={completing}
        hitSlop={10}
        activeOpacity={0.7}
        accessibilityLabel={task.completed ? 'Reabrir tarefa' : 'Concluir tarefa'}
      >
        <View style={[styles.tkCheck, checked && styles.tkCheckDone]}>
          {checked ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.tkRowTitle, checked && styles.tkRowTitleDone]}
          numberOfLines={3}
        >
          {task.title}
        </Text>
        {task.notes?.trim() ? (
          <Text style={styles.tkNotes} numberOfLines={1}>
            {task.notes.trim()}
          </Text>
        ) : null}
        {due ? (
          <Text style={[styles.tkDue, due.overdue && styles.tkDueOverdue]}>{due.text}</Text>
        ) : null}
      </View>
      {task.completed ? (
        <TouchableOpacity onPress={onDelete} hitSlop={10} accessibilityLabel="Excluir tarefa">
          <Trash2 size={16} color={colors.textSecondary} strokeWidth={1.9} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onStar} hitSlop={10} accessibilityLabel="Destacar tarefa">
          <Star
            size={18}
            color={task.starred ? colors.warning : colors.textSecondary}
            fill={task.starred ? colors.warning : 'transparent'}
            strokeWidth={2.1}
          />
        </TouchableOpacity>
      )}
    </Pressable>
  );
}

function getStyles(colors: any, isDark: boolean) {
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const selectedBg = isDark ? 'rgba(255,255,255,0.92)' : '#111827';
  const selectedFg = isDark ? '#111827' : '#fff';

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    switcher: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: 10,
      marginBottom: 8,
      padding: 4,
      borderRadius: 14,
      backgroundColor: track,
      position: 'relative',
    },
    switchPill: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: 10,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    switchBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      zIndex: 1,
    },
    switchText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    switchTextActive: { color: colors.primary, fontWeight: '600' },
    body: { flex: 1 },
    bodyPad: { paddingHorizontal: 20, paddingBottom: 40 },
    tasksScroll: { flex: 1 },
    tasksPad: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
    androidBarWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 10,
      alignItems: 'center',
      zIndex: 10,
    },
    androidBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 42,
      borderRadius: 21,
      overflow: 'hidden',
      backgroundColor: isDark ? '#374151' : '#1f2937',
      elevation: 6,
    },
    androidBarToday: { paddingLeft: 18, paddingRight: 14, height: 42, justifyContent: 'center' },
    androidBarText: { fontSize: 13, fontWeight: '700', color: '#ffffff', letterSpacing: 0.2 },
    androidBarDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.22)' },
    androidBarSync: { width: 44, height: 42, alignItems: 'center', justifyContent: 'center' },
    floatToday: {
      zIndex: 10,
      position: 'absolute',
      left: 20,
      bottom: 28,
      borderRadius: 999,
      shadowColor: '#000',
      shadowOpacity: 0.07,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    floatTodayInner: {
      paddingHorizontal: 26,
      paddingVertical: 16,
      borderRadius: 999,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)',
    },
    floatRound: {
      width: 54,
      height: 54,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    floatTodayText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    ongoingBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.2)' : 'rgba(206,55,54,0.1)',
    },
    eventMetaOngoing: { fontWeight: '600', color: colors.primary },
    eventTimes: { alignItems: 'flex-end', minWidth: 44 },
    eventTimeStart: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    eventTimeEnd: {
      marginTop: 2,
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
      opacity: 0.7,
      fontVariant: ['tabular-nums'],
    },
    listDay: { paddingTop: 14, paddingBottom: 6 },
    listDayHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingBottom: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    listDayTitle: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    listHoliday: {
      alignSelf: 'flex-start',
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: 8,
    },
    listHolidayText: { fontSize: 13, fontWeight: '700' },
    listDayEmpty: { fontSize: 13, color: colors.textSecondary, paddingVertical: 4 },
    tkWrap: { flex: 1, paddingHorizontal: 22 },
    tkTabsScroll: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    tkTabs: { gap: 22, paddingRight: 8 },
    tkTab: { paddingTop: 10, alignItems: 'center', justifyContent: 'center' },
    tkTabText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary, paddingBottom: 9 },
    tkTabTextActive: { color: colors.text },
    tkTabBar: { height: 2.5, alignSelf: 'stretch', borderRadius: 2, backgroundColor: 'transparent' },
    tkTabBarActive: { backgroundColor: colors.primary },
    tkProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 2 },
    tkProgressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)',
    },
    tkProgressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
    tkProgressText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    tkGroupHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 20, paddingBottom: 2 },
    tkGroupTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
    tkGroupCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, opacity: 0.8 },
    tkNotes: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
    tkQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    tkQuickChip: { paddingVertical: 8, paddingHorizontal: 12 },
    tkDoneHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    tkDoneBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)',
    },
    tkDoneBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    tkClearText: { fontSize: 13, fontWeight: '700', color: colors.primary, paddingTop: 14 },
    tkSubtitle: { marginTop: 4, fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    tkChipsRow: { gap: 8, paddingTop: 12, paddingBottom: 4 },
    tkChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    tkChipRound: {
      width: 36,
      height: 36,
      paddingHorizontal: 0,
      paddingVertical: 0,
      justifyContent: 'center',
      alignSelf: 'center',
    },
    tkChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tkChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    tkChipTextActive: { color: '#fff' },
    tkChipCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, opacity: 0.7 },
    tkChipCountActive: { color: 'rgba(255,255,255,0.85)', opacity: 1 },
    tkHeader: { marginTop: 18, marginBottom: 10 },
    tkTitle: { marginTop: 18, fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.9 },
    tkMeta: { marginTop: 4, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    tkAddRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tkAddInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 2 },
    tkAddSend: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tkCheck: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.75,
      borderColor: isDark ? '#6b7280' : '#c3c8d0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tkCheckDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    tkRowTitle: { fontSize: 16, lineHeight: 22, color: colors.text, fontWeight: '500' },
    tkRowTitleDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
    tkDue: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    tkDueOverdue: { color: colors.primary, fontWeight: '700' },
    tkDoneHead: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 22,
      paddingBottom: 8,
    },
    tkDoneHeadText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.2 },
    tkEmpty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
    tkEmptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    tkEmptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    tkEmptySub: { marginTop: 6, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    monthTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 4,
      marginBottom: 8,
    },
    monthTopTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.5,
      textTransform: 'capitalize',
    },
    weekRowFixed: {
      flexDirection: 'row',
      paddingBottom: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    monthList: { flex: 1 },
    monthBlockHead: {
      height: MONTH_HEAD_H,
      justifyContent: 'flex-end',
      paddingBottom: 6,
    },
    monthBlockTitle: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.text,
      textTransform: 'capitalize',
      letterSpacing: -0.8,
    },
    monthWeekLine: {
      flexDirection: 'row',
      height: WEEK_ROW_H,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    monthDayCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'stretch',
      paddingTop: 4,
      paddingHorizontal: 1,
      overflow: 'hidden',
    },
    monthDayCircle: {
      alignSelf: 'center',
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 3,
      overflow: 'hidden',
    },
    monthPill: {
      borderRadius: 5,
      paddingHorizontal: 3,
      paddingVertical: 1,
      marginTop: 2,
    },
    monthPillText: {
      fontSize: 9,
      fontWeight: '600',
    },
    monthMore: {
      marginTop: 2,
      fontSize: 9,
      fontWeight: '600',
      textAlign: 'center',
      color: colors.textSecondary,
    },
    monthNavCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 8,
      marginBottom: 12,
      padding: 6,
      paddingLeft: 4,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    monthNavGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minWidth: 0,
    },
    monthNavBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
    },
    todayBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: track,
      marginRight: 2,
    },
    todayBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    calendarCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingTop: 12,
      paddingBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    weekRow: { flexDirection: 'row', marginBottom: 8 },
    weekLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    grid: { gap: 2 },
    weekLine: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    dayCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    dayCircle: {
      width: 34,
      height: 34,
      borderRadius: 999,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayIdle: {
      backgroundColor: 'transparent',
      borderRadius: 999,
      overflow: 'hidden',
    },
    dayToday: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      overflow: 'hidden',
    },
    daySelected: {
      backgroundColor: selectedBg,
      borderRadius: 999,
      overflow: 'hidden',
    },
    dayNum: {
      fontSize: 18,
      fontWeight: '500',
      color: colors.text,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      includeFontPadding: false,
    },
    dayNumToday: { color: '#fff', fontWeight: '600' },
    dayNumSelected: { color: selectedFg, fontWeight: '600' },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
      marginTop: 3,
    },
    dotOnToday: { backgroundColor: colors.primary },
    dotSelected: { backgroundColor: selectedBg },
    dotPlaceholder: {
      width: 4,
      height: 4,
      marginTop: 3,
      opacity: 0,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 18,
      marginBottom: 12,
      gap: 8,
    },
    dayHeaderTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      textTransform: 'capitalize',
      letterSpacing: -0.2,
    },
    addChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.1)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(206,55,54,0.35)' : 'rgba(206,55,54,0.25)',
      width: 38,
      height: 38,
      borderRadius: 19,
    },
    addChipText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    empty: {
      textAlign: 'left',
      color: colors.textSecondary,
      marginTop: 8,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    eventList: { gap: 0 },
    eventCardFirst: { paddingTop: 2 },
    eventCardDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    eventCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 2,
    },
    eventTimeChip: {
      minWidth: 52,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventTimeChipText: {
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    eventMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    eventTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 19,
    },
    eventDescription: {
      marginTop: 2,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    eventIconTile: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    eventMeta: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    eventColorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    listChipsScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    listChips: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 8,
      alignItems: 'center',
    },
    listChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    listChipActive: {
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.1)',
      borderColor: isDark ? 'rgba(206,55,54,0.4)' : 'rgba(206,55,54,0.3)',
    },
    listChipText: { color: colors.text, fontWeight: '500', fontSize: 13 },
    listChipTextActive: { color: colors.primary, fontWeight: '600' },
    listChipAdd: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    addTaskRow: {
      paddingHorizontal: 20,
      marginBottom: 4,
    },
    addTaskField: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingLeft: 14,
      paddingRight: 6,
      paddingVertical: 6,
      gap: 8,
    },
    addTaskInput: {
      flex: 1,
      height: 36,
      color: colors.text,
      fontSize: 15,
      fontWeight: '500',
      padding: 0,
    },
    addTaskBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addTaskBtnDisabled: { opacity: 0.4 },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    taskRowDone: { opacity: 0.6 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    taskTitle: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
    taskDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
    taskAction: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      marginTop: 14,
      marginBottom: 8,
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: Platform.OS === 'ios' ? 28 : 20,
      maxHeight: '92%',
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalScrollPad: {
      paddingBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    input: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 15,
      marginBottom: 10,
    },
    timeRow: { flexDirection: 'row' },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 4,
    },
    formField: { marginBottom: 16 },
    dateTimeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    timeCol: { flex: 1, marginBottom: 14 },
    assignMeBtn: {
      height: 40,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    assignMeText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    addPersonBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    allDayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingVertical: 4,
    },
    allDayLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
    sheetLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 7,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelHint: { fontSize: 13, fontWeight: '600', color: colors.primary, marginBottom: 7 },
    sheetInput: {
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
      color: colors.text,
      fontSize: 16,
    },
    // Campos de uma linha: altura fixa e sem margem interna vertical, para texto e placeholder ficarem no meio.
    sheetInputSingle: { height: 52, paddingTop: 0, paddingBottom: 5, textAlignVertical: 'center' },
    iconTile: {
      width: 46,
      height: 46,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
    },
    iconTileActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.08)',
    },
    colorRing: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 2.5,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorFill: { width: 28, height: 28, borderRadius: 14 },
    pickerCard: {
      backgroundColor: isDark ? '#111827' : '#ffffff',
      borderRadius: 24,
      padding: 18,
      maxHeight: '75%',
    },
    pickerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    roundClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? '#1f2937' : '#f3f4f6',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    iconChip: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    iconChipActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.08)',
    },
    iconChipDash: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    colorDot: { width: 28, height: 28, borderRadius: 14 },
    colorDotActive: { borderWidth: 3, borderColor: '#fff', elevation: 2 },
    peopleActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    peopleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: colors.background,
    },
    peopleBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    peopleEmpty: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    peopleList: {
      gap: 8,
      marginBottom: 12,
    },
    peopleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    peopleChipName: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    ataPickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 8,
    },
    ataPickText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    ataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
      paddingHorizontal: 4,
    },
    ataName: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    pickerName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    pickerEmail: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 14,
      paddingVertical: 10,
    },
    dangerBtnText: { fontWeight: '600', fontSize: 14 },
  });
}
