import type { MotionSample, TrackPoint } from '@rechase/core';

/** Eine aufgezeichnete Fahrt, wie sie lokal in IndexedDB liegt. */
export interface StoredRide {
  id: string;
  startedAt: number;
  endedAt: number | null;
  /** Alle Rohpunkte, auch verworfene, für die Auswertung im Tech-Spike */
  raw: TrackPoint[];
  samples: MotionSample[];
  gaps: number;
  rejected: number;
  userAgent: string;
}

const DB_NAME = 'rechase';
const STORE = 'rides';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveRide = (ride: StoredRide) => run('readwrite', (s) => s.put(ride));
export const deleteRide = (id: string) => run('readwrite', (s) => s.delete(id));
export const listRides = async () =>
  (await run<StoredRide[]>('readonly', (s) => s.getAll())).sort((a, b) => b.startedAt - a.startedAt);

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf iOS). */
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
