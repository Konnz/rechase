import { describe, expect, it } from 'vitest';
import { compareToGhost } from '../src/ghost.ts';
import { MotionTracker } from '../src/motion.ts';
import {
  GapTrend,
  altitudeAt,
  elevationProfile,
  RouteMatcher,
  RouteProgress,
  buildRoute,
  finishTime,
  ghostFromSamples,
  ghostSpeedAt,
  pointAt,
} from '../src/route.ts';
import type { MotionSample, TrackPoint } from '../src/types.ts';
import { ride } from './helpers.ts';

const M_PER_DEG = 111_195;

function samples(points: TrackPoint[]): MotionSample[] {
  const m = new MotionTracker();
  return points.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
}

/** 1 km gerade nach Norden mit 36 km/h */
const straight = ride([0, ...Array(100).fill(36)]);
const route = buildRoute(straight);

describe('buildRoute', () => {
  it('summiert die Länge und dünnt aus', () => {
    expect(route.length).toBeCloseTo(1000, -1);
    expect(buildRoute(straight, 25).points.length).toBeLessThan(straight.length / 2);
    expect(route.cum[0]).toBe(0);
  });

  it('findet Punkte auf der Strecke', () => {
    const p = pointAt(route, 500)!;
    expect((p.lat - 48.1) * M_PER_DEG).toBeCloseTo(500, -1);
    expect(pointAt(route, -5)).toEqual(route.points[0]);
    expect(pointAt(route, 9999)).toEqual(route.points.at(-1));
  });
});

describe('RouteMatcher', () => {
  it('folgt der Strecke nur vorwärts', () => {
    const m = new RouteMatcher(route);
    let last = 0;
    for (const p of straight) {
      const r = m.push(p);
      expect(r.onRoute).toBe(true);
      expect(r.along!).toBeGreaterThanOrEqual(last);
      last = r.along!;
    }
    expect(last).toBeCloseTo(1000, -1);
  });

  it('rastet erst am Startpunkt ein', () => {
    const m = new RouteMatcher(route);
    // Mitten auf der Strecke einsteigen: zählt nicht als Start
    expect(m.push({ ...straight[50], t: 0 }).along).toBeNull();
  });

  it('erkennt das Verlassen der Strecke und den Wiedereinstieg', () => {
    const m = new RouteMatcher(route);
    for (const p of straight.slice(0, 30)) m.push(p);
    // 200 m nach Osten versetzt
    const off = m.push({ ...straight[35], lon: straight[35].lon + 200 / (M_PER_DEG * Math.cos(0.84)) });
    expect(off.onRoute).toBe(false);
    expect(off.offset).toBeGreaterThan(100);
    const back = m.push(straight[60]);
    expect(back.onRoute).toBe(true);
    expect(back.along!).toBeCloseTo(600, -1);
  });

  it('springt auf einer Hin-und-zurück-Strecke nicht aufs Rückstück', () => {
    const out = ride([0, ...Array(50).fill(36)]);
    const back = out
      .slice(0, -1)
      .reverse()
      .map((p, i) => ({ ...p, t: out.at(-1)!.t + (i + 1) * 1000 }));
    const loop = [...out, ...back];
    const r = buildRoute(loop);
    expect(r.length).toBeCloseTo(1000, -1);
    const m = new RouteMatcher(r);
    const alongs = loop.map((p) => m.push(p).along!);
    // Kurz nach dem Start bleibt man vorn, nicht schon beim Rückweg
    expect(alongs[5]).toBeLessThan(80);
    expect(alongs[45]).toBeLessThan(480);
    expect(alongs.at(-1)!).toBeCloseTo(1000, -1);
  });
});

describe('Ghost aus einer Fahrt', () => {
  it('braucht für 1 km mit 36 km/h 100 s', () => {
    const g = ghostFromSamples(route, samples(straight));
    expect(finishTime(route, g)! / 1000).toBeCloseTo(100, 0);
  });

  it('rechnet die Ampel nicht mit: gleiche Zielzeit mit und ohne Stopp', () => {
    const withStop = ride([0, ...Array(50).fill(36), ...Array(60).fill(0), ...Array(50).fill(36)]);
    const g = ghostFromSamples(route, samples(withStop));
    // höchstens die 3 s bis zur Pause plus 1 s beim Anfahren
    expect(finishTime(route, g)! / 1000).toBeGreaterThanOrEqual(99);
    expect(finishTime(route, g)! / 1000).toBeLessThanOrEqual(105);
  });

  it('zählt die Anfahrt vor dem Startpunkt nicht', () => {
    // 300 m Anfahrt von Süden, dann die Strecke
    const lead = ride([0, ...Array(130).fill(36)]).map((p) => ({ ...p, lat: p.lat - 300 / M_PER_DEG }));
    const g = ghostFromSamples(route, samples(lead));
    expect(finishTime(route, g)! / 1000).toBeCloseTo(100, -1);
  });

  it('liefert keine Zielzeit für eine abgebrochene Fahrt', () => {
    const g = ghostFromSamples(route, samples(straight.slice(0, 60)));
    expect(finishTime(route, g)).toBeNull();
  });

  it('kennt das Tempo des Ghosts an jeder Stelle', () => {
    const g = ghostFromSamples(route, samples(straight));
    expect(ghostSpeedAt(g, 500)! * 3.6).toBeCloseTo(36, 0);
  });

  it('vergleicht eine schnellere Live-Fahrt fair mit dem Ghost', () => {
    const g = ghostFromSamples(route, samples(straight));
    const live = new RouteProgress(route);
    const fast = samples(ride([0, ...Array(100).fill(40)]));
    let gap = null;
    for (const s of fast.slice(0, 51)) {
      const r = live.push(s);
      if (r) gap = compareToGhost(g, { distance: r.along, movingTime: r.time });
    }
    // Nach 50 s mit 40 statt 36 km/h: rund 55 m bzw. 5,5 s Vorsprung
    expect(gap!.meters).toBeCloseTo(-55, -1);
    expect(gap!.seconds!).toBeCloseTo(-5.6, 0);
  });
});

describe('GapTrend', () => {
  it('meldet gewonnene Sekunden pro km', () => {
    const t = new GapTrend();
    let rate = null;
    for (let d = 0; d <= 1000; d += 100) rate = t.push(d, 10 - d / 1000);
    expect(rate).toBeCloseTo(-1);
  });

  it('schweigt, solange die Messstrecke zu kurz ist', () => {
    const t = new GapTrend();
    expect(t.push(0, 3)).toBeNull();
    expect(t.push(100, 2)).toBeNull();
  });
});

describe('Höhenprofil', () => {
  it('folgt einem gleichmäßigen Anstieg und glättet Rauschen', () => {
    // 5 % Steigung mit ±2 m Rauschen
    const pts = straight.map((p, i) => ({ ...p, alt: 500 + i * 0.5 + (i % 2 ? 2 : -2) }));
    const prof = elevationProfile(route, samples(pts))!;
    expect(altitudeAt(prof, 500) - altitudeAt(prof, 200)).toBeCloseTo(15, -1);
    expect(Math.abs(altitudeAt(prof, 500) - 525)).toBeLessThan(1.5);
  });

  it('gibt ohne Höhen nichts zurück', () => {
    expect(elevationProfile(route, samples(straight))).toBeNull();
  });
});
