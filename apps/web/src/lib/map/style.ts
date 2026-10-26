import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/** Kartenstil von OpenFreeMap (OSM-Daten, ohne Tracking, ohne API-Key). */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** Farben aus dem Mockup „Karte im Folgemodus“: die Karte bleibt im Hintergrund, Fahrer und Ghost stechen heraus. */
export const MAP_COLORS = {
  background: '#12151a',
  water: '#1a2735',
  green: '#15201a',
  building: '#171a1f',
  road: '#262b33',
};

/** Ohne Netz und ohne Cache: nur der dunkle Grund, damit Spur und Position trotzdem erscheinen. */
export const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': MAP_COLORS.background } }],
};

const GREEN = new Set(['park', 'landcover', 'landuse']);

function tintLayer(layer: LayerSpecification): LayerSpecification {
  const src = 'source-layer' in layer ? layer['source-layer'] : undefined;
  const paint = { ...(layer.paint ?? {}) } as Record<string, unknown>;
  if (layer.type === 'background') paint['background-color'] = MAP_COLORS.background;
  else if (layer.type === 'fill' && src === 'water') paint['fill-color'] = MAP_COLORS.water;
  else if (layer.type === 'line' && (src === 'water' || src === 'waterway')) paint['line-color'] = MAP_COLORS.water;
  else if (layer.type === 'fill' && src && GREEN.has(src)) paint['fill-color'] = MAP_COLORS.green;
  else if (layer.type === 'fill' && src === 'building') paint['fill-color'] = MAP_COLORS.building;
  else if (layer.type === 'line' && src === 'transportation') paint['line-color'] = MAP_COLORS.road;
  else return layer;
  return { ...layer, paint } as LayerSpecification;
}

/** Färbt Grund, Wasser, Grün, Gebäude und Straßen auf die App-Palette um; Beschriftungen bleiben wie sie sind. */
export function tintStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map(tintLayer) };
}

export async function loadStyle(url = STYLE_URL): Promise<StyleSpecification> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return tintStyle((await res.json()) as StyleSpecification);
  } catch (e) {
    console.warn('Kartenstil nicht erreichbar, zeige nur die Spur', e);
    return FALLBACK_STYLE;
  }
}
