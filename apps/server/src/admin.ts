import type { IncomingMessage, ServerResponse } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { fieldTestStats, type AdminRide, type AdminTester, type RideUpload } from '@rechase/core';
import type { createAccounts } from './accounts.ts';
import { HttpError, sendJson } from './http.ts';
import type { RideRow, Store, User } from './store.ts';

/**
 * Adminbereich für den Feldtest (E22-3 bis E22-6) unter /api/admin, nur lesend.
 * Admin ist, wessen Konto-E-Mail in ADMIN_EMAILS steht.
 *
 * Datenschutz: Einzelne Fahrten zeigt das nur während des Feldtests und nur von Testern mit Einwilligung.
 * Danach sieht der Adminbereich im Normalbetrieb nur noch zusammengefasste Zahlen (docs/03-backlog.md, E22).
 */

export interface AdminOptions {
  store: Store;
  accounts: ReturnType<typeof createAccounts>;
  now?: () => number;
}

export function createAdmin({ store, accounts, now = Date.now }: AdminOptions) {
  function requireAdmin(req: IncomingMessage) {
    const user = accounts.requireUser(req);
    if (!accounts.isAdmin(user)) throw new HttpError(403, 'Kein Zugang zum Adminbereich.');
    return user;
  }

  function names() {
    return new Map(store.testers().map((u) => [u.id, u]));
  }

  const toAdminRide = (r: RideRow, users: Map<string, User>): AdminRide => ({
    ...r,
    userName: users.get(r.userId)?.name ?? null,
  });

  function testers(): AdminTester[] {
    const rides = store.allRides();
    return store.testers().map((u) => {
      const own = rides.filter((r) => r.userId === u.id);
      const d = own[0]?.summary.device;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        bike: u.bike,
        createdAt: u.createdAt,
        consentAt: u.testConsentAt,
        rides: own.length,
        distance: own.reduce((s, r) => s + r.summary.distance, 0),
        lastRide: own[0]?.startedAt ?? null,
        device: d ? `${d.model} · ${d.os} · ${d.browser}` : null,
      };
    });
  }

  function ride(id: string): { ride: AdminRide; data: RideUpload } {
    const row = store.ride(id);
    const data = row && store.rideData(id);
    if (!row || !data) throw new HttpError(404, 'Fahrt nicht gefunden.');
    return { ride: toAdminRide(row, names()), data: JSON.parse(gunzipSync(data).toString('utf8')) as RideUpload };
  }

  /** true: Anfrage war für den Adminbereich und ist beantwortet */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    try {
      if (req.method !== 'GET') throw new HttpError(405, 'Nur GET.');
      requireAdmin(req);
      const path = url.pathname.slice('/api/admin'.length);
      const rideId = /^\/rides\/([\w-]{1,64})$/.exec(path)?.[1];
      if (path === '/testers') sendJson(res, 200, { testers: testers() });
      else if (path === '/stats') {
        const users = names();
        const all = store.allRides().map((r) => toAdminRide(r, users));
        const consented = [...users.values()].filter((u) => u.testConsentAt != null).length;
        sendJson(res, 200, { stats: fieldTestStats(all, consented, { now: now() }) });
      } else if (path === '/rides') {
        const userId = url.searchParams.get('user');
        const users = names();
        const rows = userId ? store.ridesOf(userId) : store.allRides();
        sendJson(res, 200, { rides: rows.map((r) => toAdminRide(r, users)) });
      } else if (rideId) sendJson(res, 200, ride(rideId));
      else throw new HttpError(404, 'Unbekannte API-Adresse.');
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (!res.headersSent) sendJson(res, err.status, { error: err.message });
      else res.end();
    }
    return true;
  }

  return { handle };
}
