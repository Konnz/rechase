import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, startServer } from './client.ts';

let srv: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  srv = await startServer({ adminEmails: [' Chef@Rechase.de '] });
});
afterAll(() => srv.close());

function ride(id: string) {
  const raw = Array.from({ length: 30 }, (_, i) => ({
    t: Date.now() - 3600_000 + i * 1000,
    lat: 51.1 + i * 0.0001,
    lon: 6.9,
    alt: 50,
    speed: 7,
    accuracy: 5,
  }));
  const samples = raw.map((p, i) => ({ ...p, moving: i > 0, distance: i * 11, movingTime: i * 1000, elapsed: i * 1000 }));
  return {
    id,
    startedAt: raw[0]!.t,
    endedAt: raw.at(-1)!.t,
    raw,
    samples,
    gaps: 4,
    rejected: 0,
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/141.0.0.0 Mobile Safari/537.36',
    device: { model: 'Pixel 10 Pro', platform: 'Android', platformVersion: '16' },
    duel: { opponent: 'Bestzeit', opponentTime: 40_000, time: 29_000 },
  };
}

async function register(email: string, name: string) {
  const c = client(srv.base);
  await c.call('POST', '/api/auth/register', { email, password: 'sehrgeheim' });
  await c.call('PATCH', '/api/me', { name, bike: 'road' });
  return c;
}

describe('Adminbereich', () => {
  it('lässt nur Konten aus ADMIN_EMAILS hinein', async () => {
    expect((await client(srv.base).call('GET', '/api/admin/stats')).status).toBe(401);
    const tester = await register('tester@test.de', 'Tester');
    expect((await tester.call('GET', '/api/admin/stats')).status).toBe(403);
    expect((await tester.call('GET', '/api/me')).data.user.admin).toBe(false);
    const chef = await register('chef@rechase.de', 'Chef');
    expect((await chef.call('GET', '/api/me')).data.user.admin).toBe(true);
    expect((await chef.call('GET', '/api/admin/stats')).status).toBe(200);
  });

  it('zeigt Tester, ihre Fahrten, eine Fahrt mit Punkten und Kennzahlen', async () => {
    const t = await register('fahrer@test.de', 'Fahrer');
    await t.call('PATCH', '/api/me', { testConsent: true });
    await t.call('PUT', '/api/rides/f1', ride('f1'));
    const chef = client(srv.base);
    await chef.call('POST', '/api/auth/login', { email: 'chef@rechase.de', password: 'sehrgeheim' });

    const testers = (await chef.call('GET', '/api/admin/testers')).data.testers;
    expect(testers).toHaveLength(1);
    expect(testers[0]).toMatchObject({ name: 'Fahrer', rides: 1, device: 'Pixel 10 Pro · Android 16 · Chrome 141' });

    const rides = (await chef.call('GET', `/api/admin/rides?user=${testers[0].id}`)).data.rides;
    expect(rides).toMatchObject([{ id: 'f1', userName: 'Fahrer', summary: { gaps: 4 } }]);

    const one = (await chef.call('GET', '/api/admin/rides/f1')).data;
    expect(one.data.raw).toHaveLength(30);
    expect((await chef.call('GET', '/api/admin/rides/fehlt')).status).toBe(404);

    const stats = (await chef.call('GET', '/api/admin/stats')).data.stats;
    expect(stats).toMatchObject({ testers: 1, activeTesters: 1, rides: 1, duels: 1, duelsWon: 1, gapShare: 1 });
    expect(stats.suspicious[0].reasons).toContain('gaps');
    expect(stats.byDevice).toEqual([{ label: 'Pixel 10 Pro', rides: 1 }]);
  });
});
