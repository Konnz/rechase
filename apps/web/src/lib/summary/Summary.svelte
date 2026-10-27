<script lang="ts">
  import { rideStats, speedSegments } from '@rechase/core';
  import { onMount } from 'svelte';
  import type { StoredRide, StoredRoute } from '../db.ts';
  import { toGpx } from '../export.ts';
  import { fmtDate, fmtDuration, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import type { RideResult } from '../routes.ts';
  import { shareFile } from './share.ts';
  import { renderShareImage } from './shareImage.ts';
  import { SPEED_GRADIENT } from './speedColor.ts';
  import SummaryMap from './SummaryMap.svelte';

  let {
    ride,
    route = null,
    result = null,
    simulated = false,
    sectionPrs = 0,
    onsave,
    onclose,
  }: {
    ride: StoredRide;
    /** Strecke, zu der die Fahrt schon gehört */
    route?: StoredRoute | null;
    /** Duell-Ergebnis, falls die Fahrt auf einer Strecke gewertet wurde */
    result?: RideResult | { route: StoredRoute; incomplete: true } | null;
    simulated?: boolean;
    /** So viele Abschnitts-PRs gab es während der Fahrt */
    sectionPrs?: number;
    /** Merkt die Fahrt als Strecke; liefert die neue Strecke oder null bei Abbruch */
    onsave: (ride: StoredRide) => Promise<StoredRoute | null>;
    onclose: () => void;
  } = $props();

  /** Unter dieser Distanz lohnt keine Strecke */
  const MIN_ROUTE_M = 200;

  const stats = $derived(rideStats(ride.samples));
  const speed = $derived(speedSegments(ride.samples));
  let saved = $state.raw<StoredRoute | null>(null);
  const onRoute = $derived(saved ?? route);
  let busy = $state(false);
  let toast = $state<string | null>(null);
  // Vorab erzeugt, damit Teilen direkt im Klick passiert (Pflicht auf iOS)
  let image = $state.raw<File | null>(null);

  const stamp = $derived(new Date(ride.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-'));
  const gpx = $derived(new File([toGpx(ride)], `rechase-${stamp}.gpx`, { type: 'application/gpx+xml' }));
  const shareTitle = $derived(`re:chase · ${fmtKm(stats.distance)} km in ${fmtDuration(stats.movingTime)}`);

  onMount(() => {
    void renderShareImage({ startedAt: ride.startedAt, title: onRoute?.name, stats, segments: speed.segments }).then(
      (blob) => {
        if (blob) image = new File([blob], `rechase-${stamp}.png`, { type: 'image/png' });
      },
    );
  });

  function say(msg: string) {
    toast = msg;
    setTimeout(() => toast === msg && (toast = null), 2500);
  }

  async function save() {
    busy = true;
    try {
      const r = await onsave(ride);
      if (r) {
        saved = r;
        say(`Als „${r.name}“ gespeichert · ab jetzt dein Ghost`);
      }
    } finally {
      busy = false;
    }
  }

  async function share(file: File | null) {
    if (!file) return;
    const how = await shareFile(file, shareTitle);
    if (how === 'downloaded') say(`${file.name} heruntergeladen`);
  }
</script>

<div class="screen">
  <header>
    <button class="icon" aria-label="Schließen" onclick={onclose}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </button>
    <div class="title">
      <span class="name">{onRoute?.name ?? 'Fahrt beendet'}</span>
      <span class="sub">{fmtDate(ride.startedAt)}{simulated ? ' · Simulation, nicht gespeichert' : ''}</span>
    </div>
  </header>

  <div class="scroll">
    <div class="mapbox">
      {#if speed.segments.length}
        <SummaryMap segments={speed.segments} />
        <div class="legend">
          <span>{fmtKmh(speed.min)}</span>
          <span class="bar" style:background={SPEED_GRADIENT}></span>
          <span>{fmtKmh(speed.max)} <small>km/h</small></span>
        </div>
      {:else}
        <span class="empty">Keine Strecke aufgezeichnet</span>
      {/if}
    </div>

    {#if result}
      <section class="result" aria-live="polite">
        {#if 'incomplete' in result}
          <span class="label">{result.route.name}</span>
          <span class="headline">Strecke nicht zu Ende gefahren</span>
          <span class="what">Gewertet wird nur, wer vom Start bis ins Ziel fährt.</span>
        {:else}
          {@const delta = (result.time - result.previousBest) / 1000}
          <span class="label">{result.route.name}</span>
          <span class="headline" class:win={delta < 0}>{delta < 0 ? 'Bestzeit geschlagen' : 'Bestzeit hält'}</span>
          <span class="what">
            {fmtDuration(result.time)} bewegt · {delta < 0 ? '−' : '+'}{fmtGapSeconds(delta)} gegenüber {fmtDuration(
              result.previousBest,
            )}{result.newBest ? ' · ist jetzt dein Ghost' : ''}
          </span>
        {/if}
        {#if sectionPrs}
          <span class="what prs">
            {sectionPrs} {sectionPrs === 1 ? 'Abschnitts-PR' : 'Abschnitts-PRs'} · +{sectionPrs * 20} Punkte
          </span>
        {/if}
      </section>
    {/if}

    <section class="grid">
      <div class="tile">
        <span class="label">Distanz</span>
        <span class="val">{fmtKm(stats.distance)} <small>km</small></span>
      </div>
      <div class="tile">
        <span class="label">Fahrzeit</span>
        <span class="val you">{fmtDuration(stats.movingTime)}</span>
        <span class="hint">netto, ohne Stopps</span>
      </div>
      <div class="tile">
        <span class="label">Gesamtzeit</span>
        <span class="val">{fmtDuration(stats.elapsed)}</span>
        <span class="hint">
          {stats.stops}
          {stats.stops === 1 ? 'Stopp' : 'Stopps'} · {fmtDuration(stats.pausedTime)} Pause
        </span>
      </div>
      <div class="tile">
        <span class="label">Ø Tempo</span>
        <span class="val">{fmtKmh(stats.avgSpeed)} <small>km/h</small></span>
      </div>
      <div class="tile">
        <span class="label">Top Speed</span>
        <span class="val">{fmtKmh(stats.topSpeed)} <small>km/h</small></span>
      </div>
      <div class="tile">
        <span class="label">Höhenmeter</span>
        <span class="val">{fmtInt(stats.ascent)} <small>m</small></span>
        <span class="hint">
          {#if stats.ascent == null}
            keine Höhendaten
          {:else}
            ↓ {fmtInt(stats.descent)} m · {fmtInt(stats.minAlt)}–{fmtInt(stats.maxAlt)} m
          {/if}
        </span>
      </div>
    </section>

    <section class="actions">
      {#if onRoute}
        <div class="saved">
          <span class="label">Strecke</span>
          <span>{onRoute.name}</span>
        </div>
      {:else if !simulated}
        <button
          class="cta"
          disabled={busy || !ride.endedAt || stats.distance < MIN_ROUTE_M}
          onclick={save}
        >
          Strecke speichern
        </button>
        {#if stats.distance < MIN_ROUTE_M}
          <span class="note">Zu kurz für eine Strecke</span>
        {:else}
          <span class="note">Beim nächsten Mal fährst du gegen diese Fahrt als Ghost.</span>
        {/if}
      {/if}
      <div class="row">
        <button class="secondary" disabled={!image} onclick={() => share(image)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"></path></svg>
          Bild teilen
        </button>
        <button class="secondary" onclick={() => share(gpx)}>GPX teilen</button>
      </div>
      <button class="done" onclick={onclose}>Fertig</button>
    </section>
  </div>

  {#if toast}
    <p class="toast" role="status">{toast}</p>
  {/if}
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
    z-index: 10;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: max(20px, env(safe-area-inset-top)) 20px 8px;
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
  }
  .sub,
  .note,
  .hint {
    font-size: 13px;
    color: var(--muted);
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
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px max(24px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mapbox {
    position: relative;
    height: 42vh;
    min-height: 240px;
    flex-shrink: 0;
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .empty {
    color: var(--muted);
  }
  .legend {
    position: absolute;
    right: 10px;
    top: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 10px;
    background: rgba(13, 15, 18, 0.82);
    font-family: var(--font-num);
    font-size: 15px;
    font-weight: 600;
  }
  .legend small {
    font-size: 12px;
  }
  .bar {
    width: 72px;
    height: 6px;
    border-radius: 3px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  small {
    font-family: var(--font-text);
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    background: var(--surface);
    border-radius: 16px;
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .val {
    font-family: var(--font-num);
    font-size: 38px;
    font-weight: 600;
    line-height: 1;
  }
  .val.you {
    color: var(--you);
  }
  .result {
    background: var(--surface-2);
    border-radius: 16px;
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .headline {
    font-family: var(--font-num);
    font-size: 32px;
    font-weight: 700;
    line-height: 1.05;
    color: var(--ghost);
  }
  .headline.win {
    color: var(--you);
  }
  .what {
    font-size: 13px;
    color: var(--muted);
  }
  .prs {
    color: var(--you);
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  .note {
    text-align: center;
  }
  .saved {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 14px;
    border-radius: 14px;
    border: 1.5px dashed var(--ghost);
    font-weight: 600;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cta {
    height: 56px;
    border: 0;
    border-radius: 14px;
    background: var(--you);
    color: var(--bg);
    font-size: 17px;
    font-weight: 700;
  }
  .secondary {
    height: 52px;
    border: 0;
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .done {
    height: 52px;
    border: 1.5px solid var(--line);
    border-radius: 14px;
    background: none;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }
  .toast {
    position: absolute;
    left: 50%;
    bottom: max(24px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    margin: 0;
    padding: 10px 16px;
    border-radius: 12px;
    background: #1f2329;
    color: var(--text);
    font-size: 14px;
    white-space: nowrap;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  }
</style>
