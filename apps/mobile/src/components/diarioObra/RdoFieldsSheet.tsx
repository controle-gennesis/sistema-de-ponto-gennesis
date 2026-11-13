import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import SheetModal, { SheetPrimaryButton } from '../SheetModal';
import FormFieldLabel from '../FormFieldLabel';
import TimeField from '../TimeField';
import { useTheme } from '../../context/ThemeContext';
import type { Field, Row, SectionConfig } from '../../services/diarioObra';

type Props = {
  visible: boolean;
  config: SectionConfig;
  /** Linha em edição; `null` para um lançamento novo. */
  initial: Row | null;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
  onDelete?: () => void;
};

function initialValues(config: SectionConfig, initial: Row | null): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of config.fields) {
    const cur = initial?.[f.key];
    v[f.key] = cur !== undefined && cur !== null ? String(cur) : (f.defaultValue ?? '');
  }
  return v;
}

/** Folha de lançamento do RDO: monta os campos de qualquer seção a partir da configuração dela. */
export default function RdoFieldsSheet({ visible, config, initial, onClose, onSave, onDelete }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(config, initial));

  useEffect(() => {
    if (visible) setValues(initialValues(config, initial));
  }, [visible, config, initial]);

  const missing = config.fields.some((f) => f.required && !values[f.key]?.trim());
  const set = (key: string, v: string) => setValues((cur) => ({ ...cur, [key]: v }));

  const renderInput = (f: Field) => {
    const value = values[f.key] ?? '';
    if (f.type === 'time') {
      return <TimeField label={f.label} value={value} onChange={(v) => set(f.key, v)} />;
    }
    return (
      <View>
        <FormFieldLabel label={f.label} required={f.required} style={styles.label} />
        {f.type === 'select' ? (
          <View style={styles.chips}>
            {(f.options ?? []).map((o) => {
              const active = value === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  style={[styles.chip, active && styles.chipActive]}
                  activeOpacity={0.75}
                  onPress={() => set(f.key, o.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TextInput
            value={value}
            onChangeText={(t) => set(f.key, f.type === 'number' ? t.replace(/[^0-9.,]/g, '') : t)}
            placeholder={f.placeholder}
            placeholderTextColor={colors.textSecondary}
            multiline={f.type === 'textarea'}
            keyboardType={f.type === 'number' ? 'decimal-pad' : 'default'}
            style={[styles.input, f.type === 'textarea' && styles.textarea]}
            textAlignVertical={f.type === 'textarea' ? 'top' : 'center'}
          />
        )}
      </View>
    );
  };

  // Campos "half" ficam lado a lado, dois por linha.
  const rows: Field[][] = [];
  for (const f of config.fields) {
    const last = rows[rows.length - 1];
    if (f.half && last && last.length === 1 && last[0].half) last.push(f);
    else rows.push([f]);
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title={initial ? config.editTitle : config.sheetTitle}>
      <View style={styles.form}>
        {rows.map((group) => (
          <View key={group.map((f) => f.key).join('|')} style={styles.row}>
            {group.map((f) => (
              <View key={f.key} style={styles.cell}>
                {renderInput(f)}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.actions}>
          <SheetPrimaryButton label="Salvar" disabled={missing} onPress={() => onSave(values)} />
          {initial && onDelete ? (
            <TouchableOpacity style={styles.delete} activeOpacity={0.7} onPress={onDelete}>
              <Trash2 size={18} color="#dc2626" strokeWidth={2.2} />
              <Text style={styles.deleteText}>Excluir lançamento</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    form: { gap: 16, paddingBottom: 4 },
    row: { flexDirection: 'row', gap: 12 },
    cell: { flex: 1 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: -0.1, color: colors.textSecondary },
    input: {
      minHeight: 48,
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
    textarea: { minHeight: 96 },
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
    actions: { marginTop: 4, gap: 6 },
    delete: {
      height: 48,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    deleteText: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
  });
}
