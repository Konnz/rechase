<script lang="ts">
  import { distanceM, type LatLon } from '@rechase/core';
  import { fmtDuration, fmtInt } from '../format.ts';
  import { sounds } from '../sound/sounds.ts';
  import { AUTO_ACCEPT_MS, type ChallengeOffer, type ChallengeWatch } from './challenge.svelte.ts';

  let { watch, offer, position }: { watch: ChallengeWatch; offer: ChallengeOffer; position: LatLon | null } =
    $props();

  const duel = $derived(offer.duel);
  const toStart = $derived(position ? distanceM(position, duel.route.points[0]) : null);

  // Countdown bis zum automatischen Start, flüssig für den Ring
  let now = $state(Date.now());
  $effect(() => {
    if (offer.startsAt == null) return;
    let raf = requestAnimationFrame(function tick() {
      now = Date.now();
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });
  const left = $derived(offer.startsAt == null ? null : Math.max(0, offer.startsAt - now));
  const R = 44;
  const C = 2 * Math.PI * R;

  function act(fn: () => void) {
    sounds.unlock();
    fn();
  }
</script>

<div class="offer" role="alertdialog" aria-labelledby="offer-name" aria-describedby="offer-what">
  <button class="accept" onclick={() => act(() => watch.accept())}>
    <span class="kicker">Duell-Angebot</span>
    <span class="name" id="offer-name">{duel.stored.name}</span>
    <span class="what" id="offer-what">
      {duel.opponent.short} {fmtDuration(duel.opponent.time)} · startet an der Linie
    </span>
    {#if toStart != null}
      <span class="dist">Start in {fmtInt(toStart)} m</span>
    {/if}
    {#if left != null}
      <span class="ring" aria-label="Startet in {Math.ceil(left / 1000)} Sekunden">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" stroke-width="8" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--you)"
            stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray={C}
            stroke-dashoffset={C * (1 - left / AUTO_ACCEPT_MS)}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span class="secs">{Math.ceil(left / 1000)}</span>
      </span>
      <span class="hint">Startet von selbst · Tippen startet sofort</span>
    {:else}
      <span class="go">Duell starten</span>
    {/if}
  </button>
  <button class="decline" onclick={() => act(() => watch.decline())}>Ablehnen</button>
  <button class="mute" onclick={() => act(() => watch.mute())}>Diese Strecke nicht mehr anbieten</button>
</div>

<style>
  .offer {
    position: fixed;
    inset: 0;
    z-index: 50;
    max-width: 480px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: max(16px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom));
    background: var(--bg);
  }
  button {
    border: 0;
    cursor: pointer;
    color: var(--text);
  }
  .accept {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    border-radius: 24px;
    background: var(--surface);
    border: 2px solid var(--you);
    text-align: center;
  }
  .kicker {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--you);
  }
  .name {
    font-family: var(--font-num);
    font-size: 52px;
    font-weight: 700;
    line-height: 1;
    overflow-wrap: anywhere;
  }
  .what {
    font-size: 20px;
    font-weight: 600;
    color: var(--ghost);
  }
  .dist {
    font-size: 17px;
    color: var(--muted);
  }
  .ring {
    position: relative;
    width: 132px;
    height: 132px;
    margin-top: 8px;
  }
  .ring svg {
    width: 100%;
    height: 100%;
  }
  .secs {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--font-num);
    font-size: 64px;
    font-weight: 700;
    color: var(--you);
  }
  .hint {
    font-size: 15px;
    color: var(--muted);
  }
  .go {
    margin-top: 12px;
    padding: 16px 32px;
    border-radius: 16px;
    background: var(--you);
    color: var(--bg);
    font-size: 22px;
    font-weight: 700;
  }
  .decline {
    flex: 0 0 34%;
    border-radius: 24px;
    background: #24282f;
    border: 2px solid #3a4049;
    font-size: 32px;
    font-weight: 700;
  }
  .mute {
    flex: 0 0 auto;
    padding: 10px;
    background: none;
    color: var(--muted);
    font-size: 15px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
