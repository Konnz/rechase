<script lang="ts">
  import { onMount } from 'svelte';
  import {
    deleteRide,
    deleteRoute,
    listRides,
    listRoutes,
    requestPersistence,
    type StoredRide,
    type StoredRoute,
  } from './lib/db.ts';
  import { Duel } from './lib/duel.svelte.ts';
  import DuelView from './lib/duel/DuelView.svelte';
  import { download, toCsv, toGpx } from './lib/export.ts';
  import { fmtDate, fmtDay, fmtDuration, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from './lib/format.ts';
  import LiveMap from './lib/map/LiveMap.svelte';
  import MapView from './lib/map/MapView.svelte';
  import { createRoute, evaluateRide, loadGhost, type RideResult } from './lib/routes.ts';
  import { replaySource } from './lib/sim.ts';
  import { PositionPreview } from './lib/preview.svelte.ts';
  import { RideRecorder } from './lib/tracker.svelte.ts';

  const rec = new RideRecorder();
  // raw: IndexedDB kann keine $state-Proxys speichern
  let rides = $state.raw<StoredRide[]>([]);
  let routes = $state.raw<StoredRoute[]>([]);
  let showMap = $state(false);
  /** Ergebnis der letzten Fahrt auf einer Strecke */
  let result = $state.raw<RideResult | { route: StoredRoute; incomplete: true } | null>(null);
  let notice = $state<string | null>(null);

  const active = $derived(rec.status === 'starting' || rec.status === 'recording');
  const cur = $derived(rec.current);
  const preview = new PositionPreview();
  // Vor dem Start zeigt die Karte den Standort aus der Vorschau, während der Aufnahme den gefilterten
  const mapPos = $derived(active ? (cur ?? rec.lastRaw) : (preview.position ?? cur));
  $effect(() => {
    preview.active = !active;
  });
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);

  const duel = $derived(rec.duel);
  const bestOf = $derived(new Map(routes.map((r) => [r.bestRideId, r])));
  const routeById = $derived(new Map(routes.map((r) => [r.id, r])));

  async function refresh() {
    [rides, routes] = await Promise.all([listRides().catch(() => []), listRoutes().catch(() => [])]);
  }

  async function stop() {
    const d = rec.duel;
    const ride = await rec.stop();
    showMap = false;
    result = null;
    if (ride && !rec.simulated) {
      const r = await evaluateRide(ride, routes);
      result = r ?? (d ? { route: d.stored, incomplete: true } : null);
    } else if (d && d.phase === 'finished') {
      // Simulation: Ergebnis zeigen, aber nichts speichern
      result = { route: d.stored, time: d.time, previousBest: d.stored.bestTime, newBest: false };
    }
    await refresh();
  }

  async function toggle() {
    if (active) {
      await stop();
    } else {
      void requestPersistence();
      result = null;
      await rec.start();
    }
  }

  async function startDuel(route: StoredRoute, simulate = false) {
    result = null;
    notice = null;
    const ghost = await loadGhost(route);
    if (!ghost) {
      notice = `Die Bestzeit-Fahrt von „${route.name}“ fehlt.`;
      return;
    }
    void requestPersistence();
    const opts: Parameters<RideRecorder['start']>[0] = { duel: new Duel(route, ghost) };
    if (simulate) {
      const best = rides.find((r) => r.id === route.bestRideId);
      if (!best) return;
      // ?pace=1.05 fährt 5 % langsamer als die Bestzeit, Standard 3 % schneller
      const pace = Number(new URLSearchParams(location.search).get('pace')) || undefined;
      opts.source = replaySource(best.raw, { pace });
      opts.persist = false;
    }
    await rec.start(opts);
  }

  async function remember(r: StoredRide) {
    const name = prompt('Wie soll die Strecke heißen?', 'Hausrunde')?.trim();
    if (!name) return;
    await createRoute(r, name);
    await refresh();
  }

  async function remove(id: string) {
    const best = bestOf.get(id);
    const msg = best
      ? `Diese Fahrt ist die Bestzeit von „${best.name}“. Mit ihr wird auch die Strecke gelöscht.`
      : 'Diese Fahrt löschen?';
    if (!confirm(msg)) return;
    await deleteRide(id);
    if (best) await deleteRoute(best.id);
    await refresh();
  }

  async function removeRoute(route: StoredRoute) {
    if (!confirm(`Strecke „${route.name}“ löschen? Die Fahrten bleiben erhalten.`)) return;
    await deleteRoute(route.id);
    await refresh();
  }

  const fileName = (r: StoredRide, ext: string) =>
    `rechase-${new Date(r.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;

  onMount(refresh);
</script>

{#if showMap}
  <MapView
    {rec}
    onclose={() => (showMap = false)}
    position={mapPos}
    title={duel?.stored.name ?? (active ? undefined : 'Vor dem Start')}
    route={duel?.route.points}
    ghost={duel && duel.phase !== 'approach' ? duel.ghostPos : null}
  />
{:else if active && duel}
  <DuelView {rec} {duel} onmap={() => (showMap = true)} onstop={stop} />
{:else}
<main>
  <header>
    <span class="dot" class:on={active} aria-hidden="true"></span>
    <div class="title">
      <span class="name">re:chase</span>
      <span class="sub">Tracking-Test · {active ? (rec.status === 'starting' ? 'warte auf GPS …' : 'Aufnahme läuft') : 'bereit'}</span>
    </div>
  </header>

  {#if ios && !standalone}
    <p class="hint">
      Tipp: Über <strong>Teilen → Zum Home-Bildschirm</strong> installieren. Nur dann bleiben deine Fahrten dauerhaft
      gespeichert.
    </p>
  {/if}

  <section class="hero" aria-live="polite">
    <span class="label">Tempo</span>
    <span class="big">{fmtKmh(cur?.speed)} <small>km/h</small></span>
    <span class="pause" class:paused={cur && !cur.moving}>
      {#if !cur}
        Auto-Pause · Ampelstopps zählen nicht
      {:else if cur.moving}
        In Bewegung
      {:else}
        Pausiert · Zeit steht
      {/if}
    </span>
  </section>

  <section class="grid">
    <div class="tile">
      <span class="label">Fahrzeit</span>
      <span class="val">{fmtDuration(cur?.movingTime ?? 0)}</span>
    </div>
    <div class="tile">
      <span class="label">Gesamt</span>
      <span class="val">{fmtDuration(cur?.elapsed ?? 0)}</span>
    </div>
    <div class="tile">
      <span class="label">Distanz</span>
      <span class="val">{fmtKm(cur?.distance ?? 0)} <small>km</small></span>
    </div>
    <div class="tile">
      <span class="label">Höhe (GPS)</span>
      <span class="val">{fmtInt(rec.lastRaw?.alt)} <small>m</small></span>
    </div>
  </section>

  {#if preview.permission === 'granted' || active || rec.track.length}
    <button class="minimap" aria-label="Karte im Folgemodus öffnen" onclick={() => (showMap = true)}>
      <LiveMap position={mapPos} track={rec.track} mini />
      <span class="maplabel">Karte</span>
      {#if !active && preview.accuracy != null}
        <span class="fix" class:good={preview.accuracy <= 20}>GPS ±{fmtInt(preview.accuracy)} m</span>
      {/if}
    </button>
  {:else if preview.permission === 'prompt'}
    <button class="minimap ask" onclick={() => preview.ask()}>
      <span class="maplabel">Karte</span>
      <span class="asktext">Standort anzeigen</span>
      <span class="askhint">Für Karte und GPS-Empfang vor dem Start</span>
    </button>
  {:else if preview.permission === 'denied'}
    <div class="minimap ask">
      <span class="maplabel">Karte</span>
      <span class="asktext">Standort blockiert</span>
      <span class="askhint">In den Browser-Einstellungen für diese Seite erlauben</span>
    </div>
  {/if}

  <section class="diag" aria-label="Technische Werte">
    <span>GPS ±{fmtInt(rec.lastRaw?.accuracy)} m</span>
    <span>Bildschirm wach: {rec.wakeLock}</span>
    <span>Punkte {rec.points}</span>
    <span>verworfen {rec.rejected}</span>
    <span>Lücken {rec.gaps}</span>
    <span>verlassen {rec.hiddenCount}×</span>
  </section>

  {#if rec.error}
    <p class="error" role="alert">{rec.error}</p>
  {/if}

  <button class="cta" class:stop={active} onclick={toggle}>
    {active ? 'Fahrt beenden' : 'Fahrt starten'}
  </button>
  {#if !active}
    <p class="note">Während der Fahrt bleibt der Bildschirm an. Bitte nicht sperren, sonst entstehen Lücken.</p>
  {/if}

  {#if result}
    <section class="result" aria-live="polite">
      {#if 'incomplete' in result}
        <span class="label">{result.route.name}</span>
        <span class="headline">Strecke nicht zu Ende gefahren</span>
        <span class="what">Gewertet wird nur, wer vom Start bis ins Ziel fährt.</span>
      {:else}
        {@const delta = (result.time - result.previousBest) / 1000}
        <span class="label">{result.route.name}{rec.simulated ? ' · Simulation' : ''}</span>
        <span class="headline" class:win={delta < 0}>
          {delta < 0 ? 'Bestzeit geschlagen' : 'Bestzeit hält'}
        </span>
        <span class="what">
          {fmtDuration(result.time)} bewegt · {delta < 0 ? '\u2212' : '+'}{fmtGapSeconds(delta)} gegenüber {fmtDuration(
            result.previousBest,
          )}{result.newBest ? ' · ist jetzt dein Ghost' : ''}{rec.simulated ? ' · nicht gespeichert' : ''}
        </span>
      {/if}
    </section>
  {/if}

  {#if notice}
    <p class="error" role="alert">{notice}</p>
  {/if}

  {#if routes.length}
    <section class="rides">
      <h2>Strecken</h2>
      <ul>
        {#each routes as route (route.id)}
          <li>
            <div>
              <span class="when">{route.name}</span>
              <span class="what">
                {fmtKm(route.length)} km · Bestzeit {fmtDuration(route.bestTime)} vom {fmtDay(route.bestAt)} · {route.attempts}
                {route.attempts === 1 ? 'Fahrt' : 'Fahrten'}
              </span>
              <span class="links">
                <button class="link" disabled={active} onclick={() => startDuel(route, true)}>Simulieren</button>
                <button class="link" disabled={active} onclick={() => removeRoute(route)}>Löschen</button>
              </span>
            </div>
            <div class="actions">
              <button class="duel" disabled={active} onclick={() => startDuel(route)}>Duell</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if rides.length}
    <section class="rides">
      <h2>Aufzeichnungen</h2>
      <ul>
        {#each rides as r (r.id)}
          {@const last = r.samples.at(-1)}
          <li>
            <div>
              <span class="when">{fmtDate(r.startedAt)}{r.endedAt ? '' : ' · unvollständig'}</span>
              <span class="what">
                {fmtKm(last?.distance ?? 0)} km · {fmtDuration(last?.movingTime ?? 0)} bewegt · {r.gaps} Lücken
              </span>
              {#if r.routeId && routeById.get(r.routeId)}
                <span class="what route">
                  {routeById.get(r.routeId)!.name}{r.routeTime != null ? ` · ${fmtDuration(r.routeTime)}` : ' · nicht beendet'}{bestOf.has(r.id)
                    ? ' · Bestzeit'
                    : ''}
                </span>
              {:else if r.endedAt && !active}
                <span class="links"><button class="link" onclick={() => remember(r)}>Als Strecke merken</button></span>
              {/if}
            </div>
            <div class="actions">
              <button onclick={() => download(fileName(r, 'gpx'), toGpx(r), 'application/gpx+xml')}>GPX</button>
              <button onclick={() => download(fileName(r, 'csv'), toCsv(r), 'text/csv')}>CSV</button>
              <button aria-label="Löschen" onclick={() => remove(r.id)}>✕</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</main>
{/if}

<style>
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: max(20px, env(safe-area-inset-top)) 12px max(24px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 8px 4px;
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
  .title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
  }
  .sub,
  .note {
    font-size: 13px;
    color: var(--muted);
  }
  .note {
    margin: 0;
    text-align: center;
  }
  .hint {
    margin: 0;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1.5px dashed var(--ghost);
    font-size: 14px;
    color: var(--text);
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
    font-size: 17px;
    font-weight: 500;
    color: var(--muted);
  }
  .hero {
    background: var(--surface-2);
    border-radius: 20px;
    padding: 16px 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .big {
    font-family: var(--font-num);
    font-size: 96px;
    font-weight: 700;
    line-height: 0.95;
    color: var(--you);
  }
  .pause {
    font-size: 13px;
    color: var(--muted);
  }
  .pause.paused {
    color: var(--ghost);
    font-weight: 600;
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
  }
  .val {
    font-family: var(--font-num);
    font-size: 42px;
    font-weight: 600;
    line-height: 1;
  }
  .minimap {
    position: relative;
    height: 150px;
    padding: 0;
    border: 0;
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface);
    cursor: pointer;
  }
  .fix {
    position: absolute;
    right: 10px;
    top: 10px;
    padding: 4px 10px;
    border-radius: 10px;
    background: rgba(13, 15, 18, 0.82);
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .fix.good {
    color: var(--text);
  }
  .ask {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--text);
  }
  .asktext {
    font-size: 17px;
    font-weight: 600;
    color: var(--you);
  }
  .askhint {
    font-size: 13px;
    color: var(--muted);
  }
  .maplabel {
    position: absolute;
    left: 10px;
    top: 10px;
    padding: 4px 10px;
    border-radius: 10px;
    background: rgba(13, 15, 18, 0.82);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .diag {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 2px 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .error {
    margin: 0;
    padding: 10px 14px;
    border-radius: 14px;
    background: #2a1414;
    color: #ffb4ae;
  }
  .cta {
    height: 56px;
    border: 0;
    border-radius: 14px;
    background: var(--you);
    color: var(--bg);
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
  }
  .cta.stop {
    background: var(--surface);
    color: var(--text);
    border: 1.5px solid var(--rec);
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
  .route {
    color: var(--ghost);
  }
  .links {
    display: flex;
    gap: 16px;
    margin-top: 2px;
  }
  .link {
    padding: 6px 0;
    border: 0;
    background: none;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .link:disabled,
  .actions button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .actions .duel {
    padding: 0 16px;
    background: var(--you);
    color: var(--bg);
    font-size: 15px;
    font-weight: 700;
  }
  .rides h2 {
    margin: 12px 8px 6px;
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  li {
    background: var(--surface);
    border-radius: 14px;
    padding: 10px 12px 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  li > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .when {
    font-weight: 600;
  }
  .what {
    font-size: 13px;
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .actions button {
    min-width: 44px;
    height: 44px;
    border: 0;
    border-radius: 12px;
    background: #1f2329;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
