import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import Toast from 'react-native-toast-message';
import type { ToastConfig } from 'react-native-toast-message';
import Svg, { Path } from 'react-native-svg';
import { Check, Info, X } from 'lucide-react-native';

type ToastKind = 'success' | 'error' | 'info';

type AppToastShowParams = {
  type?: ToastKind;
  text1?: string;
  text2?: string;
  /** Offset do topo (útil dentro de Modal com safe area). */
  topOffset?: number;
  visibilityTime?: number;
};

type ToastPalette = {
  bg: string;
  blob: string;
  accent: string;
  title: string;
  body: string;
  close: string;
};

const PALETTES: Record<ToastKind, ToastPalette> = {
  success: {
    bg: '#E8F8EF',
    blob: 'rgba(34, 160, 107, 0.14)',
    accent: '#22A06B',
    title: '#1A3A2C',
    body: '#3D6B55',
    close: '#5A8A72',
  },
  error: {
    bg: '#FDECEC',
    blob: 'rgba(220, 70, 70, 0.14)',
    accent: '#E04545',
    title: '#4A1F1F',
    body: '#8A4545',
    close: '#A05A5A',
  },
  info: {
    bg: '#EAF2FE',
    blob: 'rgba(47, 111, 237, 0.14)',
    accent: '#2F6FED',
    title: '#1A2A4A',
    body: '#455F8A',
    close: '#5A739A',
  },
};

/** Triângulo de alerta próprio (evita crash do Lucide AlertTriangle no Hermes). */
function AlertTriangleIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 9v4" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M12 17h.01" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

function ToastCard({
  type,
  text1,
  text2,
  onClose,
}: {
  type: ToastKind;
  text1?: string;
  text2?: string;
  onClose?: () => void;
}) {
  const palette = PALETTES[type];
  const title = text1?.trim() || (type === 'success' ? 'Sucesso' : type === 'error' ? 'Erro' : 'Aviso');
  const body = text2?.trim();

  return (
    <View style={[styles.card, { backgroundColor: palette.bg }]}>
      <View style={[styles.blobLarge, { backgroundColor: palette.blob }]} />
      <View style={[styles.blobSmall, { backgroundColor: palette.blob }]} />

      <View style={styles.row}>
        <View style={styles.iconCircle}>
          {type === 'error' ? (
            <AlertTriangleIcon color={palette.accent} size={20} />
          ) : type === 'success' ? (
            <Check size={20} color={palette.accent} strokeWidth={3} />
          ) : (
            <Info size={20} color={palette.accent} strokeWidth={2.4} />
          )}
        </View>

        <View style={styles.textCol}>
          <Text style={[styles.title, { color: palette.title }]} numberOfLines={2}>
            {title}
          </Text>
          {body ? (
            <Text style={[styles.body, { color: palette.body }]} numberOfLines={3}>
              {body}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        >
          <X size={16} color={palette.close} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

export const appToastConfig: ToastConfig = {
  success: ({ text1, text2, hide }) => (
    <ToastCard type="success" text1={text1} text2={text2} onClose={() => hide()} />
  ),
  error: ({ text1, text2, hide }) => (
    <ToastCard
      type="error"
      text1={text1 || text2}
      text2={undefined}
      onClose={() => hide()}
    />
  ),
  info: ({ text1, text2, hide }) => (
    <ToastCard type="info" text1={text1} text2={text2} onClose={() => hide()} />
  ),
};

type OverlayListener = (params: AppToastShowParams | null) => void;
let overlayListener: OverlayListener | null = null;

/** Toast padrão do app: sempre no topo, com visual mais limpo. */
export function showAppToast(params: AppToastShowParams) {
  const { type = 'info', text1, text2, topOffset, visibilityTime } = params;
  const isError = type === 'error';
  const mainText =
    isError && text2 && (!text1 || text1 === 'Erro' || text1 === 'Revise o formulário')
      ? text2
      : text1 || text2;

  Toast.show({
    type,
    text1: mainText,
    text2: isError ? undefined : text2,
    position: 'top',
    topOffset: topOffset ?? (Platform.OS === 'ios' ? 54 : 40),
    visibilityTime: visibilityTime ?? (isError ? 4200 : 3000),
  });
}

/**
 * Toast na árvore raiz (fora do Modal) — não depende do ref do react-native-toast-message.
 * Use após fechar formulários em Modal.
 */
export function showRootOverlayToast(params: AppToastShowParams) {
  const type = params.type ?? 'info';
  const isError = type === 'error';
  const mainText =
    isError && params.text2 && (!params.text1 || params.text1 === 'Erro' || params.text1 === 'Revise o formulário')
      ? params.text2
      : params.text1 || params.text2;

  overlayListener?.({
    ...params,
    type,
    text1: mainText,
    text2: isError ? undefined : params.text2,
  });
}

/**
 * Toast depois de fechar um Modal (atalho).
 */
export function showAppToastAfterModal(params: AppToastShowParams) {
  showRootOverlayToast(params);
}

/**
 * Enfileira toast de sucesso ao fechar o modal.
 * Dispara no host raiz quando `modalOpen` vira false (após a animação do Modal).
 */
export function useDeferredToast(modalOpen: boolean) {
  const pendingRef = React.useRef<AppToastShowParams | null>(null);

  React.useEffect(() => {
    if (modalOpen) return;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    // iOS mantém o Modal montado durante o dismiss (~300ms); espera cair.
    const id = setTimeout(() => showRootOverlayToast(pending), Platform.OS === 'ios' ? 420 : 80);
    return () => clearTimeout(id);
  }, [modalOpen]);

  return React.useCallback((params: AppToastShowParams) => {
    pendingRef.current = params;
  }, []);
}

/** Validação de formulário (só o texto principal). */
export function showFormValidationToast(
  message: string,
  options?: { topOffset?: number },
) {
  showAppToast({
    type: 'error',
    text1: message,
    topOffset: options?.topOffset,
  });
}

/** Instância do Toast (App ou dentro de Modal fullscreen). */
export function AppToastHost({ topOffset }: { topOffset?: number }) {
  return (
    <Toast
      config={appToastConfig}
      position="top"
      topOffset={topOffset ?? (Platform.OS === 'ios' ? 54 : 40)}
      visibilityTime={3000}
    />
  );
}

/**
 * Overlay de toast na raiz do App — aparece no topo após fechar Modals.
 * Deve ficar montado em App.tsx (fora de qualquer Modal).
 */
export function RootOverlayToastHost() {
  const [toast, setToast] = React.useState<AppToastShowParams | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    overlayListener = (params) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(params);
      if (!params) return;
      const ms = params.visibilityTime ?? (params.type === 'error' ? 4200 : 3000);
      hideTimer.current = setTimeout(() => setToast(null), ms);
    };
    return () => {
      overlayListener = null;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!toast) return null;

  const top = toast.topOffset ?? (Platform.OS === 'ios' ? 54 : 40);

  return (
    <View pointerEvents="box-none" style={styles.overlayRoot}>
      <View pointerEvents="box-none" style={[styles.overlayToastWrap, { top }]}>
        <ToastCard
          type={toast.type ?? 'info'}
          text1={toast.text1}
          text2={toast.text2}
          onClose={() => {
            if (hideTimer.current) clearTimeout(hideTimer.current);
            setToast(null);
          }}
        />
      </View>
    </View>
  );
}

/** Padding inferior do rodapé de formulário (evita nav bar Android). */
export function formFooterBottomPad(insetsBottom: number) {
  return Platform.OS === 'android'
    ? Math.max(insetsBottom + 16, 28)
    : Math.max(insetsBottom, 14);
}

const styles = StyleSheet.create({
  card: {
    width: '92%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  blobLarge: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -48,
    left: -36,
  },
  blobSmall: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    bottom: -28,
    left: 28,
    opacity: 0.7,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 3,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  body: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    elevation: 999999,
  },
  overlayToastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
