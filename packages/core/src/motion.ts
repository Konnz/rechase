import { distanceM } from './geo.ts';
import type { MotionSample, TrackPoint } from './types.ts';

export interface MotionOptions {
  /** Unter dieser Geschwindigkeit (m/s) beginnt die Pause, Standard 3 km/h */
  stopSpeed: number;
  /** Ab dieser Geschwindigkeit (m/s) geht es weiter, Standard 5 km/h */
  resumeSpeed: number;
  /** So lange (ms) muss man langsam sein, bevor pausiert wird */
  stopAfterMs: number;
  /** Punkte mit schlechterer Genauigkeit (m) werden verworfen */
  maxAccuracyM: number;
  /** Ab dieser Lücke (ms) zwischen zwei Punkten gilt die Aufzeichnung als unterbrochen */
  gapMs: number;
}

export const defaultMotionOptions: MotionOptions = {
  stopSpeed: 3 / 3.6,
  resumeSpeed: 5 / 3.6,
  stopAfterMs: 3000,
  maxAccuracyM: 30,
  gapMs: 10_000,
};

/**
 * Faire Auto-Pause: zählt Distanz und Bewegungszeit nur, solange man fährt.
 * GPS-Drift im Stand erzeugt keine Distanz, weil im Pausenzustand nichts aufaddiert wird.
 */
export class MotionTracker {
  readonly options: MotionOptions;
  private last: MotionSample | null = null;
  private slowSince: number | null = null;
  private startT: number | null = null;
  gaps = 0;
  rejected = 0;

  constructor(options: Partial<MotionOptions> = {}) {
    this.options = { ...defaultMotionOptions, ...options };
  }

  get current(): MotionSample | null {
    return this.last;
  }

  /** Nimmt einen Rohpunkt an und liefert den neuen Stand, oder null, wenn der Punkt verworfen wurde. */
  push(p: TrackPoint): MotionSample | null {
    const o = this.options;
    if (!(p.accuracy <= o.maxAccuracyM)) {
      this.rejected++;
      return null;
    }
    const prev = this.last;
    if (!prev) {
      this.startT = p.t;
      this.last = { ...p, speed: p.speed ?? 0, moving: false, distance: 0, movingTime: 0, elapsed: 0 };
      return this.last;
    }
    const dt = p.t - prev.t;
    if (dt <= 0) return null;
    if (dt > o.gapMs) this.gaps++;

    const step = distanceM(prev, p);
    const speed = p.speed != null && p.speed >= 0 ? p.speed : step / (dt / 1000);

    let moving = prev.moving;
    if (moving) {
      if (speed < o.stopSpeed) {
        this.slowSince ??= prev.t;
        if (p.t - this.slowSince >= o.stopAfterMs) moving = false;
      } else {
        this.slowSince = null;
      }
    } else if (speed >= o.resumeSpeed) {
      moving = true;
      this.slowSince = null;
    }

    // Das Intervall zählt, wenn man an seinem Anfang oder Ende in Bewegung war.
    const counts = prev.moving || moving;
    this.last = {
      ...p,
      speed,
      moving,
      distance: prev.distance + (counts ? step : 0),
      movingTime: prev.movingTime + (counts ? dt : 0),
      elapsed: p.t - (this.startT ?? p.t),
    };
    return this.last;
  }
}
