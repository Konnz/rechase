import { describe, expect, it } from 'vitest';
import { HORIZON_Y, YOU_FEET_Y, YOU_H, place } from '../src/lib/duel/perspective.ts';

describe('Rennspiel-Perspektive', () => {
  it('stellt dich auf deinen Fußpunkt', () => {
    const p = place(0);
    expect(p.y).toBeCloseTo(YOU_FEET_Y);
    expect(p.h).toBeCloseTo(YOU_H);
    expect(p.x).toBeGreaterThan(183);
  });

  it('trifft den Ghost bei 38 m Abstand wie im Mockup', () => {
    const p = place(38);
    expect(p.y).toBeCloseTo(142, -1);
    expect(p.h).toBeCloseTo(41.5, 0);
  });

  it('lässt weit entfernte Ghosts zum Horizont schrumpfen', () => {
    const p = place(5000);
    expect(p.y - HORIZON_Y).toBeLessThan(2);
    expect(p.hidden).toBe(false);
  });

  it('versteckt einen Ghost, der weit hinter dir ist', () => {
    expect(place(-50).hidden).toBe(true);
    expect(place(-20).hidden).toBe(false);
  });
});
