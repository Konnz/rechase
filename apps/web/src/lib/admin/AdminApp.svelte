<script lang="ts">
  import type { AdminRide, AdminTester, FieldTestStats, RideUpload } from '@rechase/core';
  import { onMount } from 'svelte';
  import { api } from '../api.ts';
  import type { AccountUser } from '../account/account.svelte.ts';
  import { adminApi } from './adminApi.ts';
  import Dashboard from './Dashboard.svelte';
  import RideDetail from './RideDetail.svelte';
  import TesterView from './TesterView.svelte';
  import './admin.css';

  /**
   * Adminbereich unter /admin (E22-3 bis E22-6). Eigener Einstieg, damit die Fahr-App ihn nicht mitlädt.
   * Navigation über den Hash: #/ Dashboard, #/tester/<id>, #/fahrt/<id>.
   */

  type View =
    | { kind: 'dashboard'; stats: FieldTestStats; testers: AdminTester[]; rides: AdminRide[] }
    | { kind: 'tester'; tester: AdminTester | null; rides: AdminRide[] }
    | { kind: 'ride'; ride: AdminRide; data: RideUpload };

  let user = $state<AccountUser | null>(null);
  let checked = $state(false);
  let view = $state.raw<View | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let testers: AdminTester[] = [];

  const path = () => location.hash.replace(/^#/, '') || '/';

  function open(p: string) {
    location.hash = p;
  }

  async function route() {
    const p = path();
    loading = true;
    error = null;
    try {
      const tester = /^\/tester\/([\w-]+)$/.exec(p)?.[1];
      const ride = /^\/fahrt\/([\w-]+)$/.exec(p)?.[1];
      if (ride) {
        view = { kind: 'ride', ...(await adminApi.ride(ride)) };
      } else if (tester) {
        const [list, rides] = await Promise.all([testers.length ? testers : adminApi.testers(), adminApi.rides(tester)]);
        testers = list;
        view = { kind: 'tester', tester: list.find((t) => t.id === tester) ?? null, rides };
      } else {
        const [stats, list, rides] = await Promise.all([adminApi.stats(), adminApi.testers(), adminApi.rides()]);
        testers = list;
        view = { kind: 'dashboard', stats, testers: list, rides };
      }
      scrollTo(0, 0);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void (async () => {
      try {
        user = (await api<{ user: AccountUser | null }>('GET', '/api/me')).user;
      } catch (err) {
        error = (err as Error).message;
      }
      checked = true;
      if (user?.admin) await route();
    })();
    const onHash = () => user?.admin && void route();
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });
</script>

<div class="admin">
  <nav>
    <a class="brand" href="#/">re:chase <span>Admin · Feldtest</span></a>
    <a class="app" href="/">Zur App</a>
  </nav>

  {#if !checked}
    <p>Lade …</p>
  {:else if !user}
    <p>Bitte zuerst <a href="/">in der App anmelden</a>, dann diese Seite neu laden.</p>
  {:else if !user.admin}
    <p>Dein Konto ({user.email ?? 'ohne E-Mail'}) hat keinen Zugang zum Adminbereich.</p>
  {:else}
    {#if view && view.kind !== 'dashboard'}
      <button class="back" onclick={() => history.back()}>‹ Zurück</button>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    {#if loading && !view}
      <p>Lade …</p>
    {:else if view?.kind === 'dashboard'}
      <p class="privacy">
        Einzelne Fahrten sind nur während des Feldtests und nur von Testern mit Einwilligung sichtbar. Danach zeigt
        dieser Bereich nur noch zusammengefasste Zahlen.
      </p>
      <Dashboard stats={view.stats} testers={view.testers} rides={view.rides} onopen={open} />
    {:else if view?.kind === 'tester'}
      <TesterView tester={view.tester} rides={view.rides} onopen={open} />
    {:else if view?.kind === 'ride'}
      {#key view.ride.id}
        <RideDetail ride={view.ride} data={view.data} onopen={open} />
      {/key}
    {/if}
  {/if}
</div>

<style>
  nav {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .brand {
    font-size: 20px;
    font-weight: 700;
    text-decoration: none;
  }
  .brand span {
    color: var(--muted);
    font-weight: 400;
    font-size: 15px;
  }
  .app {
    color: var(--muted) !important;
    font-size: 14px;
  }
  .privacy {
    font-size: 13px;
  }
</style>
