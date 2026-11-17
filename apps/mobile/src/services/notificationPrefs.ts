import api from './api';
import { readApiData } from './http';

export type NotificationPref = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

export async function fetchNotificationPrefs(): Promise<NotificationPref[]> {
  const res = await api.get('/api/push-tokens/preferences');
  return (await readApiData<NotificationPref[]>(res)) ?? [];
}

export async function saveNotificationPref(category: string, enabled: boolean): Promise<void> {
  const res = await api.put('/api/push-tokens/preferences', { category, enabled });
  await readApiData(res);
}
