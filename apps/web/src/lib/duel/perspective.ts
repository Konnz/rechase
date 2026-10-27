/**
 * Geometrie der Rennspiel-Ansicht (Zeichenfläche 366 × 300 wie im Mockup „Fahransicht Ghost-Duell“).
 * Die Kamera hängt hinter dir; ein Ghost d Meter voraus steht um CAMERA_M + d von ihr entfernt.
 * Höhe auf dem Bild und Größe fallen mit 1/Entfernung, so wie im Mockup bei 38 m Abstand.
 */
export const VIEW_W = 366;
export const VIEW_H = 300;
export const HORIZON_Y = 36;
/** Fußpunkt deiner Figur */
export const YOU_FEET_Y = 266;
/** Höhe deiner Figur */
export const YOU_H = 90;
/** Abstand der Kamera hinter dir in m */
export const CAMERA_M = 32.5;

/** Linker und rechter Straßenrand als quadratische Bézierkurven von unten nach oben */
const LEFT = [
  [14, 300],
  [132, 140],
  [186, 36],
] as const;
const RIGHT = [
  [352, 300],
  [232, 140],
  [204, 36],
] as const;

export const ROAD_PATH = `M${LEFT[0]} Q${LEFT[1]} ${LEFT[2]} L${RIGHT[2]} Q${RIGHT[1]} ${RIGHT[0]} Z`;
export const LEFT_EDGE = `M${LEFT[0]} Q${LEFT[1]} ${LEFT[2]}`;
export const RIGHT_EDGE = `M${RIGHT[0]} Q${RIGHT[1]} ${RIGHT[2]}`;
export const CENTER_LINE = 'M183,300 Q182,140 195,36';

type Curve = readonly (readonly [number, number])[];

const bez = (c: Curve, i: 0 | 1, t: number) => (1 - t) ** 2 * c[0][i] + 2 * (1 - t) * t * c[1][i] + t ** 2 * c[2][i];

/** x der Kurve auf Höhe y (y fällt mit t, daher Bisektion) */
function xAt(c: Curve, y: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (bez(c, 1, mid) > y) lo = mid;
    else hi = mid;
  }
  return bez(c, 0, (lo + hi) / 2);
}

/** Straßenränder auf Höhe y; unterhalb des Bildes linear weitergeführt */
export function roadAt(y: number): { left: number; right: number } {
  if (y > VIEW_H) {
    const below = y - VIEW_H;
    const l = xAt(LEFT, VIEW_H - 1);
    const r = xAt(RIGHT, VIEW_H - 1);
    return { left: LEFT[0][0] - (l - LEFT[0][0]) * below, right: RIGHT[0][0] + (RIGHT[0][0] - r) * below };
  }
  return { left: xAt(LEFT, y), right: xAt(RIGHT, y) };
}

export interface Placement {
  /** Mitte der Figur */
  x: number;
  /** Fußpunkt */
  y: number;
  /** Höhe der Figur */
  h: number;
  /** Ganz außerhalb des Bildes, etwa weil der Ghost weit hinter dir ist */
  hidden: boolean;
}

/** Wo eine Figur steht, die aheadM Meter vor dir fährt (negativ: hinter dir). lane: 0 links bis 1 rechts. */
export function place(aheadM: number, lane = 0.62): Placement {
  // Hinter dir wird die Tiefe gestaucht, damit ein naher Verfolger noch unten im Bild auftaucht.
  const z = CAMERA_M + (aheadM < 0 ? aheadM / 2 : aheadM);
  if (z < 4) return { x: 0, y: VIEW_H * 2, h: 0, hidden: true };
  const y = HORIZON_Y + ((YOU_FEET_Y - HORIZON_Y) * CAMERA_M) / z;
  const h = (YOU_H * CAMERA_M) / z;
  const { left, right } = roadAt(y);
  return { x: left + lane * (right - left), y, h, hidden: y - h > VIEW_H };
}
