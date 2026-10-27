import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { cookie, redirect, type createAccounts } from './accounts.ts';
import { baseUrl, checkOrigin, cookies, HttpError, readJson, sendJson, str } from './http.ts';
import type { Store } from './store.ts';

/**
 * Strava (E18-3): Konto verbinden und Fahrten hochladen, mit Ergebnis und Challenge-Link in der Beschreibung.
 * Bilder kann die Strava-API nicht an Aktivitäten hängen, deshalb nur Text und Link.
 * Läuft nur, wenn STRAVA_CLIENT_ID und STRAVA_CLIENT_SECRET gesetzt sind (Einrichtung in deploy/EINRICHTUNG.md).
 */

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
}

export interface StravaOptions {
  store: Store;
  accounts: ReturnType<typeof createAccounts>;
  strava?: StravaConfig;
  publicUrl?: string;
  now?: () => number;
  /** Für Tests austauschbar */
  fetch?: typeof fetch;
}

const STATE_COOKIE = 'rechase_strava';
const SCOPE = 'activity:write';
const API = 'https://www.strava.com';
// Eine Stunde GPX mit Extensions sind rund 1 MB
const MAX_BODY = 16 * 1024 * 1024;

interface TokenAnswer {
  access_token?: string;
  refresh_token?: string;
  /** Sekunden seit Epoch */
  expires_at?: number;
  athlete?: { id?: number | string };
}

export function createStrava({ store, accounts, strava, publicUrl, now = Date.now, fetch: customFetch }: StravaOptions) {
  const http = (...args: Parameters<typeof fetch>) => (customFetch ?? globalThis.fetch)(...args);
  const callbackUrl = (req: IncomingMessage) => `${baseUrl(req, publicUrl)}/api/strava/callback`;

  function config() {
    if (!strava) throw new HttpError(404, 'Strava ist auf diesem Server nicht eingerichtet.');
    return strava;
  }

  async function token(body: Record<string, string>): Promise<TokenAnswer | null> {
    const { clientId, clientSecret } = config();
    const res = await http(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
    });
    return res.ok ? ((await res.json()) as TokenAnswer) : null;
  }

  function connect(req: IncomingMessage, res: ServerResponse) {
    const { clientId } = config();
    if (!accounts.currentUser(req)) return redirect(res, '/?strava=fehler');
    const state = randomBytes(16).toString('base64url');
    const url = new URL(`${API}/oauth/authorize`);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl(req),
      response_type: 'code',
      approval_prompt: 'auto',
      scope: SCOPE,
      state,
    }).toString();
    redirect(res, url.toString(), [cookie(req, STATE_COOKIE, state, 600, '/api/strava')]);
  }

  async function callback(req: IncomingMessage, res: ServerResponse, url: URL) {
    const clear = cookie(req, STATE_COOKIE, '', 0, '/api/strava');
    const fail = (why: string) => {
      console.warn(`Strava-Verbindung fehlgeschlagen: ${why}`);
      redirect(res, '/?strava=fehler', [clear]);
    };
    const user = accounts.currentUser(req);
    if (!user) return fail('nicht angemeldet');
    if (url.searchParams.get('error')) return redirect(res, '/?strava=abgebrochen', [clear]);
    const state = cookies(req).get(STATE_COOKIE);
    const code = url.searchParams.get('code');
    if (!state || !code || url.searchParams.get('state') !== state) return fail('state passt nicht');
    // Wer das Häkchen fürs Hochladen abwählt, gibt das Recht nicht
    if (!(url.searchParams.get('scope') ?? '').split(',').includes(SCOPE)) return redirect(res, '/?strava=ohne-recht', [clear]);
    const t = await token({ code, grant_type: 'authorization_code' });
    if (!t?.access_token || !t.refresh_token || !t.expires_at || t.athlete?.id == null) return fail('Token-Endpunkt');
    store.putStrava({
      userId: user.id,
      athleteId: String(t.athlete.id),
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: t.expires_at * 1000,
    });
    redirect(res, '/?strava=verbunden', [clear]);
  }

  /** Gültiges Zugriffstoken; erneuert es kurz vor Ablauf */
  async function accessToken(userId: string): Promise<string> {
    const link = store.strava(userId);
    if (!link) throw new HttpError(409, 'Strava ist nicht verbunden.');
    if (link.expiresAt - now() > 60_000) return link.accessToken;
    const t = await token({ grant_type: 'refresh_token', refresh_token: link.refreshToken });
    if (!t?.access_token || !t.expires_at) {
      store.deleteStrava(userId);
      throw new HttpError(409, 'Die Verbindung zu Strava ist abgelaufen. Bitte im Profil neu verbinden.');
    }
    store.putStrava({
      ...link,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? link.refreshToken,
      expiresAt: t.expires_at * 1000,
    });
    return t.access_token;
  }

  async function upload(req: IncomingMessage, res: ServerResponse) {
    config();
    const user = accounts.requireUser(req);
    const body = await readJson(req, { maxBody: MAX_BODY });
    const gpx = str(body.gpx);
    const externalId = str(body.externalId);
    if (!gpx.startsWith('<?xml') || !gpx.includes('<gpx')) throw new HttpError(400, 'Keine GPX-Datei.');
    if (!/^[\w-]{1,64}$/.test(externalId)) throw new HttpError(400, 'Ungültige Fahrt-ID.');
    const form = new FormData();
    form.set('file', new Blob([gpx], { type: 'application/gpx+xml' }), `${externalId}.gpx`);
    form.set('data_type', 'gpx');
    form.set('external_id', `rechase-${externalId}`);
    form.set('name', str(body.name).slice(0, 100) || 'Fahrt mit re:chase');
    form.set('description', str(body.description).slice(0, 2000));
    const r = await http(`${API}/api/v3/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(user.id)}` },
      body: form,
    });
    if (r.status === 401) {
      store.deleteStrava(user.id);
      throw new HttpError(409, 'Strava hat die Verbindung getrennt. Bitte im Profil neu verbinden.');
    }
    const answer = (await r.json().catch(() => ({}))) as { id_str?: string; id?: number; error?: string | null };
    if (!r.ok) throw new HttpError(502, `Strava hat das Hochladen abgelehnt${answer.error ? `: ${answer.error}` : '.'}`);
    sendJson(res, 201, { uploadId: answer.id_str ?? String(answer.id) });
  }

  /** Stand eines Uploads: Strava verarbeitet die Datei ein paar Sekunden lang */
  async function status(req: IncomingMessage, res: ServerResponse, id: string) {
    config();
    const user = accounts.requireUser(req);
    const r = await http(`${API}/api/v3/uploads/${id}`, {
      headers: { Authorization: `Bearer ${await accessToken(user.id)}` },
    });
    const a = (await r.json().catch(() => ({}))) as { status?: string; error?: string | null; activity_id?: number | null };
    if (!r.ok) throw new HttpError(502, 'Strava antwortet gerade nicht.');
    sendJson(res, 200, {
      done: a.activity_id != null || !!a.error,
      activityUrl: a.activity_id != null ? `${API}/activities/${a.activity_id}` : null,
      // Doppelt hochgeladene Fahrten meldet Strava als Fehler mit „duplicate“
      error: a.error ?? null,
    });
  }

  async function disconnect(req: IncomingMessage, res: ServerResponse) {
    const user = accounts.requireUser(req);
    await readJson(req);
    const link = store.strava(user.id);
    if (link && strava) {
      // Bei Strava abmelden; klappt das nicht, ist die Verbindung bei uns trotzdem weg
      await http(`${API}/oauth/deauthorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: link.accessToken }),
      }).catch(() => null);
    }
    store.deleteStrava(user.id);
    sendJson(res, 200, { ok: true });
  }

  /** true: Anfrage war für diesen Teil der API und ist beantwortet */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname !== '/api/strava' && !url.pathname.startsWith('/api/strava/')) return false;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(req);
      const route = `${req.method} ${url.pathname}`;
      const uploadId = /^\/api\/strava\/uploads\/(\d{1,20})$/.exec(url.pathname)?.[1];
      if (route === 'GET /api/strava/connect') connect(req, res);
      else if (route === 'GET /api/strava/callback') await callback(req, res, url);
      else if (route === 'POST /api/strava/uploads') await upload(req, res);
      else if (req.method === 'GET' && uploadId) await status(req, res, uploadId);
      else if (route === 'DELETE /api/strava') await disconnect(req, res);
      else throw new HttpError(404, 'Unbekannt.');
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (!res.headersSent) sendJson(res, err.status, { error: err.message });
      else res.end();
    }
    return true;
  }

  return { handle };
}
