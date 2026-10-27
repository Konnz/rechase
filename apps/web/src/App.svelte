<script lang="ts">
  import { bikeInfo, type Cue } from '@rechase/core';
  import { onMount } from 'svelte';
  import { account } from './lib/account/account.svelte.ts';
  import AccountScreen from './lib/account/AccountScreen.svelte';
  import BikePicker from './lib/account/BikePicker.svelte';
  import { ChallengeWatch } from './lib/challenge/challenge.svelte.ts';
  import ChallengeOffer from './lib/challenge/ChallengeOffer.svelte';
  import { CHALLENGE_MODES, challengePrefs } from './lib/challenge/prefs.svelte.ts';
  import FieldTest from './lib/account/FieldTest.svelte';
  import Onboarding from './lib/account/Onboarding.svelte';
  import Profile from './lib/account/Profile.svelte';
  import {
    deleteRide,
    deleteRoute,
    listRides,
    listRoutes,
    requestPersistence,
    saveRide,
    type StoredRide,
    type StoredRoute,
  } from './lib/db.ts';
  import { Duel } from './lib/duel.svelte.ts';
  import RideView from './lib/ride/RideView.svelte';
  import { download, toCsv, toGpx } from './lib/export.ts';
  import { fmtDate, fmtDay, fmtDuration, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from './lib/format.ts';
  import LiveMap from './lib/map/LiveMap.svelte';
  import MapView from './lib/map/MapView.svelte';
  import {
    AVERAGE_OF,
    completedRides,
    createRoute,
    evaluateRide,
    loadOpponent,
    rideCounts,
    sectionBestsFor,
    type GhostMode,
    type RideResult,
  } from './lib/routes.ts';
  import { replaySource, withApproach } from './lib/sim.ts';
  import { PositionPreview } from './lib/preview.svelte.ts';
  import { SOUND_GROUPS, soundPrefs } from './lib/sound/prefs.svelte.ts';
  import { sounds } from './lib/sound/sounds.ts';
  import Summary from './lib/summary/Summary.svelte';
  import { RideRecorder } from './lib/tracker.svelte.ts';
  import { uploader } from './lib/upload.svelte.ts';

  const rec = new RideRecorder();
  rec.oncue = (c) => sounds.play(c);
  /** Duell-Angebote unterwegs, mit dem eingestellten Standard-Ghost */
  const watch = new ChallengeWatch(
    rec,
    async (route) => {
      const opponent = await loadOpponent(route, ghostMode, rides);
      return opponent && new Duel(route, opponent, sectionBestsFor(route, rides), { challenge: true });
    },
    (c) => sounds.play(c),
  );
  rec.onsample = (s) => watch.push(s);
  // raw: IndexedDB kann keine $state-Proxys speichern
  let rides = $state.raw<StoredRide[]>([]);
  let routes = $state.raw<StoredRoute[]>([]);
  let showMap = $state(false);
  /** Ergebnis der letzten Fahrt auf einer Strecke */
  let result = $state.raw<RideResult | { route: StoredRoute; incomplete: true } | null>(null);
  let notice = $state<string | null>(null);
  /** Konto-Seiten über der Startseite */
  let accountMode = $state<'welcome' | 'login' | 'register' | null>(null);
  let screen = $state<'account' | 'onboarding' | 'profile' | null>(null);
  let pickBike = $state(false);

  function openAccount(mode: 'welcome' | 'login' | 'register') {
    accountMode = mode;
    screen = 'account';
  }

  /** Nach Anmeldung oder Laden: fehlt noch Name oder Rad, kommt das Onboarding. */
  function afterAccount() {
    screen = account.user && !account.user.onboarded ? 'onboarding' : null;
  }

  async function initAccount() {
    // Rückkehr von der Google-Anmeldung
    const params = new URLSearchParams(location.search);
    const outcome = params.get('anmeldung');
    if (outcome) {
      params.delete('anmeldung');
      history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
      if (outcome === 'fehler') notice = 'Die Anmeldung mit Google hat nicht geklappt. Bitte noch einmal versuchen.';
    }
    await account.load();
    if (account.user) {
      account.dismissWelcome();
      afterAccount();
    } else if (!account.welcomeSeen && !active) openAccount('welcome');
    void uploader.sync();
  }

  const FIELD_TEST_LATER_KEY = 'rechase.fieldTestLater';
  const loadFieldTestLater = () => {
    try {
      return localStorage.getItem(FIELD_TEST_LATER_KEY) === '1';
    } catch {
      return false;
    }
  };
  /** Feldtest-Karte auf der Startseite weggeklickt; im Profil bleibt die Einwilligung möglich */
  let fieldTestLater = $state(loadFieldTestLater());
  function dismissFieldTest() {
    fieldTestLater = true;
    try {
      localStorage.setItem(FIELD_TEST_LATER_KEY, '1');
    } catch {
      // Privater Modus: gilt bis zum Neuladen
    }
  }

  /** Feldtest: offene Fahrten hochladen, sobald die App wieder sichtbar oder online ist, aber nicht während der Fahrt */
  function syncWhenIdle() {
    if (!active && document.visibilityState === 'visible') void uploader.sync();
  }

  const GHOST_MODE_KEY = 'rechase.ghostMode';
  const loadGhostMode = (): GhostMode => {
    try {
      const v = localStorage.getItem(GHOST_MODE_KEY);
      return v === 'last' || v === 'average' ? v : 'best';
    } catch {
      return 'best';
    }
  };
  /** Gegen welchen eigenen Ghost Duelle laufen */
  let ghostMode = $state<GhostMode>(loadGhostMode());
  function setGhostMode(m: GhostMode) {
    ghostMode = m;
    try {
      localStorage.setItem(GHOST_MODE_KEY, m);
    } catch {
      // Privater Modus: gilt bis zum Neuladen
    }
  }
  const GHOST_MODES: { id: GhostMode; label: string }[] = [
    { id: 'best', label: 'Bestzeit' },
    { id: 'last', label: 'Letzte Fahrt' },
    { id: 'average', label: `Ø ${AVERAGE_OF} Fahrten` },
  ];
  /** Abschluss-Screen einer Fahrt, direkt nach dem Beenden oder aus der Liste */
  let summary = $state.raw<{
    ride: StoredRide;
    simulated: boolean;
    result: typeof result;
    sectionPrs?: number;
  } | null>(null);

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
  const mutedRoutes = $derived(routes.filter((r) => challengePrefs.isMuted(r.id)));

  async function refresh() {
    [rides, routes] = await Promise.all([listRides().catch(() => []), listRoutes().catch(() => [])]);
  }

  async function stop() {
    // Ein unterwegs angenommenes Duell, dessen Start man nicht erreicht hat, zählt nicht als abgebrochen
    if (rec.duel?.challenge && rec.duel.phase === 'approach') rec.detachDuel();
    watch.end();
    const d = rec.duel;
    const ride = await rec.stop();
    showMap = false;
    result = null;
    if (ride && !rec.simulated) {
      const r = await evaluateRide(ride, routes);
      result = r ?? (d ? { route: d.stored, incomplete: true } : null);
    } else if (d && d.phase === 'finished') {
      // Simulation: Ergebnis zeigen, aber nichts speichern
      result = { route: d.stored, time: d.time, previousBest: d.opponent.time, newBest: false, counted: true };
    }
    await refresh();
    if (ride?.samples.length) summary = { ride, simulated: rec.simulated, result, sectionPrs: d?.sectionPrs.length };
    if (ride && !rec.simulated) void uploader.sync();
  }

  async function toggle() {
    if (active) {
      await stop();
    } else {
      sounds.unlock();
      void requestPersistence();
      result = null;
      await rec.start({ bike: account.bike });
      watch.begin(routes);
    }
  }

  /** Freie Fahrt am Schreibtisch: gerade Anfahrt auf den Start, dann die Bestzeit-Fahrt (für E27) */
  async function simulateApproach(route: StoredRoute) {
    const best = rides.find((r) => r.id === route.bestRideId);
    if (!best) return;
    sounds.unlock();
    result = null;
    notice = null;
    await rec.start({ source: replaySource(withApproach(best.raw), { speedup: 2 }), persist: false, bike: account.bike });
    watch.begin(routes.filter((r) => r.id === route.id));
  }

  async function startDuel(route: StoredRoute, simulate = false) {
    // Noch im Klick, sonst bleibt der Ton auf iOS stumm
    sounds.unlock();
    result = null;
    notice = null;
    const opponent = await loadOpponent(route, ghostMode, rides);
    if (!opponent) {
      notice = `Die Bestzeit-Fahrt von „${route.name}“ fehlt.`;
      return;
    }
    void requestPersistence();
    const opts: Parameters<RideRecorder['start']>[0] = {
      duel: new Duel(route, opponent, sectionBestsFor(route, rides)),
      bike: account.bike,
    };
    if (simulate) {
      const best = rides.find((r) => r.id === route.bestRideId);
      if (!best) return;
      // ?pace=1.05 fährt 5 % langsamer als die Bestzeit, Standard 3 % schneller
      const pace = Number(new URLSearchParams(location.search).get('pace')) || undefined;
      opts.source = replaySource(best.raw, { pace });
      opts.persist = false;
    }
    await rec.start(opts);
    if (!simulate) watch.begin(routes);
  }

  async function remember(r: StoredRide): Promise<StoredRoute | null> {
    const name = prompt('Wie soll die Strecke heißen?', 'Hausrunde')?.trim();
    if (!name) return null;
    const route = await createRoute(r, name);
    await refresh();
    return route;
  }

  /**
   * Rad einer auffälligen Fahrt korrigieren oder widersprechen. Zählt sie danach, wird sie
   * nachträglich auf ihrer Strecke gewertet.
   */
  async function amend(ride: StoredRide, change: Pick<StoredRide, 'bike' | 'appealedAt'>): Promise<StoredRide> {
    const updated: StoredRide = { ...ride, ...change };
    await saveRide(updated);
    let r: RideResult | null = null;
    if (!rideCounts(ride) && rideCounts(updated)) r = await evaluateRide(updated, routes);
    await refresh();
    const saved = rides.find((x) => x.id === ride.id) ?? updated;
    if (summary?.ride.id === ride.id) summary = { ...summary, ride: saved, result: r ?? summary.result };
    if (r && result && !('incomplete' in result) && result.route.id === r.route.id) result = r;
    void uploader.sync();
    return saved;
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

  /** Beispiel je Klanggruppe zum Probehören */
  const SAMPLES: Record<(typeof SOUND_GROUPS)[number]['id'], Cue[]> = {
    overtake: [{ kind: 'overtake' }, { kind: 'overtaken' }],
    close: [],
    km: [{ kind: 'km-lead', km: 1 }],
    countdown: [500, 300, 100].map((meters) => ({ kind: 'countdown', meters })),
    section: [
      { kind: 'section', index: 0, time: 0, best: 0, pr: false },
      { kind: 'section', index: 0, time: 0, best: 0, pr: true },
    ],
    finish: [{ kind: 'finish', won: true }],
    pause: [{ kind: 'pause', moving: false }, { kind: 'pause', moving: true }],
    challenge: [{ kind: 'challenge', accepted: false }, { kind: 'challenge', accepted: true }],
  };

  function testSound(g: keyof typeof SAMPLES) {
    sounds.unlock();
    // Nach dem Freischalten läuft der Audio-Kontext erst einen Moment später
    setTimeout(() => {
      if (g === 'close') {
        sounds.setTicking(600);
        setTimeout(() => sounds.setTicking(300), 1500);
        setTimeout(() => sounds.setTicking(null), 3000);
      } else for (const c of SAMPLES[g]) sounds.play(c, { force: true });
    }, 50);
  }

  onMount(() => {
    void refresh();
    void initAccount();
    window.addEventListener('online', syncWhenIdle);
    document.addEventListener('visibilitychange', syncWhenIdle);
    return () => {
      window.removeEventListener('online', syncWhenIdle);
      document.removeEventListener('visibilitychange', syncWhenIdle);
    };
  });
</script>

{#if screen === 'account' && accountMode && !active}
  <AccountScreen bind:mode={accountMode} ondone={afterAccount} />
{:else if screen === 'onboarding' && !active}
  <Onboarding ondone={() => (screen = null)} />
{:else if screen === 'profile' && !active}
  <Profile onclose={() => (screen = null)} />
{:else if summary}
  {@const s = summary}
  <Summary
    ride={s.ride}
    route={(s.ride.routeId && routeById.get(s.ride.routeId)) ||
      (s.result && !('incomplete' in s.result) ? s.result.route : null)}
    result={s.result}
    simulated={s.simulated}
    sectionPrs={s.sectionPrs}
    onsave={remember}
    onamend={amend}
    onclose={() => (summary = null)}
  />
{:else if showMap}
  <MapView
    {rec}
    onclose={() => (showMap = false)}
    position={mapPos}
    title={duel?.stored.name ?? (active ? undefined : 'Vor dem Start')}
    route={duel?.route.points}
    ghost={duel && duel.phase !== 'approach' ? duel.ghostPos : null}
  />
{:else if active}
  <RideView {rec} {duel} onstop={stop} />
  {#if watch.offer}
    <ChallengeOffer {watch} offer={watch.offer} position={cur ?? rec.lastRaw} />
  {/if}
{:else}
<main>
  <header>
    <span class="dot" class:on={active} aria-hidden="true"></span>
    <div class="title">
      <span class="name">re:chase</span>
      <span class="sub">Tracking-Test · {active ? (rec.status === 'starting' ? 'warte auf GPS …' : 'Aufnahme läuft') : 'bereit'}</span>
    </div>
    {#if account.user}
      <button class="me" onclick={() => (screen = account.user?.onboarded ? 'profile' : 'onboarding')}>
        {account.user.name ?? 'Profil'}
      </button>
    {:else if account.loaded}
      <button class="me" onclick={() => openAccount('login')}>Anmelden</button>
    {/if}
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

  {#if !active}
    <div class="bike">
      <button class="bikechip" aria-expanded={pickBike} onclick={() => (pickBike = !pickBike)}>
        <span class="modelabel">Rad</span>
        <strong>{account.bike ? bikeInfo(account.bike).label : 'wählen'}</strong>
        {#if account.bike && bikeInfo(account.bike).bikeClass !== 'muscle'}
          <span class="eclass">eigene Wertung</span>
        {/if}
        <span class="chev" aria-hidden="true">{pickBike ? '▴' : '▾'}</span>
      </button>
      {#if pickBike}
        <BikePicker
          value={account.bike}
          onchange={(b) => {
            account.setBike(b);
            pickBike = false;
          }}
        />
      {/if}
    </div>
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
      {:else if !result.counted}
        <span class="label">{result.route.name}</span>
        <span class="headline">Nicht gewertet</span>
        <span class="what">{fmtDuration(result.time)} bewegt · Die Fahrt passt nicht zu deinem Rad, Details in der Auswertung.</span>
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

  {#if account.user?.onboarded && !account.user.testConsent && !fieldTestLater && !active}
    <FieldTest compact ondismiss={dismissFieldTest} />
  {/if}

  {#if routes.length}
    <section class="rides">
      <h2>Strecken</h2>
      <div class="modes" role="radiogroup" aria-label="Gegner im Duell">
        <span class="modelabel">Duell gegen</span>
        {#each GHOST_MODES as m (m.id)}
          <button role="radio" aria-checked={ghostMode === m.id} class:on={ghostMode === m.id} onclick={() => setGhostMode(m.id)}>
            {m.label}
          </button>
        {/each}
      </div>
      <ul>
        {#each routes as route (route.id)}
          {@const lastDone = completedRides(route, rides)[0]}
          <li>
            <div>
              <span class="when">{route.name}</span>
              <span class="what">
                {fmtKm(route.length)} km · Bestzeit {fmtDuration(route.bestTime)} vom {fmtDay(route.bestAt)}{lastDone &&
                lastDone.id !== route.bestRideId &&
                lastDone.routeTime != null
                  ? ` · zuletzt ${fmtDuration(lastDone.routeTime)}`
                  : ''} · {route.attempts}
                {route.attempts === 1 ? 'Fahrt' : 'Fahrten'}
              </span>
              <span class="links">
                <button class="link" disabled={active} onclick={() => startDuel(route, true)}>Simulieren</button>
                <button class="link" disabled={active} onclick={() => simulateApproach(route)}>Anfahrt simulieren</button>
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
              <button class="when open" onclick={() => (summary = { ride: r, simulated: false, result: null })}>
                {fmtDate(r.startedAt)}{r.endedAt ? '' : ' · unvollständig'}
              </button>
              <span class="what">
                {fmtKm(last?.distance ?? 0)} km · {fmtDuration(last?.movingTime ?? 0)} bewegt{r.bike
                  ? ` · ${bikeInfo(r.bike).label}`
                  : ''} · {r.gaps} Lücken{r.endedAt && !rideCounts(r) ? ' · nicht gewertet' : ''}
              </span>
              {#if r.routeId && routeById.get(r.routeId)}
                <span class="what route">
                  {routeById.get(r.routeId)!.name}{r.routeTime != null ? ` · ${fmtDuration(r.routeTime)}` : ' · nicht beendet'}{bestOf.has(r.id)
                    ? ' · Bestzeit'
                    : ''}
                </span>
              {:else if r.endedAt && !active && rideCounts(r)}
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

  <details class="sounds">
    <summary>Duell-Angebote unterwegs · {CHALLENGE_MODES.find((m) => m.id === challengePrefs.mode)?.label}</summary>
    <p class="explain">
      Fährst du auf den Start einer gemerkten Strecke zu, bietet die App etwa 200 m vorher ein Duell an. Die Zeit läuft
      erst ab der Startlinie; verlässt du die Strecke, endet das Duell still und zählt nicht.
    </p>
    {#each CHALLENGE_MODES as m (m.id)}
      <label class="row start">
        <input
          type="radio"
          name="challenge-mode"
          checked={challengePrefs.mode === m.id}
          onchange={() => (challengePrefs.mode = m.id)}
        />
        <span class="opt">{m.label}<span class="what">{m.hint}</span></span>
      </label>
    {/each}
    {#if mutedRoutes.length}
      <span class="modelabel">Nicht mehr angeboten</span>
      {#each mutedRoutes as r (r.id)}
        <div class="row">
          <span>{r.name}</span>
          <button class="link" onclick={() => challengePrefs.setMuted(r.id, false)}>Wieder anbieten</button>
        </div>
      {/each}
    {/if}
  </details>

  <details class="sounds">
    <summary>Töne während der Fahrt · {soundPrefs.enabled ? 'an' : 'aus'}</summary>
    <label class="row start">
      <input type="checkbox" checked={soundPrefs.enabled} onchange={(e) => (soundPrefs.enabled = e.currentTarget.checked)} />
      Töne an
    </label>
    <label class="row">
      Lautstärke
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={soundPrefs.volume}
        disabled={!soundPrefs.enabled}
        oninput={(e) => (soundPrefs.volume = Number(e.currentTarget.value))}
      />
    </label>
    {#each SOUND_GROUPS as grp (grp.id)}
      <div class="row">
        <label>
          <input
            type="checkbox"
            checked={soundPrefs.isOn(grp.id)}
            disabled={!soundPrefs.enabled}
            onchange={(e) => soundPrefs.toggle(grp.id, e.currentTarget.checked)}
          />
          {grp.label}
        </label>
        <button class="link" onclick={() => testSound(grp.id)}>Anhören</button>
      </div>
    {/each}
  </details>
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
  .me {
    margin-left: auto;
    max-width: 50%;
    height: 36px;
    padding: 0 14px;
    border-radius: 18px;
    border: 1.5px solid var(--line);
    background: none;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .bike {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bikechip {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 14px;
    border-radius: 14px;
    border: 1.5px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
    cursor: pointer;
  }
  .eclass {
    font-size: 12px;
    color: #7ad98a;
  }
  .chev {
    margin-left: auto;
    color: var(--muted);
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
  .modes {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0 4px 8px;
  }
  .modelabel {
    font-size: 13px;
    color: var(--muted);
    margin-right: 2px;
  }
  .modes button {
    height: 36px;
    padding: 0 12px;
    border-radius: 18px;
    border: 1.5px solid var(--line);
    background: none;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .modes button.on {
    border-color: var(--ghost);
    background: color-mix(in srgb, var(--ghost) 16%, transparent);
    color: var(--ghost);
  }
  .sounds {
    margin-top: 8px;
    padding: 4px 16px 10px;
    border-radius: 16px;
    background: var(--surface);
  }
  .sounds summary {
    padding: 10px 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
  }
  .sounds .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 40px;
    font-size: 14px;
  }
  .sounds .start {
    justify-content: flex-start;
    font-weight: 600;
  }
  .sounds label {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sounds .explain {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--muted);
  }
  .sounds .opt {
    display: flex;
    flex-direction: column;
    font-weight: 600;
  }
  .sounds .opt .what {
    font-weight: 400;
  }
  .sounds input[type='radio'],
  .sounds input[type='checkbox'] {
    width: 20px;
    height: 20px;
    accent-color: var(--you);
  }
  .sounds input[type='range'] {
    flex: 1;
    max-width: 200px;
    accent-color: var(--you);
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
  .open {
    padding: 0;
    border: 0;
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .open::after {
    content: ' ›';
    color: var(--muted);
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
