import { ZONE_RADIUS, type PrivacyOptions, type PrivacyZone } from '@rechase/core';

const KEY = 'rechase.privacy';

interface Stored {
  /** Start und Ende jeder geteilten Fahrt zufällig kürzen */
  trim: boolean;
  zones: PrivacyZone[];
}

function load(): Stored {
  const d: Stored = { trim: true, zones: [] };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    return v ? { ...d, ...v } : d;
  } catch {
    return d;
  }
}

/**
 * Privatzonen (E11-6), standardmäßig an. Sie bleiben nur auf dem Gerät: Die App kürzt vor dem Teilen,
 * der Server erfährt weder die Zonen noch den echten Start.
 */
class PrivacyPrefs {
  #s = $state(load());

  get trim() {
    return this.#s.trim;
  }
  set trim(on: boolean) {
    this.#s.trim = on;
    this.save();
  }

  get zones(): readonly PrivacyZone[] {
    return this.#s.zones;
  }

  addZone(zone: Omit<PrivacyZone, 'id'>) {
    const radius = Math.min(ZONE_RADIUS.max, Math.max(ZONE_RADIUS.min, Math.round(zone.radius)));
    this.#s.zones = [...this.#s.zones, { ...zone, radius, id: crypto.randomUUID() }];
    this.save();
  }

  removeZone(id: string) {
    this.#s.zones = this.#s.zones.filter((z) => z.id !== id);
    this.save();
  }

  /** Optionen für eine Fahrt; die Zufallsradien hängen an ihrer ID */
  options(seed: string): PrivacyOptions {
    return { trim: this.#s.trim, zones: $state.snapshot(this.#s.zones), seed };
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#s));
    } catch {
      // Privater Modus: gilt bis zum Neuladen
    }
  }
}

export const privacyPrefs = new PrivacyPrefs();
