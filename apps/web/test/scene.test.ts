import { buildRoute } from '@rechase/core';
import { describe, expect, it } from 'vitest';
import { HORIZON_Y, YOU_FEET_Y, buildRoad, place, routePath, straightPath } from '../src/lib/ride/scene.ts';

const M_PER_DEG = 111_195;
const k = Math.cos((48.1 * Math.PI) / 180);
/** 300 m nach Norden, dann 300 m nach Osten */
const corner = buildRoute([
  ...Array.from({ length: 61 }, (_, i) => ({ lat: 48.1 + (i * 5) / M_PER_DEG, lon: 11.5 })),
  ...Array.from({ length: 60 }, (_, i) => ({ lat: 48.1 + 300 / M_PER_DEG, lon: 11.5 + ((i + 1) * 5) / (M_PER_DEG * k) })),
]);

describe('Fahransicht', () => {
  it('stellt dich auf deinen Fußpunkt', () => {
    const p = place(straightPath, 0);
    expect(p.y).toBeCloseTo(YOU_FEET_Y);
    expect(p.scale).toBeCloseTo(1);
  });

  it('trifft den Ghost bei 38 m Abstand wie im Mockup', () => {
    const p = place(straightPath, 38);
    expect(p.y).toBeCloseTo(142, -1);
    expect(p.scale * 90).toBeCloseTo(41.5, 0);
  });

  it('lässt weit entfernte Ghosts zum Horizont schrumpfen und versteckt weit hinter dir', () => {
    expect(place(straightPath, 5000).y - HORIZON_Y).toBeLessThan(2);
    expect(place(straightPath, -50).hidden).toBe(true);
    expect(place(straightPath, -20).hidden).toBe(false);
  });

  it('richtet die Straße an der Fahrtrichtung aus und biegt sie vor einer Rechtskurve nach rechts', () => {
    const path = routePath(corner, 100);
    // Hier geht es geradeaus nach vorn
    expect(path(50).x).toBeCloseTo(0, 0);
    expect(path(50).z).toBeCloseTo(50, 0);
    // 100 m nach der Ecke liegt die Straße deutlich rechts
    expect(path(300).x).toBeGreaterThan(80);
    // Ein Ghost hinter der Kurve steht rechts von dir im Bild
    expect(place(path, 260).x).toBeGreaterThan(place(path, 0).x);
  });

  it('hebt die Straße bei einem Anstieg an', () => {
    const profile = { distance: [0, 600], alt: [500, 530] };
    const path = routePath(corner, 100, profile);
    // 5 m echter Anstieg, abgeschwächt dargestellt
    expect(path(100).h).toBeCloseTo(1.75, 0);
    expect(place(path, 100).y).toBeLessThan(place(straightPath, 100).y);
  });

  it('zeichnet die Straße von hinten nach vorn', () => {
    const segs = buildRoad(straightPath);
    expect(segs.length).toBeGreaterThan(50);
    expect(segs[0].road[0][1]).toBeLessThan(segs.at(-1)!.road[0][1]);
    expect(segs.some((s) => s.dash)).toBe(true);
  });
});
