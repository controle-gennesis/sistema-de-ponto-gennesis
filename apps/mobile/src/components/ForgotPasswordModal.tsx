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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageCircle,
  Mail,
  UserRound,
  UserX,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { buildApiUrl } from '../config/api';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  /** Preenche o campo com o que a pessoa já digitou no login. */
  initialIdentifier?: string;
  /** Abre o suporte (WhatsApp) — alternativa quando a conta não tem e-mail cadastrado. */
  onContactSupport: () => void;
  /** Senha trocada: devolve o identificador pra preencher o login. */
  onDone: (identifier: string) => void;
};

const BRAND = '#ce3736';
const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;
const SHEET_BOTTOM_PAD = Platform.OS === 'ios' ? 26 : 18;

async function postJson(path: string, body: Record<string, unknown>) {
  const res = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || 'Não foi possível concluir. Tente de novo.');
  }
  return json;
}

type Step = 'identify' | 'code' | 'password' | 'noAccount';

/** Recuperar senha: pede o código por e-mail, confere e define a nova senha. */
export default function ForgotPasswordModal({
  visible,
  onClose,
  isDark,
  initialIdentifier,
  onContactSupport,
  onDone,
}: Props) {
  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [codeFocused, setCodeFocused] = useState(false);
  const [focused, setFocused] = useState<'id' | 'pwd' | 'confirm' | null>(null);
  const codeRef = useRef<TextInput>(null);
  const pwdRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const C = useMemo(
    () => ({
      sheet: isDark ? '#111827' : '#ffffff',
      title: isDark ? '#f9fafb' : '#111827',
      body: isDark ? '#9ca3af' : '#6b7280',
      inputBg: isDark ? '#1f2937' : '#ffffff',
      inputBorder: isDark ? '#374151' : '#e5e7eb',
      inputText: isDark ? '#f9fafb' : '#111827',
      placeholder: '#9ca3af',
      icon: '#9ca3af',
      iconStrong: isDark ? '#d1d5db' : '#52525b',
      accent: isDark ? '#f87171' : BRAND,
      accentSoft: isDark ? 'rgba(248,113,113,0.14)' : 'rgba(206,55,54,0.1)',
      closeBg: isDark ? '#1f2937' : '#f3f4f6',
    }),
    [isDark],
  );
  const styles = useMemo(() => getStyles(C), [C]);

  // Entrada/saída: o fundo escuro só faz fade e a folha sobe por conta própria. Com o
  // `animationType="slide"` do Modal o fundo inteiro subia junto (aparecia "bugado").
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

  // Sobe o conteúdo acima do teclado. Lê a posição REAL do teclado (frame), não "mostrou/
  // escondeu": assim o vão nunca fica preso quando o teclado some sem avisar. Só reage com a
  // folha aberta, e zera ao abrir.
  const windowHeight = Dimensions.get('window').height;
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
              move(h, e.duration || 250);
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

  // Ao abrir, o vão do teclado começa em zero (o teclado do login pode ter ficado aberto).
  useEffect(() => {
    if (!visible) return;
    keyboardInset.setValue(0);
    Keyboard.dismiss();
  }, [visible, keyboardInset]);

  // Cada abertura recomeça do zero.
  useEffect(() => {
    if (!visible) return;
    setStep('identify');
    setIdentifier(initialIdentifier || '');
    setMaskedEmail('');
    setCode('');
    setNewPassword('');
    setConfirm('');
    setShowPwd(false);
    setError('');
    setBusy(false);
    setCooldown(0);
    setFocused(null);
  }, [visible, initialIdentifier]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    const id = identifier.trim();
    if (!id) {
      setError('Informe seu e-mail ou CPF.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const json = await postJson('/api/auth/forgot-password/code', { identifier: id });
      if (json?.data?.sent) {
        setMaskedEmail(String(json.data.maskedEmail || ''));
        setStep('code');
        setCooldown(RESEND_SECONDS);
        setTimeout(() => codeRef.current?.focus(), 300);
      } else {
        setStep('noAccount');
      }
    } catch (e: any) {
      setError(e?.message || 'Não foi possível enviar o código.');
    } finally {
      setBusy(false);
    }
  };

  const continueFromCode = () => {
    if (code.length !== CODE_LENGTH) {
      setError('Digite o código de 6 dígitos recebido por e-mail.');
      return;
    }
    setError('');
    setStep('password');
    setTimeout(() => pwdRef.current?.focus(), 300);
  };

  const resetPassword = async () => {
    if (code.length !== CODE_LENGTH) {
      setStep('code');
      setError('Digite o código de 6 dígitos recebido por e-mail.');
      return;
    }
    if (newPassword.length < 8) {
      setError('A nova senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirm) {
      setError('A confirmação não confere com a nova senha.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await postJson('/api/auth/reset-password/code', {
        identifier: identifier.trim(),
        code,
        newPassword,
      });
      Toast.show({
        type: 'success',
        text1: 'Senha redefinida',
        text2: 'Entre com a nova senha.',
      });
      onDone(identifier.trim());
      onClose();
    } catch (e: any) {
      const message = String(e?.message || 'Não foi possível redefinir a senha.');
      // Código errado/expirado: volta ao passo do código pra corrigir ou reenviar.
      if (/c[oó]digo/i.test(message)) {
        setCode('');
        setStep('code');
        setTimeout(() => codeRef.current?.focus(), 300);
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setError('');
    setBusy(true);
    try {
      await postJson('/api/auth/forgot-password/code', { identifier: identifier.trim() });
      setCooldown(RESEND_SECONDS);
      setCode('');
      Toast.show({ type: 'success', text1: 'Código reenviado', text2: `Enviado para ${maskedEmail}.` });
    } catch (e: any) {
      setError(e?.message || 'Não foi possível reenviar o código.');
    } finally {
      setBusy(false);
    }
  };

  const header =
    step === 'identify'
      ? {
          Icon: KeyRound,
          title: 'Recuperar senha',
          subtitle: 'Informe seu e-mail ou CPF e enviaremos um código para o e-mail da sua conta.',
        }
      : step === 'code'
        ? {
            Icon: Mail,
            title: 'Digite o código',
            subtitle: `Enviamos um e-mail com 6 dígitos para ${maskedEmail}.`,
          }
        : step === 'password'
          ? {
              Icon: Lock,
              title: 'Nova senha',
              subtitle: 'Escolha uma senha com pelo menos 8 caracteres.',
            }
          : {
              Icon: UserX,
              title: 'Conta sem e-mail',
              subtitle:
                'Não encontramos um e-mail cadastrado para essa conta. O suporte consegue alterar sua senha.',
            };
  const inputStyle = (key: 'id' | 'pwd' | 'confirm') => [
    styles.input,
    focused === key && styles.inputFocused,
  ];

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* Dois níveis: o de fora faz a entrada (nativo); o sheet de dentro sobe o conteúdo com o
            teclado via padding (JS). A folha fica colada no fim da tela e o branco continua por
            trás do teclado — com margin aparecia o fundo escuro nas curvas do teclado. */}
        <Animated.View
          style={{
            transform: [
              {
                translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }),
              },
            ],
          }}
        >
          <Animated.View
            style={[styles.sheet, { paddingBottom: Animated.add(keyboardInset, SHEET_BOTTOM_PAD) }]}
          >
            {step === 'code' || step === 'password' ? (
              <View style={styles.topRow}>
                <TouchableOpacity
                  onPress={() => {
                    setStep(step === 'password' ? 'code' : 'identify');
                    setError('');
                  }}
                  style={styles.roundBtn}
                  hitSlop={8}
                  accessibilityLabel="Voltar"
                >
                  <ArrowLeft size={18} color={C.iconStrong} strokeWidth={2.2} />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.content}>
              <View style={styles.hero}>
                <Text style={styles.title}>{header.title}</Text>
                <Text style={styles.subtitle}>{header.subtitle}</Text>
              </View>

              {step === 'identify' ? (
                <View style={styles.inputContainer}>
                  <View style={styles.fieldIcon}>
                    <UserRound size={20} color={C.icon} />
                  </View>
                  <TextInput
                    value={identifier}
                    onChangeText={(t) => {
                      setIdentifier(t);
                      if (error) setError('');
                    }}
                    onFocus={() => setFocused('id')}
                    onBlur={() => setFocused(null)}
                    placeholder="E-mail ou CPF"
                    placeholderTextColor={C.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    style={[...inputStyle('id'), styles.inputWithIcon]}
                    returnKeyType="send"
                    onSubmitEditing={() => void requestCode()}
                  />
                </View>
              ) : null}

              {step === 'code' ? (
                <>
                  <Pressable onPress={() => codeRef.current?.focus()} style={styles.otpRow}>
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                      const char = code[i] ?? '';
                      const active = codeFocused && i === Math.min(code.length, CODE_LENGTH - 1);
                      return (
                        <View key={i} style={[styles.otpBox, active && styles.otpBoxActive]}>
                          <Text style={styles.otpChar}>{char}</Text>
                        </View>
                      );
                    })}
                    <TextInput
                      ref={codeRef}
                      value={code}
                      onChangeText={(t) => {
                        const digits = t.replace(/\D/g, '').slice(0, CODE_LENGTH);
                        setCode(digits);
                        if (error) setError('');
                      }}
                      onFocus={() => setCodeFocused(true)}
                      onBlur={() => setCodeFocused(false)}
                      keyboardType="number-pad"
                      maxLength={CODE_LENGTH}
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      caretHidden
                      style={styles.otpHidden}
                    />
                  </Pressable>

                  <TouchableOpacity
                    onPress={() => void resend()}
                    disabled={cooldown > 0 || busy}
                    style={styles.resend}
                  >
                    <Text style={[styles.link, (cooldown > 0 || busy) && styles.linkOff]}>
                      {cooldown > 0 ? `Reenviar código em ${cooldown}s` : 'Reenviar código'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : null}

              {step === 'password' ? (
                <>
                  <View style={styles.inputContainer}>
                    <View style={styles.fieldIcon}>
                      <Lock size={20} color={C.icon} />
                    </View>
                    <TextInput
                      ref={pwdRef}
                      value={newPassword}
                      onChangeText={(t) => {
                        setNewPassword(t);
                        if (error) setError('');
                      }}
                      onFocus={() => setFocused('pwd')}
                      onBlur={() => setFocused(null)}
                      placeholder="Nova senha (mín. 8 caracteres)"
                      placeholderTextColor={C.placeholder}
                      secureTextEntry={!showPwd}
                      autoCapitalize="none"
                      style={[...inputStyle('pwd'), styles.inputWithIcon, styles.inputWithEye]}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmRef.current?.focus()}
                    />
                    <Pressable style={styles.eye} onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                      {showPwd ? (
                        <EyeOff size={20} color={C.iconStrong} />
                      ) : (
                        <Eye size={20} color={C.iconStrong} />
                      )}
                    </Pressable>
                  </View>

                  <View style={styles.inputContainer}>
                    <View style={styles.fieldIcon}>
                      <Lock size={20} color={C.icon} />
                    </View>
                    <TextInput
                      ref={confirmRef}
                      value={confirm}
                      onChangeText={(t) => {
                        setConfirm(t);
                        if (error) setError('');
                      }}
                      onFocus={() => setFocused('confirm')}
                      onBlur={() => setFocused(null)}
                      placeholder="Confirmar nova senha"
                      placeholderTextColor={C.placeholder}
                      secureTextEntry={!showPwd}
                      autoCapitalize="none"
                      style={[...inputStyle('confirm'), styles.inputWithIcon]}
                      returnKeyType="done"
                      onSubmitEditing={() => void resetPassword()}
                    />
                  </View>
                </>
              ) : null}

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {step === 'noAccount' ? (
                <>
                  <TouchableOpacity style={styles.whatsappBtn} onPress={onContactSupport} activeOpacity={0.9}>
                    <MessageCircle size={18} color="#fff" strokeWidth={2} />
                    <Text style={styles.primaryText}>Falar com o suporte</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStep('identify')} style={styles.secondaryLink}>
                    <Text style={styles.link}>Tentar outro e-mail ou CPF</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.primary, busy && styles.primaryBusy]}
                  onPress={() => {
                    if (step === 'identify') void requestCode();
                    else if (step === 'code') continueFromCode();
                    else void resetPassword();
                  }}
                  disabled={busy}
                  activeOpacity={0.9}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>
                      {step === 'identify'
                        ? 'Enviar código por e-mail'
                        : step === 'code'
                          ? 'Continuar'
                          : 'Redefinir senha'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {step !== 'noAccount' ? (
                <TouchableOpacity
                  style={styles.supportLink}
                  onPress={onContactSupport}
                  activeOpacity={0.7}
                >
                  <Text style={styles.supportText}>Falar com o suporte</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const getStyles = (C: {
  sheet: string;
  title: string;
  body: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  accent: string;
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
      paddingTop: 22,
      paddingHorizontal: 22,
    },
    topRow: { flexDirection: 'row', alignItems: 'center' },
    roundBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.closeBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roundBtnSpacer: { width: 34, height: 34 },
    content: { paddingBottom: 6 },
    hero: { alignItems: 'center', marginBottom: 22 },
    title: { fontSize: 22, fontWeight: '700', color: C.title, letterSpacing: -0.3 },
    subtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: C.body,
      textAlign: 'center',
      paddingHorizontal: 6,
    },
    inputContainer: { position: 'relative', justifyContent: 'center', marginBottom: 14 },
    fieldIcon: {
      position: 'absolute',
      left: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      zIndex: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: C.inputBorder,
      borderRadius: 12,
      paddingVertical: 15,
      paddingHorizontal: 16,
      fontSize: 16,
      color: C.inputText,
      backgroundColor: C.inputBg,
    },
    inputFocused: { borderColor: BRAND },
    inputWithIcon: { paddingLeft: 44 },
    inputWithEye: { paddingRight: 46 },
    eye: {
      position: 'absolute',
      right: 14,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      zIndex: 10,
    },
    otpRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 6,
    },
    otpBox: {
      flex: 1,
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    otpBoxActive: { borderColor: BRAND, borderWidth: 1.5 },
    otpChar: { fontSize: 24, fontWeight: '700', color: C.inputText },
    otpHidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
    resend: { alignSelf: 'center', marginBottom: 14 },
    link: { color: C.accent, fontWeight: '600', fontSize: 14, textAlign: 'center', paddingVertical: 4 },
    linkMuted: { color: C.body, fontWeight: '600', fontSize: 14, textAlign: 'center', paddingVertical: 4 },
    linkOff: { opacity: 0.5 },
    secondaryLink: { marginTop: 12, alignSelf: 'center' },
    error: { color: C.accent, fontSize: 13, marginBottom: 10, textAlign: 'center' },
    primary: {
      marginTop: 6,
      height: 54,
      borderRadius: 999,
      backgroundColor: BRAND,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBusy: { opacity: 0.7 },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
    supportLink: { marginTop: 14, alignSelf: 'center', paddingVertical: 4 },
    supportText: { color: C.accent, fontSize: 15, fontWeight: '600' },
    whatsappBtn: {
      height: 54,
      borderRadius: 999,
      backgroundColor: '#16a34a',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
  });
