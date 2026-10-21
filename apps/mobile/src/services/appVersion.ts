import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { buildApiUrl } from '../config/api';

export type AppUpdateMode = 'none' | 'optional' | 'required';

export type AppUpdateInfo = {
  mode: AppUpdateMode;
  currentVersion: string;
  latestVersion: string | null;
  storeUrl: string | null;
  message: string | null;
};

/** Versão do app instalado (a do binário; no Expo Go não há versão própria pra checar). */
export function getInstalledVersion(): string | null {
  // Expo Go e web: a versão é do Expo Go/navegador, não do app — não tem o que atualizar.
  if (Platform.OS === 'web' || Constants.appOwnership === 'expo') return null;
  return Application.nativeApplicationVersion || Constants.expoConfig?.version || null;
}

/** Compara "1.2.10" com "1.2.9": negativo se a < b, 0 se iguais, positivo se a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Pergunta ao servidor qual a versão mínima e a mais recente do app e compara com a instalada.
 * Nunca lança: sem rede/erro, simplesmente não há aviso.
 */
export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  const current = getInstalledVersion();
  if (!current) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      buildApiUrl(`/api/app-version?platform=${Platform.OS === 'ios' ? 'ios' : 'android'}`),
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const data = json?.data as
      | { minVersion?: string | null; latestVersion?: string | null; storeUrl?: string | null; message?: string | null }
      | undefined;
    if (!data) return null;

    let mode: AppUpdateMode = 'none';
    if (data.minVersion && compareVersions(current, data.minVersion) < 0) {
      mode = 'required';
    } else if (data.latestVersion && compareVersions(current, data.latestVersion) < 0) {
      mode = 'optional';
    }
    return {
      mode,
      currentVersion: current,
      latestVersion: data.latestVersion ?? null,
      storeUrl: data.storeUrl ?? null,
      message: data.message ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
