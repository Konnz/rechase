<script lang="ts">
  import type { Duel } from '../duel.svelte.ts';
  import { fmtDay, fmtDuration, fmtGapMeters, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import LiveMap from '../map/LiveMap.svelte';
  import type { RideRecorder } from '../tracker.svelte.ts';
  import Figure, { type FigureVariant } from './Figure.svelte';
  import {
    CENTER_LINE,
    HORIZON_Y,
    LEFT_EDGE,
    RIGHT_EDGE,
    ROAD_PATH,
    VIEW_H,
    VIEW_W,
    YOU_FEET_Y,
    YOU_H,
    place,
    roadAt,
  } from './perspective.ts';

  let {
    rec,
    duel,
    figure = 'pfeil',
    onmap,
    onstop,
  }: { rec: RideRecorder; duel: Duel; figure?: FigureVariant; onmap: () => void; onstop: () => void } = $props();

  const css = getComputedStyle(document.documentElement);
  const YOU = css.getPropertyValue('--you').trim() || '#ff7a1a';
  const GHOST = css.getPropertyValue('--ghost').trim() || '#a9c1ff';

  const cur = $derived(rec.current);
  const racing = $derived(duel.phase !== 'approach');
  const gap = $derived(duel.gap);
  /** Positiv: Ghost liegt vorn */
  const ahead = $derived(gap?.meters ?? 0);
  const ghostLeads = $derived(ahead > 0.5);
  const leadColor = $derived(ghostLeads ? 'var(--ghost)' : 'var(--you)');

  // Bei kleinem Abstand weicht der Ghost auf die linke Spur aus, damit sich die Figuren nicht verdecken.
  const lane = $derived(ahead >= 12 ? 0.62 : ahead <= -2 ? 0.3 : 0.3 + ((ahead + 2) / 14) * 0.32);
  const g = $derived(place(Math.min(ahead, 2000), lane));
  const ghostEdge = $derived(roadAt(g.y));
  const youX = $derived(place(0).x);

  const trendText = $derived.by(() => {
    const t = duel.trend;
    if (t == null || !racing) return null;
    const v = fmtGapSeconds(t).replace(' s', ' s/km');
    if (Math.abs(t) < 0.1) return { up: true, text: 'gleiches Tempo' };
    if (t < 0) return { up: true, text: ghostLeads ? `du holst ${v} auf` : `du baust ${v} aus` };
    return { up: false, text: `du verlierst ${v}` };
  });

  const remaining = $derived(Math.max(0, duel.route.length - duel.along));
  const ghostSpeed = $derived(duel.ghostSpeed);
  const ghostTime = $derived(duel.ghostTimeHere);
  const pct = (m: number) => `${Math.min(100, Math.max(0, (m / duel.route.length) * 100))}%`;
  const finishDelta = $derived(duel.phase === 'finished' ? (duel.time - duel.stored.bestTime) / 1000 : null);
</script>

<div class="screen">
  <header>
    <span class="dot" class:on={rec.status === 'recording'} aria-hidden="true"></span>
    <div class="title">
      <span class="name">{duel.stored.name}{rec.simulated ? ' · Simulation' : ''}</span>
      <span class="sub">
        Duell gegen deine Bestzeit vom {fmtDay(duel.stored.bestAt)} · {fmtDuration(duel.stored.bestTime)}
      </span>
    </div>
  </header>

  <section class="gap" aria-live="polite">
    {#if duel.phase === 'finished' && finishDelta != null}
      <div class="main">
        <span class="kicker" style:color={finishDelta < 0 ? 'var(--you)' : 'var(--ghost)'}>
          {finishDelta < 0 ? 'Neue Bestzeit' : 'Ziel erreicht'}
        </span>
        <span class="meters" style:color={finishDelta < 0 ? 'var(--you)' : 'var(--ghost)'}>
          {fmtDuration(duel.time)}
        </span>
      </div>
      <div class="side">
        <span class="secs">{finishDelta < 0 ? '−' : '+'}{fmtGapSeconds(finishDelta)}</span>
        <span class="trend">{finishDelta < 0 ? 'schneller als die Bestzeit' : 'langsamer als die Bestzeit'}</span>
      </div>
    {:else if !racing}
      <div class="main">
        <span class="kicker">Fahr zum Start</span>
        <span class="meters">{duel.toStart != null ? `${fmtInt(duel.toStart)} m` : '–'}</span>
      </div>
      <div class="side">
        <span class="trend muted">Das Duell beginnt am Startpunkt</span>
      </div>
    {:else}
      <div class="main">
        <span class="kicker" style:color={leadColor}>{ghostLeads ? 'Bestzeit liegt vorn' : 'Du liegst vorn'}</span>
        <span class="meters" style:color={leadColor}>{fmtGapMeters(ahead)}</span>
      </div>
      <div class="side">
        <span class="secs">{gap?.seconds != null ? fmtGapSeconds(gap.seconds) : '–'}</span>
        {#if trendText}
          <span class="trend" style:color={trendText.up ? 'var(--you)' : 'var(--ghost)'}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              {#if trendText.up}<path d="M7 17 17 7"></path><path d="M8 7h9v9"></path>{:else}<path d="M7 7l10 10"></path><path d="M17 8v9H8"></path>{/if}
            </svg>
            {trendText.text}
          </span>
        {/if}
      </div>
    {/if}
  </section>

  <div class="race">
    <svg aria-hidden="true" class="road" viewBox="0 0 {VIEW_W} {VIEW_H}" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y={HORIZON_Y} width={VIEW_W} height={VIEW_H - HORIZON_Y} fill="#14171B" />
      <path d="M0,40 L40,27 L80,35 L120,20 L160,33 L200,25 L250,36 L300,22 L366,33 L366,40 Z" fill="#1A1E24" />
      <path d={ROAD_PATH} fill="#20242B" />
      <path d={LEFT_EDGE} fill="none" stroke="#F2F4F7" stroke-opacity="0.2" stroke-width="2" />
      <path d={RIGHT_EDGE} fill="none" stroke="#F2F4F7" stroke-opacity="0.2" stroke-width="2" />
      <path d={CENTER_LINE} fill="none" stroke="#F2F4F7" stroke-opacity="0.35" stroke-width="3" stroke-dasharray="16 12" />
      {#if racing && !g.hidden && ahead > 1}
        <path d="M{ghostEdge.left},{g.y} L{ghostEdge.right},{g.y}" fill="none" stroke={GHOST} stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="4 4" />
      {/if}
    </svg>

    {#if ghostSpeed != null && racing}
      <div class="here">
        <span class="g">Bestzeit hier</span>
        <span class="v">{fmtKmh(ghostSpeed)} km/h</span>
      </div>
    {/if}

    <button class="mini" aria-label="Karte groß öffnen" onclick={onmap}>
      <LiveMap position={cur} track={rec.track} route={duel.route.points} ghost={racing ? duel.ghostPos : null} mini />
      <span class="expand" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"></path></svg>
      </span>
    </button>

    <!-- Wer näher an der Kamera ist, wird darüber gezeichnet -->
    {#if racing && !g.hidden}
      <div
        class="fig ghost"
        style:left="{((g.x - (g.h * 40) / 56 / 2) / VIEW_W) * 100}%"
        style:top="{((g.y - g.h * (52 / 56)) / VIEW_H) * 100}%"
        style:width="{(((g.h * 40) / 56) / VIEW_W) * 100}%"
        style:z-index={ahead < 0 ? 3 : 1}
      >
        <Figure variant={figure} ghost color={GHOST} />
        <span class="tag gtag" class:right={ahead < 0}>Bestzeit</span>
      </div>
    {/if}
    <div
      class="fig you"
      style:left="{((youX - (YOU_H * 40) / 56 / 2) / VIEW_W) * 100}%"
      style:top="{((YOU_FEET_Y - YOU_H * (52 / 56)) / VIEW_H) * 100}%"
      style:width="{(((YOU_H * 40) / 56) / VIEW_W) * 100}%"
    >
      <Figure variant={figure} color={YOU} />
      <span class="tag ytag">Du</span>
    </div>
    {#if racing && g.hidden && ahead < 0}
      <span class="behind">Bestzeit {fmtInt(-ahead)} m hinter dir</span>
    {/if}
    {#if racing && !duel.onRoute}
      <span class="offroute" role="status">Strecke verlassen · das Duell läuft weiter, sobald du zurück bist</span>
    {/if}
  </div>

  <section class="progress">
    <div class="labels">
      <span>{fmtKm(duel.along)} km gefahren</span>
      <span>noch {fmtKm(remaining)} km</span>
    </div>
    <div class="bar">
      <div class="fill" style:width={pct(duel.along)}></div>
      {#if racing}<div class="ghostmark" style:left={pct(duel.ghostAlong)}></div>{/if}
    </div>
  </section>

  <section class="tiles">
    <div class="tile">
      <div class="head">
        <span class="label">Tempo</span>
        {#if ghostSpeed != null && racing}<span class="bz">BZ {fmtKmh(ghostSpeed)}</span>{/if}
      </div>
      <span class="val">{fmtKmh(cur?.speed)} <small>km/h</small></span>
    </div>
    <div class="tile">
      <div class="head">
        <span class="label">Fahrzeit</span>
        {#if ghostTime != null && racing}<span class="bz">BZ {fmtDuration(ghostTime)}</span>{/if}
      </div>
      <span class="val">{fmtDuration(racing ? duel.time : 0)}</span>
    </div>
    <div class="tile">
      <span class="label">Distanz</span>
      <span class="val">{fmtKm(duel.along)} <small>km</small></span>
    </div>
    <div class="tile">
      <span class="label">Höhe (GPS)</span>
      <span class="val">{fmtInt(rec.lastRaw?.alt)} <small>m</small></span>
    </div>
  </section>

  <div class="pause" class:paused={cur && !cur.moving}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M10 9v6M14 9v6"></path></svg>
    <span>{cur && !cur.moving ? 'Pausiert · Ghost wartet mit' : 'Auto-Pause aktiv · Ampelstopps zählen nicht'}</span>
  </div>

  {#if rec.error}
    <p class="error" role="alert">{rec.error}</p>
  {/if}

  <button class="stop" onclick={onstop}>Duell beenden</button>
</div>

<style>
  .screen {
    max-width: 480px;
    margin: 0 auto;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: max(20px, env(safe-area-inset-top)) 20px 8px;
    min-height: 44px;
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

  .gap {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 20px 10px;
  }
  .main,
  .side {
    display: flex;
    flex-direction: column;
  }
  .side {
    align-items: flex-end;
    gap: 6px;
    padding-bottom: 6px;
    text-align: right;
  }
  .kicker {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .meters {
    font-family: var(--font-num);
    font-size: 64px;
    font-weight: 700;
    line-height: 0.95;
    font-variant-numeric: tabular-nums;
  }
  .secs {
    font-family: var(--font-num);
    font-size: 32px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .trend {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .trend.muted {
    color: var(--muted);
    font-weight: 500;
  }

  .race {
    position: relative;
    margin: 0 12px;
    aspect-ratio: 366 / 300;
    border-radius: 20px;
    overflow: hidden;
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .road {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .here {
    position: absolute;
    left: 12px;
    top: 12px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    background: rgba(13, 15, 18, 0.78);
    font-size: 13px;
  }
  .here .g {
    color: var(--ghost);
    font-weight: 600;
  }
  .here .v {
    font-family: var(--font-num);
    font-size: 17px;
    font-weight: 600;
  }
  .mini {
    position: absolute;
    right: 10px;
    top: 10px;
    z-index: 4;
    width: 104px;
    height: 104px;
    padding: 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1.5px solid #2e333b;
    background: #12151a;
    cursor: pointer;
  }
  .expand {
    position: absolute;
    right: 5px;
    bottom: 5px;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: rgba(13, 15, 18, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c9d0d9;
  }
  .fig {
    position: absolute;
    z-index: 2;
    /* Zwischen zwei GPS-Punkten gleitet der Ghost, statt zu springen */
    transition:
      left 1s linear,
      top 1s linear,
      width 1s linear;
  }
  .tag {
    position: absolute;
    top: 30%;
    white-space: nowrap;
    border-radius: 8px;
    font-size: 12px;
  }
  .gtag {
    right: calc(100% + 6px);
    padding: 3px 8px;
    border: 1.5px dashed var(--ghost);
    background: rgba(13, 15, 18, 0.7);
    color: var(--ghost);
    font-weight: 600;
  }
  .gtag.right {
    right: auto;
    left: calc(100% + 6px);
  }
  .ytag {
    left: calc(100% + 6px);
    padding: 3px 9px;
    background: var(--you);
    color: var(--bg);
    font-weight: 700;
  }
  .behind,
  .offroute {
    position: absolute;
    left: 12px;
    right: 12px;
    z-index: 5;
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
    top: 50%;
    transform: translateY(-50%);
    color: var(--text);
    border: 1.5px solid var(--rec);
  }

  .progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 20px 4px;
  }
  .labels {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--muted);
  }
  .bar {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: var(--line);
  }
  .fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 8px;
    border-radius: 4px;
    background: var(--you);
  }
  .ghostmark {
    position: absolute;
    top: -4px;
    width: 4px;
    height: 16px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--ghost);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 12px 0;
  }
  .tile {
    background: var(--surface);
    border-radius: 16px;
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .bz {
    font-size: 12px;
    font-weight: 600;
    color: var(--ghost);
    white-space: nowrap;
  }
  .val {
    font-family: var(--font-num);
    font-size: 42px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  small {
    font-family: var(--font-text);
    font-size: 17px;
    font-weight: 500;
    color: var(--muted);
  }
  .pause {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 20px 12px;
    font-size: 13px;
    color: var(--muted);
  }
  .pause.paused {
    color: var(--ghost);
    font-weight: 600;
  }
  .error {
    margin: 0 12px 10px;
    padding: 10px 14px;
    border-radius: 14px;
    background: #2a1414;
    color: #ffb4ae;
  }
  .stop {
    margin: 0 12px;
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
