import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import SheetModal from './SheetModal';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  fetchNotificationPrefs,
  saveNotificationPref,
  type NotificationPref,
} from '../services/notificationPrefs';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Liga/desliga cada tipo de notificação do app, uma por uma. */
export default function NotificationPrefsSheet({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { canSeeAprovacoes, canSeeCombustivel, canSeeReservas, canSeeDpRequests, canSeeGestaoOs } =
    usePermissions();
  const [items, setItems] = useState<NotificationPref[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setFailed(false);
    fetchNotificationPrefs()
      .then(setItems)
      .catch(() => setFailed(true));
  }, [visible]);

  // Só mostra os avisos das áreas que a pessoa tem acesso no app.
  const allowed: Record<string, boolean> = {
    approvals: canSeeAprovacoes,
    fuel: canSeeCombustivel,
    reservation: canSeeReservas,
    dp: canSeeDpRequests,
    'dp-messages': canSeeDpRequests,
    accounting: canSeeDpRequests,
    workorder: canSeeGestaoOs,
  };
  const visibleItems = items?.filter((i) => allowed[i.key] ?? true) ?? null;

  const toggle = async (key: string, enabled: boolean) => {
    setItems((prev) => prev?.map((i) => (i.key === key ? { ...i, enabled } : i)) ?? prev);
    try {
      await saveNotificationPref(key, enabled);
    } catch {
      setItems((prev) => prev?.map((i) => (i.key === key ? { ...i, enabled: !enabled } : i)) ?? prev);
      Alert.alert('Não foi possível salvar', 'Verifique sua conexão e tente de novo.');
    }
  };

  const trackColor = { false: isDark ? '#4b5563' : '#d1d5db', true: '#fca5a5' };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title="Notificações"
      subtitle="Escolha quais avisos você quer receber"
      icon={Bell}
    >
      {failed ? (
        <Text style={styles.note}>Não foi possível carregar suas preferências. Tente novamente mais tarde.</Text>
      ) : !visibleItems ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
      ) : (
        <View style={styles.card}>
          {visibleItems.map((item, index) => (
            <View key={item.key} style={[styles.row, index > 0 && styles.rowDivider]}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.label}</Text>
                <Text style={styles.rowSub}>{item.description}</Text>
              </View>
              <Switch
                value={item.enabled}
                onValueChange={(v) => void toggle(item.key, v)}
                trackColor={trackColor}
                thumbColor={item.enabled ? colors.primary : isDark ? '#9ca3af' : '#f4f4f5'}
              />
            </View>
          ))}
        </View>
      )}
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    note: { fontSize: 13, lineHeight: 19, fontWeight: '500', color: colors.textSecondary, marginTop: 12 },
    card: {
      backgroundColor: colors.card ?? colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      marginTop: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
    rowSub: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  });
}
