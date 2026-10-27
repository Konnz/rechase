<script lang="ts">
  import { CHASER_NAME, normalizeChaserName, type BikeType } from '@rechase/core';
  import { account } from './account.svelte.ts';
  import BikePicker from './BikePicker.svelte';
  import './forms.css';

  let { ondone }: { ondone: () => void } = $props();

  let name = $state(account.user?.name ?? '');
  let bike = $state<BikeType | null>(account.user?.bike ?? account.bike);
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const n = normalizeChaserName(name);
    if ('error' in n) {
      error = n.error;
      return;
    }
    if (!bike) {
      error = 'Bitte wähle dein Standardrad.';
      return;
    }
    busy = true;
    error = null;
    try {
      await account.update({ name: n.name, bike });
      account.setBike(bike);
      ondone();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="acct">
  <h1>Fast startklar</h1>
  <p>Zwei Angaben, dann geht’s los. Beides kannst du später im Profil ändern.</p>

  <form onsubmit={submit}>
    <label>
      Dein Chaser-Name
      <input
        autocomplete="nickname"
        maxlength={CHASER_NAME.max}
        placeholder="z. B. Isarjäger"
        required
        bind:value={name}
      />
    </label>
    <p class="small">So sehen dich andere, wenn du einen Ghost teilst.</p>

    <h2>Dein Standardrad</h2>
    <BikePicker value={bike} onchange={(b) => (bike = b)} />
    <p class="small">
      E-Bikes und S-Pedelecs werden getrennt gewertet, damit Muskelkraft nicht gegen Motor antritt. Vor jeder Fahrt
      kannst du das Rad mit einem Tipp umstellen.
    </p>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <button class="primary" type="submit" disabled={busy}>{busy ? 'Moment …' : 'Los geht’s'}</button>
  </form>
</div>

<style>
  .small {
    font-size: 13px;
  }
</style>
