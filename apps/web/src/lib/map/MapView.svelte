<script lang="ts">
  import { fmtDuration, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import type { RideRecorder } from '../tracker.svelte.ts';
  import LiveMap, { type LatLon } from './LiveMap.svelte';

  let {
    rec,
    onclose,
    position,
    title = 'Aktuelle Fahrt',
    route = [],
    ghost = null,
  }: {
    rec: RideRecorder;
    onclose: () => void;
    /** Was die Karte als eigene Position zeigt; ohne Angabe die aktuelle Aufnahme */
    position?: LatLon | null;
    title?: string;
    route?: readonly LatLon[];
    ghost?: LatLon | null;
  } = $props();

  let following = $state(true);
  const cur = $derived(rec.current);
  const active = $derived(rec.status === 'starting' || rec.status === 'recording');
</script>

<div class="screen">
  <header>
    <button class="icon" aria-label="Zurück zur Fahrt" onclick={onclose}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"></path></svg>
    </button>
    <div class="title">
      <span class="name">{title}</span>
      <span class="sub">Karte · {following ? 'folgt dir' : 'frei verschoben'}</span>
    </div>
    <span class="dot" class:on={active} aria-hidden="true"></span>
  </header>

  <div class="mapbox">
    <LiveMap position={position ?? cur} track={rec.track} {route} {ghost} bind:following />

    <div class="chip">
      <span class="label">Strecke</span>
      <span class="num">{fmtKm(cur?.distance ?? 0)} <small>km</small></span>
    </div>

    {#if !following}
      <button class="icon recenter" aria-label="Karte auf mich zentrieren" onclick={() => (following = true)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>
      </button>
    {/if}
  </div>

  <section class="sheet">
    <span class="grip" aria-hidden="true"></span>
    <span class="pause" class:paused={cur && !cur.moving}>
      {#if !cur}
        {active ? 'Warte auf GPS …' : 'Keine Aufnahme aktiv'}
      {:else if cur.moving}
        In Bewegung
      {:else}
        Pausiert · Zeit steht
      {/if}
    </span>
    <div class="tiles">
      <div class="tile">
        <span class="label">Tempo</span>
        <span class="num">{fmtKmh(cur?.speed)}</span>
      </div>
      <div class="tile">
        <span class="label">Fahrzeit</span>
        <span class="num">{fmtDuration(cur?.movingTime ?? 0)}</span>
      </div>
      <div class="tile">
        <span class="label">Höhe</span>
        <span class="num">{fmtInt(rec.lastRaw?.alt)} <small>m</small></span>
      </div>
    </div>
    <button class="cta" onclick={onclose}>Zurück zur Fahrt</button>
  </section>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    max-width: 480px;
    margin: 0 auto;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: max(20px, env(safe-area-inset-top)) 20px 8px;
  }
  .icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 0;
    padding: 0;
    background: #1a1d23;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-grow: 1;
    min-width: 0;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
    line-height: 1.2;
  }
  .sub {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.2;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--line);
    flex-shrink: 0;
  }
  .dot.on {
    background: var(--rec);
  }
  .mapbox {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
  }
  /* Das Blatt unten ragt 20px in die Karte */
  .mapbox :global(.maplibregl-ctrl-bottom-left) {
    bottom: 20px;
  }
  .chip {
    position: absolute;
    left: 14px;
    top: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(13, 15, 18, 0.82);
  }
  .recenter {
    position: absolute;
    right: 14px;
    bottom: 34px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .num {
    font-family: var(--font-num);
    font-size: 22px;
    font-weight: 600;
    line-height: 1;
  }
  small {
    font-size: 14px;
    color: var(--muted);
  }
  .sheet {
    margin-top: -20px;
    position: relative;
    z-index: 1;
    border-radius: 24px 24px 0 0;
    background: var(--surface);
    padding: 10px 16px max(20px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .grip {
    align-self: center;
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: #3a404a;
  }
  .pause {
    padding: 0 4px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pause.paused {
    color: var(--ghost);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    background: #0f1216;
    border-radius: 14px;
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tile .num {
    font-size: 28px;
  }
  .cta {
    height: 52px;
    border: 0;
    border-radius: 14px;
    background: var(--you);
    color: var(--bg);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
