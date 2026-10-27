import { describe, expect, it } from 'vitest';
import { averageGhost, buildGhost, compareToGhost, ghostDistanceAt, ghostTimeAt } from '../src/ghost.ts';

// Ghost fährt konstant 10 m/s über 1000 m
const ghost = buildGhost(Array.from({ length: 101 }, (_, i) => ({ distance: i * 10, movingTime: i * 1000 })));

describe('Ghost', () => {
  it('interpoliert Zeit und Distanz', () => {
    expect(ghostTimeAt(ghost, 255)).toBeCloseTo(25_500);
    expect(ghostDistanceAt(ghost, 42_000)).toBeCloseTo(420);
  });

  it('meldet Rückstand in Sekunden und Metern', () => {
    // Nach 50 s bin ich erst bei 450 m, der Ghost bei 500 m
    const gap = compareToGhost(ghost, { distance: 450, movingTime: 50_000 });
    expect(gap.seconds).toBeCloseTo(5);
    expect(gap.meters).toBeCloseTo(50);
  });

  it('meldet Vorsprung negativ', () => {
    const gap = compareToGhost(ghost, { distance: 550, movingTime: 50_000 });
    expect(gap.seconds).toBeCloseTo(-5);
    expect(gap.meters).toBeCloseTo(-50);
  });

  it('liefert keine Sekunden mehr hinter dem Ziel des Ghosts', () => {
    expect(compareToGhost(ghost, { distance: 1200, movingTime: 90_000 }).seconds).toBeNull();
  });

  it('ignoriert Punkte ohne Distanzfortschritt', () => {
    const g = buildGhost([
      { distance: 0, movingTime: 0 },
      { distance: 10, movingTime: 1000 },
      { distance: 10, movingTime: 2000 },
      { distance: 20, movingTime: 3000 },
    ]);
    expect(g.distance).toEqual([0, 10, 20]);
  });
});

describe('averageGhost', () => {
  const at = (speed: number) =>
    buildGhost(Array.from({ length: 101 }, (_, i) => ({ distance: i * 10, movingTime: (i * 10 * 1000) / speed })));

  it('mittelt die Bewegungszeit an jeder Stelle', () => {
    const g = averageGhost([at(10), at(5)]);
    // 100 s und 200 s für 1 km: im Mittel 150 s
    expect(ghostTimeAt(g, 1000)).toBeCloseTo(150_000);
    expect(ghostTimeAt(g, 500)).toBeCloseTo(75_000);
  });

  it('liefert bei einer Fahrt genau diese', () => {
    const one = at(10);
    expect(averageGhost([one])).toBe(one);
  });

  it('endet an der kürzesten Fahrt', () => {
    const short = buildGhost([
      { distance: 0, movingTime: 0 },
      { distance: 500, movingTime: 50_000 },
    ]);
    expect(averageGhost([at(10), short]).distance.at(-1)).toBe(500);
  });
});
