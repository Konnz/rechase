import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { distanceM } from '../src/geo.ts';
import { MotionTracker } from '../src/motion.ts';
import {
  CODE_LENGTH,
  PRIVACY_TRIM,
  buildSharedGhost,
  challengeCodeFromPath,
  ghostSpeedProfile,
  parseSharedGhost,
  privateRange,
  trimRadii,
} from '../src/share.ts';
import type { MotionSample, TrackPoint } from '../src/types.ts';
import { parseGpx, ride } from './helpers.ts';

function samples(points: TrackPoint[]): MotionSample[] {
  const m = new MotionTracker();
  return points.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
}

/** 5 km gerade nach Norden mit 30 km/h */
const track = ride([0, ...Array(600).fill(30)]);
const moving = samples(track);
const off = { trim: false, zones: [], seed: 'x' };

describe('Privatzonen', () => {
  it('kürzt Start und Ende je Fahrt fest um 300 bis 800 m', () => {
    for (const seed of ['a', 'b', 'fahrt-123', crypto.randomUUID()]) {
      const r = trimRadii(seed);
      for (const v of [r.start, r.end]) {
        expect(v).toBeGreaterThanOrEqual(PRIVACY_TRIM.min);
        expect(v).toBeLessThanOrEqual(PRIVACY_TRIM.max);
      }
      expect(trimRadii(seed)).toEqual(r);
    }
    expect(trimRadii('a')).not.toEqual(trimRadii('b'));

    const r = privateRange(track, { trim: true, zones: [], seed: 'a' })!;
    const radii = trimRadii('a');
    expect(distanceM(track[r.from]!, track[0]!)).toBeGreaterThanOrEqual(radii.start);
    expect(distanceM(track[r.from - 1]!, track[0]!)).toBeLessThan(radii.start);
    expect(distanceM(track[r.to - 1]!, track.at(-1)!)).toBeGreaterThanOrEqual(radii.end);
    expect(r.cutStart).toBeCloseTo(radii.start, -1);
  });

  it('schneidet feste Zonen am Anfang und Ende ab, die Kürzung lässt sich abschalten', () => {
    expect(privateRange(track, off)).toMatchObject({ from: 0, to: track.length, cutStart: 0, cutEnd: 0 });
    // Zone von 1 km um einen Punkt 200 m nach dem Start: bis 1,2 km fällt alles weg
    const home = { id: 'h', name: 'Zuhause', lat: track[24]!.lat, lon: track[24]!.lon, radius: 1000 };
    const r = privateRange(track, { ...off, zones: [home] })!;
    expect(r.cutStart).toBeGreaterThan(1150);
    expect(r.cutEnd).toBe(0);
    // Liegt alles in der Zone, bleibt nichts
    expect(privateRange(track, { ...off, zones: [{ ...home, radius: 10_000 }] })).toBeNull();
  });
});

describe('Geteilter Ghost', () => {
  const input = { name: ' Isar-Runde ', points: moving, samples: moving, bike: 'road' as const, startedAt: Date.UTC(2026, 9, 27, 7, 30) };

  it('misst Zeit und Ghost auf der gekürzten Strecke neu', () => {
    const out = buildSharedGhost({ ...input, privacy: { trim: true, zones: [], seed: 'a' } });
    if ('error' in out) throw new Error(out.error);
    const { data } = out;
    expect(data.name).toBe('Isar-Runde');
    expect(data.day).toBe('2026-10-27');
    expect(data.length).toBeCloseTo(5000 - out.cutStart - out.cutEnd, -2);
    // 30 km/h: 120 s pro km
    expect(data.time / 1000).toBeCloseTo((data.length / 1000) * 120, -1);
    expect(distanceM(data.points[0]!, track[0]!)).toBeGreaterThan(PRIVACY_TRIM.min - 10);
    expect(data.ghost.distance.length).toBeLessThan(data.length / 10 + 3);
    // Der Server nimmt ihn so an
    expect(parseSharedGhost(JSON.parse(JSON.stringify(data)))).toEqual({ ghost: data });
  });

  it('lehnt zu kurze Reste ab', () => {
    const short = samples(ride([0, ...Array(150).fill(30)]));
    const out = buildSharedGhost({ ...input, points: short, samples: short, privacy: { trim: true, zones: [], seed: 'a' } });
    expect(out).toHaveProperty('error');
  });

  it('prüft, was der Server bekommt', () => {
    const out = buildSharedGhost({ ...input, privacy: off });
    if ('error' in out) throw new Error(out.error);
    const ok = out.data;
    expect(parseSharedGhost(null)).toHaveProperty('error');
    expect(parseSharedGhost({ ...ok, name: '' })).toHaveProperty('error');
    expect(parseSharedGhost({ ...ok, points: [{ lat: 200, lon: 0 }, ok.points[1]] })).toHaveProperty('error');
    expect(parseSharedGhost({ ...ok, bike: 'auto' })).toHaveProperty('error');
    expect(parseSharedGhost({ ...ok, day: 'gestern' })).toHaveProperty('error');
    const backwards = { distance: [...ok.ghost.distance].reverse(), movingTime: ok.ghost.movingTime };
    expect(parseSharedGhost({ ...ok, ghost: backwards })).toHaveProperty('error');
    // Dreimal so schnell: 90 km/h über Minuten
    const car = { distance: ok.ghost.distance, movingTime: ok.ghost.movingTime.map((t) => t / 3) };
    expect(parseSharedGhost({ ...ok, ghost: car, time: ok.time / 3 })).toEqual({ error: expect.stringMatching(/kein Rad/) });
  });

  it('färbt die Vorschau nach dem Tempo des Ghosts', () => {
    const out = buildSharedGhost({ ...input, privacy: off });
    if ('error' in out) throw new Error(out.error);
    const p = ghostSpeedProfile(out.data.points, out.data.ghost);
    expect(p.coords.length).toBe(out.data.points.length);
    expect(p.progress.at(-1)).toBeCloseTo(1);
    expect(p.min * 3.6).toBeCloseTo(30, 0);
  });
});

describe('Echte Fahrt teilen', () => {
  it('teilt die Probefahrt mit gekürztem Start und Ende und gleicher Bewegungszeit', () => {
    const points = parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8'));
    const all = samples(points);
    const mov = all.filter((s) => s.moving);
    const t0 = performance.now();
    const out = buildSharedGhost({
      name: 'Langenfeld–Düsseldorf',
      points: mov,
      samples: all,
      bike: 'road',
      startedAt: all[0]!.t,
      privacy: { trim: true, zones: [], seed: 'probefahrt' },
    });
    if ('error' in out) throw new Error(out.error);
    expect(performance.now() - t0).toBeLessThan(2000);
    const { data } = out;
    const total = all.at(-1)!;
    expect(data.length).toBeCloseTo(total.distance - out.cutStart - out.cutEnd, -3);
    // Gekürzt um gut einen Kilometer; die Zeit schrumpft im Verhältnis, Ampelstopps zählen nicht
    expect(data.time).toBeLessThan(total.movingTime);
    // Das Tempo bleibt fast gleich; Anfahrt und Ankunft sind etwas langsamer als die Mitte
    const pace = data.time / data.length / (total.movingTime / total.distance);
    expect(pace).toBeGreaterThan(0.95);
    expect(pace).toBeLessThan(1.02);
    expect(parseSharedGhost(JSON.parse(JSON.stringify(data)))).toHaveProperty('ghost');
    expect(JSON.stringify(data).length).toBeLessThan(400_000);
  });
});

describe('Challenge-Links', () => {
  it('liest den Code aus dem Pfad', () => {
    expect(challengeCodeFromPath('/c/AB23CD45')).toBe('AB23CD45');
    expect(challengeCodeFromPath('/c/ab23cd45/')).toBe('AB23CD45');
    expect(challengeCodeFromPath('/c/AB23CD4')).toBeNull();
    expect(challengeCodeFromPath('/c/AB23CD40')).toBeNull();
    expect(challengeCodeFromPath('/x/AB23CD45')).toBeNull();
    expect(CODE_LENGTH).toBe(8);
  });
});
