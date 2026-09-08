import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ActivityNotification } from './activityStorage';

const ANDROID_CHANNEL_ID = 'gennesis-activity';

/** Expo Go: appOwnership === 'expo' (evita named export quebrado no Hermes). */
function isExpoGo() {
  return Constants.appOwnership === 'expo';
}

/**
 * No Expo Go Android (SDK 53+), só importar `expo-notifications` dispara
 * addPushTokenListener e lança Error fatal. Local + push ficam só em dev/build nativo.
 */
const notificationsUnsupported = Platform.OS === 'android' && isExpoGo();

type NotificationsModule = {
  AndroidImportance: { HIGH: number };
  setNotificationHandler: (handler: {
    handleNotification: () => Promise<{
      shouldShowBanner: boolean;
      shouldShowList: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }) => void;
  setNotificationChannelAsync: (id: string, opts: Record<string, unknown>) => Promise<unknown>;
  getPermissionsAsync: () => Promise<{ status: string }>;
  requestPermissionsAsync: () => Promise<{ status: string }>;
  scheduleNotificationAsync: (opts: Record<string, unknown>) => Promise<unknown>;
  setBadgeCountAsync: (count: number) => Promise<unknown>;
  addNotificationResponseReceivedListener: (listener: () => void) => { remove: () => void };
};

let Notifications: NotificationsModule | null = null;
let permissionsReady: Promise<boolean> | null = null;
let handlerConfigured = false;

function getNotifications(): NotificationsModule | null {
  if (notificationsUnsupported) return null;
  if (!Notifications) {
    try {
      // require lazy: evita carregar o módulo no Expo Go Android
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Notifications = require('expo-notifications') as NotificationsModule;
    } catch {
      return null;
    }
  }
  return Notifications;
}

function ensureHandler(mod: NotificationsModule) {
  if (handlerConfigured) return;
  handlerConfigured = true;
  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function ensureAndroidChannel(mod: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await mod.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Atualizações',
    importance: mod.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
    lightColor: '#ce3736',
    sound: 'default',
  });
}

export async function ensureSystemNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || notificationsUnsupported) return false;
  const mod = getNotifications();
  if (!mod) return false;

  if (!permissionsReady) {
    permissionsReady = (async () => {
      try {
        ensureHandler(mod);
        await ensureAndroidChannel(mod);
        const current = await mod.getPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
          const requested = await mod.requestPermissionsAsync();
          status = requested.status;
        }
        return status === 'granted';
      } catch {
        return false;
      }
    })();
  }
  return permissionsReady;
}

export async function presentSystemNotification(item: ActivityNotification) {
  if (Platform.OS === 'web' || notificationsUnsupported) return;
  const mod = getNotifications();
  if (!mod) return;

  const ok = await ensureSystemNotificationPermissions();
  if (!ok) return;

  try {
    ensureHandler(mod);
    await mod.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body,
        sound: true,
        data: {
          notificationId: item.id,
          entityId: item.entityId,
          kind: item.kind,
          status: item.status,
        },
        ...(Platform.OS === 'android'
          ? { channelId: ANDROID_CHANNEL_ID, color: '#ce3736' }
          : {}),
      },
      trigger: null,
    });
  } catch {
    // não quebrar o fluxo do app se a notificação do SO falhar
  }
}

export async function presentSystemNotifications(items: ActivityNotification[]) {
  for (const item of items) {
    await presentSystemNotification(item);
  }
}

export async function syncAppIconBadge(count: number) {
  if (Platform.OS === 'web' || notificationsUnsupported) return;
  const mod = getNotifications();
  if (!mod) return;
  try {
    const ok = await ensureSystemNotificationPermissions();
    if (!ok) return;
    await mod.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // ignore
  }
}

/** Abre o sheet ao tocar numa notificação do sistema. No-op no Expo Go Android. */
export function addNotificationOpenListener(onOpen: () => void): () => void {
  if (Platform.OS === 'web' || notificationsUnsupported) return () => undefined;
  const mod = getNotifications();
  if (!mod) return () => undefined;
  try {
    ensureHandler(mod);
    const sub = mod.addNotificationResponseReceivedListener(() => {
      onOpen();
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
