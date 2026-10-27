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

    countRides(userId: string): number {
      return (q.countRidesOf.get(userId) as { n: number }).n;
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
