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
    const label = facial
      ? Platform.OS === 'ios'
        ? 'Face ID'
        : 'reconhecimento facial'
      : finger
        ? Platform.OS === 'ios'
          ? 'Touch ID'
          : 'digital'
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

export async function enableBiometricLogin(identifier: string, password: string) {
  if (!secureAvailable()) {
    throw new Error('Biometria disponível apenas no app nativo.');
  }
  const cap = await getBiometricCapability();
  if (!cap.available) {
    throw new Error(`Cadastre ${cap.label} neste aparelho para ativar o acesso rápido.`);
  }
  const ok = await authenticateWithBiometrics(`Ativar ${cap.label}`);
  if (!ok) throw new Error('Biometria não confirmada.');
  await SecureStore.setItemAsync(ENABLED_KEY, '1');
  await SecureStore.setItemAsync(IDENTIFIER_KEY, identifier.trim());
  await SecureStore.setItemAsync(PASSWORD_KEY, password);
}

export async function disableBiometricLogin() {
  if (!secureAvailable()) return;
  await SecureStore.deleteItemAsync(ENABLED_KEY);
  await SecureStore.deleteItemAsync(IDENTIFIER_KEY);
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
}

export async function authenticateWithBiometrics(promptMessage?: string): Promise<boolean> {
  const cap = await getBiometricCapability();
  if (!cap.available) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: promptMessage || `Entre com ${cap.label}`,
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar senha do aparelho',
    disableDeviceFallback: false,
  });
  return result.success;
}
