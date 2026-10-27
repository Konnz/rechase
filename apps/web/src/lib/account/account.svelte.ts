import { isBikeType, type BikeType } from '@rechase/core';

/** Konto, wie es die API unter /api/me liefert */
export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  bike: BikeType | null;
  onboarded: boolean;
  providers: ('password' | 'google' | 'apple')[];
}

const USER_KEY = 'rechase.account';
const BIKE_KEY = 'rechase.bike';
const WELCOME_KEY = 'rechase.welcomeSeen';

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Privater Modus: gilt bis zum Neuladen
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Keine Verbindung. Bitte später noch einmal versuchen.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data;
}

/**
 * Konto und Rad. Ohne Konto funktioniert alles lokal weiter; das Konto wird für Teilen und Wertungen gebraucht.
 * Das Konto wird lokal zwischengespeichert, damit die App auch offline weiß, wer fährt.
 */
class Account {
  user = $state<AccountUser | null>(read(USER_KEY, null));
  /** Ist die Google-Anmeldung auf dem Server eingerichtet? */
  google = $state(false);
  /** Antwort vom Server da (oder offline aufgegeben) */
  loaded = $state(false);
  /** Rad der nächsten Fahrt; Vorauswahl ist das zuletzt genutzte, sonst das Standardrad */
  bike = $state<BikeType | null>(read(BIKE_KEY, null));
  welcomeSeen = $state(read(WELCOME_KEY, false));

  private set(user: AccountUser | null) {
    this.user = user;
    write(USER_KEY, user);
    if (user?.bike && !this.bike) this.setBike(user.bike);
  }

  async load() {
    try {
      const [me, config] = await Promise.all([
        api<{ user: AccountUser | null }>('GET', '/api/me'),
        api<{ google: boolean }>('GET', '/api/auth/config'),
      ]);
      this.set(me.user);
      this.google = config.google;
    } catch {
      // Offline oder Server ohne API: zwischengespeichertes Konto behalten
    }
    this.loaded = true;
  }

  async register(email: string, password: string) {
    this.set((await api<{ user: AccountUser }>('POST', '/api/auth/register', { email, password })).user);
  }

  async login(email: string, password: string) {
    this.set((await api<{ user: AccountUser }>('POST', '/api/auth/login', { email, password })).user);
  }

  /** Volle Seitennavigation zu Google; zurück kommt man angemeldet auf / */
  loginWithGoogle() {
    location.href = '/api/auth/google';
  }

  async update(profile: { name?: string; bike?: BikeType }) {
    this.set((await api<{ user: AccountUser }>('PATCH', '/api/me', profile)).user);
  }

  async logout() {
    await api('POST', '/api/auth/logout', {});
    this.set(null);
  }

  /** Löscht das Konto auf dem Server. Fahrten auf dem Gerät bleiben. */
  async remove() {
    await api('DELETE', '/api/me', {});
    this.set(null);
  }

  setBike(bike: BikeType) {
    if (!isBikeType(bike)) return;
    this.bike = bike;
    write(BIKE_KEY, bike);
  }

  dismissWelcome() {
    this.welcomeSeen = true;
    write(WELCOME_KEY, true);
  }
}

export const account = new Account();
