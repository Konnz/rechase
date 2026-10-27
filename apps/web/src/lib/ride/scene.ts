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

/**
 * Straßenverlauf aus der Strecke ab Fortschritt along, ausgerichtet auf die Fahrtrichtung dort.
 * GPS-Zacken werden über ±8 m geglättet; hinter dem Ziel geht es geradeaus weiter.
 */
export function routePath(route: Route, along: number, profile: ElevationProfile | null = null): Path {
  const len = route.length;
  const raw = (d: number): LatLon => pointAt(route, Math.min(len, Math.max(0, d)))!;
  const smooth = (d: number): LatLon => {
    const a = raw(d - 8);
    const b = raw(d);
    const c = raw(d + 8);
    return { lat: (a.lat + b.lat + c.lat) / 3, lon: (a.lon + b.lon + c.lon) / 3 };
  };
  const o = smooth(along);
  const k = Math.cos((o.lat * Math.PI) / 180);
  const toXY = (p: LatLon) => ({ e: (p.lon - o.lon) * k * M_PER_DEG, n: (p.lat - o.lat) * M_PER_DEG });
  const from = toXY(smooth(along - 10));
  const to = toXY(smooth(along + 10));
  const th = Math.atan2(to.e - from.e, to.n - from.n);
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  const local = (p: LatLon) => {
    const { e, n } = toXY(p);
    return { x: e * cos - n * sin, z: e * sin + n * cos };
  };
  const h0 = profile ? altitudeAt(profile, along) : 0;
  const height = (d: number) =>
    profile ? (altitudeAt(profile, Math.min(len, Math.max(0, d))) - h0) * HEIGHT_SCALE : 0;

  // Über die Enden hinaus geradeaus in der letzten bzw. ersten Richtung weiterführen
  const end = (d: number, edge: number, inner: number) => {
    const a = local(smooth(inner));
    const b = local(smooth(edge));
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const over = Math.abs(d - edge);
    return { x: b.x + ((b.x - a.x) / l) * over, z: b.z + ((b.z - a.z) / l) * over, h: height(edge) };
  };

  return (s) => {
    const d = along + s;
    if (d > len) return end(d, len, len - 10);
    if (d < 0) return end(d, 0, 10);
    return { ...local(smooth(d)), h: height(d) };
  };
}

/** Bildpunkt eines Ortes neben der Straße; null hinter der Kamera */
function project(p: Local, lateral = 0): { x: number; y: number; z: number } | null {
  const z = p.z + CAMERA_M;
  if (z < 1.5) return null;
  return { x: CX + (F * (p.x + lateral)) / z, y: HORIZON_Y + (F * (CAM_H - p.h)) / z, z };
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
    const pts = (lat: number) => [project(far, lat), project(near, lat)] as const;
    const [fl, nl] = pts(-ROAD_HALF);
    const [fr, nr] = pts(ROAD_HALF);
    const [gfl, gnl] = pts(-GROUND_HALF);
    const [gfr, gnr] = pts(GROUND_HALF);
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
  const p = path(s);
  const z = (s < 0 ? s / 2 : p.z) + CAMERA_M;
  if (z < 4) return { x: 0, y: VIEW_BOTTOM * 2, scale: 0, hidden: true };
  const x = s < 0 ? lateral : p.x + lateral;
  const sx = CX + (F * x) / z;
  const sy = HORIZON_Y + (F * (CAM_H - p.h)) / z;
  const scale = CAMERA_M / z;
  return { x: sx, y: sy, scale, hidden: sy - YOU_H * scale > VIEW_BOTTOM };
}
