<script lang="ts">
  import { bikeInfo, type AdminRide, type AdminTester, type FieldTestStats, type Share } from '@rechase/core';
  import { fmtDate, fmtDay, fmtDuration, fmtInt, fmtKm } from '../format.ts';
  import Bars from './Bars.svelte';
  import RidesTable from './RidesTable.svelte';

  let {
    stats,
    testers,
    rides,
    onopen,
  }: {
    stats: FieldTestStats;
    testers: AdminTester[];
    rides: AdminRide[];
    onopen: (path: string) => void;
  } = $props();

  const pct = (x: number | null) => (x == null ? '–' : `${fmtInt(x * 100)} %`);
  const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  const weekLabel = (t: number) => fmtDay(t);
</script>

<section class="tiles" aria-label="Kennzahlen">
  <div class="tile">
    <span class="label">Tester</span>
    <span class="val">{stats.testers}</span>
    <span class="sub">eingewilligt</span>
  </div>
  <div class="tile">
    <span class="label">Aktiv</span>
    <span class="val">{stats.activeTesters}</span>
    <span class="sub">letzte 7 Tage</span>
  </div>
  <div class="tile">
    <span class="label">Fahrten</span>
    <span class="val">{stats.rides}</span>
    <span class="sub">{fmtDuration(stats.movingTime)} bewegt</span>
  </div>
  <div class="tile">
    <span class="label">Distanz</span>
    <span class="val">{fmtInt(stats.distance / 1000)} <small>km</small></span>
  </div>
  <div class="tile">
    <span class="label">Duelle</span>
    <span class="val">{stats.duels}</span>
    <span class="sub">Siegquote {pct(stats.duels ? stats.duelsWon / stats.duels : null)}</span>
  </div>
  <div class="tile">
    <span class="label">Mit Lücken</span>
    <span class="val">{pct(stats.gapShare)}</span>
    <span class="sub">der Fahrten</span>
  </div>
  <div class="tile">
    <span class="label">GPS ±</span>
    <span class="val">{stats.accuracy == null ? '–' : nf1.format(stats.accuracy)} <small>m</small></span>
    <span class="sub">Mittel aller Punkte</span>
  </div>
  <div class="tile">
    <span class="label">Akku</span>
    <span class="val">{stats.batteryPerHour == null ? '–' : nf1.format(stats.batteryPerHour)} <small>%/h</small></span>
    <span class="sub">aus {stats.batteryRides} {stats.batteryRides === 1 ? 'Fahrt' : 'Fahrten'}</span>
  </div>
</section>

<section class="cols">
  <div class="panel">
    <Bars label="Aktive Tester pro Woche" items={stats.weeks.map((w) => ({ label: weekLabel(w.start), value: w.activeTesters }))} />
  </div>
  <div class="panel">
    <Bars label="Fahrten pro Woche" items={stats.weeks.map((w) => ({ label: weekLabel(w.start), value: w.rides }))} />
  </div>
  <div class="panel">
    <Bars
      label="Kilometer pro Woche"
      items={stats.weeks.map((w) => ({ label: weekLabel(w.start), value: w.distance / 1000 }))}
    />
  </div>
</section>

{#snippet split(title: string, list: Share[])}
  <div class="panel">
    <h2>{title}</h2>
    {#if list.length}
      <table>
        <tbody>
          {#each list as s (s.label)}
            <tr>
              <td>{s.label}</td>
              <td class="share"><span style:width="{(s.rides / stats.rides) * 100}%"></span></td>
              <td class="num">{s.rides}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p>Noch keine Fahrten.</p>
    {/if}
  </div>
{/snippet}

<section class="cols">
  {@render split('Gerät', stats.byDevice)}
  {@render split('Browser', stats.byBrowser)}
  {@render split('System', stats.byOs)}
</section>

<section class="panel">
  <h2>Tester</h2>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>E-Mail</th>
          <th>Rad</th>
          <th>Gerät</th>
          <th class="num">Fahrten</th>
          <th class="num">km</th>
          <th>Letzte Fahrt</th>
          <th>Einwilligung</th>
        </tr>
      </thead>
      <tbody>
        {#each testers as t (t.id)}
          <tr class="link" onclick={() => onopen(`/tester/${t.id}`)}>
            <td><a href="#/tester/{t.id}" onclick={(e) => e.stopPropagation()}>{t.name ?? '(ohne Namen)'}</a></td>
            <td>{t.email ?? '–'}</td>
            <td>{t.bike ? bikeInfo(t.bike).label : '–'}</td>
            <td>{t.device ?? '–'}</td>
            <td class="num">{t.rides}</td>
            <td class="num">{fmtKm(t.distance)}</td>
            <td>{t.lastRide ? fmtDate(t.lastRide) : '–'}</td>
            <td>
              {#if t.consentAt}{fmtDay(t.consentAt)}{:else}<span class="tag warn">zurückgezogen</span>{/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="8">Noch niemand hat eingewilligt.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<section class="panel">
  <h2>Auffällige Fahrten</h2>
  <RidesTable rides={stats.suspicious.map((s) => s.ride)} empty="Nichts Auffälliges." showUser onopen={(id) => onopen(`/fahrt/${id}`)} />
</section>

<section class="panel">
  <h2>Letzte Fahrten</h2>
  <RidesTable rides={rides.slice(0, 30)} showUser onopen={(id) => onopen(`/fahrt/${id}`)} />
</section>

<style>
  .share {
    width: 40%;
  }
  .share span {
    display: block;
    height: 10px;
    min-width: 2px;
    border-radius: 0 4px 4px 0;
    background: var(--ghost);
  }
</style>
