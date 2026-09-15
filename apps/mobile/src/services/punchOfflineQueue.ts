import AsyncStorage from '@react-native-async-storage/async-storage';
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

export async function enqueuePendingPunch(punch: Omit<PendingPunch, 'id'>) {
  const list = await readQueue();
  list.push({ ...punch, id: `punch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
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
    } catch {
      remaining.push(punch);
    }
  }
  await writeQueue(remaining);
  return { synced, remaining: remaining.length };
}
