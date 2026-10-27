<script lang="ts">
  import { bikeInfo, suspiciousReasons, type AdminRide } from '@rechase/core';
  import { fmtDate, fmtDuration, fmtInt, fmtKm } from '../format.ts';
  import { REASON_LABELS } from './adminApi.ts';

  let {
    rides,
    showUser = false,
    empty = 'Noch keine Fahrten.',
    onopen,
  }: { rides: AdminRide[]; showUser?: boolean; empty?: string; onopen: (id: string) => void } =
    $props();
</script>

{#if rides.length}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>Start</th>
          {#if showUser}<th>Tester</th>{/if}
          <th class="num">km</th>
          <th class="num">Bewegt</th>
          <th class="num">Pausen</th>
          <th class="num">Lücken</th>
          <th class="num">Verworfen</th>
          <th class="num">GPS ±</th>
          <th>Rad</th>
          <th>Strecke / Duell</th>
          <th>Gerät</th>
          <th>Hinweise</th>
        </tr>
      </thead>
      <tbody>
        {#each rides as r (r.id)}
          {@const s = r.summary}
          <tr class="link" onclick={() => onopen(r.id)}>
            <td><a href="#/fahrt/{r.id}" onclick={(e) => e.stopPropagation()}>{fmtDate(r.startedAt)}</a></td>
            {#if showUser}<td>{r.userName ?? '–'}</td>{/if}
            <td class="num">{fmtKm(s.distance)}</td>
            <td class="num">{fmtDuration(s.movingTime)}</td>
            <td class="num">{s.stops} · {fmtDuration(s.pausedTime)}</td>
            <td class="num">{s.gaps}</td>
            <td class="num">{s.rejected}</td>
            <td class="num">{fmtInt(s.accuracy)} m</td>
            <td>{s.bike ? bikeInfo(s.bike).label : '–'}</td>
            <td>
              {s.routeName ?? '–'}{#if s.duel}
                · <span class="tag" class:ok={s.duel.won}>{s.duel.won ? 'gewonnen' : s.duel.finished ? 'verloren' : 'abgebrochen'}</span>
              {/if}
            </td>
            <td>{s.device.model} · {s.device.browser}</td>
            <td>
              {#each suspiciousReasons(s) as why (why)}
                <span class="tag warn">{REASON_LABELS[why]}</span>
              {/each}
              {#if s.appealed}<span class="tag">Widerspruch</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <p>{empty}</p>
{/if}
