import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Clock, X } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

type Props = {
  label: string;
  /** Horário em `HH:mm` (vazio = sem horário). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

function parse(value: string): Date {
  const m = (value || '').match(/^(\d{1,2}):(\d{2})/);
  const d = new Date();
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  else d.setSeconds(0, 0);
  return d;
}

const format = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Campo de horário no mesmo visual do DateField (seletor nativo; no iPhone abre numa folha com "Confirmar"). */
export default function TimeField({ label, value, onChange, placeholder = '--:--' }: Props) {
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(() => parse(value));
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const openPicker = () => {
    setTemp(parse(value));
    setOpen(true);
  };

  const onNativeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'set' && selected) onChange(format(selected));
      return;
    }
    if (selected) setTemp(selected);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}>
        <TouchableOpacity style={styles.main} activeOpacity={0.75} onPress={openPicker} accessibilityRole="button">
          <Text style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Limpar horário">
            <X size={16} color={colors.textSecondary} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={openPicker} hitSlop={8} accessibilityLabel="Escolher horário">
          <Clock size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {open && Platform.OS === 'android' ? (
        <DateTimePicker
          value={temp}
          mode="time"
          is24Hour
          display="default"
          onChange={onNativeChange}
          accentColor={colors.primary}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>{label}</Text>
              <DateTimePicker
                value={temp}
                mode="time"
                is24Hour
                display="spinner"
                minuteInterval={5}
                onChange={onNativeChange}
                locale="pt-BR"
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={colors.primary}
                style={{ alignSelf: 'center' }}
              />
              <TouchableOpacity
                style={styles.confirm}
                activeOpacity={0.85}
                onPress={() => {
                  onChange(format(temp));
                  setOpen(false);
                }}
              >
                <Text style={styles.confirmText}>Confirmar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: -0.1, color: colors.textSecondary },
    field: {
      minHeight: 48,
      borderRadius: 14,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
    value: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.text, fontVariant: ['tabular-nums'] },
    placeholder: { color: colors.textSecondary, fontWeight: '500' },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 28, paddingTop: 8 },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(120,120,128,0.35)',
      marginBottom: 8,
    },
    sheetTitle: {
      paddingHorizontal: 18,
      paddingBottom: 4,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: colors.text,
    },
    confirm: {
      marginHorizontal: 18,
      marginTop: 8,
      height: 50,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });
}
