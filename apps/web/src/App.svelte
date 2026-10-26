<script lang="ts">
  import { onMount } from 'svelte';
  import { deleteRide, listRides, requestPersistence, type StoredRide } from './lib/db.ts';
  import { download, toCsv, toGpx } from './lib/export.ts';
  import { fmtDate, fmtDuration, fmtInt, fmtKm, fmtKmh } from './lib/format.ts';
  import { RideRecorder } from './lib/tracker.svelte.ts';

  const rec = new RideRecorder();
  let rides = $state<StoredRide[]>([]);

  const active = $derived(rec.status === 'starting' || rec.status === 'recording');
  const cur = $derived(rec.current);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);

  async function refresh() {
    rides = await listRides().catch(() => []);
  }

  async function toggle() {
    if (active) {
      await rec.stop();
      await refresh();
    } else {
      void requestPersistence();
      await rec.start();
    }
  }

  async function remove(id: string) {
    if (!confirm('Diese Fahrt löschen?')) return;
    await deleteRide(id);
    await refresh();
  }

  const fileName = (r: StoredRide, ext: string) =>
    `rechase-${new Date(r.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`;

  onMount(refresh);
</script>

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
