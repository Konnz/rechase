import { distanceM } from './geo.ts';
import { buildGhost, ghostDuration, ghostLength, ghostTimeAt, type Ghost } from './ghost.ts';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Eine Referenzstrecke: Punktliste mit aufsummierter Distanz. */
export interface Route {
  points: LatLon[];
  /** Distanz vom Start bis zum jeweiligen Punkt in m, streng steigend */
  cum: number[];
  length: number;
}

/** Baut eine Strecke aus einer Spur und dünnt sie aus (Punkte mindestens minSpacingM auseinander). */
export function buildRoute(track: readonly LatLon[], minSpacingM = 5): Route {
  const points: LatLon[] = [];
  const cum: number[] = [];
  for (const p of track) {
    const n = points.length;
    if (n === 0) {
      points.push({ lat: p.lat, lon: p.lon });
      cum.push(0);
      continue;
    }
    const d = distanceM(points[n - 1], p);
    if (d < minSpacingM) continue;
    points.push({ lat: p.lat, lon: p.lon });
    cum.push(cum[n - 1] + d);
  }
  return { points, cum, length: cum.at(-1) ?? 0 };
}

/** Position auf der Strecke nach d Metern. */
export function pointAt(route: Route, d: number): LatLon | null {
  const { points, cum } = route;
  const n = points.length;
  if (n === 0) return null;
  if (d <= 0) return points[0];
  if (d >= route.length) return points[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const f = (d - cum[lo]) / (cum[hi] - cum[lo]);
  return {
    lat: points[lo].lat + f * (points[hi].lat - points[lo].lat),
    lon: points[lo].lon + f * (points[hi].lon - points[lo].lon),
  };
}

const M_PER_DEG = 111_195;

/** Lotfußpunkt von p auf das Segment a–b, in einer lokalen ebenen Näherung um p. */
function projectOnSegment(p: LatLon, a: LatLon, b: LatLon): { t: number; dist: number } {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = (a.lon - p.lon) * k * M_PER_DEG;
  const ay = (a.lat - p.lat) * M_PER_DEG;
  const bx = (b.lon - p.lon) * k * M_PER_DEG;
  const by = (b.lat - p.lat) * M_PER_DEG;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2));
  return { t, dist: Math.hypot(ax + t * dx, ay + t * dy) };
}

export interface MatchOptions {
  /** So weit (m) darf man neben der Strecke sein und gilt noch als drauf */
  corridorM: number;
  /** Eingerastet wird nur in den ersten so vielen Metern der Strecke */
  lockWithinM: number;
  /** Schneller als das (m/s) kommt man auf der Strecke nicht voran; begrenzt Sprünge */
  maxSpeed: number;
  /** Suchweite (m) nach vorn, wenn man die Strecke verlassen hatte */
  rejoinAheadM: number;
}

export const defaultMatchOptions: MatchOptions = {
  corridorM: 40,
  lockWithinM: 150,
  maxSpeed: 25,
  rejoinAheadM: 3000,
};

export interface RouteMatch {
  /** Fortschritt auf der Strecke in m, nur vorwärts; null vor dem Einrasten am Start */
  along: number | null;
  /** Abstand zur Strecke in m */
  offset: number;
  onRoute: boolean;
}

/**
 * Projiziert Positionen auf die Strecke (Korridor, nur vorwärts).
 * Gesucht wird nur in einem Fenster ab dem bisherigen Fortschritt, damit Schleifen und Hin-und-zurück-Strecken
 * nicht aufs falsche Stück springen.
 */
export class RouteMatcher {
  readonly route: Route;
  readonly options: MatchOptions;
  private along: number | null = null;
  private seg = 0;
  private lastT: number | null = null;
  private onRoute = false;

  constructor(route: Route, options: Partial<MatchOptions> = {}) {
    this.route = route;
    this.options = { ...defaultMatchOptions, ...options };
  }

  push(p: LatLon & { t: number }): RouteMatch {
    const o = this.options;
    const { points, cum } = this.route;
    const dt = this.lastT == null ? 0 : Math.max(0, (p.t - this.lastT) / 1000);
    this.lastT = p.t;
    if (points.length < 2) return { along: null, offset: Infinity, onRoute: false };

    const from = this.along ?? 0;
    const ahead = this.along == null ? o.lockWithinM : this.onRoute ? 30 + o.maxSpeed * dt : o.rejoinAheadM;
    const to = from + ahead;

    let best: { seg: number; along: number; dist: number; score: number } | null = null;
    // Ein Stück zurück suchen, damit man am Segmentende nicht aus dem Fenster fällt
    let i = this.along == null ? 0 : this.seg;
    while (i > 0 && cum[i] > from - 30) i--;
    for (; i < points.length - 1 && cum[i] <= to; i++) {
      const { t, dist } = projectOnSegment(p, points[i], points[i + 1]);
      const a = cum[i] + t * (cum[i + 1] - cum[i]);
      if (a > to || dist > o.corridorM) continue;
      // Bei gleich nahen Kandidaten gewinnt der, der am wenigsten weit vorn liegt
      const score = dist + 0.05 * Math.max(0, a - from);
      if (!best || score < best.score) best = { seg: i, along: a, dist, score };
    }

    if (!best) {
      this.onRoute = false;
      return { along: this.along, offset: this.nearestOffset(p), onRoute: false };
    }
    this.onRoute = true;
    this.seg = best.seg;
    this.along = Math.max(this.along ?? 0, best.along);
    return { along: this.along, offset: best.dist, onRoute: true };
  }

  private nearestOffset(p: LatLon): number {
    const { points } = this.route;
    let min = Infinity;
    const lo = Math.max(0, this.seg - 5);
    const hi = Math.min(points.length - 1, this.seg + 20);
    for (let i = lo; i < hi; i++) min = Math.min(min, projectOnSegment(p, points[i], points[i + 1]).dist);
    return min;
  }
}

/** Ein Stand der Fahrt, auf die Strecke bezogen. */
export interface RouteProgressSample {
  /** Fortschritt auf der Strecke in m */
  along: number;
  /** Bewegungszeit seit dem Start der Strecke in ms */
  time: number;
  onRoute: boolean;
  offset: number;
}

/**
 * Bezieht eine laufende Fahrt auf die Strecke: Fortschritt aus dem Map-Matching, Uhr ab dem Startpunkt der Strecke.
 * Wer vor dem Start schon fährt, bekommt die Anfahrt nicht angerechnet.
 * Für Ghost und Live-Fahrt dieselbe Rechnung, damit der Vergleich fair bleibt.
 */
export class RouteProgress {
  private matcher: RouteMatcher;
  private t0: number | null = null;

  constructor(route: Route, options: Partial<MatchOptions> = {}) {
    this.matcher = new RouteMatcher(route, options);
  }

  push(s: LatLon & { t: number; movingTime: number; speed: number }): RouteProgressSample | null {
    const m = this.matcher.push(s);
    if (m.along == null) return null;
    if (this.t0 == null) {
      // Beim Einrasten liegt man meist schon ein paar Meter hinter dem Startpunkt: die Zeit dafür hochrechnen.
      const lead = m.along / Math.max(s.speed, 2);
      this.t0 = s.movingTime - lead * 1000;
    }
    return { along: m.along, time: s.movingTime - this.t0, onRoute: m.onRoute, offset: m.offset };
  }
}

/** Macht aus einer gefahrenen Fahrt einen Ghost entlang der Strecke. */
export function ghostFromSamples(
  route: Route,
  samples: readonly (LatLon & { t: number; movingTime: number; speed: number })[],
  options: Partial<MatchOptions> = {},
): Ghost {
  const progress = new RouteProgress(route, options);
  const pts: { distance: number; movingTime: number }[] = [{ distance: 0, movingTime: 0 }];
  for (const s of samples) {
    const r = progress.push(s);
    if (r?.onRoute) pts.push({ distance: r.along, movingTime: r.time });
  }
  return buildGhost(pts);
}

/** So nah (m) am Ende zählt die Strecke als geschafft */
export const FINISH_TOLERANCE_M = 50;

/** Bewegungszeit bis ins Ziel, oder null, wenn der Ghost die Strecke nicht zu Ende gefahren ist. */
export function finishTime(route: Route, ghost: Ghost, toleranceM = FINISH_TOLERANCE_M): number | null {
  const len = ghostLength(ghost);
  if (len < route.length - toleranceM) return null;
  return len >= route.length ? ghostTimeAt(ghost, route.length) : ghostDuration(ghost);
}

/** Geschwindigkeit des Ghosts (m/s) an der Stelle d, gemittelt über windowM. */
export function ghostSpeedAt(g: Ghost, d: number, windowM = 100): number | null {
  const len = ghostLength(g);
  if (len === 0 || d > len) return null;
  const a = Math.max(0, d - windowM / 2);
  const b = Math.min(len, a + windowM);
  const ta = ghostTimeAt(g, a);
  const tb = ghostTimeAt(g, b);
  if (ta == null || tb == null || tb <= ta) return null;
  return ((b - a) / (tb - ta)) * 1000;
}

/**
 * Trend des Abstands: wie viele Sekunden pro km man gerade gewinnt (negativ) oder verliert (positiv).
 * Gemessen über die letzten windowM Meter.
 */
export class GapTrend {
  readonly windowM: number;
  readonly minM: number;
  private hist: { along: number; seconds: number }[] = [];

  constructor(windowM = 1000, minM = 300) {
    this.windowM = windowM;
    this.minM = minM;
  }

  push(along: number, seconds: number): number | null {
    const h = this.hist;
    if (!h.length || along > h[h.length - 1].along) h.push({ along, seconds });
    while (h.length > 2 && along - h[1].along >= this.windowM) h.shift();
    const first = h[0];
    const span = along - first.along;
    if (span < this.minM) return null;
    return ((seconds - first.seconds) / span) * 1000;
  }
}

/** Höhe entlang der Strecke, geglättet. */
export interface ElevationProfile {
  /** Streng steigend, in m */
  distance: number[];
  /** Höhe in m */
  alt: number[];
}

/** Höhenprofil der Strecke aus einer gefahrenen Fahrt; GPS-Rauschen wird über smoothM gemittelt. */
export function elevationProfile(
  route: Route,
  samples: readonly (LatLon & { t: number; movingTime: number; speed: number; alt?: number | null })[],
  smoothM = 60,
): ElevationProfile | null {
  const progress = new RouteProgress(route);
  const raw: { d: number; alt: number }[] = [];
  for (const s of samples) {
    const r = progress.push(s);
    if (!r?.onRoute || s.alt == null) continue;
    if (!raw.length || r.along > raw[raw.length - 1].d) raw.push({ d: r.along, alt: s.alt });
  }
  if (raw.length < 2) return null;
  const distance: number[] = [];
  const alt: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (const p of raw) {
    while (hi < raw.length && raw[hi].d <= p.d + smoothM / 2) sum += raw[hi++].alt;
    while (raw[lo].d < p.d - smoothM / 2) sum -= raw[lo++].alt;
    distance.push(p.d);
    alt.push(sum / (hi - lo));
  }
  return { distance, alt };
}

/** Höhe an der Stelle d, am Rand begrenzt. */
export function altitudeAt(p: ElevationProfile, d: number): number {
  const { distance: xs, alt: ys } = p;
  const n = xs.length;
  if (d <= xs[0]) return ys[0];
  if (d >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= d) lo = mid;
    else hi = mid;
  }
  return ys[lo] + ((d - xs[lo]) / (xs[hi] - xs[lo])) * (ys[hi] - ys[lo]);
}
