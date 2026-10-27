import { describe, expect, it } from 'vitest';
import { MotionTracker } from '../src/motion.ts';
import { rideStats, speedSegments } from '../src/stats.ts';
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

describe('speedSegments', () => {
  it('färbt langsame und schnelle Abschnitte unterschiedlich', () => {
    const { segments, min, max } = speedSegments(track(ride([...Array(40).fill(15), ...Array(40).fill(40)])));
    expect(min).toBeLessThan(max);
    expect(segments.at(0)!.level).toBe(0);
    expect(segments.at(-1)!.level).toBe(1);
    // Abschnitte schließen lückenlos aneinander an
    for (let i = 1; i < segments.length; i++) expect(segments[i]!.coords[0]).toEqual(segments[i - 1]!.coords.at(-1));
  });

  it('ist leer ohne Bewegung', () => {
    expect(speedSegments(track(ride(Array(10).fill(0)))).segments).toEqual([]);
  });
});
