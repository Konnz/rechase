import {
  FINISH_TOLERANCE_M,
  GapTrend,
  RouteProgress,
  compareToGhost,
  distanceM,
  ghostDistanceAt,
  ghostSpeedAt,
  ghostTimeAt,
  pointAt,
  type Ghost,
  type GhostGap,
  type LatLon,
  type MotionSample,
  type Route,
} from '@rechase/core';
import type { StoredRoute } from './db.ts';
import { toRoute } from './routes.ts';

type Phase = 'approach' | 'racing' | 'finished';

/**
 * Live-Duell gegen den Ghost einer Strecke. Bekommt jeden angenommenen Punkt der Fahrt
 * und hält Abstand, Trend und Ghost-Position für die Ansicht bereit.
 */
export class Duel {
  readonly stored: StoredRoute;
  readonly ghost: Ghost;
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

  private progress: RouteProgress;
  private trendCalc = new GapTrend();

  constructor(stored: StoredRoute, ghost: Ghost) {
    this.stored = stored;
    this.ghost = ghost;
    this.route = toRoute(stored);
    this.progress = new RouteProgress(this.route);
    this.ghostPos = pointAt(this.route, 0);
  }

  /** Tempo der Bestzeit an meiner Stelle (m/s) */
  get ghostSpeed() {
    return ghostSpeedAt(this.ghost, this.along);
  }

  /** Bewegungszeit der Bestzeit bis zu meiner Stelle (ms) */
  get ghostTimeHere() {
    return ghostTimeAt(this.ghost, this.along);
  }

  push(s: MotionSample) {
    if (this.phase === 'finished') return;
    const r = this.progress.push(s);
    if (!r) {
      this.toStart = this.route.points.length ? distanceM(s, this.route.points[0]) : null;
      return;
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
  }
}
