import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { BellRing } from 'lucide-react-native';
import SheetModal from './SheetModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  DEFAULT_PUNCH_REMINDER_PREFS,
  LEAD_OPTIONS,
  PUNCH_KINDS,
  readPunchReminderPrefs,
  syncPunchReminders,
  writePunchReminderPrefs,
  type PunchReminderPrefs,
} from '../notifications/punchReminders';
import { punchRemindersSupported } from '../notifications/systemNotifications';

/** Texto curto para a linha do Perfil: "Desativado", "Na hora" ou "5 min antes". */
export function punchReminderSummary(prefs: PunchReminderPrefs): string {
  if (!prefs.enabled) return 'Desativado';
  return LEAD_OPTIONS.find((o) => o.value === prefs.leadMinutes)?.label ?? `${prefs.leadMinutes} min antes`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Avisa a tela de fora quando as preferências mudam (para atualizar o resumo). */
  onChange?: (prefs: PunchReminderPrefs) => void;
};

export default function PunchRemindersSheet({ visible, onClose, onChange }: Props) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [prefs, setPrefs] = useState<PunchReminderPrefs>(DEFAULT_PUNCH_REMINDER_PREFS);
  const supported = punchRemindersSupported();
  const schedule = user?.employee?.workSchedule ?? null;

  useEffect(() => {
    if (!visible || !user?.id) return;
    void readPunchReminderPrefs(user.id).then(setPrefs);
  }, [visible, user?.id]);

  const apply = async (next: PunchReminderPrefs) => {
    if (!user?.id) return;
    setPrefs(next);
    await writePunchReminderPrefs(user.id, next);
    onChange?.(next);
    const granted = await syncPunchReminders(user);
    if (!granted && next.enabled) {
      const off = { ...next, enabled: false };
      setPrefs(off);
      await writePunchReminderPrefs(user.id, off);
      onChange?.(off);
      Alert.alert(
        'Notificações desativadas',
        'Para receber os lembretes, permita as notificações do app nas configurações do celular.',
      );
    }
  };

  const hours = (value?: string) => (value ? value.slice(0, 5) : '--:--');
  const trackColor = { false: isDark ? '#374151' : '#d1d5db', true: '#fca5a5' };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title="Lembretes de ponto"
      subtitle="Um aviso para você não esquecer de bater o ponto"
      icon={BellRing}
    >
      {!supported ? (
        <Text style={styles.note}>
          Os lembretes funcionam no aplicativo instalado no celular. Neste modo de teste eles não estão disponíveis.
        </Text>
      ) : null}

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Avisar para bater o ponto</Text>
            <Text style={styles.rowSub}>
              {schedule
                ? `Seu horário: ${hours(schedule.startTime)} às ${hours(schedule.endTime)}`
                : 'Seu horário de trabalho não está cadastrado'}
            </Text>
          </View>
          <Switch
            value={prefs.enabled}
            disabled={!supported}
            onValueChange={(enabled) => void apply({ ...prefs, enabled })}
            trackColor={trackColor}
            thumbColor={prefs.enabled ? colors.primary : '#f4f4f5'}
          />
        </View>
      </View>

      {prefs.enabled ? (
        <>
          <Text style={styles.sectionTitle}>Quando avisar</Text>
          <View style={styles.chips}>
            {LEAD_OPTIONS.map((opt) => {
              const active = prefs.leadMinutes === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.75}
                  onPress={() => void apply({ ...prefs, leadMinutes: opt.value })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>Quais batidas</Text>
          <View style={styles.card}>
            {PUNCH_KINDS.map((kind, index) => (
              <View key={kind.type} style={[styles.row, index > 0 && styles.rowDivider]}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{kind.label}</Text>
                  <Text style={styles.rowSub}>{hours(schedule?.[kind.scheduleKey])}</Text>
                </View>
                <Switch
                  value={prefs[kind.pref]}
                  onValueChange={(value) => void apply({ ...prefs, [kind.pref]: value })}
                  trackColor={trackColor}
                  thumbColor={prefs[kind.pref] ? colors.primary : '#f4f4f5'}
                />
              </View>
            ))}
          </View>

          <Text style={styles.note}>
            O aviso é enviado de segunda a sexta (ou nos dias do seu horário). Se você já bateu o ponto, o aviso daquela
            batida não toca. Feriados e férias não são considerados.
          </Text>
        </>
      ) : null}
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
    sectionTitle: {
      marginTop: 18,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
    chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
    chipTextActive: { color: colors.primary },
  });
}
