import { buildSharedGhost, MotionTracker, type MotionSample, type SharedGhostData } from '@rechase/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, startServer } from './client.ts';

let srv: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  srv = await startServer({ publicUrl: 'https://rechase.test' });
});
afterAll(() => srv.close());

/** 5 km gerade nach Norden mit 30 km/h, Start und Ende gekürzt */
function shared(): SharedGhostData {
  const m = new MotionTracker();
  const samples = Array.from({ length: 601 }, (_, i) => ({
    t: 1_000_000 + i * 1000,
    lat: 48.1 + (i ? (i * 30) / 3.6 / 111_195 : 0),
    lon: 11.58,
    accuracy: 5,
    speed: i ? 30 / 3.6 : 0,
  }))
    .map((p) => m.push(p))
    .filter((s): s is MotionSample => s != null);
  const out = buildSharedGhost({
    name: 'Isar-Runde',
    points: samples,
    samples,
    bike: 'road',
    startedAt: Date.UTC(2026, 9, 27),
    privacy: { trim: true, zones: [], seed: 'fahrt-1' },
  });
  if ('error' in out) throw new Error(out.error);
  return out.data;
}

// Kleinstes gültiges PNG (1 × 1)
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function chaser(email: string, name?: string) {
  const c = client(srv.base);
  await c.call('POST', '/api/auth/register', { email, password: 'sehrgeheim' });
  if (name) await c.call('PATCH', '/api/me', { name, bike: 'road' });
  return c;
}

describe('Ghosts teilen', () => {
  it('erzeugt einen Link je Fahrt, den jeder mit dem Code abrufen kann', async () => {
    const anon = client(srv.base);
    const ghost = shared();
    expect((await anon.call('POST', '/api/ghosts', { rideId: 'r1', ghost })).status).toBe(401);
    const noName = await chaser('ohne-name@ghosts.de');
    expect((await noName.call('POST', '/api/ghosts', { rideId: 'r1', ghost })).status).toBe(403);

    const c = await chaser('isar@ghosts.de', 'Isarjäger');
    const first = await c.call('POST', '/api/ghosts', { rideId: 'r1', ghost, image: PNG });
    expect(first.status).toBe(201);
    const { code, url } = first.data.ghost;
    expect(code).toMatch(/^[2-9A-Z]{8}$/);
    expect(url).toBe(`https://rechase.test/c/${code}`);

    // Dieselbe Fahrt noch einmal: gleicher Link, Inhalt ersetzt
    const again = await c.call('POST', '/api/ghosts', { rideId: 'r1', ghost: { ...ghost, name: 'Isar' } });
    expect(again.status).toBe(200);
    expect(again.data.ghost.code).toBe(code);

    const got = await anon.call('GET', `/api/ghosts/${code.toLowerCase()}`);
    expect(got.status).toBe(200);
    expect(got.data).toMatchObject({ code, chaser: 'Isarjäger', name: 'Isar', time: ghost.time, bike: 'road', day: '2026-10-27' });
    expect(got.data.points).toEqual(ghost.points);

    const mine = await c.call('GET', '/api/ghosts');
    expect(mine.data.ghosts).toEqual([expect.objectContaining({ code, rideId: 'r1', views: 1 })]);
  });

  it('prüft Ghost und Bild', async () => {
    const c = await chaser('pruef@ghosts.de', 'Prüfer');
    const ghost = shared();
    const car = { ...ghost, ghost: { ...ghost.ghost, movingTime: ghost.ghost.movingTime.map((t) => t / 4) }, time: ghost.time / 4 };
    expect((await c.call('POST', '/api/ghosts', { rideId: 'r1', ghost: car })).status).toBe(400);
    expect((await c.call('POST', '/api/ghosts', { rideId: 'r1', ghost, image: 'kein-bild' })).status).toBe(400);
    expect((await c.call('POST', '/api/ghosts', { rideId: '../x', ghost })).status).toBe(400);
  });

  it('zeigt Messengern eine Vorschau und liefert das Bild', async () => {
    const c = await chaser('vorschau@ghosts.de', 'Vorschau');
    const { code } = (await c.call('POST', '/api/ghosts', { rideId: 'r1', ghost: shared(), image: PNG })).data.ghost;
    const page = await fetch(`${srv.base}/c/${code}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<meta property="og:title" content="Vorschau fordert dich heraus: Isar-Runde">');
    expect(html).toContain(`<meta property="og:image" content="https://rechase.test/c/${code}.png">`);
    expect(html).toContain('<title>Re: Isar-Runde · re:chase</title>');

    const img = await fetch(`${srv.base}/c/${code}.png`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await img.arrayBuffer()).toString('base64')).toBe(PNG);

    // Unbekannte Codes bekommen die App ohne Vorschau, die dann „gibt es nicht mehr“ zeigt
    const unknown = await fetch(`${srv.base}/c/AAAAAAAA`);
    expect(await unknown.text()).not.toContain('og:title');
    expect((await fetch(`${srv.base}/c/AAAAAAAA.png`)).status).toBe(404);
  });

  it('lässt nur den Besitzer den Link zurückziehen, mit dem Konto verschwinden alle', async () => {
    const owner = await chaser('weg@ghosts.de', 'Wegfahrer');
    const other = await chaser('fremd@ghosts.de', 'Fremder');
    const { code } = (await owner.call('POST', '/api/ghosts', { rideId: 'r1', ghost: shared() })).data.ghost;
    const { code: code2 } = (await owner.call('POST', '/api/ghosts', { rideId: 'r2', ghost: shared() })).data.ghost;
    expect((await other.call('DELETE', `/api/ghosts/${code}`, {})).status).toBe(404);
    expect((await owner.call('DELETE', `/api/ghosts/${code}`, {})).status).toBe(200);
    expect((await other.call('GET', `/api/ghosts/${code}`)).status).toBe(404);

    await owner.call('DELETE', '/api/me', {});
    expect((await other.call('GET', `/api/ghosts/${code2}`)).status).toBe(404);
  });
});

describe('Challenge-Links hinter der PIN-Sperre', () => {
  let pinned: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    pinned = await startServer({ pin: '1520', publicUrl: 'https://rechase.test' });
  });
  afterAll(() => pinned.close());

  it('zeigt Vorschau und Bild ohne PIN, die App erst danach und dann direkt die Challenge', async () => {
    const pin = 'rechase_pin';
    // Konto anlegen geht nur mit PIN-Cookie: einmal einloggen
    const login = await fetch(`${pinned.base}/pin`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ pin: '1520' }),
      redirect: 'manual',
    });
    const pinCookie = login.headers.getSetCookie()[0]!.split(';')[0]!;
    expect(pinCookie.startsWith(`${pin}=`)).toBe(true);
    const c = client(pinned.base);
    c.jar.set(pin, pinCookie.split('=')[1]!);
    await c.call('POST', '/api/auth/register', { email: 'pin@ghosts.de', password: 'sehrgeheim' });
    await c.call('PATCH', '/api/me', { name: 'Pinner', bike: 'road' });
    const { code } = (await c.call('POST', '/api/ghosts', { rideId: 'r1', ghost: shared(), image: PNG })).data.ghost;

    // Crawler ohne Cookie und ohne Accept: text/html
    const preview = await fetch(`${pinned.base}/c/${code}`);
    expect(preview.status).toBe(200);
    const html = await preview.text();
    expect(html).toContain('name="pin"');
    expect(html).toContain('og:title');
    expect(html).toContain(`name="next" value="/c/${code}"`);
    expect((await fetch(`${pinned.base}/c/${code}.png`)).status).toBe(200);
    expect((await fetch(`${pinned.base}/api/ghosts/${code}`)).status).toBe(401);

    // Nach der PIN geht es zurück zum Link, fremde Ziele werden zu /
    const next = (target: string) =>
      fetch(`${pinned.base}/pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ pin: '1520', next: target }),
        redirect: 'manual',
      }).then((r) => r.headers.get('location'));
    expect(await next(`/c/${code}`)).toBe(`/c/${code}`);
    expect(await next('//evil.example')).toBe('/');
    expect(await next('https://evil.example')).toBe('/');
  });
});
