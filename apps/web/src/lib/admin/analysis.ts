import { defaultMotionOptions, type MotionSample, type RideUpload, type TrackPoint } from '@rechase/core';

/** Was der Adminbereich auf Karte und Zeitachse einer Fahrt zeigt (E22-5). */

export interface Pause {
  lat: number;
  lon: number;
  /** Beginn und Ende in ms seit Epoch */
  from: number;
  to: number;
}

export interface Gap {
  from: MotionSample;
  to: MotionSample;
}

export interface RideAnalysis {
  /** Fahrspur in Bewegung, an Pausen und Lücken unterbrochen: je Abschnitt [lon, lat]-Paare */
  moving: [number, number][][];
  pauses: Pause[];
  gaps: Gap[];
  /** Rohpunkte, die wegen schlechter Genauigkeit verworfen wurden */
  rejected: TrackPoint[];
}

/** Kürzere Pausen sind meist nur Rollen an der Kreuzung und überladen die Karte */
const MIN_PAUSE_MS = 5000;

export function analyzeRide(ride: Pick<RideUpload, 'samples' | 'raw'>, gapMs = defaultMotionOptions.gapMs): RideAnalysis {
  const s = ride.samples;
  const moving: [number, number][][] = [];
  const pauses: Pause[] = [];
  const gaps: Gap[] = [];
  let line: [number, number][] = [];
  let pauseStart: MotionSample | null = null;

  const flush = () => {
    if (line.length > 1) moving.push(line);
    line = [];
  };

  for (let i = 0; i < s.length; i++) {
    const p = s[i]!;
    const prev = s[i - 1];
    if (prev && p.t - prev.t > gapMs) {
      gaps.push({ from: prev, to: p });
      flush();
    }
    if (p.moving) {
      if (pauseStart && p.t - pauseStart.t >= MIN_PAUSE_MS) {
        pauses.push({ lat: pauseStart.lat, lon: pauseStart.lon, from: pauseStart.t, to: p.t });
      }
      pauseStart = null;
      // Die Linie beginnt am letzten stehenden Punkt, damit nach einer Pause nichts fehlt
      if (!line.length && prev && !prev.moving && p.t - prev.t <= gapMs) line.push([prev.lon, prev.lat]);
      line.push([p.lon, p.lat]);
    } else {
      if (line.length) {
        line.push([p.lon, p.lat]);
        flush();
      }
      pauseStart ??= p;
    }
  }
  flush();
  const last = s.at(-1);
  if (pauseStart && last && last.t - pauseStart.t >= MIN_PAUSE_MS && pauseStart !== s[0]) {
    pauses.push({ lat: pauseStart.lat, lon: pauseStart.lon, from: pauseStart.t, to: last.t });
  }

  const accepted = new Set(s.map((p) => p.t));
  const rejected = ride.raw.filter((p) => !accepted.has(p.t) && !(p.accuracy <= defaultMotionOptions.maxAccuracyM));
  return { moving, pauses, gaps, rejected };
}

/** Der Punkt der Fahrt, der zeitlich am nächsten an t liegt */
export function sampleAt(samples: readonly MotionSample[], t: number): MotionSample | null {
  if (!samples.length) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  const a = samples[lo - 1];
  const b = samples[lo]!;
  return a && t - a.t < b.t - t ? a : b;
}
