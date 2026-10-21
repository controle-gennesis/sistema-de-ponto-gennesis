import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Bell, CalendarClock, Fuel, FileText, Wrench, Trash2 } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import {
  ActivityNotification,
  activityTabRoute,
  activitySubtitle,
  formatRelativeTime,
} from '../notifications/activityStorage';

const BRAND = '#ce3736';
const SHEET_BOTTOM_PAD = Platform.OS === 'ios' ? 26 : 18;

/** Mesmo estilo da folha de "Esqueceu a senha": colada no fim, cantos de 28, ícone + título centrados. */
export default function NotificationsSheet() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { notifications, sheetVisible, closeSheet, markAsRead, removeNotification } =
    useNotifications();

  const C = useMemo(
    () => ({
      sheet: isDark ? '#111827' : '#ffffff',
      title: isDark ? '#f9fafb' : '#111827',
      body: isDark ? '#9ca3af' : '#6b7280',
      cardBg: isDark ? '#1f2937' : '#ffffff',
      cardBorder: isDark ? '#374151' : '#e5e7eb',
      accent: isDark ? '#f87171' : BRAND,
      accentSoft: isDark ? 'rgba(248,113,113,0.14)' : 'rgba(206,55,54,0.1)',
      closeBg: isDark ? '#1f2937' : '#f3f4f6',
      iconStrong: isDark ? '#d1d5db' : '#52525b',
    }),
    [isDark],
  );
  const styles = useMemo(() => getStyles(C), [C]);

  // Entrada/saída: fundo só faz fade e a folha sobe sozinha (igual ao "Esqueceu a senha").
  const [mounted, setMounted] = useState(sheetVisible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const canDismissRef = useRef(false);

  useEffect(() => {
    if (sheetVisible) {
      setMounted(true);
      canDismissRef.current = false;
      const t = setTimeout(() => {
        canDismissRef.current = true;
      }, 350);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return () => clearTimeout(t);
    }
    canDismissRef.current = false;
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [sheetVisible, backdrop, slide]);

  const requestClose = () => {
    if (!canDismissRef.current) return;
    closeSheet();
  };

  const openItem = (item: ActivityNotification) => {
    markAsRead(item.id);
    closeSheet();
    setTimeout(() => {
      const screen = activityTabRoute(item.kind);
      navigation.navigate('Main', { screen });
    }, 220);
  };

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={closeSheet}>
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
        <Animated.View
          style={{
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [620, 0] }) },
            ],
          }}
        >
          <View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SHEET_BOTTOM_PAD) }]}
          >
            <View style={styles.hero}>
              <View style={styles.heroIcon}>
                <Bell size={26} color={C.accent} strokeWidth={2.1} />
              </View>
              <Text style={styles.title}>Notificações</Text>
              <Text style={styles.subtitle}>
                {notifications.length === 0
                  ? 'Tudo em dia! Quando o status de uma solicitação mudar, aparece aqui.'
                  : unread > 0
                    ? unread === 1
                      ? '1 notificação nova'
                      : `${unread} notificações novas`
                    : 'Acompanhe as atualizações das suas solicitações.'}
              </Text>
            </View>

          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={
              notifications.length === 0 ? styles.emptyWrap : styles.listContent
            }
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isNew = !item.read;
              const subtitle = activitySubtitle(item);
              return (
                <View
                  style={[
                    styles.item,
                    {
                      backgroundColor: C.cardBg,
                      borderColor: isNew ? 'rgba(206,55,54,0.35)' : C.cardBorder,
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.itemMain}
                    onPress={() => openItem(item)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.itemIconWrap}>
                      <View style={[styles.itemIcon, { backgroundColor: C.accentSoft }]}>
                        {item.kind === 'fuel' ? (
                          <Fuel size={19} color={C.accent} strokeWidth={2.1} />
                        ) : item.kind === 'workorder' ? (
                          <Wrench size={19} color={C.accent} strokeWidth={2.1} />
                        ) : item.kind === 'dp' ? (
                          <FileText size={19} color={C.accent} strokeWidth={2.1} />
                        ) : (
                          <CalendarClock size={19} color={C.accent} strokeWidth={2.1} />
                        )}
                      </View>
                      {isNew ? (
                        <View style={[styles.unreadDot, { backgroundColor: C.accent, borderColor: C.cardBg }]} />
                      ) : null}
                    </View>
                    <View style={styles.itemBody}>
                      <Text
                        style={[styles.itemTitle, { color: C.title }]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={[styles.itemBodyText, { color: C.body }]}
                        numberOfLines={2}
                      >
                        {subtitle}
                      </Text>
                      <Text style={[styles.itemTime, { color: C.body }]}>
                        {formatRelativeTime(item.detectedAt || item.updatedAt)}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => removeNotification(item.id)}
                    style={[styles.deleteBtn, { backgroundColor: C.closeBg }]}
                    hitSlop={8}
                    accessibilityLabel="Apagar notificação"
                  >
                    <Trash2 size={15} color={C.body} strokeWidth={2.1} />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const getStyles = (C: {
  sheet: string;
  title: string;
  body: string;
  cardBg: string;
  cardBorder: string;
  accent: string;
  accentSoft: string;
  closeBg: string;
}) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 22,
      paddingHorizontal: 22,
      maxHeight: Dimensions.get('window').height * 0.82,
    },
    hero: { alignItems: 'center', marginBottom: 18 },
    heroIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: { fontSize: 22, fontWeight: '700', color: C.title, letterSpacing: -0.3 },
    subtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: C.body,
      textAlign: 'center',
      paddingHorizontal: 6,
    },
    list: { flexGrow: 0 },
    listContent: { gap: 10, paddingBottom: 6 },
    emptyWrap: { paddingBottom: 4 },
    empty: { alignItems: 'center', paddingHorizontal: 28 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 18 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      paddingVertical: 12,
      paddingLeft: 12,
      paddingRight: 12,
      borderWidth: 1,
    },
    itemMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemIconWrap: { width: 42, height: 42 },
    itemIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadDot: {
      position: 'absolute',
      top: -3,
      right: -3,
      width: 11,
      height: 11,
      borderRadius: 6,
      borderWidth: 2,
    },
    itemBody: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 3 },
    itemTitle: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
    itemBodyText: { fontSize: 12.5, fontWeight: '500', lineHeight: 17, marginBottom: 4 },
    newBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 1 },
    newBadgeText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    itemTime: { fontSize: 11, fontWeight: '600' },
    deleteBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
