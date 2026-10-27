<script lang="ts" module>
  export interface LatLon {
    lat: number;
    lon: number;
  }
</script>

<script lang="ts">
  import { bearingDeg, distanceM } from '@rechase/core';
  import type { GeoJSONSource, Map as MapLibre, Marker } from 'maplibre-gl';
  import type { Feature, LineString } from 'geojson';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { mapPrefs } from './prefs.svelte.ts';
  import { MAP_COLORS, loadStyle } from './style.ts';

  interface Props {
    /** Eigene Position (gefiltert) */
    position: LatLon | null;
    /** Eigene Spur dieser Fahrt */
    track: readonly LatLon[];
    /** Referenzstrecke des Duells, sobald es eine gibt */
    route?: readonly LatLon[];
    ghost?: LatLon | null;
    /** Kleine Karte ohne Bedienung, z. B. oben rechts in der Fahransicht */
    mini?: boolean;
    /** Karte hält die eigene Position in der Mitte; Verschieben schaltet das ab */
    following?: boolean;
  }

  let { position, track, route = [], ghost = null, mini = false, following = $bindable(true) }: Props = $props();

  const FOLLOW_ZOOM = 16;
  const MINI_ZOOM = 14.5;
  /** Erst ab dieser Strecke gilt eine neue Fahrtrichtung, sonst dreht GPS-Rauschen die Karte */
  const HEADING_MIN_M = 8;

  let container: HTMLDivElement;
  let map = $state.raw<MapLibre | null>(null);
  let ready = $state(false);
  let riderEl: HTMLDivElement;
  let ghostEl: HTMLDivElement;
  let rider: Marker | null = null;
  let ghostMarker: Marker | null = null;
  let arrowEl: HTMLSpanElement;
  /** Fahrtrichtung in Grad, null solange unbekannt */
  let heading: number | null = null;
  let headingFrom: LatLon | null = null;

  function updateHeading(p: LatLon) {
    if (!headingFrom) {
      // Karte neu geöffnet: Richtung aus dem Ende der bisherigen Spur, statt erst 8 m abzuwarten
      for (let i = track.length - 1; i >= 0; i--) {
        if (distanceM(track[i], p) >= HEADING_MIN_M) {
          heading = bearingDeg(track[i], p);
          break;
        }
      }
      headingFrom = p;
    } else if (distanceM(headingFrom, p) >= HEADING_MIN_M) {
      heading = bearingDeg(headingFrom, p);
      headingFrom = p;
    }
  }

  /** Pfeil am eigenen Punkt zeigt die Fahrtrichtung, egal wie die Karte gedreht ist */
  function updateArrow() {
    if (!map || !arrowEl) return;
    arrowEl.style.display = heading == null ? 'none' : '';
    arrowEl.style.transform = `rotate(${(heading ?? 0) - map.getBearing()}deg)`;
  }

  const line = (pts: readonly LatLon[]): Feature<LineString> => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: pts.map((p) => [p.lon, p.lat]) },
  });

  const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  onMount(() => {
    let disposed = false;
    let instance: MapLibre | null = null;

    void Promise.all([loadStyle(), import('./maplibre.ts')]).then(([style, ml]) => {
      if (disposed) return;
      instance = new ml.Map({
        container,
        style,
        center: position ? [position.lon, position.lat] : [10.45, 51.16],
        zoom: position ? (mini ? MINI_ZOOM : FOLLOW_ZOOM) : 5,
        interactive: !mini,
        attributionControl: false,
        // Norden bleibt oben: einfacher abzulesen und kein Neuzeichnen bei jeder Kurve
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
      });
      // Quellenangabe (OSM-Lizenz) unten links, rechts ist Platz für Bedienknöpfe
      if (!mini) instance.addControl(new ml.AttributionControl({ compact: true }), 'bottom-left');
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();

      // Nur echte Gesten des Nutzers beenden den Folgemodus, nicht unser eigenes easeTo.
      instance.on('dragstart', () => (following = false));
      instance.on('rotate', updateArrow);

      instance.on('load', () => {
        const m = instance!;
        const you = cssVar('--you');
        m.addSource('route', { type: 'geojson', data: line(route) });
        m.addSource('track', { type: 'geojson', data: line(track) });
        m.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': MAP_COLORS.road, 'line-width': 16 },
        });
        m.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#4a515c', 'line-width': 5 },
        });
        m.addLayer({
          id: 'track',
          type: 'line',
          source: 'track',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': you, 'line-width': mini ? 4 : 6 },
        });
        rider = new ml.Marker({ element: riderEl }).setLngLat([0, 0]);
        ghostMarker = new ml.Marker({ element: ghostEl }).setLngLat([0, 0]);
        ready = true;
      });

      map = instance;
    });

    return () => {
      disposed = true;
      rider?.remove();
      ghostMarker?.remove();
      instance?.remove();
    };
  });

  $effect(() => {
    if (!ready || !map) return;
    (map.getSource('track') as GeoJSONSource).setData(line(track));
  });

  $effect(() => {
    if (!ready || !map) return;
    (map.getSource('route') as GeoJSONSource).setData(line(route));
  });

  $effect(() => {
    if (!ready || !map || !ghostMarker) return;
    if (ghost) ghostMarker.setLngLat([ghost.lon, ghost.lat]).addTo(map);
    else ghostMarker.remove();
  });

  // Die Fahransicht tauscht Karte und Straße: dann wächst oder schrumpft die Karte, ohne neu zu laden.
  let wasMini: boolean | null = null;
  $effect(() => {
    const m = mini;
    if (!ready || !map) return;
    map.resize();
    if (wasMini != null && wasMini !== m) map.easeTo({ zoom: m ? MINI_ZOOM : FOLLOW_ZOOM, duration: 300 });
    wasMini = m;
  });

  let centered = false;
  $effect(() => {
    if (!ready || !map || !rider) return;
    if (!position) {
      rider.remove();
      return;
    }
    const center: [number, number] = [position.lon, position.lat];
    rider.setLngLat(center).addTo(map);
    updateHeading(position);
    const headingUp = mapPrefs.headingUp;
    updateArrow();
    if (!following && !mini) return;
    const bearing = headingUp && heading != null ? heading : 0;
    // Bei Fahrtrichtung oben sitzt man im unteren Drittel und sieht mehr von dem, was kommt
    const offset: [number, number] = [0, headingUp && !mini ? map.getContainer().clientHeight * 0.2 : 0];
    if (!centered) {
      // Erster Fix: direkt hinspringen statt quer über Deutschland zu fliegen
      map.jumpTo({ center, bearing, zoom: Math.max(map.getZoom(), mini ? MINI_ZOOM : FOLLOW_ZOOM) });
      centered = true;
    } else {
      map.easeTo({ center, bearing, offset, duration: 900, easing: (t) => t });
    }
  });
</script>

<div class="wrap" class:mini>
  <div class="map" bind:this={container}></div>
  {#if mini}
    <span class="attrib">© OpenFreeMap · © OSM</span>
  {/if}
  <!-- Werden von MapLibre als Marker in die Karte gehängt -->
  <div hidden>
    <div bind:this={riderEl} class="rider" aria-hidden="true">
      <span class="halo"></span>
      <span class="arrow" bind:this={arrowEl} style:display="none"><span></span></span>
      <span class="dot"></span>
      {#if !mini}<span class="tag">Du</span>{/if}
    </div>
    <div bind:this={ghostEl} class="ghost" aria-hidden="true">
      <span class="halo"></span>
      <span class="dot"></span>
      {#if !mini}<span class="tag">Bestzeit</span>{/if}
    </div>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    height: 100%;
    background: #12151a;
    overflow: hidden;
  }
  .map {
    position: absolute;
    inset: 0;
  }
  .attrib {
    position: absolute;
    left: 6px;
    bottom: 4px;
    font-size: 9px;
    color: var(--muted);
    pointer-events: none;
  }

  .rider,
  .ghost {
    position: relative;
    width: 0;
    height: 0;
  }
  .halo,
  .dot {
    position: absolute;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .rider .halo {
    width: 44px;
    height: 44px;
    background: color-mix(in srgb, var(--you) 18%, transparent);
  }
  .rider .dot {
    width: 22px;
    height: 22px;
    background: var(--you);
    border: 3px solid var(--bg);
  }
  .ghost .halo {
    width: 36px;
    height: 36px;
    background: color-mix(in srgb, var(--ghost) 12%, transparent);
  }
  .ghost .dot {
    width: 18px;
    height: 18px;
    background: color-mix(in srgb, var(--ghost) 35%, transparent);
    border: 2px dashed var(--ghost);
  }
  /* Spitze vor dem Punkt, dreht um dessen Mitte */
  .arrow {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
  }
  .arrow > span {
    position: absolute;
    left: -9px;
    top: -27px;
    border-left: 9px solid transparent;
    border-right: 9px solid transparent;
    border-bottom: 12px solid var(--you);
  }
  .mini .arrow > span {
    left: -6px;
    top: -17px;
    border-left-width: 6px;
    border-right-width: 6px;
    border-bottom-width: 8px;
  }
  .mini .rider .halo {
    width: 24px;
    height: 24px;
  }
  .mini .rider .dot {
    width: 12px;
    height: 12px;
    border-width: 2px;
  }
  .tag {
    position: absolute;
    top: 0;
    transform: translateY(-50%);
    padding: 3px 9px;
    border-radius: 8px;
    font-size: 12px;
    white-space: nowrap;
  }
  .rider .tag {
    right: 26px;
    background: var(--you);
    color: var(--bg);
    font-weight: 700;
  }
  .ghost .tag {
    left: 22px;
    padding: 3px 8px;
    border: 1.5px dashed var(--ghost);
    background: rgba(13, 15, 18, 0.78);
    color: var(--ghost);
    font-weight: 600;
  }

  /* Attribution passend zum dunklen Design, bleibt aber lesbar und anklickbar */
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
