<script lang="ts">
  import { onMount } from 'svelte';
  import { account } from '../account/account.svelte.ts';
  import { fmtDuration, fmtKm } from '../format.ts';
  import { myLinks, revokeLink, type GhostLink } from './challenges.ts';

  /** Geteilte Challenge-Links zurückziehen und Strava verbinden (E11, E18-3). */

  let links = $state.raw<GhostLink[] | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  onMount(() => {
    void myLinks()
      .then((l) => (links = l))
      .catch(() => (links = null));
  });

  async function revoke(l: GhostLink) {
    if (!confirm(`Challenge „${l.name}“ zurückziehen? Der Link funktioniert dann nicht mehr.`)) return;
    try {
      await revokeLink(l.code);
      links = (links ?? []).filter((x) => x.code !== l.code);
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function disconnect() {
    busy = true;
    try {
      await account.disconnectStrava();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<section class="sharing">
  <h2>Geteilte Challenges</h2>
  {#if links?.length}
    {#each links as l (l.code)}
      <div class="item">
        <span>
          <strong>{l.name}</strong>
          <small>{fmtKm(l.length)} km · {fmtDuration(l.time)} · {l.views}× geöffnet</small>
        </span>
        <button class="link" onclick={() => revoke(l)}>Zurückziehen</button>
      </div>
    {/each}
  {:else if links}
    <p>Noch nichts geteilt. Nach einer Fahrt findest du „Challenge me“ in der Auswertung.</p>
  {/if}

  {#if account.strava}
    <h2>Strava</h2>
    {#if account.user?.strava}
      <p>Verbunden. Fahrten lädst du in der Auswertung mit einem Tipp hoch, mit Challenge-Link in der Beschreibung.</p>
      <button class="secondary" disabled={busy} onclick={disconnect}>Strava trennen</button>
    {:else}
      <p>Lade Fahrten zu Strava hoch. Deine Strava-Freunde sehen den Challenge-Link in der Beschreibung.</p>
      <button class="secondary strava" onclick={() => account.connectStrava()}>Mit Strava verbinden</button>
    {/if}
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</section>

<style>
  .sharing {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--surface);
  }
  .item span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  small {
    color: var(--muted);
    font-size: 13px;
  }
  .link {
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 14px;
    text-decoration: underline;
    cursor: pointer;
  }
  .strava {
    color: #fc4c02 !important;
  }
</style>
