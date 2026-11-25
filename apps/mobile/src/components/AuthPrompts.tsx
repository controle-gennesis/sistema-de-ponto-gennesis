import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LogOut, ScanFace, type LucideIcon } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { showAppToast } from './AppToast';

const BRAND = '#ce3736';

// --- Pedidos vindos de qualquer tela (o login some assim que a sessão abre, então o aviso mora na raiz do app) ---
type Offer = { id: string; pass: string };
let pendingOffer: Offer | null = null;
let pendingLogout = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Depois do login: oferece ativar o Face ID (ou a biometria do aparelho). */
export function requestBiometricOffer(id: string, pass: string) {
  pendingOffer = { id, pass };
  emit();
}

/** Abre a confirmação «Sair da conta?». */
export function requestLogoutConfirm() {
  pendingLogout = true;
  emit();
}

/** Janela centralizada, no padrão visual do app (cantos de 28, ícone em quadrado, botões em pílula). */
function PromptDialog({
  visible,
  icon: Icon,
  title,
  message,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  busy,
}: {
  visible: boolean;
  icon: LucideIcon;
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  busy?: boolean;
}) {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const C = useMemo(
    () => ({
      card: isDark ? '#111827' : '#ffffff',
      title: isDark ? '#f9fafb' : '#111827',
      body: isDark ? '#9ca3af' : '#6b7280',
      accent: isDark ? '#f87171' : BRAND,
      accentSoft: isDark ? 'rgba(248,113,113,0.14)' : 'rgba(206,55,54,0.1)',
      secondaryBg: isDark ? '#1f2937' : '#f3f4f6',
      secondaryText: isDark ? '#e5e7eb' : '#374151',
    }),
    [isDark],
  );

  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(anim, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setMounted(false);
      },
    );
  }, [visible, anim]);

  if (!mounted) return null;
  const cardWidth = Math.min(340, width - 48);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onSecondary}>
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: anim }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onSecondary} />
        <Animated.View
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: C.card,
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
            },
          ]}
        >
          <View style={[styles.iconTile, { backgroundColor: C.accentSoft }]}>
            <Icon size={30} color={C.accent} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: C.title }]}>{title}</Text>
          <Text style={[styles.message, { color: C.body }]}>{message}</Text>

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.75 }]}
            onPress={onPrimary}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: C.secondaryBg }]}
            onPress={onSecondary}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: C.secondaryText }]}>{secondaryLabel}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Fica na raiz do app: mostra o convite do Face ID depois do login e a confirmação de sair. */
export function AuthPromptsHost() {
  const { biometric, enableBiometrics, logout, isAuthenticated } = useAuth();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      if (pendingLogout) {
        pendingLogout = false;
        setLogoutOpen(true);
      }
      if (pendingOffer) {
        const next = pendingOffer;
        pendingOffer = null;
        // Espera a Início aparecer por trás antes de mostrar o convite.
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setOffer(next), 650);
      }
    };
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Se a sessão cair (ou a pessoa sair) com o convite aberto, ele não fica pendurado.
  useEffect(() => {
    if (!isAuthenticated) setOffer(null);
  }, [isAuthenticated]);

  const label = biometric.label || 'biometria';

  const activate = async () => {
    if (!offer) return;
    setEnabling(true);
    try {
      await enableBiometrics(offer.id, offer.pass);
      setOffer(null);
      showAppToast({ type: 'success', text1: `${label} ativado` });
    } catch (err) {
      setOffer(null);
      showAppToast({ type: 'error', text1: err instanceof Error ? err.message : 'Não foi possível ativar.' });
    } finally {
      setEnabling(false);
    }
  };

  return (
    <>
      <PromptDialog
        visible={!!offer}
        icon={ScanFace}
        title={`Ativar ${label}?`}
        message={`No próximo acesso você entra com ${label}, sem precisar digitar a senha.`}
        primaryLabel={`Ativar ${label}`}
        secondaryLabel="Agora não"
        busy={enabling}
        onPrimary={() => void activate()}
        onSecondary={() => setOffer(null)}
      />
      <PromptDialog
        visible={logoutOpen}
        icon={LogOut}
        title="Sair da conta?"
        message="Você vai precisar entrar de novo para usar o aplicativo."
        primaryLabel="Sair"
        secondaryLabel="Cancelar"
        onPrimary={() => {
          setLogoutOpen(false);
          void logout();
        }}
        onSecondary={() => setLogoutOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  iconTile: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 21, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  message: { marginTop: 8, fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 999,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  secondaryBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
