import { describe, expect, it } from 'vitest';
import { fieldTestStats, weekStart, type AdminRide } from '../src/fieldtest.ts';
import type { RideSummary } from '../src/upload.ts';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 28, 12).getTime(); // Mittwoch

const summary = (s: Partial<RideSummary> = {}): RideSummary => ({
  complete: true,
  distance: 10_000,
  movingTime: 1_800_000,
  elapsed: 2_000_000,
  pausedTime: 200_000,
  stops: 4,
  ascent: 50,
  gaps: 0,
  rejected: 0,
  hidden: 0,
  points: 100,
  accuracy: 5,
  bike: 'road',
  plausible: true,
  flags: [],
  appealed: false,
  routeName: null,
  routeTime: null,
  duel: null,
  batteryPerHour: null,
  device: { model: 'Pixel 10 Pro', os: 'Android 16', browser: 'Chrome 141' },
  ...s,
});

const ride = (userId: string, startedAt: number, s?: Partial<RideSummary>): AdminRide => ({
  id: `${userId}-${startedAt}`,
  userId,
  userName: userId,
  startedAt,
  endedAt: startedAt + 1,
  uploadedAt: startedAt + 2,
  summary: summary(s),
});

describe('Kennzahlen im Feldtest', () => {
  it('beginnt Wochen am Montag', () => {
    expect(new Date(weekStart(NOW)).getDay()).toBe(1);
    expect(weekStart(NOW)).toBeLessThanOrEqual(NOW);
    expect(NOW - weekStart(NOW)).toBeLessThan(7 * DAY);
  });

  it('zählt aktive Tester je Woche, Duelle, Lücken, Genauigkeit und Akku', () => {
    const rides = [
      ride('a', NOW - DAY, { duel: { opponent: 'Bestzeit', won: true, finished: true }, batteryPerHour: 8 }),
      ride('a', NOW - 2 * DAY, { gaps: 2, accuracy: 9, points: 300 }),
      ride('b', NOW - 9 * DAY, { duel: { opponent: 'Bestzeit', won: false, finished: true }, batteryPerHour: 12 }),
      ride('c', NOW - 2 * DAY, { plausible: false, flags: ['speed'], device: { model: 'iPhone', os: 'iOS 18.4', browser: 'Safari 18' } }),
    ];
    const s = fieldTestStats(rides, 5, { now: NOW });
    expect(s).toMatchObject({ testers: 5, activeTesters: 2, rides: 4, distance: 40_000, duels: 2, duelsWon: 1, gapShare: 0.25 });
    expect(s.accuracy).toBeCloseTo((5 * 100 + 9 * 300 + 5 * 100 + 5 * 100) / 600);
    expect(s.batteryPerHour).toBe(10);
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks.at(-1)).toMatchObject({ activeTesters: 2, rides: 3 });
    expect(s.weeks.at(-2)).toMatchObject({ activeTesters: 1, rides: 1 });
    expect(s.byDevice).toEqual([
      { label: 'Pixel 10 Pro', rides: 3 },
      { label: 'iPhone', rides: 1 },
    ]);
    expect(s.suspicious.map((x) => x.reasons)).toEqual([['plausibility']]);
  });
});
