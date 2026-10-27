<script lang="ts">
  import { bikeInfo, CHASER_NAME, normalizeChaserName } from '@rechase/core';
  import { account } from './account.svelte.ts';
  import BikePicker from './BikePicker.svelte';
  import './forms.css';

  let { onclose }: { onclose: () => void } = $props();

  const user = $derived(account.user);
  let name = $state(account.user?.name ?? '');
  let error = $state<string | null>(null);
  let saved = $state<string | null>(null);
  let busy = $state(false);

  async function run(fn: () => Promise<void>, ok?: string) {
    busy = true;
    error = null;
    saved = null;
    try {
      await fn();
      saved = ok ?? null;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function saveName(e: SubmitEvent) {
    e.preventDefault();
    const n = normalizeChaserName(name);
    if ('error' in n) {
      error = n.error;
      return;
    }
    void run(() => account.update({ name: n.name }), 'Name gespeichert.');
  }

  async function logout() {
    await run(() => account.logout());
    if (!account.user) onclose();
  }

  async function remove() {
    if (
      !confirm(
        'Konto und alle Daten auf dem Server endgültig löschen? Deine Fahrten auf diesem Gerät bleiben erhalten.',
      )
    )
      return;
    await run(() => account.remove());
    if (!account.user) onclose();
  }
</script>

<div class="screen">
  <button class="back" onclick={onclose}>‹ Zurück</button>
  <h1>Profil</h1>
  {#if user}
    <p>
      Angemeldet als {user.email ?? 'Google-Konto'}{user.providers.includes('google') ? ' · mit Google verknüpft' : ''}
    </p>

    <form onsubmit={saveName}>
      <label>
        Chaser-Name
        <input autocomplete="nickname" maxlength={CHASER_NAME.max} required bind:value={name} />
      </label>
      <button class="secondary" type="submit" disabled={busy || name.trim() === user.name}>Name speichern</button>
    </form>

    <h2>Standardrad{user.bike ? ` · ${bikeInfo(user.bike).label}` : ''}</h2>
    <BikePicker
      value={user.bike}
      onchange={(b) =>
        void run(async () => {
          await account.update({ bike: b });
          account.setBike(b);
        }, 'Standardrad gespeichert.')}
    />

    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if saved}
      <p role="status">{saved}</p>
    {/if}

    <h2>Konto</h2>
    <button class="secondary" disabled={busy} onclick={logout}>Abmelden</button>
    <button class="textlink danger" disabled={busy} onclick={remove}>Konto löschen</button>
  {/if}
</div>

<style>
  .danger {
    color: #ffb4ae;
  }
</style>
