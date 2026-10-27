import { describe, expect, it } from 'vitest';
import { DuelCues, tickInterval, type DuelCueInput } from '../src/cues.ts';

const base: DuelCueInput = { t: 0, along: 0, routeLength: 3000, gapMeters: 0, onRoute: true, finished: false };

describe('DuelCues', () => {
  it('meldet Überholen und Überholtwerden, nicht aber die Lage am Start', () => {
    const c = new DuelCues();
    expect(c.push({ ...base, t: 0, along: 10, gapMeters: 8 })).toEqual([]);
    expect(c.push({ ...base, t: 10_000, along: 200, gapMeters: -5 })).toEqual([{ kind: 'overtake' }]);
    expect(c.push({ ...base, t: 20_000, along: 400, gapMeters: 6 })).toEqual([{ kind: 'overtaken' }]);
  });

  it('flattert nicht, solange der Abstand im Rauschen liegt', () => {
    const c = new DuelCues();
    c.push({ ...base, along: 10, gapMeters: 10 });
    const cues = [1, -2, 2, -1, 0].flatMap((m, i) => c.push({ ...base, t: (i + 1) * 1000, along: 20 + i, gapMeters: m }));
    expect(cues).toEqual([]);
  });

  it('hält eine Pause zwischen zwei Überhol-Tönen ein', () => {
    const c = new DuelCues();
    c.push({ ...base, along: 10, gapMeters: 10 });
    expect(c.push({ ...base, t: 1000, along: 20, gapMeters: -4 })).toHaveLength(1);
    expect(c.push({ ...base, t: 2000, along: 30, gapMeters: 4 })).toEqual([]);
    expect(c.push({ ...base, t: 9000, along: 100, gapMeters: -4 })).toEqual([]);
    expect(c.push({ ...base, t: 10_000, along: 110, gapMeters: 5 })).toEqual([{ kind: 'overtaken' }]);
  });

  it('läutet je vollem Kilometer nur in Führung', () => {
    const c = new DuelCues();
    expect(c.push({ ...base, along: 990, gapMeters: -20 })).toEqual([]);
    expect(c.push({ ...base, t: 1000, along: 1005, gapMeters: -20 })).toEqual([{ kind: 'km-lead', km: 1 }]);
    expect(c.push({ ...base, t: 99_000, along: 2010, gapMeters: 20 })).toEqual([{ kind: 'overtaken' }]);
  });

  it('zählt die letzten 500 m herunter und meldet das Ziel einmal', () => {
    const c = new DuelCues();
    const cues = [2400, 2510, 2650, 2710, 2905].flatMap((along, i) =>
      c.push({ ...base, t: i * 1000, along, gapMeters: 30 }),
    );
    expect(cues).toEqual([
      { kind: 'countdown', meters: 500 },
      { kind: 'countdown', meters: 300 },
      { kind: 'countdown', meters: 100 },
    ]);
    expect(c.push({ ...base, along: 3000, finished: true, won: true })).toEqual([{ kind: 'finish', won: true }]);
    expect(c.push({ ...base, along: 3000, finished: true, won: true })).toEqual([]);
  });
});

describe('tickInterval', () => {
  it('tickt nur knapp hinter dem Ghost, schneller je näher', () => {
    expect(tickInterval(6, null)).toBeNull();
    expect(tickInterval(-1, null)).toBeNull();
    expect(tickInterval(null, null)).toBeNull();
    expect(tickInterval(4, -2)!).toBeGreaterThan(tickInterval(1, -2)!);
  });

  it('schweigt, wenn man weiter zurückfällt', () => {
    expect(tickInterval(3, 1.5)).toBeNull();
  });
});
