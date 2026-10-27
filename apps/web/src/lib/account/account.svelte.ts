import { isBikeType, type BikeType } from '@rechase/core';
import { api } from '../api.ts';

/** Konto, wie es die API unter /api/me liefert */
export interface AccountUser {
  id: string;
  email: string | null;
  name: string | null;
  bike: BikeType | null;
  onboarded: boolean;
  providers: ('password' | 'google' | 'apple')[];
  /** Hat in den Feldtest eingewilligt: beendete Fahrten werden hochgeladen */
  testConsent: boolean;
  /** Schon hochgeladene Fahrten */
  uploadedRides: number;
  /** Darf den Adminbereich unter /admin öffnen */
  admin: boolean;
  /** Mit Strava verbunden */
  strava?: boolean;
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

/**
 * Konto und Rad. Ohne Konto funktioniert alles lokal weiter; das Konto wird für Teilen und Wertungen gebraucht.
 * Das Konto wird lokal zwischengespeichert, damit die App auch offline weiß, wer fährt.
 */
class Account {
  user = $state<AccountUser | null>(read(USER_KEY, null));
  /** Ist die Google-Anmeldung auf dem Server eingerichtet? */
  google = $state(false);
  /** Ist Strava auf dem Server eingerichtet? */
  strava = $state(false);
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
        api<{ google: boolean; strava?: boolean }>('GET', '/api/auth/config'),
      ]);
      this.set(me.user);
      this.google = config.google;
      this.strava = !!config.strava;
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

  async update(profile: { name?: string; bike?: BikeType; testConsent?: boolean }) {
    this.set((await api<{ user: AccountUser }>('PATCH', '/api/me', profile)).user);
  }

  /** Volle Seitennavigation zu Strava; zurück kommt man mit ?strava=verbunden */
  connectStrava() {
    location.href = '/api/strava/connect';
  }

  async disconnectStrava() {
    await api('DELETE', '/api/strava', {});
    await this.load();
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
