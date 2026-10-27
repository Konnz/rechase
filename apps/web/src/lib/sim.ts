import { distanceM, type TrackPoint } from '@rechase/core';
import type { PositionSource } from './tracker.svelte.ts';

/**
 * Fahrt-Simulator: spielt aufgezeichnete Punkte erneut ab, damit man das Duell am Schreibtisch testen kann.
 * pace < 1 fährt schneller als das Original (0,97 = 3 % schneller), speedup rafft die Wiedergabe.
 */
export function replaySource(points: readonly TrackPoint[], { pace = 0.97, speedup = 10 } = {}): PositionSource {
  return (onPosition) => {
    if (!points.length) return () => {};
    const t0 = points[0].t;
    const now = Date.now();
    let i = 0;
    const timer = setInterval(() => {
      const p = points[i++];
      if (!p) {
        clearInterval(timer);
        return;
      }
      const dt = (p.t - t0) * pace;
      onPosition({
        timestamp: now + dt,
        coords: {
          latitude: p.lat,
          longitude: p.lon,
          altitude: p.alt ?? null,
          speed: p.speed != null ? p.speed / pace : null,
          accuracy: p.accuracy,
        },
      });
    }, 1000 / speedup);
    return () => clearInterval(timer);
  };
}

/**
 * Setzt vor eine Fahrt eine gerade Anfahrt in Richtung des Starts, damit man das Duell-Angebot unterwegs
 * am Schreibtisch testen kann. Gefahren wird mit speed m/s, ein Punkt je Sekunde.
 */
export function withApproach(points: readonly TrackPoint[], meters = 500, speed = 8): TrackPoint[] {
  const first = points[0];
  if (!first) return [];
  const ahead = points.find((p) => distanceM(first, p) > 40);
  if (!ahead) return [...points];
  // Einheitsvektor der Startrichtung in Grad je Meter
  const d = distanceM(first, ahead);
  const dLat = (ahead.lat - first.lat) / d;
  const dLon = (ahead.lon - first.lon) / d;
  const n = Math.round(meters / speed);
  const approach: TrackPoint[] = [];
  for (let i = n; i >= 1; i--) {
    const back = i * speed;
    approach.push({
      ...first,
      t: first.t - i * 1000,
      lat: first.lat - dLat * back,
      lon: first.lon - dLon * back,
      speed,
    });
  }
  return [...approach, ...points];
}
