import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { openStore, type Store } from '../src/store.ts';

let base = '';
let close = () => {};
let store: Store;
const googleFetch = vi.fn<typeof fetch>();

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rechase-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>re:chase</title>');
  store = openStore(':memory:');
  const server = createApp({
    publicDir: dir,
    version: 'test',
    store,
    google: { clientId: 'client-1', clientSecret: 'geheim' },
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => {
    server.close();
    store.close();
  };
});

afterAll(() => close());

/** Kleiner Browser: merkt sich Cookies zwischen Anfragen. */
function client() {
  const jar = new Map<string, string>();
  async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = pair.split('=');
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(k);
      else jar.set(k, v);
    }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data, res };
  }
  return { call, jar };
}

describe('Konto mit E-Mail und Passwort', () => {
  it('registriert, ist angemeldet und schließt das Onboarding ab', async () => {
    const c = client();
    const reg = await c.call('POST', '/api/auth/register', { email: 'Nico@Example.com', password: 'sehrgeheim' });
    expect(reg.status).toBe(201);
    expect(reg.data.user).toMatchObject({ email: 'nico@example.com', onboarded: false, providers: ['password'] });

    const me = await c.call('GET', '/api/me');
    expect(me.data.user.email).toBe('nico@example.com');

    const half = await c.call('PATCH', '/api/me', { bike: 'gravel' });
    expect(half.data.user).toMatchObject({ bike: 'gravel', onboarded: false });

    const done = await c.call('PATCH', '/api/me', { name: ' Isar  Jäger ' });
    expect(done.status).toBe(200);
    expect(done.data.user).toMatchObject({ name: 'Isar Jäger', bike: 'gravel', onboarded: true });
  });

  it('meldet ab und wieder an', async () => {
    const c = client();
    await c.call('POST', '/api/auth/register', { email: 'a@b.de', password: '12345678' });
    await c.call('POST', '/api/auth/logout', {});
    expect((await c.call('GET', '/api/me')).data.user).toBeNull();

    const wrong = await c.call('POST', '/api/auth/login', { email: 'a@b.de', password: 'falsch123' });
    expect(wrong.status).toBe(401);
    const unknown = await c.call('POST', '/api/auth/login', { email: 'x@b.de', password: '12345678' });
    expect(unknown.status).toBe(401);
    expect(unknown.data.error).toBe(wrong.data.error);

    const ok = await c.call('POST', '/api/auth/login', { email: 'A@B.de', password: '12345678' });
    expect(ok.status).toBe(200);
    expect((await c.call('GET', '/api/me')).data.user.email).toBe('a@b.de');
  });

  it('lehnt doppelte E-Mail, kurzes Passwort und vergebenen Namen ab', async () => {
    const c = client();
    expect((await c.call('POST', '/api/auth/register', { email: 'k@b.de', password: 'kurz' })).status).toBe(400);
    expect((await c.call('POST', '/api/auth/register', { email: 'kein-mail', password: '12345678' })).status).toBe(400);
    await c.call('POST', '/api/auth/register', { email: 'k@b.de', password: '12345678' });
    expect((await client().call('POST', '/api/auth/register', { email: 'K@b.de', password: '87654321' })).status).toBe(
      409,
    );

    await c.call('PATCH', '/api/me', { name: 'Ghostbuster' });
    const other = client();
    await other.call('POST', '/api/auth/register', { email: 'o@b.de', password: '12345678' });
    const taken = await other.call('PATCH', '/api/me', { name: 'ghostbuster' });
    expect(taken.status).toBe(409);
    expect((await other.call('PATCH', '/api/me', { bike: 'motorrad' })).status).toBe(400);
  });

  it('schützt Profil und Löschen', async () => {
    const anon = client();
    expect((await anon.call('PATCH', '/api/me', { bike: 'road' })).status).toBe(401);

    const c = client();
    await c.call('POST', '/api/auth/register', { email: 'weg@b.de', password: '12345678' });
    // Ohne JSON (z. B. ein fremdes Formular) und von fremdem Origin geht nichts
    const form = await fetch(`${base}/api/me`, {
      method: 'DELETE',
      headers: { Cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    expect(form.status).toBe(415);
    const foreign = await c.call('DELETE', '/api/me', {}, { Origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);

    expect((await c.call('DELETE', '/api/me', {})).status).toBe(200);
    expect((await c.call('GET', '/api/me')).data.user).toBeNull();
    expect(store.userByEmail('weg@b.de')).toBeNull();
    expect((await client().call('POST', '/api/auth/login', { email: 'weg@b.de', password: '12345678' })).status).toBe(
      401,
    );
  });

  it('antwortet auf unbekannte API-Adressen mit 404 statt index.html', async () => {
    const r = await client().call('GET', '/api/gibtsnicht');
    expect(r.status).toBe(404);
  });
});

describe('Anmeldung mit Google', () => {
  const idToken = (claims: object) =>
    ['x', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');

  async function googleLogin(c: ReturnType<typeof client>, claims: object) {
    const start = await c.call('GET', '/api/auth/config');
    expect(start.data.google).toBe(true);
    const go = await c.call('GET', '/api/auth/google');
    expect(go.status).toBe(303);
    const target = new URL(go.res.headers.get('location')!);
    expect(target.host).toBe('accounts.google.com');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    const state = target.searchParams.get('state')!;

    googleFetch.mockResolvedValueOnce(Response.json({ id_token: idToken(claims) }));
    return c.call('GET', `/api/auth/google/callback?code=abc&state=${state}`);
  }

  it('legt ein Konto an und hängt Google an ein bestehendes Konto mit gleicher E-Mail', async () => {
    // Der Server ruft Google über das globale fetch; für den Test umleiten
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
      String(input).startsWith('https://oauth2.googleapis.com') ? googleFetch(input, init) : realFetch(input, init),
    );
    try {
      const exp = Math.floor(Date.now() / 1000) + 600;
      const neu = client();
      const cb = await googleLogin(neu, {
        iss: 'https://accounts.google.com',
        aud: 'client-1',
        sub: 'g-1',
        email: 'neu@gmail.com',
        email_verified: true,
        exp,
      });
      expect(cb.status).toBe(303);
      expect(cb.res.headers.get('location')).toBe('/');
      expect((await neu.call('GET', '/api/me')).data.user).toMatchObject({
        email: 'neu@gmail.com',
        providers: ['google'],
      });

      const pw = client();
      await pw.call('POST', '/api/auth/register', { email: 'beides@gmail.com', password: '12345678' });
      const g = client();
      await googleLogin(g, {
        iss: 'accounts.google.com',
        aud: 'client-1',
        sub: 'g-2',
        email: 'beides@gmail.com',
        email_verified: true,
        exp,
      });
      expect((await g.call('GET', '/api/me')).data.user.providers).toEqual(['password', 'google']);

      const bad = client();
      const wrongAud = await googleLogin(bad, { iss: 'accounts.google.com', aud: 'fremd', sub: 'g-3', exp });
      expect(wrongAud.res.headers.get('location')).toBe('/?anmeldung=fehler');
      expect((await bad.call('GET', '/api/me')).data.user).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('lehnt einen Rückruf ohne passenden state ab', async () => {
    const c = client();
    const r = await c.call('GET', '/api/auth/google/callback?code=abc&state=geraten');
    expect(r.res.headers.get('location')).toBe('/?anmeldung=fehler');
  });
});
