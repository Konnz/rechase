<script lang="ts">
  import { bikeInfo, ghostSpeedProfile } from '@rechase/core';
  import { onMount } from 'svelte';
  import { account } from '../account/account.svelte.ts';
  import { listChallenges, type StoredChallenge } from '../db.ts';
  import { fmtDuration, fmtInt, fmtKm, fmtKmh } from '../format.ts';
  import SummaryMap from '../summary/SummaryMap.svelte';
  import { fetchChallenge, importChallenge, type RemoteChallenge } from './challenges.ts';

  /**
   * Vorschau eines Challenge-Links (E11-2): Strecke, Zeit und Herausforderer, ohne Konto und ohne Installation.
   * Annehmen legt den Ghost auf dem Gerät ab; gefahren wird wie gegen eine eigene Strecke.
   */
  let {
    code,
    onaccept,
    onrace,
    onaccount,
    onclose,
  }: {
    code: string;
    /** Übernommen, zurück zur Startseite */
    onaccept: (c: StoredChallenge) => void;
    /** Übernommen und gleich losfahren */
    onrace: (c: StoredChallenge) => void;
    onaccount: () => void;
    onclose: () => void;
  } = $props();

  let remote = $state.raw<RemoteChallenge | null>(null);
  let existing = $state.raw<StoredChallenge | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  const profile = $derived(remote ? ghostSpeedProfile(remote.points, remote.ghost) : null);
  const ascent = $derived.by(() => {
    const p = remote?.profile;
    if (!p) return null;
    let up = 0;
    for (let i = 1; i < p.alt.length; i++) up += Math.max(0, p.alt[i]! - p.alt[i - 1]!);
    return up;
  });
  const mine = $derived(!!remote && !!account.user?.name && remote.chaser === account.user.name);

  onMount(() => {
    void Promise.all([fetchChallenge(code), listChallenges().catch(() => [])])
      .then(([r, all]) => {
        remote = r;
        existing = all.find((c) => c.id === r.code) ?? null;
      })
      .catch((e: Error) => {
        // Offline, aber schon übernommen: dann geht es auch ohne Netz
        void listChallenges()
          .then((all) => {
            const c = all.find((x) => x.id === code);
            if (c) onaccept(c);
            else error = e.message;
          })
          .catch(() => (error = e.message));
      });
  });

  async function take(race: boolean) {
    if (!remote) return;
    busy = true;
    try {
      const c = await importChallenge(remote, existing ?? undefined);
      (race ? onrace : onaccept)(c);
    } catch (e) {
      error = (e as Error).message;
      busy = false;
    }
  }
</script>

<div class="screen">
  <header>
    <button class="icon" aria-label="Schließen" onclick={onclose}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </button>
    <div class="title">
      <span class="name">{remote ? `Re: ${remote.name}` : 'Challenge'}</span>
      <span class="sub">{remote ? `von ${remote.chaser}` : 'wird geladen …'}</span>
    </div>
  </header>

  <div class="scroll">
    {#if error}
      <section class="card">
        <span class="headline">Challenge nicht gefunden</span>
        <span class="what">{error}</span>
        <button class="done" onclick={onclose}>Zur App</button>
      </section>
    {:else if remote && profile}
      <div class="mapbox">
        <SummaryMap {profile} />
      </div>

      <section class="card">
        <span class="label">{remote.chaser} fordert dich heraus</span>
        <span class="headline">{fmtDuration(remote.time)}</span>
        <span class="what">
          Bewegungszeit auf {fmtKm(remote.length)} km{remote.bike ? ` · ${bikeInfo(remote.bike).label}` : ''}. Ampelstopps
          zählen nicht: Der Ghost hält mit dir an.
        </span>
      </section>

      <section class="grid">
        <div class="tile">
          <span class="label">Distanz</span>
          <span class="val">{fmtKm(remote.length)} <small>km</small></span>
        </div>
        <div class="tile">
          <span class="label">Ø Tempo</span>
          <span class="val">{fmtKmh(remote.length / (remote.time / 1000))} <small>km/h</small></span>
        </div>
        <div class="tile">
          <span class="label">Höhenmeter</span>
          <span class="val">{fmtInt(ascent)} <small>m</small></span>
        </div>
        <div class="tile">
          <span class="label">Gefahren am</span>
          <span class="val">{new Date(remote.day).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
        </div>
      </section>

      <section class="actions">
        {#if mine}
          <span class="note">Das ist dein eigener Ghost. So sehen ihn die anderen.</span>
        {/if}
        <button class="cta" disabled={busy} onclick={() => take(true)}>Challenge annehmen und losfahren</button>
        <button class="secondary" disabled={busy} onclick={() => take(false)}>
          {existing ? 'Zu meinen Challenges' : 'Für später merken'}
        </button>
        <span class="note">
          Die Zeit startet an der Startlinie der Strecke, du kannst also schon losfahren. Vorher zeigt die Karte den Weg zum
          Start.
        </span>
        {#if !account.user}
          <button class="textlink" onclick={onaccount}>Konto anlegen, um mit deiner Fahrt zu antworten</button>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    max-width: 480px;
    margin: 0 auto;
    z-index: 10;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: max(20px, env(safe-area-inset-top)) 20px 8px;
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font-size: 17px;
    font-weight: 600;
  }
  .sub,
  .note,
  .what {
    font-size: 13px;
    color: var(--muted);
  }
  .note {
    text-align: center;
  }
  .icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    border: 0;
    padding: 0;
    background: #1a1d23;
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px max(24px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .mapbox {
    position: relative;
    height: 38vh;
    min-height: 220px;
    flex-shrink: 0;
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface);
  }
  .card {
    background: var(--surface-2);
    border-radius: 16px;
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .card .label {
    color: var(--ghost);
  }
  .headline {
    font-family: var(--font-num);
    font-size: 44px;
    font-weight: 700;
    line-height: 1.05;
    color: var(--ghost);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    background: var(--surface);
    border-radius: 16px;
    padding: 10px 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .val {
    font-family: var(--font-num);
    font-size: 34px;
    font-weight: 600;
    line-height: 1;
  }
  small {
    font-family: var(--font-text);
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cta {
    height: 56px;
    border: 0;
    border-radius: 14px;
    background: var(--you);
    color: var(--bg);
    font-size: 17px;
    font-weight: 700;
  }
  .secondary {
    height: 52px;
    border: 0;
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }
  .done {
    height: 52px;
    margin-top: 8px;
    border: 1.5px solid var(--line);
    border-radius: 14px;
    background: none;
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
  }
  .textlink {
    border: 0;
    padding: 6px 0;
    background: none;
    color: var(--you);
    font-size: 15px;
    font-weight: 600;
  }
</style>
