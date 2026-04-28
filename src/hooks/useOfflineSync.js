import { useState, useEffect, useCallback } from 'react';
import { onSyncStatusChange, isOnline, fullSync } from '../services/syncEngine';

export default function useOfflineSync(userId) {
  const [status, setStatus] = useState(isOnline() ? 'synced' : 'offline');

  useEffect(() => {
    const unsubscribe = onSyncStatusChange(setStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (userId && isOnline()) {
      fullSync(userId).catch(console.error);
    }
  }, [userId]);

  const triggerSync = useCallback(() => {
    if (userId && isOnline()) {
      fullSync(userId).catch(console.error);
    }
  }, [userId]);

  return { status, isOnline: isOnline(), triggerSync };
}
