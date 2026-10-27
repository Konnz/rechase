<script lang="ts">
  import { bikeInfo, checkPlausibility, suspiciousReasons, type AdminRide, type RideUpload } from '@rechase/core';
  import type { StoredRide } from '../db.ts';
  import { download, toCsv, toGpx } from '../export.ts';
  import { fmtDate, fmtDuration, fmtGapSeconds, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import { analyzeRide, sampleAt } from './analysis.ts';
  import { REASON_LABELS } from './adminApi.ts';
  import RideMap from './RideMap.svelte';
  import TimeChart from './TimeChart.svelte';

  let { ride, data, onopen }: { ride: AdminRide; data: RideUpload; onopen: (path: string) => void } = $props();

  const s = $derived(ride.summary);
  const a = $derived(analyzeRide(data));
  const check = $derived(checkPlausibility(data.samples, data.bike));
  let hoverT = $state<number | null>(null);
  const hover = $derived(hoverT == null ? null : sampleAt(data.samples, hoverT));

  const speed = $derived(data.samples.map((p) => ({ t: p.t, v: p.speed * 3.6 })));
  const accuracy = $derived(data.raw.map((p) => ({ t: p.t, v: p.accuracy })));
  const gapBands = $derived(a.gaps.map((g) => ({ from: g.from.t, to: g.to.t })));

  const clock = (t: number) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const stamp = $derived(new Date(ride.startedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-'));
  const base = $derived(`rechase-${(ride.userName ?? 'tester').replace(/\W+/g, '_')}-${stamp}`);
  const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  // Die Exporte der App erwarten eine lokale Fahrt; die hochgeladene hat dieselben Felder
  const asStored = $derived(data as unknown as StoredRide);
</script>

<header class="head">
  <div>
    <h1>{fmtDate(ride.startedAt)}{s.complete ? '' : ' · nicht beendet'}</h1>
    <p>
      <a href="#/tester/{ride.userId}" onclick={(e) => (e.preventDefault(), onopen(`/tester/${ride.userId}`))}>
        {ride.userName ?? 'Tester'}
      </a>
      · {s.device.model} · {s.device.os} · {s.device.browser} · {s.bike ? bikeInfo(s.bike).label : 'kein Rad'}
      {data.altitudeRef === 'ellipsoid' ? '· Höhe über Ellipsoid' : ''}
    </p>
  </div>
  <div class="dl">
    <button class="btn" onclick={() => download(`${base}.gpx`, toGpx(asStored), 'application/gpx+xml')}>GPX</button>
    <button class="btn" onclick={() => download(`${base}.csv`, toCsv(asStored), 'text/csv')}>CSV</button>
  </div>
</header>

<section class="tiles">
  <div class="tile"><span class="label">Distanz</span><span class="val">{fmtKm(s.distance)} <small>km</small></span></div>
  <div class="tile">
    <span class="label">Bewegt</span><span class="val">{fmtDuration(s.movingTime)}</span>
    <span class="sub">Ø {fmtKmh(s.movingTime ? s.distance / (s.movingTime / 1000) : null)} km/h</span>
  </div>
  <div class="tile">
    <span class="label">Pausen</span><span class="val">{s.stops}</span>
    <span class="sub">{fmtDuration(s.pausedTime)} gesamt</span>
  </div>
  <div class="tile">
    <span class="label">Lücken</span><span class="val">{s.gaps}</span>
    <span class="sub">App verlassen {s.hidden}×</span>
  </div>
  <div class="tile">
    <span class="label">Punkte</span><span class="val">{fmtInt(s.points)}</span>
    <span class="sub">{s.rejected} verworfen</span>
  </div>
  <div class="tile">
    <span class="label">GPS ±</span><span class="val">{s.accuracy == null ? '–' : nf1.format(s.accuracy)} <small>m</small></span>
  </div>
  <div class="tile">
    <span class="label">Akku</span>
    <span class="val">{s.batteryPerHour == null ? '–' : nf1.format(s.batteryPerHour)} <small>%/h</small></span>
    <span class="sub">
      {#if data.battery}
        {fmtInt(data.battery.start * 100)} → {data.battery.end == null ? '–' : fmtInt(data.battery.end * 100)} %{data.battery.charging
          ? ' · lädt'
          : ''}
      {:else}
        nicht messbar
      {/if}
    </span>
  </div>
  {#if data.route || data.duel}
    <div class="tile">
      <span class="label">{data.route?.name ?? 'Duell'}</span>
      {#if data.duel}
        <span class="val">{data.duel.time == null ? '–' : fmtDuration(data.duel.time)}</span>
        <span class="sub">
          gegen {data.duel.opponent} {fmtDuration(data.duel.opponentTime)}{data.duel.time != null
            ? ` · ${data.duel.time < data.duel.opponentTime ? '−' : '+'}${fmtGapSeconds((data.duel.time - data.duel.opponentTime) / 1000)}`
            : ' · nicht im Ziel'}
        </span>
      {:else if data.route}
        <span class="val">{data.route.time == null ? '–' : fmtDuration(data.route.time)}</span>
        <span class="sub">Bestzeit {fmtDuration(data.route.bestTime)}{data.route.isBest ? ' · ist die Bestzeit' : ''}</span>
      {/if}
    </div>
  {/if}
</section>

{#if suspiciousReasons(s).length || s.appealed}
  <section class="panel notes">
    {#each suspiciousReasons(s) as why (why)}<span class="tag warn">{REASON_LABELS[why]}</span>{/each}
    {#if s.appealed}<span class="tag">Fahrer hat widersprochen</span>{/if}
    {#each check.flags as f (f.rule)}
      <p>{clock(f.t)}: {f.message}</p>
    {/each}
  </section>
{/if}

<section class="mapbox">
  <RideMap samples={data.samples} analysis={a} {hover} />
</section>
<p class="legend">
  <span class="sw you"></span> in Bewegung
  <span class="sw drift"></span> im Stand (Drift)
  <span class="sw gap"></span> Empfangslücke
  <span class="sw pause"></span> Pause mit Dauer
  <span class="sw rej"></span> verworfener Punkt
</p>

<section class="panel charts">
  <TimeChart points={speed} label="Tempo" unit="km/h" color="#ff7a1a" digits={1} pauses={a.pauses} gaps={gapBands} bind:hoverT />
  <TimeChart points={accuracy} label="GPS-Genauigkeit" unit="m" color="#a9c1ff" pauses={a.pauses} gaps={gapBands} bind:hoverT />
</section>

{#if a.pauses.length}
  <section class="panel">
    <h2>Pausen</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Von</th><th>Bis</th><th class="num">Dauer</th></tr></thead>
        <tbody>
          {#each a.pauses as p (p.from)}
            <tr onpointerenter={() => (hoverT = p.from)} onpointerleave={() => (hoverT = null)}>
              <td>{clock(p.from)}</td>
              <td>{clock(p.to)}</td>
              <td class="num">{fmtDuration(p.to - p.from)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    align-items: flex-start;
  }
  .dl {
    display: flex;
    gap: 8px;
  }
  .mapbox {
    height: min(60vh, 560px);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    font-size: 13px;
  }
  .sw {
    display: inline-block;
    width: 18px;
    height: 4px;
    margin-right: -8px;
    border-radius: 2px;
  }
  .sw.you {
    background: var(--you);
  }
  .sw.drift {
    background: #5b6370;
  }
  .sw.gap {
    background: repeating-linear-gradient(90deg, var(--rec) 0 4px, transparent 4px 7px);
  }
  .sw.pause {
    width: 14px;
    height: 10px;
    border-radius: 5px;
    background: var(--ghost);
  }
  .sw.rej {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--muted);
  }
  .charts {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .notes {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
</style>
