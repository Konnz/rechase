import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MotionTracker } from '../src/motion.ts';
import { rideStats } from '../src/stats.ts';
import type { MotionSample } from '../src/types.ts';
import { parseGpx } from './helpers.ts';

/**
 * Erste echte Probefahrt am 27.10.2026 mit einem Pixel 10 Pro (Chrome), Langenfeld nach Düsseldorf.
 * Der Export enthält nur Position, Höhe und Zeit; die Geschwindigkeit rechnet der Tracker aus den Positionen.
 * Von Hand ausgewertet: 21,9 km, 73 min brutto, rund 7,5 min Stand an gut 20 Ampeln und Kreuzungen,
 * flach (GPS-Höhe 85 bis 97 m), schnellste echte 5 s um 30 km/h.
 */
const points = parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8'));

function track() {
  const m = new MotionTracker();
  const samples = points.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
  return { m, samples, stats: rideStats(samples) };
}

describe('Probefahrt Pixel 10 Pro', () => {
  const { m, samples, stats } = track();

  it('überspringt wiederholte alte Fixes', () => {
    // Das Pixel schiebt zwischen den Sekundenfixes oft die alte Position mit neuem Zeitstempel ein
    expect(m.stale).toBeGreaterThan(50);
    expect(samples.length).toBe(points.length - m.stale);
  });

  it('zählt Distanz und Bewegungszeit plausibel', () => {
    expect(stats.distance / 1000).toBeGreaterThan(21.3);
    expect(stats.distance / 1000).toBeLessThan(22);
    const pausedMin = stats.pausedTime / 60_000;
    expect(pausedMin).toBeGreaterThan(6);
    expect(pausedMin).toBeLessThan(10);
  });

  it('flattert nicht zwischen Fahren und Pause', () => {
    // Von Hand gezählt: gut 20 Halte; vorher machte das Positionsrauschen daraus 46
    expect(stats.stops).toBeGreaterThanOrEqual(18);
    expect(stats.stops).toBeLessThanOrEqual(30);
  });

  it('lässt sich von GPS-Sprüngen nicht zu einer falschen Höchstgeschwindigkeit verleiten', () => {
    // Ein Positionssprung in Düsseldorf und ein Nachholen nach einer Empfangslücke täuschten 37 bis 48 km/h vor
    expect(stats.topSpeed * 3.6).toBeGreaterThan(27);
    expect(stats.topSpeed * 3.6).toBeLessThan(33);
  });

  it('zählt auf flacher Strecke nur wenige Höhenmeter', () => {
    // Roh summiert wären es fast 200 m Aufstieg
    expect(stats.ascent).toBeLessThan(25);
    expect(stats.descent).toBeLessThan(30);
  });
});
