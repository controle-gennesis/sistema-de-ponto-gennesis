import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const ENABLED_KEY = 'gennesis.biometric.enabled';
const IDENTIFIER_KEY = 'gennesis.biometric.identifier';
const PASSWORD_KEY = 'gennesis.biometric.password';

export type BiometricCapability = {
  available: boolean;
  enrolled: boolean;
  label: string;
};

let inFlightAuth: Promise<boolean> | null = null;

function secureAvailable() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function getBiometricCapability(): Promise<BiometricCapability> {
  if (!secureAvailable()) {
    return { available: false, enrolled: false, label: 'biometria' };
  }
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
    const types = hasHardware
      ? await LocalAuthentication.supportedAuthenticationTypesAsync()
      : [];
    const facial = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
    const finger = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);
    const iris = types.includes(LocalAuthentication.AuthenticationType.IRIS);
    // O aparelho só informa quais sensores existem (hardware), não qual credencial a pessoa
    // cadastrou de fato — em telefones com sensor de digital e de rosto, não dá pra saber qual
    // foi cadastrado. Só assume um tipo específico quando o hardware só suporta esse único tipo;
    // caso contrário usa o rótulo genérico, pra não afirmar errado (ex.: "facial" quando cadastrou digital).
    const supportedCount = [facial, finger, iris].filter(Boolean).length;
    const label =
      supportedCount === 1 && finger
        ? Platform.OS === 'ios'
          ? 'Touch ID'
          : 'digital'
        : supportedCount === 1 && facial
          ? Platform.OS === 'ios'
            ? 'Face ID'
            : 'reconhecimento facial'
          : 'biometria';
    return { available: hasHardware && enrolled, enrolled, label };
  } catch {
    return { available: false, enrolled: false, label: 'biometria' };
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!secureAvailable()) return false;
  try {
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function getStoredCredentials(): Promise<{
  identifier: string;
  password: string;
} | null> {
  if (!secureAvailable()) return null;
  try {
    const identifier = (await SecureStore.getItemAsync(IDENTIFIER_KEY)) || '';
    const password = (await SecureStore.getItemAsync(PASSWORD_KEY)) || '';
    if (!identifier || !password) return null;
    return { identifier, password };
  } catch {
    return null;
  }
}

/** Guarda as credenciais sem pedir Face ID de novo. */
export async function saveBiometricCredentials(identifier: string, password: string) {
  if (!secureAvailable()) return;
  await SecureStore.setItemAsync(ENABLED_KEY, '1');
  await SecureStore.setItemAsync(IDENTIFIER_KEY, identifier.trim());
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
}

export async function enableBiometricLogin(identifier: string, password: string) {
  if (!secureAvailable()) {
    throw new Error('Biometria disponível apenas no app nativo.');
  }
  const cap = await getBiometricCapability();
  if (!cap.available) {
    throw new Error(`Cadastre ${cap.label} neste aparelho para ativar o acesso rápido.`);
  }
  await authenticateWithBiometrics(`Ativar ${cap.label}`);
  await saveBiometricCredentials(identifier, password);
}

export async function disableBiometricLogin() {
  if (!secureAvailable()) return;
  await SecureStore.deleteItemAsync(ENABLED_KEY);
  await SecureStore.deleteItemAsync(IDENTIFIER_KEY);
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
}

function biometricErrorMessage(error: string | undefined, label: string): string {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return 'Você cancelou a confirmação. Tente de novo olhando para o aparelho.';
    case 'user_fallback':
      return `Use ${label} para entrar, não a senha do iPhone.`;
    case 'not_enrolled':
      return `Cadastre ${label} em Ajustes → Face ID e código.`;
    case 'lockout':
      return `${label} bloqueado temporariamente. Desbloqueie o iPhone e tente de novo.`;
    case 'not_available':
      return `${label} indisponível agora. Feche o app e abra de novo, ou use o app instalado (não o Expo Go).`;
    case 'missing_usage_description':
      return 'O Expo Go não tem permissão de Face ID. Recarregar não resolve — isso só funciona no app instalado (build da loja).';
    case 'authentication_failed':
      return `${label} não reconheceu. Olhe para o iPhone e tente de novo.`;
    default:
      return error
        ? `${label} não confirmada (${error}). Tente de novo.`
        : `${label} não confirmada. Tente de novo.`;
  }
}

export async function authenticateWithBiometrics(promptMessage?: string): Promise<boolean> {
  if (inFlightAuth) return inFlightAuth;

  inFlightAuth = (async () => {
    const cap = await getBiometricCapability();
    if (!cap.available) {
      throw new Error(`Cadastre ${cap.label} neste aparelho para continuar.`);
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || `Entre com ${cap.label}`,
      cancelLabel: 'Cancelar',
      // Face ID / digital — sem cair na senha do iPhone.
      disableDeviceFallback: true,
    });

    if (result.success) return true;
    throw new Error(biometricErrorMessage(result.error, cap.label));
  })().finally(() => {
    inFlightAuth = null;
  });

  return inFlightAuth;
}
