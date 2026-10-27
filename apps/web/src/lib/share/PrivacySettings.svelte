<script lang="ts">
  import { PRIVACY_TRIM, ZONE_RADIUS } from '@rechase/core';
  import { fmtInt } from '../format.ts';
  import { privacyPrefs } from './privacy.svelte.ts';

  /** Privatzonen (E11-6) im Profil und im Onboarding: zufällige Kürzung und feste Zonen wie Zuhause. */

  const RADII = [200, 300, 500, 800, 1000, 1500];
  let name = $state('Zuhause');
  let radius = $state(ZONE_RADIUS.default);
  let busy = $state(false);
  let error = $state<string | null>(null);

  function addHere() {
    if (!navigator.geolocation) {
      error = 'Dieses Gerät kennt seinen Standort nicht.';
      return;
    }
    busy = true;
    error = null;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        privacyPrefs.addZone({
          name: name.trim() || 'Zone',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          // Ungenauer Standort: Zone entsprechend größer
          radius: radius + Math.min(pos.coords.accuracy, 200),
        });
        name = privacyPrefs.zones.some((z) => z.name === 'Arbeit') ? '' : 'Arbeit';
        busy = false;
      },
      () => {
        error = 'Kein Standort. Bitte die Freigabe erlauben und noch einmal versuchen.';
        busy = false;
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }
</script>

<section class="privacy">
  <h2>Privatzonen</h2>
  <p>
    Bevor eine Fahrt das Gerät verlässt (Challenge-Link, Teilbild), werden Start und Ende gekürzt, damit niemand sieht,
    wo du wohnst. Zonen und echter Start bleiben auf diesem Gerät.
  </p>
  <label class="check">
    <input type="checkbox" checked={privacyPrefs.trim} onchange={(e) => (privacyPrefs.trim = e.currentTarget.checked)} />
    Start und Ende zufällig um {PRIVACY_TRIM.min}–{PRIVACY_TRIM.max} m kürzen
  </label>
  {#if !privacyPrefs.trim}
    <p class="warn">Aus: Geteilte Fahrten zeigen, wo du losfährst, außer in deinen festen Zonen.</p>
  {/if}

  {#each privacyPrefs.zones as z (z.id)}
    <div class="zone">
      <span><strong>{z.name}</strong> · {fmtInt(z.radius)} m</span>
      <button class="link" onclick={() => privacyPrefs.removeZone(z.id)}>Entfernen</button>
    </div>
  {/each}

  <div class="add">
    <input aria-label="Name der Zone" placeholder="z. B. Zuhause" maxlength="30" bind:value={name} />
    <select aria-label="Radius" bind:value={radius}>
      {#each RADII as r (r)}
        <option value={r}>{r} m</option>
      {/each}
    </select>
  </div>
  <button class="secondary" disabled={busy} onclick={addHere}>
    {busy ? 'Suche Standort …' : 'Aktuellen Standort als feste Zone'}
  </button>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
</section>

<style>
  .privacy {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .check {
    flex-direction: row !important;
    align-items: center;
    gap: 10px !important;
    font-size: 15px !important;
    color: var(--text) !important;
  }
  .check input {
    width: 22px;
    height: 22px;
  }
  .warn {
    color: #ffb4ae !important;
    font-size: 13px !important;
  }
  .zone {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--surface);
  }
  .add {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
  select {
    height: 52px;
    padding: 0 10px;
    border-radius: 14px;
    border: 1.5px solid var(--line);
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .link {
    border: 0;
    background: none;
    color: var(--muted);
    font-size: 14px;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
