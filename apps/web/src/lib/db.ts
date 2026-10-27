import type {
  BatteryRecord,
  BikeType,
  DeviceInfo,
  DuelRecord,
  ElevationProfile,
  Ghost,
  LatLon,
  MotionSample,
  TrackPoint,
} from '@rechase/core';

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
  /** Wie oft die App während der Fahrt verlassen oder der Bildschirm gesperrt wurde */
  hidden?: number;
  /** Gerätemodell und System, soweit der Browser sie verrät */
  device?: DeviceInfo;
  /** Ausgang des Duells, wenn gegen einen Ghost gefahren wurde */
  duel?: DuelRecord;
  /** Akkustand zu Beginn und Ende, wo messbar */
  battery?: BatteryRecord;
  /** Gegen diesen geteilten Ghost gefahren (Code des Challenge-Links) */
  challengeId?: string;
  /** Bewegungszeit auf der Strecke der Challenge in ms, null wenn nicht zu Ende gefahren */
  challengeTime?: number | null;
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

/** Ein geteilter Ghost eines anderen Chasers, über einen Challenge-Link übernommen */
export interface StoredChallenge {
  /** Code des Links */
  id: string;
  url: string;
  /** Name der Strecke */
  name: string;
  /** Chaser-Name des Herausforderers */
  chaser: string;
  bike: BikeType | null;
  /** Tag seiner Fahrt, YYYY-MM-DD */
  day: string;
  /** Strecke, an Start und Ende schon gekürzt */
  points: LatLon[];
  length: number;
  ghost: Ghost;
  /** Seine Bewegungszeit in ms */
  time: number;
  profile: ElevationProfile | null;
  importedAt: number;
  /** Eigene beste Zeit auf der Strecke in ms */
  bestTime?: number;
  bestRideId?: string;
  attempts: number;
}

const DB_NAME = 'rechase';
type StoreName = 'rides' | 'routes' | 'uploads' | 'challenges';

/** Stand einer Fahrt auf dem Server (Feldtest): welcher Fingerabdruck zuletzt hochgeladen wurde */
export interface UploadMark {
  id: string;
  fingerprint: string;
  at: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) db.createObjectStore('rides', { keyPath: 'id' });
      if (e.oldVersion < 2) db.createObjectStore('routes', { keyPath: 'id' });
      if (e.oldVersion < 3) db.createObjectStore('uploads', { keyPath: 'id' });
      if (e.oldVersion < 4) db.createObjectStore('challenges', { keyPath: 'id' });
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

export const saveChallenge = (c: StoredChallenge) => run('challenges', 'readwrite', (s) => s.put(c));
export const deleteChallenge = (id: string) => run('challenges', 'readwrite', (s) => s.delete(id));
export const listChallenges = async () =>
  (await run<StoredChallenge[]>('challenges', 'readonly', (s) => s.getAll())).sort((a, b) => b.importedAt - a.importedAt);

export const saveUploadMark = (mark: UploadMark) => run('uploads', 'readwrite', (s) => s.put(mark));
export const listUploadMarks = () => run<UploadMark[]>('uploads', 'readonly', (s) => s.getAll());
export const clearUploadMarks = () => run('uploads', 'readwrite', (s) => s.clear());

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf iOS). */
export async function requestPersistence(): Promise<boolean> {
  return (await navigator.storage?.persist?.()) ?? false;
}
