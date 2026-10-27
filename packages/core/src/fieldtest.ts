import type { BikeType } from './bikes.ts';
import type { RideSummary } from './upload.ts';

/**
 * Kennzahlen für den Adminbereich im Feldtest (E22-6). Rechnet nur mit den Zusammenfassungen,
 * nie mit Punkten, damit dasselbe später für die zusammengefassten Zahlen im Normalbetrieb taugt.
 */

/** Eine hochgeladene Fahrt in Listen des Adminbereichs */
export interface AdminRide {
  id: string;
  userId: string;
  /** Chaser-Name des Fahrers */
  userName: string | null;
  startedAt: number;
  endedAt: number | null;
  uploadedAt: number;
  summary: RideSummary;
}

export interface AdminTester {
  id: string;
  name: string | null;
  email: string | null;
  bike: BikeType | null;
  createdAt: number;
  consentAt: number | null;
  rides: number;
  distance: number;
  lastRide: number | null;
  /** Gerät der letzten Fahrt, z. B. „Pixel 10 Pro · Android 16 · Chrome 141“ */
  device: string | null;
}

export interface WeekStats {
  /** Montag 0:00 der Woche (lokale Zeit des Servers) */
  start: number;
  activeTesters: number;
  rides: number;
  distance: number;
}

export interface Share {
  label: string;
  rides: number;
}

export type SuspiciousReason = 'plausibility' | 'gaps' | 'incomplete' | 'hidden';

export interface FieldTestStats {
  testers: number;
  /** Tester mit mindestens einer Fahrt in den letzten 7 Tagen */
  activeTesters: number;
  rides: number;
  distance: number;
  movingTime: number;
  weeks: WeekStats[];
  duels: number;
  duelsWon: number;
  /** Anteil Fahrten mit mindestens einer Empfangslücke (0–1), null ohne Fahrten */
  gapShare: number | null;
  /** Mittlere GPS-Genauigkeit über alle Rohpunkte in m */
  accuracy: number | null;
  /** Mittlerer Akkuverbrauch in Prozentpunkten pro Stunde über die messbaren Fahrten */
  batteryPerHour: number | null;
  batteryRides: number;
  byDevice: Share[];
  byBrowser: Share[];
  byOs: Share[];
  /** Auffällige Fahrten, die neueste zuerst */
  suspicious: { ride: AdminRide; reasons: SuspiciousReason[] }[];
}

const DAY_MS = 24 * 3600 * 1000;
/** Ab so vielen Lücken oder App-Wechseln gilt eine Fahrt als auffällig */
const MANY = 3;

/** Montag 0:00 der Woche, in der t liegt */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function suspiciousReasons(s: RideSummary): SuspiciousReason[] {
  const out: SuspiciousReason[] = [];
  if (!s.plausible) out.push('plausibility');
  if (s.gaps >= MANY) out.push('gaps');
  if (s.hidden >= MANY) out.push('hidden');
  if (!s.complete) out.push('incomplete');
  return out;
}

function shares(rides: readonly AdminRide[], key: (r: AdminRide) => string): Share[] {
  const m = new Map<string, number>();
  for (const r of rides) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m].map(([label, n]) => ({ label, rides: n })).sort((a, b) => b.rides - a.rides || a.label.localeCompare(b.label));
}

export function fieldTestStats(
  rides: readonly AdminRide[],
  testers: number,
  { now = Date.now(), weeks = 8 }: { now?: number; weeks?: number } = {},
): FieldTestStats {
  const firstWeek = weekStart(now) - (weeks - 1) * 7 * DAY_MS;
  const weekList: WeekStats[] = [];
  const weekUsers: Set<string>[] = [];
  for (let i = 0; i < weeks; i++) {
    // Über Zeitumstellungen hinweg: Montag der i-ten Woche neu bestimmen
    weekList.push({ start: weekStart(firstWeek + i * 7 * DAY_MS + 3 * DAY_MS), activeTesters: 0, rides: 0, distance: 0 });
    weekUsers.push(new Set());
  }

  const active = new Set<string>();
  let distance = 0;
  let movingTime = 0;
  let duels = 0;
  let duelsWon = 0;
  let withGaps = 0;
  let accSum = 0;
  let accPoints = 0;
  let batSum = 0;
  let batN = 0;
  const suspicious: FieldTestStats['suspicious'] = [];

  for (const r of rides) {
    const s = r.summary;
    distance += s.distance;
    movingTime += s.movingTime;
    if (now - r.startedAt <= 7 * DAY_MS) active.add(r.userId);
    let w = weekList.length - 1;
    while (w >= 0 && weekList[w]!.start > r.startedAt) w--;
    if (w >= 0 && r.startedAt <= now) {
      weekList[w]!.rides++;
      weekList[w]!.distance += s.distance;
      weekUsers[w]!.add(r.userId);
    }
    if (s.duel) {
      duels++;
      if (s.duel.won) duelsWon++;
    }
    if (s.gaps > 0) withGaps++;
    if (s.accuracy != null && s.points) {
      accSum += s.accuracy * s.points;
      accPoints += s.points;
    }
    if (s.batteryPerHour != null) {
      batSum += s.batteryPerHour;
      batN++;
    }
    const reasons = suspiciousReasons(s);
    if (reasons.length) suspicious.push({ ride: r, reasons });
  }
  weekList.forEach((w, i) => (w.activeTesters = weekUsers[i]!.size));

  return {
    testers,
    activeTesters: active.size,
    rides: rides.length,
    distance,
    movingTime,
    weeks: weekList,
    duels,
    duelsWon,
    gapShare: rides.length ? withGaps / rides.length : null,
    accuracy: accPoints ? accSum / accPoints : null,
    batteryPerHour: batN ? batSum / batN : null,
    batteryRides: batN,
    byDevice: shares(rides, (r) => r.summary.device.model),
    byBrowser: shares(rides, (r) => r.summary.device.browser),
    byOs: shares(rides, (r) => r.summary.device.os),
    suspicious: suspicious.sort((a, b) => b.ride.startedAt - a.ride.startedAt).slice(0, 20),
  };
}
