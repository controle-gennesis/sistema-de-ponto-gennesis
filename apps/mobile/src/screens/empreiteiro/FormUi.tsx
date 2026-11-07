import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Search, X } from 'lucide-react-native';
import PickerSheetFrame from '../../components/PickerSheetFrame';
import { useTheme } from '../../context/ThemeContext';
import FormFieldLabel from '../../components/FormFieldLabel';
import { AppToastHost, formFooterBottomPad } from '../../components/AppToast';

/** Estilos dos formulários, iguais aos das telas de Abastecimento/Solicitações. */
export function useFormStyles() {
  const { colors, isDark } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        formHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 16,
        },
        formCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
        formTitle: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
        formSubtitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', marginTop: 2 },
        formScroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 28 },
        formFooter: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
        primaryBtn: {
          backgroundColor: colors.primary,
          borderRadius: 14,
          paddingVertical: 15,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
        sectionTitle: {
          color: colors.text,
          fontSize: 13,
          fontWeight: '700',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          marginTop: 10,
          marginBottom: 12,
          opacity: 0.55,
        },
        fieldLabel: {
          fontSize: 13,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: 8,
          letterSpacing: -0.1,
        },
        input: {
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
          backgroundColor: isDark ? colors.card : colors.surface,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 15,
          fontSize: 15,
          fontWeight: '500',
          color: colors.text,
          marginBottom: 14,
          letterSpacing: -0.2,
        },
        inputMultiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 14 },
        chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
        chip: {
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 9,
          borderWidth: StyleSheet.hairlineWidth * 1.5,
        },
        photoWrap: { position: 'relative', marginBottom: 10, borderRadius: 18, overflow: 'hidden' },
        photoPreview: { width: '100%', height: 200, borderRadius: 18, backgroundColor: colors.border },
        photoClear: {
          position: 'absolute',
          top: 12,
          right: 12,
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        photoEmpty: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 28,
          paddingHorizontal: 20,
          borderRadius: 18,
          backgroundColor: isDark ? colors.card : colors.surface,
          marginBottom: 10,
          gap: 6,
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
        },
        photoEmptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
        photoEmptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
        photoEmptyText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
        photoActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
        secondaryBtn: {
          flex: 1,
          backgroundColor: isDark ? colors.card : colors.surface,
          borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
          paddingVertical: 13,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 6,
        },
        secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
        thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
        thumb: { width: 92, height: 92, borderRadius: 14, backgroundColor: colors.border },
        pickerSheet: { borderRadius: 20, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
        pickerHandle: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
          marginBottom: 10,
        },
        pickerHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          paddingHorizontal: 4,
        },
        pickerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
        pickerItem: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14 },
      }),
    [colors, isDark]
  );
}

/** Rótulo com asterisco vermelho quando obrigatório. */
export function FormLabel({ label, required }: { label: string; required?: boolean }) {
  const styles = useFormStyles();
  return <FormFieldLabel label={label} required={required} style={styles.fieldLabel} />;
}

export function SectionTitle({ children }: { children: string }) {
  const styles = useFormStyles();
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/** Campo de seleção (abre a folha de opções), igual ao SelectField do Abastecimento. */
export function SelectField({
  label,
  valueLabel,
  placeholder,
  onPress,
  required,
}: {
  label: string;
  valueLabel: string;
  placeholder: string;
  onPress: () => void;
  required?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const styles = useFormStyles();
  const filled = !!valueLabel;
  return (
    <View style={{ marginBottom: 14 }}>
      <FormFieldLabel label={label} required={required} style={styles.fieldLabel} />
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={{
          backgroundColor: isDark ? colors.card : colors.surface,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: filled ? '600' : '500',
            color: filled ? colors.text : colors.textSecondary,
            letterSpacing: -0.2,
          }}
          numberOfLines={1}
        >
          {valueLabel || placeholder}
        </Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

/** Folha de opções com busca, igual à do Abastecimento. Renderizar dentro do FormModal (prop `overlay`). */
export function OptionSheet({
  title,
  options,
  onSelect,
  onClose,
}: {
  title: string;
  options: Array<{ value: string; label: string; subtitle?: string }>;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useFormStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [busca, setBusca] = useState('');
  const filtradas = options.filter((o) => o.label.toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <PickerSheetFrame title={title} onClose={onClose} search={busca} onSearchChange={setBusca}>
<FlatList
          style={{ flex: 1 }}
          data={filtradas}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.pickerItem, { backgroundColor: isDark ? colors.surface : colors.background }]}
              onPress={() => onSelect(item.value)}
              activeOpacity={0.75}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 }}>{item.label}</Text>
              {item.subtitle ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, fontWeight: '500' }}>
                  {item.subtitle}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', color: colors.textSecondary, padding: 28, fontWeight: '500' }}>
              Nenhum resultado
            </Text>
          }
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24), gap: 8 }}
        />
      </PickerSheetFrame>
  );
}

/** Esqueleto de formulário em tela cheia: cabeçalho com título/subtítulo, conteúdo rolável e botão fixo no rodapé. */
export function FormModal({
  visible,
  title,
  subtitle,
  onClose,
  submitLabel,
  submitting,
  submitDisabled,
  onSubmit,
  overlay,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  submitLabel: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, isDark } = useTheme();
  const styles = useFormStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const bloqueado = submitting || submitDisabled;
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: insets.top,
          width,
          height,
          position: 'relative',
        }}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.formHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formTitle}>{title}</Text>
              {subtitle ? <Text style={styles.formSubtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.formCloseBtn} hitSlop={6} accessibilityLabel="Fechar">
              <X size={20} color={colors.text} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          <View
            style={[
              styles.formFooter,
              {
                borderTopColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
                paddingBottom: formFooterBottomPad(insets.bottom),
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.primaryBtn, bloqueado && { opacity: submitting ? 0.7 : 0.5 }]}
              onPress={onSubmit}
              disabled={bloqueado}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{submitLabel}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        {overlay}
        <AppToastHost topOffset={Math.max(insets.top, 12) + 8} />
      </View>
    </Modal>
  );
}
