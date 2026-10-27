import { ghostDuration, ghostLength, ghostTimeAt, type Ghost } from './ghost.ts';
import { FINISH_TOLERANCE_M } from './route.ts';

/** Kürzer als das (m) wird eine Strecke nicht in Abschnitte geteilt */
export const MIN_SECTIONED_M = 2000;
/** Höchstens so viele Abschnitte, damit lange Strecken nicht zu oft piepen */
export const MAX_SECTIONS = 10;

/**
 * Teilt eine Strecke in gleich lange Abschnitte von etwa 1 km, bei langen Strecken in höchstens MAX_SECTIONS.
 * Liefert die Grenzen einschließlich Start und Ziel, oder eine leere Liste, wenn sich das nicht lohnt.
 */
export function sectionBounds(length: number): number[] {
  if (length < MIN_SECTIONED_M) return [];
  const n = Math.min(MAX_SECTIONS, Math.round(length / 1000));
  return Array.from({ length: n + 1 }, (_, i) => (i * length) / n);
}

/** Bewegungszeit des Ghosts bis d; am Ziel zählt auch, wer knapp davor aufgehört hat. */
function timeAt(g: Ghost, d: number, last: boolean): number | null {
  const t = ghostTimeAt(g, d);
  if (t != null) return t;
  return last && ghostLength(g) >= d - FINISH_TOLERANCE_M ? ghostDuration(g) : null;
}

/** Zeiten (ms) einer Fahrt je Abschnitt, null wo sie nicht hinkam. */
export function sectionTimes(g: Ghost, bounds: readonly number[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = timeAt(g, bounds[i], false);
    const b = timeAt(g, bounds[i + 1], i + 2 === bounds.length);
    out.push(a == null || b == null || b <= a ? null : b - a);
  }
  return out;
}

/** Beste Zeit je Abschnitt über mehrere Fahrten. */
export function bestSectionTimes(ghosts: readonly Ghost[], bounds: readonly number[]): (number | null)[] {
  const best: (number | null)[] = Array(Math.max(0, bounds.length - 1)).fill(null);
  for (const g of ghosts) {
    sectionTimes(g, bounds).forEach((t, i) => {
      if (t != null && (best[i] == null || t < best[i]!)) best[i] = t;
    });
  }
  return best;
}

export interface SectionResult {
  /** Nummer des Abschnitts, ab 0 */
  index: number;
  /** Bewegungszeit auf dem Abschnitt in ms */
  time: number;
  /** Bisher beste Zeit auf dem Abschnitt, null wenn es keine gab */
  best: number | null;
  /** Schneller als je zuvor */
  pr: boolean;
}

/**
 * Stoppt die Abschnitte während der Fahrt. Bekommt Fortschritt und Bewegungszeit auf der Strecke
 * und meldet jeden Abschnitt, sobald man ihn hinter sich hat.
 * Wer zwischendurch die Strecke verlässt, bekommt für diesen Abschnitt keine Zeit, damit Abkürzungen nichts bringen.
 */
export class SectionTimer {
  readonly bounds: readonly number[];
  readonly bests: readonly (number | null)[];
  private prev = { along: 0, time: 0 };
  private next = 1;
  private start = 0;
  private clean = true;
  private lastOnRoute = true;

  constructor(bounds: readonly number[], bests: readonly (number | null)[]) {
    this.bounds = bounds;
    this.bests = bests;
  }

  push(along: number, time: number, onRoute: boolean): SectionResult[] {
    const out: SectionResult[] = [];
    // Nur wenn man vorher und jetzt auf der Strecke war, ist die Interpolation dazwischen verlässlich
    const step = onRoute && this.lastOnRoute;
    this.lastOnRoute = onRoute;
    if (!step) this.clean = false;
    const p = this.prev;
    while (this.next < this.bounds.length && along >= this.bounds[this.next]) {
      const b = this.bounds[this.next];
      // Zeitpunkt der Grenze zwischen zwei Punkten interpolieren
      const tb = along > p.along ? p.time + ((b - p.along) / (along - p.along)) * (time - p.time) : time;
      const index = this.next - 1;
      if (this.clean) {
        const t = tb - this.start;
        const best = this.bests[index] ?? null;
        out.push({ index, time: t, best, pr: best != null && t < best });
      }
      this.start = tb;
      this.clean = step;
      this.next++;
    }
    if (along > p.along) this.prev = { along, time };
    return out;
  }
}
