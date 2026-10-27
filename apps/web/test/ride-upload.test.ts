import { parseRideUpload } from '@rechase/core';
import { describe, expect, it } from 'vitest';
import type { StoredRide, StoredRoute } from '../src/lib/db.ts';
import { fingerprint, toUpload, uploadable } from '../src/lib/rideUpload.ts';

const H = 3600 * 1000;
const p = (t: number) => ({ t, lat: 51.1, lon: 6.9, alt: 50, speed: 5, accuracy: 4 });
const ride: StoredRide = {
  id: 'r1',
  startedAt: 0,
  endedAt: 2000,
  raw: [p(0), p(1000), p(2000)],
  samples: [p(0), p(1000), p(2000)].map((x, i) => ({ ...x, moving: true, distance: i * 5, movingTime: i * 1000, elapsed: i * 1000 })),
  gaps: 0,
  rejected: 0,
  userAgent: 'Test',
  routeId: 'h',
  routeTime: 2000,
  bike: 'road',
  duel: { opponent: 'Bestzeit', opponentTime: 2500, time: 2000 },
};
const route: StoredRoute = {
  id: 'h',
  name: 'Hausrunde',
  createdAt: 0,
  points: [],
  length: 10,
  bestRideId: 'r1',
  bestTime: 2000,
  bestAt: 0,
  attempts: 3,
};

describe('Fahrt für den Feldtest', () => {
  it('lädt beendete Fahrten hoch, unbeendete erst, wenn sie liegen geblieben sind', () => {
    expect(uploadable(ride)).toBe(true);
    const open = { ...ride, endedAt: null };
    expect(uploadable(open, 3 * H)).toBe(false);
    expect(uploadable(open, 7 * H)).toBe(true);
    expect(uploadable({ ...ride, raw: [] })).toBe(false);
  });

  it('lädt neu hoch, wenn sich Rad, Strecke oder Widerspruch ändern', () => {
    const f = fingerprint(ride, 'u1');
    expect(fingerprint({ ...ride }, 'u1')).toBe(f);
    expect(fingerprint({ ...ride, bike: 'gravel' }, 'u1')).not.toBe(f);
    expect(fingerprint({ ...ride, appealedAt: 5 }, 'u1')).not.toBe(f);
    expect(fingerprint(ride, 'u2')).not.toBe(f);
  });

  it('nimmt Strecke und Duell mit und besteht die Prüfung des Servers', () => {
    const up = toUpload(ride, [route]);
    expect(up.route).toEqual({ id: 'h', name: 'Hausrunde', time: 2000, bestTime: 2000, isBest: true });
    const parsed = parseRideUpload(JSON.parse(JSON.stringify(up)));
    expect(parsed).toMatchObject({ ride: { id: 'r1', bike: 'road', duel: { time: 2000 }, route: { name: 'Hausrunde' } } });
  });
});
