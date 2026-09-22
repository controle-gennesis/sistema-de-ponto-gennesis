import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { uploadMultipartFile } from '../utils/uploadMultipartFile';

const QUEUE_KEY = 'punch-offline-queue';

export type PendingPunch = {
  id: string;
  type: string;
  latitude: string;
  longitude: string;
  observation: string;
  clientTimestamp: string;
  punchQrToken?: string;
  photoUri: string;
};

async function readQueue(): Promise<PendingPunch[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as PendingPunch[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(list: PendingPunch[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list));
}

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/**
 * `photoUri` normalmente aponta pro cache temporário da câmera, que o SO pode limpar
 * antes de a conexão voltar. Copia pro diretório de documentos (durável) pra a foto
 * sobreviver até a sincronização — senão o item ficava preso na fila pra sempre.
 */
function persistPhotoLocally(uri: string, id: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const source = new File(uri);
    if (!source.exists) return uri;
    const dest = new File(Paths.document, `${id}.jpg`);
    source.copySync(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}

export async function enqueuePendingPunch(punch: Omit<PendingPunch, 'id'>) {
  const list = await readQueue();
  const id = `punch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const photoUri = persistPhotoLocally(punch.photoUri, id);
  list.push({ ...punch, id, photoUri });
  await writeQueue(list);
}

export async function pendingPunchCount() {
  return (await readQueue()).length;
}

export async function syncPendingPunches() {
  const list = await readQueue();
  if (!list.length) return { synced: 0, remaining: 0 };
  const remaining: PendingPunch[] = [];
  let synced = 0;
  for (const punch of list) {
    if (Platform.OS !== 'web' && !fileExists(punch.photoUri)) {
      // Foto não existe mais (ex.: app reinstalado) — nunca vai sincronizar, descarta
      // em vez de tentar pra sempre.
      continue;
    }
    try {
      await uploadMultipartFile({
        path: '/api/time-records/punch',
        fieldName: 'photo',
        file: { uri: punch.photoUri, name: 'punch_photo.jpg', type: 'image/jpeg' },
        fields: {
          type: punch.type,
          latitude: punch.latitude,
          longitude: punch.longitude,
          observation: punch.observation,
          clientTimestamp: punch.clientTimestamp,
          ...(punch.punchQrToken ? { punchQrToken: punch.punchQrToken } : {}),
        },
      });
      synced += 1;
      if (Platform.OS !== 'web') {
        try {
          new File(punch.photoUri).delete();
        } catch {
          /* limpeza best-effort */
        }
      }
    } catch {
      remaining.push(punch);
    }
  }
  await writeQueue(remaining);
  return { synced, remaining: remaining.length };
}
