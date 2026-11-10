import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, X, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

const BRAND = '#ce3736';
const SHEET_BOTTOM_PAD = Platform.OS === 'ios' ? 26 : 18;

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Ícone no quadradinho do topo (como na "Recuperar senha"). */
  icon?: LucideIcon;
  /** `auto`: a altura acompanha o conteúdo (até 90% da tela). `tall`: ocupa ~92% (formulários longos). */
  size?: 'auto' | 'tall';
  /** Mostra o botão de voltar no canto esquerdo (em vez de só fechar). */
  onBack?: () => void;
  /** Com `false`, o conteúdo não é envolvido num ScrollView (use quando ele já tem a própria rolagem e rodapé). */
  scroll?: boolean;
  /** Espaço embaixo da folha; use 0 quando o conteúdo já traz o próprio rodapé com margem. */
  bottomPad?: number;
  /** Desenhado por cima de tudo, na tela inteira (ex.: seletor de opções, avisos). */
  overlay?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Janela das solicitações no mesmo visual da "Recuperar senha" do login: folha colada no fim da tela
 * com cantos de 28, fundo escuro que só faz fade, ícone + título centralizados no topo e botão de fechar
 * redondo. O conteúdo sobe junto com o teclado.
 */
export default function SheetModal({
  visible,
  onClose,
  title,
  subtitle,
  icon: HeaderIcon,
  size = 'auto',
  onBack,
  scroll = true,
  bottomPad,
  overlay,
  children,
}: Props) {
  const { isDark } = useTheme();
  const C = useMemo(
    () => ({
      sheet: isDark ? '#111827' : '#ffffff',
      title: isDark ? '#f9fafb' : '#111827',
      body: isDark ? '#9ca3af' : '#6b7280',
      iconStrong: isDark ? '#d1d5db' : '#52525b',
      accent: isDark ? '#f87171' : BRAND,
      accentSoft: isDark ? 'rgba(248,113,113,0.14)' : 'rgba(206,55,54,0.1)',
      closeBg: isDark ? '#1f2937' : '#f3f4f6',
    }),
    [isDark],
  );
  const styles = useMemo(() => getStyles(C), [C]);

  // Entrada/saída: o fundo só faz fade e a folha sobe sozinha (com `animationType="slide"` o fundo
  // inteiro subia junto).
  const [mounted, setMounted] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const keyboardInset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
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
      return;
    }
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
  }, [visible, backdrop, slide]);

  // Sobe o conteúdo acima do teclado lendo a posição real dele (não "mostrou/escondeu"), para o vão
  // nunca ficar preso.
  const windowHeight = Dimensions.get('window').height;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const move = (height: number, duration: number) => {
      Animated.timing(keyboardInset, { toValue: height, duration, useNativeDriver: false }).start();
    };
    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillChangeFrame', (e) => {
              if (!visibleRef.current) return;
              move(Math.max(0, windowHeight - e.endCoordinates.screenY), e.duration || 250);
            }),
            Keyboard.addListener('keyboardWillHide', (e) => {
              if (visibleRef.current) move(0, e?.duration || 220);
            }),
          ]
        : [
            Keyboard.addListener('keyboardDidShow', (e) => {
              if (visibleRef.current) move(e.endCoordinates.height, 200);
            }),
            Keyboard.addListener('keyboardDidHide', () => {
              if (visibleRef.current) move(0, 160);
            }),
          ];
    return () => subs.forEach((sub) => sub.remove());
  }, [keyboardInset, windowHeight]);

  useEffect(() => {
    if (!visible) return;
    keyboardInset.setValue(0);
  }, [visible, keyboardInset]);

  const bottom = bottomPad ?? SHEET_BOTTOM_PAD;
  const sheetSize =
    size === 'tall'
      ? { height: Math.round(windowHeight * 0.92) }
      : { maxHeight: Math.round(windowHeight * 0.9) };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={{
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) },
            ],
          }}
        >
          <Animated.View
            style={[styles.sheet, sheetSize, { paddingBottom: Animated.add(keyboardInset, bottom) }]}
          >
            <View style={styles.header}>
              {onBack ? (
                <TouchableOpacity
                  onPress={onBack}
                  style={styles.roundBtn}
                  hitSlop={8}
                  accessibilityLabel="Voltar"
                >
                  <ArrowLeft size={18} color={C.iconStrong} strokeWidth={2.2} />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.roundBtn}
                hitSlop={8}
                accessibilityLabel="Fechar"
              >
                <X size={18} color={C.iconStrong} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {scroll ? (
              <ScrollView
                style={size === 'tall' ? styles.bodyTall : styles.bodyAuto}
                showsVerticalScrollIndicator={false}
                bounces={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={size === 'tall' ? styles.bodyTall : styles.bodyAuto}>{children}</View>
            )}
          </Animated.View>
        </Animated.View>
        {overlay}
      </View>
    </Modal>
  );
}

/** Botão principal no estilo da "Recuperar senha": pílula vermelha de 54 px. */
export function SheetPrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[sheetButtonStyles.primary, (loading || disabled) && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={sheetButtonStyles.text}>{label}</Text>}
    </TouchableOpacity>
  );
}

const sheetButtonStyles = StyleSheet.create({
  primary: {
    height: 54,
    borderRadius: 999,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});

const getStyles = (C: {
  sheet: string;
  title: string;
  body: string;
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
      paddingTop: 18,
      paddingHorizontal: 22,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    roundBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.closeBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      color: C.title,
      letterSpacing: -0.3,
    },
    bodyAuto: { flexGrow: 0, flexShrink: 1 },
    bodyTall: { flex: 1 },
  });
