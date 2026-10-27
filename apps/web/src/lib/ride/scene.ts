import { altitudeAt, pointAt, type ElevationProfile, type LatLon, type Route } from '@rechase/core';

/**
 * 3D-Straße der Fahransicht: eine Kamera hängt hinter und über dir, die Straße davor folgt dem echten
 * Streckenverlauf (Kurven und Steigungen) oder läuft bei freier Fahrt geradeaus.
 * Zeichenfläche 366 breit; y = 0 … 300 ist der Bereich aus dem Mockup, darüber liegt Himmel für die Anzeigen.
 */
export const VIEW_W = 366;
export const VIEW_TOP = -130;
export const VIEW_BOTTOM = 300;
export const HORIZON_Y = 36;
/** Abstand der Kamera hinter dir in m */
export const CAMERA_M = 32.5;
/** Kamerahöhe über der Straße in m */
const CAM_H = 3;
/** Fußpunkt und Höhe deiner Figur wie im Mockup */
export const YOU_FEET_Y = 266;
export const YOU_H = 90;
/** Brennweite so, dass du bei CAMERA_M auf YOU_FEET_Y stehst */
const F = ((YOU_FEET_Y - HORIZON_Y) * CAMERA_M) / CAM_H;
const CX = VIEW_W / 2;
/** Halbe Straßenbreite und Breite des sichtbaren Geländes in m */
const ROAD_HALF = 2;
const GROUND_HALF = 80;
/** Sichtweite und Schrittweite in m; weiter weg genügen gröbere Stücke */
const AHEAD_M = 600;
const STEP_M = 4;
const NEAR_M = 120;
const FAR_STEP_M = 12;
/** Höhen werden etwas abgeschwächt, sonst verschwindet die Straße schon hinter kleinen Kuppen */
const HEIGHT_SCALE = 0.35;
/** Fahrspur (m rechts der Mitte) für dich */
export const YOU_LANE = 0.3;

/** Ein Punkt der Straße im Koordinatensystem des Fahrers: x rechts, z vorwärts, h nach oben, alles in m */
export interface Local {
  x: number;
  z: number;
  h: number;
}

/** Straßenmitte s Meter vor (negativ: hinter) dir */
export type Path = (s: number) => Local;

/** Freie Fahrt: gerade und eben */
export const straightPath: Path = (s) => ({ x: 0, z: s, h: 0 });

const M_PER_DEG = 111_195;
/** Abstand der Stützpunkte und Breite der Glättung in m; GPS-Zacken liegen deutlich darunter, echte Kurven darüber */
const SAMPLE_M = 2;
const SMOOTH_SIGMA_M = 10;
/** So weit vor und hinter dem sichtbaren Stück wird mitgeglättet, damit die Ränder nicht ausfransen */
const MARGIN_M = 3 * SMOOTH_SIGMA_M + 10;

/** Gauß-Kern über die Stützpunkte, an den Enden auf die vorhandenen Punkte beschränkt */
function gaussSmooth(v: number[]): number[] {
  const r = Math.ceil((3 * SMOOTH_SIGMA_M) / SAMPLE_M);
  const w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-(((i - r) * SAMPLE_M) ** 2) / (2 * SMOOTH_SIGMA_M ** 2)));
  return v.map((_, i) => {
    let sum = 0;
    let ws = 0;
    for (let k = -r; k <= r; k++) {
      const j = i + k;
      if (j < 0 || j >= v.length) continue;
      sum += v[j] * w[k + r];
      ws += w[k + r];
    }
    return sum / ws;
  });
}

/**
 * Straßenverlauf aus der Strecke ab Fortschritt along, ausgerichtet auf die Fahrtrichtung dort.
 * Die Strecke wird alle 2 m abgetastet und mit einem Gauß-Kern geglättet, damit GPS-Zacken nicht als
 * Schlangenlinien erscheinen; hinter dem Ziel geht es geradeaus weiter.
 */
export function routePath(route: Route, along: number, profile: ElevationProfile | null = null): Path {
  const len = route.length;
  const raw = (d: number): LatLon => pointAt(route, Math.min(len, Math.max(0, d)))!;
  const o = raw(along);
  const k = Math.cos((o.lat * Math.PI) / 180);
  // Abtasten im ebenen Koordinatensystem um o: e nach Osten, n nach Norden, nur innerhalb der Strecke
  const from = Math.max(0, along - CAMERA_M - MARGIN_M);
  const to = Math.min(len, along + AHEAD_M + MARGIN_M);
  const n = Math.max(2, Math.ceil((to - from) / SAMPLE_M) + 1);
  const step = (to - from) / (n - 1) || SAMPLE_M;
  const es: number[] = [];
  const ns: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = raw(from + i * step);
    es.push((p.lon - o.lon) * k * M_PER_DEG);
    ns.push((p.lat - o.lat) * M_PER_DEG);
  }
  const se = gaussSmooth(es);
  const sn = gaussSmooth(ns);
  const at = (d: number) => {
    const f = Math.min(n - 1, Math.max(0, (d - from) / step));
    const i = Math.min(n - 2, Math.floor(f));
    const t = f - i;
    return { e: se[i] + (se[i + 1] - se[i]) * t, n: sn[i] + (sn[i + 1] - sn[i]) * t };
  };

  const c = at(along);
  const a = at(along - 10);
  const b = at(along + 10);
  const th = Math.atan2(b.e - a.e, b.n - a.n);
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  const local = (d: number) => {
    const p = at(d);
    const e = p.e - c.e;
    const nn = p.n - c.n;
    return { x: e * cos - nn * sin, z: e * sin + nn * cos };
  };
  const h0 = profile ? altitudeAt(profile, along) : 0;
  const height = (d: number) =>
    profile ? (altitudeAt(profile, Math.min(len, Math.max(0, d))) - h0) * HEIGHT_SCALE : 0;

  // Über die Enden hinaus geradeaus in der letzten bzw. ersten Richtung weiterführen
  const end = (d: number, edge: number, inner: number) => {
    const p = local(inner);
    const q = local(edge);
    const l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
    const over = Math.abs(d - edge);
    return { x: q.x + ((q.x - p.x) / l) * over, z: q.z + ((q.z - p.z) / l) * over, h: height(edge) };
  };

  return (s) => {
    const d = along + s;
    if (d > len) return end(d, len, len - 10);
    if (d < 0) return end(d, 0, 10);
    return { ...local(d), h: height(d) };
  };
}

/** Punkt lateral m rechts der Straßenmitte, quer zur Fahrtrichtung dort, damit Kurven ihre Breite behalten */
function beside(path: Path, s: number, lateral: number): Local {
  const p = path(s);
  if (!lateral) return p;
  const a = path(s - 1);
  const b = path(s + 1);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: p.x + (dz / l) * lateral, z: p.z - (dx / l) * lateral, h: p.h };
}

/** Bildpunkt eines Ortes neben der Straße; null hinter der Kamera */
function project(p: Local): { x: number; y: number; z: number } | null {
  const z = p.z + CAMERA_M;
  if (z < 1.5) return null;
  return { x: CX + (F * p.x) / z, y: HORIZON_Y + (F * (CAM_H - p.h)) / z, z };
}

type Pt = [number, number];

export interface Segment {
  ground: Pt[];
  road: Pt[];
  /** Linker und rechter Rand */
  edges: [Pt, Pt][];
  /** Mittelstreifen auf diesem Stück */
  dash: [Pt, Pt] | null;
}

/** Straße als Vierecke von hinten nach vorn, damit Nahes Fernes verdeckt (Kuppen). */
export function buildRoad(path: Path, along = 0): Segment[] {
  const segs: Segment[] = [];
  const start = -CAMERA_M + 3;
  // Am Fortschritt ausgerichtet, damit die Mittelstreifen beim Fahren über den Boden wandern statt mitzufahren
  const phase = ((along % STEP_M) + STEP_M) % STEP_M;
  const marks: number[] = [];
  for (let s = AHEAD_M - phase; s > NEAR_M; s -= FAR_STEP_M) marks.push(s);
  for (let s = NEAR_M - phase; s >= start; s -= STEP_M) marks.push(s);
  for (let i = 0; i + 1 < marks.length; i++) {
    const s = marks[i];
    const far = path(s);
    const near = path(marks[i + 1]);
    const pts = (lat: number) => [project(beside(path, s, lat)), project(beside(path, marks[i + 1], lat))] as const;
    const [fl, nl] = pts(-ROAD_HALF);
    const [fr, nr] = pts(ROAD_HALF);
    // Das Gelände nur seitlich im Bild verbreitern: quer zur Straße würden sich die Streifen in engen Kurven überschlagen
    const wide = (lat: number) => [project({ ...far, x: far.x + lat }), project({ ...near, x: near.x + lat })] as const;
    const [gfl, gnl] = wide(-GROUND_HALF);
    const [gfr, gnr] = wide(GROUND_HALF);
    if (!fl || !nl || !fr || !nr || !gfl || !gnl || !gfr || !gnr) continue;
    const xy = (p: { x: number; y: number }): Pt => [p.x, p.y];
    const dashOn = s <= NEAR_M && Math.floor((along + s) / STEP_M) % 3 === 0;
    const [fc, nc] = pts(0);
    segs.push({
      ground: [xy(gfl), xy(gfr), xy(gnr), xy(gnl)],
      road: [xy(fl), xy(fr), xy(nr), xy(nl)],
      edges: [
        [xy(fl), xy(nl)],
        [xy(fr), xy(nr)],
      ],
      dash: dashOn && fc && nc ? [xy(fc), xy(nc)] : null,
    });
  }
  return segs;
}

export interface Placement {
  /** Fußpunkt */
  x: number;
  y: number;
  /** Größe relativ zu deiner Figur */
  scale: number;
  /** Außerhalb des Bildes, etwa weil der Ghost weit hinter dir ist */
  hidden: boolean;
}

/** Wo eine Figur s Meter vor dir steht (negativ: hinter dir), lateral m rechts der Straßenmitte. */
export function place(path: Path, s: number, lateral = YOU_LANE): Placement {
  // Hinter dir wird die Tiefe gestaucht, damit ein naher Verfolger noch unten im Bild auftaucht.
  const p = s < 0 ? path(s) : beside(path, s, lateral);
  const z = (s < 0 ? s / 2 : p.z) + CAMERA_M;
  if (z < 4) return { x: 0, y: VIEW_BOTTOM * 2, scale: 0, hidden: true };
  const x = s < 0 ? lateral : p.x;
  const sx = CX + (F * x) / z;
  const sy = HORIZON_Y + (F * (CAM_H - p.h)) / z;
  const scale = CAMERA_M / z;
  return { x: sx, y: sy, scale, hidden: sy - YOU_H * scale > VIEW_BOTTOM };
}
