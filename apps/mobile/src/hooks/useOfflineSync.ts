import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncGestaoOsOfflineQueue } from '../services/gestaoOs';
import { syncPendingPunches } from '../services/punchOfflineQueue';

async function flushOfflineQueues() {
  await Promise.allSettled([syncGestaoOsOfflineQueue(), syncPendingPunches()]);
}

export function useOfflineSync(enabled: boolean) {
  const running = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        await flushOfflineQueues();
      } finally {
        running.current = false;
      }
    };

    void run();
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) void run();
    });
    return () => unsub();
  }, [enabled]);
}
