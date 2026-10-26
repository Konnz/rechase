import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { MAP_COLORS, tintStyle } from '../src/lib/map/style.ts';

const style: StyleSpecification = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#000' } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park' },
    {
      id: 'road',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      paint: { 'line-color': '#000', 'line-width': 3 },
    },
    { id: 'label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', paint: { 'text-color': '#fff' } },
  ],
};

describe('tintStyle', () => {
  const out = tintStyle(style);
  const paint = (id: string) => out.layers.find((l) => l.id === id)!.paint as Record<string, unknown>;

  it('färbt Grund, Wasser, Grün und Straßen auf die App-Palette', () => {
    expect(paint('background')['background-color']).toBe(MAP_COLORS.background);
    expect(paint('water')['fill-color']).toBe(MAP_COLORS.water);
    expect(paint('park')['fill-color']).toBe(MAP_COLORS.green);
    expect(paint('road')['line-color']).toBe(MAP_COLORS.road);
  });

  it('lässt andere Eigenschaften, Beschriftungen und das Original unverändert', () => {
    expect(paint('road')['line-width']).toBe(3);
    expect(paint('label')['text-color']).toBe('#fff');
    expect((style.layers[0].paint as Record<string, unknown>)['background-color']).toBe('#000');
    expect(out.sources).toBe(style.sources);
  });
});
