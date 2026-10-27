import { BIKE_CLASS_LABELS, bikeClass, type BikeClass, type BikeType } from './bikes.ts';
import { distanceM } from './geo.ts';
import type { MotionSample } from './types.ts';

/**
 * Anti-Cheat Stufe 1: Ist eine Fahrt mit der gewählten Radklasse überhaupt möglich?
 * Erkennt Auto, Bahn und falsch gewählte Klasse an Tempo, Beschleunigung, Steigleistung und GPS-Sprüngen
 * (docs/05-community-und-gamification.md, Abschnitt 9). Läuft ohne Browser-APIs, damit der Server
 * dieselbe Prüfung machen kann, sobald Fahrten hochgeladen werden.
 *
 * Bewusst großzügig: Lieber ein Auto übersehen als einen starken Fahrer zu Unrecht ausbremsen.
 * Tram und Auto im Stadtverkehr (bis 50 km/h mit Halten) fallen hier nicht auf, das ist Stufe 2 mit Kartendaten.
 */

export type PlausibilityRule = 'speed' | 'acceleration' | 'climb' | 'teleport';

export interface PlausibilityFlag {
  rule: PlausibilityRule;
  /** Zeitstempel (ms), an dem die auffälligste Stelle endet */
  t: number;
  /** Gemessener Wert: km/h bei speed und teleport, s bis 40 km/h bei acceleration, Höhenmeter je Stunde bei climb */
  value: number;
  /** Grenze, die überschritten wurde, in derselben Einheit */
  limit: number;
  /** Erklärung für den Fahrer */
  message: string;
}

export interface Plausibility {
  ok: boolean;
  /** Geprüfte Klasse; Fahrten ohne Rad gelten als Muskelkraft */
  bikeClass: BikeClass;
  /** Je Regel die auffälligste Stelle */
  flags: PlausibilityFlag[];
  /**
   * Klasse, zu der die Fahrt passen würde, oder 'none', wenn sie zu keiner Radklasse passt (Auto, Bahn).
   * null bei einer unauffälligen Fahrt.
   */
  suggestion: BikeClass | 'none' | null;
}

interface SpeedLimit {
  /** Über so viel Bewegungszeit gemittelt (s) */
  windowS: number;
  maxKmh: number;
  /** Nur auf Abschnitten, die nicht deutlich bergab gehen; bergab sind auch Räder schnell */
  flatOnly: boolean;
}

interface ClassLimits {
  speed: SpeedLimit[];
  /** Steigleistung (VAM) in Höhenmetern pro Stunde Bewegungszeit */
  maxVam: number;
}

/** Schneller als das ist über 30 s kein Rad, auch bergab nicht */
const ANY_BIKE: SpeedLimit = { windowS: 30, maxKmh: 80, flatOnly: false };

export const PLAUSIBILITY_LIMITS: Record<BikeClass, ClassLimits> = {
  // Schnelle Gruppen fahren kurz über 50, aber nicht minutenlang allein über 48 und nie 30 s über 60 im Flachen
  muscle: {
    speed: [ANY_BIKE, { windowS: 30, maxKmh: 60, flatOnly: true }, { windowS: 300, maxKmh: 48, flatOnly: true }],
    maxVam: 1800,
  },
  // Der Motor hilft bis 25 km/h; darüber zählt die eigene Kraft auf einem schweren Rad
  ebike: {
    speed: [ANY_BIKE, { windowS: 30, maxKmh: 45, flatOnly: true }, { windowS: 300, maxKmh: 33, flatOnly: true }],
    maxVam: 3200,
  },
  // Motor bis 45 km/h
  'speed-pedelec': {
    speed: [ANY_BIKE, { windowS: 30, maxKmh: 60, flatOnly: true }, { windowS: 300, maxKmh: 52, flatOnly: true }],
    maxVam: 4000,
  },
};

/** Gefälle, ab dem ein Abschnitt als bergab gilt (Höhe / Distanz) */
const DOWNHILL_GRADE = -0.02;
/** 0 auf 40 km/h in höchstens so vielen Sekunden schafft nur ein Motorfahrzeug; Profi-Sprinter brauchen 6 bis 7 s */
const ACCEL_TARGET_KMH = 40;
const ACCEL_MAX_S = 5;
/** Die Beschleunigung zählt nur, wenn das Tempo danach so lange gehalten wird; sonst war es ein GPS-Sprung */
const ACCEL_HOLD_S = 10;
const ACCEL_HOLD_KMH = 35;
/** Tempo beim Beschleunigen über so viele Sekunden, gegen Positionsrauschen */
const ACCEL_WINDOW_S = 3;
/** Steigleistung über mindestens so viel Bewegungszeit und so viele Höhenmeter */
const CLIMB_WINDOW_S = 300;
const CLIMB_MIN_GAIN_M = 100;
/** GPS-Höhe springt gelegentlich; der gleitende Median über so viele Punkte glättet das weg */
const ALT_MEDIAN = 15;
/** Lücke ab so vielen Sekunden, über die ein Positionssprung als Teleport geprüft wird */
const TELEPORT_GAP_S = 5;
const TELEPORT_MIN_M = 200;
const TELEPORT_KMH = 80;

const CLASSES: BikeClass[] = ['muscle', 'ebike', 'speed-pedelec'];

const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');

/** Prüft eine Fahrt gegen die Grenzen ihrer Radklasse und schlägt, wenn sie auffällt, eine passende Klasse vor. */
export function checkPlausibility(samples: readonly MotionSample[], bike?: BikeType | null): Plausibility {
  const own: BikeClass = bike ? bikeClass(bike) : 'muscle';
  const alts = smoothedAltitudes(samples);
  const flags = flagsFor(samples, alts, own);
  if (!flags.length) return { ok: true, bikeClass: own, flags, suggestion: null };
  const fits = CLASSES.find((c) => c !== own && !flagsFor(samples, alts, c).length);
  return { ok: false, bikeClass: own, flags, suggestion: fits ?? 'none' };
}

function flagsFor(samples: readonly MotionSample[], alts: (number | null)[], cls: BikeClass): PlausibilityFlag[] {
  const limits = PLAUSIBILITY_LIMITS[cls];
  const label = BIKE_CLASS_LABELS[cls];
  const flags: PlausibilityFlag[] = [];

  let speed: PlausibilityFlag | null = null;
  for (const lim of limits.speed) {
    const hit = fastestWindow(samples, alts, lim);
    if (!hit || hit.kmh <= lim.maxKmh) continue;
    // „Kein Fahrrad“ geht vor, sonst die deutlichste Überschreitung
    if (speed && (speed.limit === ANY_BIKE.maxKmh || hit.kmh / lim.maxKmh <= speed.value / speed.limit)) continue;
    const span = lim.windowS >= 60 ? `${lim.windowS / 60} min` : `${lim.windowS} s`;
    speed = {
      rule: 'speed',
      t: hit.t,
      value: hit.kmh,
      limit: lim.maxKmh,
      message:
        lim === ANY_BIKE
          ? `${fmt(hit.kmh)} km/h über ${span}: So schnell fährt kein Fahrrad.`
          : `${fmt(hit.kmh)} km/h über ${span} ohne Gefälle, mehr als ${label} schafft (bis ${lim.maxKmh} km/h).`,
    };
  }
  if (speed) flags.push(speed);

  const accel = fastestStart(samples);
  if (accel && accel.seconds <= ACCEL_MAX_S) {
    flags.push({
      rule: 'acceleration',
      t: accel.t,
      value: accel.seconds,
      limit: ACCEL_MAX_S,
      message: `In ${accel.seconds.toLocaleString('de-DE', { maximumFractionDigits: 1 })} s von 0 auf ${ACCEL_TARGET_KMH} km/h: So beschleunigt ein Motorfahrzeug.`,
    });
  }

  const climb = steepestClimb(samples, alts);
  if (climb && climb.vam > limits.maxVam) {
    flags.push({
      rule: 'climb',
      t: climb.t,
      value: climb.vam,
      limit: limits.maxVam,
      message: `${fmt(climb.gain)} Höhenmeter in ${fmt(climb.seconds / 60)} min (${fmt(climb.vam)} m/h), mehr als ${label} schafft (bis ${fmt(limits.maxVam)} m/h).`,
    });
  }

  const jump = teleport(samples);
  if (jump) {
    flags.push({
      rule: 'teleport',
      t: jump.t,
      value: jump.kmh,
      limit: TELEPORT_KMH,
      message: `${fmt(jump.meters)} m in ${fmt(jump.seconds)} s ohne GPS-Empfang (${fmt(jump.kmh)} km/h).`,
    });
  }
  return flags;
}

/** Höchstes Tempo über windowS Bewegungszeit, bei flatOnly ohne Abschnitte mit Gefälle. */
function fastestWindow(samples: readonly MotionSample[], alts: (number | null)[], lim: SpeedLimit) {
  const w = lim.windowS * 1000;
  let best: { kmh: number; t: number } | null = null;
  let j = 0;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    while (j + 1 < i && s.movingTime - samples[j + 1]!.movingTime >= w) j++;
    const from = samples[j]!;
    const dt = s.movingTime - from.movingTime;
    if (dt < w) continue;
    const d = s.distance - from.distance;
    if (lim.flatOnly) {
      const a = alts[j];
      const b = alts[i];
      if (a != null && b != null && d > 0 && (b - a) / d < DOWNHILL_GRADE) continue;
    }
    const kmh = (d / (dt / 1000)) * 3.6;
    if (!best || kmh > best.kmh) best = { kmh, t: s.t };
  }
  return best;
}

/**
 * Schnellster Start: Sekunden Bewegungszeit vom Losfahren, bis das Tempo über ACCEL_WINDOW_S
 * ACCEL_TARGET_KMH erreicht, wenn es danach gehalten wird.
 */
function fastestStart(samples: readonly MotionSample[]) {
  let best: { seconds: number; t: number } | null = null;
  for (let k = 0; k < samples.length; k++) {
    // Losfahren: der letzte stehende Punkt vor einem fahrenden
    if (samples[k]!.moving || !samples[k + 1]?.moving) continue;
    const start = samples[k]!;
    let j = k;
    for (let i = k + 1; i < samples.length; i++) {
      const s = samples[i]!;
      const since = (s.movingTime - start.movingTime) / 1000;
      if (since > ACCEL_MAX_S || !s.moving) break;
      // Eine Empfangslücke beim Losfahren holt den Weg auf einmal nach
      if (s.t - samples[i - 1]!.t > 3000) break;
      while (j + 1 < i && s.movingTime - samples[j + 1]!.movingTime >= ACCEL_WINDOW_S * 1000) j++;
      const dt = (s.movingTime - samples[j]!.movingTime) / 1000;
      if (dt < ACCEL_WINDOW_S) continue;
      const kmh = ((s.distance - samples[j]!.distance) / dt) * 3.6;
      if (kmh < ACCEL_TARGET_KMH) continue;
      if (holds(samples, i) && (!best || since < best.seconds)) best = { seconds: since, t: s.t };
      break;
    }
  }
  return best;
}

/** Hält das Tempo ab Punkt i für ACCEL_HOLD_S ohne Pause und ohne Lücke? */
function holds(samples: readonly MotionSample[], i: number): boolean {
  const from = samples[i]!;
  for (let k = i + 1; k < samples.length; k++) {
    const s = samples[k]!;
    if (!s.moving || s.t - samples[k - 1]!.t > 3000) return false;
    const dt = (s.movingTime - from.movingTime) / 1000;
    if (dt >= ACCEL_HOLD_S) return ((s.distance - from.distance) / dt) * 3.6 >= ACCEL_HOLD_KMH;
  }
  return false;
}

/** Steilster Anstieg über mindestens CLIMB_WINDOW_S Bewegungszeit, als Höhenmeter je Stunde. */
function steepestClimb(samples: readonly MotionSample[], alts: (number | null)[]) {
  const w = CLIMB_WINDOW_S * 1000;
  let best: { vam: number; gain: number; seconds: number; t: number } | null = null;
  let j = 0;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    while (j + 1 < i && s.movingTime - samples[j + 1]!.movingTime >= w) j++;
    const dt = s.movingTime - samples[j]!.movingTime;
    const a = alts[j];
    const b = alts[i];
    if (dt < w || a == null || b == null) continue;
    const gain = b - a;
    if (gain < CLIMB_MIN_GAIN_M) continue;
    const vam = gain / (dt / 3_600_000);
    if (!best || vam > best.vam) best = { vam, gain, seconds: dt / 1000, t: s.t };
  }
  return best;
}

/** Größter Positionssprung über eine Empfangslücke mit unmöglichem Tempo. */
function teleport(samples: readonly MotionSample[]) {
  let best: { kmh: number; meters: number; seconds: number; t: number } | null = null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const seconds = (b.t - a.t) / 1000;
    if (seconds < TELEPORT_GAP_S) continue;
    const meters = distanceM(a, b);
    const kmh = (meters / seconds) * 3.6;
    if (meters >= TELEPORT_MIN_M && kmh > TELEPORT_KMH && (!best || kmh > best.kmh)) best = { kmh, meters, seconds, t: b.t };
  }
  return best;
}

/** Gleitender Median der Höhe je Punkt, null wo Höhen fehlen. */
function smoothedAltitudes(samples: readonly MotionSample[]): (number | null)[] {
  const half = ALT_MEDIAN >> 1;
  return samples.map((s, i) => {
    if (s.alt == null || !Number.isFinite(s.alt)) return null;
    const w: number[] = [];
    for (let k = Math.max(0, i - half); k <= Math.min(samples.length - 1, i + half); k++) {
      const a = samples[k]!.alt;
      if (a != null && Number.isFinite(a)) w.push(a);
    }
    w.sort((x, y) => x - y);
    return w[w.length >> 1]!;
  });
}
