import type { MotionSample } from './types.ts';

export interface RideStats {
  /** Distanz in m (nur in Bewegung) */
  distance: number;
  /** Bewegungszeit in ms (netto) */
  movingTime: number;
  /** Gesamtzeit vom ersten bis zum letzten Punkt in ms (brutto) */
  elapsed: number;
  /** Pausenzeit in ms (brutto − netto) */
  pausedTime: number;
  /** Anzahl Stopps, z. B. Ampeln */
  stops: number;
  /** Durchschnitt über die Bewegungszeit in m/s */
  avgSpeed: number;
  /** Höchste Geschwindigkeit in m/s, über einige Punkte geglättet gegen GPS-Ausreißer */
  topSpeed: number;
  /** Aufstieg und Abstieg in m, null ohne Höhendaten */
  ascent: number | null;
  descent: number | null;
  minAlt: number | null;
  maxAlt: number | null;
}

/** So viele Punkte werden für die Höchstgeschwindigkeit gemittelt (bei 1 Hz also 5 s). */
const TOP_SPEED_WINDOW = 5;
/** GPS-Höhe rauscht um einige Meter: erst über so viele Punkte mitteln, dann zählt erst diese Änderung. */
const ALT_WINDOW = 9;
const ALT_THRESHOLD_M = 3;

/** Kennzahlen einer beendeten Fahrt aus ihren angenommenen Punkten. */
export function rideStats(samples: readonly MotionSample[]): RideStats {
  const last = samples.at(-1);
  const distance = last?.distance ?? 0;
  const movingTime = last?.movingTime ?? 0;
  const elapsed = last?.elapsed ?? 0;

  let stops = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1]!.moving && !samples[i]!.moving) stops++;

  const moving = samples.filter((s) => s.moving);
  let topSpeed = 0;
  if (moving.length) {
    const n = Math.min(TOP_SPEED_WINDOW, moving.length);
    let sum = 0;
    for (let i = 0; i < moving.length; i++) {
      sum += moving[i]!.speed;
      if (i >= n) sum -= moving[i - n]!.speed;
      if (i >= n - 1) topSpeed = Math.max(topSpeed, sum / n);
    }
  }

  const raw = samples.map((s) => s.alt).filter((a): a is number => a != null && Number.isFinite(a));
  const half = ALT_WINDOW >> 1;
  const alts = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - half), i + half + 1);
    return w.reduce((s, a) => s + a, 0) / w.length;
  });
  let ascent: number | null = null;
  let descent: number | null = null;
  if (alts.length) {
    ascent = descent = 0;
    // Hysterese: Höhe wandert erst weiter, wenn sie sich um mehr als die Schwelle ändert
    let ref = alts[0]!;
    for (const a of alts) {
      if (a - ref >= ALT_THRESHOLD_M) {
        ascent += a - ref;
        ref = a;
      } else if (ref - a >= ALT_THRESHOLD_M) {
        descent += ref - a;
        ref = a;
      }
    }
  }

  return {
    distance,
    movingTime,
    elapsed,
    pausedTime: Math.max(0, elapsed - movingTime),
    stops,
    avgSpeed: movingTime > 0 ? distance / (movingTime / 1000) : 0,
    topSpeed,
    ascent,
    descent,
    minAlt: alts.length ? Math.min(...alts) : null,
    maxAlt: alts.length ? Math.max(...alts) : null,
  };
}

export interface SpeedSegment {
  /** Koordinaten als [lon, lat], direkt für GeoJSON */
  coords: [number, number][];
  /** 0 = langsam, 1 = schnell, relativ zur Fahrt */
  level: number;
  /** Mittlere Geschwindigkeit des Abschnitts in m/s */
  speed: number;
}

/**
 * Teilt die Spur in Abschnitte gleicher Tempostufe, damit die Karte sie einfärben kann.
 * Die Skala reicht vom 5. bis zum 95. Perzentil der Fahrt, damit einzelne Ausreißer sie nicht stauchen.
 */
export function speedSegments(
  samples: readonly MotionSample[],
  steps = 8,
): { segments: SpeedSegment[]; min: number; max: number } {
  const moving = samples.filter((s) => s.moving);
  if (moving.length < 2) return { segments: [], min: 0, max: 0 };

  // Leicht glätten, sonst flackert die Farbe von Punkt zu Punkt
  const smooth = moving.map((_, i) => {
    const w = moving.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((s, p) => s + p.speed, 0) / w.length;
  });
  const sorted = [...smooth].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))]!;
  const min = q(0.05);
  const max = Math.max(q(0.95), min + 0.5);
  const levelOf = (v: number) => {
    const x = Math.min(1, Math.max(0, (v - min) / (max - min)));
    return Math.round(x * (steps - 1)) / (steps - 1);
  };

  const segments: SpeedSegment[] = [];
  let seg: SpeedSegment | null = null;
  let sum = 0;
  for (let i = 0; i < moving.length; i++) {
    const p = moving[i]!;
    const c: [number, number] = [p.lon, p.lat];
    const level = levelOf(smooth[i]!);
    if (!seg || seg.level !== level) {
      if (seg && seg.coords.length > 1) segments.push({ ...seg, speed: sum / seg.coords.length });
      // Anschluss an den vorigen Abschnitt, damit keine Lücke entsteht
      seg = { coords: seg ? [seg.coords.at(-1)!, c] : [c], level, speed: 0 };
      sum = smooth[i]! * seg.coords.length;
    } else {
      seg.coords.push(c);
      sum += smooth[i]!;
    }
  }
  if (seg && seg.coords.length > 1) segments.push({ ...seg, speed: sum / seg.coords.length });
  return { segments, min, max };
}
