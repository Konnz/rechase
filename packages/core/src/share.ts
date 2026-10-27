import { isBikeType, type BikeType } from './bikes.ts';
import { distanceM } from './geo.ts';
import { buildGhost, ghostLength, ghostTimeAt, type Ghost } from './ghost.ts';
import {
  buildRoute,
  elevationProfile,
  finishTime,
  ghostFromSamples,
  ghostSpeedAt,
  type ElevationProfile,
  type LatLon,
} from './route.ts';
import type { SpeedProfile } from './stats.ts';
import type { MotionSample } from './types.ts';

/**
 * Ghosts teilen (E11, E18) mit Privatzonen (E11-6). Läuft ohne Browser-APIs: Die App baut den geteilten Ghost,
 * der Server prüft ihn mit derselben Funktion, und eine spätere native Hülle nutzt beides unverändert.
 */

// ---- Privatzonen ----

/** Feste Zone, z. B. Zuhause oder Arbeit. Beginnt oder endet eine geteilte Fahrt darin, wird sie dort abgeschnitten. */
export interface PrivacyZone {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Radius in m */
  radius: number;
}

/** Spanne der zufälligen Kürzung an Start und Ende in m */
export const PRIVACY_TRIM = { min: 300, max: 800 };
/** Erlaubte Radien fester Zonen in m */
export const ZONE_RADIUS = { min: 100, max: 2000, default: 300 };
/** Kürzer als das darf ein geteilter Ghost nach dem Kürzen nicht sein */
export const MIN_SHARE_M = 1000;

export interface PrivacyOptions {
  /** Start und Ende zufällig kürzen; standardmäßig an */
  trim: boolean;
  zones: readonly PrivacyZone[];
  /** Grundlage der Zufallsradien, z. B. die Fahrt-ID */
  seed: string;
}

/** FNV-1a, 32 bit */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Radien der Kürzung an Start und Ende. Zufällig verteilt, aber je Fahrt fest: Wer dieselbe Fahrt mehrmals teilt,
 * verrät durch den Vergleich der Ausschnitte nicht, wo sie wirklich begann.
 */
export function trimRadii(seed: string): { start: number; end: number } {
  const span = PRIVACY_TRIM.max - PRIVACY_TRIM.min;
  return {
    start: PRIVACY_TRIM.min + (hash(`${seed}:start`) / 0xffffffff) * span,
    end: PRIVACY_TRIM.min + (hash(`${seed}:end`) / 0xffffffff) * span,
  };
}

export interface PrivateRange {
  /** Erster behaltener Punkt */
  from: number;
  /** Erster Punkt nach dem behaltenen Stück */
  to: number;
  /** Am Anfang und am Ende weggelassene Strecke in m */
  cutStart: number;
  cutEnd: number;
}

/**
 * Welcher Teil einer Spur geteilt werden darf: Vom Anfang und vom Ende fällt alles weg, was im Zufallskreis um
 * den ersten bzw. letzten Punkt oder in einer festen Zone liegt. Fährt man unterwegs durch eine Zone, bleibt
 * das Stück drin; verraten würden Start und Ziel, nicht die Durchfahrt. Liefert null, wenn nichts übrig bleibt.
 */
export function privateRange(points: readonly LatLon[], opts: PrivacyOptions): PrivateRange | null {
  const n = points.length;
  if (n < 2) return null;
  const r = opts.trim ? trimRadii(opts.seed) : { start: 0, end: 0 };
  const hidden = (p: LatLon, anchor: LatLon, radius: number) =>
    distanceM(p, anchor) < radius || opts.zones.some((z) => distanceM(p, z) < z.radius);

  let from = 0;
  while (from < n && hidden(points[from], points[0], r.start)) from++;
  let to = n;
  while (to > from && hidden(points[to - 1], points[n - 1], r.end)) to--;
  if (to - from < 2) return null;

  const along = (a: number, b: number) => {
    let d = 0;
    for (let i = a + 1; i <= b; i++) d += distanceM(points[i - 1], points[i]);
    return d;
  };
  return { from, to, cutStart: along(0, from), cutEnd: along(to - 1, n - 1) };
}

/** Lässt die Punkte am Anfang und Ende weg, die privat bleiben; null, wenn nichts übrig bleibt. */
export function trimForPrivacy<T extends LatLon>(points: readonly T[], opts: PrivacyOptions): T[] | null {
  const r = privateRange(points, opts);
  return r ? points.slice(r.from, r.to) : null;
}

// ---- Geteilter Ghost ----

/** Ein geteilter Ghost, wie er zum Server geht und beim Empfänger ankommt. Strecke schon gekürzt. */
export interface SharedGhostData {
  /** Name der Strecke */
  name: string;
  points: LatLon[];
  /** Ghost entlang dieser Strecke */
  ghost: Ghost;
  /** Bewegungszeit vom Start bis ins Ziel in ms */
  time: number;
  /** Länge der Strecke in m */
  length: number;
  bike: BikeType | null;
  /** Tag der Fahrt, YYYY-MM-DD; die Uhrzeit bleibt privat */
  day: string;
  profile: ElevationProfile | null;
}

export const SHARE_LIMITS = { points: 20_000, name: 60, maxLength: 500_000, maxTime: 24 * 3600 * 1000 };
/** Auflösung des geteilten Ghosts in m; feiner bringt im Duell nichts */
const GHOST_STEP_M = 10;
/** Schneller als das ist über 30 s kein Rad (wie in der Plausibilitätsprüfung) */
const MAX_KMH = 80;
const MAX_KMH_WINDOW_MS = 30_000;

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Ghost in festen Schritten entlang der Strecke; hält die geteilten Daten klein. */
export function resampleGhost(g: Ghost, stepM = GHOST_STEP_M): Ghost {
  const len = ghostLength(g);
  if (g.distance.length < 2) return g;
  const out: { distance: number; movingTime: number }[] = [];
  for (let d = 0; d < len; d += stepM) out.push({ distance: d, movingTime: Math.round(ghostTimeAt(g, d) ?? 0) });
  out.push({ distance: round(len, 1), movingTime: Math.round(ghostTimeAt(g, len) ?? 0) });
  return buildGhost(out);
}

export interface BuildShareInput {
  name: string;
  /** Spur der Strecke: die gemerkte Strecke oder die Fahrt selbst */
  points: readonly LatLon[];
  samples: readonly MotionSample[];
  bike: BikeType | null;
  startedAt: number;
  privacy: PrivacyOptions;
}

/**
 * Baut aus einer Fahrt den Ghost zum Teilen: Strecke kürzen, Ghost und Zeit auf der gekürzten Strecke neu messen.
 * Fliegender Start an der neuen Startlinie, Auto-Pause wie immer.
 */
export function buildSharedGhost(
  input: BuildShareInput,
): { data: SharedGhostData; cutStart: number; cutEnd: number } | { error: string } {
  const range = privateRange(input.points, input.privacy);
  if (!range) return { error: 'Nach dem Kürzen für die Privatzonen bleibt nichts zum Teilen übrig.' };
  const route = buildRoute(input.points.slice(range.from, range.to));
  if (route.length < MIN_SHARE_M) {
    return { error: 'Nach dem Kürzen für die Privatzonen ist die Strecke zu kurz zum Teilen.' };
  }
  const full = ghostFromSamples(route, input.samples);
  const time = finishTime(route, full);
  if (time == null) return { error: 'Die Fahrt geht nicht ganz über die Strecke.' };
  const profile = elevationProfile(route, input.samples);
  const day = new Date(input.startedAt).toISOString().slice(0, 10);
  return {
    data: {
      name: input.name.trim().slice(0, SHARE_LIMITS.name) || 'Strecke',
      points: route.points.map((p) => ({ lat: round(p.lat, 6), lon: round(p.lon, 6) })),
      ghost: resampleGhost(full),
      time: Math.round(time),
      length: round(route.length, 1),
      bike: input.bike,
      day,
      profile: profile && downsampleProfile(profile),
    },
    cutStart: range.cutStart,
    cutEnd: range.cutEnd,
  };
}

function downsampleProfile(p: ElevationProfile, stepM = 20): ElevationProfile {
  const distance: number[] = [];
  const alt: number[] = [];
  for (let i = 0; i < p.distance.length; i++) {
    if (i && i < p.distance.length - 1 && p.distance[i] - distance[distance.length - 1] < stepM) continue;
    distance.push(round(p.distance[i], 1));
    alt.push(round(p.alt[i], 1));
  }
  return { distance, alt };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validLatLon = (p: unknown): p is LatLon => {
  const q = p as LatLon;
  return !!q && finite(q.lat) && finite(q.lon) && Math.abs(q.lat) <= 90 && Math.abs(q.lon) <= 180;
};

function numbers(v: unknown, max: number): number[] | null {
  return Array.isArray(v) && v.length <= max && v.every(finite) ? (v as number[]) : null;
}

/**
 * Prüft einen geteilten Ghost und übernimmt nur bekannte Felder. Lehnt ab, was kein Rad sein kann
 * (über 30 s schneller als 80 km/h), damit niemand mit dem Auto eine Challenge aufstellt.
 */
export function parseSharedGhost(data: unknown): { ghost: SharedGhostData } | { error: string } {
  if (!data || typeof data !== 'object') return { error: 'Kein Ghost.' };
  const d = data as Record<string, unknown>;
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, SHARE_LIMITS.name) : '';
  if (!name) return { error: 'Name der Strecke fehlt.' };
  if (!Array.isArray(d.points) || d.points.length < 2 || d.points.length > SHARE_LIMITS.points) {
    return { error: 'Ungültige Strecke.' };
  }
  if (!d.points.every(validLatLon)) return { error: 'Ungültige Punkte.' };
  const g = d.ghost as Record<string, unknown> | undefined;
  const distance = numbers(g?.distance, SHARE_LIMITS.points);
  const movingTime = numbers(g?.movingTime, SHARE_LIMITS.points);
  if (!distance || !movingTime || distance.length < 2 || distance.length !== movingTime.length) {
    return { error: 'Ungültiger Ghost.' };
  }
  for (let i = 1; i < distance.length; i++) {
    if (distance[i] <= distance[i - 1] || movingTime[i] < movingTime[i - 1]) return { error: 'Ungültiger Ghost.' };
  }
  if (distance[0] < 0 || movingTime[0] < 0) return { error: 'Ungültiger Ghost.' };
  if (!finite(d.time) || d.time <= 0 || d.time > SHARE_LIMITS.maxTime) return { error: 'Ungültige Zeit.' };
  if (!finite(d.length) || d.length < MIN_SHARE_M || d.length > SHARE_LIMITS.maxLength) {
    return { error: 'Ungültige Länge.' };
  }
  if (!(d.bike == null || isBikeType(d.bike))) return { error: 'Unbekannter Radtyp.' };
  if (typeof d.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.day)) return { error: 'Ungültiges Datum.' };

  // Kein Rad: über ein Fenster von 30 s Bewegungszeit schneller als 80 km/h
  for (let i = 0, j = 0; i < distance.length; i++) {
    // j: letzter Punkt, der mindestens 30 s vor i liegt
    while (j + 1 < i && movingTime[i] - movingTime[j + 1] >= MAX_KMH_WINDOW_MS) j++;
    const dt = movingTime[i] - movingTime[j];
    if (dt >= MAX_KMH_WINDOW_MS && ((distance[i] - distance[j]) / dt) * 3600 > MAX_KMH) {
      return { error: 'So schnell fährt kein Rad. Dieser Ghost wird nicht geteilt.' };
    }
  }
  if ((d.length / d.time) * 3600 > MAX_KMH) return { error: 'So schnell fährt kein Rad. Dieser Ghost wird nicht geteilt.' };

  let profile: ElevationProfile | null = null;
  const p = d.profile as Record<string, unknown> | null | undefined;
  if (p) {
    const pd = numbers(p.distance, SHARE_LIMITS.points);
    const pa = numbers(p.alt, SHARE_LIMITS.points);
    if (!pd || !pa || pd.length !== pa.length || pd.length < 2) return { error: 'Ungültiges Höhenprofil.' };
    profile = { distance: pd, alt: pa };
  }

  return {
    ghost: {
      name,
      points: (d.points as LatLon[]).map((q) => ({ lat: q.lat, lon: q.lon })),
      ghost: { distance, movingTime },
      time: d.time,
      length: d.length,
      bike: (d.bike as BikeType | null | undefined) ?? null,
      day: d.day,
      profile,
    },
  };
}

/** Tempoverlauf eines Ghosts entlang seiner Strecke, für die eingefärbte Karte in der Vorschau. */
export function ghostSpeedProfile(points: readonly LatLon[], ghost: Ghost): SpeedProfile {
  const route = buildRoute(points, 0);
  if (route.points.length < 2) return { coords: [], levels: [], progress: [], min: 0, max: 0 };
  const speeds = route.cum.map((d) => ghostSpeedAt(ghost, Math.min(d, ghostLength(ghost))) ?? 0);
  const sorted = speeds.filter((v) => v > 0).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))] ?? 0;
  const min = q(0.05);
  const max = Math.max(q(0.95), min + 0.5);
  return {
    coords: route.points.map((p) => [p.lon, p.lat]),
    levels: speeds.map((v) => Math.min(1, Math.max(0, (v - min) / (max - min)))),
    progress: route.cum.map((d) => (route.length > 0 ? d / route.length : 0)),
    min,
    max,
  };
}

// ---- Links ----

/** Zeichen der Challenge-Codes: ohne 0/O, 1/I/L, damit man sie auch abtippen kann */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;
export const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Code aus einem Link wie /c/AB12CD34 (auch klein geschrieben), sonst null */
export function challengeCodeFromPath(path: string): string | null {
  const m = /^\/c\/([A-Za-z0-9]+)\/?$/.exec(path);
  const code = m?.[1]?.toUpperCase();
  return code && CODE_PATTERN.test(code) ? code : null;
}
