import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SheetModal, { SheetPrimaryButton } from '../SheetModal';
import { useTheme } from '../../context/ThemeContext';
import { NO_ACTIVITY_REASONS, REASON_SEP, splitReasons } from '../../services/diarioObra';

type Props = {
  visible: boolean;
  dateLabel: string;
  initialReason: string;
  initialNote: string;
  onClose: () => void;
  onConfirm: (reason: string, note: string) => void;
};

/** Marca o dia como "sem atividade": escolher um ou mais motivos e, se quiser, deixar uma nota. */
export default function RdoNoActivitySheet({
  visible,
  dateLabel,
  initialReason,
  initialNote,
  onClose,
  onConfirm,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    setReasons(splitReasons(initialReason));
    setNote(initialNote);
  }, [visible, initialReason, initialNote]);

  const toggle = (label: string) =>
    setReasons((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]));

  const chip = (label: string) => {
    const active = reasons.includes(label);
    return (
      <TouchableOpacity
        key={label}
        style={[styles.chip, active && styles.chipActive]}
        activeOpacity={0.75}
        onPress={() => toggle(label)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Sem atividade" size="tall">
      <Text style={styles.sub}>RDO de {dateLabel}. Escolha um ou mais motivos.</Text>

      {NO_ACTIVITY_REASONS.map(({ group, options }) => (
        <View key={group} style={styles.group}>
          <Text style={styles.groupTitle}>{group}</Text>
          <View style={styles.chips}>{options.map(chip)}</View>
        </View>
      ))}
      <View style={styles.group}>
        <Text style={styles.groupTitle}>Outros</Text>
        <View style={styles.chips}>{chip('Outro')}</View>
      </View>

      <Text style={[styles.groupTitle, { marginTop: 18 }]}>Nota</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Detalhes sobre o motivo"
        placeholderTextColor={colors.textSecondary}
        multiline
        style={styles.textarea}
        textAlignVertical="top"
      />

      <View style={styles.action}>
        <SheetPrimaryButton
          label="Confirmar"
          disabled={reasons.length === 0}
          onPress={() => onConfirm(reasons.join(REASON_SEP), note.trim())}
        />
      </View>
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    sub: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.textSecondary, marginBottom: 6 },
    group: { marginTop: 14 },
    groupTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    textarea: {
      minHeight: 88,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    action: { marginTop: 18, paddingBottom: 6 },
  });
}
