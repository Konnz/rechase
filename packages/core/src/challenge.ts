import { bearingDeg, distanceM } from './geo.ts';
import { pointAt, type LatLon, type Route } from './route.ts';

/** Eine gemerkte Strecke, auf die die App unterwegs ein Duell anbieten kann. */
export interface ChallengeCandidate {
  id: string;
  route: Route;
}

export interface ChallengeOptions {
  /** Ab diesem Abstand (m) zum Startpunkt kommt das Angebot */
  offerWithinM: number;
  /** So weit (Grad) darf die eigene Fahrtrichtung von der Richtung der Strecke am Start abweichen */
  headingToleranceDeg: number;
  /** Über so viele gefahrene Meter wird die eigene Fahrtrichtung gemessen */
  headingBaseM: number;
  /** Richtung der Strecke: vom Startpunkt bis zu dieser Stelle (m) */
  startBearingM: number;
  /** So nah (m) an der Linie gilt man als „am Start“, auch wenn man sich nicht mehr nähert */
  atLineM: number;
  /** Weiter weg (m) vom Startpunkt fällt ein offenes Angebot weg */
  withdrawBeyondM: number;
  /** So viele Punkte in Folge mit falscher Richtung, dann fällt ein offenes Angebot weg */
  withdrawAfter: number;
}

export const defaultChallengeOptions: ChallengeOptions = {
  offerWithinM: 200,
  headingToleranceDeg: 60,
  headingBaseM: 25,
  startBearingM: 60,
  atLineM: 60,
  withdrawBeyondM: 260,
  withdrawAfter: 3,
};

export type ChallengeEvent =
  | { kind: 'offer'; id: string; distance: number }
  | { kind: 'withdraw'; id: string };

/** Kleinster Winkel zwischen zwei Kursen in Grad */
const angleBetween = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Erkennt während einer freien Fahrt, dass man auf den Start einer gemerkten Strecke zufährt (E27).
 * Angeboten wird, wenn der Startpunkt näher als offerWithinM ist und die Fahrtrichtung zur Strecke passt;
 * wer die Strecke rückwärts fährt oder nur in der Nähe kreuzt, bekommt nichts.
 * Jede Strecke kommt pro Fahrt höchstens einmal, und solange ein Angebot offen ist, kein zweites.
 */
export class ChallengeDetector {
  readonly options: ChallengeOptions;
  private candidates: { id: string; start: LatLon; bearing: number }[];
  /** Zuletzt gefahrene Punkte in Bewegung, für die Fahrtrichtung */
  private trail: LatLon[] = [];
  private seen = new Set<string>();
  private pending: { id: string; wrong: number } | null = null;

  constructor(candidates: readonly ChallengeCandidate[], options: Partial<ChallengeOptions> = {}) {
    this.options = { ...defaultChallengeOptions, ...options };
    const o = this.options;
    this.candidates = candidates
      .filter((c) => c.route.points.length >= 2 && c.route.length >= o.startBearingM)
      .map((c) => ({
        id: c.id,
        start: c.route.points[0],
        bearing: bearingDeg(c.route.points[0], pointAt(c.route, o.startBearingM)!),
      }));
  }

  /** Offenes Angebot, bis resolve() aufgerufen wird oder es wegfällt */
  get offered(): string | null {
    return this.pending?.id ?? null;
  }

  /** Angebot angenommen oder abgelehnt: Die Strecke kommt in dieser Fahrt nicht mehr. */
  resolve() {
    this.pending = null;
  }

  /** Diese Strecke nicht anbieten, z. B. weil sie gerade als Duell läuft */
  skip(id: string) {
    this.seen.add(id);
  }

  push(s: LatLon & { moving: boolean }): ChallengeEvent | null {
    if (!s.moving) return null;
    const o = this.options;
    this.trail.push({ lat: s.lat, lon: s.lon });
    // Den ältesten Punkt behalten, der noch mindestens headingBaseM zurückliegt
    while (this.trail.length > 2 && distanceM(this.trail[1], s) >= o.headingBaseM) this.trail.shift();
    const base = this.trail[0];
    if (distanceM(base, s) < o.headingBaseM) return null;
    const heading = bearingDeg(base, s);

    if (this.pending) {
      const c = this.candidates.find((x) => x.id === this.pending!.id)!;
      const d = distanceM(s, c.start);
      this.pending.wrong = angleBetween(heading, c.bearing) > o.headingToleranceDeg ? this.pending.wrong + 1 : 0;
      if (d > o.withdrawBeyondM || this.pending.wrong >= o.withdrawAfter) {
        this.pending = null;
        return { kind: 'withdraw', id: c.id };
      }
      return null;
    }

    let best: { id: string; d: number } | null = null;
    for (const c of this.candidates) {
      if (this.seen.has(c.id)) continue;
      const d = distanceM(s, c.start);
      if (d > o.offerWithinM) continue;
      if (angleBetween(heading, c.bearing) > o.headingToleranceDeg) continue;
      const approaching = d < distanceM(base, c.start) - 5;
      if (!approaching && d > o.atLineM) continue;
      if (!best || d < best.d) best = { id: c.id, d };
    }
    if (!best) return null;
    this.seen.add(best.id);
    this.pending = { id: best.id, wrong: 0 };
    return { kind: 'offer', id: best.id, distance: best.d };
  }
}

export interface AbandonOptions {
  /** So lange (ms) neben der Strecke, dann endet das Duell */
  offRouteMs: number;
  /** So weit (m) neben der Strecke endet es sofort */
  offRouteFarM: number;
  /** Vor dem Start: weiter weg (m) vom Startpunkt endet es */
  approachBeyondM: number;
}

export const defaultAbandonOptions: AbandonOptions = { offRouteMs: 20_000, offRouteFarM: 150, approachBeyondM: 300 };

/**
 * Entscheidet, wann ein unterwegs angenommenes Duell still endet: Man kommt nicht zum Start
 * oder verlässt die Strecke. Kurze GPS-Ausreißer neben die Strecke zählen nicht.
 */
export class ChallengeAbandon {
  readonly options: AbandonOptions;
  private offSince: number | null = null;

  constructor(options: Partial<AbandonOptions> = {}) {
    this.options = { ...defaultAbandonOptions, ...options };
  }

  /** toStart: Abstand zum Startpunkt vor dem Einrasten, sonst null */
  push(s: { t: number; toStart: number | null; onRoute: boolean; offset: number }): boolean {
    const o = this.options;
    if (s.toStart != null) return s.toStart > o.approachBeyondM;
    if (s.onRoute) {
      this.offSince = null;
      return false;
    }
    this.offSince ??= s.t;
    return s.offset > o.offRouteFarM || s.t - this.offSince >= o.offRouteMs;
  }
}
