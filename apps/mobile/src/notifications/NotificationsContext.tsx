import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ActivityNotification,
  StatusSnapshot,
  fuelStatusMessage,
  fuelStatusTitle,
  loadFeed,
  loadSnapshot,
  reservationStatusMessage,
  reservationStatusTitle,
  saveFeed,
  saveSnapshot,
} from './activityStorage';
import {
  addNotificationOpenListener,
  ensureSystemNotificationPermissions,
  presentSystemNotifications,
  syncAppIconBadge,
} from './systemNotifications';
const POLL_MS = 40_000;

type NotificationsContextValue = {
  notifications: ActivityNotification[];
  unreadCount: number;
  sheetVisible: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  markAllRead: () => void;
  markAsRead: (id: string) => void;
  removeNotification: (id: string) => void;
  refresh: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

type FuelRow = {
  id: string;
  status: string;
  displayNumber?: number | string | null;
  updatedAt?: string;
  createdAt?: string;
  vehiclePlate?: string | null;
  route?: string | null;
};

type ReservationRow = {
  id: string;
  status: string;
  code?: string | null;
  updatedAt?: string;
  createdAt?: string;
  createdById?: string | null;
  createdBy?: { id?: string } | null;
  solicitante?: string | null;
  veiculo?: { plate?: string | null; model?: string | null } | null;
  veiculoPlaca?: string | null;
};

function snapKey(kind: 'fuel' | 'reservation', id: string) {
  return `${kind}:${id}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const snapshotRef = useRef<StatusSnapshot>({});
  const seededRef = useRef(false);
  const pollingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [snap, feed] = await Promise.all([loadSnapshot(), loadFeed()]);
      if (cancelled) return;
      snapshotRef.current = snap;
      seededRef.current = Object.keys(snap).length > 0;
      setNotifications(feed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyDiff = useCallback(
    (
      rows: Array<{
        kind: 'fuel' | 'reservation';
        id: string;
        status: string;
        updatedAt: string;
        displayCode?: string;
      }>,
    ) => {
      const prev = snapshotRef.current;
      const next: StatusSnapshot = { ...prev };
      const fresh: ActivityNotification[] = [];
      const now = new Date().toISOString();

      for (const row of rows) {
        const key = snapKey(row.kind, row.id);
        const before = prev[key];
        next[key] = { status: row.status, updatedAt: row.updatedAt };

        if (!seededRef.current) continue;
        if (!before) continue;
        if (before.status === row.status) continue;

        const title =
          row.kind === 'fuel'
            ? fuelStatusTitle(row.status)
            : reservationStatusTitle(row.status);
        const body =
          row.kind === 'fuel'
            ? fuelStatusMessage(row.status, row.displayCode)
            : reservationStatusMessage(row.status, row.displayCode);

        fresh.push({
          id: `${key}:${row.status}:${row.updatedAt}`,
          entityId: row.id,
          kind: row.kind,
          status: row.status,
          title,
          body,
          displayCode: row.displayCode || null,
          updatedAt: row.updatedAt,
          detectedAt: now,
          read: false,
        });
      }

      snapshotRef.current = next;
      void saveSnapshot(next);
      if (!seededRef.current) {
        seededRef.current = true;
        return;
      }
      if (fresh.length === 0) return;

      void presentSystemNotifications(fresh);

      setNotifications((curr) => {
        const ids = new Set(fresh.map((f) => f.id));
        const merged = [...fresh, ...curr.filter((c) => !ids.has(c.id))];
        void saveFeed(merged);
        return merged;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const [fuelRes, reservationRes] = await Promise.all([
        api.get('/api/fuel-refuel-requests/mine'),
        api.get('/api/vehicle-reservations/mine?limit=100&page=1'),
      ]);

      const fuelJson = await fuelRes.json().catch(() => ({}));
      const reservationJson = await reservationRes.json().catch(() => ({}));

      const fuelRows = (fuelRes.ok ? (fuelJson?.data || []) : []) as FuelRow[];
      const myReservations = (reservationRes.ok ? (reservationJson?.data || []) : []) as ReservationRow[];

      const normalized = [
        ...fuelRows.map((r) => ({
          kind: 'fuel' as const,
          id: r.id,
          status: r.status,
          updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
          displayCode:
            r.displayNumber != null && String(r.displayNumber).trim()
              ? String(r.displayNumber)
              : undefined,
        })),
        ...myReservations.map((r) => ({
          kind: 'reservation' as const,
          id: r.id,
          status: r.status,
          updatedAt: r.updatedAt || r.createdAt || new Date().toISOString(),
          displayCode: r.code?.trim() || undefined,
        })),
      ];

      applyDiff(normalized);
    } catch {
      // silencioso: badge/feed não devem quebrar o app
    } finally {
      pollingRef.current = false;
    }
  }, [applyDiff, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (Platform.OS !== 'web') {
      void ensureSystemNotificationPermissions();
    }
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refresh]);

  const markAllRead = useCallback(() => {
    setNotifications((curr) => {
      const next = curr.map((n) => (n.read ? n : { ...n, read: true }));
      void saveFeed(next);
      return next;
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((curr) => {
      const next = curr.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n));
      void saveFeed(next);
      return next;
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((curr) => {
      const next = curr.filter((n) => n.id !== id);
      void saveFeed(next);
      return next;
    });
  }, []);

  const openSheet = useCallback(() => {
    setSheetVisible(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    return addNotificationOpenListener(openSheet);
  }, [openSheet]);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [notifications],
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void syncAppIconBadge(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      void syncAppIconBadge(0);
    }
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      sheetVisible,
      openSheet,
      closeSheet,
      markAllRead,
      markAsRead,
      removeNotification,
      refresh,
    }),
    [
      notifications,
      unreadCount,
      sheetVisible,
      openSheet,
      closeSheet,
      markAllRead,
      markAsRead,
      removeNotification,
      refresh,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    return {
      notifications: [] as ActivityNotification[],
      unreadCount: 0,
      sheetVisible: false,
      openSheet: () => undefined,
      closeSheet: () => undefined,
      markAllRead: () => undefined,
      markAsRead: (_id: string) => undefined,
      removeNotification: (_id: string) => undefined,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
