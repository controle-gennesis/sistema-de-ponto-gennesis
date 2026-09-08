import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Backend de produção (Play Store / builds release). */
const PRODUCTION_API = 'https://sistema-pontobackend-production.up.railway.app';

/** Fallback se o Expo não expor o host (dev). */
const LOCAL_LAN_API_FALLBACK = 'http://192.168.1.84:5000';

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function isRemoteProductionUrl(url: string) {
  return /railway\.app|gennesisconecta\.com/i.test(url);
}

/** Extrai o IP do PC a partir do Metro/Expo Go (ex.: 192.168.1.84:8081). */
function getDevHostIp(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    (Constants as any).expoGoConfig?.debuggerHost,
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost,
    (Constants as any).manifest?.debuggerHost,
    (Constants as any).linkingUri,
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const match = String(raw).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    if (match?.[1]) return match[1];
  }
  return null;
}

function getDevLanApi() {
  const ip = getDevHostIp();
  if (ip) return `http://${ip}:5000`;
  return LOCAL_LAN_API_FALLBACK;
}

const getApiBaseUrl = () => {
  if (Platform.OS === 'web') {
    return __DEV__ ? 'http://localhost:5000' : PRODUCTION_API;
  }

  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  const fromExtra = (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL as string | undefined)?.trim();
  const configured = fromEnv || fromExtra;

  // Expo Go / metro: sempre backend local. Ignore Railway vindo do app.json/eas.
  if (__DEV__) {
    if (configured && !isRemoteProductionUrl(configured)) {
      return normalizeBaseUrl(configured);
    }
    return normalizeBaseUrl(getDevLanApi());
  }

  if (configured) {
    return normalizeBaseUrl(configured);
  }

  return normalizeBaseUrl(PRODUCTION_API);
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  ENDPOINTS: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    PROFILE: '/api/auth/profile',
    PUNCH: '/api/time-records/punch',
    MY_RECORDS: '/api/time-records/my-records',
    BANK_HOURS: '/api/time-records/my-records/bank-hours',
  },
};

export const buildApiUrl = (path: string) => `${API_CONFIG.BASE_URL}${path}`;
