import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { AppToastHost } from './AppToast';

const BRAND = '#ce3736';
const SHEET_BOTTOM_PAD = Platform.OS === 'ios' ? 26 : 18;

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Folha de baixo do Tasks, no mesmo padrão da "Esqueceu a senha": o fundo escuro só faz fade,
 * a folha sobe sozinha, o conteúdo acompanha o teclado e o topo tem ícone, título e subtítulo.
 */
export default function KanbanSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon: Icon,
  leftHeader = false,
  overlay,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconType;
  /** Cabeçalho como nas Notificações: título à esquerda, sem ícone e com botão X. */
  leftHeader?: boolean;
  /** Camadas por cima da folha (ex.: motivo de recusa), dentro do mesmo Modal. */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isDark } = useTheme();
  // Em alguns aparelhos a raiz do Modal termina acima da área da barra inicial do iOS: a folha desce
  // essa área e compensa com padding, para o branco chegar até a borda da tela.
  const insetBottom = useSafeAreaInsets().bottom;
  const C = useMemo(
    () => ({
      sheet: isDark ? '#111827' : '#ffffff',
      title: isDark ? '#f9fafb' : '#111827',
      body: isDark ? '#9ca3af' : '#6b7280',
      accent: isDark ? '#f87171' : BRAND,
      accentSoft: isDark ? 'rgba(248,113,113,0.14)' : 'rgba(206,55,54,0.1)',
      closeBg: isDark ? '#1f2937' : '#f3f4f6',
      iconStrong: isDark ? '#d1d5db' : '#52525b',
    }),
    [isDark],
  );
  const styles = useMemo(() => getStyles(C), [C]);

  const [mounted, setMounted] = useState(visible);
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const keyboardInset = useRef(new Animated.Value(0)).current;
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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

  // Sobe o conteúdo acima do teclado lendo a posição real dele.
  const windowHeight = Dimensions.get('window').height;
  // A folha ocupa a altura REAL da tela, mesmo que a raiz do Modal fique menor (barra do sistema).
  const screenHeight = Dimensions.get('screen').height;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    const move = (height: number, duration: number) => {
      Animated.timing(keyboardInset, {
        toValue: height,
        duration,
        useNativeDriver: false,
      }).start();
    };
    const subs =
      Platform.OS === 'ios'
        ? [
            Keyboard.addListener('keyboardWillChangeFrame', (e) => {
              if (!visibleRef.current) return;
              const h = Math.max(0, windowHeight - e.endCoordinates.screenY);
              setKeyboardOpen(h > 0);
              move(h, e.duration || 250);
            }),
            Keyboard.addListener('keyboardWillHide', (e) => {
              if (!visibleRef.current) return;
              setKeyboardOpen(false);
              move(0, e?.duration || 220);
            }),
          ]
        : [
            Keyboard.addListener('keyboardDidShow', (e) => {
              if (!visibleRef.current) return;
              setKeyboardOpen(true);
              move(e.endCoordinates.height, 200);
            }),
            Keyboard.addListener('keyboardDidHide', () => {
              if (!visibleRef.current) return;
              setKeyboardOpen(false);
              move(0, 160);
            }),
          ];
    return () => subs.forEach((sub) => sub.remove());
  }, [keyboardInset, windowHeight]);

  useEffect(() => {
    if (visible) {
      keyboardInset.setValue(0);
      setKeyboardOpen(false);
    }
  }, [visible, keyboardInset]);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={[styles.overlay, { height: screenHeight }]}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={{
            // iOS: a raiz do Modal termina acima da barra inicial, então a folha desce essa área.
            // Android: a folha fica inteira na tela e o padding de baixo já reserva a barra de navegação.
            marginBottom: Platform.OS === 'ios' ? -insetBottom : 0,
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) },
            ],
          }}
        >
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Animated.add(keyboardInset, SHEET_BOTTOM_PAD + insetBottom) },
            ]}
          >
            {leftHeader ? (
              <View style={styles.leftHero}>
                <View style={styles.leftHeroText}>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle ? <Text style={styles.leftSubtitle}>{subtitle}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.roundBtn}
                  hitSlop={8}
                  accessibilityLabel="Fechar"
                >
                  <X size={18} color={C.iconStrong} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : keyboardOpen ? (
              // Teclado aberto: só o título (com o X), para sobrar espaço para a lista.
              <View style={styles.compactRow}>
                <Text style={[styles.titleCompact, { flex: 1, marginBottom: 0 }]}>{title}</Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.roundBtn}
                  hitSlop={8}
                  accessibilityLabel="Fechar"
                >
                  <X size={18} color={C.iconStrong} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.hero}>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.roundBtn, styles.heroClose]}
                  hitSlop={8}
                  accessibilityLabel="Fechar"
                >
                  <X size={18} color={C.iconStrong} strokeWidth={2.2} />
                </TouchableOpacity>
                {Icon ? (
                  <View style={styles.heroIcon}>
                    <Icon size={26} color={C.accent} strokeWidth={2.1} />
                  </View>
                ) : null}
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
            )}

            {children}
          </Animated.View>
          {/* Continua o branco da folha para baixo: nada da tela de trás aparece abaixo dela. */}
          <View pointerEvents="none" style={styles.fill} />
        </Animated.View>
        {overlay}
        {/* O Modal cobre o toast do App: este fica por cima, no topo da tela. */}
        <AppToastHost />
      </View>
    </Modal>
  );
}

function getStyles(C: {
  sheet: string;
  title: string;
  body: string;
  accentSoft: string;
  closeBg: string;
}) {
  return StyleSheet.create({
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 22,
      paddingHorizontal: 22,
      // Em pixels: porcentagem aqui não resolve (o pai não tem altura) e cortava a lista.
      maxHeight: Dimensions.get('window').height * 0.92,
    },
    fill: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '100%',
      height: 400,
      backgroundColor: C.sheet,
    },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    roundSpacer: { width: 34, height: 34 },
    roundBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.closeBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leftHero: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
    leftHeroText: { flex: 1 },
    leftSubtitle: { marginTop: 6, fontSize: 14, lineHeight: 20, color: C.body, paddingRight: 6 },
    hero: { alignItems: 'center', marginBottom: 20 },
    heroClose: { position: 'absolute', top: -6, right: -6, zIndex: 2 },
    compactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    heroIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    titleCompact: {
      fontSize: 18,
      fontWeight: '700',
      color: C.title,
      textAlign: 'center',
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
  });
}
