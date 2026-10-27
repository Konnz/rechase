<script lang="ts">
  import type { RideStats, SpeedProfile } from '@rechase/core';
  import { onMount } from 'svelte';
  import { account } from '../account/account.svelte.ts';
  import type { StoredChallenge, StoredRide, StoredRoute } from '../db.ts';
  import { toGpx } from '../export.ts';
  import { fmtInt } from '../format.ts';
  import { shareLink } from '../summary/share.ts';
  import { renderShareImage } from '../summary/shareImage.ts';
  import {
    challengeText,
    myLinks,
    prepareShare,
    publishShare,
    shareSource,
    uploadToStrava,
    type GhostLink,
  } from './challenges.ts';
  import { privacyPrefs } from './privacy.svelte.ts';

  /** „Challenge me“ in der Auswertung (E11-1, E18-1, E18-3): Link mit gekürztem Ghost, Teilbild und Strava. */
  let {
    ride,
    route = null,
    challenge = null,
    won = false,
    stats,
    profile,
    onaccount,
    onsay,
  }: {
    ride: StoredRide;
    route?: StoredRoute | null;
    /** Challenge, gegen die die Fahrt lief: Dann ist das Teilen eine Antwort („Re:“) */
    challenge?: StoredChallenge | null;
    won?: boolean;
    stats: RideStats;
    /** Tempoverlauf der schon gekürzten Spur für das Bild */
    profile: SpeedProfile;
    /** Anmelden oder Chaser-Namen wählen */
    onaccount: () => void;
    onsay: (msg: string) => void;
  } = $props();

  const source = $derived(shareSource(ride, route, challenge));
  const prepared = $derived(prepareShare(ride, source, account.bike));
  let link = $state.raw<GhostLink | null>(null);
  let image = $state.raw<File | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let strava = $state<'idle' | 'busy' | 'done'>('idle');
  let stravaUrl = $state<string | null>(null);

  const ready = $derived(!!account.user?.name);
  const text = $derived(
    'data' in prepared
      ? challengeText({ name: prepared.data.name, time: prepared.data.time, replyTo: challenge?.chaser, won })
      : '',
  );

  async function makeImage(url: string) {
    const blob = await renderShareImage({
      startedAt: ride.startedAt,
      title: route?.name ?? challenge?.name,
      stats,
      profile,
      challenge: { url },
    });
    return blob && new File([blob], `rechase-challenge-${ride.id.slice(0, 8)}.png`, { type: 'image/png' });
  }

  onMount(() => {
    // Gibt es schon einen Link für diese Fahrt, gleich anbieten
    if (!account.user) return;
    void myLinks()
      .then(async (all) => {
        const found = all.find((l) => l.rideId === ride.id);
        if (found) {
          link = found;
          image = await makeImage(found.url);
        }
      })
      .catch(() => {});
  });

  async function create() {
    if (!('data' in prepared)) return;
    busy = true;
    error = null;
    try {
      // Erst der Link, dann das Bild mit dem Link darauf; dieselbe Fahrt behält ihren Code
      const first = await publishShare(ride.id, prepared.data, null);
      const file = await makeImage(first.url);
      link = file ? await publishShare(ride.id, prepared.data, file) : first;
      image = file;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function share() {
    if (!link || !('data' in prepared)) return;
    const how = await shareLink({ title: `Re: ${prepared.data.name}`, text, url: link.url, file: image });
    if (how === 'copied') onsay('Link kopiert');
    else if (how === 'failed') onsay('Teilen ging nicht. Link: ' + link.url);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      onsay('Link kopiert');
    } catch {
      onsay(link.url);
    }
  }

  async function toStrava() {
    strava = 'busy';
    error = null;
    try {
      if (!link) await create();
      const description = link && text ? `${text}\n${link.url}` : 'Aufgezeichnet mit re:chase';
      const r = await uploadToStrava({ rideId: ride.id, gpx: toGpx(ride), name: `re:chase · ${source.name}`, description });
      if (r.error?.includes('duplicate')) {
        onsay('Diese Fahrt ist schon bei Strava');
      } else if (r.error) {
        throw new Error(`Strava: ${r.error}`);
      } else {
        stravaUrl = r.activityUrl;
        onsay(r.done ? 'Bei Strava hochgeladen' : 'Strava verarbeitet die Fahrt noch');
      }
      strava = 'done';
    } catch (e) {
      error = (e as Error).message;
      strava = 'idle';
    }
  }
</script>

<section class="card">
  <span class="label">{challenge ? `Re: ${challenge.chaser}` : 'Challenge me'}</span>
  {#if !account.user || !ready}
    <span class="what">
      Teile die Fahrt als Ghost: Wer den Link öffnet, fährt gegen dich. Dafür brauchst du ein Konto mit Chaser-Namen.
    </span>
    <button class="secondary" onclick={onaccount}>{account.user ? 'Chaser-Namen wählen' : 'Anmelden oder registrieren'}</button>
  {:else if 'error' in prepared}
    <span class="what">{prepared.error}</span>
  {:else}
    {#if link}
      <span class="link">{link.url.replace(/^https?:\/\//, '')}</span>
      <div class="row">
        <button class="cta" onclick={share}>{challenge ? 'Antwort teilen' : 'Challenge teilen'}</button>
        <button class="secondary" onclick={copy}>Link kopieren</button>
      </div>
    {:else}
      <button class="cta" disabled={busy} onclick={create}>
        {busy ? 'Moment …' : challenge ? `Antwort an ${challenge.chaser} erstellen` : 'Challenge-Link erstellen'}
      </button>
    {/if}
    <span class="what">
      {source.name} · Privatzonen:
      {#if prepared.cutStart || prepared.cutEnd}
        {fmtInt(prepared.cutStart)} m am Start und {fmtInt(prepared.cutEnd)} m am Ende bleiben privat.
      {:else if !source.trim}
        Die Strecke stammt aus der Challenge und verrät deinen Start nicht.
      {:else}
        aus, die Fahrt wird ungekürzt geteilt.
      {/if}
      {#if !privacyPrefs.trim}Zufällige Kürzung im Profil ausgeschaltet.{/if}
    </span>
    {#if account.strava}
      {#if account.user.strava}
        {#if stravaUrl}
          <a class="secondary strava" href={stravaUrl} target="_blank" rel="noopener">Bei Strava ansehen</a>
        {:else}
          <button class="secondary strava" disabled={strava !== 'idle'} onclick={toStrava}>
            {strava === 'busy' ? 'Lade zu Strava …' : strava === 'done' ? 'Bei Strava' : 'Zu Strava hochladen'}
          </button>
        {/if}
        <span class="what">Mit Challenge-Link in der Beschreibung. Bilder nimmt Strava von Apps nicht an.</span>
      {:else}
        <button class="textlink" onclick={() => account.connectStrava()}>Mit Strava verbinden</button>
      {/if}
    {/if}
  {/if}
  {#if error}
    <span class="error" role="alert">{error}</span>
  {/if}
</section>

<style>
  .card {
    background: var(--surface-2);
    border: 1.5px solid var(--you);
    border-radius: 16px;
    padding: 12px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--you);
  }
  .what {
    font-size: 13px;
    color: var(--muted);
  }
  .link {
    font-family: var(--font-num);
    font-size: 20px;
    font-weight: 600;
    word-break: break-all;
  }
  .error {
    font-size: 14px;
    color: #ffb4ae;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .cta {
    height: 52px;
    border: 0;
    border-radius: 14px;
    background: var(--you);
    color: var(--bg);
    font-size: 16px;
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
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }
  .strava {
    color: #fc4c02;
  }
  .textlink {
    align-self: flex-start;
    border: 0;
    padding: 0;
    background: none;
    color: #fc4c02;
    font-size: 15px;
    font-weight: 600;
  }
</style>
