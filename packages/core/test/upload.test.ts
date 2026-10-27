import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MotionTracker } from '../src/motion.ts';
import type { MotionSample } from '../src/types.ts';
import { describeDevice, parseRideUpload, summarizeRide, type RideUpload } from '../src/upload.ts';
import { parseGpx, ride as straight } from './helpers.ts';

const PIXEL_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

function upload(points = straight([0, 10, 20, 25, 25, 25, 25, 25, 0, 0]), extra: Partial<RideUpload> = {}): RideUpload {
  const m = new MotionTracker();
  const samples = points.map((p) => m.push(p)).filter((s): s is MotionSample => s != null);
  return {
    id: 'r1',
    startedAt: points[0]!.t,
    endedAt: points.at(-1)!.t,
    raw: points,
    samples,
    gaps: m.gaps,
    rejected: m.rejected,
    userAgent: PIXEL_UA,
    ...extra,
  };
}

describe('Gerät', () => {
  it('nimmt das Modell aus den Client Hints, weil Chrome es im User-Agent versteckt', () => {
    expect(describeDevice(PIXEL_UA, { model: 'Pixel 10 Pro', platform: 'Android', platformVersion: '16.0.0' })).toEqual({
      model: 'Pixel 10 Pro',
      os: 'Android 16',
      browser: 'Chrome 141',
    });
    expect(describeDevice(PIXEL_UA).model).toBe('Android-Gerät');
  });

  it('erkennt iPhone mit Safari', () => {
    expect(describeDevice(IPHONE_UA)).toEqual({ model: 'iPhone', os: 'iOS 18.4', browser: 'Safari 18' });
  });
});

describe('Fahrt hochladen', () => {
  it('übernimmt nur bekannte Felder und lehnt kaputte Punkte ab', () => {
    const u = upload(undefined, { bike: 'road' });
    const parsed = parseRideUpload({ ...u, extra: 'weg', raw: u.raw.map((p) => ({ ...p, foo: 1 })) });
    expect('ride' in parsed && parsed.ride.bike).toBe('road');
    expect('ride' in parsed && 'extra' in parsed.ride).toBe(false);
    expect('ride' in parsed && 'foo' in parsed.ride.raw[0]!).toBe(false);

    expect(parseRideUpload({ ...u, raw: [{ t: 1, lat: 'x', lon: 0, accuracy: 3 }] })).toEqual({ error: 'Ungültige Punkte.' });
    expect(parseRideUpload({ ...u, id: '../x' })).toEqual({ error: 'Ungültige Fahrt-ID.' });
    expect(parseRideUpload({ ...u, bike: 'auto' })).toMatchObject({ ride: { id: 'r1' } });
  });

  it('fasst die Probefahrt zusammen: Pausen, Akku pro Stunde, Duell', () => {
    const points = parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8'));
    const u = upload(points, {
      bike: 'gravel',
      device: { model: 'Pixel 10 Pro', platform: 'Android', platformVersion: '16' },
      battery: { start: 0.9, end: 0.8, charging: false },
      duel: { opponent: 'Bestzeit', opponentTime: 60 * 60_000, time: 59 * 60_000 },
    });
    const s = summarizeRide(u);
    expect(s.distance / 1000).toBeCloseTo(21.9, 0);
    expect(s.stops).toBeGreaterThan(15);
    expect(s.plausible).toBe(true);
    expect(s.duel).toEqual({ opponent: 'Bestzeit', won: true, finished: true });
    // 10 Prozentpunkte in gut 73 Minuten
    expect(s.batteryPerHour).toBeGreaterThan(7);
    expect(s.batteryPerHour).toBeLessThan(9);
    expect(s.device.model).toBe('Pixel 10 Pro');
  });

  it('bleibt gepackt klein genug für den Upload', () => {
    const points = parseGpx(readFileSync(new URL('./fixtures/probefahrt-2026-10-27.gpx', import.meta.url), 'utf8'));
    const bytes = gzipSync(JSON.stringify(upload(points))).length;
    // 73 Minuten Fahrt
    expect(bytes).toBeLessThan(1024 * 1024);
  });
});
