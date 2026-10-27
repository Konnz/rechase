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
    // 60 s Fahrt plus höchstens die Sekunde bis zur Pause und 1 s beim Anfahren
    expect(m.current!.movingTime).toBeGreaterThanOrEqual(60_000);
    expect(m.current!.movingTime).toBeLessThanOrEqual(62_000);
    expect(m.current!.distance).toBeCloseTo(600, -1);
  });

  it('pausiert beim Anhalten nach einer Sekunde', () => {
    // Bremsen wie es das GPS meldet, dann Stillstand
    const m = new MotionTracker();
    const pts = ride([0, ...Array(20).fill(25), 15, 6, 1, 0, 0, 0]);
    const states = pts.map((p) => m.push(p)?.moving);
    // Index 23 ist der erste Punkt fast im Stand
    expect(states[22]).toBe(true);
    expect(states[23]).toBe(false);
  });

  it('pausiert beim Kriechen nach zwei Sekunden', () => {
    // Gemessen ab dem letzten schnellen Punkt: nach einem langsamen Punkt läuft es noch, nach dem zweiten steht es
    expect(run(ride([0, ...Array(20).fill(25), 3])).current!.moving).toBe(true);
    expect(run(ride([0, ...Array(20).fill(25), 3, 3])).current!.moving).toBe(false);
  });

  it('pausiert nicht bei langsamer Fahrt bergauf', () => {
    const m = new MotionTracker();
    const states = ride([0, ...Array(10).fill(20), ...Array(60).fill(5), ...Array(5).fill(4.5)]).map(
      (p) => m.push(p)!.moving,
    );
    expect(states.slice(2).every(Boolean)).toBe(true);
  });

  it('pausiert nicht bei einem einzelnen Ausreißer knapp unter der Schwelle', () => {
    const m = run(ride([0, ...Array(10).fill(20), 3, 20, 3, 20]));
    expect(m.current!.moving).toBe(true);
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

  it('überspringt eine wiederholte alte Position und nimmt den Weg danach ohne Sprung', () => {
    const m = new MotionTracker();
    const pts = ride([0, ...Array(10).fill(25)], { withSpeed: false });
    pts.slice(0, 6).forEach((p) => m.push(p));
    // Alter Fix mit neuem Zeitstempel, danach der echte nächste Punkt
    expect(m.push({ ...pts[5]!, t: pts[5]!.t + 500 })).toBeNull();
    expect(m.stale).toBe(1);
    const next = m.push(pts[6]!)!;
    expect(next.moving).toBe(true);
    expect(next.speed * 3.6).toBeCloseTo(25, 0);
  });

  it('pausiert ohne GNSS-Geschwindigkeit nicht wegen Positionsrauschen', () => {
    // 20 km/h mit ±3 m seitlichem Rauschen: von Punkt zu Punkt schwankt das Tempo stark
    const m = new MotionTracker();
    const states = ride([0, ...Array(60).fill(20)], { withSpeed: false }).map((p, i) =>
      m.push({ ...p, lon: p.lon + (i % 3 === 0 ? 0.00004 : -0.00002) * (i % 2 ? 1 : -1) }),
    );
    expect(states.slice(5).every((s) => s!.moving)).toBe(true);
  });

  it('erkennt Lücken in der Aufzeichnung', () => {
    const m = new MotionTracker();
    m.push({ t: 0, lat: 48, lon: 11, accuracy: 5, speed: 8 });
    m.push({ t: 30_000, lat: 48.002, lon: 11, accuracy: 5, speed: 8 });
    expect(m.gaps).toBe(1);
  });
});
