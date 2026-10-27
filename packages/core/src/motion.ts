import { distanceM } from './geo.ts';
import type { MotionSample, TrackPoint } from './types.ts';

export interface MotionOptions {
  /** Unter dieser Geschwindigkeit (m/s) gilt man als stehend und pausiert sofort, Standard 1,5 km/h */
  standSpeed: number;
  /** Unter dieser Geschwindigkeit (m/s) beginnt die Pause nach stopAfterMs, Standard 4 km/h */
  stopSpeed: number;
  /** Ab dieser Geschwindigkeit (m/s) geht es weiter, Standard 6 km/h */
  resumeSpeed: number;
  /** So lange (ms) muss man langsamer als stopSpeed sein, bevor pausiert wird */
  stopAfterMs: number;
  /** Punkte mit schlechterer Genauigkeit (m) werden verworfen */
  maxAccuracyM: number;
  /** Ab dieser Lücke (ms) zwischen zwei Punkten gilt die Aufzeichnung als unterbrochen */
  gapMs: number;
  /** Ein Punkt mit unveränderter Position, der schneller als das kommt, ist ein wiederholter alter Fix */
  staleMs: number;
  /** Ohne GNSS-Geschwindigkeit wird sie über mindestens so viele ms aus den Positionen berechnet */
  speedBaselineMs: number;
}

export const defaultMotionOptions: MotionOptions = {
  standSpeed: 1.5 / 3.6,
  stopSpeed: 4 / 3.6,
  resumeSpeed: 6 / 3.6,
  stopAfterMs: 2000,
  maxAccuracyM: 30,
  gapMs: 10_000,
  staleMs: 1500,
  speedBaselineMs: 3000,
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
  /** Letzte angenommene Punkte, für die Geschwindigkeit aus den Positionen */
  private history: TrackPoint[] = [];
  gaps = 0;
  rejected = 0;
  /** Wiederholte Fixes ohne neue Position, die übersprungen wurden */
  stale = 0;

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
      this.history = [p];
      this.last = { ...p, speed: p.speed ?? 0, moving: false, distance: 0, movingTime: 0, elapsed: 0 };
      return this.last;
    }
    const dt = p.t - prev.t;
    if (dt <= 0) return null;
    // Android liefert zwischen den Sekundenfixes öfter die alte Position mit neuem Zeitstempel
    // und holt den Weg beim nächsten Fix auf einmal nach. Das ergäbe erst 0 und dann einen Sprung.
    // Meldet der Chip eine neue Geschwindigkeit (etwa 0 beim Anhalten), ist es ein echter Fix.
    const sameSpeed = p.speed == null || p.speed === prev.speed;
    if (p.lat === prev.lat && p.lon === prev.lon && sameSpeed && dt < o.staleMs) {
      this.stale++;
      return null;
    }
    if (dt > o.gapMs) this.gaps++;

    const step = distanceM(prev, p);
    const speed = p.speed != null && p.speed >= 0 ? p.speed : this.speedFromPositions(p);
    this.remember(p);

    let moving = prev.moving;
    if (moving) {
      // Die Doppler-Geschwindigkeit fällt beim Anhalten schnell auf fast 0: dann sofort pausieren.
      // Kriechen knapp über Schritttempo pausiert erst nach stopAfterMs, damit langsames Fahren nicht stoppt.
      if (speed < o.standSpeed) {
        moving = false;
        this.slowSince = null;
      } else if (speed < o.stopSpeed) {
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

  /**
   * Geschwindigkeit als Luftlinie über einige Sekunden. Von Punkt zu Punkt rauscht die Position
   * um einige Meter, das ergäbe im Stand Schritttempo und beim Fahren Sprünge.
   */
  private speedFromPositions(p: TrackPoint): number {
    const h = this.history;
    let i = h.length - 1;
    while (i > 0 && p.t - h[i]!.t < this.options.speedBaselineMs) i--;
    const from = h[i]!;
    return distanceM(from, p) / ((p.t - from.t) / 1000);
  }

  private remember(p: TrackPoint) {
    const h = this.history;
    // Über eine Empfangslücke hinweg nicht mitteln: die Position springt danach oft noch einige Meter
    if (h.length && p.t - h.at(-1)!.t > this.options.speedBaselineMs) h.length = 0;
    h.push(p);
    // Den jüngsten Punkt, der schon weit genug zurückliegt, behalten, alles davor wegwerfen
    let i = 0;
    while (i + 1 < h.length && p.t - h[i + 1]!.t >= this.options.speedBaselineMs) i++;
    if (i > 0) h.splice(0, i);
  }
}
