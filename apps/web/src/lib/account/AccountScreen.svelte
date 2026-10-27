<script lang="ts">
  import { account } from './account.svelte.ts';
  import './forms.css';

  let {
    mode = $bindable(),
    ondone,
  }: {
    mode: 'welcome' | 'login' | 'register';
    /** Angemeldet oder „ohne Konto weiter“ */
    ondone: () => void;
  } = $props();

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = null;
    try {
      if (mode === 'register') await account.register(email, password);
      else await account.login(email, password);
      account.dismissWelcome();
      ondone();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  function go(m: typeof mode) {
    error = null;
    mode = m;
  }

  function skip() {
    account.dismissWelcome();
    ondone();
  }
</script>

<div class="screen">
  {#if mode === 'welcome'}
    <h1>Willkommen bei re:chase</h1>
    <p>
      Jag deine Bestzeit als Ghost. Mit Konto kannst du später Ghosts teilen, Challenges beantworten und in deiner
      Radklasse gewertet werden. Ohne Konto bleibt alles auf diesem Gerät.
    </p>
    <button class="primary" onclick={() => go('register')}>Konto anlegen</button>
    <button class="secondary" onclick={() => go('login')}>Anmelden</button>
    <button class="textlink" onclick={skip}>Ohne Konto weiter</button>
  {:else}
    <button class="back" onclick={() => go('welcome')}>‹ Zurück</button>
    <h1>{mode === 'register' ? 'Konto anlegen' : 'Anmelden'}</h1>

    {#if account.google}
      <button class="secondary google" onclick={() => account.loginWithGoogle()}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/>
        </svg>
        Mit Google {mode === 'register' ? 'registrieren' : 'anmelden'}
      </button>
      <span class="or">oder mit E-Mail</span>
    {/if}

    <form onsubmit={submit}>
      <label>
        E-Mail
        <input type="email" autocomplete="email" required bind:value={email} />
      </label>
      <label>
        Passwort{mode === 'register' ? ' (mindestens 8 Zeichen)' : ''}
        <input
          type="password"
          autocomplete={mode === 'register' ? 'new-password' : 'current-password'}
          minlength={mode === 'register' ? 8 : undefined}
          required
          bind:value={password}
        />
      </label>
      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}
      <button class="primary" type="submit" disabled={busy}>
        {busy ? 'Moment …' : mode === 'register' ? 'Konto anlegen' : 'Anmelden'}
      </button>
    </form>

    <button class="textlink" onclick={() => go(mode === 'register' ? 'login' : 'register')}>
      {mode === 'register' ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'}
    </button>
  {/if}
</div>

<style>
  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
</style>
