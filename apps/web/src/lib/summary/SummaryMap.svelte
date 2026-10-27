<script lang="ts">
  import type { SpeedProfile } from '@rechase/core';
  import type { Feature, LineString } from 'geojson';
  import type { ExpressionSpecification, Map as MapLibre, Marker } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { MAP_COLORS, loadStyle } from '../map/style.ts';
  import { speedColor } from './speedColor.ts';

  /** Gesamtstrecke einer Fahrt, eingefärbt nach Tempo; zeigt die ganze Runde auf einmal. */
  let { profile }: { profile: SpeedProfile } = $props();

  let container: HTMLDivElement;
  let startEl: HTMLDivElement;
  let endEl: HTMLDivElement;

  /** Mindestabstand zweier Farbstopps als Streckenanteil: hält den Ausdruck klein, ohne sichtbare Stufen */
  const STOP_STEP = 0.002;

  const data = (): Feature<LineString> => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: profile.coords },
  });

  /** Farbverlauf entlang der Linie; MapLibre verlangt streng steigende Stopps */
  function gradient(): ExpressionSpecification {
    const stops: (number | string)[] = [];
    let last = -1;
    profile.progress.forEach((at, i) => {
      const end = i === profile.progress.length - 1;
      if (at - last < STOP_STEP && !(end && at > last)) return;
      stops.push(at, speedColor(profile.levels[i]!));
      last = at;
    });
    if (stops.length < 4) stops.splice(0, stops.length, 0, speedColor(profile.levels[0] ?? 0), 1, speedColor(profile.levels[0] ?? 0));
    return ['interpolate', ['linear'], ['line-progress'], ...stops] as ExpressionSpecification;
  }

  onMount(() => {
    let disposed = false;
    let map: MapLibre | null = null;
    const markers: Marker[] = [];
    const pts = profile.coords;

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
        m.addSource('ride', { type: 'geojson', data: data(), lineMetrics: true });
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
          paint: { 'line-gradient': gradient(), 'line-width': 6 },
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
