/**
 * Ein Ghost ist eine Referenzfahrt als Funktion Distanz → Bewegungszeit.
 * Weil er über die Bewegungszeit läuft, hält er automatisch mit an, wenn man an der Ampel steht.
 *
 * Distanz ist hier die eigene Fahrdistanz. Sobald es Map-Matching gibt, wird es die Position entlang der Strecke.
 */
export interface Ghost {
  /** Streng steigend, in m */
  distance: number[];
  /** Bewegungszeit in ms zur jeweiligen Distanz */
  movingTime: number[];
}

export interface GhostGap {
  /** Positiv: du liegst zurück (s). Null, wenn du schon weiter bist als der Ghost je kam. */
  seconds: number | null;
  /** Positiv: der Ghost ist so viele m vor dir */
  meters: number;
}

export function buildGhost(samples: readonly { distance: number; movingTime: number }[]): Ghost {
  const g: Ghost = { distance: [], movingTime: [] };
  for (const s of samples) {
    const n = g.distance.length;
    if (n === 0 || s.distance > g.distance[n - 1]) {
      g.distance.push(s.distance);
      g.movingTime.push(s.movingTime);
    }
  }
  return g;
}

/** Linear interpoliert ys an der Stelle x; xs muss steigend sein. Außerhalb wird auf den Rand begrenzt. */
function interpolate(xs: readonly number[], ys: readonly number[], x: number): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

export const ghostLength = (g: Ghost) => g.distance.at(-1) ?? 0;
export const ghostDuration = (g: Ghost) => g.movingTime.at(-1) ?? 0;

/** Bewegungszeit des Ghosts bei Distanz d, oder null hinter seinem Ziel. */
export function ghostTimeAt(g: Ghost, d: number): number | null {
  if (d > ghostLength(g)) return null;
  return interpolate(g.distance, g.movingTime, d);
}

/** Wo der Ghost nach t ms Bewegungszeit ist. */
export function ghostDistanceAt(g: Ghost, t: number): number {
  return interpolate(g.movingTime, g.distance, t);
}

/** Abstand zum Ghost für meinen aktuellen Stand. */
export function compareToGhost(g: Ghost, me: { distance: number; movingTime: number }): GhostGap {
  const ghostT = ghostTimeAt(g, me.distance);
  return {
    seconds: ghostT == null ? null : (me.movingTime - ghostT) / 1000,
    meters: ghostDistanceAt(g, me.movingTime) - me.distance,
  };
}
