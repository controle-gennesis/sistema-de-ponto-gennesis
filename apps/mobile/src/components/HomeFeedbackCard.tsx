import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Check, Star } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { sendHomeFeedback } from '../services/appFeedback';

const LABELS = ['Muito ruim', 'Ruim', 'Regular', 'Boa', 'Muito boa'];
const MAX_COMMENT = 140;

/** Avaliação da tela inicial: 1 a 5 estrelas + comentário opcional. Fica sempre disponível. */
export default function HomeFeedbackCard({ onInputFocus }: { onInputFocus?: () => void } = {}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () => sendHomeFeedback(rating, comment.trim()),
    onSuccess: () => {
      // Limpa o formulário já: a pessoa pode avaliar de novo quando quiser.
      setRating(0);
      setComment('');
      sendMutation.reset();
      setSuccessOpen(true);
    },
  });

  return (
    <>
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.heading}>Queremos saber a sua opinião</Text>
        <Text style={styles.subheading}>O que você acha do app? Conte para a gente.</Text>
      </View>

      <View style={styles.starsRow}>
        {LABELS.map((label, i) => {
          const value = i + 1;
          const active = value <= rating;
          return (
            <TouchableOpacity
              key={label}
              style={styles.starItem}
              onPress={() => setRating(value)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${value} de 5 estrelas, ${label}`}
              accessibilityState={{ selected: value === rating }}
            >
              <Star
                size={32}
                color={active ? '#f59e0b' : colors.textSecondary}
                fill={active ? '#f59e0b' : 'transparent'}
                strokeWidth={1.8}
              />
              <Text style={[styles.starLabel, value === rating && styles.starLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        style={styles.input}
        value={comment}
        onChangeText={(t) => setComment(t.slice(0, MAX_COMMENT))}
        onFocus={onInputFocus}
        placeholder="Quer fazer um comentário? (opcional)"
        placeholderTextColor={colors.textSecondary}
        maxLength={MAX_COMMENT}
        multiline
      />
      <Text style={styles.counter}>
        {comment.length}/{MAX_COMMENT}
      </Text>

      {sendMutation.isError ? (
        <Text style={styles.error}>Não foi possível enviar. Tente novamente.</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.button, (rating === 0 || sendMutation.isPending) && styles.buttonDisabled]}
        disabled={rating === 0 || sendMutation.isPending}
        onPress={() => sendMutation.mutate()}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Enviar avaliação"
      >
        {sendMutation.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, rating === 0 && styles.buttonTextDisabled]}>
            Enviar avaliação
          </Text>
        )}
      </TouchableOpacity>
    </View>

    <Modal
      visible={successOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setSuccessOpen(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.checkWrap}>
            <Check size={30} color="#16a34a" strokeWidth={2.6} />
          </View>
          <Text style={styles.modalTitle}>Avaliação enviada com sucesso!</Text>
          <Text style={styles.modalText}>
            Obrigado por compartilhar a sua opinião. Ela ajuda a melhorar o app, e você pode
            avaliar de novo quando quiser.
          </Text>
          <TouchableOpacity
            style={styles.modalBtn}
            onPress={() => setSuccessOpen(false)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <Text style={styles.modalBtnText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 16,
      gap: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#0f172a',
          shadowOpacity: 0,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        },
        android: { elevation: 0 },
        default: {},
      }),
    },
    header: { gap: 2 },
    heading: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    subheading: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.3,
      lineHeight: 23,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
    },
    checkWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(22,163,74,0.2)' : 'rgba(22,163,74,0.12)',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: colors.text,
      textAlign: 'center',
    },
    modalText: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    modalBtn: {
      alignSelf: 'stretch',
      marginTop: 20,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    starsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 20 },
    starItem: { flex: 1, alignItems: 'center', gap: 6 },
    starLabel: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },
    starLabelActive: { color: colors.text, fontWeight: '700' },
    input: {
      minHeight: 40,
      fontSize: 14,
      color: colors.text,
      borderBottomWidth: StyleSheet.hairlineWidth * 2,
      borderBottomColor: colors.border,
      paddingHorizontal: 0,
      paddingVertical: 8,
    },
    counter: { alignSelf: 'flex-end', fontSize: 12, color: colors.textSecondary },
    error: { fontSize: 13, color: '#dc2626' },
    button: {
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#d1d5db' },
    buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    buttonTextDisabled: { color: isDark ? 'rgba(255,255,255,0.45)' : '#9ca3af' },
  });
