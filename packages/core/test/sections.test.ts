import { describe, expect, it } from 'vitest';
import { buildGhost } from '../src/ghost.ts';
import { SectionTimer, bestSectionTimes, sectionBounds, sectionTimes } from '../src/sections.ts';

// konstant v m/s über len m
const at = (v: number, len = 3000) =>
  buildGhost(Array.from({ length: len / 10 + 1 }, (_, i) => ({ distance: i * 10, movingTime: (i * 10 * 1000) / v })));

describe('sectionBounds', () => {
  it('teilt in Abschnitte von etwa 1 km', () => {
    expect(sectionBounds(3000)).toEqual([0, 1000, 2000, 3000]);
    expect(sectionBounds(2600)).toHaveLength(4);
  });

  it('teilt kurze Strecken nicht und lange in höchstens 10', () => {
    expect(sectionBounds(1500)).toEqual([]);
    expect(sectionBounds(42_000)).toHaveLength(11);
  });
});

describe('Abschnittszeiten', () => {
  const bounds = [0, 1000, 2000, 3000];

  it('misst jede Fahrt je Abschnitt', () => {
    expect(sectionTimes(at(10), bounds)).toEqual([100_000, 100_000, 100_000]);
  });

  it('zählt das Ziel auch, wenn die Fahrt knapp davor endet', () => {
    expect(sectionTimes(at(10, 2970), bounds)[2]).toBeCloseTo(97_000);
    expect(sectionTimes(at(10, 2500), bounds)[2]).toBeNull();
  });

  it('nimmt je Abschnitt die beste Fahrt', () => {
    const mixed = buildGhost([
      { distance: 0, movingTime: 0 },
      { distance: 1000, movingTime: 80_000 },
      { distance: 3000, movingTime: 300_000 },
    ]);
    expect(bestSectionTimes([at(10), mixed], bounds)).toEqual([80_000, 100_000, 100_000]);
  });
});

describe('SectionTimer', () => {
  const bounds = [0, 1000, 2000, 3000];

  it('meldet Abschnitte mit PR, interpoliert an der Grenze', () => {
    const timer = new SectionTimer(bounds, [100_000, 90_000, null]);
    const out = [];
    // 11 m/s, Punkte alle 50 m
    for (let d = 50; d <= 3000; d += 50) out.push(...timer.push(d, (d / 11) * 1000, true));
    expect(out.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(out[0].time).toBeCloseTo(90_909, 0);
    expect(out.map((r) => r.pr)).toEqual([true, false, false]);
  });

  it('wertet einen Abschnitt nicht, wenn man die Strecke verlassen hat', () => {
    const timer = new SectionTimer(bounds, [100_000, 100_000, 100_000]);
    const out = [];
    out.push(...timer.push(500, 50_000, true));
    out.push(...timer.push(500, 60_000, false));
    // Zurück auf der Strecke, aber ein ganzes Stück weiter vorn
    out.push(...timer.push(2100, 70_000, true));
    out.push(...timer.push(3000, 150_000, true));
    expect(out).toEqual([]);
  });
});
