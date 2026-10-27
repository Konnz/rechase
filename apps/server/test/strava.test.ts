import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { client, startServer } from './client.ts';

const stravaFetch = vi.fn<typeof fetch>();
let srv: Awaited<ReturnType<typeof startServer>>;
const now = Date.now();

beforeAll(async () => {
  srv = await startServer({
    strava: { clientId: '123', clientSecret: 'geheim' },
    publicUrl: 'https://rechase.test',
    fetch: stravaFetch,
  });
});
afterAll(() => srv.close());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function connected(email: string, expiresInS = 3600) {
  const c = client(srv.base);
  await c.call('POST', '/api/auth/register', { email, password: 'sehrgeheim' });
  const start = await c.call('GET', '/api/strava/connect');
  expect(start.status).toBe(303);
  const auth = new URL(start.res.headers.get('location')!);
  expect(auth.origin + auth.pathname).toBe('https://www.strava.com/oauth/authorize');
  expect(auth.searchParams.get('scope')).toBe('activity:write');
  expect(auth.searchParams.get('redirect_uri')).toBe('https://rechase.test/api/strava/callback');
  const state = auth.searchParams.get('state')!;

  stravaFetch.mockResolvedValueOnce(
    json({ access_token: 'a1', refresh_token: 'r1', expires_at: Math.floor(now / 1000) + expiresInS, athlete: { id: 42 } }),
  );
  const back = await c.call('GET', `/api/strava/callback?state=${state}&code=xyz&scope=read,activity:write`);
  expect(back.res.headers.get('location')).toBe('/?strava=verbunden');
  return c;
}

const GPX = '<?xml version="1.0"?><gpx><trk></trk></gpx>';

describe('Strava', () => {
  it('meldet in der Konfiguration, ob Strava eingerichtet ist', async () => {
    expect((await client(srv.base).call('GET', '/api/auth/config')).data).toMatchObject({ strava: true });
  });

  it('verbindet das Konto und lädt Fahrten mit Beschreibung hoch', async () => {
    const c = await connected('strava@test.de');
    expect((await c.call('GET', '/api/me')).data.user.strava).toBe(true);

    stravaFetch.mockResolvedValueOnce(json({ id: 987, id_str: '987', status: 'Your activity is still being processed.' }, 201));
    const up = await c.call('POST', '/api/strava/uploads', {
      gpx: GPX,
      externalId: 'fahrt-1',
      name: 'Hausrunde',
      description: 'Re: mich → https://rechase.test/c/AB23CD45',
    });
    expect(up.status).toBe(201);
    expect(up.data.uploadId).toBe('987');
    const [url, init] = stravaFetch.mock.calls.at(-1)!;
    expect(url).toBe('https://www.strava.com/api/v3/uploads');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer a1');
    const form = init!.body as FormData;
    expect(form.get('description')).toContain('/c/AB23CD45');
    expect(form.get('data_type')).toBe('gpx');
    expect(form.get('external_id')).toBe('rechase-fahrt-1');

    stravaFetch.mockResolvedValueOnce(json({ id: 987, status: 'Your activity is ready.', activity_id: 555, error: null }));
    const st = await c.call('GET', '/api/strava/uploads/987');
    expect(st.data).toEqual({ done: true, activityUrl: 'https://www.strava.com/activities/555', error: null });
  });

  it('erneuert abgelaufene Tokens und trennt die Verbindung', async () => {
    // Token schon abgelaufen
    const c = await connected('refresh@test.de', -10);
    stravaFetch
      .mockResolvedValueOnce(json({ access_token: 'a2', refresh_token: 'r2', expires_at: Math.floor(now / 1000) + 3600 }))
      .mockResolvedValueOnce(json({ id: 1, id_str: '1' }, 201));
    await c.call('POST', '/api/strava/uploads', { gpx: GPX, externalId: 'f2' });
    const refresh = stravaFetch.mock.calls.at(-2)!;
    expect(String((refresh[1]!.body as URLSearchParams).get('grant_type'))).toBe('refresh_token');
    expect((stravaFetch.mock.calls.at(-1)![1]!.headers as Record<string, string>).Authorization).toBe('Bearer a2');

    stravaFetch.mockResolvedValueOnce(json({}));
    expect((await c.call('DELETE', '/api/strava', {})).status).toBe(200);
    expect((await c.call('GET', '/api/me')).data.user.strava).toBe(false);
    expect((await c.call('POST', '/api/strava/uploads', { gpx: GPX, externalId: 'f3' })).status).toBe(409);
  });

  it('verlangt das Recht zum Hochladen', async () => {
    const c = client(srv.base);
    await c.call('POST', '/api/auth/register', { email: 'ohne-recht@test.de', password: 'sehrgeheim' });
    const start = await c.call('GET', '/api/strava/connect');
    const state = new URL(start.res.headers.get('location')!).searchParams.get('state');
    const back = await c.call('GET', `/api/strava/callback?state=${state}&code=xyz&scope=read`);
    expect(back.res.headers.get('location')).toBe('/?strava=ohne-recht');
    expect((await c.call('POST', '/api/strava/uploads', { gpx: GPX, externalId: 'f' })).status).toBe(409);
  });
});
