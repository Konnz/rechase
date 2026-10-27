import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceM } from '../src/geo.ts';

describe('distanceM', () => {
  it('misst einen Breitengrad mit ca. 111 km', () => {
    expect(distanceM({ lat: 48, lon: 11 }, { lat: 49, lon: 11 })).toBeCloseTo(111_195, -1);
  });

  it('ist null für denselben Punkt', () => {
    expect(distanceM({ lat: 48.1, lon: 11.5 }, { lat: 48.1, lon: 11.5 })).toBe(0);
  });
});

describe('bearingDeg', () => {
  it('gibt die Himmelsrichtung in Grad', () => {
    expect(bearingDeg({ lat: 48, lon: 11 }, { lat: 48.01, lon: 11 })).toBeCloseTo(0, 1);
    expect(bearingDeg({ lat: 48, lon: 11 }, { lat: 48, lon: 11.01 })).toBeCloseTo(90, 0);
    expect(bearingDeg({ lat: 48, lon: 11 }, { lat: 47.99, lon: 11 })).toBeCloseTo(180, 1);
    expect(bearingDeg({ lat: 48, lon: 11 }, { lat: 48, lon: 10.99 })).toBeCloseTo(270, 0);
  });
});
