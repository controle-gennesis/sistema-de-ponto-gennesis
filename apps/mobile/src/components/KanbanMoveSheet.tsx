import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import SheetModal, { SheetPrimaryButton } from './SheetModal';
import FormFieldLabel from './FormFieldLabel';
import { useTheme } from '../context/ThemeContext';

type Column = { id: string; title: string; color?: string | null; cards?: unknown[] | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  columns: Column[];
  currentColumnId: string;
  onMove: (columnId: string) => Promise<void> | void;
};

/** "Mover card" no padrão de formulário: campo de seleção da coluna e botão principal. */
export default function KanbanMoveSheet({ visible, onClose, columns, currentColumnId, onMove }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [columnId, setColumnId] = useState(currentColumnId);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setColumnId(currentColumnId);
    setPicking(false);
    setSaving(false);
  }, [visible, currentColumnId]);

  const selected = columns.find((c) => c.id === columnId) ?? null;

  const confirm = async () => {
    setSaving(true);
    try {
      await onMove(columnId);
    } finally {
      setSaving(false);
    }
  };

  if (picking) {
    return (
      <SheetModal visible={visible} onClose={onClose} onBack={() => setPicking(false)} title="Escolher coluna">
        <View style={styles.list}>
          {columns.map((col) => {
            const active = col.id === columnId;
            return (
              <TouchableOpacity
                key={col.id}
                style={[styles.option, active && styles.optionActive]}
                activeOpacity={0.75}
                onPress={() => {
                  setColumnId(col.id);
                  setPicking(false);
                }}
              >
                <View style={[styles.dot, { backgroundColor: col.color || colors.primary }]} />
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle} numberOfLines={2}>
                    {col.title}
                  </Text>
                  <Text style={styles.optionSub}>
                    {(col.cards ?? []).length} {(col.cards ?? []).length === 1 ? 'card' : 'cards'}
                    {col.id === currentColumnId ? ' · coluna atual' : ''}
                  </Text>
                </View>
                {active ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </SheetModal>
    );
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title="Mover card">
      <FormFieldLabel label="Coluna" required style={styles.label} />
      <TouchableOpacity
        style={styles.field}
        activeOpacity={0.75}
        onPress={() => setPicking(true)}
        accessibilityRole="button"
      >
        <View style={styles.fieldIcon}>
          <View style={[styles.dot, { backgroundColor: selected?.color || colors.primary }]} />
        </View>
        <Text style={styles.fieldValue} numberOfLines={1}>
          {selected?.title ?? 'Selecionar coluna'}
        </Text>
        <View style={styles.fieldIcon}>
          <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </View>
      </TouchableOpacity>

      <View style={styles.action}>
        <SheetPrimaryButton
          label="Mover"
          loading={saving}
          disabled={!selected || columnId === currentColumnId}
          onPress={() => void confirm()}
        />
      </View>
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  const line = isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)';
  const fieldBg = isDark ? colors.card : colors.surface;
  return StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: -0.1, color: colors.textSecondary },
    field: {
      minHeight: 48,
      borderRadius: 14,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    fieldIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    },
    fieldValue: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
    action: { marginTop: 22, paddingBottom: 6 },
    list: { gap: 8, paddingBottom: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}0F` },
    dot: { width: 10, height: 10, borderRadius: 5 },
    optionText: { flex: 1, minWidth: 0 },
    optionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    optionSub: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  });
}
