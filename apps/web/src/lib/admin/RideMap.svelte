<script lang="ts">
  import type { MotionSample } from '@rechase/core';
  import type { FeatureCollection } from 'geojson';
  import type { Map as MapLibre, Marker } from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { fmtDuration } from '../format.ts';
  import { MAP_COLORS, loadStyle } from '../map/style.ts';
  import type { RideAnalysis } from './analysis.ts';

  /**
   * Eine Fahrt für die Fehlersuche: Spur in Bewegung, Pausen mit Dauer, Empfangslücken als rote Strichlinie,
   * verworfene Rohpunkte grau. hover markiert die Stelle, über der die Maus in den Diagrammen steht.
   */
  let {
    samples,
    analysis,
    hover = null,
  }: { samples: readonly MotionSample[]; analysis: RideAnalysis; hover?: MotionSample | null } = $props();

  /** Ab dieser Dauer steht die Pause als Schild auf der Karte */
  const LABEL_PAUSE_MS = 30_000;

  let container: HTMLDivElement;
  let map: MapLibre | null = null;
  let hoverMarker: Marker | null = null;
  let ready = $state(false);

  const fc = (features: FeatureCollection['features']): FeatureCollection => ({ type: 'FeatureCollection', features });

  function pin(cls: string, text = '', title = '') {
    const el = document.createElement('div');
    el.className = `pin ${cls}`;
    el.textContent = text;
    if (title) el.title = title;
    return el;
  }

  onMount(() => {
    let disposed = false;
    const markers: Marker[] = [];
    const all = samples.map((s) => [s.lon, s.lat] as [number, number]);

    void Promise.all([loadStyle(), import('../map/maplibre.ts')]).then(([style, ml]) => {
      if (disposed || !all.length) return;
      const bounds = all.reduce((b, p) => b.extend(p), new ml.LngLatBounds(all[0], all[0]));
      const m = new ml.Map({
        container,
        style,
        bounds,
        fitBoundsOptions: { padding: 40, maxZoom: 17 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
      });
      map = m;
      m.addControl(new ml.AttributionControl({ compact: true }), 'bottom-left');
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => {
        const a = analysis;
        m.addSource('all', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: all } } });
        m.addSource('moving', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: a.moving } },
        });
        m.addSource('gaps', {
          type: 'geojson',
          data: fc(
            a.gaps.map((g) => ({
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [[g.from.lon, g.from.lat], [g.to.lon, g.to.lat]] },
            })),
          ),
        });
        m.addSource('rejected', {
          type: 'geojson',
          data: fc(a.rejected.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } }))),
        });
        // Alle angenommenen Punkte als dünne Linie darunter: zeigt, wo im Stand Drift war
        m.addLayer({ id: 'all', type: 'line', source: 'all', paint: { 'line-color': '#5b6370', 'line-width': 2 } });
        m.addLayer({
          id: 'moving-casing',
          type: 'line',
          source: 'moving',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': MAP_COLORS.background, 'line-width': 8 },
        });
        m.addLayer({
          id: 'moving',
          type: 'line',
          source: 'moving',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ff7a1a', 'line-width': 4 },
        });
        m.addLayer({
          id: 'gaps',
          type: 'line',
          source: 'gaps',
          paint: { 'line-color': '#ff453a', 'line-width': 3, 'line-dasharray': [1.5, 1.5] },
        });
        m.addLayer({
          id: 'rejected',
          type: 'circle',
          source: 'rejected',
          paint: { 'circle-radius': 3, 'circle-color': '#9aa3af', 'circle-opacity': 0.7 },
        });
        for (const p of a.pauses) {
          const d = fmtDuration(p.to - p.from);
          // Kurze Halte nur als Punkt, sonst überdecken sich die Schilder an jeder Ampel
          const long = p.to - p.from >= LABEL_PAUSE_MS;
          const el = pin(long ? 'pause' : 'pause short', long ? d : '', `Pause ${d}`);
          markers.push(new ml.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(m));
        }
        markers.push(new ml.Marker({ element: pin('start', '', 'Start') }).setLngLat(all[0]!).addTo(m));
        markers.push(new ml.Marker({ element: pin('end', '', 'Ende') }).setLngLat(all.at(-1)!).addTo(m));
        hoverMarker = new ml.Marker({ element: pin('hover') });
        ready = true;
      });
    });

    return () => {
      disposed = true;
      markers.forEach((mk) => mk.remove());
      hoverMarker?.remove();
      map?.remove();
    };
  });

  $effect(() => {
    if (!ready || !map || !hoverMarker) return;
    if (hover) hoverMarker.setLngLat([hover.lon, hover.lat]).addTo(map);
    else hoverMarker.remove();
  });
</script>

<div class="wrap">
  <div class="map" bind:this={container}></div>
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 360px;
    background: #12151a;
    border-radius: 14px;
    overflow: hidden;
  }
  .map {
    position: absolute;
    inset: 0;
  }
  .wrap :global(.pin) {
    border-radius: 999px;
    border: 3px solid var(--bg);
  }
  .wrap :global(.pin.start) {
    width: 16px;
    height: 16px;
    background: var(--text);
  }
  .wrap :global(.pin.end) {
    width: 16px;
    height: 16px;
    background: var(--you);
  }
  .wrap :global(.pin.pause) {
    padding: 1px 6px;
    border-width: 2px;
    background: var(--ghost);
    color: var(--bg);
    font-size: 11px;
    font-weight: 700;
    cursor: default;
  }
  .wrap :global(.pin.pause.short) {
    width: 12px;
    height: 12px;
    padding: 0;
  }
  .wrap :global(.pin.hover) {
    width: 14px;
    height: 14px;
    background: var(--text);
    box-shadow: 0 0 0 4px rgba(242, 244, 247, 0.3);
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
