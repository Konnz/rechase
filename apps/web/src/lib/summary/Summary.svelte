<script lang="ts">
  import { BIKE_CLASS_LABELS, bikeInfo, rideStats, speedProfile, trimForPrivacy, type BikeType } from '@rechase/core';
  import { onMount } from 'svelte';
  import type { StoredChallenge, StoredRide, StoredRoute } from '../db.ts';
  import type { ChallengeResult } from '../share/challenges.ts';
  import ChallengeShare from '../share/ChallengeShare.svelte';
  import { privacyPrefs } from '../share/privacy.svelte.ts';
  import { toGpx } from '../export.ts';
  import { fmtDate, fmtDuration, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import BikePicker from '../account/BikePicker.svelte';
  import { rideCheck, rideCounts, type RideResult } from '../routes.ts';
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
    challenge = null,
    challengeResult = null,
    onsave,
    onamend,
    onaccount,
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
    /** Geteilter Ghost, gegen den die Fahrt lief */
    challenge?: StoredChallenge | null;
    challengeResult?: ChallengeResult | null;
    /** Merkt die Fahrt als Strecke; liefert die neue Strecke oder null bei Abbruch */
    onsave: (ride: StoredRide) => Promise<StoredRoute | null>;
    /** Rad korrigieren oder der Plausibilitätsprüfung widersprechen */
    onamend: (ride: StoredRide, change: Pick<StoredRide, 'bike' | 'appealedAt'>) => Promise<StoredRide>;
    /** Anmelden oder Onboarding, um teilen zu können */
    onaccount: () => void;
    onclose: () => void;
  } = $props();

  /** Unter dieser Distanz lohnt keine Strecke */
  const MIN_ROUTE_M = 200;

  const stats = $derived(rideStats(ride.samples));
  const check = $derived(rideCheck(ride));
  const counts = $derived(rideCounts(ride));
  let pickBike = $state(false);
  const speed = $derived(speedProfile(ride.samples));
  // Für Bilder, die das Gerät verlassen: Start und Ende gekürzt (Privatzonen)
  const shareSpeed = $derived(speedProfile(trimForPrivacy(ride.samples, privacyPrefs.options(ride.id)) ?? []));
  const shareable = $derived(!simulated && !!ride.endedAt && counts && stats.distance >= MIN_ROUTE_M);
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
    void renderShareImage({ startedAt: ride.startedAt, title: onRoute?.name, stats, profile: shareSpeed }).then(
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

  async function amend(change: Pick<StoredRide, 'bike' | 'appealedAt'>, msg: string) {
    busy = true;
    try {
      const updated = await onamend(ride, change);
      pickBike = false;
      say(rideCounts(updated) ? msg : 'Passt auch mit diesem Rad nicht');
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
      {#if speed.coords.length > 1}
        <SummaryMap profile={speed} />
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
        {:else if !result.counted}
          <span class="label">{result.route.name}</span>
          <span class="headline">Nicht gewertet</span>
          <span class="what">{fmtDuration(result.time)} bewegt · zählt nicht für Bestzeit und Ghost</span>
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

    {#if challengeResult}
      {@const c = challengeResult}
      <section class="result" aria-live="polite">
        <span class="label">{c.challenge.name} · Ghost von {c.challenge.chaser}</span>
        {#if c.time == null}
          <span class="headline">Strecke nicht zu Ende gefahren</span>
          <span class="what">Gewertet wird nur, wer vom Start bis ins Ziel fährt.</span>
        {:else if !c.counted}
          <span class="headline">Nicht gewertet</span>
          <span class="what">{fmtDuration(c.time)} bewegt · zählt nicht für die Challenge</span>
        {:else}
          {@const delta = (c.time - c.challenge.time) / 1000}
          <span class="headline" class:win={c.won}>{c.won ? `${c.challenge.chaser} geschlagen` : `${c.challenge.chaser} vorn`}</span>
          <span class="what">
            {fmtDuration(c.time)} bewegt · {delta < 0 ? '−' : '+'}{fmtGapSeconds(delta)} gegenüber {fmtDuration(
              c.challenge.time,
            )}{c.previousBest != null && c.time < c.previousBest ? ' · deine neue Bestzeit hier' : ''}
          </span>
        {/if}
      </section>
    {/if}

    {#if !simulated && ride.endedAt && !check.ok}
      <section class="check" class:open={!counts} aria-live="polite">
        {#if counts}
          <span class="label">Plausibilität</span>
          <span class="what">
            Auffällig für {BIKE_CLASS_LABELS[check.bikeClass]}, nach deinem Widerspruch für deine Bestzeiten gewertet.
            Für öffentliche Wertungen zählt sie erst nach einer Prüfung.
          </span>
        {:else}
          <span class="label">Passt nicht zu {ride.bike ? bikeInfo(ride.bike).label : 'einem Fahrrad'}</span>
          <ul>
            {#each check.flags as f (f.rule)}
              <li>{f.message}</li>
            {/each}
          </ul>
          <span class="what">
            {#if check.suggestion === 'none'}
              Das sieht nach Auto oder Bahn aus. Vielleicht lief die Aufnahme nach der Radfahrt weiter?
            {:else if check.suggestion}
              Mit {BIKE_CLASS_LABELS[check.suggestion]} wäre die Fahrt plausibel.
            {/if}
            Sie bleibt gespeichert, zählt aber nicht für Bestzeiten und Ghosts.
          </span>
          {#if pickBike}
            <BikePicker
              value={ride.bike ?? null}
              onchange={(b: BikeType) => amend({ bike: b }, `Als ${bikeInfo(b).label} gewertet`)}
            />
          {/if}
          <div class="row">
            <button class="secondary" disabled={busy} aria-expanded={pickBike} onclick={() => (pickBike = !pickBike)}>
              Rad ändern
            </button>
            <button
              class="secondary"
              disabled={busy}
              onclick={() => amend({ appealedAt: Date.now() }, 'Widerspruch gespeichert · Fahrt zählt')}
            >
              Ich war mit dem Rad unterwegs
            </button>
          </div>
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

    {#if shareable}
      <ChallengeShare
        {ride}
        route={onRoute}
        {challenge}
        won={!!challengeResult?.won}
        {stats}
        profile={shareSpeed}
        {onaccount}
        onsay={say}
      />
    {/if}

    <section class="actions">
      {#if onRoute}
        <div class="saved">
          <span class="label">Strecke</span>
          <span>{onRoute.name}</span>
        </div>
      {:else if !simulated}
        <button
          class="cta"
          disabled={busy || !ride.endedAt || stats.distance < MIN_ROUTE_M || !counts}
          onclick={save}
        >
          Strecke speichern
        </button>
        {#if !counts}
          <span class="note">Erst wenn die Fahrt gewertet wird, kann sie Ghost einer Strecke sein.</span>
        {:else if stats.distance < MIN_ROUTE_M}
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
  .check {
    background: var(--surface);
    border-radius: 16px;
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .check.open {
    border: 1.5px solid var(--rec);
  }
  .check .secondary {
    background: #22262d;
  }
  .check ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 15px;
    line-height: 1.35;
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
