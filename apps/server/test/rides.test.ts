import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, startServer } from './client.ts';

let srv: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  srv = await startServer();
});
afterAll(() => srv.close());

function ride(id = crypto.randomUUID()) {
  const raw = Array.from({ length: 30 }, (_, i) => ({
    t: 1_000_000 + i * 1000,
    lat: 51.1 + i * 0.0001,
    lon: 6.9,
    alt: 50,
    speed: 7,
    accuracy: 5,
  }));
  const samples = raw.map((p, i) => ({ ...p, moving: i > 0, distance: i * 11, movingTime: i * 1000, elapsed: i * 1000 }));
  return { id, startedAt: raw[0]!.t, endedAt: raw.at(-1)!.t, raw, samples, gaps: 0, rejected: 0, userAgent: 'Test' };
}

async function tester(email: string) {
  const c = client(srv.base);
  await c.call('POST', '/api/auth/register', { email, password: 'sehrgeheim' });
  return c;
}

describe('Fahrten hochladen', () => {
  it('nimmt Fahrten erst nach der Einwilligung an', async () => {
    const anon = client(srv.base);
    const r = ride();
    expect((await anon.call('PUT', `/api/rides/${r.id}`, r)).status).toBe(401);

    const c = await tester('ohne@test.de');
    expect((await c.call('PUT', `/api/rides/${r.id}`, r)).status).toBe(403);

    const yes = await c.call('PATCH', '/api/me', { testConsent: true });
    expect(yes.data.user).toMatchObject({ testConsent: true, uploadedRides: 0 });
    expect((await c.call('PUT', `/api/rides/${r.id}`, r)).status).toBe(201);
    // Erneut hochladen ersetzt die Fahrt
    expect((await c.call('PUT', `/api/rides/${r.id}`, { ...r, bike: 'road' })).status).toBe(200);
    expect((await c.call('GET', '/api/me')).data.user.uploadedRides).toBe(1);
  });

  it('nimmt gepackte Fahrten an', async () => {
    const c = await tester('gzip@test.de');
    await c.call('PATCH', '/api/me', { testConsent: true });
    const r = ride();
    const res = await c.call('PUT', `/api/rides/${r.id}`, gzipSync(JSON.stringify(r)), { 'Content-Encoding': 'gzip' });
    expect(res.status).toBe(201);
  });

  it('lehnt kaputte, fremde und falsch adressierte Fahrten ab', async () => {
    const a = await tester('a@rides.de');
    const b = await tester('b@rides.de');
    await a.call('PATCH', '/api/me', { testConsent: true });
    await b.call('PATCH', '/api/me', { testConsent: true });
    const r = ride();
    await a.call('PUT', `/api/rides/${r.id}`, r);
    expect((await b.call('PUT', `/api/rides/${r.id}`, r)).status).toBe(409);
    expect((await a.call('PUT', '/api/rides/andere-id', r)).status).toBe(400);
    expect((await a.call('PUT', `/api/rides/${r.id}`, { ...r, raw: 'x' })).status).toBe(400);
    expect((await a.call('PUT', `/api/rides/${r.id}`, r, { Origin: 'https://boese.example' })).status).toBe(403);
  });

  it('löscht hochgeladene Fahrten beim Widerruf', async () => {
    const c = await tester('widerruf@test.de');
    await c.call('PATCH', '/api/me', { testConsent: true });
    const r = ride();
    await c.call('PUT', `/api/rides/${r.id}`, r);
    const no = await c.call('PATCH', '/api/me', { testConsent: false });
    expect(no.data.user).toMatchObject({ testConsent: false, uploadedRides: 0 });
    expect((await c.call('PUT', `/api/rides/${r.id}`, r)).status).toBe(403);
  });
});
