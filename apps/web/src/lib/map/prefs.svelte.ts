const KEY = 'rechase.map.headingUp';

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Kartenausrichtung für alle Karten der App; Standard: Fahrtrichtung oben. */
class MapPrefs {
  #headingUp = $state(load());

  get headingUp() {
    return this.#headingUp;
  }

  set headingUp(on: boolean) {
    this.#headingUp = on;
    try {
      localStorage.setItem(KEY, String(on));
    } catch {
      // Privater Modus: gilt dann nur bis zum Neuladen
    }
  }
}

export const mapPrefs = new MapPrefs();
