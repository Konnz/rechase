import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Geoid } from '../src/geoid.ts';

const geoid = new Geoid(readFileSync(new URL('../data/egm96-1deg.bin', import.meta.url)));

describe('Geoid', () => {
  it('liefert die EGM96-Geoidhöhe', () => {
    // Referenzwerte aus dem vollen EGM96-Modell (egm96-universal): Langenfeld 46,6 m, München 45,5 m
    expect(geoid.undulation(51.106, 6.952)).toBeCloseTo(46.6, 0);
    expect(geoid.undulation(48.137, 11.575)).toBeCloseTo(45.5, 0);
    // Indischer Ozean: tiefste Stelle des Geoids
    expect(geoid.undulation(5, 78)).toBeLessThan(-95);
  });

  it('rechnet über die Datumsgrenze und an den Polen', () => {
    expect(geoid.undulation(10, 179.9)).toBeCloseTo(geoid.undulation(10, -180.1), 5);
    expect(Number.isFinite(geoid.undulation(90, 0))).toBe(true);
    expect(Number.isFinite(geoid.undulation(-90, 0))).toBe(true);
  });

  it('macht aus der Höhe der Probefahrt die Höhe über dem Meeresspiegel', () => {
    // Start in Langenfeld: GPS 96,7 m über dem Ellipsoid, das Gelände liegt bei rund 50 m ü. NN
    expect(geoid.toMsl(51.1063916, 6.9519161, 96.7)).toBeCloseTo(50.1, 0);
  });

  it('lehnt ein falsches Raster ab', () => {
    expect(() => new Geoid(new ArrayBuffer(10))).toThrow();
  });
});
