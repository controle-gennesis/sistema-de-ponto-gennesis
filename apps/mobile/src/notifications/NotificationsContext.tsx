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
import { usePermissions } from '../hooks/usePermissions';
import { fetchMyDpRequests, STATUS_LABELS as DP_STATUS_LABELS } from '../services/dpRequests';
import { fetchMyWorkOrders } from '../services/gestaoOs';
import { useRealtimeUpdates } from './useRealtimeUpdates';
import { hasRegisteredPushToken, registerPushTokenWithServer } from './pushRegistration';
import { navigationRef } from '../navigation/navigationRef';
import api from '../services/api';
import {
  ActivityKind,
  ActivityNotification,
  StatusSnapshot,
  dpStatusMessage,
  dpStatusTitle,
  workOrderStatusMessage,
  workOrderStatusTitle,
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
  /** Não lidas por tipo (alimenta as bolinhas da tab bar). */
  unreadByKind: Record<ActivityKind, number>;
  /** Marca como lidas as notificações de um tipo (ao abrir a aba correspondente). */
  markKindRead: (kind: ActivityKind) => void;
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

function snapKey(kind: ActivityKind, id: string) {
  return `${kind}:${id}`;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { canSeeDpRequests, canSeeGestaoOs } = usePermissions();
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);
  const snapshotRef = useRef<StatusSnapshot>({});
  const seededRef = useRef(false);
  const pollingRef = useRef(false);
  /** Aviso em tempo real que chegou no meio de uma consulta: roda de novo ao terminar. */
  const rerunRef = useRef(false);

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
        kind: ActivityKind;
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

        let title: string;
        let body: string;
        if (row.kind === 'fuel') {
          title = fuelStatusTitle(row.status);
          body = fuelStatusMessage(row.status, row.displayCode);
        } else if (row.kind === 'workorder') {
          title = workOrderStatusTitle(row.status);
          body = workOrderStatusMessage(row.status, row.displayCode);
        } else if (row.kind === 'dp') {
          const label =
            (DP_STATUS_LABELS as Record<string, string>)[row.status] || row.status;
          title = dpStatusTitle(label);
          body = dpStatusMessage(label, row.displayCode);
        } else {
          title = reservationStatusTitle(row.status);
          body = reservationStatusMessage(row.status, row.displayCode);
        }

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

      // Com push do servidor ativo, o aviso do sistema já chega por lá (evita duplicar).
      void hasRegisteredPushToken().then((hasPush) => {
        if (!hasPush) void presentSystemNotifications(fresh);
      });

      setNotifications((curr) => {
        const ids = new Set(fresh.map((f) => f.id));
        const merged = [...fresh, ...curr.filter((c) => !ids.has(c.id))];
        void saveFeed(merged);
        return merged;
      });
    },
    [],
  );

  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    if (pollingRef.current) {
      rerunRef.current = true;
      return;
    }
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

      // Solicitações e chamados: falha em um não derruba os outros nem o resto do polling.
      const [dpResult, workOrderResult] = await Promise.allSettled([
        canSeeDpRequests ? fetchMyDpRequests('all') : Promise.resolve([]),
        canSeeGestaoOs ? fetchMyWorkOrders() : Promise.resolve([]),
      ]);
      const dpRows = dpResult.status === 'fulfilled' && Array.isArray(dpResult.value) ? dpResult.value : [];
      const workOrderRows =
        workOrderResult.status === 'fulfilled' && Array.isArray(workOrderResult.value)
          ? workOrderResult.value
          : [];

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
        ...dpRows.map((r) => ({
          kind: 'dp' as const,
          id: r.id,
          status: r.status,
          updatedAt: r.createdAt || new Date().toISOString(),
          displayCode: r.displayNumber != null ? String(r.displayNumber) : undefined,
        })),
        ...workOrderRows.map((r) => ({
          kind: 'workorder' as const,
          id: r.id,
          status: r.status,
          updatedAt: new Date().toISOString(),
          displayCode:
            r.osNumber != null ? `OS ${r.osNumber}` : r.displayNumber != null ? String(r.displayNumber) : undefined,
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
      if (rerunRef.current) {
        rerunRef.current = false;
        void refreshRef.current();
      }
    }
  }, [applyDiff, canSeeDpRequests, canSeeGestaoOs, isAuthenticated, user?.id]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

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

  // Tempo real: o backend avisa quando algo muda e o refresh roda na hora.
  useRealtimeUpdates(isAuthenticated, () => {
    void refresh();
  });

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

  const markKindRead = useCallback((kind: ActivityKind) => {
    setNotifications((curr) => {
      if (!curr.some((n) => n.kind === kind && !n.read)) return curr;
      const next = curr.map((n) => (n.kind === kind && !n.read ? { ...n, read: true } : n));
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
    // Tocar num push abre direto a aba do assunto; sem dado, abre a lista de notificações.
    return addNotificationOpenListener((data) => {
      const route =
        data?.kind === 'fuel'
          ? 'Combustivel'
          : data?.kind === 'reservation'
            ? 'Reservas'
            : data?.kind === 'dp'
              ? 'DpRequests'
              : data?.kind === 'workorder'
                ? 'GestaoOs'
                : null;
      if (route && navigationRef.isReady()) {
        navigationRef.navigate('Main', { screen: route });
        return;
      }
      openSheet();
    });
  }, [openSheet]);

  // Push com o app fechado: registra este aparelho na conta logada.
  useEffect(() => {
    if (!isAuthenticated || Platform.OS === 'web') return;
    void registerPushTokenWithServer();
  }, [isAuthenticated, user?.id]);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0),
    [notifications],
  );

  const unreadByKind = useMemo(() => {
    const acc: Record<ActivityKind, number> = { fuel: 0, reservation: 0, dp: 0, workorder: 0 };
    for (const n of notifications) {
      if (!n.read) acc[n.kind] += 1;
    }
    return acc;
  }, [notifications]);

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
      unreadByKind,
      markKindRead,
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
      unreadByKind,
      markKindRead,
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
      unreadByKind: { fuel: 0, reservation: 0, dp: 0, workorder: 0 } as Record<ActivityKind, number>,
      markKindRead: (_kind: ActivityKind) => undefined,
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
