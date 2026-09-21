import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  MapPin,
  QrCode,
  Search,
  Wrench,
  X,
} from 'lucide-react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useChromeScroll } from '../navigation/ChromeVisibilityContext';
import { onFabBarLongPress, onFabBarPress } from '../navigation/fabBarEvents';
import { usePermissions } from '../hooks/usePermissions';
import {
  fetchMyWorkOrders,
  fetchGestaoOsMe,
  setGestaoOsCompanyId,
  syncGestaoOsOfflineQueue,
  type GestaoOsWorkOrderMobile,
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  SAFETY_CHECK: 'Segurança',
  IN_PROGRESS: 'Em execução',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluída',
  REWORK: 'Ajuste',
  CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

type CardFilter = 'all' | 'active' | 'waiting' | 'done';

const FILTER_STATUS: Record<CardFilter, string[] | null> = {
  all: null,
  active: ['OPEN', 'UNDER_REVIEW', 'APPROVED', 'SAFETY_CHECK', 'IN_PROGRESS', 'REWORK'],
  waiting: ['WAITING_PARTS'],
  done: ['COMPLETED', 'CLOSED', 'CANCELLED'],
};

function statusColor(status: string, primary: string): string {
  switch (status) {
    case 'IN_PROGRESS':
    case 'APPROVED':
    case 'SAFETY_CHECK':
      return '#2563eb';
    case 'WAITING_PARTS':
    case 'UNDER_REVIEW':
    case 'REWORK':
      return '#d97706';
    case 'COMPLETED':
    case 'CLOSED':
      return '#16a34a';
    case 'CANCELLED':
      return '#94a3b8';
    case 'OPEN':
    default:
      return primary;
  }
}

function extractQrToken(raw: string): string {
  const value = (raw || '').trim();
  const qrMatch = value.match(/[?&]qr=([^&]+)/i);
  if (qrMatch) return decodeURIComponent(qrMatch[1]);
  const tokenMatch = value.match(/[?&]token=([^&]+)/i);
  if (tokenMatch) return decodeURIComponent(tokenMatch[1]);
  return value;
}

export default function GestaoOsListScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { scrollProps: chromeScroll, headerOffset } = useChromeScroll();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { canSeeGestaoOs, isLoading: permissionsLoading } = usePermissions();

  const [search, setSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [qrToken, setQrToken] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [followTarget, setFollowTarget] = useState<GestaoOsWorkOrderMobile | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  useEffect(() => {
    if (!permissionsLoading && !canSeeGestaoOs) {
      navigation.navigate('Home' as never);
    }
  }, [permissionsLoading, canSeeGestaoOs, navigation]);

  const openScanner = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permissão da câmera', 'Precisamos da câmera para ler o QR do ativo.');
        return;
      }
    }
    scanLockRef.current = false;
    setScannerOpen(true);
  }, [permission?.granted, requestPermission]);

  useEffect(() => {
    const sub = onFabBarPress('GestaoOs', () => {
      setActionOpen(true);
    });
    const longSub = onFabBarLongPress('GestaoOs', () => {
      setTokenOpen(true);
    });
    return () => {
      sub.remove();
      longSub.remove();
    };
  }, []);

  const onScanned = (result: BarcodeScanningResult) => {
    if (scanLockRef.current) return;
    const token = extractQrToken(result?.data ?? '');
    if (!token) return;
    scanLockRef.current = true;
    setScannerOpen(false);
    setQrToken(token);
    navigation.navigate('GestaoOsQr', { token });
  };

  const meQuery = useQuery({
    queryKey: ['gestao-os-me-mobile'],
    queryFn: fetchGestaoOsMe,
  });

  const listQuery = useQuery({
    queryKey: ['gestao-os-mine', meQuery.data?.activeCompanyId],
    enabled: !!meQuery.data,
    queryFn: fetchMyWorkOrders,
  });

  const onRefresh = useCallback(() => {
    void syncGestaoOsOfflineQueue().then(() => {
      void meQuery.refetch();
      void listQuery.refetch();
    });
  }, [meQuery, listQuery]);

  const memberships = meQuery.data?.memberships ?? [];
  const rows = (listQuery.data as GestaoOsWorkOrderMobile[]) || [];

  const canExecuteItem = useCallback(
    (item: GestaoOsWorkOrderMobile) => {
      if (!user?.id) return false;
      if (meQuery.data?.isAdmin || meQuery.data?.canAnalisar) return true;
      if (item.assigneeId === user.id) return true;
      const team = Array.isArray(item.teamUserIds) ? item.teamUserIds.map(String) : [];
      return team.includes(user.id);
    },
    [user?.id, meQuery.data?.isAdmin, meQuery.data?.canAnalisar]
  );

  const openWorkOrder = useCallback(
    (item: GestaoOsWorkOrderMobile) => {
      if (canExecuteItem(item)) {
        navigation.navigate('GestaoOsDetail', { id: item.id });
        return;
      }
      setFollowTarget(item);
    },
    [canExecuteItem, navigation]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statuses = FILTER_STATUS[cardFilter];
    return rows.filter((item) => {
      if (statuses && !statuses.includes(item.status)) return false;
      if (!q) return true;
      const hay = [
        item.osNumber != null ? `OS #${item.osNumber}` : '',
        `#${item.displayNumber}`,
        item.description,
        item.category,
        item.locationLabel || '',
        STATUS_LABEL[item.status] || item.status,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, cardFilter]);

  const chips: { key: CardFilter; label: string; count: number }[] = useMemo(() => {
    const countFor = (key: CardFilter) => {
      const statuses = FILTER_STATUS[key];
      if (!statuses) return rows.length;
      return rows.filter((r) => statuses.includes(r.status)).length;
    };
    return [
      { key: 'all', label: 'Todas', count: countFor('all') },
      { key: 'active', label: 'Em andamento', count: countFor('active') },
      { key: 'waiting', label: 'Aguardando', count: countFor('waiting') },
      { key: 'done', label: 'Histórico', count: countFor('done') },
    ];
  }, [rows]);

  const resolveToken = () => {
    const token = extractQrToken(qrToken);
    if (!token) {
      Alert.alert('Informe o token do QR');
      return;
    }
    setTokenOpen(false);
    navigation.navigate('GestaoOsQr', { token });
  };

  const listHeader = (
    <View>
      <Text style={styles.pageTitle}>Chamados</Text>
      <Text style={styles.pageSubtitle}>Acompanhe seus chamados e o histórico dos atendimentos</Text>

      {memberships.length > 1 ? (
        <View style={styles.companyRow}>
          {memberships.map((m: { companyId: string; company: { name: string } }) => {
            const active = meQuery.data?.activeCompanyId === m.companyId;
            return (
              <TouchableOpacity
                key={m.companyId}
                style={[styles.companyChip, active && styles.companyChipActive]}
                onPress={async () => {
                  await setGestaoOsCompanyId(m.companyId);
                  void meQuery.refetch();
                  void listQuery.refetch();
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.companyChipText, active && styles.companyChipTextActive]}>
                  {m.company.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {chips.map((chip) => {
          const active = cardFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setCardFilter(chip.key)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
              <Text style={[styles.chipCount, active && styles.chipCountActive]}>{chip.count}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar OS, status, local..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.listHeader}>
        <Text style={styles.listHeading}>
          {cardFilter === 'all'
            ? 'Meus Chamados'
            : chips.find((c) => c.key === cardFilter)?.label || 'Meus Chamados'}
        </Text>
        <Text style={styles.listHeadingMeta}>{filtered.length}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerOffset + 8, paddingBottom: 28 },
        ]}
        {...chromeScroll}
        refreshControl={
          <RefreshControl
            refreshing={!!listQuery.isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          listQuery.isLoading ? (
            <ActivityIndicator style={{ marginTop: 28 }} color={colors.primary} />
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Wrench size={28} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum chamado</Text>
              <Text style={styles.emptyText}>
                Chamados que você abrir ou que forem atribuídos a você aparecem aqui.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const overdue =
            !!item.dueAt &&
            new Date(item.dueAt) < new Date() &&
            !['CLOSED', 'CANCELLED', 'COMPLETED'].includes(item.status);
          const tone = overdue ? '#ef4444' : statusColor(item.status, colors.primary);
          const title =
            item.osNumber != null ? `OS #${item.osNumber}` : `Chamado #${item.displayNumber}`;
          const openedByMe = Boolean(user?.id && item.requesterId === user.id);
          const assignedToMe = Boolean(
            user?.id &&
              (item.assigneeId === user.id ||
                (Array.isArray(item.teamUserIds) && item.teamUserIds.includes(user.id)))
          );
          const roleHint =
            openedByMe && !assignedToMe
              ? 'Aberto por você'
              : assignedToMe && !openedByMe
                ? 'Para executar'
                : openedByMe && assignedToMe
                  ? 'Aberto e atribuído a você'
                  : null;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => openWorkOrder(item)}
              activeOpacity={0.85}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardNumber}>{title}</Text>
                <View style={[styles.badge, { backgroundColor: `${tone}18` }]}>
                  <Text style={[styles.badgeText, { color: tone }]}>
                    {overdue ? 'Atrasada' : STATUS_LABEL[item.status] || item.status}
                  </Text>
                </View>
              </View>
              {roleHint ? <Text style={styles.cardRole}>{roleHint}</Text> : null}
              <Text style={styles.cardRoute} numberOfLines={2}>
                {item.description || 'Sem descrição'}
              </Text>
              {item.category ? (
                <Text style={styles.cardSub} numberOfLines={1}>
                  {item.category}
                </Text>
              ) : null}
              {item.locationLabel ? (
                <View style={styles.locationRow}>
                  <MapPin size={13} color={colors.textSecondary} strokeWidth={2} />
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.locationLabel}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.cardHint}>
                {assignedToMe || meQuery.data?.canAnalisar || meQuery.data?.isAdmin
                  ? 'Toque para abrir'
                  : 'Toque para acompanhar'}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <Modal
        visible={Boolean(followTarget)}
        animationType="fade"
        transparent
        onRequestClose={() => setFollowTarget(null)}
      >
        <View style={styles.detailOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setFollowTarget(null)}
          />
          <View style={styles.detailSheet}>
            <View style={styles.detailSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailSheetTitle}>
                  {followTarget?.osNumber != null
                    ? `OS #${followTarget.osNumber}`
                    : `Chamado #${followTarget?.displayNumber ?? ''}`}
                </Text>
                <Text style={styles.detailSheetSubtitle}>
                  {followTarget
                    ? STATUS_LABEL[followTarget.status] || followTarget.status
                    : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setFollowTarget(null)}
                style={styles.formCloseBtn}
                hitSlop={6}
                accessibilityLabel="Fechar"
              >
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {followTarget ? (
              <ScrollView
                style={{ maxHeight: 420 }}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View style={styles.detailGrid}>
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text
                      style={[
                        styles.detailValue,
                        {
                          color: statusColor(followTarget.status, colors.primary),
                        },
                      ]}
                    >
                      {STATUS_LABEL[followTarget.status] || followTarget.status}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>Prioridade</Text>
                    <Text style={styles.detailValue}>
                      {PRIORITY_LABEL[followTarget.priority] || followTarget.priority}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>Categoria</Text>
                    <Text style={styles.detailValue}>{followTarget.category || '—'}</Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={styles.detailLabel}>Descrição</Text>
                    <Text style={styles.detailValue}>
                      {followTarget.description || 'Sem descrição'}
                    </Text>
                  </View>
                  {followTarget.locationLabel ? (
                    <View style={styles.detailField}>
                      <Text style={styles.detailLabel}>Local / ativo</Text>
                      <Text style={styles.detailValue}>{followTarget.locationLabel}</Text>
                    </View>
                  ) : null}
                  {followTarget.dueAt ? (
                    <View style={styles.detailField}>
                      <Text style={styles.detailLabel}>Prazo</Text>
                      <Text style={styles.detailValue}>
                        {new Date(followTarget.dueAt).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={actionOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setActionOpen(false)}
      >
        <Pressable style={styles.tokenBackdrop} onPress={() => setActionOpen(false)}>
          <Pressable style={styles.tokenSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.tokenTitle}>O que deseja fazer?</Text>
            <Text style={styles.actionHint}>Escolha como abrir o chamado</Text>
            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => {
                setActionOpen(false);
                void openScanner();
              }}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <QrCode size={20} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionOptionTitle}>Escanear QR do ativo</Text>
                <Text style={styles.actionOptionSub}>Ler o código colado no equipamento</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionOption}
              onPress={() => {
                setActionOpen(false);
                navigation.navigate('GestaoOsUnplanned');
              }}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <AlertTriangle size={20} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionOptionTitle}>Ocorrência não prevista</Text>
                <Text style={styles.actionOptionSub}>Registrar sem o QR do ativo</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancel} onPress={() => setActionOpen(false)}>
              <Text style={styles.actionCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
          />
          <View pointerEvents="none" style={styles.scannerOverlay}>
            <View
              style={[
                styles.scannerCenterBlock,
                { top: Math.max(insets.top + 24, (windowHeight - 320) / 2) },
              ]}
            >
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHint}>Aponte para o QR Code do ativo</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.scannerClose, { bottom: Math.max(insets.bottom + 28, 48) }]}
            onPress={() => setScannerOpen(false)}
          >
            <X size={22} color="#fff" />
            <Text style={styles.scannerCloseText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={tokenOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setTokenOpen(false)}
      >
        <Pressable style={styles.tokenBackdrop} onPress={() => setTokenOpen(false)}>
          <Pressable style={styles.tokenSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.tokenTitle}>Colar token do QR</Text>
            <TextInput
              value={qrToken}
              onChangeText={setQrToken}
              placeholder="Token ou link do QR"
              placeholderTextColor={colors.textSecondary}
              style={styles.tokenInput}
              autoFocus
            />
            <TouchableOpacity style={styles.tokenPrimary} onPress={resolveToken} activeOpacity={0.85}>
              <Text style={styles.tokenPrimaryText}>Abrir chamado</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTokenOpen(false)} style={styles.tokenCancel}>
              <Text style={styles.tokenCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
    scrollContent: { paddingHorizontal: 20, flexGrow: 1 },
    pageTitle: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.6,
      marginBottom: 4,
    },
    pageSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 12,
    },
    companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    companyChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    companyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    companyChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    companyChipTextActive: { color: '#fff' },
    chipsRow: { gap: 8, paddingBottom: 12 },
    chip: {
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
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    chipCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      opacity: 0.7,
    },
    chipCountActive: { color: 'rgba(255,255,255,0.85)', opacity: 1 },
    searchRow: { marginBottom: 14 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 12,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
      paddingVertical: 0,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    listHeading: { color: colors.text, fontSize: 16, fontWeight: '700' },
    listHeadingMeta: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
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
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.06)',
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 8,
    },
    cardNumber: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    badgeText: { fontSize: 11, fontWeight: '700' },
    cardRole: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    cardRoute: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 20,
      marginBottom: 6,
    },
    cardSub: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 4,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    cardMeta: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      flex: 1,
    },
    cardHint: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      marginTop: 8,
      opacity: 0.75,
    },
    scannerContainer: {
      flex: 1,
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
    },
    scannerOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    scannerCenterBlock: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerFrame: {
      width: 260,
      height: 260,
      borderWidth: 3,
      borderColor: '#fff',
      borderRadius: 20,
      backgroundColor: 'transparent',
    },
    scannerHint: {
      color: '#fff',
      marginTop: 18,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      paddingHorizontal: 24,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    scannerClose: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 22,
      paddingVertical: 14,
      borderRadius: 999,
    },
    scannerCloseText: { color: '#fff', fontWeight: '700' },
    detailOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
      padding: 16,
      paddingBottom: 28,
    },
    detailSheet: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 18,
      gap: 12,
      maxHeight: '88%',
    },
    detailSheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 4,
    },
    detailSheetTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    detailSheetSubtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    formCloseBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailGrid: { gap: 12 },
    detailField: { gap: 2 },
    detailLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    detailValue: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    tokenBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    tokenSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 28,
      gap: 12,
    },
    tokenTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
    tokenInput: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
      backgroundColor: isDark ? colors.screenRoot : colors.surface,
    },
    tokenPrimary: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    tokenPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    tokenCancel: { alignItems: 'center', paddingVertical: 8 },
    tokenCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
    actionHint: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      marginTop: -4,
      marginBottom: 4,
    },
    actionOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: isDark ? colors.screenRoot : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15, 23, 42, 0.08)',
    },
    actionIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.18)' : 'rgba(220, 38, 38, 0.1)',
    },
    actionCopy: { flex: 1, minWidth: 0 },
    actionOptionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    actionOptionSub: {
      marginTop: 2,
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    actionCancel: { alignItems: 'center', paddingVertical: 10 },
    actionCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
  });
