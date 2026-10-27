import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { parseRideUpload, summarizeRide } from '@rechase/core';
import type { createAccounts } from './accounts.ts';
import { checkOrigin, HttpError, readJson, sendJson } from './http.ts';
import type { Store } from './store.ts';

/**
 * Fahrten-Upload für den Feldtest (E22-2) unter /api/rides. Nur mit Einwilligung (E22-1).
 * Die App schickt jede beendete Fahrt per PUT mit ihrer eigenen ID, ein zweites Hochladen ersetzt sie.
 */

// Eine Stunde mit Rohpunkten und Samples sind als JSON rund 1 MB, gepackt ein Viertel davon.
const MAX_BODY = 8 * 1024 * 1024;
const MAX_UNPACKED = 64 * 1024 * 1024;

export interface RidesOptions {
  store: Store;
  accounts: ReturnType<typeof createAccounts>;
}

export function createRides({ store, accounts }: RidesOptions) {
  async function put(req: IncomingMessage, res: ServerResponse, id: string) {
    const user = accounts.requireUser(req);
    if (user.testConsentAt == null) throw new HttpError(403, 'Ohne Einwilligung in den Feldtest werden keine Fahrten hochgeladen.');
    const parsed = parseRideUpload(await readJson(req, { maxBody: MAX_BODY, maxUnpacked: MAX_UNPACKED }));
    if ('error' in parsed) throw new HttpError(400, parsed.error);
    const ride = parsed.ride;
    if (ride.id !== id) throw new HttpError(400, 'Fahrt-ID passt nicht zur Adresse.');
    const owner = store.rideOwner(id);
    if (owner && owner !== user.id) throw new HttpError(409, 'Diese Fahrt gehört zu einem anderen Konto.');
    store.putRide(
      { id, userId: user.id, startedAt: ride.startedAt, endedAt: ride.endedAt, summary: summarizeRide(ride) },
      gzipSync(JSON.stringify(ride)),
    );
    sendJson(res, owner ? 200 : 201, { ok: true, id });
  }

  /** true: Anfrage war für diesen Teil der API und ist beantwortet */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const m = /^\/api\/rides\/([\w-]{1,64})$/.exec(url.pathname);
    if (!m) return false;
    try {
      if (req.method !== 'PUT') throw new HttpError(405, 'Nur PUT.');
      checkOrigin(req);
      await put(req, res, m[1]!);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (!res.headersSent) sendJson(res, err.status, { error: err.message });
      else res.end();
    }
    return true;
  }

  return { handle };
}
