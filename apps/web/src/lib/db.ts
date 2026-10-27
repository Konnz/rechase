import type { BikeType, LatLon, MotionSample, TrackPoint } from '@rechase/core';

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
  /** Bezug der Höhen: Meeresspiegel oder WGS84-Ellipsoid (Fahrten vor der Geoid-Korrektur, Android) */
  altitudeRef?: 'msl' | 'ellipsoid';
  /** Strecke, auf der die Fahrt gefahren wurde (als Duell oder nachträglich erkannt) */
  routeId?: string;
  /** Bewegungszeit vom Start- bis zum Zielpunkt der Strecke in ms, null wenn nicht zu Ende gefahren */
  routeTime?: number | null;
  /** Gefahrenes Rad; bestimmt die Wertungsklasse (fehlt bei Fahrten vor dem Onboarding) */
  bike?: BikeType;
  /**
   * Widerspruch des Fahrers gegen die Plausibilitätsprüfung: Die Fahrt zählt dann für die eigenen Bestzeiten.
   * Öffentliche Ghosts prüft später der Server.
   */
  appealedAt?: number;
}

/** Eine gemerkte Strecke mit ihrer Bestzeit. Der Ghost wird bei Bedarf aus der Bestzeit-Fahrt berechnet. */
export interface StoredRoute {
  id: string;
  name: string;
  createdAt: number;
  /** Ausgedünnte Spur der Fahrt, aus der die Strecke entstand */
  points: LatLon[];
  length: number;
  bestRideId: string;
  /** Bewegungszeit der Bestzeit in ms */
  bestTime: number;
  /** Startzeit der Bestzeit-Fahrt */
  bestAt: number;
  /** Vollständige Fahrten auf der Strecke */
  attempts: number;
}

const DB_NAME = 'rechase';
type StoreName = 'rides' | 'routes';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) db.createObjectStore('rides', { keyPath: 'id' });
      if (e.oldVersion < 2) db.createObjectStore('routes', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const saveRide = (ride: StoredRide) => run('rides', 'readwrite', (s) => s.put(ride));
export const getRide = (id: string) => run<StoredRide | undefined>('rides', 'readonly', (s) => s.get(id));
export const deleteRide = (id: string) => run('rides', 'readwrite', (s) => s.delete(id));
export const listRides = async () =>
  (await run<StoredRide[]>('rides', 'readonly', (s) => s.getAll())).sort((a, b) => b.startedAt - a.startedAt);

export const saveRoute = (route: StoredRoute) => run('routes', 'readwrite', (s) => s.put(route));
export const deleteRoute = (id: string) => run('routes', 'readwrite', (s) => s.delete(id));
export const listRoutes = async () =>
  (await run<StoredRoute[]>('routes', 'readonly', (s) => s.getAll())).sort((a, b) => a.name.localeCompare(b.name));

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf iOS). */
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
