import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { buildApiUrl } from '../config/api';
import { getPushToken } from './systemNotifications';

const LAST_TOKEN_KEY = '@push_token_registered';

async function authHeaders() {
  const token = await AsyncStorage.getItem('token');
  if (!token) return null;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/** Este aparelho já recebe push do servidor (então não precisa de notificação local duplicada). */
export async function hasRegisteredPushToken(): Promise<boolean> {
  try {
    return !!(await AsyncStorage.getItem(LAST_TOKEN_KEY));
  } catch {
    return false;
  }
}

/** Registra o token de push deste aparelho na conta logada (silencioso: nunca lança). */
export async function registerPushTokenWithServer(): Promise<void> {
  try {
    const pushToken = await getPushToken();
    if (!pushToken) return;
    const headers = await authHeaders();
    if (!headers) return;
    const res = await fetch(buildApiUrl('/api/push-tokens'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: pushToken, platform: Platform.OS }),
    });
    if (res.ok) await AsyncStorage.setItem(LAST_TOKEN_KEY, pushToken);
  } catch {
    // sem rede agora: tenta de novo na próxima abertura
  }
}

/** Tira este aparelho da conta que está saindo (chamar ANTES de apagar o token de sessão). */
export async function unregisterPushTokenFromServer(): Promise<void> {
  try {
    const pushToken = await AsyncStorage.getItem(LAST_TOKEN_KEY);
    if (!pushToken) return;
    const headers = await authHeaders();
    if (headers) {
      await fetch(buildApiUrl('/api/push-tokens'), {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ token: pushToken }),
      });
    }
    await AsyncStorage.removeItem(LAST_TOKEN_KEY);
  } catch {
    // ignora: o servidor também limpa token morto no primeiro envio que falhar
  }
}
