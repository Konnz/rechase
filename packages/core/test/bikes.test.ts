import { describe, expect, it } from 'vitest';
import { bikeClass, isBikeType, normalizeChaserName, sameBikeClass } from '../src/bikes.ts';

describe('Radklassen', () => {
  it('ordnet Typen ihrer Wertung zu', () => {
    expect(bikeClass('road')).toBe('muscle');
    expect(bikeClass('gravel')).toBe('muscle');
    expect(bikeClass('ebike')).toBe('ebike');
    expect(bikeClass('speed-pedelec')).toBe('speed-pedelec');
  });

  it('wertet Rennrad und Gravel gemeinsam, E-Bike getrennt', () => {
    expect(sameBikeClass('road', 'gravel')).toBe(true);
    expect(sameBikeClass('road', 'ebike')).toBe(false);
    expect(sameBikeClass('ebike', 'speed-pedelec')).toBe(false);
  });

  it('erkennt gültige Radtypen', () => {
    expect(isBikeType('mtb')).toBe(true);
    expect(isBikeType('motorrad')).toBe(false);
    expect(isBikeType(undefined)).toBe(false);
  });
});

describe('Chaser-Name', () => {
  it('bereinigt Leerzeichen', () => {
    expect(normalizeChaserName('  Isar   Jäger ')).toEqual({ name: 'Isar Jäger' });
  });

  it('lehnt zu kurze, zu lange und seltsame Namen ab', () => {
    expect(normalizeChaserName('ab')).toHaveProperty('error');
    expect(normalizeChaserName('x'.repeat(25))).toHaveProperty('error');
    expect(normalizeChaserName('<script>')).toHaveProperty('error');
    expect(normalizeChaserName('-abc')).toHaveProperty('error');
  });
});
