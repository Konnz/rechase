<script lang="ts">
  import { bikeInfo, type AdminRide, type AdminTester } from '@rechase/core';
  import { fmtDay, fmtKm } from '../format.ts';
  import RidesTable from './RidesTable.svelte';

  let { tester, rides, onopen }: { tester: AdminTester | null; rides: AdminRide[]; onopen: (path: string) => void } =
    $props();
</script>

<h1>{tester?.name ?? 'Tester'}</h1>
{#if tester}
  <p>
    {tester.email ?? 'ohne E-Mail'} · {tester.bike ? bikeInfo(tester.bike).label : 'kein Rad'} · {tester.device ?? 'Gerät unbekannt'}
    · dabei seit {fmtDay(tester.createdAt)} · {tester.rides} Fahrten, {fmtKm(tester.distance)} km
  </p>
{/if}
<section class="panel">
  <h2>Fahrten</h2>
  <RidesTable {rides} onopen={(id) => onopen(`/fahrt/${id}`)} />
</section>
