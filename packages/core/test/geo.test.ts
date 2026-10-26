import { describe, expect, it } from 'vitest';
import { distanceM } from '../src/geo.ts';

describe('distanceM', () => {
  it('misst einen Breitengrad mit ca. 111 km', () => {
    expect(distanceM({ lat: 48, lon: 11 }, { lat: 49, lon: 11 })).toBeCloseTo(111_195, -1);
  });

  it('ist null für denselben Punkt', () => {
    expect(distanceM({ lat: 48.1, lon: 11.5 }, { lat: 48.1, lon: 11.5 })).toBe(0);
  });
});
