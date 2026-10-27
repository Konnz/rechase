const KEY = 'rechase.challenge';

/** Was passiert, wenn man unterwegs auf eine gemerkte Strecke zufährt */
export type ChallengeMode = 'auto' | 'offer' | 'off';

export const CHALLENGE_MODES: { id: ChallengeMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automatisch', hint: 'Startet nach 5 s von selbst, ablehnen mit einem Tipp' },
  { id: 'offer', label: 'Nur anbieten', hint: 'Startet erst, wenn du auf „Duell starten“ tippst' },
  { id: 'off', label: 'Aus', hint: 'Keine Angebote während der Fahrt' },
];

interface Stored {
  mode: ChallengeMode;
  /** Strecken mit „nicht mehr anbieten“ */
  muted: string[];
}

function load(): Stored {
  const d: Stored = { mode: 'auto', muted: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    return v ? { ...d, ...v } : d;
  } catch {
    return d;
  }
}

/** Einstellungen für Duell-Angebote unterwegs (E27); gelten für alle Fahrten. */
class ChallengePrefs {
  #s = $state(load());

  get mode() {
    return this.#s.mode;
  }
  set mode(m: ChallengeMode) {
    this.#s.mode = m;
    this.save();
  }

  isMuted(routeId: string) {
    return this.#s.muted.includes(routeId);
  }
  setMuted(routeId: string, muted: boolean) {
    const rest = this.#s.muted.filter((x) => x !== routeId);
    this.#s.muted = muted ? [...rest, routeId] : rest;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#s));
    } catch {
      // Privater Modus: gilt dann nur bis zum Neuladen
    }
  }
}

export const challengePrefs = new ChallengePrefs();
