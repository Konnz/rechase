<script lang="ts">
  import type { Duel } from '../duel.svelte.ts';
  import { fmtDuration, fmtGapMeters, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import LiveMap from '../map/LiveMap.svelte';
  import { mapPrefs } from '../map/prefs.svelte.ts';
  import { soundPrefs } from '../sound/prefs.svelte.ts';
  import { sounds } from '../sound/sounds.ts';
  import type { RideRecorder } from '../tracker.svelte.ts';
  import Figure, { type FigureVariant } from './Figure.svelte';
  import {
    HORIZON_Y,
    VIEW_BOTTOM,
    VIEW_TOP,
    VIEW_W,
    YOU_H,
    YOU_LANE,
    buildRoad,
    place,
    routePath,
    straightPath,
  } from './scene.ts';

  let {
    rec,
    duel = null,
    figure = 'pfeil',
    onstop,
  }: { rec: RideRecorder; duel?: Duel | null; figure?: FigureVariant; onstop: () => void } = $props();

  /** true: Karte groß, Straße klein oben rechts */
  let swapped = $state(false);
  // Die Zeichenfläche wächst mit der Höhe der Ansicht nach oben in den Himmel, damit seitlich wenig abgeschnitten wird
  let sceneW = $state(390);
  let sceneH = $state(600);
  // höchstens bis SKY_MAX, sonst bliebe auf hohen Bildschirmen viel leerer Himmel
  const SKY_MAX = -220;
  const viewTop = $derived(
    Math.max(SKY_MAX, Math.min(VIEW_TOP, VIEW_BOTTOM - (VIEW_W * sceneH) / Math.max(sceneW, 1))),
  );

  const css = getComputedStyle(document.documentElement);
  const YOU = css.getPropertyValue('--you').trim() || '#ff7a1a';
  const GHOST = css.getPropertyValue('--ghost').trim() || '#a9c1ff';
  const FIG_W = (YOU_H * 40) / 56;
  /** Fußpunkt der Figur liegt bei 52 von 56 */
  const FIG_FEET = (YOU_H * 52) / 56;

  const cur = $derived(rec.current);
  const racing = $derived(!!duel && duel.phase !== 'approach');
  const short = $derived(duel?.opponent.short ?? 'Ghost');
  const gap = $derived(duel?.gap ?? null);
  /** Positiv: Ghost liegt vorn */
  const ahead = $derived(gap?.meters ?? 0);
  const ghostLeads = $derived(ahead > 0.5);
  const leadColor = $derived(ghostLeads ? 'var(--ghost)' : 'var(--you)');

  // Straße: auf einer Strecke der echte Verlauf ab deiner Position, sonst geradeaus
  const path = $derived(duel ? routePath(duel.route, duel.along, duel.opponent.profile) : straightPath);
  const road = $derived(buildRoad(path, duel ? duel.along : (cur?.distance ?? 0)));
  const you = $derived(place(path, 0));
  // Bei kleinem Abstand weicht der Ghost auf die linke Spur aus, damit sich die Figuren nicht verdecken.
  const lane = $derived(ahead >= 12 ? YOU_LANE : ahead <= -2 ? -0.9 : -0.9 + ((ahead + 2) / 14) * (YOU_LANE + 0.9));
  const g = $derived(racing ? place(path, Math.min(ahead, 2000), lane) : null);

  const trendText = $derived.by(() => {
    const t = duel?.trend;
    if (t == null || !racing) return null;
    const v = fmtGapSeconds(t).replace(' s', ' s/km');
    if (Math.abs(t) < 0.1) return { up: true, text: 'gleiches Tempo' };
    if (t < 0) return { up: true, text: ghostLeads ? `holst ${v} auf` : `baust ${v} aus` };
    return { up: false, text: `verlierst ${v}` };
  });

  const ghostSpeed = $derived(racing ? (duel?.ghostSpeed ?? null) : null);
  const ghostTime = $derived(racing ? (duel?.ghostTimeHere ?? null) : null);
  const pct = (m: number) => `${Math.min(100, Math.max(0, (m / (duel?.route.length || 1)) * 100))}%`;
  const finishDelta = $derived(
    duel?.phase === 'finished' ? (duel.time - duel.opponent.time) / 1000 : null,
  );
  const tagW = (text: string) => text.length * 6.6 + 16;

  // Ticken, solange man knapp hinter dem Ghost liegt; endet mit der Ansicht
  $effect(() => {
    sounds.setTicking(duel?.tickMs ?? null);
    return () => sounds.setTicking(null);
  });

  /** Kurze „+20“-Einblendung nach einem Abschnitts-PR */
  let pr = $state.raw<{ index: number; delta: number } | null>(null);
  $effect(() => {
    const last = duel?.sectionPrs.at(-1);
    if (!last || last.best == null) return;
    pr = { index: last.index, delta: (last.time - last.best) / 1000 };
    const t = setTimeout(() => (pr = null), 1500);
    return () => clearTimeout(t);
  });

  function toggleSound() {
    sounds.unlock();
    soundPrefs.enabled = !soundPrefs.enabled;
  }
</script>

<div class="screen">
  <div class="stage">
    <div class="layer" class:full={!swapped} class:pip={swapped} bind:clientWidth={sceneW} bind:clientHeight={sceneH}>
      <svg
        class="scene"
        aria-hidden="true"
        viewBox="0 {viewTop} {VIEW_W} {VIEW_BOTTOM - viewTop}"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#0d0f12" />
            <stop offset="1" stop-color="#161a20" />
          </linearGradient>
        </defs>
        <rect x="-200" y={viewTop} width={VIEW_W + 400} height={HORIZON_Y - viewTop} fill="url(#sky)" />
        <rect x="-200" y={HORIZON_Y} width={VIEW_W + 400} height={VIEW_BOTTOM - HORIZON_Y + 50} fill="#14171B" />
        <path d="M-200,40 L0,30 L40,27 L80,35 L120,20 L160,33 L200,25 L250,36 L300,22 L366,33 L566,30 L566,40 Z" fill="#1A1E24" />
        {#each road as seg, i (i)}
          <!-- Kontur in Flächenfarbe gegen feine Spalten zwischen den Stücken -->
          <polygon points={seg.ground.join(' ')} fill="#14171B" stroke="#14171B" stroke-width="1" />
          <polygon points={seg.road.join(' ')} fill="#20242B" stroke="#20242B" stroke-width="1" />
          {#each seg.edges as [a, b]}
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#F2F4F7" stroke-opacity="0.2" stroke-width="1.5" stroke-linecap="round" />
          {/each}
          {#if seg.dash}
            <line x1={seg.dash[0][0]} y1={seg.dash[0][1]} x2={seg.dash[1][0]} y2={seg.dash[1][1]} stroke="#F2F4F7" stroke-opacity="0.35" stroke-width="2.5" />
          {/if}
        {/each}

        <!-- Wer näher an der Kamera ist, wird darüber gezeichnet -->
        {#snippet ghostFig()}
          {#if g && !g.hidden}
            <g class="fig" style:transform="translate({g.x}px, {g.y}px) scale({g.scale})">
              <Figure variant={figure} ghost color={GHOST} x={-FIG_W / 2} y={-FIG_FEET} width={FIG_W} height={YOU_H} />
            </g>
            <!-- Namensschild über dem Kopf, damit es auch am Bildrand sichtbar bleibt -->
            <g class="fig" style:transform="translate({Math.min(VIEW_W - tagW(short) - 4, Math.max(4, g.x - tagW(short) / 2))}px, {g.y - FIG_FEET * g.scale - 26}px)">
              <rect width={tagW(short)} height="20" rx="7" fill="rgba(13,15,18,0.75)" stroke={GHOST} stroke-width="1.5" stroke-dasharray="4 3" />
              <text x={tagW(short) / 2} y="14.5" text-anchor="middle" font-size="12" font-weight="600" fill={GHOST}>{short}</text>
            </g>
          {/if}
        {/snippet}
        {#if ahead >= 0}{@render ghostFig()}{/if}
        <g style:transform="translate({you.x}px, {you.y}px)">
          <Figure variant={figure} color={YOU} x={-FIG_W / 2} y={-FIG_FEET} width={FIG_W} height={YOU_H} />
          <g transform="translate({FIG_W / 2 + 6}, {-YOU_H * 0.62})">
            <rect width="30" height="20" rx="7" fill={YOU} />
            <text x="15" y="14.5" text-anchor="middle" font-size="12" font-weight="700" fill="#0D0F12">Du</text>
          </g>
        </g>
        {#if ahead < 0}{@render ghostFig()}{/if}
      </svg>
      {#if !swapped}
        {#if racing && g?.hidden && ahead < 0}
          <span class="chip behind">{short} {fmtInt(-ahead)} m hinter dir</span>
        {/if}
        {#if pr}
          <div class="prpop" role="status">
            <span class="plus">+20</span>
            <span class="prtext">Abschnitt {pr.index + 1} · PR −{fmtGapSeconds(pr.delta)}</span>
          </div>
        {/if}
        {#if racing && duel && !duel.onRoute}
          <span class="chip offroute" role="status">Strecke verlassen · das Duell läuft weiter, sobald du zurück bist</span>
        {/if}
      {:else}
        <button class="swap" aria-label="Straßensicht groß zeigen" onclick={() => (swapped = false)}></button>
      {/if}
    </div>

    <div class="layer" class:full={swapped} class:pip={!swapped}>
      <LiveMap
        position={cur ?? rec.lastRaw}
        track={rec.track}
        route={duel?.route.points}
        ghost={racing ? (duel?.ghostPos ?? null) : null}
        mini={!swapped}
      />
      {#if !swapped}
        <button class="swap" aria-label="Karte groß zeigen" onclick={() => (swapped = true)}></button>
      {:else}
        <button
          class="icon compass"
          aria-label={mapPrefs.headingUp ? 'Norden nach oben' : 'Fahrtrichtung nach oben'}
          aria-pressed={mapPrefs.headingUp}
          onclick={() => (mapPrefs.headingUp = !mapPrefs.headingUp)}
        >
          {#if mapPrefs.headingUp}
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="var(--you)" stroke="var(--you)" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3 19 20l-7-4-7 4z"></path></svg>
          {:else}
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M12 6 15 13H9z" fill="#ff453a"></path><path d="M12 20 9 13h6z" fill="currentColor"></path><text x="12" y="5" text-anchor="middle" font-size="6" font-weight="700" fill="currentColor">N</text></svg>
          {/if}
        </button>
      {/if}
    </div>

    <div class="hud">
      <div class="speed">
        <span class="num">{fmtKmh(cur?.speed)}</span>
        <span class="unit">km/h</span>
        {#if ghostSpeed != null}<span class="sub ghostc">Ghost {fmtKmh(ghostSpeed)}</span>{/if}
      </div>

      <div class="gap" aria-live="polite">
        {#if rec.status === 'starting'}
          <span class="kicker">Warte auf GPS …</span>
        {:else if !duel}
          <span class="kicker">Distanz</span>
          <span class="big">{fmtKm(cur?.distance ?? 0)} <small>km</small></span>
        {:else if duel.phase === 'finished' && finishDelta != null}
          {@const won = finishDelta < 0}
          <span class="kicker" style:color={won ? 'var(--you)' : 'var(--ghost)'}>
            {won ? (short === 'Bestzeit' ? 'Neue Bestzeit' : `${short} geschlagen`) : 'Ziel erreicht'}
          </span>
          <span class="big" style:color={won ? 'var(--you)' : 'var(--ghost)'}>
            {won ? '−' : '+'}{fmtGapSeconds(finishDelta)}
          </span>
          <span class="sub">{fmtDuration(duel.time)}</span>
        {:else if !racing}
          <span class="kicker">Zum Start</span>
          <span class="big">{duel.toStart != null ? `${fmtInt(duel.toStart)} m` : '–'}</span>
        {:else}
          <span class="kicker" style:color={leadColor}>{ghostLeads ? `${short} vorn` : 'Du vorn'}</span>
          <span class="big" style:color={leadColor}>{fmtGapMeters(ahead)}</span>
          <span class="sub">
            {gap?.seconds != null ? fmtGapSeconds(gap.seconds) : '–'}
            {#if trendText}
              <span style:color={trendText.up ? 'var(--you)' : 'var(--ghost)'}>
                · {trendText.up ? '↗' : '↘'} {trendText.text}
              </span>
            {/if}
          </span>
        {/if}
      </div>
    </div>
  </div>

  <section class="panel">
    {#if duel && racing}
      <div class="bar" aria-label="Fortschritt auf der Strecke">
        <div class="fill" style:width={pct(duel.along)}></div>
        <div class="ghostmark" style:left={pct(duel.ghostAlong)}></div>
      </div>
    {/if}
    <div class="tiles">
      <div class="tile">
        <div class="head">
          <span class="label">Zeit netto</span>
          {#if ghostTime != null}<span class="bz">{fmtDuration(ghostTime)}</span>{/if}
        </div>
        <span class="val">{fmtDuration(duel ? (racing ? duel.time : 0) : (cur?.movingTime ?? 0))}</span>
      </div>
      <div class="tile">
        <span class="label">Zeit brutto</span>
        <span class="val">{fmtDuration(cur?.elapsed ?? 0)}</span>
      </div>
      <div class="tile">
        <span class="label">{duel ? `noch` : 'Höhe'}</span>
        <span class="val">
          {#if duel}{fmtKm(Math.max(0, duel.route.length - duel.along))} <small>km</small>{:else}{fmtInt(rec.lastRaw?.alt)} <small>m</small>{/if}
        </span>
      </div>
    </div>
    <div class="pause" class:paused={cur && !cur.moving}>
      {cur && !cur.moving
        ? duel
          ? 'Pausiert · der Ghost wartet mit'
          : 'Pausiert · Zeit steht'
        : 'Auto-Pause aktiv · Ampelstopps zählen nicht'}
    </div>
    {#if rec.error}
      <p class="error" role="alert">{rec.error}</p>
    {/if}
    <div class="buttons">
      <button
        class="sound"
        aria-label={soundPrefs.enabled ? 'Töne aus' : 'Töne an'}
        aria-pressed={soundPrefs.enabled}
        onclick={toggleSound}
      >
        <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"></path>
          {#if soundPrefs.enabled}
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"></path>
          {:else}
            <path d="m16 9 6 6m0-6-6 6"></path>
          {/if}
        </svg>
      </button>
      <button class="stop" onclick={onstop}>Fahrt beenden</button>
    </div>
  </section>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }
  .layer {
    position: absolute;
    overflow: hidden;
    background: var(--surface-2);
    transition:
      inset 0.25s ease,
      width 0.25s ease,
      height 0.25s ease;
  }
  .layer.full {
    inset: 0;
    z-index: 1;
  }
  .layer.pip {
    top: max(12px, env(safe-area-inset-top));
    right: 12px;
    width: 112px;
    height: 112px;
    z-index: 5;
    border-radius: 14px;
    border: 1.5px solid #2e333b;
  }
  .scene {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .scene text {
    font-family: var(--font-text);
  }
  .fig {
    /* Zwischen zwei GPS-Punkten gleitet der Ghost, statt zu springen */
    transition: transform 1s linear;
  }
  .swap {
    position: absolute;
    inset: 0;
    z-index: 2;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .hud {
    position: absolute;
    left: 0;
    right: 136px;
    top: 0;
    z-index: 4;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: max(12px, env(safe-area-inset-top)) 0 0 14px;
    pointer-events: none;
  }
  .speed,
  .gap {
    display: flex;
    flex-direction: column;
    padding: 8px 12px 10px;
    border-radius: 14px;
    background: rgba(13, 15, 18, 0.72);
  }
  .speed {
    flex-shrink: 0;
    align-items: flex-start;
  }
  .gap {
    flex: 1 1 auto;
    min-width: 0;
    align-items: center;
    text-align: center;
  }
  .num {
    font-family: var(--font-num);
    font-size: 52px;
    font-weight: 700;
    line-height: 0.9;
    color: var(--you);
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .kicker {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .big {
    font-family: var(--font-num);
    font-size: 44px;
    font-weight: 700;
    line-height: 0.95;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    margin-top: 2px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .ghostc {
    color: var(--ghost);
  }
  small {
    font-family: var(--font-text);
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
  }
  .chip {
    position: absolute;
    left: 12px;
    right: 12px;
    z-index: 3;
    padding: 6px 10px;
    border-radius: 10px;
    background: rgba(13, 15, 18, 0.85);
    font-size: 13px;
    font-weight: 600;
    text-align: center;
  }
  .behind {
    bottom: 10px;
    color: var(--ghost);
    border: 1.5px dashed var(--ghost);
  }
  .offroute {
    top: 55%;
    color: var(--text);
    border: 1.5px solid var(--rec);
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
    cursor: pointer;
  }
  .compass {
    position: absolute;
    right: 12px;
    bottom: 12px;
    z-index: 3;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px max(14px, env(safe-area-inset-bottom));
    background: var(--bg);
  }
  .bar {
    position: relative;
    height: 6px;
    margin: 2px 4px 4px;
    border-radius: 3px;
    background: var(--line);
  }
  .fill {
    height: 6px;
    border-radius: 3px;
    background: var(--you);
  }
  .ghostmark {
    position: absolute;
    top: -4px;
    width: 4px;
    height: 14px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--ghost);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    background: var(--surface);
    border-radius: 14px;
    padding: 8px 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
  }
  .label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .bz {
    font-size: 11px;
    font-weight: 600;
    color: var(--ghost);
  }
  .val {
    font-family: var(--font-num);
    font-size: 30px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .val small {
    font-size: 13px;
  }
  .pause {
    text-align: center;
    font-size: 13px;
    color: var(--muted);
  }
  .pause.paused {
    color: var(--ghost);
    font-weight: 600;
  }
  .error {
    margin: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: #2a1414;
    color: #ffb4ae;
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  .sound {
    flex: 0 0 52px;
    height: 52px;
    border-radius: 14px;
    border: 0;
    background: var(--surface);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .sound[aria-pressed='false'] {
    color: var(--muted);
  }
  .prpop {
    position: absolute;
    right: 12px;
    top: 42%;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 6px 12px 8px;
    border-radius: 12px;
    background: rgba(13, 15, 18, 0.8);
    animation: pop 1.5s ease-out forwards;
    pointer-events: none;
  }
  .plus {
    font-family: var(--font-num);
    font-size: 40px;
    font-weight: 700;
    line-height: 1;
    color: var(--you);
  }
  .prtext {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  @keyframes pop {
    0% {
      opacity: 0;
      transform: translateY(8px) scale(0.9);
    }
    12% {
      opacity: 1;
      transform: none;
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
  .stop {
    flex: 1;
    height: 52px;
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    border: 1.5px solid var(--rec);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
