<script lang="ts">
  import { uploader } from '../upload.svelte.ts';
  import { account } from './account.svelte.ts';

  /**
   * Einwilligung in den Feldtest (E22-1). compact: als Karte auf der Startseite mit „Später“,
   * sonst als Abschnitt im Profil mit Stand des Uploads und Widerruf.
   */
  let { compact = false, ondismiss }: { compact?: boolean; ondismiss?: () => void } = $props();

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function set(yes: boolean) {
    if (
      !yes &&
      !confirm('Einwilligung zurückziehen? Es werden keine Fahrten mehr hochgeladen, und alle schon hochgeladenen werden gelöscht.')
    )
      return;
    busy = true;
    error = null;
    try {
      await uploader.consent(yes);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  const user = $derived(account.user);
</script>

{#if user}
  <section class="fieldtest" class:compact>
    <h2>Feldtest</h2>
    {#if user.testConsent}
      <p>
        Du machst mit: Deine Fahrten gehen nach dem Beenden automatisch an das re:chase-Team.
        {#if uploader.busy}
          Lade hoch …
        {:else if uploader.pending}
          {uploader.pending} {uploader.pending === 1 ? 'Fahrt wartet' : 'Fahrten warten'} auf Netz.
        {:else}
          {user.uploadedRides} {user.uploadedRides === 1 ? 'Fahrt' : 'Fahrten'} hochgeladen.
        {/if}
      </p>
      {#if uploader.error}
        <p class="error" role="alert">{uploader.error}</p>
      {/if}
      <button class="textlink" disabled={busy} onclick={() => set(false)}>Einwilligung zurückziehen</button>
    {:else}
      <p>
        Hilf mit, re:chase auf echten Fahrten zu verbessern. Wenn du einwilligst, gehen deine Fahrten nach dem Beenden
        automatisch an den Server, auch die, die schon auf diesem Gerät liegen: GPS-Punkte mit Zeit, Tempo und
        Genauigkeit, Pausen, Empfangslücken, Duell-Ergebnisse, Rad, Gerät, Browser und Akkustand.
      </p>
      <p>
        Das re:chase-Team kann jede Fahrt auf der Karte ansehen. Die Daten dienen nur dem Test und werden danach gelöscht.
        Du kannst jederzeit im Profil widerrufen, dann löschen wir alle hochgeladenen Fahrten sofort.
      </p>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
      <button class="primary" disabled={busy} onclick={() => set(true)}>Ich mache mit</button>
      {#if compact && ondismiss}
        <button class="textlink" disabled={busy} onclick={ondismiss}>Später</button>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .fieldtest {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .compact {
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--surface);
    border: 1.5px dashed var(--ghost);
  }
  h2 {
    margin: 10px 0 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
  }
  .compact h2 {
    margin: 0;
    color: var(--ghost);
  }
  p {
    margin: 0;
    color: var(--muted);
    font-size: 15px;
    line-height: 1.4;
  }
  .compact p {
    font-size: 14px;
    color: var(--text);
  }
  .error {
    padding: 10px 14px;
    border-radius: 14px;
    background: #2a1414;
    color: #ffb4ae;
  }
  .primary {
    height: 52px;
    border: 0;
    border-radius: 14px;
    background: var(--you);
    color: var(--bg);
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
  }
  .textlink {
    align-self: center;
    padding: 8px;
    border: 0;
    background: none;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
