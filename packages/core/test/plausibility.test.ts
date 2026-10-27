import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MotionTracker } from '../src/motion.ts';
import { checkPlausibility } from '../src/plausibility.ts';
import type { MotionSample, TrackPoint } from '../src/types.ts';
import { parseGpx } from './helpers.ts';

const track = (pts: TrackPoint[]) => {
  const m = new MotionTracker();
  return pts.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
};

/** Ein Abschnitt: so viele Sekunden, Tempo von…bis (km/h, linear), Steigung als Anteil */
type Leg = { s: number; from: number; to?: number; grade?: number };

/**
 * Fahrt aus Abschnitten, je Sekunde ein Punkt nach Norden. Mit leichtem Positions- und Höhenrauschen
 * wie bei einem Handy, aber ohne GNSS-Geschwindigkeit: Der Tracker rechnet sie aus den Positionen.
 */
function trip(legs: Leg[], { start = 0, alt = 100 }: { start?: number; alt?: number | null } = {}): TrackPoint[] {
  const mPerDeg = 111_195;
  let north = 0;
  let h = alt ?? 0;
  let t = start;
  let n = 0;
  const pts: TrackPoint[] = [];
  const noise = () => Math.sin(n * 12.9898) * 2;
  const push = () => {
    pts.push({
      t,
      lat: 51.1 + (north + noise()) / mPerDeg,
      lon: 6.95 + noise() / 70_000,
      alt: alt == null ? null : h + noise(),
      speed: null,
      accuracy: 6,
    });
    n++;
  };
  push();
  for (const leg of legs) {
    for (let i = 0; i < leg.s; i++) {
      const v = (leg.from + ((leg.to ?? leg.from) - leg.from) * ((i + 0.5) / leg.s)) / 3.6;
      north += v;
      h += v * (leg.grade ?? 0);
      t += 1000;
      push();
    }
  }
  return pts;
}

const check = (legs: Leg[], bike: Parameters<typeof checkPlausibility>[1] = 'road', alt?: number | null) =>
  checkPlausibility(track(trip(legs, { alt })), bike);

/** Stadtfahrt mit dem Rad: anfahren, rollen, an Ampeln halten */
const cityBike: Leg[] = Array.from({ length: 6 }, () => [
  { s: 12, from: 0, to: 26 },
  { s: 90, from: 26 },
  { s: 8, from: 26, to: 0 },
  { s: 25, from: 0 },
]).flat();

describe('checkPlausibility', () => {
  it('lässt die Probefahrt mit dem Pixel 10 Pro in allen Klassen gelten', () => {
    const points = parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8'));
    const samples = track(points);
    for (const bike of ['road', 'ebike', 'speed-pedelec'] as const) {
      const r = checkPlausibility(samples, bike);
      expect(r.flags).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.suggestion).toBeNull();
    }
  });

  it('lässt normale und schnelle Radfahrten gelten', () => {
    expect(check(cityBike).ok).toBe(true);
    // Schnelle Gruppe: 5 min mit 44 km/h, kurzer Sprint auf 58 km/h
    expect(check([{ s: 20, from: 0, to: 40 }, { s: 300, from: 44 }, { s: 10, from: 44, to: 58 }, { s: 15, from: 58 }]).ok).toBe(true);
    // Abfahrt mit 75 km/h bei 8 % Gefälle
    expect(check([{ s: 30, from: 0, to: 50 }, { s: 120, from: 75, grade: -0.08 }]).ok).toBe(true);
    // Starker Antritt: in 7 s auf 40 km/h
    expect(check([{ s: 7, from: 0, to: 42 }, { s: 30, from: 42 }]).ok).toBe(true);
    // Anstieg mit 1.400 Höhenmetern pro Stunde
    expect(check([{ s: 900, from: 14, grade: 1400 / 14_000 }]).ok).toBe(true);
  });

  it('erkennt ein Auto auf der Landstraße', () => {
    const r = check([...cityBike, { s: 15, from: 0, to: 100 }, { s: 240, from: 100 }]);
    expect(r.ok).toBe(false);
    expect(r.flags.map((f) => f.rule)).toContain('speed');
    expect(r.suggestion).toBe('none');
    expect(r.flags.find((f) => f.rule === 'speed')!.message).toMatch(/kein Fahrrad/);
  });

  it('erkennt eine S-Bahn ohne Gefälle', () => {
    const legs: Leg[] = Array.from({ length: 4 }, () => [
      { s: 25, from: 0, to: 70 },
      { s: 60, from: 70 },
      { s: 20, from: 70, to: 0 },
      { s: 30, from: 0 },
    ]).flat();
    const r = check(legs);
    expect(r.ok).toBe(false);
    expect(r.flags[0]!.rule).toBe('speed');
  });

  it('erkennt das harte Anfahren eines Autos in der Stadt', () => {
    const r = check([...cityBike, { s: 4, from: 0, to: 50 }, { s: 20, from: 50 }, { s: 6, from: 50, to: 0 }, { s: 20, from: 0 }]);
    expect(r.ok).toBe(false);
    expect(r.flags.map((f) => f.rule)).toEqual(['acceleration']);
    expect(r.suggestion).toBe('none');
  });

  it('nimmt einen GPS-Sprung beim Anfahren nicht als Beschleunigung', () => {
    // Für 3 s springt die Position nach vorn, danach geht es mit Radtempo weiter
    const r = check([{ s: 3, from: 0, to: 15 }, { s: 3, from: 60 }, { s: 60, from: 22 }]);
    expect(r.flags.map((f) => f.rule)).not.toContain('acceleration');
  });

  it('erkennt eine Passstraße im Auto an der Steigleistung', () => {
    // 40 km/h bei 8 %: 3.200 Höhenmeter pro Stunde
    const r = check([{ s: 15, from: 0, to: 40 }, { s: 600, from: 40, grade: 0.08 }]);
    expect(r.ok).toBe(false);
    expect(r.flags.map((f) => f.rule)).toEqual(['climb']);
    // Ein S-Pedelec schafft das
    expect(r.suggestion).toBe('speed-pedelec');
  });

  it('erkennt einen Sprung über eine Empfangslücke', () => {
    const pts = trip([{ s: 60, from: 20 }]);
    const last = pts.at(-1)!;
    // 30 s ohne Empfang, dann 2 km weiter
    pts.push({ ...last, t: last.t + 30_000, lat: last.lat + 2000 / 111_195 });
    for (let i = 1; i <= 20; i++) pts.push({ ...last, t: last.t + 30_000 + i * 1000, lat: last.lat + (2000 + i * 5.5) / 111_195 });
    const r = checkPlausibility(track(pts), 'road');
    expect(r.ok).toBe(false);
    expect(r.flags.map((f) => f.rule)).toContain('teleport');
  });

  it('trennt E-Bike und S-Pedelec', () => {
    const sPedelec: Leg[] = [{ s: 20, from: 0, to: 40 }, { s: 600, from: 40 }];
    expect(check(sPedelec, 'speed-pedelec').ok).toBe(true);
    // Als Rennrad noch plausibel: 40 km/h schafft ein starker Fahrer
    expect(check(sPedelec, 'road').ok).toBe(true);
    const asEbike = check(sPedelec, 'ebike');
    expect(asEbike.ok).toBe(false);
    expect(asEbike.bikeClass).toBe('ebike');
    expect(asEbike.suggestion).toBe('muscle');
    expect(asEbike.flags[0]!.message).toMatch(/E-Bike/);
  });

  it('wertet Fahrten ohne Rad wie Muskelkraft', () => {
    expect(check(cityBike, undefined).bikeClass).toBe('muscle');
  });

  it('prüft ohne Höhendaten alles als flach', () => {
    const r = check([{ s: 20, from: 0, to: 65 }, { s: 60, from: 65 }], 'road', null);
    expect(r.ok).toBe(false);
    expect(r.flags.map((f) => f.rule)).toEqual(['speed']);
  });
});
