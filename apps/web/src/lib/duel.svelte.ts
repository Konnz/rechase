import {
  ChallengeAbandon,
  DuelCues,
  FINISH_TOLERANCE_M,
  GapTrend,
  RouteProgress,
  SectionTimer,
  compareToGhost,
  distanceM,
  ghostDistanceAt,
  ghostSpeedAt,
  ghostTimeAt,
  pointAt,
  sectionBounds,
  tickInterval,
  type Cue,
  type Ghost,
  type GhostGap,
  type LatLon,
  type MotionSample,
  type Route,
  type SectionResult,
} from '@rechase/core';
import type { StoredChallenge, StoredRoute } from './db.ts';
import { toRoute, type Opponent } from './routes.ts';

/** abandoned: unterwegs angenommenes Duell, Start nicht erreicht oder Strecke verlassen; endet still */
type Phase = 'approach' | 'racing' | 'finished' | 'abandoned';

/**
 * Live-Duell gegen den Ghost einer Strecke. Bekommt jeden angenommenen Punkt der Fahrt
 * und hält Abstand, Trend und Ghost-Position für die Ansicht bereit.
 */
export class Duel {
  readonly stored: StoredRoute;
  readonly ghost: Ghost;
  /** Gegen wen: Bestzeit, letzte Fahrt oder Durchschnitt */
  readonly opponent: Opponent;
  readonly route: Route;
  phase = $state<Phase>('approach');
  /** Eigener Fortschritt auf der Strecke in m */
  along = $state(0);
  /** Bewegungszeit seit dem Startpunkt in ms */
  time = $state(0);
  onRoute = $state(true);
  gap = $state.raw<GhostGap | null>(null);
  /** Sekunden pro km, negativ heißt: du gewinnst Zeit */
  trend = $state<number | null>(null);
  ghostAlong = $state(0);
  ghostPos = $state.raw<LatLon | null>(null);
  /** Abstand zum Startpunkt, solange das Duell noch nicht läuft */
  toStart = $state<number | null>(null);
  /** Abstand zwischen zwei Ticks in ms, solange man knapp hinter dem Ghost liegt */
  tickMs = $state<number | null>(null);
  /** Grenzen der Abschnitte in m, leer bei kurzen Strecken */
  readonly sections: readonly number[];
  /** Abschnitts-PRs dieser Fahrt */
  sectionPrs = $state.raw<SectionResult[]>([]);

  private progress: RouteProgress;
  private trendCalc = new GapTrend();
  private cues = new DuelCues();
  private sectionTimer: SectionTimer;
  /** Nur bei Duellen, die unterwegs angeboten wurden (E27) */
  private abandon: ChallengeAbandon | null;
  /** Geteilter Ghost eines anderen Chasers (E11-3); stored ist dann nur seine Strecke */
  readonly foreign: StoredChallenge | null;

  /**
   * sectionBests: bisher beste Zeit je Abschnitt, siehe sectionBestsFor.
   * challenge: unterwegs angeboten; verlässt man die Strecke, endet das Duell still statt zu warten.
   * foreign: Duell gegen einen geteilten Ghost statt gegen eine eigene Strecke.
   */
  constructor(
    stored: StoredRoute,
    opponent: Opponent,
    sectionBests: readonly (number | null)[] = [],
    { challenge = false, foreign = null }: { challenge?: boolean; foreign?: StoredChallenge | null } = {},
  ) {
    this.foreign = foreign;
    this.stored = stored;
    this.opponent = opponent;
    this.ghost = opponent.ghost;
    this.route = toRoute(stored);
    this.progress = new RouteProgress(this.route);
    this.ghostPos = pointAt(this.route, 0);
    this.sections = sectionBounds(this.route.length);
    this.sectionTimer = new SectionTimer(this.sections, sectionBests);
    this.abandon = challenge ? new ChallengeAbandon() : null;
  }

  get challenge() {
    return this.abandon != null;
  }

  /** Tempo des Ghosts an meiner Stelle (m/s) */
  get ghostSpeed() {
    return ghostSpeedAt(this.ghost, this.along);
  }

  /** Bewegungszeit des Ghosts bis zu meiner Stelle (ms) */
  get ghostTimeHere() {
    return ghostTimeAt(this.ghost, this.along);
  }

  /** Nimmt einen Punkt der Fahrt auf und liefert die Ereignisse, auf die ein Ton folgt. */
  push(s: MotionSample): Cue[] {
    if (this.phase === 'finished' || this.phase === 'abandoned') return [];
    const r = this.progress.push(s);
    if (!r) {
      this.toStart = this.route.points.length ? distanceM(s, this.route.points[0]) : null;
      if (this.abandon?.push({ t: s.t, toStart: this.toStart, onRoute: false, offset: Infinity })) this.end();
      return [];
    }
    if (this.abandon?.push({ t: s.t, toStart: null, onRoute: r.onRoute, offset: r.offset })) {
      this.end();
      return [];
    }
    this.phase = 'racing';
    this.toStart = null;
    this.along = r.along;
    this.time = r.time;
    this.onRoute = r.onRoute;
    const gap = compareToGhost(this.ghost, { distance: r.along, movingTime: r.time });
    this.gap = gap;
    this.ghostAlong = ghostDistanceAt(this.ghost, r.time);
    this.ghostPos = pointAt(this.route, this.ghostAlong);
    if (gap.seconds != null && r.onRoute) this.trend = this.trendCalc.push(r.along, gap.seconds);
    if (r.along >= this.route.length - FINISH_TOLERANCE_M) {
      // Die letzten Meter bis zum Zielpunkt mit dem aktuellen Tempo hochrechnen
      this.time = r.time + ((this.route.length - r.along) / Math.max(s.speed, 2)) * 1000;
      this.along = this.route.length;
      this.phase = 'finished';
    }
    const finished = this.phase === 'finished';
    this.tickMs = !finished && s.moving && r.onRoute ? tickInterval(gap.seconds, this.trend) : null;

    const sections = this.sectionTimer.push(this.along, this.time, r.onRoute);
    const prs = sections.filter((x) => x.pr);
    if (prs.length) this.sectionPrs = [...this.sectionPrs, ...prs];
    return [
      ...sections.map((x): Cue => ({ kind: 'section', ...x })),
      ...this.cues.push({
        t: s.t,
        along: this.along,
        routeLength: this.route.length,
        gapMeters: gap.meters,
        onRoute: r.onRoute,
        finished,
        won: this.time < this.opponent.time,
      }),
    ];
  }

  private end() {
    this.phase = 'abandoned';
    this.tickMs = null;
  }
}
