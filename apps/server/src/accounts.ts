import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isBikeType, normalizeChaserName, type BikeType } from '@rechase/core';
import { checkOrigin, cookies, HttpError, readJson, sendJson, str } from './http.ts';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password.ts';
import type { Provider, Store, User } from './store.ts';

/**
 * Konten-API unter /api: Registrierung und Anmeldung per E-Mail und Passwort oder mit Google,
 * Profil (Chaser-Name, Standardrad) und Löschen des Kontos.
 *
 * Sitzungen: zufälliges Token im HttpOnly-Cookie, in der Datenbank nur sein SHA-256-Hash.
 * CSRF: Das Cookie ist SameSite=Lax, und ändernde Anfragen müssen JSON schicken und vom selben Origin kommen.
 */

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export interface AccountsOptions {
  store: Store;
  google?: GoogleConfig;
  /** Öffentliche Adresse für die Rückleitung von Google, sonst aus den Headern von nginx */
  publicUrl?: string;
  now?: () => number;
  /** Für Tests austauschbar */
  fetch?: typeof fetch;
  /** E-Mail-Adressen mit Zugang zum Adminbereich */
  adminEmails?: readonly string[];
}

const SESSION_COOKIE = 'rechase_session';
const OAUTH_COOKIE = 'rechase_oauth';
const SESSION_DAYS = 180;
const DAY_MS = 24 * 3600 * 1000;
const PASSWORD = { min: 8, max: 200 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Höchstens 20 Anmeldeversuche je Adresse in 15 Minuten
const MAX_TRIES = 20;
const TRY_WINDOW_MS = 15 * 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');

const isHttps = (req: IncomingMessage) => req.headers['x-forwarded-proto'] === 'https';

function cookie(req: IncomingMessage, name: string, value: string, maxAgeS: number, path = '/') {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeS}; HttpOnly; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`;
}

function redirect(res: ServerResponse, location: string, setCookie: string[] = []) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', 'Set-Cookie': setCookie });
  res.end();
}

const clientIp = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';

export interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
  bike: BikeType | null;
  onboarded: boolean;
  providers: Provider[];
  /** Hat in den Feldtest eingewilligt: Fahrten werden hochgeladen */
  testConsent: boolean;
  /** Hochgeladene Fahrten */
  uploadedRides: number;
  /** Darf den Adminbereich unter /admin öffnen */
  admin: boolean;
}

export function createAccounts({
  store,
  google,
  publicUrl,
  now = Date.now,
  fetch: customFetch,
  adminEmails = [],
}: AccountsOptions) {
  const admins = new Set(adminEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  const isAdmin = (u: User) => !!u.email && admins.has(u.email.toLowerCase());
  const tries = new Map<string, { count: number; since: number }>();

  function limit(req: IncomingMessage) {
    const ip = clientIp(req);
    const t = tries.get(ip);
    if (!t || now() - t.since > TRY_WINDOW_MS) {
      if (tries.size > 10_000) tries.clear();
      tries.set(ip, { count: 1, since: now() });
    } else if (++t.count > MAX_TRIES) {
      throw new HttpError(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.');
    }
  }

  const publicUser = (u: User): PublicUser => ({
    id: u.id,
    email: u.email,
    name: u.name,
    bike: u.bike,
    onboarded: u.onboardedAt != null,
    providers: store.providers(u.id),
    testConsent: u.testConsentAt != null,
    uploadedRides: store.countRides(u.id),
    admin: isAdmin(u),
  });

  function startSession(req: IncomingMessage, userId: string) {
    const token = randomBytes(32).toString('base64url');
    store.createSession(sha256(token), userId, now() + SESSION_DAYS * DAY_MS);
    return cookie(req, SESSION_COOKIE, token, SESSION_DAYS * 24 * 3600);
  }

  const endSessionCookie = (req: IncomingMessage) => cookie(req, SESSION_COOKIE, '', 0);

  /** Angemeldetes Konto der Anfrage; verlängert die Sitzung, wenn sie zur Hälfte um ist. */
  function currentUser(req: IncomingMessage): User | null {
    const token = cookies(req).get(SESSION_COOKIE);
    if (!token) return null;
    const hash = sha256(token);
    const session = store.session(hash);
    if (!session) return null;
    const user = store.user(session.userId);
    if (user && session.expiresAt - now() < (SESSION_DAYS / 2) * DAY_MS) {
      store.extendSession(hash, now() + SESSION_DAYS * DAY_MS);
    }
    return user;
  }

  function requireUser(req: IncomingMessage) {
    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Nicht angemeldet.');
    return user;
  }

  function baseUrl(req: IncomingMessage) {
    if (publicUrl) return publicUrl.replace(/\/$/, '');
    const proto = isHttps(req) ? 'https' : 'http';
    return `${proto}://${req.headers.host}`;
  }

  // ---- E-Mail und Passwort ----

  function credentials(body: Record<string, unknown>) {
    const email = str(body.email).trim().toLowerCase();
    const password = str(body.password);
    if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Bitte eine gültige E-Mail-Adresse angeben.');
    return { email, password };
  }

  async function register(req: IncomingMessage, res: ServerResponse) {
    limit(req);
    const { email, password } = credentials(await readJson(req));
    if (password.length < PASSWORD.min) {
      throw new HttpError(400, `Das Passwort braucht mindestens ${PASSWORD.min} Zeichen.`);
    }
    if (password.length > PASSWORD.max) throw new HttpError(400, 'Das Passwort ist zu lang.');
    const existing = store.userByEmail(email);
    if (existing) {
      const viaGoogle = store.providers(existing.id).includes('google');
      throw new HttpError(
        409,
        viaGoogle
          ? 'Diese E-Mail gehört zu einem Google-Konto. Bitte mit Google anmelden.'
          : 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.',
      );
    }
    const secret = await hashPassword(password);
    let user: User;
    try {
      user = store.createUser(email, { provider: 'password', subject: email, secret });
    } catch {
      // Zwei gleichzeitige Registrierungen mit derselben E-Mail
      throw new HttpError(409, 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.');
    }
    sendJson(res, 201, { user: publicUser(user) }, { 'Set-Cookie': startSession(req, user.id) });
  }

  async function login(req: IncomingMessage, res: ServerResponse) {
    limit(req);
    const { email, password } = credentials(await readJson(req));
    const identity = store.identity('password', email);
    const ok = identity?.secret ? await verifyPassword(password, identity.secret) : await verifyAgainstDummy(password);
    const user = ok && identity ? store.user(identity.userId) : null;
    if (!user) throw new HttpError(401, 'E-Mail oder Passwort stimmt nicht.');
    sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': startSession(req, user.id) });
  }

  function logout(req: IncomingMessage, res: ServerResponse) {
    const token = cookies(req).get(SESSION_COOKIE);
    if (token) store.deleteSession(sha256(token));
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': endSessionCookie(req) });
  }

  // ---- Profil ----

  async function updateMe(req: IncomingMessage, res: ServerResponse) {
    const user = requireUser(req);
    const body = await readJson(req);
    let name = user.name;
    let bike = user.bike;
    if ('name' in body) {
      const n = normalizeChaserName(str(body.name));
      if ('error' in n) throw new HttpError(400, n.error);
      if (store.nameTaken(n.name, user.id)) throw new HttpError(409, `„${n.name}“ ist schon vergeben.`);
      name = n.name;
    }
    if ('bike' in body) {
      if (!isBikeType(body.bike)) throw new HttpError(400, 'Unbekannter Radtyp.');
      bike = body.bike;
    }
    if ('testConsent' in body && typeof body.testConsent !== 'boolean') throw new HttpError(400, 'Ungültige Einwilligung.');
    let updated: User;
    try {
      updated = store.updateProfile(user.id, name, bike);
    } catch {
      throw new HttpError(409, `„${name}“ ist schon vergeben.`);
    }
    if (body.testConsent === true && updated.testConsentAt == null) updated = store.setTestConsent(user.id, now());
    if (body.testConsent === false && updated.testConsentAt != null) {
      // Widerruf: keine weiteren Uploads, und was schon hochgeladen ist, wird gelöscht
      updated = store.setTestConsent(user.id, null);
      store.deleteRidesOf(user.id);
    }
    sendJson(res, 200, { user: publicUser(updated) });
  }

  async function deleteMe(req: IncomingMessage, res: ServerResponse) {
    const user = requireUser(req);
    await readJson(req);
    store.deleteUser(user.id);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': endSessionCookie(req) });
  }

  // ---- Google (OpenID Connect, Authorization Code mit PKCE) ----

  function googleStart(req: IncomingMessage, res: ServerResponse) {
    if (!google) throw new HttpError(404, 'Google-Anmeldung ist nicht eingerichtet.');
    const state = randomBytes(16).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    redirect(res, url.toString(), [cookie(req, OAUTH_COOKIE, `${state}.${verifier}`, 600, '/api/auth')]);
  }

  async function googleCallback(req: IncomingMessage, res: ServerResponse, url: URL) {
    const clear = cookie(req, OAUTH_COOKIE, '', 0, '/api/auth');
    const fail = (why: string) => {
      console.warn(`Google-Anmeldung fehlgeschlagen: ${why}`);
      redirect(res, '/?anmeldung=fehler', [clear]);
    };
    if (!google) return fail('nicht eingerichtet');
    const [state, verifier] = (cookies(req).get(OAUTH_COOKIE) ?? '').split('.');
    const code = url.searchParams.get('code');
    if (url.searchParams.get('error')) return redirect(res, '/?anmeldung=abgebrochen', [clear]);
    if (!state || !verifier || !code || url.searchParams.get('state') !== state) return fail('state passt nicht');

    const tokenRes = await (customFetch ?? globalThis.fetch)('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) return fail(`Token-Endpunkt ${tokenRes.status}`);
    const { id_token: idToken } = (await tokenRes.json()) as { id_token?: string };

    // Das ID-Token kommt direkt per TLS von Google, deshalb reicht es, die Claims zu prüfen (OIDC Core 3.1.3.7).
    let claims: { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean };
    try {
      claims = JSON.parse(Buffer.from(idToken!.split('.')[1], 'base64url').toString());
    } catch {
      return fail('ID-Token unlesbar');
    }
    const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issOk || claims.aud !== google.clientId || !claims.sub || (claims.exp ?? 0) * 1000 < now()) {
      return fail('ID-Token ungültig');
    }

    const email = claims.email_verified && claims.email ? claims.email.toLowerCase() : null;
    let userId = store.identity('google', claims.sub)?.userId;
    if (!userId) {
      // Bestätigte Google-Adresse eines bestehenden Kontos: Google als zweiten Anmeldeweg anhängen
      const existing = email ? store.userByEmail(email) : null;
      if (existing) {
        store.addIdentity({ userId: existing.id, provider: 'google', subject: claims.sub, secret: null });
        userId = existing.id;
      } else {
        userId = store.createUser(email, { provider: 'google', subject: claims.sub, secret: null }).id;
      }
    }
    redirect(res, '/', [clear, startSession(req, userId)]);
  }

  /** true: Anfrage war für die API und ist beantwortet */
  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!url.pathname.startsWith('/api/')) return false;
    const route = `${req.method} ${url.pathname}`;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') checkOrigin(req);
      switch (route) {
        case 'GET /api/auth/config':
          sendJson(res, 200, { google: !!google });
          break;
        case 'POST /api/auth/register':
          await register(req, res);
          break;
        case 'POST /api/auth/login':
          await login(req, res);
          break;
        case 'POST /api/auth/logout':
          logout(req, res);
          break;
        case 'GET /api/auth/google':
          googleStart(req, res);
          break;
        case 'GET /api/auth/google/callback':
          await googleCallback(req, res, url);
          break;
        case 'GET /api/me': {
          const user = currentUser(req);
          sendJson(res, 200, { user: user && publicUser(user) });
          break;
        }
        case 'PATCH /api/me':
          await updateMe(req, res);
          break;
        case 'DELETE /api/me':
          await deleteMe(req, res);
          break;
        default:
          return false;
      }
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (!res.headersSent) sendJson(res, err.status, { error: err.message });
      else res.end();
    }
    return true;
  }

  return { handle, currentUser, requireUser, isAdmin };
}
