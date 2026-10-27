import type { TrackPoint } from '@rechase/core';
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
