import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ChallengeAbandon, ChallengeDetector } from '../src/challenge.ts';
import { distanceM } from '../src/geo.ts';
import { MotionTracker } from '../src/motion.ts';
import { RouteProgress, buildRoute } from '../src/route.ts';
import type { MotionSample, TrackPoint } from '../src/types.ts';
import { parseGpx, ride } from './helpers.ts';

function samples(points: TrackPoint[]): MotionSample[] {
  const m = new MotionTracker();
  return points.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
}

const probefahrt = samples(
  parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8')),
);
/** Strecke ab etwa km 5 der Probefahrt */
const startIdx = probefahrt.findIndex((s) => s.distance > 5000);
const route = buildRoute(probefahrt.slice(startIdx).filter((s) => s.moving));

describe('ChallengeDetector', () => {
  it('bietet das Duell vor der Startlinie an, einmal je Fahrt', () => {
    const d = new ChallengeDetector([{ id: 'r', route }]);
    const offers: { i: number; distance: number }[] = [];
    probefahrt.forEach((s, i) => {
      const e = d.push(s);
      if (e?.kind === 'offer') {
        offers.push({ i, distance: e.distance });
        d.resolve();
      }
    });
    expect(offers).toHaveLength(1);
    expect(offers[0].distance).toBeLessThanOrEqual(200);
    expect(offers[0].distance).toBeGreaterThan(100);
    // noch vor der Linie
    expect(offers[0].i).toBeLessThan(startIdx);
  });

  it('bietet nichts an, wenn man die Strecke rückwärts fährt', () => {
    const d = new ChallengeDetector([{ id: 'r', route }]);
    const back = [...probefahrt].reverse().map((s) => ({ ...s }));
    expect(back.map((s) => d.push(s)).filter(Boolean)).toEqual([]);
  });

  it('nimmt das Angebot zurück, wenn man abbiegt', () => {
    // 1 km nach Norden, Strecke beginnt nach 600 m und führt nach Osten weiter
    const north = ride([0, ...Array(60).fill(36)]);
    const corner = north[60];
    const east = Array.from({ length: 60 }, (_, i) => ({
      lat: corner.lat,
      lon: corner.lon + (i * 10) / (111_195 * Math.cos((corner.lat * Math.PI) / 180)),
    }));
    const r = buildRoute([...north.slice(50), ...east]);
    const d = new ChallengeDetector([{ id: 'r', route: r }]);
    // Fahrt nach Norden kommt an den Start (Richtung passt), fährt dann aber geradeaus weiter
    const events = ride([0, ...Array(120).fill(36)]).map((p) => d.push({ ...p, moving: true })).filter(Boolean);
    expect(events.map((e) => e!.kind)).toEqual(['offer', 'withdraw']);
  });

  it('bietet übersprungene Strecken nicht an', () => {
    const d = new ChallengeDetector([{ id: 'r', route }]);
    d.skip('r');
    expect(probefahrt.map((s) => d.push(s)).filter(Boolean)).toEqual([]);
  });
});

describe('Fliegender Start', () => {
  it('startet die Uhr erst an der Linie, nicht auf der Anfahrt', () => {
    const pts = samples(ride([0, ...Array(100).fill(36)]));
    const r = buildRoute(pts.slice(30));
    const p = new RouteProgress(r);
    const first = pts.findIndex((s) => p.push(s) != null);
    expect(distanceM(pts[first], r.points[0])).toBeLessThan(12);
    expect(first).toBeGreaterThanOrEqual(30);
  });
});

describe('ChallengeAbandon', () => {
  it('endet, wenn man nicht zum Start kommt', () => {
    const a = new ChallengeAbandon();
    expect(a.push({ t: 0, toStart: 180, onRoute: false, offset: 180 })).toBe(false);
    expect(a.push({ t: 1000, toStart: 320, onRoute: false, offset: 320 })).toBe(true);
  });

  it('übersteht kurze Ausreißer neben die Strecke, endet aber nach 20 s oder weit weg', () => {
    const a = new ChallengeAbandon();
    expect(a.push({ t: 0, toStart: null, onRoute: false, offset: 50 })).toBe(false);
    expect(a.push({ t: 5000, toStart: null, onRoute: true, offset: 5 })).toBe(false);
    expect(a.push({ t: 6000, toStart: null, onRoute: false, offset: 60 })).toBe(false);
    expect(a.push({ t: 25_000, toStart: null, onRoute: false, offset: 60 })).toBe(false);
    expect(a.push({ t: 26_000, toStart: null, onRoute: false, offset: 60 })).toBe(true);
    expect(new ChallengeAbandon().push({ t: 0, toStart: null, onRoute: false, offset: 200 })).toBe(true);
  });
});
