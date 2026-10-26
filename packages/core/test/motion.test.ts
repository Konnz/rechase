import { describe, expect, it } from 'vitest';
import { MotionTracker } from '../src/motion.ts';
import type { TrackPoint } from '../src/types.ts';
import { ride } from './helpers.ts';

function run(points: TrackPoint[]) {
  const m = new MotionTracker();
  for (const p of points) m.push(p);
  return m;
}

describe('MotionTracker', () => {
  it('zählt Distanz und Bewegungszeit bei konstanter Fahrt', () => {
    const m = run(ride([0, ...Array(60).fill(36)]));
    expect(m.current!.moving).toBe(true);
    expect(m.current!.distance).toBeCloseTo(600, -1);
    expect(m.current!.movingTime).toBe(60_000);
  });

  it('pausiert an der Ampel und zählt die Standzeit nicht', () => {
    const speeds = [0, ...Array(30).fill(36), ...Array(45).fill(0), ...Array(30).fill(36)];
    const m = run(ride(speeds));
    expect(m.current!.elapsed).toBe(105_000);
    // 60 s Fahrt plus höchstens die 3 s bis zur Pause und 1 s beim Anfahren
    expect(m.current!.movingTime).toBeGreaterThanOrEqual(60_000);
    expect(m.current!.movingTime).toBeLessThanOrEqual(64_000);
    expect(m.current!.distance).toBeCloseTo(600, -1);
  });

  it('erzeugt im Stand keine Distanz durch GPS-Drift', () => {
    const m = new MotionTracker();
    for (let i = 0; i < 60; i++) {
      // Position springt um einige Meter, gemeldete Geschwindigkeit ist 0
      m.push({ t: i * 1000, lat: 48.1 + (i % 2) * 0.00005, lon: 11.58, accuracy: 8, speed: 0 });
    }
    expect(m.current!.moving).toBe(false);
    expect(m.current!.distance).toBe(0);
    expect(m.current!.movingTime).toBe(0);
  });

  it('flattert nicht knapp unter der Weiterfahr-Schwelle', () => {
    const m = run(ride([0, 4, 4.5, 4, 4.5, 4]));
    expect(m.current!.moving).toBe(false);
  });

  it('verwirft ungenaue Punkte', () => {
    const m = new MotionTracker();
    expect(m.push({ t: 0, lat: 48, lon: 11, accuracy: 80 })).toBeNull();
    expect(m.rejected).toBe(1);
  });

  it('berechnet die Geschwindigkeit, wenn das GPS keine liefert', () => {
    const m = run(ride([0, 36, 36, 36], { withSpeed: false }));
    expect(m.current!.speed).toBeCloseTo(10, 1);
    expect(m.current!.moving).toBe(true);
  });

  it('erkennt Lücken in der Aufzeichnung', () => {
    const m = new MotionTracker();
    m.push({ t: 0, lat: 48, lon: 11, accuracy: 5, speed: 8 });
    m.push({ t: 30_000, lat: 48.002, lon: 11, accuracy: 5, speed: 8 });
    expect(m.gaps).toBe(1);
  });
});
