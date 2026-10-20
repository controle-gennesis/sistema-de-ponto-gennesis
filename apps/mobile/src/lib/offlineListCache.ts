import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache das listas (última carga bem-sucedida) pra mostrar na hora ao abrir a tela e
 * continuar úteis sem sinal. Em memória + AsyncStorage; sempre por usuário (a chave leva o id)
 * e apagado no logout.
 */
const PREFIX = '@list_cache:';
const memory = new Map<string, unknown>();

export function listCacheKey(kind: string, userId?: string | null) {
  return `${kind}:${userId || 'anon'}`;
}

export async function readListCache<T>(key: string): Promise<T | null> {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeListCache<T>(key: string, data: T) {
  memory.set(key, data);
  void AsyncStorage.setItem(PREFIX + key, JSON.stringify(data)).catch(() => {});
}

export async function clearListCache() {
  memory.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // ignora
  }
}

/** Falha de rede (sem sinal/timeout), diferente de uma resposta de erro do servidor. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const msg = String((error as { message?: string } | null)?.message || '').toLowerCase();
  return /network|internet|offline|timeout|timed out|failed to fetch|conex/.test(msg);
}
