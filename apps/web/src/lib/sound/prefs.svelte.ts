import type { CueKind } from '@rechase/core';

const KEY = 'rechase.sound';

/** Klänge, die man einzeln abschalten kann */
export type SoundGroup = 'overtake' | 'close' | 'km' | 'countdown' | 'section' | 'finish' | 'pause';

export const SOUND_GROUPS: { id: SoundGroup; label: string }[] = [
  { id: 'overtake', label: 'Überholen und überholt werden' },
  { id: 'close', label: 'Ticken unter 5 s Rückstand' },
  { id: 'km', label: 'Glocke je Kilometer in Führung' },
  { id: 'countdown', label: 'Countdown auf den letzten 500 m' },
  { id: 'section', label: 'Abschnitt geschafft und Abschnitts-PR' },
  { id: 'finish', label: 'Ziel erreicht' },
  { id: 'pause', label: 'Auto-Pause an und aus' },
];

export const groupOf = (k: CueKind | 'tick'): SoundGroup =>
  k === 'overtake' || k === 'overtaken'
    ? 'overtake'
    : k === 'tick'
      ? 'close'
      : k === 'km-lead'
        ? 'km'
        : k;

interface Stored {
  enabled: boolean;
  volume: number;
  off: SoundGroup[];
}

function load(): Stored {
  const d: Stored = { enabled: true, volume: 0.8, off: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    return v ? { ...d, ...v } : d;
  } catch {
    return d;
  }
}

/** Einstellungen für die Töne während der Fahrt; gelten für alle Fahrten. */
class SoundPrefs {
  #s = $state(load());

  get enabled() {
    return this.#s.enabled;
  }
  set enabled(on: boolean) {
    this.#s.enabled = on;
    this.save();
  }

  /** 0 bis 1 */
  get volume() {
    return this.#s.volume;
  }
  set volume(v: number) {
    this.#s.volume = Math.min(1, Math.max(0, v));
    this.save();
  }

  isOn(g: SoundGroup) {
    return !this.#s.off.includes(g);
  }
  toggle(g: SoundGroup, on: boolean) {
    this.#s.off = on ? this.#s.off.filter((x) => x !== g) : [...this.#s.off, g];
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

export const soundPrefs = new SoundPrefs();
