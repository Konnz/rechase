import { isBikeType, type BikeType } from './bikes.ts';
import { checkPlausibility, type PlausibilityRule } from './plausibility.ts';
import { rideStats } from './stats.ts';
import type { MotionSample, TrackPoint } from './types.ts';

/**
 * Fahrten für den Feldtest (E22): Was das Gerät hochlädt und was der Server daraus zusammenfasst.
 * Läuft ohne Browser-APIs, damit Web-App, spätere native Hülle und Server dieselben Typen nutzen.
 */

/** Gerät, soweit der Browser es verrät. Chrome auf Android nennt das Modell nur über User-Agent Client Hints. */
export interface DeviceInfo {
  model?: string;
  platform?: string;
  platformVersion?: string;
  mobile?: boolean;
}

/** Akkustand (0–1) zu Beginn und Ende der Fahrt, wo der Browser ihn verrät (Chrome ja, Safari nein) */
export interface BatteryRecord {
  start: number;
  end: number | null;
  /** Hing das Gerät zwischendurch am Strom? Dann taugt die Fahrt nicht für den Verbrauch. */
  charging: boolean;
}

/** Ausgang eines Duells gegen einen Ghost, so wie ihn der Fahrer erlebt hat */
export interface DuelRecord {
  /** Kurzname des Gegners, z. B. „Bestzeit“ oder „Letzte Fahrt“ */
  opponent: string;
  /** Zielzeit des Ghosts in ms */
  opponentTime: number;
  /** Eigene Zeit vom Start- bis zum Zielpunkt in ms, null wenn nicht ins Ziel gekommen */
  time: number | null;
}

/** Eine Fahrt, wie sie zum Server geht */
export interface RideUpload {
  id: string;
  startedAt: number;
  endedAt: number | null;
  raw: TrackPoint[];
  samples: MotionSample[];
  gaps: number;
  rejected: number;
  /** Wie oft die App während der Fahrt verlassen oder der Bildschirm gesperrt wurde */
  hidden?: number;
  userAgent: string;
  device?: DeviceInfo;
  altitudeRef?: 'msl' | 'ellipsoid';
  bike?: BikeType;
  appealedAt?: number;
  /** Strecke, auf der die Fahrt lag, mit der Bestzeit zum Zeitpunkt des Hochladens */
  route?: { id: string; name: string; time: number | null; bestTime: number; isBest: boolean };
  duel?: DuelRecord;
  battery?: BatteryRecord;
}

export interface DeviceSummary {
  /** z. B. „Pixel 10 Pro“ oder „iPhone“ */
  model: string;
  /** z. B. „Android 16“ oder „iOS 18.4“ */
  os: string;
  /** z. B. „Chrome 141“ */
  browser: string;
}

/** Kennzahlen einer hochgeladenen Fahrt für Listen und Dashboard */
export interface RideSummary {
  complete: boolean;
  distance: number;
  movingTime: number;
  elapsed: number;
  pausedTime: number;
  stops: number;
  ascent: number | null;
  gaps: number;
  rejected: number;
  hidden: number;
  points: number;
  /** Mittlere Genauigkeit der Rohpunkte in m */
  accuracy: number | null;
  bike: BikeType | null;
  /** Besteht die Plausibilitätsprüfung (E21-2) */
  plausible: boolean;
  flags: PlausibilityRule[];
  appealed: boolean;
  routeName: string | null;
  routeTime: number | null;
  duel: { opponent: string; won: boolean; finished: boolean } | null;
  /** Akkuverbrauch in Prozentpunkten pro Stunde, null wenn nicht messbar */
  batteryPerHour: number | null;
  device: DeviceSummary;
}

const MIN_BATTERY_MS = 10 * 60 * 1000;

/** Fasst eine Fahrt zusammen; die Plausibilität rechnet der Server selbst nach. */
export function summarizeRide(r: RideUpload): RideSummary {
  const stats = rideStats(r.samples);
  const check = checkPlausibility(r.samples, r.bike);
  const accs = r.raw.map((p) => p.accuracy).filter((a) => Number.isFinite(a));
  const b = r.battery;
  const span = (r.endedAt ?? r.raw.at(-1)?.t ?? r.startedAt) - r.startedAt;
  const batteryPerHour =
    b && b.end != null && b.end <= b.start && !b.charging && span >= MIN_BATTERY_MS ? ((b.start - b.end) * 100) / (span / 3_600_000) : null;
  return {
    complete: r.endedAt != null,
    distance: stats.distance,
    movingTime: stats.movingTime,
    elapsed: stats.elapsed,
    pausedTime: stats.pausedTime,
    stops: stats.stops,
    ascent: stats.ascent,
    gaps: r.gaps,
    rejected: r.rejected,
    hidden: r.hidden ?? 0,
    points: r.raw.length,
    accuracy: accs.length ? accs.reduce((s, a) => s + a, 0) / accs.length : null,
    bike: r.bike ?? null,
    plausible: check.ok,
    flags: check.flags.map((f) => f.rule),
    appealed: r.appealedAt != null,
    routeName: r.route?.name ?? null,
    routeTime: r.route?.time ?? null,
    duel: r.duel
      ? { opponent: r.duel.opponent, won: r.duel.time != null && r.duel.time < r.duel.opponentTime, finished: r.duel.time != null }
      : null,
    batteryPerHour,
    device: describeDevice(r.userAgent, r.device),
  };
}

/** Modell, Betriebssystem und Browser aus User-Agent und Client Hints, grob genug für eine Aufteilung. */
export function describeDevice(ua: string, hints?: DeviceInfo): DeviceSummary {
  const ios = /\b(iPhone|iPad|iPod)\b/.exec(ua);
  const iosVersion = /OS (\d+)[_.](\d+)/.exec(ua);
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  // Mit reduziertem User-Agent steht dort nur „K“ als Modell
  const uaModel = /Android [\d.]+; ([^;)]+)\)/.exec(ua)?.[1]?.trim();

  let os = 'Andere';
  if (ios) os = iosVersion ? `iOS ${iosVersion[1]}.${iosVersion[2]}` : 'iOS';
  else if (hints?.platform === 'Android' && hints.platformVersion) os = `Android ${hints.platformVersion.split('.')[0]}`;
  else if (android) os = `Android ${android[1]!.split('.')[0]}`;
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  const model =
    hints?.model?.trim() || ios?.[1] || (uaModel && uaModel !== 'K' ? uaModel : android ? 'Android-Gerät' : os);

  const v = (re: RegExp) => re.exec(ua)?.[1];
  let browser = 'Andere';
  if (v(/EdgA?\/(\d+)/)) browser = `Edge ${v(/EdgA?\/(\d+)/)}`;
  else if (v(/SamsungBrowser\/(\d+)/)) browser = `Samsung Internet ${v(/SamsungBrowser\/(\d+)/)}`;
  else if (v(/(?:Firefox|FxiOS)\/(\d+)/)) browser = `Firefox ${v(/(?:Firefox|FxiOS)\/(\d+)/)}`;
  else if (v(/CriOS\/(\d+)/)) browser = `Chrome ${v(/CriOS\/(\d+)/)}`;
  else if (v(/Chrome\/(\d+)/)) browser = `Chrome ${v(/Chrome\/(\d+)/)}`;
  else if (ios || /Safari/.test(ua)) browser = `Safari${v(/Version\/(\d+)/) ? ` ${v(/Version\/(\d+)/)}` : ''}`;

  return { model, os, browser };
}

const MAX_POINTS = 200_000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optNum = (v: unknown) => v == null || finite(v);
const str = (v: unknown, max = 200) => (typeof v === 'string' && v.length <= max ? v : undefined);

function validPoint(p: unknown): p is TrackPoint {
  if (!p || typeof p !== 'object') return false;
  const q = p as Record<string, unknown>;
  return (
    finite(q.t) &&
    finite(q.lat) &&
    finite(q.lon) &&
    Math.abs(q.lat) <= 90 &&
    Math.abs(q.lon) <= 180 &&
    finite(q.accuracy) &&
    optNum(q.alt) &&
    optNum(q.speed)
  );
}

function validSample(p: unknown): p is MotionSample {
  if (!validPoint(p)) return false;
  const q = p as unknown as Record<string, unknown>;
  return finite(q.speed) && typeof q.moving === 'boolean' && finite(q.distance) && finite(q.movingTime) && finite(q.elapsed);
}

/**
 * Prüft eine hochgeladene Fahrt und übernimmt nur bekannte Felder.
 * Liefert die bereinigte Fahrt oder eine Fehlermeldung.
 */
export function parseRideUpload(data: unknown): { ride: RideUpload } | { error: string } {
  if (!data || typeof data !== 'object') return { error: 'Keine Fahrt.' };
  const d = data as Record<string, unknown>;
  const id = str(d.id, 64);
  if (!id || !/^[\w-]+$/.test(id)) return { error: 'Ungültige Fahrt-ID.' };
  if (!finite(d.startedAt) || !(d.endedAt == null || finite(d.endedAt))) return { error: 'Ungültige Zeiten.' };
  if (!Array.isArray(d.raw) || !Array.isArray(d.samples)) return { error: 'Punkte fehlen.' };
  if (d.raw.length > MAX_POINTS || d.samples.length > MAX_POINTS) return { error: 'Zu viele Punkte.' };
  if (!d.raw.every(validPoint) || !d.samples.every(validSample)) return { error: 'Ungültige Punkte.' };

  const ride: RideUpload = {
    id,
    startedAt: d.startedAt,
    endedAt: (d.endedAt as number | null | undefined) ?? null,
    raw: d.raw.map((p: TrackPoint) => ({
      t: p.t,
      lat: p.lat,
      lon: p.lon,
      alt: p.alt ?? null,
      speed: p.speed ?? null,
      accuracy: p.accuracy,
    })),
    samples: d.samples.map((s: MotionSample) => ({
      t: s.t,
      lat: s.lat,
      lon: s.lon,
      alt: s.alt ?? null,
      speed: s.speed,
      accuracy: s.accuracy,
      moving: s.moving,
      distance: s.distance,
      movingTime: s.movingTime,
      elapsed: s.elapsed,
    })),
    gaps: finite(d.gaps) ? d.gaps : 0,
    rejected: finite(d.rejected) ? d.rejected : 0,
    userAgent: str(d.userAgent, 1000) ?? '',
  };
  if (finite(d.hidden)) ride.hidden = d.hidden;
  if (d.altitudeRef === 'msl' || d.altitudeRef === 'ellipsoid') ride.altitudeRef = d.altitudeRef;
  if (isBikeType(d.bike)) ride.bike = d.bike;
  if (finite(d.appealedAt)) ride.appealedAt = d.appealedAt;

  if (d.device && typeof d.device === 'object') {
    const v = d.device as Record<string, unknown>;
    ride.device = {
      ...(str(v.model, 100) ? { model: str(v.model, 100) } : {}),
      ...(str(v.platform, 50) ? { platform: str(v.platform, 50) } : {}),
      ...(str(v.platformVersion, 50) ? { platformVersion: str(v.platformVersion, 50) } : {}),
      ...(typeof v.mobile === 'boolean' ? { mobile: v.mobile } : {}),
    };
  }
  if (d.route && typeof d.route === 'object') {
    const v = d.route as Record<string, unknown>;
    const rid = str(v.id, 64);
    const name = str(v.name, 200);
    if (rid && name && finite(v.bestTime) && optNum(v.time)) {
      ride.route = { id: rid, name, time: (v.time as number | null) ?? null, bestTime: v.bestTime, isBest: v.isBest === true };
    }
  }
  if (d.duel && typeof d.duel === 'object') {
    const v = d.duel as Record<string, unknown>;
    const opponent = str(v.opponent, 100);
    if (opponent && finite(v.opponentTime) && optNum(v.time)) {
      ride.duel = { opponent, opponentTime: v.opponentTime, time: (v.time as number | null) ?? null };
    }
  }
  if (d.battery && typeof d.battery === 'object') {
    const v = d.battery as Record<string, unknown>;
    if (finite(v.start) && optNum(v.end)) {
      ride.battery = { start: v.start, end: (v.end as number | null) ?? null, charging: v.charging === true };
    }
  }
  return { ride };
}
