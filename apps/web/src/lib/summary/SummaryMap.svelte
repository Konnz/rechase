<script lang="ts">
  import type { SpeedSegment } from '@rechase/core';
  import type { FeatureCollection, LineString } from 'geojson';
  import type { Map as MapLibre, Marker } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { MAP_COLORS, loadStyle } from '../map/style.ts';
  import { speedColor } from './speedColor.ts';

  /** Gesamtstrecke einer Fahrt, eingefärbt nach Tempo; zeigt die ganze Runde auf einmal. */
  let { segments }: { segments: SpeedSegment[] } = $props();

  let container: HTMLDivElement;
  let startEl: HTMLDivElement;
  let endEl: HTMLDivElement;

  const data = (): FeatureCollection<LineString> => ({
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature',
      properties: { color: speedColor(s.level) },
      geometry: { type: 'LineString', coordinates: s.coords },
    })),
  });

  onMount(() => {
    let disposed = false;
    let map: MapLibre | null = null;
    const markers: Marker[] = [];
    const pts = segments.flatMap((s) => s.coords);

    void Promise.all([loadStyle(), import('../map/maplibre.ts')]).then(([style, ml]) => {
      if (disposed) return;
      const bounds = pts.reduce((b, p) => b.extend(p), new ml.LngLatBounds(pts[0] ?? [10.45, 51.16], pts[0] ?? [10.45, 51.16]));
      map = new ml.Map({
        container,
        style,
        bounds,
        fitBoundsOptions: { padding: 36, maxZoom: 16 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
      });
      map.addControl(new ml.AttributionControl({ compact: true }), 'bottom-left');
      map.touchZoomRotate.disableRotation();
      map.on('load', () => {
        const m = map!;
        m.addSource('ride', { type: 'geojson', data: data() });
        m.addLayer({
          id: 'ride-casing',
          type: 'line',
          source: 'ride',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': MAP_COLORS.background, 'line-width': 11 },
        });
        m.addLayer({
          id: 'ride',
          type: 'line',
          source: 'ride',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
        });
        if (pts.length) {
          markers.push(new ml.Marker({ element: startEl }).setLngLat(pts[0]!).addTo(m));
          markers.push(new ml.Marker({ element: endEl }).setLngLat(pts.at(-1)!).addTo(m));
        }
      });
    });

    return () => {
      disposed = true;
      markers.forEach((mk) => mk.remove());
      map?.remove();
    };
  });
</script>

<div class="wrap">
  <div class="map" bind:this={container}></div>
  <div hidden>
    <div bind:this={startEl} class="pin start" aria-hidden="true"></div>
    <div bind:this={endEl} class="pin end" aria-hidden="true"></div>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    height: 100%;
    background: #12151a;
  }
  .map {
    position: absolute;
    inset: 0;
  }
  .pin {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid var(--bg);
  }
  .start {
    background: var(--text);
  }
  .end {
    background: var(--you);
  }
  .wrap :global(.maplibregl-ctrl-attrib) {
    background: rgba(13, 15, 18, 0.78);
    color: var(--muted);
    font-size: 11px;
  }
  .wrap :global(.maplibregl-ctrl-attrib a) {
    color: var(--text);
  }
  .wrap :global(.maplibregl-ctrl-attrib-button) {
    filter: invert(1);
  }
</style>
