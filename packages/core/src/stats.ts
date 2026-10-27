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

/** Über dieses Zeitfenster (ms) wird die Höchstgeschwindigkeit gemittelt. Android liefert Punkte unregelmäßig. */
const TOP_SPEED_WINDOW_MS = 5000;
/**
 * Schneller kann ein Rad nicht beschleunigen (m/s²), Bremsen geht deutlich kräftiger.
 * GPS-Sprünge in der Stadt täuschen sonst für einige Sekunden 50 km/h vor.
 */
const MAX_ACCEL = 1.5;
const MAX_DECEL = 5;
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

  const topSpeed = topSpeedOf(samples);

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

/** Höchstes Mittel über TOP_SPEED_WINDOW_MS, nach Begrenzung auf physikalisch mögliche Beschleunigung. */
function topSpeedOf(samples: readonly MotionSample[]): number {
  // Je zusammenhängender Fahrabschnitt (zwischen zwei Pausen) getrennt begrenzen und mitteln
  let top = 0;
  let run: MotionSample[] = [];
  const flush = () => {
    if (run.length) top = Math.max(top, windowMax(plausibleSpeeds(run), run));
    run = [];
  };
  for (const s of samples) {
    if (s.moving) run.push(s);
    else flush();
  }
  flush();
  return top;
}

function plausibleSpeeds(run: readonly MotionSample[]): number[] {
  const v = run.map((s) => s.speed);
  for (let i = 1; i < v.length; i++) {
    // Nach einer Empfangslücke holt die Position den Weg auf einmal nach; dort zählt höchstens 1 s Beschleunigung
    const dt = Math.min(1, (run[i]!.t - run[i - 1]!.t) / 1000);
    v[i] = Math.min(v[i]!, v[i - 1]! + MAX_ACCEL * dt);
  }
  // Rückwärts: ein Wert darf nicht schneller abfallen, als man bremsen kann, sonst ist er eine Spitze
  for (let i = v.length - 2; i >= 0; i--) {
    const dt = (run[i + 1]!.t - run[i]!.t) / 1000;
    v[i] = Math.min(v[i]!, v[i + 1]! + MAX_DECEL * dt);
  }
  return v;
}

function windowMax(v: readonly number[], run: readonly MotionSample[]): number {
  // Zeitgewichtetes Mittel über ein gleitendes Fenster; kürzere Abschnitte zählen als Ganzes
  const span = run.at(-1)!.t - run[0]!.t;
  if (span < TOP_SPEED_WINDOW_MS) return v.reduce((s, x) => s + x, 0) / v.length;
  let best = 0;
  let j = 0;
  let area = 0;
  for (let i = 1; i < run.length; i++) {
    area += ((v[i]! + v[i - 1]!) / 2) * (run[i]!.t - run[i - 1]!.t);
    while (run[i]!.t - run[j + 1]!.t >= TOP_SPEED_WINDOW_MS) {
      area -= ((v[j + 1]! + v[j]!) / 2) * (run[j + 1]!.t - run[j]!.t);
      j++;
    }
    const w = run[i]!.t - run[j]!.t;
    if (w >= TOP_SPEED_WINDOW_MS) best = Math.max(best, area / w);
  }
  return best;
}

export interface SpeedProfile {
  /** Spur in Bewegung als [lon, lat], direkt für GeoJSON */
  coords: [number, number][];
  /** Tempo je Punkt zwischen 0 (langsam) und 1 (schnell), stufenlos und relativ zur Fahrt */
  levels: number[];
  /** Anteil der Strecke je Punkt zwischen 0 und 1, passend zu MapLibres line-progress */
  progress: number[];
  /** Grenzen der Skala in m/s */
  min: number;
  max: number;
}

/** Über so viele Sekunden um jeden Punkt wird das Tempo gemittelt, damit die Farbe ruhig verläuft. */
const SPEED_SMOOTH_S = 10;

/**
 * Tempoverlauf der Spur für die eingefärbte Karte: stufenlos und geglättet, damit die Farbe fließend wechselt.
 * Die Skala reicht vom 5. bis zum 95. Perzentil der Fahrt, damit einzelne Ausreißer sie nicht stauchen.
 */
export function speedProfile(samples: readonly MotionSample[]): SpeedProfile {
  const moving = samples.filter((s) => s.moving);
  if (moving.length < 2) return { coords: [], levels: [], progress: [], min: 0, max: 0 };

  // Gleitender Mittelwert über ±SPEED_SMOOTH_S/2, gewichtet mit der Zeit, die jeder Punkt abdeckt
  const half = (SPEED_SMOOTH_S * 1000) / 2;
  const smooth: number[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < moving.length; i++) {
    const t = moving[i]!.t;
    while (moving[lo]!.t < t - half) lo++;
    while (hi + 1 < moving.length && moving[hi + 1]!.t <= t + half) hi++;
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += moving[k]!.speed;
    smooth.push(sum / (hi - lo + 1));
  }

  const sorted = [...smooth].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * (sorted.length - 1)))]!;
  const min = q(0.05);
  const max = Math.max(q(0.95), min + 0.5);

  const d0 = moving[0]!.distance;
  const total = moving.at(-1)!.distance - d0;
  return {
    coords: moving.map((p) => [p.lon, p.lat]),
    levels: smooth.map((v) => Math.min(1, Math.max(0, (v - min) / (max - min)))),
    progress: moving.map((p, i) => (total > 0 ? (p.distance - d0) / total : i / (moving.length - 1))),
    min,
    max,
  };
}
