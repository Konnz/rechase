import type { SectionResult } from './sections.ts';

/**
 * Ereignisse während der Fahrt, auf die ein kurzer Ton folgt.
 * Die Klangsprache steht in docs/05-community-und-gamification.md, Abschnitt 8.
 */
export type Cue =
  | { kind: 'overtake' }
  | { kind: 'overtaken' }
  | { kind: 'km-lead'; km: number }
  | { kind: 'countdown'; meters: number }
  | ({ kind: 'section' } & SectionResult)
  | { kind: 'finish'; won: boolean }
  | { kind: 'pause'; moving: boolean }
  /** Duell-Angebot unterwegs (E27): kommt, oder startet jetzt */
  | { kind: 'challenge'; accepted: boolean };

export type CueKind = Cue['kind'];

/** Restmeter, bei denen der Countdown piept */
export const COUNTDOWN_M = [500, 300, 100] as const;

export interface CueOptions {
  /** So weit (m) muss man am Ghost vorbei sein, damit es als Überholen zählt; gegen Flattern bei GPS-Rauschen */
  hysteresisM: number;
  /** Mindestabstand (ms) zwischen zwei Überhol-Tönen */
  cooldownMs: number;
}

export const defaultCueOptions: CueOptions = { hysteresisM: 3, cooldownMs: 5000 };

export interface DuelCueInput {
  /** Zeitstempel in ms */
  t: number;
  /** Fortschritt auf der Strecke in m */
  along: number;
  routeLength: number;
  /** Positiv: der Ghost ist so viele m vor dir */
  gapMeters: number;
  onRoute: boolean;
  finished: boolean;
  /** Im Ziel: schneller als der Ghost */
  won?: boolean;
}

/**
 * Erkennt aus dem laufenden Duell die Ereignisse für Töne: Überholen, Kilometer in Führung, Countdown, Ziel.
 * Die Abschnitte stoppt der SectionTimer, das Ticken bei kleinem Abstand liefert tickInterval.
 */
export class DuelCues {
  readonly options: CueOptions;
  private leader: 'you' | 'ghost' | null = null;
  private lastOvertake = -Infinity;
  private prevAlong = 0;
  private done = false;

  constructor(options: Partial<CueOptions> = {}) {
    this.options = { ...defaultCueOptions, ...options };
  }

  push(s: DuelCueInput): Cue[] {
    if (this.done) return [];
    const out: Cue[] = [];
    const h = this.options.hysteresisM;

    if (s.onRoute && !s.finished) {
      const now = s.gapMeters > h ? 'ghost' : s.gapMeters < -h ? 'you' : null;
      if (now && now !== this.leader) {
        // Wer zu Beginn vorn liegt, wird ohne Ton gemerkt. Während der Pause nach einem Überhol-Ton
        // bleibt die Führung stehen und wird danach gemeldet, falls sie dann noch gewechselt hat.
        if (!this.leader) this.leader = now;
        else if (s.t - this.lastOvertake >= this.options.cooldownMs) {
          out.push({ kind: now === 'you' ? 'overtake' : 'overtaken' });
          this.lastOvertake = s.t;
          this.leader = now;
        }
      }
    }

    const km = Math.floor(s.along / 1000);
    if (!s.finished && km > Math.floor(this.prevAlong / 1000) && s.gapMeters < 0) out.push({ kind: 'km-lead', km });

    const left = s.routeLength - s.along;
    const leftBefore = s.routeLength - this.prevAlong;
    for (const m of COUNTDOWN_M) if (!s.finished && leftBefore > m && left <= m) out.push({ kind: 'countdown', meters: m });

    if (s.finished) {
      out.push({ kind: 'finish', won: !!s.won });
      this.done = true;
    }
    this.prevAlong = Math.max(this.prevAlong, s.along);
    return out;
  }
}

/** Ab diesem Rückstand (s) beginnt das Ticken */
export const TICK_BELOW_S = 5;

/**
 * Abstand zwischen zwei Ticks in ms, wenn man knapp hinter dem Ghost liegt und nicht weiter zurückfällt;
 * je näher, desto schneller („Geigerzähler“). null heißt: still.
 */
export function tickInterval(gapSeconds: number | null, trend: number | null): number | null {
  if (gapSeconds == null || gapSeconds <= 0 || gapSeconds >= TICK_BELOW_S) return null;
  if (trend != null && trend > 0) return null;
  return Math.round(250 + (gapSeconds / TICK_BELOW_S) * 750);
}
