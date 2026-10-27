import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BikeType, RideSummary } from '@rechase/core';

/**
 * Konten und Sitzungen in SQLite (eingebaut in Node, Datei im Volume /data). Kein eigener Datenbank-Container nötig.
 * Das SQL bleibt bewusst schlicht, damit ein späterer Umzug nach Postgres nur ein Export ist.
 *
 * Ein Konto (users) kann mehrere Anmeldewege haben (identities): Passwort, Google, später Apple oder Strava.
 * Fahrten, geteilte Ghosts und Antworten hängen später an users.id.
 */

export interface User {
  id: string;
  email: string | null;
  /** Chaser-Name, unter dem Ghosts anderen gezeigt werden; null bis zum Onboarding */
  name: string | null;
  /** Standardrad, Vorauswahl vor jeder Fahrt */
  bike: BikeType | null;
  createdAt: number;
  onboardedAt: number | null;
  /** Einwilligung in den Feldtest: Fahrten werden hochgeladen und vom Team angesehen */
  testConsentAt: number | null;
}

/** Eine hochgeladene Fahrt ohne ihre Punkte */
export interface RideRow {
  id: string;
  userId: string;
  startedAt: number;
  endedAt: number | null;
  uploadedAt: number;
  summary: RideSummary;
}

/** Ein geteilter Ghost ohne seine Punkte */
export interface GhostRow {
  code: string;
  userId: string;
  rideId: string;
  name: string;
  bike: BikeType | null;
  length: number;
  time: number;
  day: string;
  createdAt: number;
  updatedAt: number;
  views: number;
  /** Chaser-Name des Kontos, zum Zeitpunkt der Abfrage */
  chaser: string | null;
  hasImage: boolean;
}

/** Verbindung zu Strava (E18-3) */
export interface StravaLink {
  userId: string;
  athleteId: string;
  accessToken: string;
  refreshToken: string;
  /** ms seit Epoch */
  expiresAt: number;
}

export type Provider = 'password' | 'google' | 'apple';

export interface Identity {
  userId: string;
  provider: Provider;
  /** E-Mail (klein geschrieben) bei Passwort, sonst die ID beim Anbieter */
  subject: string;
  /** Passwort-Hash, nur bei provider = password */
  secret: string | null;
}

export interface Session {
  userId: string;
  expiresAt: number;
}

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT UNIQUE COLLATE NOCASE,
     name TEXT UNIQUE COLLATE NOCASE,
     bike TEXT,
     created_at INTEGER NOT NULL,
     onboarded_at INTEGER
   );
   CREATE TABLE identities (
     provider TEXT NOT NULL,
     subject TEXT NOT NULL,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     secret TEXT,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (provider, subject)
   );
   CREATE INDEX identities_user ON identities(user_id);
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);`,
  // Feldtest (E22): Einwilligung und hochgeladene Fahrten. summary ist JSON für Listen und Dashboard,
  // data die ganze Fahrt als gzip-JSON. Fahrten verschwinden mit dem Konto.
  `ALTER TABLE users ADD COLUMN test_consent_at INTEGER;
   CREATE TABLE rides (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     uploaded_at INTEGER NOT NULL,
     summary TEXT NOT NULL,
     data BLOB NOT NULL
   );
   CREATE INDEX rides_user ON rides(user_id, started_at);`,
  // Geteilte Ghosts (E11, E12-3): nur per Link sichtbar. data ist der gekürzte Ghost als gzip-JSON,
  // image das Teilbild für die Vorschau in Messengern. Je Fahrt gibt es höchstens einen Link.
  `CREATE TABLE ghosts (
     code TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     ride_id TEXT NOT NULL,
     name TEXT NOT NULL,
     bike TEXT,
     length_m REAL NOT NULL,
     time_ms INTEGER NOT NULL,
     day TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     views INTEGER NOT NULL DEFAULT 0,
     data BLOB NOT NULL,
     image BLOB,
     UNIQUE (user_id, ride_id)
   );
   CREATE TABLE strava (
     user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     athlete_id TEXT NOT NULL,
     access_token TEXT NOT NULL,
     refresh_token TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     created_at INTEGER NOT NULL
   );`,
];

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  bike: string | null;
  created_at: number;
  onboarded_at: number | null;
  test_consent_at: number | null;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  bike: r.bike as BikeType | null,
  createdAt: r.created_at,
  onboardedAt: r.onboarded_at,
  testConsentAt: r.test_consent_at,
});

interface RideDbRow {
  id: string;
  user_id: string;
  started_at: number;
  ended_at: number | null;
  uploaded_at: number;
  summary: string;
}

const toRide = (r: RideDbRow): RideRow => ({
  id: r.id,
  userId: r.user_id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  uploadedAt: r.uploaded_at,
  summary: JSON.parse(r.summary) as RideSummary,
});

interface GhostDbRow {
  code: string;
  user_id: string;
  ride_id: string;
  name: string;
  bike: string | null;
  length_m: number;
  time_ms: number;
  day: string;
  created_at: number;
  updated_at: number;
  views: number;
  chaser: string | null;
  has_image: number;
}

const toGhost = (r: GhostDbRow): GhostRow => ({
  code: r.code,
  userId: r.user_id,
  rideId: r.ride_id,
  name: r.name,
  bike: r.bike as BikeType | null,
  length: r.length_m,
  time: r.time_ms,
  day: r.day,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  views: r.views,
  chaser: r.chaser,
  hasImage: !!r.has_image,
});

const GHOST_COLUMNS = `g.code, g.user_id, g.ride_id, g.name, g.bike, g.length_m, g.time_ms, g.day, g.created_at, g.updated_at,
  g.views, u.name AS chaser, g.image IS NOT NULL AS has_image`;

export type Store = ReturnType<typeof openStore>;

/** Öffnet die Datenbank (":memory:" für Tests) und bringt das Schema auf den neuesten Stand. */
export function openStore(path: string, now: () => number = Date.now) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');

  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByName: db.prepare('SELECT id FROM users WHERE name = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)'),
    updateProfile: db.prepare(
      `UPDATE users SET name = ?, bike = ?,
         onboarded_at = CASE WHEN ? IS NOT NULL AND ? IS NOT NULL THEN COALESCE(onboarded_at, ?) ELSE onboarded_at END
       WHERE id = ?`,
    ),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    identity: db.prepare('SELECT * FROM identities WHERE provider = ? AND subject = ?'),
    insertIdentity: db.prepare(
      'INSERT INTO identities (provider, subject, user_id, secret, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
    providersOf: db.prepare('SELECT provider FROM identities WHERE user_id = ? ORDER BY created_at'),
    session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    extendSession: db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    setConsent: db.prepare('UPDATE users SET test_consent_at = ? WHERE id = ?'),
    rideOwner: db.prepare('SELECT user_id FROM rides WHERE id = ?'),
    putRide: db.prepare(
      `INSERT INTO rides (id, user_id, started_at, ended_at, uploaded_at, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET started_at = excluded.started_at, ended_at = excluded.ended_at,
         uploaded_at = excluded.uploaded_at, summary = excluded.summary, data = excluded.data`,
    ),
    deleteRidesOf: db.prepare('DELETE FROM rides WHERE user_id = ?'),
    countRidesOf: db.prepare('SELECT COUNT(*) AS n FROM rides WHERE user_id = ?'),
    ridesOf: db.prepare(
      'SELECT id, user_id, started_at, ended_at, uploaded_at, summary FROM rides WHERE user_id = ? ORDER BY started_at DESC',
    ),
    allRides: db.prepare('SELECT id, user_id, started_at, ended_at, uploaded_at, summary FROM rides ORDER BY started_at DESC'),
    ride: db.prepare('SELECT id, user_id, started_at, ended_at, uploaded_at, summary FROM rides WHERE id = ?'),
    rideData: db.prepare('SELECT data FROM rides WHERE id = ?'),
    ghost: db.prepare(`SELECT ${GHOST_COLUMNS} FROM ghosts g JOIN users u ON u.id = g.user_id WHERE g.code = ?`),
    ghostOfRide: db.prepare(
      `SELECT ${GHOST_COLUMNS} FROM ghosts g JOIN users u ON u.id = g.user_id WHERE g.user_id = ? AND g.ride_id = ?`,
    ),
    ghostsOf: db.prepare(
      `SELECT ${GHOST_COLUMNS} FROM ghosts g JOIN users u ON u.id = g.user_id WHERE g.user_id = ? ORDER BY g.created_at DESC`,
    ),
    insertGhost: db.prepare(
      `INSERT INTO ghosts (code, user_id, ride_id, name, bike, length_m, time_ms, day, created_at, updated_at, data, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    updateGhost: db.prepare(
      `UPDATE ghosts SET name = ?, bike = ?, length_m = ?, time_ms = ?, day = ?, updated_at = ?, data = ?,
         image = COALESCE(?, image) WHERE code = ?`,
    ),
    ghostData: db.prepare('SELECT data FROM ghosts WHERE code = ?'),
    ghostImage: db.prepare('SELECT image FROM ghosts WHERE code = ?'),
    countView: db.prepare('UPDATE ghosts SET views = views + 1 WHERE code = ?'),
    deleteGhost: db.prepare('DELETE FROM ghosts WHERE code = ? AND user_id = ?'),
    strava: db.prepare('SELECT * FROM strava WHERE user_id = ?'),
    putStrava: db.prepare(
      `INSERT INTO strava (user_id, athlete_id, access_token, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET athlete_id = excluded.athlete_id, access_token = excluded.access_token,
         refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`,
    ),
    deleteStrava: db.prepare('DELETE FROM strava WHERE user_id = ?'),
    testers: db.prepare(
      `SELECT * FROM users WHERE test_consent_at IS NOT NULL OR id IN (SELECT DISTINCT user_id FROM rides)
       ORDER BY created_at`,
    ),
  };

  function transaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return {
    user(id: string): User | null {
      const row = q.userById.get(id) as UserRow | undefined;
      return row ? toUser(row) : null;
    },

    userByEmail(email: string): User | null {
      const row = q.userByEmail.get(email) as UserRow | undefined;
      return row ? toUser(row) : null;
    },

    /** Legt ein Konto mit seinem ersten Anmeldeweg an. */
    createUser(email: string | null, identity: Omit<Identity, 'userId'>): User {
      const id = randomUUID();
      transaction(() => {
        q.insertUser.run(id, email, now());
        q.insertIdentity.run(identity.provider, identity.subject, id, identity.secret, now());
      });
      return this.user(id)!;
    },

    identity(provider: Provider, subject: string): Identity | null {
      const row = q.identity.get(provider, subject) as
        | { provider: Provider; subject: string; user_id: string; secret: string | null }
        | undefined;
      return row ? { userId: row.user_id, provider: row.provider, subject: row.subject, secret: row.secret } : null;
    },

    addIdentity(identity: Identity) {
      q.insertIdentity.run(identity.provider, identity.subject, identity.userId, identity.secret, now());
    },

    providers(userId: string): Provider[] {
      return (q.providersOf.all(userId) as { provider: Provider }[]).map((r) => r.provider);
    },

    nameTaken(name: string, exceptUserId: string) {
      const row = q.userByName.get(name) as { id: string } | undefined;
      return !!row && row.id !== exceptUserId;
    },

    /** Setzt Chaser-Name und Standardrad. Sind beide da, gilt das Onboarding als erledigt. */
    updateProfile(userId: string, name: string | null, bike: BikeType | null): User {
      q.updateProfile.run(name, bike, name, bike, now(), userId);
      return this.user(userId)!;
    },

    /** Löscht das Konto mit allen Anmeldewegen und Sitzungen. */
    deleteUser(userId: string) {
      q.deleteUser.run(userId);
    },

    /** Einwilligung in den Feldtest setzen (Zeitpunkt) oder zurückziehen (null) */
    setTestConsent(userId: string, at: number | null): User {
      q.setConsent.run(at, userId);
      return this.user(userId)!;
    },

    /** Konto, dem eine hochgeladene Fahrt gehört, oder null */
    rideOwner(id: string): string | null {
      return (q.rideOwner.get(id) as { user_id: string } | undefined)?.user_id ?? null;
    },

    /** Legt eine Fahrt an oder ersetzt sie (gleiche ID, z. B. nach Korrektur des Rads) */
    putRide(ride: Omit<RideRow, 'uploadedAt'>, data: Uint8Array) {
      q.putRide.run(ride.id, ride.userId, ride.startedAt, ride.endedAt, now(), JSON.stringify(ride.summary), data);
    },

    deleteRidesOf(userId: string) {
      q.deleteRidesOf.run(userId);
    },

    /** Hochgeladene Fahrten eines Kontos, die neueste zuerst */
    ridesOf(userId: string): RideRow[] {
      return (q.ridesOf.all(userId) as unknown as RideDbRow[]).map(toRide);
    },

    /** Alle hochgeladenen Fahrten ohne Punkte, die neueste zuerst */
    allRides(): RideRow[] {
      return (q.allRides.all() as unknown as RideDbRow[]).map(toRide);
    },

    ride(id: string): RideRow | null {
      const row = q.ride.get(id) as RideDbRow | undefined;
      return row ? toRide(row) : null;
    },

    /** Die ganze Fahrt als gzip-JSON */
    rideData(id: string): Uint8Array | null {
      return (q.rideData.get(id) as { data: Uint8Array } | undefined)?.data ?? null;
    },

    /** Konten im Feldtest: eingewilligt oder mit hochgeladenen Fahrten */
    testers(): User[] {
      return (q.testers.all() as unknown as UserRow[]).map(toUser);
    },

    countRides(userId: string): number {
      return (q.countRidesOf.get(userId) as { n: number }).n;
    },

    ghost(code: string): GhostRow | null {
      const row = q.ghost.get(code) as GhostDbRow | undefined;
      return row ? toGhost(row) : null;
    },

    /** Der Link, den ein Konto für eine seiner Fahrten schon erzeugt hat */
    ghostOfRide(userId: string, rideId: string): GhostRow | null {
      const row = q.ghostOfRide.get(userId, rideId) as GhostDbRow | undefined;
      return row ? toGhost(row) : null;
    },

    ghostsOf(userId: string): GhostRow[] {
      return (q.ghostsOf.all(userId) as unknown as GhostDbRow[]).map(toGhost);
    },

    /** Legt einen geteilten Ghost an; image null lässt ein vorhandenes Bild beim Ersetzen stehen. */
    putGhost(
      g: Pick<GhostRow, 'code' | 'userId' | 'rideId' | 'name' | 'bike' | 'length' | 'time' | 'day'>,
      data: Uint8Array,
      image: Uint8Array | null,
    ) {
      const t = now();
      const changed = q.updateGhost.run(g.name, g.bike, g.length, g.time, g.day, t, data, image, g.code).changes;
      if (!changed) {
        q.insertGhost.run(g.code, g.userId, g.rideId, g.name, g.bike, g.length, g.time, g.day, t, t, data, image);
      }
    },

    ghostData(code: string): Uint8Array | null {
      return (q.ghostData.get(code) as { data: Uint8Array } | undefined)?.data ?? null;
    },

    ghostImage(code: string): Uint8Array | null {
      return (q.ghostImage.get(code) as { image: Uint8Array | null } | undefined)?.image ?? null;
    },

    countGhostView(code: string) {
      q.countView.run(code);
    },

    /** Zieht einen Link zurück; nur das eigene Konto darf das */
    deleteGhost(code: string, userId: string): boolean {
      return q.deleteGhost.run(code, userId).changes > 0;
    },

    strava(userId: string): StravaLink | null {
      const r = q.strava.get(userId) as
        | { user_id: string; athlete_id: string; access_token: string; refresh_token: string; expires_at: number }
        | undefined;
      return r
        ? { userId: r.user_id, athleteId: r.athlete_id, accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at }
        : null;
    },

    putStrava(link: StravaLink) {
      q.putStrava.run(link.userId, link.athleteId, link.accessToken, link.refreshToken, link.expiresAt, now());
    },

    deleteStrava(userId: string) {
      q.deleteStrava.run(userId);
    },

    session(tokenHash: string): Session | null {
      const row = q.session.get(tokenHash) as { user_id: string; expires_at: number } | undefined;
      if (!row) return null;
      if (row.expires_at < now()) {
        q.deleteSession.run(tokenHash);
        return null;
      }
      return { userId: row.user_id, expiresAt: row.expires_at };
    },

    createSession(tokenHash: string, userId: string, expiresAt: number) {
      q.purgeSessions.run(now());
      q.insertSession.run(tokenHash, userId, now(), expiresAt);
    },

    extendSession(tokenHash: string, expiresAt: number) {
      q.extendSession.run(expiresAt, tokenHash);
    },

    deleteSession(tokenHash: string) {
      q.deleteSession.run(tokenHash);
    },

    close() {
      db.close();
    },
  };
}
