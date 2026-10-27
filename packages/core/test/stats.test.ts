import { describe, expect, it } from 'vitest';
import { MotionTracker } from '../src/motion.ts';
import { rideStats, speedProfile } from '../src/stats.ts';
import type { MotionSample, TrackPoint } from '../src/types.ts';
import { ride } from './helpers.ts';

const track = (pts: TrackPoint[]) => {
  const m = new MotionTracker();
  return pts.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
};

describe('rideStats', () => {
  it('trennt netto und brutto und zählt Stopps', () => {
    const s = rideStats(track(ride([...Array(60).fill(30), ...Array(20).fill(0), ...Array(60).fill(30)])));
    expect(s.stops).toBe(1);
    expect(s.elapsed).toBe(139_000);
    expect(s.movingTime).toBeLessThan(s.elapsed - 10_000);
    expect(s.pausedTime).toBe(s.elapsed - s.movingTime);
    expect(s.avgSpeed * 3.6).toBeGreaterThan(25);
    expect(s.avgSpeed * 3.6).toBeLessThan(31);
  });

  it('glättet die Höchstgeschwindigkeit gegen einzelne Ausreißer', () => {
    const speeds = Array(60).fill(30);
    speeds[30] = 90;
    expect(rideStats(track(ride(speeds))).topSpeed * 3.6).toBeLessThan(45);
  });

  it('begrenzt die Höchstgeschwindigkeit bei einem GPS-Sprung über mehrere Punkte', () => {
    // Position springt für 4 s nach vorn: 50 km/h bei 20 km/h Fahrt
    const speeds = [...Array(30).fill(20), 50, 50, 50, 50, ...Array(30).fill(20)];
    expect(rideStats(track(ride(speeds))).topSpeed * 3.6).toBeLessThan(32);
  });

  it('erreicht die Höchstgeschwindigkeit bei echter Beschleunigung', () => {
    const speeds = [0, ...Array.from({ length: 40 }, (_, i) => Math.min(45, 10 + i * 3)), ...Array(10).fill(45)];
    expect(rideStats(track(ride(speeds))).topSpeed * 3.6).toBeGreaterThan(44);
  });

  it('zählt Höhenmeter mit Schwelle gegen GPS-Rauschen', () => {
    const pts = ride(Array(200).fill(25)).map((p, i) => ({
      ...p,
      // 100 Punkte bergauf auf 50 m, dann ±2 m Rauschen
      alt: i < 100 ? 300 + i * 0.5 : 350 + (i % 2 ? 3 : -3),
    }));
    const s = rideStats(track(pts));
    expect(s.ascent).toBeGreaterThan(44);
    expect(s.ascent).toBeLessThan(54);
    expect(s.descent).toBeLessThan(5);
    expect(Math.round(s.maxAlt!)).toBe(351);
  });

  it('liefert null ohne Höhendaten', () => {
    expect(rideStats(track(ride(Array(10).fill(20)))).ascent).toBeNull();
  });
});

describe('speedProfile', () => {
  it('färbt langsam nach schnell stufenlos ein', () => {
    const p = speedProfile(track(ride([...Array(40).fill(15), ...Array(40).fill(40)])));
    expect(p.min).toBeLessThan(p.max);
    expect(p.levels.length).toBe(p.coords.length);
    expect(p.levels.at(1)).toBeCloseTo(0);
    expect(p.levels.at(-1)).toBe(1);
    // Kein harter Sprung: der Wechsel verteilt sich über mehrere Punkte
    const jumps = p.levels.slice(1).map((l, i) => Math.abs(l - p.levels[i]!));
    expect(Math.max(...jumps)).toBeLessThan(0.2);
  });

  it('liefert den Streckenanteil von 0 bis 1', () => {
    const p = speedProfile(track(ride(Array(30).fill(25))));
    expect(p.progress[0]).toBe(0);
    expect(p.progress.at(-1)).toBe(1);
    expect(p.progress.every((x, i) => i === 0 || x >= p.progress[i - 1]!)).toBe(true);
  });

  it('ist leer ohne Bewegung', () => {
    expect(speedProfile(track(ride(Array(10).fill(0)))).coords).toEqual([]);
  });
});
